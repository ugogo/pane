//! Windows suspend/resume notification → light restore.
//!
//! Registers a callback with `PowerRegisterSuspendResumeNotification`. On
//! suspend, it temporarily turns lights off without changing saved user
//! intent. On resume, schedules a delayed `light_state::restore_all()` so any
//! device that power-cycled during sleep (notably USB strips like DX Light)
//! comes back to its last user-selected color/brightness instead of the
//! firmware default (typically white at full brightness).
//!
//! The callback runs on a system thread; we bounce the actual work onto
//! Tauri's tokio runtime via `tauri::async_runtime::spawn`.

use std::ffi::c_void;
use std::ptr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::OnceLock;
use std::time::Duration;

use tauri::{AppHandle, Manager};
use windows::core::Result as WResult;
use windows::Win32::Foundation::HANDLE;
use windows::Win32::System::Power::{
    PowerRegisterSuspendResumeNotification, DEVICE_NOTIFY_SUBSCRIBE_PARAMETERS,
};
use windows::Win32::UI::WindowsAndMessaging::DEVICE_NOTIFY_CALLBACK;

use crate::commands::ambient::{self, AmbientSync};

/// App handle, stashed at registration so the suspend/resume callback (a bare
/// system-thread callback with no context) can reach managed Tauri state.
static APP: OnceLock<AppHandle> = OnceLock::new();

/// Whether the ambient sync loop was running when we suspended, so resume can
/// bring it back exactly when it was on before.
static AMBIENT_WAS_RUNNING: AtomicBool = AtomicBool::new(false);

// PBT_* constants from WinUser.h. We hardcode rather than pull another
// windows-rs feature flag (Win32_System_SystemServices) just for two ints.
const PBT_APMRESUMEAUTOMATIC: u32 = 0x0012; // Wake from sleep / hibernation.
const PBT_APMRESUMESUSPEND: u32 = 0x0007; // Resume after user activity.
const PBT_APMSUSPEND: u32 = 0x0004; // System is about to suspend.

unsafe extern "system" fn on_power_event(
    _context: *const c_void,
    type_: u32,
    _setting: *const c_void,
) -> u32 {
    if type_ == PBT_APMSUSPEND {
        // Stop screen-sync first so its loop can't re-light the strip right
        // after we turn everything off below. Remember whether it was on so
        // resume can restart it. `stop` blocks until the loop has exited (and
        // restored the manual color), so the off writes that follow win.
        if let Some(app) = APP.get() {
            let state = app.state::<AmbientSync>();
            let was_running = state.is_running();
            AMBIENT_WAS_RUNNING.store(was_running, Ordering::SeqCst);
            if was_running {
                ambient::stop(&state);
            }
        }

        // Turn the DX Light strip off synchronously on this thread, before the
        // async sweep below. As the system heads into suspend the tokio runtime
        // may not schedule the spawned task in time, and `stop` above just
        // re-applied the manual color on its way out — so this blocking, COM-free
        // HID write is the authoritative "off" for the strip.
        match crate::commands::dx_light::write_dx_light_off() {
            Ok(()) => eprintln!("[sleep] DX Light off (sync)"),
            Err(e) => eprintln!("[sleep] DX Light sync off failed: {e}"),
        }

        let (tx, rx) = mpsc::channel();
        tauri::async_runtime::spawn(async move {
            let results = crate::commands::light_state::turn_all_off_for_sleep().await;
            for (key, res) in results {
                match res {
                    Ok(()) => eprintln!("[sleep] turned off {key}"),
                    Err(e) => eprintln!("[sleep] failed to turn off {key}: {e}"),
                }
            }
            let _ = tx.send(());
        });

        if rx.recv_timeout(Duration::from_millis(1_800)).is_err() {
            eprintln!("[sleep] timed out waiting for lights to turn off");
        }
    } else if type_ == PBT_APMRESUMEAUTOMATIC || type_ == PBT_APMRESUMESUSPEND {
        tauri::async_runtime::spawn(async {
            // USB devices typically need a couple of seconds to re-enumerate
            // after wake. Logitech HID++ + DX Light are slower than HID
            // keyboards; 3s is empirically enough on this hardware without
            // making the lighting noticeably lag the user's desktop.
            tokio::time::sleep(Duration::from_secs(3)).await;
            let results = crate::commands::light_state::restore_all().await;
            for (key, res) in results {
                if let Err(e) = res {
                    eprintln!("[wake] failed to restore {key}: {e}");
                }
            }
            // Bring screen-sync back if it was on before sleep. restore_all
            // above repainted the manual color; the loop takes over from there.
            if AMBIENT_WAS_RUNNING.swap(false, Ordering::SeqCst) {
                if let Some(app) = APP.get() {
                    if let Err(e) = ambient::restart_from_persisted(&app.state::<AmbientSync>()) {
                        eprintln!("[wake] failed to restart ambient sync: {e}");
                    }
                }
            }
        });
    }
    0 // ERROR_SUCCESS
}

/// Register the callback. Safe to call once during app setup; subsequent
/// calls would just leak more handles without functional effect. The app handle
/// is stashed so the callback can stop/restart ambient sync across sleep.
pub fn register(app: AppHandle) -> WResult<()> {
    let _ = APP.set(app);
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
