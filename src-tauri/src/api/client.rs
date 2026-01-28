use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use super::error::ApiError;

/// Configuration for rate limiting
#[derive(Debug, Clone)]
pub struct RateLimitConfig {
    pub requests_per_second: u32,
    pub burst_size: u32,
}

/// Request parameters for fetching trades
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FetchTradesRequest {
    /// Optional start timestamp (Unix milliseconds)
    pub start_time: Option<i64>,
    /// Optional end timestamp (Unix milliseconds)
    pub end_time: Option<i64>,
    /// Optional symbol filter (e.g., "BTCUSDT")
    pub symbol: Option<String>,
    /// Maximum number of trades to fetch (None = all)
    pub limit: Option<u32>,
    /// Pagination cursor (exchange-specific)
    pub cursor: Option<String>,
}

/// Raw trade data from exchange API (before mapping to Trade model)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawTrade {
    pub exchange_trade_id: String,
    pub exchange_order_id: String,
    pub symbol: String,
    pub side: String, // "buy" or "sell"
    pub position_side: String, // "long", "short", or "net"
    pub quantity: f64,
    pub entry_price: f64,
    pub exit_price: Option<f64>,
    pub pnl: f64,
    pub fee: f64,
    pub leverage: Option<u32>,
    pub timestamp: i64, // Unix milliseconds
    pub close_timestamp: Option<i64>,
    /// Raw JSON from exchange (for debugging/auditing)
    pub raw_json: String,
}

/// Response from fetching trades
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FetchTradesResponse {
    pub trades: Vec<RawTrade>,
    /// Next pagination cursor (None if no more data)
    pub next_cursor: Option<String>,
    /// Whether there are more pages available
    pub has_more: bool,
}

/// Core trait that all exchange clients must implement
#[async_trait]
pub trait ExchangeClient: Send + Sync {
    /// Get the exchange name (e.g., "bitget", "blofin")
    fn exchange_name(&self) -> &str;

    /// Fetch historical trades from the exchange
    async fn fetch_trades(
        &self,
        request: FetchTradesRequest,
    ) -> Result<FetchTradesResponse, ApiError>;

    /// Test API credentials by making a lightweight API call
    async fn test_credentials(&self) -> Result<bool, ApiError>;

    /// Get rate limit configuration for this exchange
    fn rate_limit(&self) -> RateLimitConfig;
}
