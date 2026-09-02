//! Overlay window management (always-on-top, transparent, position persisted in `kv`).

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder, WindowEvent};

use crate::db::Db;
use crate::error::AppResult;

pub const OVERLAY_LABEL: &str = "overlay";
const KV_BOUNDS: &str = "overlay_bounds";
const DEFAULT_W: f64 = 380.0;
const DEFAULT_H: f64 = 520.0;
const MARGIN: i32 = 16;

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
struct Bounds {
    x: i32,
    y: i32,
    w: u32,
    h: u32,
}

/// Tauri-managed state: debounce generation for bounds persistence.
#[derive(Default)]
pub struct OverlayState {
    generation: AtomicU64,
    last: parking_lot::Mutex<Option<Bounds>>,
}

fn load_bounds(db: &Db) -> Option<Bounds> {
    let txt = db.kv_get(KV_BOUNDS).ok()??;
    serde_json::from_str(&txt).ok()
}

fn schedule_save(app: &AppHandle, bounds: Bounds) {
    let state = app.state::<Arc<OverlayState>>();
    let state = state.inner().clone();
    *state.last.lock() = Some(bounds);
    let gen = state.generation.fetch_add(1, Ordering::SeqCst) + 1;
    let db = app.state::<Arc<Db>>().inner().clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(400)).await;
        if state.generation.load(Ordering::SeqCst) != gen {
            return; // superseded by a newer move/resize
        }
        if let Some(b) = *state.last.lock() {
            if let Ok(txt) = serde_json::to_string(&b) {
                let _ = db.kv_set(KV_BOUNDS, &txt);
            }
        }
    });
}

fn current_bounds(win: &tauri::WebviewWindow) -> Option<Bounds> {
    let pos = win.outer_position().ok()?;
    let size = win.outer_size().ok()?;
    if size.width == 0 || size.height == 0 {
        return None;
    }
    Some(Bounds { x: pos.x, y: pos.y, w: size.width, h: size.height })
}

/// Default placement: bottom-right corner of the primary monitor's work area.
fn default_bounds(app: &AppHandle) -> Option<Bounds> {
    let monitor = app.primary_monitor().ok().flatten()?;
    let scale = monitor.scale_factor();
    let w = (DEFAULT_W * scale).round() as u32;
    let h = (DEFAULT_H * scale).round() as u32;
    let wa = monitor.work_area();
    let margin = (MARGIN as f64 * scale).round() as i32;
    let x = wa.position.x + wa.size.width as i32 - w as i32 - margin;
    let y = wa.position.y + wa.size.height as i32 - h as i32 - margin;
    Some(Bounds { x, y, w, h })
}

pub fn is_open(app: &AppHandle) -> bool {
    app.get_webview_window(OVERLAY_LABEL)
        .map(|w| w.is_visible().unwrap_or(false))
        .unwrap_or(false)
}

pub fn open(app: &AppHandle) -> AppResult<()> {
    if let Some(w) = app.get_webview_window(OVERLAY_LABEL) {
        // A window that is being destroyed can still be registered for a moment; only reuse it
        // when it actually becomes visible, otherwise fall through and create a fresh one.
        if w.show().is_ok() && w.is_visible().unwrap_or(false) {
            let _ = w.set_focus();
            return Ok(());
        }
        let _ = w.destroy();
        std::thread::sleep(Duration::from_millis(150));
    }

    let db = app.state::<Arc<Db>>().inner().clone();
    let bounds = load_bounds(&db).or_else(|| default_bounds(app));

    let mut builder = WebviewWindowBuilder::new(app, OVERLAY_LABEL, WebviewUrl::App("overlay.html".into()));
    // WebView2 requires every window in the same user-data folder to share identical browser
    // arguments. When the main window is launched with custom args (dev-time remote debugging via
    // `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` + a matching `additionalBrowserArgs` in tauri.conf),
    // mirror them here so the overlay can still be created.
    #[cfg(windows)]
    if let Ok(args) = std::env::var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS") {
        if !args.trim().is_empty() {
            builder = builder.additional_browser_args(&args);
        }
    }
    let win = builder
        .title("TFT Tracker Overlay")
        .inner_size(DEFAULT_W, DEFAULT_H)
        .min_inner_size(280.0, 200.0)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(true)
        .shadow(false)
        .visible(false)
        .build()?;

    if let Some(b) = bounds {
        let _ = win.set_size(PhysicalSize::new(b.w, b.h));
        let _ = win.set_position(PhysicalPosition::new(b.x, b.y));
    }

    let handle = app.clone();
    let win_for_events = win.clone();
    win.on_window_event(move |event| match event {
        WindowEvent::Moved(_) | WindowEvent::Resized(_) => {
            if let Some(b) = current_bounds(&win_for_events) {
                schedule_save(&handle, b);
            }
        }
        WindowEvent::Destroyed => {
            // Flush the last known bounds synchronously.
            let state = handle.state::<Arc<OverlayState>>().inner().clone();
            let db = handle.state::<Arc<Db>>().inner().clone();
            let last = *state.last.lock();
            if let Some(b) = last {
                if let Ok(txt) = serde_json::to_string(&b) {
                    let _ = db.kv_set(KV_BOUNDS, &txt);
                }
            }
        }
        _ => {}
    });

    win.show()?;
    win.set_focus()?;
    Ok(())
}

pub fn close(app: &AppHandle) -> AppResult<()> {
    if let Some(w) = app.get_webview_window(OVERLAY_LABEL) {
        if let Some(b) = current_bounds(&w) {
            let db = app.state::<Arc<Db>>();
            if let Ok(txt) = serde_json::to_string(&b) {
                let _ = db.kv_set(KV_BOUNDS, &txt);
            }
        }
        w.destroy()?;
    }
    Ok(())
}

/// Returns the new open state.
pub fn toggle(app: &AppHandle) -> AppResult<bool> {
    if is_open(app) {
        close(app)?;
        Ok(false)
    } else {
        open(app)?;
        Ok(true)
    }
}

pub fn set_click_through(app: &AppHandle, enabled: bool) -> AppResult<()> {
    if let Some(w) = app.get_webview_window(OVERLAY_LABEL) {
        w.set_ignore_cursor_events(enabled)?;
    }
    Ok(())
}
