use super::types::BitgetFill;
use crate::api::client::RawTrade;

/// Map BitGet fill to RawTrade
pub fn map_fill_to_raw_trade(fill: &BitgetFill) -> Result<RawTrade, String> {
    // Parse price
    let entry_price = fill
        .price_avg
        .parse::<f64>()
        .map_err(|e| format!("Invalid price: {}", e))?;

    // Parse quantity
    let quantity = fill
        .size
        .parse::<f64>()
        .map_err(|e| format!("Invalid size: {}", e))?;

    // Parse PNL (profit field, may be None for opening positions)
    let pnl = fill
        .profit
        .as_ref()
        .and_then(|p| p.parse::<f64>().ok())
        .unwrap_or(0.0);

    // Parse fee (sum all fees from the array)
    let fee = fill
        .fee_detail
        .as_ref()
        .map(|fees| {
            fees.iter()
                .filter_map(|fd| fd.total_fee.as_ref())
                .filter_map(|f| f.parse::<f64>().ok())
                .sum::<f64>()
                .abs() // Take absolute value as fees are negative
        })
        .unwrap_or(0.0);

    // Parse timestamp
    let timestamp = fill
        .c_time
        .parse::<i64>()
        .map_err(|e| format!("Invalid timestamp: {}", e))?;

    // Determine exit price and close timestamp
    // If profit exists and is non-zero, this is a closing trade
    let (exit_price, close_timestamp) = if fill.profit.is_some() && pnl.abs() > 0.01 {
        (Some(entry_price), Some(timestamp))
    } else {
        (None, None)
    };

    // Map position side (use pos_side if available, otherwise infer from side or pos_mode)
    let position_side = if let Some(ref pos_side) = fill.pos_side {
        match pos_side.as_str() {
            "long" => "LONG",
            "short" => "SHORT",
            "net" => {
                // Infer from side
                if fill.side == "buy" {
                    "LONG"
                } else {
                    "SHORT"
                }
            }
            _ => "LONG", // Default
        }
    } else {
        // No pos_side, infer from side
        if fill.side == "buy" {
            "LONG"
        } else {
            "SHORT"
        }
    };

    // Serialize raw JSON for audit trail
    let raw_json = serde_json::to_string(&fill)
        .map_err(|e| format!("Failed to serialize fill: {}", e))?;

    Ok(RawTrade {
        exchange_trade_id: fill.trade_id.clone(),
        exchange_order_id: fill.order_id.clone(),
        symbol: fill.symbol.clone(),
        side: fill.side.clone(),
        position_side: position_side.to_string(),
        quantity,
        entry_price,
        exit_price,
        pnl,
        fee,
        leverage: None, // BitGet doesn't provide leverage in fill history
        timestamp,
        close_timestamp,
        raw_json,
    })
}

/// Generate fingerprint for deduplication
pub fn generate_fingerprint(fill: &BitgetFill) -> String {
    // Format: api|bitget|{trade_id}|{order_id}|{symbol}|{qty}|{pnl}|{timestamp}
    let pnl = fill
        .profit
        .as_ref()
        .and_then(|p| p.parse::<f64>().ok())
        .unwrap_or(0.0);

    format!(
        "api|bitget|{}|{}|{}|{}|{:.8}|{}",
        fill.trade_id,
        fill.order_id,
        fill.symbol.to_lowercase(),
        fill.size,
        pnl,
        fill.c_time
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::bitget::types::BitgetFeeDetail;

    #[test]
    fn test_map_opening_position() {
        let fill = BitgetFill {
            user_id: Some("12345".to_string()),
            symbol: "BTCUSDT".to_string(),
            product_type: Some("USDT-FUTURES".to_string()),
            order_id: "order123".to_string(),
            trade_id: "trade456".to_string(),
            order_type: Some("market".to_string()),
            side: "buy".to_string(),
            pos_side: Some("long".to_string()),
            pos_mode: None,
            price_avg: "50000.00".to_string(),
            size: "0.1".to_string(),
            amount: Some("5000.00".to_string()),
            trade_side: None,
            trade_scope: None,
            margin_coin: None,
            fee_detail: Some(vec![BitgetFeeDetail {
                deduction: Some("no".to_string()),
                fee_coin: Some("USDT".to_string()),
                total_deduction_fee: Some("0".to_string()),
                total_fee: Some("-2.5".to_string()),
            }]),
            profit: None,
            c_time: "1704067200000".to_string(),
            u_time: Some("1704067200000".to_string()),
        };

        let raw = map_fill_to_raw_trade(&fill).unwrap();
        assert_eq!(raw.entry_price, 50000.0);
        assert_eq!(raw.quantity, 0.1);
        assert_eq!(raw.pnl, 0.0);
        assert_eq!(raw.fee, 2.5);
        assert_eq!(raw.position_side, "LONG");
        assert_eq!(raw.exit_price, None);
        assert_eq!(raw.close_timestamp, None);
    }

    #[test]
    fn test_map_closing_position() {
        let fill = BitgetFill {
            user_id: Some("12345".to_string()),
            symbol: "ETHUSDT".to_string(),
            product_type: Some("USDT-FUTURES".to_string()),
            order_id: "order789".to_string(),
            trade_id: "trade101".to_string(),
            order_type: Some("limit".to_string()),
            side: "sell".to_string(),
            pos_side: Some("long".to_string()),
            pos_mode: None,
            price_avg: "3500.00".to_string(),
            size: "2.0".to_string(),
            amount: Some("7000.00".to_string()),
            trade_side: Some("close".to_string()),
            trade_scope: None,
            margin_coin: None,
            fee_detail: Some(vec![BitgetFeeDetail {
                deduction: Some("no".to_string()),
                fee_coin: Some("USDT".to_string()),
                total_deduction_fee: Some("0".to_string()),
                total_fee: Some("-3.5".to_string()),
            }]),
            profit: Some("156.50".to_string()),
            c_time: "1704153600000".to_string(),
            u_time: Some("1704153600000".to_string()),
        };

        let raw = map_fill_to_raw_trade(&fill).unwrap();
        assert_eq!(raw.pnl, 156.5);
        assert_eq!(raw.exit_price, Some(3500.0));
        assert_eq!(raw.close_timestamp, Some(1704153600000));
    }

    #[test]
    fn test_generate_fingerprint() {
        let fill = BitgetFill {
            user_id: Some("12345".to_string()),
            symbol: "BTCUSDT".to_string(),
            product_type: Some("USDT-FUTURES".to_string()),
            order_id: "order123".to_string(),
            trade_id: "trade456".to_string(),
            order_type: Some("market".to_string()),
            side: "buy".to_string(),
            pos_side: Some("long".to_string()),
            pos_mode: None,
            price_avg: "50000.00".to_string(),
            size: "0.1".to_string(),
            amount: Some("5000.00".to_string()),
            trade_side: None,
            trade_scope: None,
            margin_coin: None,
            fee_detail: None,
            profit: Some("100.50".to_string()),
            c_time: "1704067200000".to_string(),
            u_time: Some("1704067200000".to_string()),
        };

        let fingerprint = generate_fingerprint(&fill);
        assert!(fingerprint.starts_with("api|bitget|"));
        assert!(fingerprint.contains("trade456"));
        assert!(fingerprint.contains("order123"));
        assert!(fingerprint.contains("btcusdt"));
    }
}
