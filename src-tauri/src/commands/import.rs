use tauri::State;
use crate::db::Database;
use crate::models::{Trade, Settings};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use calamine::{open_workbook, Data, Reader, Xlsx};

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
                        uuid::Uuid::new_v4().to_string().split('-').next()
                            .ok_or("Failed to generate trade ID from UUID")?
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

                    // Calculate leverage (capped at 125x, standard exchange maximum)
                    let sl_distance_pct = (trade_data.entry_price - estimated_sl).abs() / trade_data.entry_price;
                    let max_leverage = (1.0 / sl_distance_pct).floor().max(1.0).min(125.0) as i64;
                    let leverage = max_leverage.min(125);
                    let margin = position_size / leverage as f64;

                    // Determine status (using $0.50 threshold to match UI logic)
                    let status = if trade_data.realized_pnl > 0.5 {
                        "WIN"
                    } else if trade_data.realized_pnl < -0.5 {
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
                        "percent": 100.0
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

    let raw_pair = caps.get(1)
        .ok_or("Invalid futures format: missing pair")?
        .as_str();
    let position_type = caps.get(2)
        .ok_or("Invalid futures format: missing position type")?
        .as_str()
        .to_uppercase();

    // Convert "INJUSDT" to "INJ/USDT"
    let pair = raw_pair.replace("USDT", "/USDT");

    Ok((pair, position_type))
}

