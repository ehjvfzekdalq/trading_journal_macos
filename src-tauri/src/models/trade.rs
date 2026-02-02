use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Trade {
    pub id: String,
    pub pair: String,
    pub exchange: String,
    pub analysis_date: i64,
    pub trade_date: i64,
    pub status: String,

    pub portfolio_value: f64,
    pub r_percent: f64,
    pub min_rr: f64,

    pub planned_pe: f64,
    pub planned_sl: f64,
    pub leverage: i32,
    pub planned_tps: String, // JSON
    pub planned_entries: Option<String>, // JSON array of {price, percent}

    pub position_type: String,
    pub one_r: f64,
    pub margin: f64,
    pub position_size: f64,
    pub quantity: f64,
    pub planned_weighted_rr: f64,

    pub effective_pe: Option<f64>,
    pub effective_entries: Option<String>, // JSON array of {price, percent}
    pub close_date: Option<i64>,
    pub exits: Option<String>, // JSON

    pub effective_weighted_rr: Option<f64>,
    pub total_pnl: Option<f64>,
    pub pnl_in_r: Option<f64>,

    pub notes: String,
    pub import_fingerprint: Option<String>,
    pub import_source: String, // USER_CREATED | API_IMPORT | CSV_IMPORT

    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateTradeInput {
    pub pair: String,
    pub exchange: String,
    pub analysis_date: i64,
    pub trade_date: i64,
    pub status: String,

    pub portfolio_value: f64,
    pub r_percent: f64,
    pub min_rr: f64,

    pub planned_pe: f64,
    pub planned_sl: f64,
    pub leverage: i32,
    pub planned_tps: String,
    pub planned_entries: Option<String>, // JSON array of {price, percent}

    pub position_type: String,
    pub one_r: f64,
    pub margin: f64,
    pub position_size: f64,
    pub quantity: f64,
    pub planned_weighted_rr: f64,

    pub notes: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TradeFilters {
    pub status: Option<String>,
    pub pair: Option<String>,
    pub start_date: Option<i64>,
    pub end_date: Option<i64>,
    pub page: Option<i32>,
    pub limit: Option<i32>,
}
