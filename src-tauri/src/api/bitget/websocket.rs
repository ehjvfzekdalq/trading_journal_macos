use base64::{engine::general_purpose, Engine as _};
use futures::{SinkExt, StreamExt};
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::time::{interval, Duration};
use tokio_tungstenite::{connect_async, tungstenite::Message};

type HmacSha256 = Hmac<Sha256>;

const WS_URL: &str = "wss://ws.bitget.com/v2/ws/private";

/// WebSocket message types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "op")]
pub enum WsMessage {
    #[serde(rename = "login")]
    Login { args: Vec<LoginArgs> },
    #[serde(rename = "subscribe")]
    Subscribe { args: Vec<SubscribeArgs> },
    #[serde(rename = "unsubscribe")]
    Unsubscribe { args: Vec<SubscribeArgs> },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoginArgs {
    #[serde(rename = "apiKey")]
    pub api_key: String,
    #[serde(rename = "passphrase")]
    pub passphrase: String,
    #[serde(rename = "timestamp")]
    pub timestamp: String,
    #[serde(rename = "sign")]
    pub sign: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubscribeArgs {
    #[serde(rename = "instType")]
    pub inst_type: String,
    #[serde(rename = "channel")]
    pub channel: String,
    #[serde(rename = "instId", skip_serializing_if = "Option::is_none")]
    pub inst_id: Option<String>,
}

/// WebSocket response message
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsResponse {
    pub event: Option<String>,
    pub code: Option<String>,
    pub msg: Option<String>,
    pub arg: Option<ResponseArg>,
    pub data: Option<Vec<serde_json::Value>>,
    pub action: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResponseArg {
    #[serde(rename = "instType")]
    pub inst_type: Option<String>,
    #[serde(rename = "channel")]
    pub channel: Option<String>,
    #[serde(rename = "instId")]
    pub inst_id: Option<String>,
}

/// Position data from WebSocket
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PositionData {
    #[serde(rename = "posId")]
    pub pos_id: String,
    #[serde(rename = "instId")]
    pub inst_id: String,
    #[serde(rename = "instType")]
    pub inst_type: String,
    #[serde(rename = "marginCoin")]
    pub margin_coin: String,
    #[serde(rename = "marginSize")]
    pub margin_size: String,
    #[serde(rename = "marginMode")]
    pub margin_mode: String,
    #[serde(rename = "holdSide")]
    pub hold_side: String, // "long", "short"
    #[serde(rename = "holdMode")]
    pub hold_mode: String,
    #[serde(rename = "total")]
    pub total: String,
    #[serde(rename = "available")]
    pub available: String,
    #[serde(rename = "locked")]
    pub locked: String,
    #[serde(rename = "averageOpenPrice")]
    pub average_open_price: String,
    #[serde(rename = "leverage")]
    pub leverage: String,
    #[serde(rename = "achievedProfits")]
    pub achieved_profits: String,
    #[serde(rename = "unrealizedPL")]
    pub unrealized_pl: String,
    #[serde(rename = "unrealizedPLR")]
    pub unrealized_plr: String,
    #[serde(rename = "liqPx")]
    pub liq_px: String,
    #[serde(rename = "keepMarginRate")]
    pub keep_margin_rate: String,
    #[serde(rename = "marketPrice")]
    pub market_price: String,
    #[serde(rename = "cTime")]
    pub c_time: String,
    #[serde(rename = "uTime")]
    pub u_time: String,
}

/// Position change event
#[derive(Debug, Clone)]
pub enum PositionEvent {
    Opened(PositionData),
    Updated(PositionData),
    Closed(PositionData),
}

/// WebSocket client for Bitget
pub struct BitgetWebSocketClient {
    api_key: String,
    api_secret: String,
    passphrase: String,
    positions: Arc<Mutex<std::collections::HashMap<String, PositionData>>>,
}

impl BitgetWebSocketClient {
    pub fn new(api_key: String, api_secret: String, passphrase: String) -> Self {
        Self {
            api_key,
            api_secret,
            passphrase,
            positions: Arc::new(Mutex::new(std::collections::HashMap::new())),
        }
    }

    /// Generate signature for WebSocket login
    fn generate_signature(&self, timestamp: &str) -> String {
        let prehash = format!("{}GET/user/verify", timestamp);
        let mut mac = HmacSha256::new_from_slice(self.api_secret.as_bytes())
            .expect("HMAC can take key of any size");
        mac.update(prehash.as_bytes());
        let result = mac.finalize();
        general_purpose::STANDARD.encode(result.into_bytes())
    }

    /// Connect to WebSocket and authenticate
    pub async fn connect<F>(
        &self,
        mut event_handler: F,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>>
    where
        F: FnMut(PositionEvent) + Send + 'static,
    {
        let (ws_stream, _) = connect_async(WS_URL).await?;
        println!("WebSocket connected to {}", WS_URL);

        let (mut write, mut read) = ws_stream.split();

        // Send login message
        let timestamp = chrono::Utc::now().timestamp().to_string();
        let signature = self.generate_signature(&timestamp);

        let login_msg = WsMessage::Login {
            args: vec![LoginArgs {
                api_key: self.api_key.clone(),
                passphrase: self.passphrase.clone(),
                timestamp,
                sign: signature,
            }],
        };

        let login_json = serde_json::to_string(&login_msg)?;
        write.send(Message::Text(login_json)).await?;
        println!("Login message sent");

        // Wait for login response
        if let Some(msg) = read.next().await {
            match msg? {
                Message::Text(text) => {
                    println!("Login response: {}", text);
                    let response: WsResponse = serde_json::from_str(&text)?;
                    if response.event == Some("login".to_string())
                        && response.code == Some("0".to_string())
                    {
                        println!("Successfully logged in to WebSocket");
                    } else {
                        return Err(format!("Login failed: {:?}", response.msg).into());
                    }
                }
                _ => return Err("Unexpected message type during login".into()),
            }
        }

        // Subscribe to positions channel
        let subscribe_msg = WsMessage::Subscribe {
            args: vec![SubscribeArgs {
                inst_type: "USDT-FUTURES".to_string(),
                channel: "positions".to_string(),
                inst_id: None, // Subscribe to all positions
            }],
        };

        let subscribe_json = serde_json::to_string(&subscribe_msg)?;
        write.send(Message::Text(subscribe_json)).await?;
        println!("Subscribed to positions channel");

        // Clone positions for the reader task
        let positions = Arc::clone(&self.positions);

        // Spawn ping task
        let write = Arc::new(Mutex::new(write));
        let write_clone = Arc::clone(&write);
        tokio::spawn(async move {
            let mut ping_interval = interval(Duration::from_secs(30));
            loop {
                ping_interval.tick().await;
                let mut write = write_clone.lock().await;
                if let Err(e) = write.send(Message::Text("ping".to_string())).await {
                    eprintln!("Failed to send ping: {}", e);
                    break;
                }
            }
        });

        // Read messages
        while let Some(msg) = read.next().await {
            match msg {
                Ok(Message::Text(text)) => {
                    if text == "pong" {
                        continue;
                    }

                    // Parse response
                    match serde_json::from_str::<WsResponse>(&text) {
                        Ok(response) => {
                            // Handle subscription confirmation
                            if response.event == Some("subscribe".to_string()) {
                                println!("Subscription confirmed: {:?}", response.arg);
                                continue;
                            }

                            // Handle position updates
                            if let Some(data) = response.data {
                                if let Some(arg) = &response.arg {
                                    if arg.channel == Some("positions".to_string()) {
                                        for item in data {
                                            match serde_json::from_value::<PositionData>(item) {
                                                Ok(position) => {
                                                    let event =
                                                        self.process_position_update(position, &positions)
                                                            .await;
                                                    if let Some(event) = event {
                                                        event_handler(event);
                                                    }
                                                }
                                                Err(e) => {
                                                    eprintln!(
                                                        "Failed to parse position data: {}",
                                                        e
                                                    );
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        Err(e) => {
                            eprintln!("Failed to parse WebSocket message: {} - Text: {}", e, text);
                        }
                    }
                }
                Ok(Message::Ping(_)) => {
                    let mut write = write.lock().await;
                    write.send(Message::Pong(vec![])).await?;
                }
                Ok(Message::Close(_)) => {
                    println!("WebSocket connection closed");
                    break;
                }
                Err(e) => {
                    eprintln!("WebSocket error: {}", e);
                    break;
                }
                _ => {}
            }
        }

        Ok(())
    }

    /// Process position update and detect changes
    async fn process_position_update(
        &self,
        position: PositionData,
        positions: &Arc<Mutex<std::collections::HashMap<String, PositionData>>>,
    ) -> Option<PositionEvent> {
        let mut positions_map = positions.lock().await;
        let pos_id = position.pos_id.clone();

        // Parse total position size
        let total: f64 = position.total.parse().unwrap_or(0.0);

        // Check if position is closed (total = 0)
        if total == 0.0 {
            if let Some(old_position) = positions_map.remove(&pos_id) {
                return Some(PositionEvent::Closed(old_position));
            }
            return None;
        }

        // Check if this is a new position
        if let Some(_old_position) = positions_map.get(&pos_id) {
            // Position exists - this is an update
            positions_map.insert(pos_id, position.clone());
            Some(PositionEvent::Updated(position))
        } else {
            // New position opened
            positions_map.insert(pos_id, position.clone());
            Some(PositionEvent::Opened(position))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_signature() {
        let client = BitgetWebSocketClient::new(
            "test_key".to_string(),
            "test_secret".to_string(),
            "test_pass".to_string(),
        );
        let timestamp = "1234567890";
        let signature = client.generate_signature(timestamp);
        assert!(!signature.is_empty());
    }
}
