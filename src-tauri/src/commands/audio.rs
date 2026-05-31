//! System audio controls: master volume + mute for the default output and
//! input endpoints, and switching the Windows default output/input device.
//!
//! Volume and mute use the documented Core Audio `IAudioEndpointVolume`
//! interface. Switching the *default* device, however, has no public API —
//! Windows only exposes it through the undocumented `IPolicyConfig` COM
//! interface (the same one nircmd, SoundSwitch and EarTrumpet rely on). We
//! declare that interface by hand below; the only fragile part is matching the
//! vtable slot order, so `SetDefaultEndpoint` lands at the right offset.
//!
//! COM is initialised per call (multithreaded apartment) because Tauri runs
//! commands on a thread pool — we can't assume a prior init on the calling
//! thread. Commands are otherwise stateless, mirroring the rest of the app.

use serde::Serialize;

#[cfg(not(windows))]
const NOT_WINDOWS: &str = "audio control is only implemented on Windows";

/// An audio endpoint (render or capture) as shown in the device dropdowns.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDevice {
    /// MMDevice endpoint ID — opaque, stable, used to set the default.
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

/// Current master volume (scalar 0.0–1.0) and mute state of an endpoint.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VolumeInfo {
    pub volume: f64,
    pub muted: bool,
}

// ── Windows Core Audio implementation ────────────────────────────────────────

#[cfg(windows)]
mod imp {
    // The hand-declared IPolicyConfig mirrors a COM vtable, so its methods keep
    // their PascalCase names, and the padding methods are intentionally unused.
    #![allow(non_snake_case, dead_code)]

