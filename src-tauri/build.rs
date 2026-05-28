fn main() {
    #[cfg(windows)]
    {
        tauri_build::try_build(tauri_build::Attributes::new().windows_attributes(
            tauri_build::WindowsAttributes::new()
                .app_manifest(include_str!("windows-app-manifest.xml")),
        ))
        .expect("failed to run tauri-build");
    }

    #[cfg(not(windows))]
    tauri_build::build();
}
