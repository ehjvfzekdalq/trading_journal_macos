use tauri::State;
use crate::db::Database;
use crate::models::{
    ApiCredential, ApiCredentialInput, ApiCredentialSafe, ApiSyncHistory,
    SyncConfig, SyncResult, Trade,
};
use crate::api::{
    bitget::BitgetClient,
    blofin::BlofinClient,
    client::{ExchangeClient, FetchTradesRequest},
    credentials::{store_api_key, store_api_secret, store_passphrase, retrieve_api_key, retrieve_api_secret, retrieve_passphrase, delete_credentials},
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

    let now = Utc::now().timestamp();
    let id = input.id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let is_active = input.is_active.unwrap_or(true);

    // Store credentials in system keychain
    store_api_key(&id, &input.api_key).map_err(|e| e.to_string())?;
    store_api_secret(&id, &input.api_secret).map_err(|e| e.to_string())?;
    if let Some(ref passphrase) = input.passphrase {
        store_passphrase(&id, passphrase).map_err(|e| e.to_string())?;
    }

    // Store placeholder in database to maintain schema compatibility
    let placeholder_key = format!("KEYCHAIN:{}", id);
    let placeholder_secret = format!("KEYCHAIN:{}", id);
    let placeholder_passphrase = input.passphrase.as_ref().map(|_| format!("KEYCHAIN:{}", id));

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
                &placeholder_key,
                &placeholder_secret,
                &placeholder_passphrase,
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
                &placeholder_key,
                &placeholder_secret,
                &placeholder_passphrase,
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
            let id: String = row.get(0)?;
            // Retrieve from keychain instead of decrypting from database
            let api_key = retrieve_api_key(&id).unwrap_or_default();

            Ok(ApiCredentialSafe {
                id,
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

        // Fetch exchange type
        let exchange: String = conn
            .query_row(
                "SELECT exchange FROM api_credentials WHERE id = ?",
                [&credential_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("Credential not found: {}", e))?;

        // Retrieve credentials from system keychain
        let api_key = retrieve_api_key(&credential_id).map_err(|e| e.to_string())?;
        let api_secret = retrieve_api_secret(&credential_id).map_err(|e| e.to_string())?;
        let passphrase = retrieve_passphrase(&credential_id).unwrap_or_default();

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
    // Delete from system keychain first
    delete_credentials(&credential_id).map_err(|e| e.to_string())?;

    // Then delete from database
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

/// Sync trades from exchange
#[tauri::command]
pub async fn sync_exchange_trades(
    db: State<'_, Database>,
    config: SyncConfig,
) -> Result<SyncResult, String> {
    use crate::api::client::FetchTradesRequest;

    // Fetch and decrypt credentials
    let (exchange, api_key, api_secret, passphrase, portfolio_value, r_percent) = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;

        // Get credential
        let exchange: String = conn
            .query_row(
                "SELECT exchange FROM api_credentials WHERE id = ?",
                [&config.credential_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("Credential not found: {}", e))?;

        // Get current settings for portfolio value and r_percent
        let (portfolio, r): (f64, f64) = conn
            .query_row(
                "SELECT initial_capital, current_r_percent FROM settings WHERE id = 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|e| format!("Failed to load settings: {}", e))?;

        // Retrieve credentials from system keychain
        let api_key = retrieve_api_key(&config.credential_id).map_err(|e| e.to_string())?;
        let api_secret = retrieve_api_secret(&config.credential_id).map_err(|e| e.to_string())?;
        let passphrase = retrieve_passphrase(&config.credential_id).unwrap_or_default();

        (exchange, api_key, api_secret, passphrase, portfolio, r)
    };

    // Create exchange client
    let fetch_request = FetchTradesRequest {
        start_time: config.start_date,
        end_time: config.end_date,
        symbol: None,
        limit: None,
        cursor: None,
    };

    let response = match exchange.as_str() {
        "bitget" => {
            let client = BitgetClient::new(api_key, api_secret, passphrase);
            client.fetch_trades(fetch_request).await
        }
        "blofin" => {
            let client = BlofinClient::new(api_key, api_secret, passphrase);
            client.fetch_trades(fetch_request).await
        }
        _ => return Err(format!("Unsupported exchange: {}", exchange)),
    };

    let raw_trades = response.map_err(|e| e.to_string())?.trades;

    // Process trades
    let mut imported = 0;
    let mut duplicates = 0;
    let mut errors = Vec::new();
    let mut total_pnl = 0.0;

    let mut conn = db.conn.lock().map_err(|e| e.to_string())?;

    // Wrap the entire sync operation in a transaction
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    for raw_trade in raw_trades {
        // Generate fingerprint
        let fingerprint = format!(
            "api|{}|{}|{}|{}|{:.8}|{:.8}|{}",
            exchange,
            raw_trade.exchange_trade_id,
            raw_trade.exchange_order_id,
            raw_trade.symbol.to_lowercase(),
            raw_trade.quantity,
            raw_trade.pnl,
            raw_trade.timestamp
        );

        // Check for duplicate
        if config.skip_duplicates {
            let exists: bool = tx
                .query_row(
                    "SELECT COUNT(*) > 0 FROM trades WHERE import_fingerprint = ?",
                    [&fingerprint],
                    |row| row.get(0),
                )
                .unwrap_or(false);

            if exists {
                duplicates += 1;
                continue;
            }
        }

        // Map to Trade model
        match map_raw_trade_to_trade(&raw_trade, &exchange, portfolio_value, r_percent, &fingerprint) {
            Ok(trade) => {
                // Insert trade using transaction
                if let Err(e) = insert_trade_in_tx(&tx, &trade) {
                    errors.push(format!("Failed to insert trade {}: {}", raw_trade.exchange_trade_id, e));
                } else {
                    imported += 1;
                    if let Some(pnl) = trade.total_pnl {
                        total_pnl += pnl;
                    }
                }
            }
            Err(e) => {
                errors.push(format!("Failed to map trade {}: {}", raw_trade.exchange_trade_id, e));
            }
        }
    }

    // Create sync history record
    let now = Utc::now().timestamp();
    let sync_id = Uuid::new_v4().to_string();
    let status = if errors.is_empty() { "success" } else if imported > 0 { "partial" } else { "failed" };

    tx.execute(
        "INSERT INTO api_sync_history (id, credential_id, exchange, sync_type, last_sync_timestamp, trades_imported, trades_duplicated, status, error_message, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        rusqlite::params![
            &sync_id,
            &config.credential_id,
            &exchange,
            "manual",
            now,
            imported,
            duplicates,
            status,
            if errors.is_empty() { None } else { Some(errors.join("; ")) },
            now,
        ],
    )
    .map_err(|e| e.to_string())?;

    // Update last_sync_timestamp on credential
    tx.execute(
        "UPDATE api_credentials SET last_sync_timestamp = ?, updated_at = ? WHERE id = ?",
        rusqlite::params![now, now, &config.credential_id],
    )
    .map_err(|e| e.to_string())?;

    // Commit the transaction
    tx.commit().map_err(|e| e.to_string())?;

    Ok(SyncResult {
        imported,
        duplicates,
        errors,
        total_pnl: Some(total_pnl),
    })
}

/// Map RawTrade to Trade model with estimation logic
fn map_raw_trade_to_trade(
    raw: &crate::api::RawTrade,
    exchange: &str,
    portfolio_value: f64,
    r_percent: f64,
    fingerprint: &str,
) -> Result<Trade, String> {
    use uuid::Uuid;

    let position_type = raw.position_side.clone();
    let entry_price = raw.entry_price;
    let quantity = raw.quantity;

    // Calculate 1R based on portfolio
    let one_r = portfolio_value * r_percent;

    // Estimate stop loss distance: target_1R = portfolio * r_percent
    // sl_distance = 1R / quantity
    let sl_distance = one_r / quantity;

    // Calculate estimated SL
    let estimated_sl = if position_type == "LONG" {
        entry_price - sl_distance
    } else {
        entry_price + sl_distance
    };

    // Estimate leverage based on SL distance
    let sl_distance_pct = sl_distance / entry_price;
    let max_leverage = (1.0 / sl_distance_pct).floor() as i32;
    let leverage = max_leverage.max(1).min(20);

    // Calculate margin and position size
    let position_size = entry_price * quantity;
    let margin = position_size / leverage as f64;

    // Determine trade status
    let status = if raw.close_timestamp.is_some() {
        if raw.pnl > 1.0 {
            "WIN"
        } else if raw.pnl < -1.0 {
            "LOSS"
        } else {
            "BE"
        }
    } else {
        "OPEN"
    };

    // Create planned TPs (use exit price if available)
    let planned_tps = if let Some(exit_price) = raw.exit_price {
        serde_json::to_string(&vec![serde_json::json!({
            "price": exit_price,
            "percent": 100,
            "rr": 0.0
        })])
        .unwrap_or_else(|_| "[]".to_string())
    } else {
        "[]".to_string()
    };

    // Create exits JSON if closed
    let exits = if let Some(exit_price) = raw.exit_price {
        Some(
            serde_json::to_string(&vec![serde_json::json!({
                "price": exit_price,
                "percent": 100
            })])
            .unwrap_or_else(|_| "[]".to_string()),
        )
    } else {
        None
    };

    // Calculate RR
    let planned_weighted_rr = if position_type == "LONG" {
        raw.exit_price.map(|ep| (ep - entry_price) / sl_distance).unwrap_or(0.0)
    } else {
        raw.exit_price.map(|ep| (entry_price - ep) / sl_distance).unwrap_or(0.0)
    };

    // Calculate PnL in R
    let pnl_in_r = if one_r > 0.0 {
        Some(raw.pnl / one_r)
    } else {
        None
    };

    let now = Utc::now().timestamp();
    let trade_timestamp = raw.timestamp / 1000; // Convert ms to seconds

    Ok(Trade {
        id: Uuid::new_v4().to_string(),
        pair: raw.symbol.clone(),
        exchange: exchange.to_string(),
        analysis_date: trade_timestamp,
        trade_date: trade_timestamp,
        status: status.to_string(),
        portfolio_value,
        r_percent,
        min_rr: -100000000.0, // Sentinel value to bypass validation
        planned_pe: entry_price,
        planned_sl: estimated_sl,
        leverage,
        planned_tps,
        position_type,
        one_r,
        margin,
        position_size,
        quantity,
        planned_weighted_rr,
        effective_pe: Some(entry_price),
        close_date: raw.close_timestamp.map(|ts| ts / 1000),
        exits,
        effective_weighted_rr: Some(planned_weighted_rr),
        total_pnl: Some(raw.pnl),
        pnl_in_r,
        notes: format!("Imported from {} API", exchange),
        import_fingerprint: Some(fingerprint.to_string()),
        created_at: now,
        updated_at: now,
    })
}

/// Insert trade into database
fn insert_trade(conn: &rusqlite::Connection, trade: &Trade) -> Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT INTO trades (
            id, pair, exchange, analysis_date, trade_date, status,
            portfolio_value, r_percent, min_rr,
            planned_pe, planned_sl, leverage, planned_tps,
            position_type, one_r, margin, position_size, quantity, planned_weighted_rr,
            effective_pe, close_date, exits,
            effective_weighted_rr, total_pnl, pnl_in_r,
            notes, import_fingerprint, created_at, updated_at
        ) VALUES (
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?, ?
        )",
        rusqlite::params![
            trade.id,
            trade.pair,
            trade.exchange,
            trade.analysis_date,
            trade.trade_date,
            trade.status,
            trade.portfolio_value,
            trade.r_percent,
            trade.min_rr,
            trade.planned_pe,
            trade.planned_sl,
            trade.leverage,
            trade.planned_tps,
            trade.position_type,
            trade.one_r,
            trade.margin,
            trade.position_size,
            trade.quantity,
            trade.planned_weighted_rr,
            trade.effective_pe,
            trade.close_date,
            trade.exits,
            trade.effective_weighted_rr,
            trade.total_pnl,
            trade.pnl_in_r,
            trade.notes,
            trade.import_fingerprint,
            trade.created_at,
            trade.updated_at,
        ],
    )?;
    Ok(())
}

/// Insert trade into database within a transaction
fn insert_trade_in_tx(tx: &rusqlite::Transaction, trade: &Trade) -> Result<(), rusqlite::Error> {
    tx.execute(
        "INSERT INTO trades (
            id, pair, exchange, analysis_date, trade_date, status,
            portfolio_value, r_percent, min_rr,
            planned_pe, planned_sl, leverage, planned_tps,
            position_type, one_r, margin, position_size, quantity, planned_weighted_rr,
            effective_pe, close_date, exits,
            effective_weighted_rr, total_pnl, pnl_in_r,
            notes, import_fingerprint, created_at, updated_at
        ) VALUES (
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?, ?
        )",
        rusqlite::params![
            trade.id,
            trade.pair,
            trade.exchange,
            trade.analysis_date,
            trade.trade_date,
            trade.status,
            trade.portfolio_value,
            trade.r_percent,
            trade.min_rr,
            trade.planned_pe,
            trade.planned_sl,
            trade.leverage,
            trade.planned_tps,
            trade.position_type,
            trade.one_r,
            trade.margin,
            trade.position_size,
            trade.quantity,
            trade.planned_weighted_rr,
            trade.effective_pe,
            trade.close_date,
            trade.exits,
            trade.effective_weighted_rr,
            trade.total_pnl,
            trade.pnl_in_r,
            trade.notes,
            trade.import_fingerprint,
            trade.created_at,
            trade.updated_at,
        ],
    )?;
    Ok(())
}
