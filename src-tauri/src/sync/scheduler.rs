use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Manager};
use tokio::sync::RwLock;
use tokio::task::JoinHandle;

use crate::db::Database;
use crate::models::{SyncConfig, ApiCredentialSafe};

/// Background sync scheduler
#[derive(Clone)]
pub struct SyncScheduler {
    app_handle: AppHandle,
    tasks: Arc<RwLock<Vec<JoinHandle<()>>>>,
}

impl SyncScheduler {
    /// Create a new sync scheduler
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            app_handle,
            tasks: Arc::new(RwLock::new(Vec::new())),
        }
    }

    /// Start the scheduler - scans for credentials and starts background tasks
    pub async fn start(&self) {
        println!("Starting background sync scheduler...");

        // Load credentials and start tasks
        if let Err(e) = self.reload_tasks().await {
            eprintln!("Failed to start sync scheduler: {}", e);
        }
    }

    /// Reload all sync tasks (stop existing, start new ones)
    pub async fn reload_tasks(&self) -> Result<(), String> {
        println!("Reloading sync tasks...");

        // Stop all existing tasks
        self.stop_all_tasks().await;

        // Get database from app state
        let db = self.app_handle.state::<Database>();

        // Load all active credentials with auto-sync enabled
        let credentials = self.get_auto_sync_credentials(&db)?;

        println!("Found {} credentials with auto-sync enabled", credentials.len());

        // Start a task for each credential
        for cred in credentials {
            self.start_task_for_credential(cred).await;
        }

        Ok(())
    }

    /// Get all credentials that have auto-sync enabled and are active
    fn get_auto_sync_credentials(&self, db: &Database) -> Result<Vec<ApiCredentialSafe>, String> {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;

        let mut stmt = conn
            .prepare(
                "SELECT id, exchange, label, api_key, is_active, last_sync_timestamp,
                        auto_sync_enabled, auto_sync_interval, live_mirror_enabled, created_at, updated_at
                 FROM api_credentials
                 WHERE is_active = 1 AND auto_sync_enabled = 1
                 ORDER BY created_at DESC"
            )
            .map_err(|e| e.to_string())?;

        let credentials_iter = stmt
            .query_map([], |row| {
                let id: String = row.get(0)?;
                let api_key: String = row.get(3)?;

                Ok(ApiCredentialSafe {
                    id,
                    exchange: row.get(1)?,
                    label: row.get(2)?,
                    api_key_preview: crate::models::ApiCredential::create_preview(&api_key),
                    is_active: row.get::<_, i32>(4)? == 1,
                    last_sync_timestamp: row.get(5)?,
                    auto_sync_enabled: row.get::<_, i32>(6)? == 1,
                    auto_sync_interval: row.get(7)?,
                    live_mirror_enabled: row.get::<_, i32>(8)? == 1,
                    created_at: row.get(9)?,
                    updated_at: row.get(10)?,
                })
            })
            .map_err(|e| e.to_string())?;

        credentials_iter.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    /// Start a background task for a specific credential
    async fn start_task_for_credential(&self, credential: ApiCredentialSafe) {
        let app_handle = self.app_handle.clone();
        let credential_id = credential.id.clone();
        let interval_secs = credential.auto_sync_interval;
        let exchange = credential.exchange.clone();

        println!(
            "Starting auto-sync task for {} ({}) - interval: {}s",
            exchange, credential_id, interval_secs
        );

        let handle = tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(interval_secs as u64));

            loop {
                interval.tick().await;

                println!("Auto-sync tick for {} ({})", exchange, credential_id);

                // Perform sync
                if let Err(e) = Self::perform_sync(&app_handle, &credential_id).await {
                    eprintln!("Auto-sync failed for {}: {}", credential_id, e);

                    // Send notification on error
                    if let Err(ne) = Self::send_error_notification(&app_handle, &exchange, &e).await {
                        eprintln!("Failed to send notification: {}", ne);
                    }
                } else {
                    println!("Auto-sync completed successfully for {}", credential_id);
                }
            }
        });

        // Store the task handle
        let mut tasks = self.tasks.write().await;
        tasks.push(handle);
    }

    /// Perform a sync for a credential
    async fn perform_sync(app_handle: &AppHandle, credential_id: &str) -> Result<(), String> {
        let db = app_handle.state::<Database>();

        // Create sync config with auto_sync flag
        let config = SyncConfig {
            credential_id: credential_id.to_string(),
            start_date: None, // Will use last_sync_timestamp for smart sync
            end_date: None,   // Current time
            skip_duplicates: true,
            is_auto_sync: true,
        };

        // Call the sync command
        let result = crate::commands::sync_exchange_trades(
            db,
            config
        ).await?;

        // Only send notification if new trades were imported
        if result.imported > 0 {
            Self::send_success_notification(
                app_handle,
                credential_id,
                result.imported,
            ).await?;
        }

        Ok(())
    }

    /// Send success notification
    async fn send_success_notification(
        app_handle: &AppHandle,
        credential_id: &str,
        trades_count: i32,
    ) -> Result<(), String> {
        use tauri_plugin_notification::NotificationExt;

        let title = "Auto-Sync Complete";
        let body = format!("Imported {} new trade(s) for {}", trades_count, credential_id);

        app_handle
            .notification()
            .builder()
            .title(title)
            .body(&body)
            .show()
            .map_err(|e| e.to_string())?;

        Ok(())
    }

    /// Send error notification
    async fn send_error_notification(
        app_handle: &AppHandle,
        exchange: &str,
        error: &str,
    ) -> Result<(), String> {
        use tauri_plugin_notification::NotificationExt;

        let title = "Auto-Sync Failed";
        let body = format!("Failed to sync {}: {}", exchange, error);

        app_handle
            .notification()
            .builder()
            .title(title)
            .body(&body)
            .show()
            .map_err(|e| e.to_string())?;

        Ok(())
    }

    /// Stop all running tasks
    async fn stop_all_tasks(&self) {
        println!("Stopping all sync tasks...");
        let mut tasks = self.tasks.write().await;

        for task in tasks.drain(..) {
            task.abort();
        }

        println!("All sync tasks stopped");
    }

    /// Stop the scheduler
    #[allow(dead_code)]
    pub async fn stop(&self) {
        self.stop_all_tasks().await;
    }
}

impl Drop for SyncScheduler {
    fn drop(&mut self) {
        // Note: We can't await in Drop, so tasks will be aborted when the scheduler is dropped
        println!("SyncScheduler dropped");
    }
}