fn parse_numeric_value(value: &str) -> Result<f64, String> {
    // Extract number from string like "1645.2INJ" or "-90.354USDT"
    let re = regex::Regex::new(r"^(-?\d+\.?\d*)").map_err(|e| e.to_string())?;
    let caps = re.captures(value).ok_or("No numeric value found")?;
    let num_str = caps.get(1)
        .ok_or("Failed to extract numeric value from regex capture")?
        .as_str();
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

// ─── BloFin CSV Import ────────────────────────────────────────────────────────

/// A single filled order row from BloFin order history CSV
#[derive(Debug, Clone)]
struct BlofinOrder {
    asset: String,        // e.g. "BTCUSDT"
    margin_mode: String,  // "Cross" | "Isolated"
    leverage: i64,
    order_time: String,   // ISO-like "YYYY-MM-DD HH:MM:SS"
    side: String,         // "Buy", "Sell", "Buy(SL)", "Sell(TP)", etc.
    avg_fill: f64,
    filled_qty: f64,
    pnl: f64,
    fee: f64,
    is_reduce_only: bool,
}

/// Aggregated position produced by grouping BloFin orders
struct BlofinPositionData {
    pair: String,
    position_type: String, // "LONG" | "SHORT"
    margin_mode: String,
    leverage: i64,
    entry_price: f64,   // weighted average
    exit_price: f64,    // weighted average
    quantity: f64,      // total entry quantity
    realized_pnl: f64,
    total_fees: f64,
    opening_time: String,
    closing_time: String,
    entries_json: String,
    exits_json: String,
}

struct OpenBlofinPosition {
    pair: String,
    position_type: String,
    margin_mode: String,
    leverage: i64,
    entry_qty: f64,
    exit_qty: f64,
    entry_price_sum: f64, // Σ(price × qty) for weighted avg
    exit_price_sum: f64,
    total_pnl: f64,
    total_fees: f64,
    opening_time: String,
    closing_time: String,
    entry_orders: Vec<(f64, f64)>, // (avg_fill, qty)
    exit_orders: Vec<(f64, f64)>,
}

fn parse_blofin_datetime(s: &str) -> Result<String, String> {
    // "02/19/2026 02:22:08" → "2026-02-19 02:22:08"
    let parts: Vec<&str> = s.split_whitespace().collect();
    if parts.len() != 2 {
        return Err(format!("Invalid datetime: {}", s));
    }
    let d: Vec<&str> = parts[0].split('/').collect();
    if d.len() != 3 {
        return Err(format!("Invalid date: {}", parts[0]));
    }
    Ok(format!("{}-{}-{} {}", d[2], d[0], d[1], parts[1]))
}

fn parse_blofin_price(s: &str) -> f64 {
    // "66624.2 USDT" → 66624.2, "Market" | "--" → 0.0
    let s = s.trim();
    if s == "Market" || s == "--" || s.is_empty() {
        return 0.0;
    }
    s.split_whitespace()
        .next()
        .and_then(|n| n.parse::<f64>().ok())
        .unwrap_or(0.0)
}

fn parse_blofin_qty(s: &str) -> Result<f64, String> {
    // "0.1119 BTC" → 0.1119
    let s = s.trim();
    let first = s.split_whitespace().next().unwrap_or(s);
    first.parse::<f64>().map_err(|_| format!("Invalid quantity: {}", s))
}

fn parse_blofin_pnl(s: &str) -> f64 {
    // "-53.11821 USDT" → -53.11821, "--" → 0.0
    let s = s.trim();
    if s == "--" {
        return 0.0;
    }
    s.split_whitespace()
        .next()
        .and_then(|n| n.parse::<f64>().ok())
        .unwrap_or(0.0)
}

fn asset_to_pair(asset: &str) -> String {
    // "BTCUSDT" → "BTC/USDT"
    if let Some(idx) = asset.rfind("USDT") {
        format!("{}/USDT", &asset[..idx])
    } else {
        asset.to_string()
    }
}

fn parse_blofin_line(line: &str) -> Result<BlofinOrder, String> {
    let clean = line.trim_start_matches('\u{feff}');
    let fields: Vec<&str> = clean.split(',').map(|f| f.trim()).collect();

    if fields.len() < 15 {
        return Err(format!("Expected ≥15 fields, got {}", fields.len()));
    }

    let status = fields[14];
    let filled_qty = parse_blofin_qty(fields[7])?;

    if status != "Filled" || filled_qty <= 0.0 {
        return Err(format!("Skipped: status={} qty={}", status, filled_qty));
    }

    let leverage = fields[2]
        .parse::<i64>()
        .map_err(|_| format!("Invalid leverage: {}", fields[2]))?;

    let order_time = parse_blofin_datetime(fields[3])?;
    let avg_fill = parse_blofin_price(fields[5]);
    let pnl = parse_blofin_pnl(fields[9]);
    let fee = parse_blofin_price(fields[11]);
    let is_reduce_only = fields[13] == "Y";

    Ok(BlofinOrder {
        asset: fields[0].to_string(),
        margin_mode: fields[1].to_string(),
        leverage,
        order_time,
        side: fields[4].to_string(),
        avg_fill,
        filled_qty,
        pnl,
        fee,
        is_reduce_only,
    })
}

fn parse_blofin_orders_from_csv(csv_content: &str) -> Vec<BlofinOrder> {
    let mut orders: Vec<BlofinOrder> = csv_content
        .lines()
        .skip(1)
        .filter_map(|line| {
            let clean = line.trim_start_matches('\u{feff}');
            if clean.trim().is_empty() {
                return None;
            }
            parse_blofin_line(clean).ok()
        })
        .collect();

    // Process chronologically so position grouping works correctly
    orders.sort_by(|a, b| a.order_time.cmp(&b.order_time));
    orders
}

fn group_blofin_orders_into_positions(orders: Vec<BlofinOrder>) -> Vec<BlofinPositionData> {
    let mut open: HashMap<String, OpenBlofinPosition> = HashMap::new();
    let mut closed: Vec<BlofinPositionData> = Vec::new();

    for order in orders {
        if order.is_reduce_only {
            // Exit order — reduce the open position for this asset
            if let Some(pos) = open.get_mut(&order.asset) {
                pos.exit_qty += order.filled_qty;
                pos.exit_price_sum += order.avg_fill * order.filled_qty;
                pos.total_pnl += order.pnl;
                pos.total_fees += order.fee;
                pos.closing_time = order.order_time.clone();
                pos.exit_orders.push((order.avg_fill, order.filled_qty));

                // Fully closed when exit qty >= entry qty (with 0.1% tolerance)
                if pos.entry_qty > 0.0 && pos.exit_qty >= pos.entry_qty * 0.999 {
                    let pos = open.remove(&order.asset).unwrap();
                    closed.push(finalize_blofin_position(pos));
                }
            }
            // Orphaned exit (no matching open position) — silently skip
        } else {
            // Entry order
            let direction = if order.side.starts_with("Buy") { "LONG" } else { "SHORT" };

            if let Some(pos) = open.get_mut(&order.asset) {
                // Add to existing open position (averaging in)
                pos.entry_qty += order.filled_qty;
                pos.entry_price_sum += order.avg_fill * order.filled_qty;
                pos.total_fees += order.fee;
                pos.entry_orders.push((order.avg_fill, order.filled_qty));
            } else {
                // Open a new position
                let pair = asset_to_pair(&order.asset);
                open.insert(
                    order.asset.clone(),
                    OpenBlofinPosition {
                        pair,
                        position_type: direction.to_string(),
                        margin_mode: order.margin_mode,
                        leverage: order.leverage,
                        entry_qty: order.filled_qty,
                        exit_qty: 0.0,
                        entry_price_sum: order.avg_fill * order.filled_qty,
                        exit_price_sum: 0.0,
                        total_pnl: 0.0,
                        total_fees: order.fee,
                        opening_time: order.order_time.clone(),
                        closing_time: String::new(),
                        entry_orders: vec![(order.avg_fill, order.filled_qty)],
                        exit_orders: Vec::new(),
                    },
                );
            }
        }
    }
    // Any remaining open positions are unclosed — skip them

    closed
}

fn finalize_blofin_position(pos: OpenBlofinPosition) -> BlofinPositionData {
    let entry_price = if pos.entry_qty > 0.0 {
        pos.entry_price_sum / pos.entry_qty
    } else {
        0.0
    };
    let exit_price = if pos.exit_qty > 0.0 {
        pos.exit_price_sum / pos.exit_qty
    } else {
        0.0
    };

    // entries: [{price, percent}] where percent is integer 0-100
    let entries: Vec<serde_json::Value> = pos
        .entry_orders
        .iter()
        .map(|(price, qty)| {
            let pct = if pos.entry_qty > 0.0 {
                (qty / pos.entry_qty * 100.0).round() as i64
            } else {
                0
            };
            serde_json::json!({"price": price, "percent": pct})
        })
        .collect();

    // exits: [{price, percent}] where percent is 0-100
    let exits: Vec<serde_json::Value> = pos
        .exit_orders
        .iter()
        .map(|(price, qty)| {
            let pct = if pos.entry_qty > 0.0 {
                qty / pos.entry_qty * 100.0
            } else {
                0.0
            };
            serde_json::json!({"price": price, "percent": pct})
        })
        .collect();

    BlofinPositionData {
        pair: pos.pair,
        position_type: pos.position_type,
        margin_mode: pos.margin_mode,
        leverage: pos.leverage,
        entry_price,
        exit_price,
        quantity: pos.entry_qty,
        realized_pnl: pos.total_pnl,
        total_fees: pos.total_fees,
        opening_time: pos.opening_time,
        closing_time: pos.closing_time,
        entries_json: serde_json::to_string(&entries).unwrap_or_else(|_| "[]".to_string()),
        exits_json: serde_json::to_string(&exits).unwrap_or_else(|_| "[]".to_string()),
    }
}

fn generate_blofin_fingerprint(pos: &BlofinPositionData) -> String {
    format!(
        "csv|blofin|{}|{}|{}|{}|{:.8}|{:.8}",
        pos.pair.to_lowercase(),
        pos.position_type.to_lowercase(),
        pos.opening_time,
        pos.closing_time,
        pos.quantity,
        pos.realized_pnl
    )
}

/// Parse BloFin order history CSV and return preview of grouped positions
#[tauri::command]
pub async fn preview_blofin_import(
    csv_content: String,
    _portfolio: f64,
    _r_percent: f64,
) -> Result<Vec<ImportPreview>, String> {
    let orders = parse_blofin_orders_from_csv(&csv_content);
    let positions = group_blofin_orders_into_positions(orders);

    let previews = positions
        .iter()
        .map(|pos| {
            let fingerprint = generate_blofin_fingerprint(pos);
            ImportPreview {
                pair: pos.pair.clone(),
                position_type: pos.position_type.clone(),
                entry_price: pos.entry_price,
                exit_price: pos.exit_price,
                quantity: pos.quantity,
                realized_pnl: pos.realized_pnl,
                opening_time: pos.opening_time.clone(),
                closing_time: pos.closing_time.clone(),
                total_fees: pos.total_fees,
                fingerprint,
            }
        })
        .collect();

    Ok(previews)
}

/// Import BloFin order history CSV — groups orders into positions then inserts
#[tauri::command]
pub async fn import_blofin_csv(
    db: State<'_, Database>,
    csv_content: String,
    portfolio: f64,
    r_percent: f64,
) -> Result<ImportResult, String> {
    let orders = parse_blofin_orders_from_csv(&csv_content);
    let positions = group_blofin_orders_into_positions(orders);

    let mut imported = 0;
    let mut duplicates = 0;
    let mut errors: Vec<String> = Vec::new();

    {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;

        for pos in positions {
            let fingerprint = generate_blofin_fingerprint(&pos);

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

            let id = format!(
                "TRADE-{}-{}",
                Utc::now().timestamp_millis(),
                uuid::Uuid::new_v4()
                    .to_string()
                    .split('-')
                    .next()
                    .ok_or("Failed to generate trade ID")?
            );
            let now = Utc::now().timestamp();

            let one_r = portfolio * r_percent;
            let position_size = pos.quantity * pos.entry_price;
            // Use actual leverage from BloFin data
            let leverage = pos.leverage.max(1);
            let margin = position_size / leverage as f64;

            // Estimate SL from 1R
            let target_sl_distance = if pos.quantity > 0.0 {
                one_r / pos.quantity
            } else {
                pos.entry_price * 0.01
            };
            let estimated_sl = if pos.position_type == "LONG" {
                pos.entry_price - target_sl_distance
            } else {
                pos.entry_price + target_sl_distance
            };

            let status = if pos.realized_pnl > 0.5 {
                "WIN"
            } else if pos.realized_pnl < -0.5 {
                "LOSS"
            } else {
                "BE"
            };

            let planned_tps = serde_json::json!([{
                "price": pos.exit_price,
                "percent": 1.0,
                "rr": 0.0
            }])
            .to_string();

            let notes = format!(
                "Imported from BloFin | {}x {} | Fees: ${:.2} | Note: RR metrics unavailable (no SL data from BloFin)",
                leverage, pos.margin_mode, pos.total_fees
            );

            let opening_ts = chrono::DateTime::parse_from_rfc3339(&format!(
                "{}Z",
                pos.opening_time.replace(' ', "T")
            ))
            .map(|dt| dt.timestamp())
            .unwrap_or(now);

            let closing_ts = chrono::DateTime::parse_from_rfc3339(&format!(
                "{}Z",
                pos.closing_time.replace(' ', "T")
            ))
            .map(|dt| dt.timestamp())
            .unwrap_or(now);

            match conn.execute(
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
                    pos.pair,
                    "BloFin",
                    opening_ts,
                    opening_ts,
                    closing_ts,
                    status,
                    portfolio,
                    r_percent,
                    0.0,
                    pos.entry_price,
                    estimated_sl,
                    leverage,
                    planned_tps,
                    pos.entries_json,
                    pos.position_type,
                    one_r,
                    margin,
                    position_size,
                    pos.quantity,
                    0.0,
                    pos.entry_price,
                    pos.entries_json,
                    pos.exits_json,
                    pos.realized_pnl,
                    notes,
                    fingerprint,
                    "CSV_IMPORT",
                    now,
                    now,
                ],
            ) {
                Ok(_) => imported += 1,
                Err(e) => errors.push(format!("Failed to import {}: {}", pos.pair, e)),
            }
        }
    }

    Ok(ImportResult {
        imported,
        duplicates,
        errors,
    })
}

