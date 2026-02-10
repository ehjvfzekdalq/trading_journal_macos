mod api;
mod commands;
mod db;
mod models;
mod sync;

use std::sync::Arc;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            // Get app data directory
            let app_dir = app.path().app_data_dir()
                .expect("Failed to resolve app data directory");

            // Create directory if it doesn't exist
            std::fs::create_dir_all(&app_dir).expect("Failed to create app data directory");

            // Database path
            let db_path = app_dir.join("trading_journal.db");
            println!("Database path: {:?}", db_path);

            // Initialize database
            let database = match db::Database::new(db_path.to_str().unwrap()) {
                Ok(db) => db,
                Err(e) => {
                    eprintln!("❌ Database initialization failed: {}", e);
                    eprintln!();
                    eprintln!("This might be due to a failed migration or database corruption.");
                    eprintln!();
                    eprintln!("Your database backups are located at:");
                    eprintln!("  {:?}", app_dir.join("backups"));
                    eprintln!();
                    eprintln!("Recovery steps:");
                    eprintln!("  1. Close this application");
                    eprintln!("  2. Locate the most recent backup in the backups folder");
                    eprintln!("  3. Replace trading_journal.db with the backup");
                    eprintln!("  4. Restart the application");
                    eprintln!();
                    eprintln!("If the problem persists, please report this issue with");
                    eprintln!("the error message shown above.");

                    return Err(Box::new(std::io::Error::new(
                        std::io::ErrorKind::Other,
                        format!("Database initialization failed: {}", e),
                    )));
                }
            };

            // Store database in app state
            app.manage(database);

            // Initialize secure credential storage
            api::credentials::init_storage(app_dir.clone())
                .expect("Failed to initialize secure storage");

            // Initialize sync scheduler
            let scheduler = sync::SyncScheduler::new(app.handle().clone());

            // Start scheduler in background
            let scheduler_clone = scheduler.clone();
            tauri::async_runtime::spawn(async move {
                scheduler_clone.start().await;
            });

            // Store scheduler in app state
            app.manage(scheduler);

            // Initialize live mirror manager
            let mirror_manager = Arc::new(api::LiveMirrorManager::new());
            app.manage(mirror_manager);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::update_settings,
            commands::get_trades,
            commands::get_trade,
            commands::create_trade,
            commands::update_trade,
            commands::delete_trade,
            commands::get_deleted_trades,
            commands::restore_trade,
            commands::duplicate_trade,
            commands::get_all_trades_including_deleted,
            commands::restore_all_trades,
            commands::delete_all_trades,
            commands::get_dashboard_stats,
            commands::get_equity_curve,
            commands::preview_bitget_import,
            commands::import_bitget_csv,
            commands::delete_bitget_trades,
            commands::export_all_data,
            commands::import_all_data,
            commands::save_api_credentials,
            commands::list_api_credentials,
            commands::test_api_credentials,
            commands::delete_api_credentials,
            commands::update_api_credentials_status,
            commands::update_auto_sync_settings,
            commands::get_sync_history,
            commands::sync_exchange_trades,
            commands::reload_sync_scheduler,
            commands::fetch_current_positions,
            commands::fetch_open_orders,
            commands::start_live_mirroring,
            commands::stop_live_mirroring,
            commands::is_live_mirroring_active,
            commands::toggle_live_mirroring,
            commands::get_live_mirroring_status,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                // Cleanup live mirror connections on window close
                let mirror_manager = window.state::<Arc<api::LiveMirrorManager>>();
                tauri::async_runtime::block_on(async {
                    mirror_manager.stop_all().await;
                });
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
