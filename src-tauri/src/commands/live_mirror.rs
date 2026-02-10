use tauri::{AppHandle, Manager, State};
use std::sync::Arc;
use crate::api::LiveMirrorManager;
use crate::db::Database;

/// Start live trade mirroring for a credential
#[tauri::command]
pub async fn start_live_mirroring(
    app_handle: AppHandle,
    db: State<'_, Database>,
    mirror_manager: State<'_, Arc<LiveMirrorManager>>,
    credential_id: String,
) -> Result<(), String> {
    // Check if position monitor feature is enabled
    let enabled = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        let enabled: i32 = conn
            .query_row(
                "SELECT enable_position_monitor FROM settings WHERE id = 1",
                [],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        enabled
    }; // conn is dropped here

    if enabled == 0 {
        return Err("Position monitoring feature is currently disabled".to_string());
    }

    // Create Arc wrapper for database
    // Note: This is a simplified approach. In production, consider restructuring
    // to share the database connection more efficiently
    let db_arc = Arc::new(Database {
        conn: std::sync::Mutex::new(
            // This creates a connection to the same database file
            rusqlite::Connection::open(
                app_handle.path()
                    .app_data_dir()
                    .expect("Failed to resolve app data directory")
                    .join("trading_journal.db")
            )
            .map_err(|e| e.to_string())?
        ),
    });

    mirror_manager
        .start_mirroring(credential_id, app_handle, db_arc)
        .await
}

/// Stop live trade mirroring for a credential
#[tauri::command]
pub async fn stop_live_mirroring(
    mirror_manager: State<'_, Arc<LiveMirrorManager>>,
    credential_id: String,
) -> Result<(), String> {
    mirror_manager.stop_mirroring(&credential_id).await
}

/// Check if live mirroring is active for a credential
#[tauri::command]
pub async fn is_live_mirroring_active(
    mirror_manager: State<'_, Arc<LiveMirrorManager>>,
    credential_id: String,
) -> Result<bool, String> {
    Ok(mirror_manager.is_active(&credential_id).await)
}

/// Toggle live mirroring setting for a credential
#[tauri::command]
pub async fn toggle_live_mirroring(
    db: State<'_, Database>,
    credential_id: String,
    enabled: bool,
) -> Result<(), String> {
    // Check if position monitor feature is enabled
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let feature_enabled: i32 = conn
        .query_row(
            "SELECT enable_position_monitor FROM settings WHERE id = 1",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    if feature_enabled == 0 {
        drop(conn);
        return Err("Position monitoring feature is currently disabled".to_string());
    }

    let now = chrono::Utc::now().timestamp();

    conn.execute(
        "UPDATE api_credentials SET live_mirror_enabled = ?, updated_at = ? WHERE id = ?",
        rusqlite::params![enabled as i32, now, &credential_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Get live mirroring status for all credentials
#[tauri::command]
pub async fn get_live_mirroring_status(
    db: State<'_, Database>,
) -> Result<Vec<LiveMirrorStatus>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, exchange, label, live_mirror_enabled FROM api_credentials WHERE is_active = 1")
        .map_err(|e| e.to_string())?;

    let statuses = stmt
        .query_map([], |row| {
            Ok(LiveMirrorStatus {
                credential_id: row.get(0)?,
                exchange: row.get(1)?,
                label: row.get(2)?,
                enabled: row.get::<_, i32>(3)? == 1,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(statuses)
}

#[derive(serde::Serialize)]
pub struct LiveMirrorStatus {
    pub credential_id: String,
    pub exchange: String,
    pub label: String,
    pub enabled: bool,
}