    use super::{AudioDevice, VolumeInfo};
    use core::ffi::c_void;
    use windows::core::{
        interface, IUnknown, IUnknown_Vtbl, GUID, HRESULT, HSTRING, PCWSTR, PWSTR,
    };
    use windows::Win32::Devices::FunctionDiscovery::PKEY_Device_FriendlyName;
    use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
    use windows::Win32::Media::Audio::{
        eCapture, eCommunications, eConsole, eMultimedia, eRender, EDataFlow, ERole,
        IMMDeviceEnumerator, MMDeviceEnumerator, DEVICE_STATE_ACTIVE,
    };
    use windows::Win32::System::Com::StructuredStorage::PROPVARIANT;
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoTaskMemFree, CLSCTX_ALL, COINIT_MULTITHREADED,
        STGM_READ,
    };
    use windows::Win32::System::Variant::VT_LPWSTR;

    // CLSID_CPolicyConfigClient — the COM class implementing IPolicyConfig.
    const CLSID_POLICY_CONFIG_CLIENT: GUID =
        GUID::from_u128(0x870af99c_171d_4f9e_af0d_e63df40c2bc9);

    /// Undocumented interface used to set the default audio endpoint.
    ///
    /// We never call the leading 10 methods — they exist only to push
    /// `SetDefaultEndpoint` to its real vtable slot (index 10 after IUnknown).
    /// Their signatures are irrelevant to layout (the macro allots one slot per
    /// method), so they are declared as zero-arg stubs.
    #[interface("f8679f50-850a-41cf-9c72-430f290290c8")]
    unsafe trait IPolicyConfig: IUnknown {
        unsafe fn GetMixFormat(&self) -> HRESULT;
        unsafe fn GetDeviceFormat(&self) -> HRESULT;
        unsafe fn ResetDeviceFormat(&self) -> HRESULT;
        unsafe fn SetDeviceFormat(&self) -> HRESULT;
        unsafe fn GetProcessingPeriod(&self) -> HRESULT;
        unsafe fn SetProcessingPeriod(&self) -> HRESULT;
        unsafe fn GetShareMode(&self) -> HRESULT;
        unsafe fn SetShareMode(&self) -> HRESULT;
        unsafe fn GetPropertyValue(&self) -> HRESULT;
        unsafe fn SetPropertyValue(&self) -> HRESULT;
        unsafe fn SetDefaultEndpoint(&self, device_id: PCWSTR, role: ERole) -> HRESULT;
        unsafe fn SetEndpointVisibility(&self) -> HRESULT;
    }

    fn e2s(e: windows::core::Error) -> String {
        e.to_string()
    }

    fn init_com() {
        // S_FALSE (already initialised) and RPC_E_CHANGED_MODE (initialised in a
        // different apartment) are both fine for our purposes — ignore the result.
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }
    }

    /// Read an owned `PWSTR`, then free the COM-allocated buffer.
    unsafe fn pwstr_into_string(p: PWSTR) -> String {
        if p.is_null() {
            return String::new();
        }
        let s = p.to_string().unwrap_or_default();
        CoTaskMemFree(Some(p.0 as *const c_void));
        s
    }

    /// Read a `VT_LPWSTR` PROPVARIANT without taking ownership — the buffer is
    /// freed when the PROPVARIANT is dropped, so we only copy out the string.
    unsafe fn propvariant_string(prop: &PROPVARIANT) -> Option<String> {
        let inner = &prop.Anonymous.Anonymous;
        if inner.vt != VT_LPWSTR {
            return None;
        }
        let p = inner.Anonymous.pwszVal;
        if p.is_null() {
            None
        } else {
            p.to_string().ok()
        }
    }

    unsafe fn friendly_name(device: &windows::Win32::Media::Audio::IMMDevice) -> Option<String> {
        let store = device.OpenPropertyStore(STGM_READ).ok()?;
        let prop: PROPVARIANT = store.GetValue(&PKEY_Device_FriendlyName).ok()?;
        propvariant_string(&prop)
    }

    pub fn enumerate(flow: EDataFlow) -> Result<Vec<AudioDevice>, String> {
        init_com();
        unsafe {
            let enumerator: IMMDeviceEnumerator =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).map_err(e2s)?;

            // No default endpoint (e.g. no devices) is not an error — just means
            // nothing is marked as default.
            let default_id = enumerator
                .GetDefaultAudioEndpoint(flow, eConsole)
                .ok()
                .and_then(|d| d.GetId().ok())
                .map(|p| pwstr_into_string(p))
                .unwrap_or_default();

            let collection = enumerator
                .EnumAudioEndpoints(flow, DEVICE_STATE_ACTIVE)
                .map_err(e2s)?;
            let count = collection.GetCount().map_err(e2s)?;

            let mut out = Vec::with_capacity(count as usize);
            for i in 0..count {
                let device = collection.Item(i).map_err(e2s)?;
                let id = pwstr_into_string(device.GetId().map_err(e2s)?);
                let name = friendly_name(&device).unwrap_or_else(|| id.clone());
                let is_default = !default_id.is_empty() && id == default_id;
                out.push(AudioDevice {
                    id,
                    name,
                    is_default,
                });
            }
            Ok(out)
        }
    }

    pub fn set_default(device_id: &str) -> Result<(), String> {
        init_com();
        unsafe {
            let config: IPolicyConfig =
                CoCreateInstance(&CLSID_POLICY_CONFIG_CLIENT, None, CLSCTX_ALL).map_err(e2s)?;
            // HSTRING is a null-terminated UTF-16 buffer; keep it alive for the calls.
            let wide = HSTRING::from(device_id);
            let id = PCWSTR(wide.as_ptr());
            // Move all three roles so comms apps follow too.
            for role in [eConsole, eMultimedia, eCommunications] {
                config.SetDefaultEndpoint(id, role).ok().map_err(e2s)?;
            }
            Ok(())
        }
    }

    fn endpoint_volume(flow: EDataFlow) -> Result<IAudioEndpointVolume, String> {
        init_com();
        unsafe {
            let enumerator: IMMDeviceEnumerator =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).map_err(e2s)?;
            let device = enumerator
                .GetDefaultAudioEndpoint(flow, eConsole)
                .map_err(e2s)?;
            let vol: IAudioEndpointVolume = device.Activate(CLSCTX_ALL, None).map_err(e2s)?;
            Ok(vol)
        }
    }

    pub fn read_volume(flow: EDataFlow) -> Result<VolumeInfo, String> {
        let vol = endpoint_volume(flow)?;
        unsafe {
            let volume = vol.GetMasterVolumeLevelScalar().map_err(e2s)? as f64;
            let muted = vol.GetMute().map_err(e2s)?.as_bool();
            Ok(VolumeInfo { volume, muted })
        }
    }

    pub fn write_volume(flow: EDataFlow, value: f64) -> Result<(), String> {
        let vol = endpoint_volume(flow)?;
        let level = value.clamp(0.0, 1.0) as f32;
        unsafe {
            vol.SetMasterVolumeLevelScalar(level, std::ptr::null())
                .map_err(e2s)?;
        }
        Ok(())
    }

    pub fn write_mute(flow: EDataFlow, muted: bool) -> Result<(), String> {
        let vol = endpoint_volume(flow)?;
        unsafe {
            vol.SetMute(muted, std::ptr::null()).map_err(e2s)?;
        }
        Ok(())
    }

    pub const RENDER: EDataFlow = eRender;
    pub const CAPTURE: EDataFlow = eCapture;
}

