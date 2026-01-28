use serde::{Deserialize, Serialize};

/// BloFin API response wrapper
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlofinResponse<T> {
    pub code: String,
    pub msg: String,
    pub data: Option<Vec<T>>,
}

/// BloFin trade record
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlofinTrade {
    /// Instrument ID (e.g., "BTC-USDT-SWAP")
    #[serde(rename = "instId")]
    pub inst_id: String,

    /// Trade ID
    #[serde(rename = "tradeId")]
    pub trade_id: String,

    /// Order ID
    #[serde(rename = "orderId")]
    pub order_id: String,

    /// Client order ID
    #[serde(rename = "clOrdId")]
    pub cl_ord_id: Option<String>,

    /// Bill ID
    #[serde(rename = "billId")]
    pub bill_id: String,

    /// Fill price
    #[serde(rename = "fillPx")]
    pub fill_px: String,

    /// Fill quantity
    #[serde(rename = "fillSz")]
    pub fill_sz: String,

    /// Order side: "buy", "sell"
    pub side: String,

    /// Position side: "long", "short", "net"
    #[serde(rename = "posSide")]
    pub pos_side: String,

    /// Execution type: "T" (taker), "M" (maker)
    #[serde(rename = "execType")]
    pub exec_type: String,

    /// Fee amount (negative means charged)
    #[serde(rename = "fee")]
    pub fee: String,

    /// Fee currency
    #[serde(rename = "feeCcy")]
    pub fee_ccy: String,

    /// Timestamp (Unix milliseconds)
    pub ts: String,
}

/// Request for trade history
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TradeHistoryRequest {
    /// Instrument type (optional): "SWAP" for perpetual futures
    #[serde(rename = "instType", skip_serializing_if = "Option::is_none")]
    pub inst_type: Option<String>,

    /// Instrument ID (optional)
    #[serde(rename = "instId", skip_serializing_if = "Option::is_none")]
    pub inst_id: Option<String>,

    /// Order ID (optional)
    #[serde(rename = "ordId", skip_serializing_if = "Option::is_none")]
    pub ord_id: Option<String>,

    /// Pagination: query trades with ID < after
    #[serde(skip_serializing_if = "Option::is_none")]
    pub after: Option<String>,

    /// Pagination: query trades with ID > before
    #[serde(skip_serializing_if = "Option::is_none")]
    pub before: Option<String>,

    /// Begin timestamp (Unix milliseconds, optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub begin: Option<String>,

    /// End timestamp (Unix milliseconds, optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end: Option<String>,

    /// Limit (max 100)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<String>,
}
