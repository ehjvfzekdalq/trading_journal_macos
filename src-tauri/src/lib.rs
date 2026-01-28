mod api;
mod commands;
mod db;
mod models;

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
            let database = db::Database::new(db_path.to_str().unwrap())
                .expect("Failed to initialize database");

            // Store database in app state
            app.manage(database);

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
            commands::duplicate_trade,
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
            commands::get_sync_history,
            commands::sync_exchange_trades,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