// ── Change notifications ──────────────────────────────────────────────────────
//
// Rather than poll, we register Core Audio callbacks and push changes to the UI
// as Tauri events. `IAudioEndpointVolumeCallback` fires whenever an endpoint's
// volume or mute changes from anywhere (media keys, the mixer, other apps);
// `IMMNotificationClient` fires on default-device and hotplug changes, which we
// use to re-bind the volume callback to the new default and refresh the list.
//
// The objects must outlive the call that registers them, so a dedicated thread
// initialises COM (MTA), wires everything up, and parks for the process's life.

#[cfg(windows)]
pub fn start_watch(app: tauri::AppHandle) {
    watch::start(app);
}

#[cfg(not(windows))]
pub fn start_watch(_app: tauri::AppHandle) {}

#[cfg(windows)]
mod watch {
    #![allow(non_snake_case)]

    use std::sync::{Arc, Mutex};

    use serde::Serialize;
    use tauri::{AppHandle, Emitter};
    use windows::core::{implement, Result, PCWSTR};
    use windows::Win32::Foundation::PROPERTYKEY;
    use windows::Win32::Media::Audio::Endpoints::{
        IAudioEndpointVolume, IAudioEndpointVolumeCallback, IAudioEndpointVolumeCallback_Impl,
    };
    use windows::Win32::Media::Audio::{
        eCapture, eConsole, eRender, EDataFlow, ERole, IMMDeviceEnumerator, IMMNotificationClient,
        IMMNotificationClient_Impl, MMDeviceEnumerator, AUDIO_VOLUME_NOTIFICATION_DATA,
        DEVICE_STATE,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED,
    };

    #[derive(Clone, Serialize)]
    #[serde(rename_all = "camelCase")]
    struct VolumePayload {
        kind: &'static str,
        volume: f64,
        muted: bool,
    }

