use crate::api::bitget::websocket::{BitgetWebSocketClient, PositionData, PositionEvent};
use crate::api::credentials::{retrieve_api_key, retrieve_api_secret, retrieve_passphrase};
use crate::db::Database;
use crate::models::Trade;
use chrono::Utc;
use rusqlite::Connection;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;
use uuid::Uuid;

/// Live trade mirror manager
pub struct LiveMirrorManager {
    active_connections: Arc<Mutex<HashMap<String, tokio::task::JoinHandle<()>>>>,
    tracked_positions: Arc<Mutex<HashMap<String, String>>>, // pos_id -> trade_id mapping
}

impl LiveMirrorManager {
    pub fn new() -> Self {
        Self {
            active_connections: Arc::new(Mutex::new(HashMap::new())),
            tracked_positions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Start live mirroring for a credential
    pub async fn start_mirroring(
        &self,
        credential_id: String,
        app_handle: AppHandle,
        db: Arc<Database>,
    ) -> Result<(), String> {
        // Check if already running
        let mut connections = self.active_connections.lock().await;
        if connections.contains_key(&credential_id) {
            return Err("Live mirroring already active for this credential".to_string());
        }

        // Retrieve credentials from keychain
        let api_key = retrieve_api_key(&credential_id).map_err(|e| e.to_string())?;
        let api_secret = retrieve_api_secret(&credential_id).map_err(|e| e.to_string())?;
        let passphrase = retrieve_passphrase(&credential_id).unwrap_or_default();

        // Get exchange type from database
        let exchange = {
            let conn = db.conn.lock().map_err(|e| e.to_string())?;
            conn.query_row(
                "SELECT exchange FROM api_credentials WHERE id = ?",
                [&credential_id],
                |row| row.get::<_, String>(0),
            )
            .map_err(|e| format!("Failed to get exchange: {}", e))?
        };

        if exchange != "bitget" {
            return Err(format!("Live mirroring not supported for {}", exchange));
        }

        // Create WebSocket client
        let ws_client = BitgetWebSocketClient::new(api_key, api_secret, passphrase);

        // Clone for the task
        let tracked_positions = Arc::clone(&self.tracked_positions);
        let app_handle_clone = app_handle.clone();
        let app_handle_for_error = app_handle.clone();
        let db_clone = Arc::clone(&db);
        let credential_id_clone = credential_id.clone();
        let credential_id_for_error = credential_id.clone();

        // Spawn WebSocket connection task
        let handle = tokio::spawn(async move {
            let result = ws_client
                .connect(move |event| {
                    let app_handle = app_handle_clone.clone();
                    let db = Arc::clone(&db_clone);
                    let tracked_positions = Arc::clone(&tracked_positions);
                    let credential_id = credential_id_clone.clone();

                    tokio::spawn(async move {
                        if let Err(e) = handle_position_event(
                            event,
                            &app_handle,
                            &db,
                            &tracked_positions,
                            &credential_id,
                        )
                        .await
                        {
                            eprintln!("Error handling position event: {}", e);
                            let _ = app_handle.emit(
                                "live-mirror-error",
                                format!("Error processing position: {}", e),
                            );
                        }
                    });
                })
                .await;

            if let Err(e) = result {
                eprintln!("WebSocket connection error: {}", e);
                let _ = app_handle_for_error.emit("live-mirror-disconnected", credential_id_for_error);
            }
        });

        connections.insert(credential_id.clone(), handle);

        // Emit event to frontend
        app_handle
            .emit("live-mirror-started", credential_id)
            .map_err(|e| e.to_string())?;

        Ok(())
    }

    /// Stop live mirroring for a credential
    pub async fn stop_mirroring(&self, credential_id: &str) -> Result<(), String> {
        let mut connections = self.active_connections.lock().await;

        if let Some(handle) = connections.remove(credential_id) {
            handle.abort();
            Ok(())
        } else {
            Err("No active mirroring found for this credential".to_string())
        }
    }

    /// Check if mirroring is active for a credential
    pub async fn is_active(&self, credential_id: &str) -> bool {
        let connections = self.active_connections.lock().await;
        connections.contains_key(credential_id)
    }

    /// Stop all mirroring connections
    #[allow(dead_code)]
    pub async fn stop_all(&self) {
        let mut connections = self.active_connections.lock().await;
        for (_, handle) in connections.drain() {
            handle.abort();
        }
    }
}

/// Handle position event and create/update trades
async fn handle_position_event(
    event: PositionEvent,
    app_handle: &AppHandle,
    db: &Arc<Database>,
    tracked_positions: &Arc<Mutex<HashMap<String, String>>>,
    credential_id: &str,
) -> Result<(), String> {
    match event {
        PositionEvent::Opened(position) => {
            // Create new trade
            let trade_id = create_live_trade(&position, db, credential_id).await?;

            // Track position
            let mut positions = tracked_positions.lock().await;
            positions.insert(position.pos_id.clone(), trade_id.clone());

            // Emit to frontend
            app_handle
                .emit("live-trade-opened", &trade_id)
                .map_err(|e| e.to_string())?;

            println!("Live trade opened: {} for position {}", trade_id, position.pos_id);
        }
        PositionEvent::Updated(position) => {
            // Update existing trade
            let positions = tracked_positions.lock().await;
            if let Some(trade_id) = positions.get(&position.pos_id) {
                update_live_trade(trade_id, &position, db).await?;

                // Emit to frontend
                app_handle
                    .emit("live-trade-updated", trade_id.clone())
                    .map_err(|e| e.to_string())?;

                println!("Live trade updated: {}", trade_id);
            }
        }
        PositionEvent::Closed(position) => {
            // Close trade
            let mut positions = tracked_positions.lock().await;
            if let Some(trade_id) = positions.remove(&position.pos_id) {
                close_live_trade(&trade_id, &position, db).await?;

                // Emit to frontend
                app_handle
                    .emit("live-trade-closed", trade_id.clone())
                    .map_err(|e| e.to_string())?;

                println!("Live trade closed: {}", trade_id);
            }
        }
    }

    Ok(())
}

/// Create a new live trade from position data
async fn create_live_trade(
    position: &PositionData,
    db: &Arc<Database>,
    credential_id: &str,
) -> Result<String, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // Get portfolio settings
    let (portfolio_value, r_percent): (f64, f64) = conn
        .query_row(
            "SELECT initial_capital, current_r_percent FROM settings WHERE id = 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| format!("Failed to load settings: {}", e))?;

    // Parse position data
    let entry_price: f64 = position
        .average_open_price
        .parse()
        .map_err(|e| format!("Invalid entry price: {}", e))?;
    let quantity: f64 = position
        .total
        .parse()
        .map_err(|e| format!("Invalid quantity: {}", e))?;
    let leverage: i32 = position
        .leverage
        .parse()
        .map_err(|e| format!("Invalid leverage: {}", e))?;
    let margin: f64 = position
        .margin_size
        .parse()
        .map_err(|e| format!("Invalid margin: {}", e))?;

    // Determine position type
    let position_type = match position.hold_side.as_str() {
        "long" => "LONG",
        "short" => "SHORT",
        _ => "LONG",
    };

    // Calculate 1R
    let one_r = portfolio_value * r_percent;

    // Estimate stop loss
    let sl_distance = one_r / quantity;
    let estimated_sl = if position_type == "LONG" {
        entry_price - sl_distance
    } else {
        entry_price + sl_distance
    };

    let position_size = entry_price * quantity;

    // Create trade
    let trade_id = Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();

    // Create fingerprint for deduplication
    let fingerprint = format!(
        "live|bitget|{}|{}|{}",
        position.pos_id, position.inst_id, position.c_time
    );

    let trade = Trade {
        id: trade_id.clone(),
        pair: position.inst_id.clone(),
        exchange: "bitget".to_string(),
        analysis_date: now,
        trade_date: now,
        status: "OPEN".to_string(),
        portfolio_value,
        r_percent,
        min_rr: 0.0, // Not applicable for live trades
        planned_pe: entry_price,
        planned_sl: estimated_sl,
        leverage,
        planned_tps: "[]".to_string(),
        planned_entries: Some(
            serde_json::to_string(&vec![serde_json::json!({"price": entry_price, "percent": 100})])
                .unwrap_or_default(),
        ),
        position_type: position_type.to_string(),
        one_r,
        margin,
        position_size,
        quantity,
        planned_weighted_rr: 0.0,
        effective_pe: Some(entry_price),
        effective_entries: Some(
            serde_json::to_string(&vec![serde_json::json!({"price": entry_price, "percent": 100})])
                .unwrap_or_default(),
        ),
        close_date: None,
        exits: None,
        effective_weighted_rr: None,
        total_pnl: None,
        pnl_in_r: None,
        notes: format!("Live trade - Auto-synced from Bitget (Credential: {})", credential_id),
        execution_portfolio: None,
        execution_r_percent: None,
        execution_margin: None,
        execution_position_size: None,
        execution_quantity: None,
        execution_one_r: None,
        execution_potential_profit: None,
        import_fingerprint: Some(fingerprint),
        import_source: "LIVE_MIRROR".to_string(),
        created_at: now,
        updated_at: now,
    };

    insert_trade(&conn, &trade).map_err(|e| format!("Failed to insert trade: {}", e))?;

    Ok(trade_id)
}

/// Update an existing live trade
async fn update_live_trade(
    trade_id: &str,
    position: &PositionData,
    db: &Arc<Database>,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let unrealized_pl: f64 = position
        .unrealized_pl
        .parse()
        .map_err(|e| format!("Invalid unrealized PL: {}", e))?;
    let _market_price: f64 = position
        .market_price
        .parse()
        .map_err(|e| format!("Invalid market price: {}", e))?;

    let now = Utc::now().timestamp();

    // Update trade with current PnL (still open)
    conn.execute(
        "UPDATE trades SET total_pnl = ?, updated_at = ? WHERE id = ?",
        rusqlite::params![unrealized_pl, now, trade_id],
    )
    .map_err(|e| format!("Failed to update trade: {}", e))?;

    Ok(())
}

/// Close a live trade
async fn close_live_trade(
    trade_id: &str,
    position: &PositionData,
    db: &Arc<Database>,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // Get trade data
    let (entry_price, _quantity, position_type, one_r): (f64, f64, String, f64) = conn
        .query_row(
            "SELECT planned_pe, quantity, position_type, one_r FROM trades WHERE id = ?",
            [trade_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map_err(|e| format!("Failed to get trade: {}", e))?;

    // Calculate exit price and PnL
    let achieved_profits: f64 = position
        .achieved_profits
        .parse()
        .map_err(|e| format!("Invalid achieved profits: {}", e))?;
    let market_price: f64 = position
        .market_price
        .parse()
        .map_err(|e| format!("Invalid market price: {}", e))?;

    let exit_price = market_price;
    let total_pnl = achieved_profits;

    // Calculate PnL in R
    let pnl_in_r = if one_r > 0.0 {
        total_pnl / one_r
    } else {
        0.0
    };

    // Determine status
    let status = if total_pnl > 1.0 {
        "WIN"
    } else if total_pnl < -1.0 {
        "LOSS"
    } else {
        "BE"
    };

    let now = Utc::now().timestamp();

    // Create exits JSON
    let exits = serde_json::to_string(&vec![serde_json::json!({
        "price": exit_price,
        "percent": 100
    })])
    .unwrap_or_else(|_| "[]".to_string());

    // Calculate effective weighted RR
    let sl_distance = (entry_price - exit_price).abs();
    let rr_distance = if position_type == "LONG" {
        exit_price - entry_price
    } else {
        entry_price - exit_price
    };
    let effective_weighted_rr = if sl_distance > 0.0 {
        rr_distance / sl_distance
    } else {
        0.0
    };

    // Update trade
    conn.execute(
        "UPDATE trades SET
            status = ?,
            close_date = ?,
            exits = ?,
            total_pnl = ?,
            pnl_in_r = ?,
            effective_weighted_rr = ?,
            updated_at = ?
         WHERE id = ?",
        rusqlite::params![
            status,
            now,
            exits,
            total_pnl,
            pnl_in_r,
            effective_weighted_rr,
            now,
            trade_id
        ],
    )
    .map_err(|e| format!("Failed to close trade: {}", e))?;

    Ok(())
}

/// Insert trade into database
fn insert_trade(conn: &Connection, trade: &Trade) -> Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT INTO trades (
            id, pair, exchange, analysis_date, trade_date, status,
            portfolio_value, r_percent, min_rr,
            planned_pe, planned_sl, leverage, planned_tps, planned_entries,
            position_type, one_r, margin, position_size, quantity, planned_weighted_rr,
            effective_pe, effective_entries, close_date, exits,
            effective_weighted_rr, total_pnl, pnl_in_r,
            notes, import_fingerprint, import_source, created_at, updated_at
        ) VALUES (
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?, ?, ?
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
            trade.planned_entries,
            trade.position_type,
            trade.one_r,
            trade.margin,
            trade.position_size,
            trade.quantity,
            trade.planned_weighted_rr,
            trade.effective_pe,
            trade.effective_entries,
            trade.close_date,
            trade.exits,
            trade.effective_weighted_rr,
            trade.total_pnl,
            trade.pnl_in_r,
            trade.notes,
            trade.import_fingerprint,
            trade.import_source,
            trade.created_at,
            trade.updated_at,
        ],
    )?;
    Ok(())
}
