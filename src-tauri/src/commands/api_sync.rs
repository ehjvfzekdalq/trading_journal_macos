use tauri::State;
use crate::db::Database;
use crate::models::{
    ApiCredential, ApiCredentialInput, ApiCredentialSafe, ApiSyncHistory,
    SyncConfig, SyncResult,
};
use crate::api::{
    bitget::BitgetClient,
    blofin::BlofinClient,
    client::{ExchangeClient, FetchTradesRequest},
    credentials::{encrypt_credential, decrypt_credential},
};
use chrono::Utc;
use uuid::Uuid;

/// Save or update API credentials
#[tauri::command]
pub async fn save_api_credentials(
    db: State<'_, Database>,
    input: ApiCredentialInput,
) -> Result<ApiCredentialSafe, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // Encrypt credentials
    let encrypted_key = encrypt_credential(&input.api_key).map_err(|e| e.to_string())?;
    let encrypted_secret = encrypt_credential(&input.api_secret).map_err(|e| e.to_string())?;
    let encrypted_passphrase = input.passphrase
        .as_ref()
        .map(|p| encrypt_credential(p))
        .transpose()
        .map_err(|e| e.to_string())?;

    let now = Utc::now().timestamp();
    let id = input.id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let is_active = input.is_active.unwrap_or(true);

    // Check if updating existing
    let exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM api_credentials WHERE id = ?",
            [&id],
            |row| row.get(0),
        )
        .map(|count: i32| count > 0)
        .unwrap_or(false);

    if exists {
        // Update
        conn.execute(
            "UPDATE api_credentials SET
                exchange = ?, label = ?, api_key = ?, api_secret = ?,
                passphrase = ?, is_active = ?, updated_at = ?
             WHERE id = ?",
            rusqlite::params![
                &input.exchange,
                &input.label,
                &encrypted_key,
                &encrypted_secret,
                &encrypted_passphrase,
                is_active as i32,
                now,
                &id,
            ],
        )
        .map_err(|e| e.to_string())?;
    } else {
        // Insert
        conn.execute(
            "INSERT INTO api_credentials
                (id, exchange, label, api_key, api_secret, passphrase, is_active, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            rusqlite::params![
                &id,
                &input.exchange,
                &input.label,
                &encrypted_key,
                &encrypted_secret,
                &encrypted_passphrase,
                is_active as i32,
                now,
                now,
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    // Return safe version
    let credential = ApiCredential {
        id: id.clone(),
        exchange: input.exchange.clone(),
        label: input.label.clone(),
        api_key: input.api_key.clone(),
        api_key_preview: ApiCredential::create_preview(&input.api_key),
        api_secret: input.api_secret.clone(),
        passphrase: input.passphrase.clone(),
        is_active,
        last_sync_timestamp: None,
        created_at: now,
        updated_at: now,
    };

    Ok(credential.to_safe())
}

/// List all API credentials
#[tauri::command]
pub async fn list_api_credentials(
    db: State<'_, Database>,
) -> Result<Vec<ApiCredentialSafe>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, exchange, label, api_key, is_active, last_sync_timestamp, created_at, updated_at FROM api_credentials ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;

    let credentials_iter = stmt
        .query_map([], |row| {
            let encrypted_key: String = row.get(3)?;
            let api_key = decrypt_credential(&encrypted_key).unwrap_or_default();

            Ok(ApiCredentialSafe {
                id: row.get(0)?,
                exchange: row.get(1)?,
                label: row.get(2)?,
                api_key_preview: ApiCredential::create_preview(&api_key),
                is_active: row.get::<_, i32>(4)? == 1,
                last_sync_timestamp: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let credentials: Result<Vec<ApiCredentialSafe>, _> = credentials_iter.collect();
    credentials.map_err(|e| e.to_string())
}

/// Test API credentials
#[tauri::command]
pub async fn test_api_credentials(
    db: State<'_, Database>,
    credential_id: String,
) -> Result<bool, String> {
    // Fetch and decrypt credentials (in scope block to drop conn before await)
    let (exchange, api_key, api_secret, passphrase) = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;

        // Fetch credential
        let (exchange, encrypted_key, encrypted_secret, encrypted_passphrase): (String, String, String, Option<String>) = conn
            .query_row(
                "SELECT exchange, api_key, api_secret, passphrase FROM api_credentials WHERE id = ?",
                [&credential_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .map_err(|e| format!("Credential not found: {}", e))?;

        // Decrypt
        let api_key = decrypt_credential(&encrypted_key).map_err(|e| e.to_string())?;
        let api_secret = decrypt_credential(&encrypted_secret).map_err(|e| e.to_string())?;
        let passphrase = encrypted_passphrase
            .as_ref()
            .map(|p| decrypt_credential(p))
            .transpose()
            .map_err(|e| e.to_string())?
            .unwrap_or_default();

        (exchange, api_key, api_secret, passphrase)
    }; // conn is dropped here

    // Create client and test
    let result = match exchange.as_str() {
        "bitget" => {
            let client = BitgetClient::new(api_key, api_secret, passphrase);
            client.test_credentials().await
        }
        "blofin" => {
            let client = BlofinClient::new(api_key, api_secret, passphrase);
            client.test_credentials().await
        }
        _ => return Err(format!("Unsupported exchange: {}", exchange)),
    };

    result.map_err(|e| e.to_string())
}

/// Delete API credentials
#[tauri::command]
pub async fn delete_api_credentials(
    db: State<'_, Database>,
    credential_id: String,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "DELETE FROM api_credentials WHERE id = ?",
        [&credential_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Update API credentials active status
#[tauri::command]
pub async fn update_api_credentials_status(
    db: State<'_, Database>,
    credential_id: String,
    is_active: bool,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let now = Utc::now().timestamp();

    conn.execute(
        "UPDATE api_credentials SET is_active = ?, updated_at = ? WHERE id = ?",
        rusqlite::params![is_active as i32, now, &credential_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Get sync history for a credential
#[tauri::command]
pub async fn get_sync_history(
    db: State<'_, Database>,
    credential_id: String,
) -> Result<Vec<ApiSyncHistory>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, credential_id, exchange, sync_type, last_sync_timestamp,
                    trades_imported, trades_duplicated, last_trade_id, status, error_message, created_at
             FROM api_sync_history
             WHERE credential_id = ?
             ORDER BY created_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let history_iter = stmt
        .query_map([&credential_id], |row| {
            Ok(ApiSyncHistory {
                id: row.get(0)?,
                credential_id: row.get(1)?,
                exchange: row.get(2)?,
                sync_type: row.get(3)?,
                last_sync_timestamp: row.get(4)?,
                trades_imported: row.get(5)?,
                trades_duplicated: row.get(6)?,
                last_trade_id: row.get(7)?,
                status: row.get(8)?,
                error_message: row.get(9)?,
                created_at: row.get(10)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let history: Result<Vec<ApiSyncHistory>, _> = history_iter.collect();
    history.map_err(|e| e.to_string())
}

/// Sync trades from exchange (placeholder - will be implemented in next step)
#[tauri::command]
pub async fn sync_exchange_trades(
    _db: State<'_, Database>,
    _config: SyncConfig,
) -> Result<SyncResult, String> {
    // This will be a complex function that:
    // 1. Fetches credential
    // 2. Creates exchange client
    // 3. Fetches trades from API
    // 4. Maps to Trade model with estimation logic
    // 5. Checks for duplicates
    // 6. Inserts into database
    // 7. Creates sync history record

    // For now, return placeholder
    Ok(SyncResult {
        imported: 0,
        duplicates: 0,
        errors: vec!["Not yet implemented".to_string()],
        total_pnl: None,
    })
}
