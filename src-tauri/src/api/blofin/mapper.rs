use super::types::BlofinTrade;
use crate::api::client::RawTrade;

/// Map BloFin trade to RawTrade
pub fn map_trade_to_raw_trade(trade: &BlofinTrade) -> Result<RawTrade, String> {
    // Parse price
    let entry_price = trade
        .fill_px
        .parse::<f64>()
        .map_err(|e| format!("Invalid price: {}", e))?;

    // Parse quantity
    let quantity = trade
        .fill_sz
        .parse::<f64>()
        .map_err(|e| format!("Invalid size: {}", e))?;

    // Parse fee (BloFin uses negative for fees charged)
    let fee = trade
        .fee
        .parse::<f64>()
        .map_err(|e| format!("Invalid fee: {}", e))?
        .abs(); // Take absolute value

    // Parse timestamp
    let timestamp = trade
        .ts
        .parse::<i64>()
        .map_err(|e| format!("Invalid timestamp: {}", e))?;

    // BloFin doesn't provide PnL in trade history directly
    // This needs to be calculated from position tracking or set to 0
    let pnl = 0.0;

    // Determine exit price and close timestamp
    // For BloFin, we need to track positions externally
    // For now, set to None (will be handled in trade aggregation)
    let exit_price = None;
    let close_timestamp = None;

    // Map position side
    let position_side = match trade.pos_side.as_str() {
        "long" => "LONG",
        "short" => "SHORT",
        "net" => {
            // Infer from side
            if trade.side == "buy" {
                "LONG"
            } else {
                "SHORT"
            }
        }
        _ => "LONG", // Default
    };

    // Serialize raw JSON for audit trail
    let raw_json = serde_json::to_string(&trade)
        .map_err(|e| format!("Failed to serialize trade: {}", e))?;

    Ok(RawTrade {
        exchange_trade_id: trade.trade_id.clone(),
        exchange_order_id: trade.order_id.clone(),
        symbol: trade.inst_id.clone(),
        side: trade.side.clone(),
        position_side: position_side.to_string(),
        quantity,
        entry_price,
        exit_price,
        pnl,
        fee,
        leverage: None, // BloFin doesn't provide leverage in trade history
        timestamp,
        close_timestamp,
        raw_json,
    })
}

/// Generate fingerprint for deduplication
pub fn generate_fingerprint(trade: &BlofinTrade) -> String {
    // Format: api|blofin|{trade_id}|{order_id}|{symbol}|{qty}|{pnl}|{timestamp}
    format!(
        "api|blofin|{}|{}|{}|{}|0.00000000|{}",
        trade.trade_id,
        trade.order_id,
        trade.inst_id.to_lowercase(),
        trade.fill_sz,
        trade.ts
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_map_trade() {
        let trade = BlofinTrade {
            inst_id: "BTC-USDT-SWAP".to_string(),
            trade_id: "123456".to_string(),
            order_id: "789012".to_string(),
            cl_ord_id: None,
            bill_id: "bill123".to_string(),
            fill_px: "50000.00".to_string(),
            fill_sz: "0.1".to_string(),
            side: "buy".to_string(),
            pos_side: "long".to_string(),
            exec_type: "T".to_string(),
            fee: "-2.5".to_string(),
            fee_ccy: "USDT".to_string(),
            ts: "1704067200000".to_string(),
        };

        let raw = map_trade_to_raw_trade(&trade).unwrap();
        assert_eq!(raw.entry_price, 50000.0);
        assert_eq!(raw.quantity, 0.1);
        assert_eq!(raw.fee, 2.5); // Absolute value
        assert_eq!(raw.position_side, "LONG");
        assert_eq!(raw.timestamp, 1704067200000);
    }

    #[test]
    fn test_generate_fingerprint() {
        let trade = BlofinTrade {
            inst_id: "ETH-USDT-SWAP".to_string(),
            trade_id: "trade789".to_string(),
            order_id: "order456".to_string(),
            cl_ord_id: None,
            bill_id: "bill456".to_string(),
            fill_px: "3500.00".to_string(),
            fill_sz: "2.0".to_string(),
            side: "sell".to_string(),
            pos_side: "long".to_string(),
            exec_type: "M".to_string(),
            fee: "-3.5".to_string(),
            fee_ccy: "USDT".to_string(),
            ts: "1704153600000".to_string(),
        };

        let fingerprint = generate_fingerprint(&trade);
        assert!(fingerprint.starts_with("api|blofin|"));
        assert!(fingerprint.contains("trade789"));
        assert!(fingerprint.contains("order456"));
        assert!(fingerprint.contains("eth-usdt-swap"));
    }

    #[test]
    fn test_infer_position_from_side() {
        let trade = BlofinTrade {
            inst_id: "BTC-USDT-SWAP".to_string(),
            trade_id: "123".to_string(),
            order_id: "456".to_string(),
            cl_ord_id: None,
            bill_id: "bill123".to_string(),
            fill_px: "50000.00".to_string(),
            fill_sz: "0.1".to_string(),
            side: "sell".to_string(),
            pos_side: "net".to_string(), // Net mode
            exec_type: "T".to_string(),
            fee: "-1.0".to_string(),
            fee_ccy: "USDT".to_string(),
            ts: "1704067200000".to_string(),
        };

        let raw = map_trade_to_raw_trade(&trade).unwrap();
        assert_eq!(raw.position_side, "SHORT"); // Inferred from sell
    }
}
