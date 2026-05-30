//! Long-press accent popup.
//!
//! Installs a `WH_KEYBOARD_LL` hook. When the user holds an accent-capable key
//! for 500 ms the original keystroke is suppressed and a small floating window
//! appears above the text caret with diacritic variants (à â ä … for 'a', etc.).
//! Picking a variant via click or number key injects it; releasing the key
//! before the timer fires re-injects the original character so quick typing is
//! unaffected.

#[cfg(windows)]
pub use imp::{dismiss, inject_unicode, register, select_accent};

#[cfg(not(windows))]
pub fn register(_app: tauri::AppHandle) {}

#[cfg(not(windows))]
pub fn inject_unicode(_ch: char) {}

#[cfg(not(windows))]
pub fn select_accent() {}

#[cfg(not(windows))]
pub fn dismiss() {}

#[cfg(windows)]
mod imp {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Mutex;
    use std::time::Instant;

    use once_cell::sync::Lazy;
    use once_cell::sync::OnceCell;
    use serde::Serialize;
    use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindowBuilder};

    use windows::Win32::Foundation::{HINSTANCE, LPARAM, LRESULT, POINT, WPARAM};
    use windows::Win32::Graphics::Gdi::ClientToScreen;
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::System::Threading::GetWindowThreadProcessId;
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        GetKeyState, SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP,
        KEYEVENTF_SCANCODE, KEYEVENTF_UNICODE, VIRTUAL_KEY, VK_SHIFT,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, DispatchMessageW, GetCursorPos, GetForegroundWindow, GetGUIThreadInfo,
        GetMessageW, MSG, SetWindowsHookExW, GUITHREADINFO, KBDLLHOOKSTRUCT, WH_KEYBOARD_LL,
        WM_KEYDOWN, WM_KEYUP, WM_SYSKEYDOWN, WM_SYSKEYUP,
    };

    const POPUP_LABEL: &str = "accent-popup";
    const POPUP_W: f64 = 400.0;
    const POPUP_H: f64 = 68.0;
    const HOLD_MS: u64 = 500;
    // Synthetic events injected by this module carry this magic so the hook
    // recognises and ignores them, preventing re-entrant interception.
    const REINJECT_MAGIC: usize = 0x504E_4143; // "PNAC"

    static APP: OnceCell<AppHandle> = OnceCell::new();
    // true while the popup window is visible
    static POPUP_VISIBLE: AtomicBool = AtomicBool::new(false);

    #[derive(Clone)]
    struct PendingKey {
        vk: u32,
        scan: u32,
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

    /// Called by the `accent_select` Tauri command after it hides the popup and
    /// before it injects the chosen character.
    pub fn select_accent() {
        let mut guard = PENDING.lock().unwrap();
        *guard = None;
        drop(guard);
        POPUP_VISIBLE.store(false, Ordering::Relaxed);
        hide_popup();
    }

    /// Called by the `accent_dismiss` Tauri command (Escape / click-away).
    pub fn dismiss() {
        let mut guard = PENDING.lock().unwrap();
        *guard = None;
        drop(guard);
        POPUP_VISIBLE.store(false, Ordering::Relaxed);
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

    fn reinject_vk(vk: u32, scan: u32) {
        let inputs = [
            INPUT {
                r#type: INPUT_KEYBOARD,
                Anonymous: INPUT_0 {
                    ki: KEYBDINPUT {
                        wVk: VIRTUAL_KEY(vk as u16),
                        wScan: scan as u16,
                        dwFlags: KEYEVENTF_SCANCODE,
                        time: 0,
                        dwExtraInfo: REINJECT_MAGIC,
                    },
                },
            },
            INPUT {
                r#type: INPUT_KEYBOARD,
                Anonymous: INPUT_0 {
                    ki: KEYBDINPUT {
                        wVk: VIRTUAL_KEY(vk as u16),
                        wScan: scan as u16,
                        dwFlags: KEYEVENTF_SCANCODE | KEYEVENTF_KEYUP,
                        time: 0,
                        dwExtraInfo: REINJECT_MAGIC,
                    },
                },
            },
        ];
        unsafe {
            SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
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
        let main = app.get_webview_window("main")?;
        let mut url = main.url().ok()?;
        url.set_query(Some("view=accent-popup"));
        Some(WebviewUrl::External(url))
    }

    fn warmup_popup(app: &AppHandle) {
        if app.get_webview_window(POPUP_LABEL).is_some() {
            return;
        }
        let Some(url) = popup_url(app) else { return };
        if let Err(e) = WebviewWindowBuilder::new(app, POPUP_LABEL, url)
            .title("Accent Popup")
            .inner_size(POPUP_W, POPUP_H)
            .position(0.0, -1000.0)
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            .focused(false)
            .visible(false)
            .build()
        {
            eprintln!("[accent-popup] warmup failed: {e}");
        }
    }

    fn show_popup(app: &AppHandle, accents: Vec<String>, caret_x: i32, caret_y: i32) {
        // Abort if the pending key was released before we got here.
        {
            let guard = PENDING.lock().unwrap();
            if guard.as_ref().map_or(true, |p| !p.popup_shown) {
                return;
            }
        }

        let scale = app
            .get_webview_window("main")
            .and_then(|w| w.primary_monitor().ok().flatten())
            .map(|m| m.scale_factor())
            .unwrap_or(1.0);

        // Centre the popup above the caret (logical pixels).
        let logical_caret_x = caret_x as f64 / scale;
        let logical_caret_y = caret_y as f64 / scale;
        let pos_x = logical_caret_x - POPUP_W / 2.0;
        let pos_y = (logical_caret_y - POPUP_H - 12.0).max(0.0);

        let window = match app.get_webview_window(POPUP_LABEL) {
            Some(w) => w,
            None => {
                let Some(url) = popup_url(app) else { return };
                match WebviewWindowBuilder::new(app, POPUP_LABEL, url)
                    .title("Accent Popup")
                    .inner_size(POPUP_W, POPUP_H)
                    .position(pos_x, pos_y)
                    .decorations(false)
                    .transparent(true)
                    .always_on_top(true)
                    .skip_taskbar(true)
                    .resizable(false)
                    .focused(true)
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

        let _ = window.set_size(LogicalSize::new(POPUP_W, POPUP_H));
        let _ = window.set_position(LogicalPosition::new(pos_x, pos_y));

        POPUP_VISIBLE.store(true, Ordering::Relaxed);
        let _ = app.emit_to(POPUP_LABEL, "show-accent-popup", AccentPayload { accents });
        let _ = window.show();
        let _ = window.set_focus();
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

    // ── Hook callback ─────────────────────────────────────────────────────────

    unsafe extern "system" fn hook_callback(
        code: i32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        if code < 0 {
            return CallNextHookEx(None, code, wparam, lparam);
        }

        let info = &*(lparam.0 as *const KBDLLHOOKSTRUCT);

        // Pass synthetic events from this module straight through.
        if info.dwExtraInfo == REINJECT_MAGIC {
            return CallNextHookEx(None, code, wparam, lparam);
        }

        // Don't intercept while the popup itself is focused (let JS handle keys).
        if POPUP_VISIBLE.load(Ordering::Relaxed) {
            return CallNextHookEx(None, code, wparam, lparam);
        }

        let msg = wparam.0 as u32;
        let vk = info.vkCode;

        match msg {
            WM_KEYDOWN | WM_SYSKEYDOWN => {
                let shift = GetKeyState(VK_SHIFT.0 as i32) < 0;
                if accents_for(vk, shift).is_some() {
                    let mut guard = PENDING.lock().unwrap();
                    // New press: start timing and block.
                    if guard.is_none() {
                        *guard = Some(PendingKey {
                            vk,
                            scan: info.scanCode,
                            shift,
                            since: Instant::now(),
                            popup_shown: false,
                        });
                        return LRESULT(1);
                    }
                    // Key-repeat for the same pending key: keep blocking.
                    if guard.as_ref().map_or(false, |p| p.vk == vk) {
                        return LRESULT(1);
                    }
                }
            }
            WM_KEYUP | WM_SYSKEYUP => {
                let mut guard = PENDING.lock().unwrap();
                if guard.as_ref().map_or(false, |p| p.vk == vk) {
                    let pk = guard.take().unwrap();
                    drop(guard);
                    if !pk.popup_shown {
                        // Quick tap: restore the original keystroke.
                        reinject_vk(pk.vk, pk.scan);
                    }
                    // If popup was shown, JS will call accent_dismiss or
                    // accent_select; either hides the popup without re-injecting.
                    return LRESULT(1);
                }
            }
            _ => {}
        }

        CallNextHookEx(None, code, wparam, lparam)
    }
}
