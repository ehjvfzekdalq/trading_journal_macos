use tauri::State;
use crate::db::Database;
use crate::models::{Trade, Settings};
use chrono::Utc;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct ImportPreview {
    pub pair: String,
    pub position_type: String,
    pub entry_price: f64,
    pub exit_price: f64,
    pub quantity: f64,
    pub realized_pnl: f64,
    pub opening_time: String,
    pub closing_time: String,
    pub total_fees: f64,
    pub fingerprint: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ImportResult {
    pub imported: usize,
    pub duplicates: usize,
    pub errors: Vec<String>,
}

/// Parse BitGet CSV and return preview of trades
#[tauri::command]
pub async fn preview_bitget_import(
    csv_content: String,
    _portfolio: f64,
    _r_percent: f64,
) -> Result<Vec<ImportPreview>, String> {
    let mut previews = Vec::new();
    let lines: Vec<&str> = csv_content.lines().collect();

    // Skip header
    for (line_num, line) in lines.iter().enumerate().skip(1) {
        if line.trim().is_empty() {
            continue;
        }

        match parse_bitget_line(line) {
            Ok(trade_data) => {
                let fingerprint = generate_fingerprint(&trade_data);
                previews.push(ImportPreview {
                    pair: trade_data.pair,
                    position_type: trade_data.position_type,
                    entry_price: trade_data.entry_price,
                    exit_price: trade_data.exit_price,
                    quantity: trade_data.quantity,
                    realized_pnl: trade_data.realized_pnl,
                    opening_time: trade_data.opening_time,
                    closing_time: trade_data.closing_time,
                    total_fees: trade_data.total_fees,
                    fingerprint,
                });
            }
            Err(e) => {
                eprintln!("Error parsing line {}: {}", line_num + 1, e);
            }
        }
    }

    Ok(previews)
}

/// Import BitGet CSV trades into database
#[tauri::command]
pub async fn import_bitget_csv(
    db: State<'_, Database>,
    csv_content: String,
    portfolio: f64,
    r_percent: f64,
) -> Result<ImportResult, String> {
    let lines: Vec<&str> = csv_content.lines().collect();
    let mut imported = 0;
    let mut duplicates = 0;
    let mut errors = Vec::new();

    {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;

        // Skip header
        for (line_num, line) in lines.iter().enumerate().skip(1) {
            if line.trim().is_empty() {
                continue;
            }

            match parse_bitget_line(line) {
                Ok(trade_data) => {
                    let fingerprint = generate_fingerprint(&trade_data);

                    // Check for duplicate
                    let exists: bool = conn
                        .query_row(
                            "SELECT EXISTS(SELECT 1 FROM trades WHERE import_fingerprint = ?)",
                            [&fingerprint],
                            |row| row.get(0),
                        )
                        .unwrap_or(false);

                    if exists {
                        duplicates += 1;
                        continue;
                    }

                    // Create trade
                    let id = format!(
                        "TRADE-{}-{}",
                        Utc::now().timestamp_millis(),
                        uuid::Uuid::new_v4().to_string().split('-').next().unwrap()
                    );
                    let now = Utc::now().timestamp();

                    // Estimate stop loss and calculate metrics
                    let one_r = portfolio * r_percent;
                    let position_size = trade_data.quantity * trade_data.entry_price;

                    // Estimate SL
                    let target_sl_distance = one_r / trade_data.quantity;
                    let estimated_sl = if trade_data.position_type == "LONG" {
                        trade_data.entry_price - target_sl_distance
                    } else {
                        trade_data.entry_price + target_sl_distance
                    };

                    // Calculate leverage
                    let sl_distance_pct = (trade_data.entry_price - estimated_sl).abs() / trade_data.entry_price;
                    let max_leverage = (1.0 / sl_distance_pct).floor().max(1.0).min(20.0) as i64;
                    let leverage = max_leverage.min(20);
                    let margin = position_size / leverage as f64;

                    // Determine status
                    let status = if trade_data.realized_pnl > 1.0 {
                        "WIN"
                    } else if trade_data.realized_pnl < -1.0 {
                        "LOSS"
                    } else {
                        "BE"
                    };

                    let planned_tps = serde_json::json!([{
                        "price": trade_data.exit_price,
                        "percent": 1.0,
                        "rr": 0.0
                    }])
                    .to_string();

                    let exits = serde_json::json!([{
                        "price": trade_data.exit_price,
                        "percent": 1.0
                    }])
                    .to_string();

                    let notes = format!(
                        "Imported from BitGet | Fees: ${:.2} | Note: RR metrics unavailable (no SL data from BitGet)",
                        trade_data.total_fees
                    );

                    // Parse dates
                    let opening_timestamp = chrono::DateTime::parse_from_rfc3339(&format!("{}Z", trade_data.opening_time.replace(' ', "T")))
                        .map(|dt| dt.timestamp())
                        .unwrap_or(now);

                    let closing_timestamp = chrono::DateTime::parse_from_rfc3339(&format!("{}Z", trade_data.closing_time.replace(' ', "T")))
                        .map(|dt| dt.timestamp())
                        .unwrap_or(now);

                    conn.execute(
                        "INSERT INTO trades (
                            id, pair, exchange, analysis_date, trade_date, close_date, status,
                            portfolio_value, r_percent, min_rr,
                            planned_pe, planned_sl, leverage, planned_tps, planned_entries,
                            position_type, one_r, margin, position_size, quantity,
                            planned_weighted_rr, effective_pe, effective_entries, exits, total_pnl,
                            notes, import_fingerprint, import_source, created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        rusqlite::params![
                            id,
                            trade_data.pair,
                            "BitGet",
                            opening_timestamp,
                            opening_timestamp,
                            closing_timestamp,
                            status,
                            portfolio,
                            r_percent,
                            0.0, // Not applicable for CSV imports - validation skipped via import_source
                            trade_data.entry_price,
                            estimated_sl,
                            leverage,
                            planned_tps,
                            serde_json::to_string(&vec![serde_json::json!({"price": trade_data.entry_price, "percent": 100})]).ok(),
                            trade_data.position_type,
                            one_r,
                            margin,
                            position_size,
                            trade_data.quantity,
                            0.0, // No planned RR for imports
                            trade_data.entry_price,
                            serde_json::to_string(&vec![serde_json::json!({"price": trade_data.entry_price, "percent": 100})]).ok(),
                            exits,
                            trade_data.realized_pnl,
                            notes,
                            fingerprint,
                            "CSV_IMPORT",
                            now,
                            now,
                        ],
                    )
                    .map_err(|e| e.to_string())?;

                    imported += 1;
                }
                Err(e) => {
                    errors.push(format!("Line {}: {}", line_num + 1, e));
                }
            }
        }
    }

    Ok(ImportResult {
        imported,
        duplicates,
        errors,
    })
}

/// Delete all BitGet imported trades (both CSV and API imports)
#[tauri::command]
pub async fn delete_bitget_trades(db: State<'_, Database>) -> Result<usize, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let count = conn
        .execute(
            "DELETE FROM trades WHERE import_fingerprint LIKE 'csv|bitget|%' OR import_fingerprint LIKE 'api|bitget|%'",
            [],
        )
        .map_err(|e| e.to_string())?;
    Ok(count)
}

// Helper structures and functions

struct BitGetTradeData {
    pair: String,
    position_type: String,
    entry_price: f64,
    exit_price: f64,
    quantity: f64,
    realized_pnl: f64,
    opening_time: String,
    closing_time: String,
    total_fees: f64,
}

fn parse_bitget_line(line: &str) -> Result<BitGetTradeData, String> {
    // Remove BOM if present
    let clean_line = line.trim_start_matches('\u{feff}');
    let fields: Vec<&str> = clean_line.split(',').map(|f| f.trim()).collect();

    if fields.len() < 12 {
        return Err(format!("Invalid CSV line: expected 12 fields, got {}", fields.len()));
    }

    // Parse futures field (e.g., "INJUSDT Short·Isolated")
    let (pair, position_type) = parse_futures_field(fields[0])?;

    // Parse numeric values
    let entry_price = fields[2].parse::<f64>().map_err(|e| e.to_string())?;
    let exit_price = fields[3].parse::<f64>().map_err(|e| e.to_string())?;
    let quantity = parse_numeric_value(fields[4])?;
    let realized_pnl = parse_numeric_value(fields[7])?;
    let opening_fee = parse_numeric_value(fields[9])?.abs();
    let closing_fee = parse_numeric_value(fields[10])?.abs();
    let total_fees = opening_fee + closing_fee;

    Ok(BitGetTradeData {
        pair,
        position_type,
        entry_price,
        exit_price,
        quantity,
        realized_pnl,
        opening_time: fields[1].to_string(),
        closing_time: fields[11].to_string(),
        total_fees,
    })
}

fn parse_futures_field(futures: &str) -> Result<(String, String), String> {
    // Match "INJUSDT Short" or "INJUSDT Long"
    let re = regex::Regex::new(r"^([A-Z0-9]+USDT)\s+(Long|Short)").map_err(|e| e.to_string())?;
    let caps = re.captures(futures).ok_or("Invalid futures format")?;

    let raw_pair = caps.get(1).unwrap().as_str();
    let position_type = caps.get(2).unwrap().as_str().to_uppercase();

    // Convert "INJUSDT" to "INJ/USDT"
    let pair = raw_pair.replace("USDT", "/USDT");

    Ok((pair, position_type))
}

fn parse_numeric_value(value: &str) -> Result<f64, String> {
    // Extract number from string like "1645.2INJ" or "-90.354USDT"
    let re = regex::Regex::new(r"^(-?\d+\.?\d*)").map_err(|e| e.to_string())?;
    let caps = re.captures(value).ok_or("No numeric value found")?;
    let num_str = caps.get(1).unwrap().as_str();
    num_str.parse::<f64>().map_err(|e| e.to_string())
}

fn generate_fingerprint(trade: &BitGetTradeData) -> String {
    format!(
        "csv|bitget|{}|{}|{}|{}|{:.8}|{:.8}",
        trade.pair.to_lowercase(),
        trade.position_type.to_lowercase(),
        trade.opening_time,
        trade.closing_time,
        trade.quantity,
        trade.realized_pnl
    )
}

// Data Export/Import

#[derive(Debug, Serialize, Deserialize)]
pub struct BackupData {
    pub settings: Settings,
    pub trades: Vec<Trade>,
    pub export_date: String,
    pub version: String,
}

/// Export all data to JSON
#[tauri::command]
pub async fn export_all_data(db: State<'_, Database>) -> Result<String, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // Get settings
    let settings = conn
        .query_row(
            "SELECT id, initial_capital, current_r_percent, default_min_rr, default_leverage, currency, created_at, updated_at FROM settings WHERE id = 1",
            [],
            |row| {
                Ok(Settings {
                    id: row.get(0)?,
                    initial_capital: row.get(1)?,
                    current_r_percent: row.get(2)?,
                    default_min_rr: row.get(3)?,
                    default_leverage: row.get(4)?,
                    currency: row.get(5)?,
                    created_at: row.get(6)?,
                    updated_at: row.get(7)?,
                })
            },
        )
        .map_err(|e| e.to_string())?;

    // Get all trades
    let mut stmt = conn
        .prepare(
            "SELECT id, pair, exchange, analysis_date, trade_date, close_date, status, portfolio_value, r_percent, min_rr, planned_pe, planned_sl, leverage, planned_tps, planned_entries, position_type, one_r, margin, position_size, quantity, planned_weighted_rr, effective_pe, effective_entries, exits, effective_weighted_rr, total_pnl, pnl_in_r, notes, import_fingerprint, import_source, created_at, updated_at FROM trades ORDER BY trade_date DESC",
        )
        .map_err(|e| e.to_string())?;

    let trades = stmt
        .query_map([], |row| {
            Ok(Trade {
                id: row.get(0)?,
                pair: row.get(1)?,
                exchange: row.get(2)?,
                analysis_date: row.get(3)?,
                trade_date: row.get(4)?,
                close_date: row.get(5).ok(),
                status: row.get(6)?,
                portfolio_value: row.get(7)?,
                r_percent: row.get(8)?,
                min_rr: row.get(9)?,
                planned_pe: row.get(10)?,
                planned_sl: row.get(11)?,
                leverage: row.get(12)?,
                planned_tps: row.get(13)?,
                planned_entries: row.get(14).ok(),
                position_type: row.get(15)?,
                one_r: row.get(16)?,
                margin: row.get(17)?,
                position_size: row.get(18)?,
                quantity: row.get(19)?,
                planned_weighted_rr: row.get(20)?,
                effective_pe: row.get(21).ok(),
                effective_entries: row.get(22).ok(),
                exits: row.get(23).ok(),
                effective_weighted_rr: row.get(24).ok(),
                total_pnl: row.get(25).ok(),
                pnl_in_r: row.get(26).ok(),
                notes: row.get(27)?,
                execution_portfolio: row.get(28).ok(),
                execution_r_percent: row.get(29).ok(),
                execution_margin: row.get(30).ok(),
                execution_position_size: row.get(31).ok(),
                execution_quantity: row.get(32).ok(),
                execution_one_r: row.get(33).ok(),
                execution_potential_profit: row.get(34).ok(),
                import_fingerprint: row.get(35).ok(),
                import_source: row.get(36)?,
                created_at: row.get(37)?,
                updated_at: row.get(38)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<Trade>, _>>()
        .map_err(|e| e.to_string())?;

    let backup = BackupData {
        settings,
        trades,
        export_date: Utc::now().to_rfc3339(),
        version: "1.0.0".to_string(),
    };

    serde_json::to_string_pretty(&backup).map_err(|e| e.to_string())
}

/// Import data from JSON backup
#[tauri::command]
pub async fn import_all_data(
    db: State<'_, Database>,
    json_data: String,
) -> Result<(usize, usize), String> {
    let backup: BackupData = serde_json::from_str(&json_data).map_err(|e| e.to_string())?;

    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // Update settings
    conn.execute(
        "UPDATE settings SET initial_capital = ?, current_r_percent = ?, default_min_rr = ?, default_leverage = ?, currency = ?, updated_at = ? WHERE id = 1",
        rusqlite::params![
            backup.settings.initial_capital,
            backup.settings.current_r_percent,
            backup.settings.default_min_rr,
            backup.settings.default_leverage,
            backup.settings.currency,
            Utc::now().timestamp(),
        ],
    )
    .map_err(|e| e.to_string())?;

    let mut imported_trades = 0;

    // Import trades (use REPLACE to overwrite existing trades)
    for trade in backup.trades {
        conn.execute(
            "REPLACE INTO trades (id, pair, exchange, analysis_date, trade_date, close_date, status, portfolio_value, r_percent, min_rr, planned_pe, planned_sl, leverage, planned_tps, planned_entries, position_type, one_r, margin, position_size, quantity, planned_weighted_rr, effective_pe, effective_entries, exits, effective_weighted_rr, total_pnl, pnl_in_r, notes, import_fingerprint, import_source, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            rusqlite::params![
                trade.id,
                trade.pair,
                trade.exchange,
                trade.analysis_date,
                trade.trade_date,
                trade.close_date,
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
                trade.exits,
                trade.effective_weighted_rr,
                trade.total_pnl,
                trade.pnl_in_r,
                trade.notes,
                trade.import_fingerprint,
                trade.import_source,
                trade.created_at,
                trade.updated_at,
                None::<i64>, // deleted_at is NULL for imported trades
            ],
        )
        .map_err(|e| e.to_string())?;

        imported_trades += 1;
    }

    Ok((1, imported_trades)) // (settings_updated, trades_imported)
}
