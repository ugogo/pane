//! Physical brightness-key intercept via Raw Input.
//!
//! The Keychron Q1 Pro (Mac mode) sends HID **Consumer Control** "Display
//! Brightness Increment/Decrement" usages (usage page `0x0C`, usages `0x6F` /
//! `0x70`). Windows has no built-in handler that maps these to an external
//! monitor's backlight. Tauri's global-shortcut plugin can't observe them
//! either — they aren't standard virtual keys. Only Raw Input can.
//!
//! We register for the Consumer Control collection on a dedicated thread that
//! owns a message-only window (so we receive `WM_INPUT` regardless of focus via
//! `RIDEV_INPUTSINK`), decode the pressed usage, and step every DDC/CI monitor
//! through [`crate::commands::brightness::adjust_all`]. The new values are
//! emitted as a `brightness-changed` event so an open UI slider tracks the key.
//!
//! This catches the key whether the keyboard toggle is in Mac or Windows mode,
//! since both emit the same Consumer brightness usages.

#[cfg(windows)]
pub fn register(app: tauri::AppHandle) {
    imp::register(app);
}

#[cfg(not(windows))]
pub fn register(_app: tauri::AppHandle) {}

#[cfg(windows)]
mod imp {
    use core::ffi::c_void;
    use std::mem::size_of;

    use once_cell::sync::OnceCell;
    use tauri::{AppHandle, Emitter};

    use windows::core::{w, Result as WResult};
    use windows::Win32::Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::UI::Input::{
        GetRawInputData, RegisterRawInputDevices, HRAWINPUT, RAWINPUT, RAWINPUTDEVICE,
        RAWINPUTHEADER, RIDEV_INPUTSINK, RID_INPUT, RIM_TYPEHID,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW, RegisterClassW,
        TranslateMessage, HWND_MESSAGE, MSG, WINDOW_EX_STYLE, WINDOW_STYLE, WM_INPUT, WNDCLASSW,
    };

    /// Consumer (Consumer Control) HID usage page / usage.
    const USAGE_PAGE_CONSUMER: u16 = 0x0C;
    const USAGE_CONSUMER_CONTROL: u16 = 0x01;
    /// Consumer-page usages for display backlight.
    const USAGE_BRIGHTNESS_UP: u16 = 0x006F;
    const USAGE_BRIGHTNESS_DOWN: u16 = 0x0070;

    /// How many VCP units one keypress moves brightness. Most monitors report a
    /// 0..=100 range for VCP 0x10, so this is roughly a 10% step.
    const STEP: i32 = 10;

    static APP: OnceCell<AppHandle> = OnceCell::new();

    pub fn register(app: AppHandle) {
        if APP.set(app).is_err() {
            // Already registered; the listener thread is already running.
            return;
        }
        std::thread::spawn(|| {
            if let Err(e) = run_listener() {
                eprintln!("[brightness-keys] listener failed: {e}");
            }
        });
    }

    fn run_listener() -> WResult<()> {
        unsafe {
            let hinstance: HINSTANCE = GetModuleHandleW(None)?.into();
            let class_name = w!("PaneBrightnessKeysWindow");

            let wc = WNDCLASSW {
                lpfnWndProc: Some(wndproc),
                hInstance: hinstance,
                lpszClassName: class_name,
                ..Default::default()
            };
            // ATOM 0 means failure; CreateWindowExW would then fail too.
            RegisterClassW(&wc);

            let hwnd = CreateWindowExW(
                WINDOW_EX_STYLE(0),
                class_name,
                w!("Pane Brightness Keys"),
                WINDOW_STYLE(0),
                0,
                0,
                0,
                0,
                Some(HWND_MESSAGE),
                None,
                Some(hinstance),
                None,
            )?;

            let rid = RAWINPUTDEVICE {
                usUsagePage: USAGE_PAGE_CONSUMER,
                usUsage: USAGE_CONSUMER_CONTROL,
                // INPUTSINK = receive input even when this window isn't focused.
                dwFlags: RIDEV_INPUTSINK,
                hwndTarget: hwnd,
            };
            RegisterRawInputDevices(&[rid], size_of::<RAWINPUTDEVICE>() as u32)?;

            // Message-only window pump. Runs for the life of the process.
            let mut msg = MSG::default();
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        }
        Ok(())
    }

    unsafe extern "system" fn wndproc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        if msg == WM_INPUT {
            handle_raw_input(lparam);
        }
        // WM_INPUT still needs DefWindowProc to perform cleanup.
        DefWindowProcW(hwnd, msg, wparam, lparam)
    }

    unsafe fn handle_raw_input(lparam: LPARAM) {
        let hrawinput = HRAWINPUT(lparam.0 as *mut c_void);
        let header_size = size_of::<RAWINPUTHEADER>() as u32;

        // First call with a null buffer reports the required size.
        let mut size: u32 = 0;
        let r = GetRawInputData(hrawinput, RID_INPUT, None, &mut size, header_size);
        if r == u32::MAX || size == 0 {
            return;
        }

        let mut buf = vec![0u8; size as usize];
        let r = GetRawInputData(
            hrawinput,
            RID_INPUT,
            Some(buf.as_mut_ptr() as *mut c_void),
            &mut size,
            header_size,
        );
        if r == u32::MAX {
            return;
        }

        let raw = &*(buf.as_ptr() as *const RAWINPUT);
        if raw.header.dwType != RIM_TYPEHID.0 {
            return;
        }

        let hid = &raw.data.hid;
        let total = hid.dwSizeHid as usize * hid.dwCount as usize;
        if total == 0 {
            return;
        }
        let data = std::slice::from_raw_parts(hid.bRawData.as_ptr(), total);

        // The Consumer Control collection reports active usages as 16-bit LE
        // values in the report body. Scan for the brightness usages; a release
        // report carries zeros, so nothing matches and we do nothing.
        let mut delta = 0i32;
        let mut i = 0;
        while i + 1 < data.len() {
            match u16::from_le_bytes([data[i], data[i + 1]]) {
                USAGE_BRIGHTNESS_UP => {
                    delta = STEP;
                    break;
                }
                USAGE_BRIGHTNESS_DOWN => {
                    delta = -STEP;
                    break;
                }
                _ => {}
            }
            i += 1;
        }

        if delta != 0 {
            if let Some(app) = APP.get() {
                let infos = crate::commands::brightness::adjust_all(delta);
                let _ = app.emit("brightness-changed", infos);
            }
        }
    }
}
