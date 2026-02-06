use serde::{Deserialize, Serialize};

/// BitGet API response wrapper
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BitgetResponse<T> {
    pub code: String,
    pub msg: String,
    pub data: Option<T>,
    #[serde(rename = "requestTime")]
    pub request_time: Option<i64>,
}

/// BitGet fill history data wrapper
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FillHistoryData {
    #[serde(rename = "fillList", default)]
    pub fill_list: Option<Vec<BitgetFill>>,
    #[serde(rename = "endId")]
    pub end_id: Option<String>,
}

/// BitGet trade fill
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BitgetFill {
    /// User ID
    #[serde(rename = "userId", skip_serializing_if = "Option::is_none")]
    pub user_id: Option<String>,

    /// Symbol (e.g., "BTCUSDT")
    pub symbol: String,

    /// Product type: "USDT-FUTURES", "COIN-FUTURES", "USDC-FUTURES" (optional in response)
    #[serde(rename = "productType", skip_serializing_if = "Option::is_none")]
    pub product_type: Option<String>,

    /// Order ID
    #[serde(rename = "orderId")]
    pub order_id: String,

    /// Trade ID (fill ID)
    #[serde(rename = "tradeId")]
    pub trade_id: String,

    /// Order type: "limit", "market" (optional in response)
    #[serde(rename = "orderType", skip_serializing_if = "Option::is_none")]
    pub order_type: Option<String>,

    /// Side: "buy", "sell"
    pub side: String,

    /// Position side: "long", "short", "net" (optional, may use posMode instead)
    #[serde(rename = "posSide", skip_serializing_if = "Option::is_none")]
    pub pos_side: Option<String>,

    /// Position mode: "hedge_mode", etc (optional)
    #[serde(rename = "posMode", skip_serializing_if = "Option::is_none")]
    pub pos_mode: Option<String>,

    /// Price per unit
    #[serde(rename = "priceAvg", alias = "price")]
    pub price_avg: String,

    /// Filled quantity (baseVolume in some responses)
    #[serde(rename = "size", alias = "baseVolume")]
    pub size: String,

    /// Total filled amount (size * priceAvg, may be quoteVolume)
    #[serde(rename = "amount", alias = "quoteVolume", skip_serializing_if = "Option::is_none")]
    pub amount: Option<String>,

    /// Trading fee details (array of fee objects)
    #[serde(rename = "feeDetail")]
    pub fee_detail: Option<Vec<BitgetFeeDetail>>,

    /// Profit/Loss (only for closing positions)
    pub profit: Option<String>,

    /// Trade side: "open", "close" (optional)
    #[serde(rename = "tradeSide", skip_serializing_if = "Option::is_none")]
    pub trade_side: Option<String>,

    /// Trade scope: "taker", "maker" (optional)
    #[serde(rename = "tradeScope", skip_serializing_if = "Option::is_none")]
    pub trade_scope: Option<String>,

    /// Margin coin (optional)
    #[serde(rename = "marginCoin", skip_serializing_if = "Option::is_none")]
    pub margin_coin: Option<String>,

    /// Creation time (Unix milliseconds)
    #[serde(rename = "cTime")]
    pub c_time: String,

    /// Update time (Unix milliseconds, optional)
    #[serde(rename = "uTime", skip_serializing_if = "Option::is_none")]
    pub u_time: Option<String>,
}

/// BitGet fee details
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BitgetFeeDetail {
    /// Deduction status
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deduction: Option<String>,

    /// Fee currency
    #[serde(rename = "feeCoin")]
    pub fee_coin: Option<String>,

    /// Total deduction fee
    #[serde(rename = "totalDeductionFee", skip_serializing_if = "Option::is_none")]
    pub total_deduction_fee: Option<String>,

    /// Total fee amount
    #[serde(rename = "totalFee")]
    pub total_fee: Option<String>,
}

/// Request for fill history
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FillHistoryRequest {
    /// Product type (required)
    #[serde(rename = "productType")]
    pub product_type: String,

    /// Symbol (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub symbol: Option<String>,

    /// Start time (Unix milliseconds, optional)
    #[serde(rename = "startTime", skip_serializing_if = "Option::is_none")]
    pub start_time: Option<String>,

    /// End time (Unix milliseconds, optional)
    #[serde(rename = "endTime", skip_serializing_if = "Option::is_none")]
    pub end_time: Option<String>,

    /// Pagination: query orders with IDs less than this value
    #[serde(rename = "idLessThan", skip_serializing_if = "Option::is_none")]
    pub id_less_than: Option<String>,

    /// Limit (max 100)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<String>,
}

/// BitGet all positions data wrapper
#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct AllPositionsData {
    #[serde(default)]
    pub list: Vec<BitgetPosition>,
}

