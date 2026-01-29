use tauri::State;
use crate::db::Database;
use crate::models::{Trade, CreateTradeInput, TradeFilters};
use chrono::Utc;

#[tauri::command]
pub async fn get_trades(
    db: State<'_, Database>,
    filters: Option<TradeFilters>,
) -> Result<Vec<Trade>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut query = String::from("SELECT * FROM trades WHERE 1=1");
    let mut conditions = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(f) = &filters {
        if let Some(status) = &f.status {
            if status != "all" {
                conditions.push("status = ?");
                params.push(Box::new(status.clone()));
            }
        }
        if let Some(pair) = &f.pair {
            conditions.push("pair LIKE ?");
            params.push(Box::new(format!("%{}%", pair)));
        }
        if let Some(start_date) = f.start_date {
            conditions.push("trade_date >= ?");
            params.push(Box::new(start_date));
        }
        if let Some(end_date) = f.end_date {
            conditions.push("trade_date <= ?");
            params.push(Box::new(end_date));
        }
    }

    if !conditions.is_empty() {
        query.push_str(&format!(" AND {}", conditions.join(" AND ")));
    }

    query.push_str(" ORDER BY trade_date DESC");

    if let Some(f) = &filters {
        if let (Some(page), Some(limit)) = (f.page, f.limit) {
            let offset = (page - 1) * limit;
            query.push_str(" LIMIT ? OFFSET ?");
            params.push(Box::new(limit));
            params.push(Box::new(offset));
        }
    }

    let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let trades_iter = stmt.query_map(param_refs.as_slice(), |row| {
        Ok(Trade {
            id: row.get(0)?,
            pair: row.get(1)?,
            exchange: row.get(2)?,
            analysis_date: row.get(3)?,
            trade_date: row.get(4)?,
            status: row.get(5)?,
            portfolio_value: row.get(6)?,
            r_percent: row.get(7)?,
            min_rr: row.get(8)?,
            planned_pe: row.get(9)?,
            planned_sl: row.get(10)?,
            leverage: row.get(11)?,
            planned_tps: row.get(12)?,
            position_type: row.get(13)?,
            one_r: row.get(14)?,
            margin: row.get(15)?,
            position_size: row.get(16)?,
            quantity: row.get(17)?,
            planned_weighted_rr: row.get(18)?,
            effective_pe: row.get(19)?,
            close_date: row.get(20)?,
            exits: row.get(21)?,
            effective_weighted_rr: row.get(22)?,
            total_pnl: row.get(23)?,
            pnl_in_r: row.get(24)?,
            notes: row.get(25)?,
            import_fingerprint: row.get(26)?,
            created_at: row.get(27)?,
            updated_at: row.get(28)?,
        })
    }).map_err(|e| e.to_string())?;

    let trades: Result<Vec<Trade>, _> = trades_iter.collect();
    trades.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_trade(
    db: State<'_, Database>,
    id: String,
) -> Result<Trade, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let trade = conn.query_row(
        "SELECT * FROM trades WHERE id = ?",
        [&id],
        |row| {
            Ok(Trade {
                id: row.get(0)?,
                pair: row.get(1)?,
                exchange: row.get(2)?,
                analysis_date: row.get(3)?,
                trade_date: row.get(4)?,
                status: row.get(5)?,
                portfolio_value: row.get(6)?,
                r_percent: row.get(7)?,
                min_rr: row.get(8)?,
                planned_pe: row.get(9)?,
                planned_sl: row.get(10)?,
                leverage: row.get(11)?,
                planned_tps: row.get(12)?,
                position_type: row.get(13)?,
                one_r: row.get(14)?,
                margin: row.get(15)?,
                position_size: row.get(16)?,
                quantity: row.get(17)?,
                planned_weighted_rr: row.get(18)?,
                effective_pe: row.get(19)?,
                close_date: row.get(20)?,
                exits: row.get(21)?,
                effective_weighted_rr: row.get(22)?,
                total_pnl: row.get(23)?,
                pnl_in_r: row.get(24)?,
                notes: row.get(25)?,
                import_fingerprint: row.get(26)?,
                created_at: row.get(27)?,
                updated_at: row.get(28)?,
            })
        },
    ).map_err(|e| e.to_string())?;

    Ok(trade)
}

