//! Long-press accent popup.
//!
//! Installs a `WH_KEYBOARD_LL` hook. When the user holds an accent-capable key
//! for 500 ms the original keystroke is suppressed and a small floating window
//! appears above the text caret with diacritic variants (à â ä … for 'a', etc.).
//! Picking a variant via click or number key injects it; releasing the key
//! before the timer fires re-injects the original character so quick typing is
//! unaffected.

#[cfg(windows)]
pub use imp::{commit_char, dismiss, is_enabled, register, set_enabled};

#[cfg(not(windows))]
pub fn register(_app: tauri::AppHandle) {}

#[cfg(not(windows))]
pub fn commit_char(_ch: char) {}

#[cfg(not(windows))]
pub fn dismiss() {}

#[cfg(not(windows))]
pub fn is_enabled() -> bool {
    false
}

#[cfg(not(windows))]
pub fn set_enabled(_app: &tauri::AppHandle, _enabled: bool) {}

#[cfg(windows)]
mod imp {
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicBool, AtomicU32, AtomicUsize, Ordering};
    use std::sync::Mutex;
    use std::time::Instant;

    use once_cell::sync::Lazy;
    use once_cell::sync::OnceCell;
    use serde::{Deserialize, Serialize};
    use tauri::{
        webview::Color, AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewUrl,
        WebviewWindowBuilder,
    };

    use windows::Win32::Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, POINT, WPARAM};
    use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_TRANSITIONS_FORCEDISABLED};
    use windows::Win32::Graphics::Gdi::ClientToScreen;
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        GetAsyncKeyState, GetKeyState, SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT,
        KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP, KEYEVENTF_UNICODE, VIRTUAL_KEY, VK_BACK, VK_ESCAPE,
        VK_LEFT, VK_RETURN, VK_RIGHT, VK_SHIFT,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, DispatchMessageW, GetClassNameW, GetCursorPos, GetForegroundWindow,
        GetGUIThreadInfo, GetMessageW, GetWindowLongPtrW, GetWindowThreadProcessId,
        SetWindowLongPtrW, SetWindowsHookExW, GUITHREADINFO, GWL_EXSTYLE, KBDLLHOOKSTRUCT, MSG,
        WH_KEYBOARD_LL, WM_KEYDOWN, WM_KEYUP, WM_SYSKEYDOWN, WM_SYSKEYUP, WS_EX_NOACTIVATE,
    };
    use windows_core::BOOL;

    const POPUP_LABEL: &str = "accent-popup";
    // The window is sized to the variant count: each cell is BTN_W wide and the
    // pill content fills the whole window (see the AccentPopup view).
    const BTN_W: f64 = 44.0;
    const POPUP_PAD: f64 = 12.0;
    const POPUP_H: f64 = 52.0;
    const HOLD_MS: u64 = 500;

    fn popup_width(count: usize) -> f64 {
        (count.max(1) as f64) * BTN_W + POPUP_PAD
    }
    // Synthetic events injected by this module carry this magic so the hook
    // recognises and ignores them, preventing re-entrant interception.
    const REINJECT_MAGIC: usize = 0x504E_4143; // "PNAC"

    static APP: OnceCell<AppHandle> = OnceCell::new();
    // true while the popup window is visible
    static POPUP_VISIBLE: AtomicBool = AtomicBool::new(false);
    // Master on/off switch, persisted to disk and toggled from the main UI.
    static ENABLED: AtomicBool = AtomicBool::new(true);
    // After a selection/dismissal, the originating letter key is often still
    // physically held. We swallow its auto-repeat (and final key-up) so it can't
    // restart the long-press timer and re-open the popup. 0 = nothing suppressed.
    static SUPPRESS_VK: AtomicU32 = AtomicU32::new(0);
    // Accent variants currently shown in the popup, in display order. The
    // keyboard hook maps number keys 1-9 onto this list to pick a variant.
    static CURRENT_ACCENTS: Lazy<Mutex<Vec<String>>> = Lazy::new(|| Mutex::new(Vec::new()));
    // Index highlighted for keyboard navigation (arrow keys + Enter).
    static SELECTED_INDEX: AtomicUsize = AtomicUsize::new(0);

    #[derive(Clone)]
    struct PendingKey {
        vk: u32,
        shift: bool,
        since: Instant,
        popup_shown: bool,
    }

    static PENDING: Lazy<Mutex<Option<PendingKey>>> = Lazy::new(|| Mutex::new(None));

    // ── Accent map ────────────────────────────────────────────────────────────

    fn accents_for(vk: u32, shift: bool) -> Option<&'static [&'static str]> {
        match (vk, shift) {
            (0x41, false) => Some(&["à", "â", "ä", "æ", "ã", "å", "ā"]),
            (0x41, true) => Some(&["À", "Â", "Ä", "Æ", "Ã", "Å", "Ā"]),
            (0x43, false) => Some(&["ç", "ć", "č"]),
            (0x43, true) => Some(&["Ç", "Ć", "Č"]),
            (0x45, false) => Some(&["é", "è", "ê", "ë", "ě", "ē", "ė"]),
            (0x45, true) => Some(&["É", "È", "Ê", "Ë", "Ě", "Ē", "Ė"]),
            (0x49, false) => Some(&["î", "ï", "í", "ì", "ī"]),
            (0x49, true) => Some(&["Î", "Ï", "Í", "Ì", "Ī"]),
            (0x4E, false) => Some(&["ñ", "ń"]),
            (0x4E, true) => Some(&["Ñ", "Ń"]),
            (0x4F, false) => Some(&["ô", "ö", "ò", "ó", "œ", "ø", "õ", "ō"]),
            (0x4F, true) => Some(&["Ô", "Ö", "Ò", "Ó", "Œ", "Ø", "Õ", "Ō"]),
            (0x55, false) => Some(&["ù", "û", "ü", "ú", "ū"]),
            (0x55, true) => Some(&["Ù", "Û", "Ü", "Ú", "Ū"]),
            (0x59, false) => Some(&["ÿ", "ý"]),
            (0x59, true) => Some(&["Ÿ", "Ý"]),
            (0x53, false) => Some(&["ß", "š", "ś"]),
            (0x53, true) => Some(&["ẞ", "Š", "Ś"]),
            (0x5A, false) => Some(&["ž", "ź", "ż"]),
            (0x5A, true) => Some(&["Ž", "Ź", "Ż"]),
            _ => None,
        }
    }

    // ── Public API ────────────────────────────────────────────────────────────

    pub fn register(app: AppHandle) {
        if APP.set(app.clone()).is_err() {
            return;
        }
        ENABLED.store(load_enabled(&app), Ordering::Relaxed);
        std::thread::spawn(|| {
            if let Err(e) = install_hook() {
                eprintln!("[accent-popup] keyboard hook failed: {e}");
            }
        });
        std::thread::spawn(timer_loop);
        // Pre-create the popup window so it's loaded before the first long-press.
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_secs(3)).await;
            warmup_popup(&app);
        });
    }

    pub fn is_enabled() -> bool {
        ENABLED.load(Ordering::Relaxed)
    }

    /// Toggles the feature and persists the choice. Disabling also tears down any
    /// popup that happens to be open so the change takes effect immediately.
    pub fn set_enabled(app: &AppHandle, enabled: bool) {
        ENABLED.store(enabled, Ordering::Relaxed);
        save_enabled(app, enabled);
        if !enabled {
            dismiss();
        }
    }

    // ── Settings persistence ──────────────────────────────────────────────────

    #[derive(Serialize, Deserialize)]
    struct Settings {
        enabled: bool,
    }

    impl Default for Settings {
        fn default() -> Self {
            Self { enabled: true }
        }
    }

    fn settings_path(app: &AppHandle) -> Option<PathBuf> {
        let dir = app.path().app_config_dir().ok()?;
        let _ = std::fs::create_dir_all(&dir);
        Some(dir.join("accent-popup.json"))
    }

    fn load_enabled(app: &AppHandle) -> bool {
        settings_path(app)
            .and_then(|p| std::fs::read_to_string(p).ok())
            .and_then(|t| serde_json::from_str::<Settings>(&t).ok())
            .map(|s| s.enabled)
            .unwrap_or(true)
    }

    fn save_enabled(app: &AppHandle, enabled: bool) {
        let Some(path) = settings_path(app) else {
            return;
        };
        if let Ok(text) = serde_json::to_string_pretty(&Settings { enabled }) {
            let _ = std::fs::write(path, text);
        }
    }

    /// Commits the variant the user picked: tears down the popup, deletes the
    /// base letter that was typed when the key was first pressed, then injects
    /// the accented character in its place. Used by the click handler (via the
    /// `accent_select` command) and by the keyboard hook.
    pub fn commit_char(ch: char) {
        close_popup();
        send_backspace();
        inject_unicode(ch);
    }

    /// Commits the variant at `index` in the currently shown list.
    fn commit_index(index: usize) {
        let chosen = CURRENT_ACCENTS.lock().unwrap().get(index).cloned();
        if let Some(s) = chosen {
            if let Some(c) = s.chars().next() {
                commit_char(c);
            }
        }
    }

    /// Moves the keyboard-navigation highlight by `delta` and tells the webview
    /// to redraw it.
    fn move_selection(delta: i32) {
        let len = CURRENT_ACCENTS.lock().unwrap().len();
        if len == 0 {
            return;
        }
        let cur = SELECTED_INDEX.load(Ordering::Relaxed) as i32;
        let next = (cur + delta).clamp(0, len as i32 - 1) as usize;
        SELECTED_INDEX.store(next, Ordering::Relaxed);
        // Push the highlight straight into the webview. The popup is never
        // focused, so the Tauri event bus throttles delivery (which is why the
        // variants themselves travel in the URL); `eval` runs immediately.
        if let Some(app) = APP.get() {
            if let Some(w) = app.get_webview_window(POPUP_LABEL) {
                let _ = w.eval(format!("window.__accentSel&&window.__accentSel({next})"));
            }
        }
    }

    /// Called by the `accent_dismiss` Tauri command (click-away).
    pub fn dismiss() {
        close_popup();
    }

    /// Shared teardown: clears pending state, hides the popup, and — only if the
    /// originating letter key is still physically held — arms suppression so its
    /// auto-repeat can't retype the letter or reopen the popup.
    fn close_popup() {
        let held_vk = {
            let mut guard = PENDING.lock().unwrap();
            let vk = guard.as_ref().map(|p| p.vk);
            *guard = None;
            vk
        };
        if let Some(vk) = held_vk {
            let still_down = unsafe { (GetAsyncKeyState(vk as i32) as u16 & 0x8000) != 0 };
            if still_down {
                SUPPRESS_VK.store(vk, Ordering::Relaxed);
            }
        }

        POPUP_VISIBLE.store(false, Ordering::Relaxed);
        CURRENT_ACCENTS.lock().unwrap().clear();
        hide_popup();
    }

    /// Injects a unicode character into whichever window currently has focus.
    pub fn inject_unicode(ch: char) {
        let code = ch as u32;
        if code > 0xFFFF {
            // Supplementary plane: emit a surrogate pair.
            let c = code - 0x10000;
            let high = (0xD800 + (c >> 10)) as u16;
            let low = (0xDC00 + (c & 0x3FF)) as u16;
            do_send_unicode_pair(high, low);
        } else {
            do_send_unicode(code as u16);
        }
    }

    // ── Injection helpers ─────────────────────────────────────────────────────

    fn do_send_unicode(code: u16) {
        let inputs = [unicode_input(code, false), unicode_input(code, true)];
        unsafe {
            SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
        }
    }

    fn do_send_unicode_pair(high: u16, low: u16) {
        let inputs = [
            unicode_input(high, false),
            unicode_input(high, true),
            unicode_input(low, false),
            unicode_input(low, true),
        ];
        unsafe {
            SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
        }
    }

    fn unicode_input(wchar: u16, keyup: bool) -> INPUT {
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: VIRTUAL_KEY(0),
                    wScan: wchar,
                    dwFlags: if keyup {
                        KEYEVENTF_UNICODE | KEYEVENTF_KEYUP
                    } else {
                        KEYEVENTF_UNICODE
                    },
                    time: 0,
                    dwExtraInfo: REINJECT_MAGIC,
                },
            },
        }
    }

    /// Sends a single Backspace to delete the base letter that was typed when
    /// the accent key was first pressed, so the chosen variant replaces it.
    fn send_backspace() {
        let inputs = [vk_input(VK_BACK.0, false), vk_input(VK_BACK.0, true)];
        unsafe {
            SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
        }
    }

    fn vk_input(vk: u16, keyup: bool) -> INPUT {
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: VIRTUAL_KEY(vk),
                    wScan: 0,
                    dwFlags: if keyup {
                        KEYEVENTF_KEYUP
                    } else {
                        KEYBD_EVENT_FLAGS(0)
                    },
                    time: 0,
                    dwExtraInfo: REINJECT_MAGIC,
                },
            },
        }
    }

    // ── Hook installation ─────────────────────────────────────────────────────

    fn install_hook() -> windows::core::Result<()> {
        unsafe {
            let hinstance: HINSTANCE = GetModuleHandleW(None)?.into();
            SetWindowsHookExW(WH_KEYBOARD_LL, Some(hook_callback), Some(hinstance), 0)?;
            // Message pump keeps the hook thread alive.
            let mut msg = MSG::default();
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                DispatchMessageW(&msg);
            }
        }
        Ok(())
    }

    // ── Timer thread ──────────────────────────────────────────────────────────

    fn timer_loop() {
        loop {
            std::thread::sleep(std::time::Duration::from_millis(30));

            // Snapshot state under the lock.
            let snapshot = {
                let guard = PENDING.lock().unwrap();
                guard.clone()
            };
            let Some(pk) = snapshot else { continue };
            if pk.popup_shown {
                continue;
            }
            if pk.since.elapsed().as_millis() < HOLD_MS as u128 {
                continue;
            }

            // Mark as shown before releasing lock so the hook won't reinject.
            {
                let mut guard = PENDING.lock().unwrap();
                match guard.as_mut() {
                    Some(p) if p.vk == pk.vk && !p.popup_shown => p.popup_shown = true,
                    _ => continue,
                }
            }

            let accents: Vec<String> = accents_for(pk.vk, pk.shift)
                .unwrap_or(&[])
                .iter()
                .map(|s| s.to_string())
                .collect();
            let caret = get_caret_screen_pos();

            if let Some(app) = APP.get() {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    show_popup(&app, accents, caret.x, caret.y);
                });
            }
        }
    }

    // ── Popup window ──────────────────────────────────────────────────────────

    fn popup_url(app: &AppHandle) -> Option<WebviewUrl> {
        popup_target_url(app, &[]).map(WebviewUrl::External)
    }

    fn popup_target_url(app: &AppHandle, accents: &[String]) -> Option<tauri::Url> {
        let chars_param = accents.join(",");
        let query: Vec<(&str, &str)> = if chars_param.is_empty() {
            vec![]
        } else {
            vec![("chars", chars_param.as_str())]
        };
        crate::child_webview_url::route_url_with_query(
            app,
            crate::child_webview_url::routes::ACCENT_POPUP,
            &query,
        )
        .ok()
    }

    fn warmup_popup(app: &AppHandle) {
        if app.get_webview_window(POPUP_LABEL).is_some() {
            return;
        }
        let Some(url) = popup_url(app) else { return };
        match WebviewWindowBuilder::new(app, POPUP_LABEL, url)
            .title("Accent Popup")
            .inner_size(popup_width(7), POPUP_H)
            .position(0.0, -1000.0)
            .decorations(false)
            .transparent(true)
            .background_color(Color(0, 0, 0, 0))
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            .focused(false)
            .visible(false)
            .build()
        {
            Ok(w) => {
                set_no_activate(&w);
                disable_window_transitions(&w);
            }
            Err(e) => eprintln!("[accent-popup] warmup failed: {e}"),
        }
    }

    fn show_popup(app: &AppHandle, accents: Vec<String>, caret_x: i32, caret_y: i32) {
        // Abort if the pending key was released before we got here.
        {
            let guard = PENDING.lock().unwrap();
            if guard.as_ref().is_none_or(|p| !p.popup_shown) {
                return;
            }
        }

        let monitor = app
            .get_webview_window("main")
            .and_then(|w| w.primary_monitor().ok().flatten());
        let scale = monitor.as_ref().map(|m| m.scale_factor()).unwrap_or(1.0);
        let monitor_w = monitor
            .as_ref()
            .map(|m| m.size().width as f64 / scale)
            .unwrap_or(f64::INFINITY);

        // Size the window to the number of variants so the pill fills it edge
        // to edge with no transparent dead space.
        let popup_w = popup_width(accents.len());

        // Centre the popup above the caret (logical pixels), kept on-screen.
        let logical_caret_x = caret_x as f64 / scale;
        let logical_caret_y = caret_y as f64 / scale;
        let pos_x = (logical_caret_x - popup_w / 2.0)
            .max(0.0)
            .min((monitor_w - popup_w).max(0.0));
        let pos_y = (logical_caret_y - POPUP_H - 12.0).max(0.0);

        let Some(target) = popup_target_url(app, &accents) else {
            return;
        };

        let window = match app.get_webview_window(POPUP_LABEL) {
            Some(w) => w,
            None => {
                match WebviewWindowBuilder::new(
                    app,
                    POPUP_LABEL,
                    WebviewUrl::External(target.clone()),
                )
                .title("Accent Popup")
                .inner_size(popup_w, POPUP_H)
                .position(pos_x, pos_y)
                .decorations(false)
                .transparent(true)
                .background_color(Color(0, 0, 0, 0))
                .always_on_top(true)
                .skip_taskbar(true)
                .resizable(false)
                .focused(false)
                .visible(false)
                .build()
                {
                    Ok(w) => w,
                    Err(e) => {
                        eprintln!("[accent-popup] create window failed: {e}");
                        return;
                    }
                }
            }
        };

        let _ = window.set_size(LogicalSize::new(popup_w, POPUP_H));
        let _ = window.set_position(LogicalPosition::new(pos_x, pos_y));

        // The popup must never steal foreground focus: the user stays "typing"
        // in their original app, so the chosen character injects straight into
        // it and the global hook keeps receiving the number-key selection.
        set_no_activate(&window);
        disable_window_transitions(&window);

        // Publish the variants so the keyboard hook can resolve a number key to
        // a character without round-tripping through the webview. Start the
        // keyboard-navigation highlight on the first variant.
        *CURRENT_ACCENTS.lock().unwrap() = accents.clone();
        SELECTED_INDEX.store(0, Ordering::Relaxed);

        POPUP_VISIBLE.store(true, Ordering::Relaxed);
        // Show without activating (WebView2 still renders visible, non-focused
        // windows fine). Selection and dismissal are driven by the hook, not by
        // webview key events, so the popup never needs keyboard focus.
        let _ = window.show();
        let _ = app.emit_to(POPUP_LABEL, "show-accent-popup", AccentPayload { accents });
    }

    /// Adds `WS_EX_NOACTIVATE` to the popup so showing it does not pull
    /// foreground focus away from the app the user is typing in. The HWND is
    /// taken from Tauri (whose `windows` crate version may differ from ours), so
    /// we round-trip through the raw pointer value to stay version-agnostic.
    fn set_no_activate(window: &tauri::WebviewWindow) {
        let Ok(h) = window.hwnd() else { return };
        let hwnd = HWND(h.0 as *mut _);
        unsafe {
            let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex | WS_EX_NOACTIVATE.0 as isize);
        }
    }

    fn disable_window_transitions(window: &tauri::WebviewWindow) {
        let Ok(h) = window.hwnd() else { return };
        let hwnd = HWND(h.0 as *mut _);
        let disabled = BOOL(1);
        unsafe {
            let _ = DwmSetWindowAttribute(
                hwnd,
                DWMWA_TRANSITIONS_FORCEDISABLED,
                &disabled as *const _ as *const _,
                std::mem::size_of::<BOOL>() as u32,
            );
        }
    }

    fn hide_popup() {
        if let Some(app) = APP.get() {
            if let Some(w) = app.get_webview_window(POPUP_LABEL) {
                let _ = w.hide();
            }
        }
    }

    #[derive(Serialize, Clone)]
    struct AccentPayload {
        accents: Vec<String>,
    }

    // ── Caret position ────────────────────────────────────────────────────────

    fn get_caret_screen_pos() -> POINT {
        unsafe {
            let hwnd = GetForegroundWindow();
            if !hwnd.is_invalid() {
                let thread_id = GetWindowThreadProcessId(hwnd, None);
                let mut gti = GUITHREADINFO {
                    cbSize: std::mem::size_of::<GUITHREADINFO>() as u32,
                    ..Default::default()
                };
                if GetGUIThreadInfo(thread_id, &mut gti).is_ok() && !gti.hwndCaret.is_invalid() {
                    let mut pt = POINT {
                        x: gti.rcCaret.left,
                        y: gti.rcCaret.top,
                    };
                    let _ = ClientToScreen(gti.hwndCaret, &mut pt);
                    return pt;
                }
            }
            let mut cursor = POINT::default();
            let _ = GetCursorPos(&mut cursor);
            cursor
        }
    }

    // ── Text-field detection ──────────────────────────────────────────────────

    // Window classes whose focus reliably means "the user can type text", even
    // though they expose no classic Win32 caret. Chromium/Electron (Claude, VS
    // Code, Discord, browsers) and console/terminal hosts (PowerShell, cmd,
    // Windows Terminal) all fall here.
    const TEXT_WINDOW_CLASSES: &[&str] = &[
        "Chrome_RenderWidgetHostHWND",   // Chromium/Electron content surface
        "Chrome_WidgetWin_1",            // Chromium/Electron top-level window
        "ConsoleWindowClass",            // classic conhost (PowerShell, cmd)
        "CASCADIA_HOSTING_WINDOW_CLASS", // Windows Terminal
        "Windows.UI.Core.CoreWindow",    // UWP apps
    ];

    fn class_name_of(hwnd: windows::Win32::Foundation::HWND) -> String {
        let mut buf = [0u16; 256];
        let len = unsafe { GetClassNameW(hwnd, &mut buf) };
        if len <= 0 {
            return String::new();
        }
        String::from_utf16_lossy(&buf[..len as usize])
    }

    fn class_is_text_capable(hwnd: windows::Win32::Foundation::HWND) -> bool {
        if hwnd.is_invalid() {
            return false;
        }
        let class = class_name_of(hwnd);
        TEXT_WINDOW_CLASSES.iter().any(|c| *c == class)
    }

    // Gates the long-press feature to typing contexts. A live Win32 caret is the
    // strongest signal (native edit controls); failing that we fall back to the
    // focused/foreground window class so apps that render their own caret
    // (Electron, terminals) still qualify. Games generally satisfy neither.
    fn is_text_context() -> bool {
        unsafe {
            let hwnd = GetForegroundWindow();
            if hwnd.is_invalid() {
                return false;
            }
            let thread_id = GetWindowThreadProcessId(hwnd, None);
            let mut gti = GUITHREADINFO {
                cbSize: std::mem::size_of::<GUITHREADINFO>() as u32,
                ..Default::default()
            };
            if GetGUIThreadInfo(thread_id, &mut gti).is_ok() {
                if !gti.hwndCaret.is_invalid() {
                    return true;
                }
                if class_is_text_capable(gti.hwndFocus) {
                    return true;
                }
            }
            class_is_text_capable(hwnd)
        }
    }

    // ── Hook callback ─────────────────────────────────────────────────────────

    unsafe extern "system" fn hook_callback(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        if code < 0 {
            return CallNextHookEx(None, code, wparam, lparam);
        }

        // Feature disabled: behave as if the hook weren't installed.
        if !ENABLED.load(Ordering::Relaxed) {
            return CallNextHookEx(None, code, wparam, lparam);
        }

        let info = &*(lparam.0 as *const KBDLLHOOKSTRUCT);

        // Pass synthetic events from this module straight through.
        if info.dwExtraInfo == REINJECT_MAGIC {
            return CallNextHookEx(None, code, wparam, lparam);
        }

        let msg = wparam.0 as u32;
        let vk = info.vkCode;

        // 1. After a selection, swallow the still-held trigger letter's auto-
        //    repeat so it can't retype the letter or reopen the popup. Pass its
        //    final key-up through to balance the key-down we delivered earlier.
        let suppressed = SUPPRESS_VK.load(Ordering::Relaxed);
        if suppressed != 0 && vk == suppressed {
            if matches!(msg, WM_KEYUP | WM_SYSKEYUP) {
                SUPPRESS_VK.store(0, Ordering::Relaxed);
                return CallNextHookEx(None, code, wparam, lparam);
            }
            return LRESULT(1);
        }

        // 2. While the popup is up we own the keyboard: arrows move the
        //    highlight, Enter / a number key picks a variant, Escape dismisses,
        //    and anything else closes the popup and falls through.
        if POPUP_VISIBLE.load(Ordering::Relaxed) {
            let trigger_vk = PENDING.lock().unwrap().as_ref().map(|p| p.vk);
            if trigger_vk == Some(vk) {
                // The originating letter is still held: block its auto-repeat,
                // but pass its key-up so the app's key state stays balanced. The
                // popup stays open regardless (it's driven by POPUP_VISIBLE).
                if matches!(msg, WM_KEYUP | WM_SYSKEYUP) {
                    return CallNextHookEx(None, code, wparam, lparam);
                }
                return LRESULT(1);
            }
            if matches!(msg, WM_KEYDOWN | WM_SYSKEYDOWN) {
                if vk == VK_ESCAPE.0 as u32 {
                    close_popup();
                    return LRESULT(1);
                }
                if vk == VK_RETURN.0 as u32 {
                    commit_index(SELECTED_INDEX.load(Ordering::Relaxed));
                    return LRESULT(1);
                }
                if vk == VK_LEFT.0 as u32 {
                    move_selection(-1);
                    return LRESULT(1);
                }
                if vk == VK_RIGHT.0 as u32 {
                    move_selection(1);
                    return LRESULT(1);
                }
                if (0x31..=0x39).contains(&vk) {
                    commit_index((vk - 0x31) as usize);
                    return LRESULT(1);
                }
                // Any other key dismisses, then is allowed through so the
                // keystroke itself isn't lost.
                close_popup();
                return CallNextHookEx(None, code, wparam, lparam);
            }
            // Stray key-up while the popup is open: swallow it.
            return LRESULT(1);
        }

        // 3. Idle: track an accent-capable key. The first press is delivered so
        //    the base letter types immediately (and stays in order with fast
        //    subsequent keys); only auto-repeat is blocked. Holding past the
        //    timer opens the popup, which then replaces that base letter.
        match msg {
            WM_KEYDOWN | WM_SYSKEYDOWN => {
                let shift = GetKeyState(VK_SHIFT.0 as i32) < 0;
                if accents_for(vk, shift).is_some() && is_text_context() {
                    let mut guard = PENDING.lock().unwrap();
                    if guard.as_ref().is_some_and(|p| p.vk == vk) {
                        // Auto-repeat of the tracked key: block it.
                        return LRESULT(1);
                    }
                    *guard = Some(PendingKey {
                        vk,
                        shift,
                        since: Instant::now(),
                        popup_shown: false,
                    });
                    // Fall through: deliver this first press so it types now.
                }
            }
            WM_KEYUP | WM_SYSKEYUP => {
                let mut guard = PENDING.lock().unwrap();
                if guard.as_ref().is_some_and(|p| p.vk == vk) {
                    // Released before the popup fired; the base letter already
                    // typed, so stop tracking and let the key-up through.
                    *guard = None;
                }
            }
            _ => {}
        }

        CallNextHookEx(None, code, wparam, lparam)
    }
}
