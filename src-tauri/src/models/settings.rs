use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub id: i32,
    pub initial_capital: f64,
    pub current_r_percent: f64,
    pub default_min_rr: f64,
    pub default_leverage: i32,
    pub currency: String,
    pub enable_position_monitor: bool,
    pub enable_api_connections: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateSettingsInput {
    pub initial_capital: Option<f64>,
    pub current_r_percent: Option<f64>,
    pub default_min_rr: Option<f64>,
    pub default_leverage: Option<i32>,
    pub currency: Option<String>,
    pub enable_position_monitor: Option<bool>,
    pub enable_api_connections: Option<bool>,
}
