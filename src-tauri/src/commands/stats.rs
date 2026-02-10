use tauri::State;
use crate::db::Database;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DashboardStats {
    pub total_trades: i32,
    pub wins: i32,
    pub losses: i32,
    pub breakevens: i32,
    pub open_trades: i32,
    pub win_rate: f64,
    pub total_pnl: f64,
    pub gross_profit: f64,
    pub gross_loss: f64,
    pub profit_factor: f64,
    pub avg_effective_rr: f64,
    pub best_trade: f64,
    pub worst_trade: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EquityCurvePoint {
    pub date: String,
    pub cumulative_pnl: f64,
    pub daily_pnl: f64,
    pub trade_count: i32,
}

#[tauri::command]
pub async fn get_dashboard_stats(
    db: State<'_, Database>,
    date_range: Option<String>,
) -> Result<DashboardStats, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // Calculate date threshold based on range
    let date_threshold = match date_range.as_deref() {
        Some("today") => {
            Some(chrono::Utc::now().date_naive().and_hms_opt(0, 0, 0).unwrap().and_utc().timestamp())
        },
        Some("week") => {
            Some(chrono::Utc::now().timestamp() - (7 * 24 * 60 * 60))
        },
        Some("month") => {
            Some(chrono::Utc::now().timestamp() - (30 * 24 * 60 * 60))
        },
        Some("3months") => {
            Some(chrono::Utc::now().timestamp() - (90 * 24 * 60 * 60))
        },
        Some("6months") => {
            Some(chrono::Utc::now().timestamp() - (180 * 24 * 60 * 60))
        },
        Some("year") => {
            Some(chrono::Utc::now().timestamp() - (365 * 24 * 60 * 60))
        },
        _ => None,
    };

    // Build filter clause and params
    // SAFETY: date_filter is always a compile-time constant string ("AND close_date >= ?" or ""),
    // never user-provided input. This pattern is safe from SQL injection as long as date_filter
    // remains a hardcoded string. All dynamic values are passed through parameterized queries.
    let (date_filter, date_params): (&str, Vec<i64>) = match date_threshold {
        Some(threshold) => ("AND close_date >= ?", vec![threshold]),
        None => ("", vec![]),
    };

    // Total trades
    let total_trades: i32 = conn.query_row(
        &format!("SELECT COUNT(*) FROM trades WHERE deleted_at IS NULL {}", date_filter),
        rusqlite::params_from_iter(date_params.iter()),
        |row| row.get(0),
    ).unwrap_or(0);

    // Status counts
    let wins: i32 = conn.query_row(
        &format!("SELECT COUNT(*) FROM trades WHERE deleted_at IS NULL AND status = 'WIN' {}", date_filter),
        rusqlite::params_from_iter(date_params.iter()),
        |row| row.get(0),
    ).unwrap_or(0);

    let losses: i32 = conn.query_row(
        &format!("SELECT COUNT(*) FROM trades WHERE deleted_at IS NULL AND status = 'LOSS' {}", date_filter),
        rusqlite::params_from_iter(date_params.iter()),
        |row| row.get(0),
    ).unwrap_or(0);

    let breakevens: i32 = conn.query_row(
        &format!("SELECT COUNT(*) FROM trades WHERE deleted_at IS NULL AND status = 'BE' {}", date_filter),
        rusqlite::params_from_iter(date_params.iter()),
        |row| row.get(0),
    ).unwrap_or(0);

    let open_trades: i32 = conn.query_row(
        "SELECT COUNT(*) FROM trades WHERE deleted_at IS NULL AND status = 'OPEN'",
        [],
        |row| row.get(0),
    ).unwrap_or(0);

    // Win rate
    let closed_trades = wins + losses;
    let win_rate = if closed_trades > 0 {
        (wins as f64 / closed_trades as f64) * 100.0
    } else {
        0.0
    };

    // Total P&L
    let total_pnl: f64 = conn.query_row(
        &format!("SELECT COALESCE(SUM(total_pnl), 0.0) FROM trades WHERE deleted_at IS NULL AND total_pnl IS NOT NULL {}", date_filter),
        rusqlite::params_from_iter(date_params.iter()),
        |row| row.get(0),
    ).unwrap_or(0.0);

    // Gross profit
    let gross_profit: f64 = conn.query_row(
        &format!("SELECT COALESCE(SUM(total_pnl), 0.0) FROM trades WHERE deleted_at IS NULL AND total_pnl > 0 {}", date_filter),
        rusqlite::params_from_iter(date_params.iter()),
        |row| row.get(0),
    ).unwrap_or(0.0);

    // Gross loss
    let gross_loss: f64 = conn.query_row(
        &format!("SELECT COALESCE(ABS(SUM(total_pnl)), 0.0) FROM trades WHERE deleted_at IS NULL AND total_pnl < 0 {}", date_filter),
        rusqlite::params_from_iter(date_params.iter()),
        |row| row.get(0),
    ).unwrap_or(0.0);

    // Profit factor
    let profit_factor = if gross_loss > 0.0 {
        gross_profit / gross_loss
    } else if gross_profit > 0.0 {
        f64::INFINITY
    } else {
        0.0
    };

    // Average effective RR
    let avg_effective_rr: f64 = conn.query_row(
        &format!("SELECT COALESCE(AVG(effective_weighted_rr), 0.0) FROM trades WHERE deleted_at IS NULL AND effective_weighted_rr IS NOT NULL {}", date_filter),
        rusqlite::params_from_iter(date_params.iter()),
        |row| row.get(0),
    ).unwrap_or(0.0);

    // Best trade
    let best_trade: f64 = conn.query_row(
        &format!("SELECT COALESCE(MAX(total_pnl), 0.0) FROM trades WHERE deleted_at IS NULL AND total_pnl IS NOT NULL {}", date_filter),
        rusqlite::params_from_iter(date_params.iter()),
        |row| row.get(0),
    ).unwrap_or(0.0);

    // Worst trade
    let worst_trade: f64 = conn.query_row(
        &format!("SELECT COALESCE(MIN(total_pnl), 0.0) FROM trades WHERE deleted_at IS NULL AND total_pnl IS NOT NULL {}", date_filter),
        rusqlite::params_from_iter(date_params.iter()),
        |row| row.get(0),
    ).unwrap_or(0.0);

    Ok(DashboardStats {
        total_trades,
        wins,
        losses,
        breakevens,
        open_trades,
        win_rate,
        total_pnl,
        gross_profit,
        gross_loss,
        profit_factor,
        avg_effective_rr,
        best_trade,
        worst_trade,
    })
}

