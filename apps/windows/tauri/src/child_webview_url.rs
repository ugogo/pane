//! URLs for secondary Tauri webviews (capture overlay, accent popup, etc.).
//!
//! Child windows must load **direct expo-router paths** (`/area-selector`, …)
//! built from the main window's origin (dev server or `tauri://localhost`).
//! Do not append `?view=` to whatever path the main window is on: the main app
//! boots to `/capture`, while legacy `?view=` redirects in `app/index.tsx` only
//! run on `/`. Inheriting `/capture` + `?view=…` opens the dashboard shell in
//! the child window.

use tauri::{AppHandle, Manager, WebviewUrl};

/// Expo-router paths for `app/(views)/*` child windows. Keep in sync with the
/// frontend route files when adding a new popup webview.
pub mod routes {
    pub const AREA_SELECTOR: &str = "/area-selector";
    pub const CAPTURE_PREVIEW: &str = "/preview";
    pub const CAPTURE_ZOOM: &str = "/capture-zoom";
    pub const IMAGE_EDITOR: &str = "/image-editor";
    pub const ACCENT_POPUP: &str = "/accent-popup";
}

fn normalize_route_path(route_path: &str) -> String {
    if route_path.starts_with('/') {
        route_path.to_string()
    } else {
        format!("/{route_path}")
    }
}

/// Base URL of the main webview with `route_path` as the pathname and no query.
pub fn route_url(app: &AppHandle, route_path: &str) -> Result<tauri::Url, String> {
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window missing.".to_string())?;
    let mut url = main.url().map_err(|e| e.to_string())?;
    url.set_path(&normalize_route_path(route_path));
    url.set_query(None);
    Ok(url)
}

/// Like [`route_url`], with query parameters (e.g. accent `chars` on first paint).
pub fn route_url_with_query(
    app: &AppHandle,
    route_path: &str,
    query: &[(&str, &str)],
) -> Result<tauri::Url, String> {
    let mut url = route_url(app, route_path)?;
    if query.is_empty() {
        return Ok(url);
    }
    {
        let mut q = url.query_pairs_mut();
        q.clear();
        for (key, value) in query {
            q.append_pair(key, value);
        }
    }
    Ok(url)
}

/// [`route_url`] wrapped for [`WebviewWindowBuilder::new`].
pub fn webview_url(app: &AppHandle, route_path: &str) -> Result<WebviewUrl, String> {
    route_url(app, route_path).map(WebviewUrl::External)
}
