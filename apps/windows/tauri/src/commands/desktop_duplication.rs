//! Persistent screen capture via DXGI Desktop Duplication.
//!
//! `xcap`'s `Monitor::capture_image()` stands up and tears down an entire
//! capture session (D3D device, frame pool, the lot) on every call — ~175 ms per
//! frame on this machine, capping ambient sync at ~5 fps. This keeps one
//! duplication session alive for the life of the sync loop and just pulls the
//! next frame each iteration, which runs in single-digit milliseconds.
//!
//! Like Windows.Graphics.Capture (the `wgc` path we replaced), duplication sees
//! the composited desktop including hardware-accelerated video and HDR. Content
//! protected by hardware DRM (Netflix, etc.) is blacked out by the OS for any
//! capture API, so it reads black here too — an acceptable limit for an ambient
//! light.

use windows::core::Interface;
use windows::Win32::Foundation::{HMODULE, POINT};
use windows::Win32::Graphics::Direct3D::D3D_DRIVER_TYPE_HARDWARE;
use windows::Win32::Graphics::Direct3D11::{
    D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, ID3D11Texture2D, D3D11_BIND_FLAG,
    D3D11_CPU_ACCESS_READ, D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_MAPPED_SUBRESOURCE,
    D3D11_MAP_READ, D3D11_RESOURCE_MISC_FLAG, D3D11_SDK_VERSION, D3D11_TEXTURE2D_DESC,
    D3D11_USAGE_STAGING,
};
use windows::Win32::Graphics::Dxgi::Common::{DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_SAMPLE_DESC};
use windows::Win32::Graphics::Dxgi::{
    IDXGIAdapter, IDXGIDevice, IDXGIOutput1, IDXGIOutputDuplication, IDXGIResource,
    DXGI_ERROR_ACCESS_LOST, DXGI_ERROR_DEVICE_REMOVED, DXGI_ERROR_DEVICE_RESET,
    DXGI_ERROR_WAIT_TIMEOUT, DXGI_OUTDUPL_FRAME_INFO,
};
use windows::Win32::Graphics::Gdi::{MonitorFromPoint, MONITOR_DEFAULTTOPRIMARY};

/// A live duplication of the primary monitor. Holds the D3D device/context, the
/// duplication interface, and a lazily-(re)sized CPU-readable staging texture
/// the GPU frame is copied into so we can read pixels on the CPU.
pub struct DesktopDuplicator {
    device: ID3D11Device,
    context: ID3D11DeviceContext,
    dupl: IDXGIOutputDuplication,
    /// Staging texture plus its dimensions, recreated on a resolution change.
    staging: Option<(ID3D11Texture2D, u32, u32)>,
    /// Whether a frame is currently held and must be released before the next
    /// `AcquireNextFrame`.
    holding_frame: bool,
}

/// What a single capture attempt produced.
pub enum Frame {
    /// A fresh frame was read; its BGRA pixels were handed to the callback.
    New,
    /// No new frame arrived within the timeout (screen unchanged) — reuse the
    /// last colors.
    Unchanged,
}

impl DesktopDuplicator {
    /// Open a duplication session for the primary monitor.
    pub fn new() -> Result<Self, String> {
        unsafe {
            let mut device: Option<ID3D11Device> = None;
            let mut context: Option<ID3D11DeviceContext> = None;
            D3D11CreateDevice(
                None,
                D3D_DRIVER_TYPE_HARDWARE,
                HMODULE::default(),
                D3D11_CREATE_DEVICE_BGRA_SUPPORT,
                None,
                D3D11_SDK_VERSION,
                Some(&mut device),
                None,
                Some(&mut context),
            )
            .map_err(|e| format!("D3D11CreateDevice failed: {e}"))?;
            let device = device.ok_or("D3D11CreateDevice returned no device")?;
            let context = context.ok_or("D3D11CreateDevice returned no context")?;

            let output = primary_output(&device)?;
            let dupl = output
                .DuplicateOutput(&device)
                .map_err(|e| format!("DuplicateOutput failed: {e}"))?;

            Ok(Self {
                device,
                context,
                dupl,
                staging: None,
                holding_frame: false,
            })
        }
    }

