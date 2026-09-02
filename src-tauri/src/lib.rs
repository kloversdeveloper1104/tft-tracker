mod cdragon;
mod commands;
mod db;
mod error;
mod overlay;
mod riot;
mod stats;

use std::sync::Arc;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Manager, WindowEvent};

use commands::{CollectState, Paths};

fn show_main(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(debug_assertions)]
    {
        let _ = env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info,tft_tracker_lib=debug"))
            .try_init();
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_denylist(&[overlay::OVERLAY_LABEL])
                .build(),
        )
        .manage(riot::RiotState(parking_lot::RwLock::new(None)))
        .manage(Arc::new(CollectState::default()))
        .manage(Arc::new(overlay::OverlayState::default()))
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            let cache_dir = data_dir.join("cache");
            std::fs::create_dir_all(&cache_dir)?;

            let db = db::Db::open(&data_dir.join("tft.db"))?;
            log::info!("database at {}", db.path().display());
            app.manage(Arc::new(db));
            app.manage(Arc::new(cdragon::CdragonCache::new(cache_dir.clone())));
            app.manage(Paths { data_dir, cache_dir });

            // System tray
            let show = MenuItem::with_id(app, "show", "表示", true, None::<&str>)?;
            let toggle = MenuItem::with_id(app, "overlay", "オーバーレイ切替", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "終了", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &toggle, &quit])?;
            let mut tray = TrayIconBuilder::with_id("main-tray")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .tooltip("TFT Tracker")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main(app),
                    "overlay" => {
                        if let Err(e) = overlay::toggle(app) {
                            log::error!("overlay toggle failed: {e}");
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        show_main(tray.app_handle());
                    }
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::Destroyed = event {
                if window.label() == "main" {
                    // Closing the main window also closes the overlay so the app exits.
                    let app = window.app_handle();
                    if let Some(o) = app.get_webview_window(overlay::OVERLAY_LABEL) {
                        let _ = o.destroy();
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::configure_riot,
            commands::resolve_account,
            commands::get_summoner,
            commands::get_league,
            commands::list_rank_snapshots,
            commands::sync_matches,
            commands::list_matches,
            commands::count_matches,
            commands::get_match,
            commands::collect_ladder,
            commands::cancel_collect,
            commands::get_collect_status,
            commands::count_ladder_matches,
            commands::clear_ladder_matches,
            commands::get_stats,
            commands::get_static_meta,
            commands::get_static_data,
            commands::refresh_static_data,
            commands::toggle_overlay,
            commands::open_overlay,
            commands::close_overlay,
            commands::is_overlay_open,
            commands::set_overlay_click_through,
            commands::get_data_dir,
            commands::clear_cache,
            commands::db_stats,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
