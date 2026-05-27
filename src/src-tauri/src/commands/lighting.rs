use serde::Serialize;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HidDeviceInfo {
    pub vendor_id: u16,
    pub product_id: u16,
    pub manufacturer: Option<String>,
    pub product: Option<String>,
    pub serial_number: Option<String>,
    pub usage_page: Option<u16>,
    pub usage: Option<u16>,
    pub interface_number: Option<i32>,
    pub path: String,
}

#[tauri::command]
pub fn list_hid_devices() -> Result<Vec<HidDeviceInfo>, String> {
    let api = hidapi::HidApi::new().map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for dev in api.device_list() {
        out.push(HidDeviceInfo {
            vendor_id: dev.vendor_id(),
            product_id: dev.product_id(),
            manufacturer: dev.manufacturer_string().map(|s| s.to_string()),
            product: dev.product_string().map(|s| s.to_string()),
            serial_number: dev.serial_number().map(|s| s.to_string()),
            usage_page: Some(dev.usage_page()),
            usage: Some(dev.usage()),
            interface_number: Some(dev.interface_number()),
            path: dev.path().to_string_lossy().into_owned(),
        });
    }

    // Keep it stable for UI diffing and logs.
    out.sort_by(|a, b| {
        (a.vendor_id, a.product_id, &a.path)
            .cmp(&(b.vendor_id, b.product_id, &b.path))
    });

    Ok(out)
}