/// Delete all BloFin CSV-imported trades
#[tauri::command]
pub async fn delete_blofin_trades(db: State<'_, Database>) -> Result<usize, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let count = conn
        .execute(
            "DELETE FROM trades WHERE import_fingerprint LIKE 'csv|blofin|%'",
            [],
        )
        .map_err(|e| e.to_string())?;
    Ok(count)
}

// ─── BingX xlsx Import ────────────────────────────────────────────────────────
// BingX exports Order History as an xlsx file with a .csv extension.
// Column layout: UID | Order No. | Time(UTC+8) | Pair | Type | Leverage |
//                DealPrice | Quantity | Amount | Fee | Fee Coin | Realized PNL |
//                Quote Asset | Order Type | AvgPrice
//
// Type values: "Open Long", "Close Long", "Open Short", "Close Short"
// Grouping key: pair + direction (handles hedge mode)

#[derive(Debug, Clone)]
struct BingxOrder {
    order_time: String,  // ISO-like "YYYY-MM-DD HH:MM:SS"
    pair: String,        // "BTC/USDT"
    direction: String,   // "LONG" | "SHORT"
    is_entry: bool,      // true = "Open", false = "Close"
    leverage: i64,
    deal_price: f64,
    quantity: f64,
    fee: f64,
    realized_pnl: f64,
}