#[tauri::command]
pub async fn create_trade(
    db: State<'_, Database>,
    trade: CreateTradeInput,
) -> Result<Trade, String> {
    let id = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;

        let id = format!("TRADE-{}-{}", Utc::now().timestamp_millis(), uuid::Uuid::new_v4().to_string());
        let now = Utc::now().timestamp();

        conn.execute(
            "INSERT INTO trades (
                id, pair, exchange, analysis_date, trade_date, status,
                portfolio_value, r_percent, min_rr, planned_pe, planned_sl, leverage,
                planned_tps, position_type, one_r, margin, position_size, quantity,
                planned_weighted_rr, notes, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            rusqlite::params![
                id, trade.pair, trade.exchange, trade.analysis_date, trade.trade_date, trade.status,
                trade.portfolio_value, trade.r_percent, trade.min_rr, trade.planned_pe, trade.planned_sl, trade.leverage,
                trade.planned_tps, trade.position_type, trade.one_r, trade.margin, trade.position_size, trade.quantity,
                trade.planned_weighted_rr, trade.notes, now, now
            ],
        ).map_err(|e| e.to_string())?;

        id
    };

    get_trade(db, id).await
}

#[tauri::command]
pub async fn delete_trade(
    db: State<'_, Database>,
    id: String,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM trades WHERE id = ?", [&id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn update_trade(
    db: State<'_, Database>,
    id: String,
    trade_update: serde_json::Value,
) -> Result<Trade, String> {
    {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;

        let now = Utc::now().timestamp();

        // Build dynamic UPDATE query based on provided fields
        let mut updates = vec!["updated_at = ?"];
        let mut values: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(now)];

        if let Some(status) = trade_update.get("status").and_then(|v| v.as_str()) {
            updates.push("status = ?");
            values.push(Box::new(status.to_string()));
        }
        if let Some(effective_pe) = trade_update.get("effective_pe").and_then(|v| v.as_f64()) {
            updates.push("effective_pe = ?");
            values.push(Box::new(effective_pe));
        }
        if let Some(close_date) = trade_update.get("close_date").and_then(|v| v.as_i64()) {
            updates.push("close_date = ?");
            values.push(Box::new(close_date));
        }
        if let Some(exits) = trade_update.get("exits").and_then(|v| v.as_str()) {
            updates.push("exits = ?");
            values.push(Box::new(exits.to_string()));
        }
        if let Some(total_pnl) = trade_update.get("total_pnl").and_then(|v| v.as_f64()) {
            updates.push("total_pnl = ?");
            values.push(Box::new(total_pnl));
        }
        if let Some(pnl_in_r) = trade_update.get("pnl_in_r").and_then(|v| v.as_f64()) {
            updates.push("pnl_in_r = ?");
            values.push(Box::new(pnl_in_r));
        }
        if let Some(effective_rr) = trade_update.get("effective_rr").and_then(|v| v.as_f64()) {
            updates.push("effective_weighted_rr = ?");
            values.push(Box::new(effective_rr));
        }
        if let Some(notes) = trade_update.get("notes").and_then(|v| v.as_str()) {
            updates.push("notes = ?");
            values.push(Box::new(notes.to_string()));
        }

        let query = format!("UPDATE trades SET {} WHERE id = ?", updates.join(", "));
        values.push(Box::new(id.clone()));

        let params: Vec<&dyn rusqlite::ToSql> = values.iter().map(|v| v.as_ref()).collect();
        conn.execute(&query, params.as_slice()).map_err(|e| e.to_string())?;
    }

    get_trade(db, id).await
}

#[tauri::command]
pub async fn duplicate_trade(
    db: State<'_, Database>,
    id: String,
) -> Result<Trade, String> {
    let original = get_trade(db.clone(), id).await?;

    let new_id = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;

        let new_id = format!("TRADE-{}-{}", Utc::now().timestamp_millis(), uuid::Uuid::new_v4().to_string());
        let now = Utc::now().timestamp();

        // Copy trade but reset to OPEN status and clear execution data
        let notes = if original.notes.is_empty() {
            "(Copy)".to_string()
        } else {
            format!("{} (Copy)", original.notes)
        };

        conn.execute(
            "INSERT INTO trades (
                id, pair, exchange, analysis_date, trade_date, status,
                portfolio_value, r_percent, min_rr, planned_pe, planned_sl, leverage,
                planned_tps, position_type, one_r, margin, position_size, quantity,
                planned_weighted_rr, notes, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            rusqlite::params![
                new_id, original.pair, original.exchange, original.analysis_date, now, "OPEN",
                original.portfolio_value, original.r_percent, original.min_rr,
                original.planned_pe, original.planned_sl, original.leverage,
                original.planned_tps, original.position_type, original.one_r,
                original.margin, original.position_size, original.quantity,
                original.planned_weighted_rr, notes, now, now
            ],
        ).map_err(|e| e.to_string())?;

        new_id
    };

    get_trade(db, new_id).await
}

#[tauri::command]
pub async fn delete_all_trades(
    db: State<'_, Database>,
) -> Result<usize, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let count = conn.execute("DELETE FROM trades", [])
        .map_err(|e| e.to_string())?;
    Ok(count)
}