    fn kind_of(flow: EDataFlow) -> &'static str {
        if flow == eRender {
            "output"
        } else {
            "input"
        }
    }

    /// Fires on any volume/mute change of the endpoint it's registered on.
    #[implement(IAudioEndpointVolumeCallback)]
    struct VolumeCallback {
        app: AppHandle,
        kind: &'static str,
    }

    impl IAudioEndpointVolumeCallback_Impl for VolumeCallback_Impl {
        fn OnNotify(&self, data: *mut AUDIO_VOLUME_NOTIFICATION_DATA) -> Result<()> {
            if !data.is_null() {
                let d = unsafe { &*data };
                let _ = self.app.emit(
                    "audio-volume-changed",
                    VolumePayload {
                        kind: self.kind,
                        volume: d.fMasterVolume as f64,
                        muted: d.bMuted.as_bool(),
                    },
                );
            }
            Ok(())
        }
    }

    /// Owns the per-flow volume callback registrations so they can be swapped
    /// when the default device changes underneath us.
    struct Endpoints {
        enumerator: IMMDeviceEnumerator,
        app: AppHandle,
        render: Option<(IAudioEndpointVolume, IAudioEndpointVolumeCallback)>,
        capture: Option<(IAudioEndpointVolume, IAudioEndpointVolumeCallback)>,
    }

    impl Endpoints {
        fn slot(
            &mut self,
            flow: EDataFlow,
        ) -> &mut Option<(IAudioEndpointVolume, IAudioEndpointVolumeCallback)> {
            if flow == eRender {
                &mut self.render
            } else {
                &mut self.capture
            }
        }

        /// Unregister any existing callback for `flow`, then bind one to the
        /// current default endpoint (if there is one).
        fn rebind(&mut self, flow: EDataFlow) {
            if let Some((vol, cb)) = self.slot(flow).take() {
                unsafe {
                    let _ = vol.UnregisterControlChangeNotify(&cb);
                }
            }
            let kind = kind_of(flow);
            let bound = unsafe {
                self.enumerator
                    .GetDefaultAudioEndpoint(flow, eConsole)
                    .ok()
                    .and_then(|device| {
                        let vol: IAudioEndpointVolume = device.Activate(CLSCTX_ALL, None).ok()?;
                        let cb: IAudioEndpointVolumeCallback = VolumeCallback {
                            app: self.app.clone(),
                            kind,
                        }
                        .into();
                        vol.RegisterControlChangeNotify(&cb).ok()?;
                        Some((vol, cb))
                    })
            };
            *self.slot(flow) = bound;
        }
    }

    /// Fires on default-device changes and device add/remove/state changes.
    #[implement(IMMNotificationClient)]
    struct DeviceNotify {
        app: AppHandle,
        endpoints: Arc<Mutex<Endpoints>>,
    }

    impl DeviceNotify_Impl {
        fn notify_devices(&self) {
            let _ = self.app.emit("audio-devices-changed", ());
        }
    }

    impl IMMNotificationClient_Impl for DeviceNotify_Impl {
        fn OnDefaultDeviceChanged(&self, flow: EDataFlow, role: ERole, _id: &PCWSTR) -> Result<()> {
            // Fires once per role; act on eConsole only so we rebind just once.
            if role == eConsole {
                if let Ok(mut ep) = self.endpoints.lock() {
                    ep.rebind(flow);
                }
                self.notify_devices();
            }
            Ok(())
        }

        fn OnDeviceStateChanged(&self, _id: &PCWSTR, _state: DEVICE_STATE) -> Result<()> {
            self.notify_devices();
            Ok(())
        }

        fn OnDeviceAdded(&self, _id: &PCWSTR) -> Result<()> {
            self.notify_devices();
            Ok(())
        }

        fn OnDeviceRemoved(&self, _id: &PCWSTR) -> Result<()> {
            self.notify_devices();
            Ok(())
        }

        fn OnPropertyValueChanged(&self, _id: &PCWSTR, _key: &PROPERTYKEY) -> Result<()> {
            Ok(())
        }
    }

    pub fn start(app: AppHandle) {
        std::thread::spawn(move || {
            // MTA so the objects are agile and callbacks can fire on RPC threads.
            unsafe {
                let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            }
            let enumerator: IMMDeviceEnumerator =
                match unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL) } {
                    Ok(e) => e,
                    Err(e) => {
                        eprintln!("[audio-watch] enumerator: {e}");
                        return;
                    }
                };

            // Endpoints holds COM interfaces (!Send + !Sync), but the Arc is
            // shared into the IMMNotificationClient callback, which COM invokes
            // from its own threads — Rc would be unsound here. Cross-thread
            // access is managed by the COM apartment model, so the lint is moot.
            #[allow(clippy::arc_with_non_send_sync)]
            let endpoints = Arc::new(Mutex::new(Endpoints {
                enumerator: enumerator.clone(),
                app: app.clone(),
                render: None,
                capture: None,
            }));
            if let Ok(mut ep) = endpoints.lock() {
                ep.rebind(eRender);
                ep.rebind(eCapture);
            }

            let client: IMMNotificationClient = DeviceNotify {
                app,
                endpoints: endpoints.clone(),
            }
            .into();
            if let Err(e) = unsafe { enumerator.RegisterEndpointNotificationCallback(&client) } {
                eprintln!("[audio-watch] register notify: {e}");
            }

            // Keep COM and every registration alive for the life of the process.
            let _client = client;
            let _endpoints = endpoints;
            let _enumerator = enumerator;
            loop {
                std::thread::park();
            }
        });
    }
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub fn list_output_devices(window: tauri::WebviewWindow) -> Result<Vec<AudioDevice>, String> {
    crate::commands::require_window(&window, &["main"])?;
    #[cfg(windows)]
    {
        imp::enumerate(imp::RENDER)
    }
    #[cfg(not(windows))]
    {
        Err(NOT_WINDOWS.into())
    }
}

