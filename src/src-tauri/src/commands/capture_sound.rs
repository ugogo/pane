use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// Plays the bundled shutter WAV asynchronously (matches CleanShot.WinUI).
#[cfg(windows)]
pub fn play_capture_sound(app: &AppHandle) {
    use std::ffi::OsStr;
    use std::os::windows::prelude::OsStrExt;
    use windows_sys::Win32::Media::Audio::{PlaySoundW, SND_ASYNC, SND_FILENAME, SND_NODEFAULT};

    let Some(path) = shutter_path(app) else {
        return;
    };

    let wide: Vec<u16> = OsStr::new(&path)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    unsafe {
        PlaySoundW(
            wide.as_ptr(),
            std::ptr::null_mut(),
            SND_ASYNC | SND_FILENAME | SND_NODEFAULT,
        );
    }
}

#[cfg(not(windows))]
pub fn play_capture_sound(_app: &AppHandle) {}

fn shutter_path(app: &AppHandle) -> Option<PathBuf> {
    use tauri::path::BaseDirectory;

    if let Ok(path) = app
        .path()
        .resolve("capture-shutter.wav", BaseDirectory::Resource)
    {
        if path.exists() {
            return Some(path);
        }
    }

    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/capture-shutter.wav");
    dev.exists().then_some(dev)
}