    /// Pull the next frame. On a fresh frame, `f` is called with the BGRA pixel
    /// buffer (`data`, `width`, `height`, `row_pitch` in bytes). Returns
    /// `Unchanged` if nothing new arrived within `timeout_ms`. An `Err` means the
    /// session was lost (resolution/mode change, secure desktop) and the caller
    /// should rebuild the duplicator.
    pub fn next_frame(
        &mut self,
        timeout_ms: u32,
        f: impl FnOnce(&[u8], u32, u32, u32),
    ) -> Result<Frame, String> {
        unsafe {
            // Release the previous frame before acquiring the next.
            if self.holding_frame {
                let _ = self.dupl.ReleaseFrame();
                self.holding_frame = false;
            }

            let mut info = DXGI_OUTDUPL_FRAME_INFO::default();
            let mut resource: Option<IDXGIResource> = None;
            match self
                .dupl
                .AcquireNextFrame(timeout_ms, &mut info, &mut resource)
            {
                Ok(()) => {}
                Err(e) if e.code() == DXGI_ERROR_WAIT_TIMEOUT => return Ok(Frame::Unchanged),
                Err(e) if e.code() == DXGI_ERROR_ACCESS_LOST => {
                    return Err(format!("duplication access lost: {e}"))
                }
                // A GPU reset (TDR timeout, driver update, sleep/resume, hybrid-GPU
                // switch) removes the device with 0x887A0005 / 0x887A0007. It's
                // recoverable — the caller rebuilds a fresh device — so surface it
                // as a lost session rather than a hard failure. GetDeviceRemovedReason
                // gives the underlying cause for the log.
                Err(e)
                    if e.code() == DXGI_ERROR_DEVICE_REMOVED
                        || e.code() == DXGI_ERROR_DEVICE_RESET =>
                {
                    let reason = self.device.GetDeviceRemovedReason();
                    return Err(format!("GPU device removed ({e}); reason: {reason:?}"));
                }
                Err(e) => return Err(format!("AcquireNextFrame failed: {e}")),
            }
            self.holding_frame = true;

            let resource = resource.ok_or("AcquireNextFrame returned no resource")?;
            let frame_tex: ID3D11Texture2D = resource
                .cast()
                .map_err(|e| format!("frame is not a texture: {e}"))?;
            let mut desc = D3D11_TEXTURE2D_DESC::default();
            frame_tex.GetDesc(&mut desc);
            if desc.Format != DXGI_FORMAT_B8G8R8A8_UNORM {
                // HDR outputs hand back a float format; bail so the caller can
                // fall back to xcap rather than misread the pixels.
                return Err(format!("unsupported capture format {:?}", desc.Format));
            }

            self.ensure_staging(desc.Width, desc.Height)?;
            let (staging, w, h) = self.staging.as_ref().unwrap();
            let (w, h) = (*w, *h);
            self.context.CopyResource(staging, &frame_tex);

            let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
            self.context
                .Map(staging, 0, D3D11_MAP_READ, 0, Some(&mut mapped))
                .map_err(|e| format!("Map staging texture failed: {e}"))?;
            let row_pitch = mapped.RowPitch;
            let len = row_pitch as usize * h as usize;
            let data = std::slice::from_raw_parts(mapped.pData as *const u8, len);
            f(data, w, h, row_pitch);
            self.context.Unmap(staging, 0);

            Ok(Frame::New)
        }
    }

    /// Ensure the staging texture matches the frame's dimensions.
    fn ensure_staging(&mut self, width: u32, height: u32) -> Result<(), String> {
        if let Some((_, w, h)) = &self.staging {
            if *w == width && *h == height {
                return Ok(());
            }
        }
        let desc = D3D11_TEXTURE2D_DESC {
            Width: width,
            Height: height,
            MipLevels: 1,
            ArraySize: 1,
            Format: DXGI_FORMAT_B8G8R8A8_UNORM,
            SampleDesc: DXGI_SAMPLE_DESC {
                Count: 1,
                Quality: 0,
            },
            Usage: D3D11_USAGE_STAGING,
            BindFlags: D3D11_BIND_FLAG(0).0 as u32,
            CPUAccessFlags: D3D11_CPU_ACCESS_READ.0 as u32,
            MiscFlags: D3D11_RESOURCE_MISC_FLAG(0).0 as u32,
        };
        let mut texture: Option<ID3D11Texture2D> = None;
        unsafe {
            self.device
                .CreateTexture2D(&desc, None, Some(&mut texture))
                .map_err(|e| format!("CreateTexture2D (staging) failed: {e}"))?;
        }
        let texture = texture.ok_or("CreateTexture2D returned no texture")?;
        self.staging = Some((texture, width, height));
        Ok(())
    }
}

impl Drop for DesktopDuplicator {
    fn drop(&mut self) {
        if self.holding_frame {
            unsafe {
                let _ = self.dupl.ReleaseFrame();
            }
        }
    }
}

/// Find the DXGI output (`IDXGIOutput1`) for the primary monitor on the same
/// adapter as `device`, so the duplication shares the device.
fn primary_output(device: &ID3D11Device) -> Result<IDXGIOutput1, String> {
    unsafe {
        let primary = MonitorFromPoint(POINT { x: 0, y: 0 }, MONITOR_DEFAULTTOPRIMARY);
        let dxgi_device: IDXGIDevice = device
            .cast()
            .map_err(|e| format!("device is not a DXGI device: {e}"))?;
        let adapter: IDXGIAdapter = dxgi_device
            .GetAdapter()
            .map_err(|e| format!("GetAdapter failed: {e}"))?;

        let mut first: Option<IDXGIOutput1> = None;
        let mut i = 0u32;
        while let Ok(output) = adapter.EnumOutputs(i) {
            if let Ok(desc) = output.GetDesc() {
                let out1: IDXGIOutput1 = output
                    .cast()
                    .map_err(|e| format!("output lacks IDXGIOutput1: {e}"))?;
                if desc.Monitor == primary {
                    return Ok(out1);
                }
                first.get_or_insert(out1);
            }
            i += 1;
        }
        // Primary wasn't on this adapter (e.g. a hybrid-GPU laptop); fall back to
        // the adapter's first output rather than failing outright.
        first.ok_or_else(|| "no DXGI outputs found on the primary adapter".to_string())
    }
}