struct OpenBingxPosition {
    pair: String,
    direction: String,
    leverage: i64,
    entry_qty: f64,
    exit_qty: f64,
    entry_price_sum: f64,
    exit_price_sum: f64,
    total_pnl: f64,
    total_fees: f64,
    opening_time: String,
    closing_time: String,
    entry_orders: Vec<(f64, f64)>,
    exit_orders: Vec<(f64, f64)>,
}

struct BingxPositionData {
    pair: String,
    position_type: String,
    leverage: i64,
    entry_price: f64,
    exit_price: f64,
    quantity: f64,
    realized_pnl: f64,
    total_fees: f64,
    opening_time: String,
    closing_time: String,
    entries_json: String,
    exits_json: String,
}

/// Extract a string from a calamine Data cell
fn data_str(d: &Data) -> String {
    match d {
        Data::String(s) => s.trim().to_string(),
        Data::Float(f) => f.to_string(),
        Data::Int(i) => i.to_string(),
        _ => String::new(),
    }
}

/// Extract f64 from a calamine Data cell
fn data_f64(d: &Data) -> f64 {
    match d {
        Data::Float(f) => *f,
        Data::Int(i) => *i as f64,
        Data::String(s) => s.trim().parse::<f64>().unwrap_or(0.0),
        _ => 0.0,
    }
}

