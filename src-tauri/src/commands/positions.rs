use tauri::State;
use serde::{Deserialize, Serialize};
use crate::db::Database;
use crate::api::{
    bitget::{BitgetClient, types::{AllPositionsRequest, BitgetPosition}},
    credentials::{retrieve_api_key, retrieve_api_secret, retrieve_passphrase},
};

/// Position information for frontend display
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Position {
    pub position_id: String,
    pub symbol: String,
    pub exchange: String,
    pub position_side: String,
    pub entry_price: f64,
    pub current_price: f64,
    pub quantity: f64,
    pub leverage: i32,
    pub unrealized_pnl: f64,
    pub unrealized_pnl_percent: f64,
    pub liquidation_price: f64,
    pub margin: f64,
    pub margin_mode: String,
    pub price_distance_to_liquidation_percent: f64,
    pub created_at: i64,
    pub updated_at: i64,
}

impl Position {
    /// Convert BitgetPosition to Position
    fn from_bitget(bitget_pos: &BitgetPosition, exchange: &str) -> Result<Self, String> {
        let entry_price = bitget_pos.open_avg_price.parse::<f64>()
            .map_err(|e| format!("Invalid entry price: {}", e))?;
        let current_price = bitget_pos.mark_price.parse::<f64>()
            .map_err(|e| format!("Invalid mark price: {}", e))?;
        let quantity = bitget_pos.total.parse::<f64>()
            .map_err(|e| format!("Invalid quantity: {}", e))?;
        let leverage = bitget_pos.leverage.parse::<i32>()
            .map_err(|e| format!("Invalid leverage: {}", e))?;
        let unrealized_pnl = bitget_pos.unrealized_pnl.parse::<f64>()
            .map_err(|e| format!("Invalid unrealized PnL: {}", e))?;
        let liquidation_price = bitget_pos.liquidation_price.parse::<f64>()
            .map_err(|e| format!("Invalid liquidation price: {}", e))?;
        let margin = bitget_pos.margin_size.parse::<f64>()
            .map_err(|e| format!("Invalid margin: {}", e))?;
        let created_at = bitget_pos.c_time.parse::<i64>()
            .map_err(|e| format!("Invalid creation time: {}", e))?;
        let updated_at = bitget_pos.u_time.parse::<i64>()
            .map_err(|e| format!("Invalid update time: {}", e))?;

        // Calculate unrealized PnL percentage (based on margin)
        let unrealized_pnl_percent = if margin > 0.0 {
            (unrealized_pnl / margin) * 100.0
        } else {
            0.0
        };

        // Calculate distance to liquidation as percentage
        let price_distance_to_liquidation_percent = if current_price > 0.0 {
            ((current_price - liquidation_price).abs() / current_price) * 100.0
        } else {
            0.0
        };

        // Normalize position side
        let position_side = match bitget_pos.hold_side.to_lowercase().as_str() {
            "long" | "net" => "LONG".to_string(),
            "short" => "SHORT".to_string(),
            _ => bitget_pos.hold_side.to_uppercase(),
        };

        // Generate position ID if not provided by API
        let position_id = bitget_pos.pos_id.clone().unwrap_or_else(|| {
            format!("{}_{}", bitget_pos.symbol, bitget_pos.hold_side)
        });

        Ok(Position {
            position_id,
            symbol: bitget_pos.symbol.clone(),
            exchange: exchange.to_string(),
            position_side,
            entry_price,
            current_price,
            quantity,
            leverage,
            unrealized_pnl,
            unrealized_pnl_percent,
            liquidation_price,
            margin,
            margin_mode: bitget_pos.margin_mode.clone(),
            price_distance_to_liquidation_percent,
            created_at,
            updated_at,
        })
    }
}

/// Fetch current open positions from exchange
#[tauri::command]
pub async fn fetch_current_positions(
    db: State<'_, Database>,
    credential_id: String,
) -> Result<Vec<Position>, String> {
    // Fetch credentials
    let (exchange, api_key, api_secret, passphrase) = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;

        // Fetch exchange type
        let exchange: String = conn
            .query_row(
                "SELECT exchange FROM api_credentials WHERE id = ?",
                [&credential_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("Credential not found: {}", e))?;

        // Retrieve credentials from system keychain
        let api_key = retrieve_api_key(&credential_id).map_err(|e| e.to_string())?;
        let api_secret = retrieve_api_secret(&credential_id).map_err(|e| e.to_string())?;
        let passphrase = retrieve_passphrase(&credential_id).unwrap_or_default();

        (exchange, api_key, api_secret, passphrase)
    }; // conn is dropped here

    // Fetch positions based on exchange
    match exchange.as_str() {
        "bitget" => {
            let client = BitgetClient::new(api_key, api_secret, passphrase);
            let request = AllPositionsRequest {
                product_type: "USDT-FUTURES".to_string(),
                margin_coin: Some("USDT".to_string()),
            };

            let positions_data = client.fetch_all_positions(&request).await
                .map_err(|e| e.to_string())?;

            // Convert Bitget positions to generic Position format
            let positions: Result<Vec<Position>, String> = positions_data
                .iter()
                .map(|bitget_pos| Position::from_bitget(bitget_pos, &exchange))
                .collect();

            positions
        }
        "blofin" => {
            // TODO: Implement BloFin position fetching when needed
            Err("BloFin position monitoring not yet implemented".to_string())
        }
        _ => Err(format!("Unsupported exchange: {}", exchange)),
    }
}