#[tauri::command]
pub async fn get_equity_curve(
    db: State<'_, Database>,
    date_range: Option<String>,
) -> Result<Vec<EquityCurvePoint>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // Calculate date threshold based on range
    let date_threshold = match date_range.as_deref() {
        Some("today") => {
            Some(chrono::Utc::now().date_naive().and_hms_opt(0, 0, 0).unwrap().and_utc().timestamp())
        },
        Some("week") => {
            Some(chrono::Utc::now().timestamp() - (7 * 24 * 60 * 60))
        },
        Some("month") => {
            Some(chrono::Utc::now().timestamp() - (30 * 24 * 60 * 60))
        },
        Some("3months") => {
            Some(chrono::Utc::now().timestamp() - (90 * 24 * 60 * 60))
        },
        Some("6months") => {
            Some(chrono::Utc::now().timestamp() - (180 * 24 * 60 * 60))
        },
        Some("year") => {
            Some(chrono::Utc::now().timestamp() - (365 * 24 * 60 * 60))
        },
        _ => None,
    };

    // Build filter clause and params
    // SAFETY: date_filter is always a compile-time constant string ("AND close_date >= ?" or ""),
    // never user-provided input. This pattern is safe from SQL injection as long as date_filter
    // remains a hardcoded string. All dynamic values are passed through parameterized queries.
    let (date_filter, date_params): (&str, Vec<i64>) = match date_threshold {
        Some(threshold) => ("AND close_date >= ?", vec![threshold]),
        None => ("", vec![]),
    };

    // Query all closed trades with close_date
    let mut stmt = conn.prepare(&format!(
        "SELECT close_date, total_pnl
         FROM trades
         WHERE close_date IS NOT NULL
         AND total_pnl IS NOT NULL
         AND status IN ('WIN', 'LOSS', 'BE')
         {}
         ORDER BY close_date ASC",
        date_filter
    )).map_err(|e| e.to_string())?;

    let trades = stmt.query_map(rusqlite::params_from_iter(date_params.iter()), |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, f64>(1)?,
        ))
    }).map_err(|e| e.to_string())?;

    // Group by date and calculate cumulative P&L
    let mut daily_map: std::collections::HashMap<String, (f64, i32)> = std::collections::HashMap::new();

    for trade in trades {
        let (close_timestamp, pnl) = trade.map_err(|e| e.to_string())?;

        // Convert timestamp to date string (YYYY-MM-DD)
        let date = chrono::DateTime::from_timestamp(close_timestamp, 0)
            .ok_or(format!("Invalid timestamp: {} for trade with close_date {}", close_timestamp, close_timestamp))?
            .format("%Y-%m-%d")
            .to_string();

        let entry = daily_map.entry(date).or_insert((0.0, 0));
        entry.0 += pnl;
        entry.1 += 1;
    }

    // Sort by date and calculate cumulative
    let mut sorted_dates: Vec<_> = daily_map.into_iter().collect();
    sorted_dates.sort_by(|a, b| a.0.cmp(&b.0));

    let mut cumulative_pnl = 0.0;
    let mut result: Vec<EquityCurvePoint> = Vec::new();

    for (date, (daily_pnl, trade_count)) in sorted_dates {
        cumulative_pnl += daily_pnl;
        result.push(EquityCurvePoint {
            date,
            cumulative_pnl,
            daily_pnl,
            trade_count,
        });
    }

    Ok(result)
}