fn bingx_pair_to_standard(pair: &str) -> String {
    // "BTC-USDT" → "BTC/USDT"
    if let Some(idx) = pair.rfind("-USDT") {
        format!("{}/USDT", &pair[..idx])
    } else {
        pair.replace('-', "/")
    }
}

fn normalize_bingx_time(s: &str) -> String {
    // Handle ISO 8601 with timezone offset: "2026-02-06T00:24:54.000+08:00"
    // Parse as RFC3339 and convert to UTC "YYYY-MM-DD HH:MM:SS"
    let s = s.replace('/', "-");
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(&s) {
        return dt.with_timezone(&chrono::Utc).format("%Y-%m-%d %H:%M:%S").to_string();
    }
    // Already in "YYYY-MM-DD HH:MM:SS" format — return as-is
    s
}

fn parse_bingx_row(row: &[Data]) -> Result<BingxOrder, String> {
    if row.len() < 12 {
        return Err(format!("Expected ≥12 columns, got {}", row.len()));
    }

    let time_str = normalize_bingx_time(&data_str(&row[2]));
    let pair_raw = data_str(&row[3]);
    let type_str = data_str(&row[4]);
    let leverage = data_f64(&row[5]) as i64;
    let deal_price = data_f64(&row[6]);
    let quantity = data_f64(&row[7]);
    let fee = data_f64(&row[9]).abs();
    let realized_pnl = data_f64(&row[11]);

    if pair_raw.is_empty() || type_str.is_empty() || quantity <= 0.0 {
        return Err("Empty or zero-quantity row".to_string());
    }

    let pair = bingx_pair_to_standard(&pair_raw);

    let (direction, is_entry) = match type_str.as_str() {
        "Open Long"   => ("LONG",  true),
        "Close Long"  => ("LONG",  false),
        "Open Short"  => ("SHORT", true),
        "Close Short" => ("SHORT", false),
        other => return Err(format!("Unknown order type: {}", other)),
    };

    Ok(BingxOrder {
        order_time: time_str,
        pair,
        direction: direction.to_string(),
        is_entry,
        leverage: leverage.max(1),
        deal_price,
        quantity,
        fee,
        realized_pnl,
    })
}

fn parse_bingx_xlsx(file_path: &str) -> Result<Vec<BingxOrder>, String> {
    let mut workbook: Xlsx<_> = open_workbook(file_path)
        .map_err(|e| format!("Failed to open xlsx: {}", e))?;

    let sheet_name = workbook
        .sheet_names()
        .first()
        .cloned()
        .ok_or("No sheets found in workbook")?;

    let sheet = workbook
        .worksheet_range(&sheet_name)
        .map_err(|e| format!("Failed to read sheet '{}': {}", sheet_name, e))?;

    let mut orders: Vec<BingxOrder> = sheet
        .rows()
        .skip(1) // skip header
        .filter_map(|row| parse_bingx_row(row).ok())
        .collect();

    // Process chronologically
    orders.sort_by(|a, b| a.order_time.cmp(&b.order_time));
    Ok(orders)
}

fn group_bingx_orders_into_positions(orders: Vec<BingxOrder>) -> Vec<BingxPositionData> {
    // Key = "PAIR-DIRECTION" (e.g., "BTC/USDT-LONG") to support hedge mode
    let mut open: HashMap<String, OpenBingxPosition> = HashMap::new();
    let mut closed: Vec<BingxPositionData> = Vec::new();

    for order in orders {
        let key = format!("{}-{}", order.pair, order.direction);

        if !order.is_entry {
            // Exit order
            if let Some(pos) = open.get_mut(&key) {
                pos.exit_qty += order.quantity;
                pos.exit_price_sum += order.deal_price * order.quantity;
                pos.total_pnl += order.realized_pnl;
                pos.total_fees += order.fee;
                pos.closing_time = order.order_time.clone();
                pos.exit_orders.push((order.deal_price, order.quantity));

                if pos.entry_qty > 0.0 && pos.exit_qty >= pos.entry_qty * 0.999 {
                    let pos = open.remove(&key).unwrap();
                    closed.push(finalize_bingx_position(pos));
                }
            }
        } else {
            // Entry order
            if let Some(pos) = open.get_mut(&key) {
                pos.entry_qty += order.quantity;
                pos.entry_price_sum += order.deal_price * order.quantity;
                pos.total_fees += order.fee;
                pos.entry_orders.push((order.deal_price, order.quantity));
            } else {
                open.insert(
                    key,
                    OpenBingxPosition {
                        pair: order.pair,
                        direction: order.direction,
                        leverage: order.leverage,
                        entry_qty: order.quantity,
                        exit_qty: 0.0,
                        entry_price_sum: order.deal_price * order.quantity,
                        exit_price_sum: 0.0,
                        total_pnl: 0.0,
                        total_fees: order.fee,
                        opening_time: order.order_time,
                        closing_time: String::new(),
                        entry_orders: vec![(order.deal_price, order.quantity)],
                        exit_orders: Vec::new(),
                    },
                );
            }
        }
    }

    closed
}