/// BitGet position information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BitgetPosition {
    /// Position ID (optional, not always returned by API)
    #[serde(rename = "posId", skip_serializing_if = "Option::is_none")]
    pub pos_id: Option<String>,

    /// Symbol (e.g., "BTCUSDT")
    pub symbol: String,

    /// Product type: "USDT-FUTURES", "COIN-FUTURES", "USDC-FUTURES" (optional)
    #[serde(rename = "productType", skip_serializing_if = "Option::is_none")]
    pub product_type: Option<String>,

    /// Margin coin (e.g., "USDT")
    #[serde(rename = "marginCoin")]
    pub margin_coin: String,

    /// Margin size
    #[serde(rename = "marginSize")]
    pub margin_size: String,

    /// Position side: "long", "short", "net"
    #[serde(rename = "holdSide")]
    pub hold_side: String,

    /// Opening average price
    #[serde(rename = "openAvgPrice", alias = "openPriceAvg")]
    pub open_avg_price: String,

    /// Position quantity (in contracts/coins)
    #[serde(rename = "total")]
    pub total: String,

    /// Available quantity to close
    pub available: String,

    /// Locked quantity
    pub locked: String,

    /// Leverage
    pub leverage: String,

    /// Liquidation price
    #[serde(rename = "liquidationPrice")]
    pub liquidation_price: String,

    /// Mark price (current market price)
    #[serde(rename = "markPrice")]
    pub mark_price: String,

    /// Unrealized PnL
    #[serde(rename = "unrealizedPL", alias = "unrealizedPnL")]
    pub unrealized_pnl: String,

    /// Realized PnL
    #[serde(rename = "achievedProfits", skip_serializing_if = "Option::is_none")]
    pub achieved_profits: Option<String>,

    /// Margin mode: "crossed", "isolated"
    #[serde(rename = "marginMode")]
    pub margin_mode: String,

    /// Position mode: "hedge_mode", "one_way_mode"
    #[serde(rename = "posMode", skip_serializing_if = "Option::is_none")]
    pub pos_mode: Option<String>,

    /// Creation time (Unix milliseconds)
    #[serde(rename = "cTime")]
    pub c_time: String,

    /// Update time (Unix milliseconds)
    #[serde(rename = "uTime")]
    pub u_time: String,
}

/// Request for all positions
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AllPositionsRequest {
    /// Product type (required)
    #[serde(rename = "productType")]
    pub product_type: String,

    /// Margin coin (optional, e.g. "USDT")
    #[serde(rename = "marginCoin", skip_serializing_if = "Option::is_none")]
    pub margin_coin: Option<String>,
}

/// Request for pending orders
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PendingOrdersRequest {
    /// Product type (required)
    #[serde(rename = "productType")]
    pub product_type: String,

    /// Symbol (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub symbol: Option<String>,

    /// Order ID (optional)
    #[serde(rename = "orderId", skip_serializing_if = "Option::is_none")]
    pub order_id: Option<String>,
}

/// BitGet pending orders data wrapper
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PendingOrdersData {
    #[serde(rename = "entrustedList", default)]
    pub entrusted_list: Option<Vec<BitgetPendingOrder>>,
    #[serde(rename = "endId")]
    pub end_id: Option<String>,
}

/// BitGet pending order
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BitgetPendingOrder {
    /// User ID
    #[serde(rename = "userId", skip_serializing_if = "Option::is_none")]
    pub user_id: Option<String>,

    /// Symbol (e.g., "BTCUSDT")
    pub symbol: String,

    /// Product type: "USDT-FUTURES", "COIN-FUTURES", "USDC-FUTURES"
    #[serde(rename = "productType", skip_serializing_if = "Option::is_none")]
    pub product_type: Option<String>,

    /// Margin coin
    #[serde(rename = "marginCoin", skip_serializing_if = "Option::is_none")]
    pub margin_coin: Option<String>,

    /// Order ID
    #[serde(rename = "orderId")]
    pub order_id: String,

    /// Client order ID
    #[serde(rename = "clientOid", skip_serializing_if = "Option::is_none")]
    pub client_oid: Option<String>,

    /// Order type: "limit", "market"
    #[serde(rename = "orderType")]
    pub order_type: String,

    /// Force type: "normal", "only_maker", "fok", "ioc"
    #[serde(rename = "force", skip_serializing_if = "Option::is_none")]
    pub force: Option<String>,

    /// Price
    pub price: String,

    /// Order size
    pub size: String,

    /// Side: "buy", "sell"
    pub side: String,

    /// Position side: "long", "short", "net"
    #[serde(rename = "posSide", skip_serializing_if = "Option::is_none")]
    pub pos_side: Option<String>,

    /// Trade side: "open", "close"
    #[serde(rename = "tradeSide", skip_serializing_if = "Option::is_none")]
    pub trade_side: Option<String>,

    /// Filled size
    #[serde(rename = "baseVolume", skip_serializing_if = "Option::is_none")]
    pub base_volume: Option<String>,

    /// Leverage
    #[serde(skip_serializing_if = "Option::is_none")]
    pub leverage: Option<String>,

    /// Margin mode: "crossed", "isolated"
    #[serde(rename = "marginMode", skip_serializing_if = "Option::is_none")]
    pub margin_mode: Option<String>,

    /// Reduce only
    #[serde(rename = "reduceOnly", skip_serializing_if = "Option::is_none")]
    pub reduce_only: Option<String>,

    /// Order status: "new", "partial_fill", "full_fill", "cancelled"
    pub status: String,

    /// Price average (for filled portion)
    #[serde(rename = "priceAvg", skip_serializing_if = "Option::is_none")]
    pub price_avg: Option<String>,

    /// Creation time (Unix milliseconds)
    #[serde(rename = "cTime")]
    pub c_time: String,

    /// Update time (Unix milliseconds)
    #[serde(rename = "uTime", skip_serializing_if = "Option::is_none")]
    pub u_time: Option<String>,
}