#[tauri::command]
pub fn list_input_devices(window: tauri::WebviewWindow) -> Result<Vec<AudioDevice>, String> {
    crate::commands::require_window(&window, &["main"])?;
    #[cfg(windows)]
    {
        imp::enumerate(imp::CAPTURE)
    }
    #[cfg(not(windows))]
    {
        Err(NOT_WINDOWS.into())
    }
}

#[tauri::command]
pub fn set_default_output_device(
    window: tauri::WebviewWindow,
    device_id: String,
) -> Result<(), String> {
    crate::commands::require_window(&window, &["main"])?;
    #[cfg(windows)]
    {
        imp::set_default(&device_id)
    }
    #[cfg(not(windows))]
    {
        let _ = device_id;
        Err(NOT_WINDOWS.into())
    }
}

#[tauri::command]
pub fn set_default_input_device(
    window: tauri::WebviewWindow,
    device_id: String,
) -> Result<(), String> {
    crate::commands::require_window(&window, &["main"])?;
    #[cfg(windows)]
    {
        imp::set_default(&device_id)
    }
    #[cfg(not(windows))]
    {
        let _ = device_id;
        Err(NOT_WINDOWS.into())
    }
}

#[tauri::command]
pub fn get_output_volume(window: tauri::WebviewWindow) -> Result<VolumeInfo, String> {
    crate::commands::require_window(&window, &["main"])?;
    #[cfg(windows)]
    {
        imp::read_volume(imp::RENDER)
    }
    #[cfg(not(windows))]
    {
        Err(NOT_WINDOWS.into())
    }
}

#[tauri::command]
pub fn set_output_volume(window: tauri::WebviewWindow, volume: f64) -> Result<(), String> {
    crate::commands::require_window(&window, &["main"])?;
    #[cfg(windows)]
    {
        imp::write_volume(imp::RENDER, volume)
    }
    #[cfg(not(windows))]
    {
        let _ = volume;
        Err(NOT_WINDOWS.into())
    }
}

#[tauri::command]
pub fn set_output_mute(window: tauri::WebviewWindow, muted: bool) -> Result<(), String> {
    crate::commands::require_window(&window, &["main"])?;
    #[cfg(windows)]
    {
        imp::write_mute(imp::RENDER, muted)
    }
    #[cfg(not(windows))]
    {
        let _ = muted;
        Err(NOT_WINDOWS.into())
    }
}

#[tauri::command]
pub fn get_input_volume(window: tauri::WebviewWindow) -> Result<VolumeInfo, String> {
    crate::commands::require_window(&window, &["main"])?;
    #[cfg(windows)]
    {
        imp::read_volume(imp::CAPTURE)
    }
    #[cfg(not(windows))]
    {
        Err(NOT_WINDOWS.into())
    }
}

#[tauri::command]
pub fn set_input_volume(window: tauri::WebviewWindow, volume: f64) -> Result<(), String> {
    crate::commands::require_window(&window, &["main"])?;
    #[cfg(windows)]
    {
        imp::write_volume(imp::CAPTURE, volume)
    }
    #[cfg(not(windows))]
    {
        let _ = volume;
        Err(NOT_WINDOWS.into())
    }
}

#[tauri::command]
pub fn set_input_mute(window: tauri::WebviewWindow, muted: bool) -> Result<(), String> {
    crate::commands::require_window(&window, &["main"])?;
    #[cfg(windows)]
    {
        imp::write_mute(imp::CAPTURE, muted)
    }
    #[cfg(not(windows))]
    {
        let _ = muted;
        Err(NOT_WINDOWS.into())
    }
}