fn finalize_bingx_position(pos: OpenBingxPosition) -> BingxPositionData {
    let entry_price = if pos.entry_qty > 0.0 {
        pos.entry_price_sum / pos.entry_qty
    } else {
        0.0
    };
    let exit_price = if pos.exit_qty > 0.0 {
        pos.exit_price_sum / pos.exit_qty
    } else {
        0.0
    };

    let entries: Vec<serde_json::Value> = pos.entry_orders.iter().map(|(price, qty)| {
        let pct = if pos.entry_qty > 0.0 { (qty / pos.entry_qty * 100.0).round() as i64 } else { 0 };
        serde_json::json!({"price": price, "percent": pct})
    }).collect();

    let exits: Vec<serde_json::Value> = pos.exit_orders.iter().map(|(price, qty)| {
        let pct = if pos.entry_qty > 0.0 { qty / pos.entry_qty * 100.0 } else { 0.0 };
        serde_json::json!({"price": price, "percent": pct})
    }).collect();

    BingxPositionData {
        pair: pos.pair,
        position_type: pos.direction,
        leverage: pos.leverage,
        entry_price,
        exit_price,
        quantity: pos.entry_qty,
        realized_pnl: pos.total_pnl,
        total_fees: pos.total_fees,
        opening_time: pos.opening_time,
        closing_time: pos.closing_time,
        entries_json: serde_json::to_string(&entries).unwrap_or_else(|_| "[]".to_string()),
        exits_json:   serde_json::to_string(&exits).unwrap_or_else(|_| "[]".to_string()),
    }
}

fn generate_bingx_fingerprint(pos: &BingxPositionData) -> String {
    format!(
        "xlsx|bingx|{}|{}|{}|{}|{:.8}|{:.8}",
        pos.pair.to_lowercase(),
        pos.position_type.to_lowercase(),
        pos.opening_time,
        pos.closing_time,
        pos.quantity,
        pos.realized_pnl
    )
}

/// Parse BingX xlsx Order History and return position previews
/// Takes the file path directly (xlsx cannot be sent as text content)
#[tauri::command]
pub async fn preview_bingx_import(
    file_path: String,
    _portfolio: f64,
    _r_percent: f64,
) -> Result<Vec<ImportPreview>, String> {
    let orders = parse_bingx_xlsx(&file_path)?;
    let positions = group_bingx_orders_into_positions(orders);

    let previews = positions.iter().map(|pos| {
        ImportPreview {
            pair: pos.pair.clone(),
            position_type: pos.position_type.clone(),
            entry_price: pos.entry_price,
            exit_price: pos.exit_price,
            quantity: pos.quantity,
            realized_pnl: pos.realized_pnl,
            opening_time: pos.opening_time.clone(),
            closing_time: pos.closing_time.clone(),
            total_fees: pos.total_fees,
            fingerprint: generate_bingx_fingerprint(pos),
        }
    }).collect();

    Ok(previews)
}

