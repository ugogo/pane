//! Windows suspend/resume notification → light restore.
//!
//! Registers a callback with `PowerRegisterSuspendResumeNotification`. On
//! resume, schedules a delayed `light_state::restore_all()` so any device
//! that power-cycled during sleep (notably USB strips like DX Light) comes
//! back to its last user-selected color/brightness instead of the firmware
//! default (typically white at full brightness).
//!
//! The callback runs on a system thread; we bounce the actual work onto
//! Tauri's tokio runtime via `tauri::async_runtime::spawn`.

use std::ffi::c_void;
use std::ptr;

use windows::core::Result as WResult;
use windows::Win32::Foundation::HANDLE;
use windows::Win32::System::Power::{
    PowerRegisterSuspendResumeNotification, DEVICE_NOTIFY_SUBSCRIBE_PARAMETERS,
};
use windows::Win32::UI::WindowsAndMessaging::DEVICE_NOTIFY_CALLBACK;

// PBT_* constants from WinUser.h. We hardcode rather than pull another
// windows-rs feature flag (Win32_System_SystemServices) just for two ints.
const PBT_APMRESUMEAUTOMATIC: u32 = 0x0012; // Wake from sleep / hibernation.
const PBT_APMRESUMESUSPEND: u32 = 0x0007; // Resume after user activity.

unsafe extern "system" fn on_power_event(
    _context: *const c_void,
    type_: u32,
    _setting: *const c_void,
) -> u32 {
    if type_ == PBT_APMRESUMEAUTOMATIC || type_ == PBT_APMRESUMESUSPEND {
        tauri::async_runtime::spawn(async {
            // USB devices typically need a couple of seconds to re-enumerate
            // after wake. Logitech HID++ + DX Light are slower than HID
            // keyboards; 3s is empirically enough on this hardware without
            // making the lighting noticeably lag the user's desktop.
            tokio::time::sleep(std::time::Duration::from_secs(3)).await;
            let results = crate::commands::light_state::restore_all().await;
            for (key, res) in results {
                match res {
                    Ok(()) => eprintln!("[wake] restored {key}"),
                    Err(e) => eprintln!("[wake] failed to restore {key}: {e}"),
                }
            }
        });
    }
    0 // ERROR_SUCCESS
}

/// Register the callback. Safe to call once during app setup; subsequent
/// calls would just leak more handles without functional effect.
pub fn register() -> WResult<()> {
    // The params struct + the registration handle must live for the lifetime
    // of the process. We leak them deliberately — there is no clean shutdown
    // path here, and `PowerUnregisterSuspendResumeNotification` would only
    // matter for hot-unload scenarios that don't apply to a desktop app.
    let params = Box::leak(Box::new(DEVICE_NOTIFY_SUBSCRIBE_PARAMETERS {
        Callback: Some(on_power_event),
        Context: ptr::null_mut(),
    }));
    let mut handle: *mut c_void = ptr::null_mut();
    unsafe {
        PowerRegisterSuspendResumeNotification(
            DEVICE_NOTIFY_CALLBACK,
            HANDLE(params as *mut _ as *mut c_void),
            &mut handle,
        )
        .ok()?;
    }
    Box::leak(Box::new(handle));
    Ok(())
}