/// Import BingX xlsx Order History into the database
#[tauri::command]
pub async fn import_bingx_file(
    db: State<'_, Database>,
    file_path: String,
    portfolio: f64,
    r_percent: f64,
) -> Result<ImportResult, String> {
    let orders = parse_bingx_xlsx(&file_path)?;
    let positions = group_bingx_orders_into_positions(orders);

    let mut imported = 0;
    let mut duplicates = 0;
    let mut errors: Vec<String> = Vec::new();

    {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;

        for pos in positions {
            let fingerprint = generate_bingx_fingerprint(&pos);

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

            let id = format!(
                "TRADE-{}-{}",
                Utc::now().timestamp_millis(),
                uuid::Uuid::new_v4()
                    .to_string()
                    .split('-')
                    .next()
                    .ok_or("Failed to generate ID")?
            );
            let now = Utc::now().timestamp();

            let one_r = portfolio * r_percent;
            let position_size = pos.quantity * pos.entry_price;
            let leverage = pos.leverage.max(1);
            let margin = position_size / leverage as f64;

            let target_sl_distance = if pos.quantity > 0.0 {
                one_r / pos.quantity
            } else {
                pos.entry_price * 0.01
            };
            let estimated_sl = if pos.position_type == "LONG" {
                pos.entry_price - target_sl_distance
            } else {
                pos.entry_price + target_sl_distance
            };

            let status = if pos.realized_pnl > 0.5 {
                "WIN"
            } else if pos.realized_pnl < -0.5 {
                "LOSS"
            } else {
                "BE"
            };

            let planned_tps = serde_json::json!([{
                "price": pos.exit_price, "percent": 1.0, "rr": 0.0
            }]).to_string();

            let notes = format!(
                "Imported from BingX | {}x | Fees: ${:.2} | Note: RR metrics unavailable (no SL data from BingX)",
                leverage, pos.total_fees
            );

            let opening_ts = chrono::DateTime::parse_from_rfc3339(
                &format!("{}Z", pos.opening_time.replace(' ', "T"))
            ).map(|dt| dt.timestamp()).unwrap_or(now);

            let closing_ts = chrono::DateTime::parse_from_rfc3339(
                &format!("{}Z", pos.closing_time.replace(' ', "T"))
            ).map(|dt| dt.timestamp()).unwrap_or(now);

            match conn.execute(
                "INSERT INTO trades (
                    id, pair, exchange, analysis_date, trade_date, close_date, status,
                    portfolio_value, r_percent, min_rr,
                    planned_pe, planned_sl, leverage, planned_tps, planned_entries,
                    position_type, one_r, margin, position_size, quantity,
                    planned_weighted_rr, effective_pe, effective_entries, exits, total_pnl,
                    notes, import_fingerprint, import_source, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                rusqlite::params![
                    id, pos.pair, "BingX",
                    opening_ts, opening_ts, closing_ts,
                    status, portfolio, r_percent, 0.0,
                    pos.entry_price, estimated_sl, leverage,
                    planned_tps, pos.entries_json,
                    pos.position_type,
                    one_r, margin, position_size, pos.quantity,
                    0.0,
                    pos.entry_price, pos.entries_json, pos.exits_json,
                    pos.realized_pnl, notes, fingerprint, "CSV_IMPORT",
                    now, now,
                ],
            ) {
                Ok(_) => imported += 1,
                Err(e) => errors.push(format!("Failed to import {}: {}", pos.pair, e)),
            }
        }
    }

    Ok(ImportResult { imported, duplicates, errors })
}

/// Delete all BingX imported trades
#[tauri::command]
pub async fn delete_bingx_trades(db: State<'_, Database>) -> Result<usize, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let count = conn
        .execute("DELETE FROM trades WHERE import_fingerprint LIKE 'xlsx|bingx|%'", [])
        .map_err(|e| e.to_string())?;
    Ok(count)
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
            "SELECT id, initial_capital, current_r_percent, default_min_rr, default_leverage, currency, enable_position_monitor, enable_api_connections, created_at, updated_at FROM settings WHERE id = 1",
            [],
            |row| {
                Ok(Settings {
                    id: row.get(0)?,
                    initial_capital: row.get(1)?,
                    current_r_percent: row.get(2)?,
                    default_min_rr: row.get(3)?,
                    default_leverage: row.get(4)?,
                    currency: row.get(5)?,
                    enable_position_monitor: row.get::<_, i32>(6)? == 1,
                    enable_api_connections: row.get::<_, i32>(7)? == 1,
                    created_at: row.get(8)?,
                    updated_at: row.get(9)?,
                })
            },
        )
        .map_err(|e| e.to_string())?;

    // Get all trades
    let mut stmt = conn
        .prepare("SELECT * FROM trades ORDER BY trade_date DESC")
        .map_err(|e| e.to_string())?;

    let trades = stmt
        .query_map([], |row| {
            Ok(Trade {
                id: row.get("id")?,
                pair: row.get("pair")?,
                exchange: row.get("exchange")?,
                analysis_date: row.get("analysis_date")?,
                trade_date: row.get("trade_date")?,
                close_date: row.get("close_date").ok(),
                status: row.get("status")?,
                portfolio_value: row.get("portfolio_value")?,
                r_percent: row.get("r_percent")?,
                min_rr: row.get("min_rr")?,
                planned_pe: row.get("planned_pe")?,
                planned_sl: row.get("planned_sl")?,
                leverage: row.get("leverage")?,
                planned_tps: row.get("planned_tps")?,
                planned_entries: row.get("planned_entries").ok(),
                position_type: row.get("position_type")?,
                one_r: row.get("one_r")?,
                margin: row.get("margin")?,
                position_size: row.get("position_size")?,
                quantity: row.get("quantity")?,
                planned_weighted_rr: row.get("planned_weighted_rr")?,
                effective_pe: row.get("effective_pe").ok(),
                effective_entries: row.get("effective_entries").ok(),
                exits: row.get("exits").ok(),
                effective_weighted_rr: row.get("effective_weighted_rr").ok(),
                total_pnl: row.get("total_pnl").ok(),
                pnl_in_r: row.get("pnl_in_r").ok(),
                notes: row.get("notes")?,
                execution_portfolio: row.get("execution_portfolio").ok(),
                execution_r_percent: row.get("execution_r_percent").ok(),
                execution_margin: row.get("execution_margin").ok(),
                execution_position_size: row.get("execution_position_size").ok(),
                execution_quantity: row.get("execution_quantity").ok(),
                execution_one_r: row.get("execution_one_r").ok(),
                execution_potential_profit: row.get("execution_potential_profit").ok(),
                import_fingerprint: row.get("import_fingerprint").ok(),
                import_source: row.get("import_source")?,
                created_at: row.get("created_at")?,
                updated_at: row.get("updated_at")?,
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
            "REPLACE INTO trades (id, pair, exchange, analysis_date, trade_date, close_date, status, portfolio_value, r_percent, min_rr, planned_pe, planned_sl, leverage, planned_tps, planned_entries, position_type, one_r, margin, position_size, quantity, planned_weighted_rr, effective_pe, effective_entries, exits, effective_weighted_rr, total_pnl, pnl_in_r, notes, import_fingerprint, import_source, execution_portfolio, execution_r_percent, execution_margin, execution_position_size, execution_quantity, execution_one_r, execution_potential_profit, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
                trade.execution_portfolio,
                trade.execution_r_percent,
                trade.execution_margin,
                trade.execution_position_size,
                trade.execution_quantity,
                trade.execution_one_r,
                trade.execution_potential_profit,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_backward_compatibility_import_source() {
        // Test that old exports without import_source field can be deserialized
        // This simulates an export from before import_source was added (pre-Feb 2026)
        let old_export_json = r#"{
            "id": "TRADE-123",
            "pair": "BTC/USDT",
            "exchange": "BitGet",
            "analysis_date": 1704067200,
            "trade_date": 1704067200,
            "status": "WIN",
            "portfolio_value": 10000.0,
            "r_percent": 0.02,
            "min_rr": 2.0,
            "planned_pe": 42000.0,
            "planned_sl": 41500.0,
            "leverage": 10,
            "planned_tps": "[{\"price\": 43000.0, \"percent\": 1.0}]",
            "position_type": "LONG",
            "one_r": 200.0,
            "margin": 1000.0,
            "position_size": 10000.0,
            "quantity": 0.238,
            "planned_weighted_rr": 2.0,
            "notes": "",
            "created_at": 1704067200,
            "updated_at": 1704067200
        }"#;

        let result: Result<Trade, _> = serde_json::from_str(old_export_json);
        assert!(result.is_ok(), "Failed to deserialize old export: {:?}", result.err());

        let trade = result.unwrap();
        assert_eq!(trade.import_source, "USER_CREATED", "Default import_source should be USER_CREATED");
        assert_eq!(trade.pair, "BTC/USDT");
        assert_eq!(trade.status, "WIN");
    }

    #[test]
    fn test_new_export_with_import_source() {
        // Test that new exports with import_source field still work
        let new_export_json = r#"{
            "id": "TRADE-456",
            "pair": "ETH/USDT",
            "exchange": "BitGet",
            "analysis_date": 1704067200,
            "trade_date": 1704067200,
            "status": "LOSS",
            "portfolio_value": 10000.0,
            "r_percent": 0.02,
            "min_rr": 2.0,
            "planned_pe": 2500.0,
            "planned_sl": 2450.0,
            "leverage": 10,
            "planned_tps": "[{\"price\": 2600.0, \"percent\": 1.0}]",
            "position_type": "LONG",
            "one_r": 200.0,
            "margin": 1000.0,
            "position_size": 10000.0,
            "quantity": 4.0,
            "planned_weighted_rr": 2.0,
            "notes": "",
            "import_source": "CSV_IMPORT",
            "created_at": 1704067200,
            "updated_at": 1704067200
        }"#;

        let result: Result<Trade, _> = serde_json::from_str(new_export_json);
        assert!(result.is_ok(), "Failed to deserialize new export: {:?}", result.err());

        let trade = result.unwrap();
        assert_eq!(trade.import_source, "CSV_IMPORT", "Import source should be preserved from JSON");
        assert_eq!(trade.pair, "ETH/USDT");
    }
}
