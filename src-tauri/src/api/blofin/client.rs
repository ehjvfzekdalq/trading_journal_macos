use async_trait::async_trait;
use base64::{engine::general_purpose, Engine as _};
use hmac::{Hmac, Mac};
use reqwest::header::{HeaderMap, HeaderValue};
use sha2::Sha256;
use uuid::Uuid;

use crate::api::{
    client::{ExchangeClient, FetchTradesRequest, FetchTradesResponse, RateLimitConfig},
    error::ApiError,
    rate_limiter::RateLimiter,
};

use super::{
    mapper::map_trade_to_raw_trade,
    types::{BlofinResponse, BlofinTrade, TradeHistoryRequest},
};

type HmacSha256 = Hmac<Sha256>;

const BASE_URL: &str = "https://openapi.blofin.com";
const TRADE_HISTORY_ENDPOINT: &str = "/api/v1/trade/trade-history";

pub struct BlofinClient {
    api_key: String,
    api_secret: String,
    passphrase: String,
    http_client: reqwest::Client,
    rate_limiter: RateLimiter,
}

impl BlofinClient {
    pub fn new(api_key: String, api_secret: String, passphrase: String) -> Self {
        // BloFin: 30 req/10s = 3 req/s
        let rate_limiter = RateLimiter::new(RateLimitConfig {
            requests_per_second: 3,
            burst_size: 5,
        });

        Self {
            api_key,
            api_secret,
            passphrase,
            http_client: reqwest::Client::new(),
            rate_limiter,
        }
    }

    /// Generate HMAC-SHA256 signature for BloFin API
    fn generate_signature(
        &self,
        timestamp: &str,
        method: &str,
        request_path: &str,
        body: &str,
    ) -> String {
        // Prehash string: timestamp + method + requestPath + body
        let prehash = format!("{}{}{}{}", timestamp, method, request_path, body);

        // HMAC-SHA256
        let mut mac = HmacSha256::new_from_slice(self.api_secret.as_bytes())
            .expect("HMAC can take key of any size");
        mac.update(prehash.as_bytes());
        let result = mac.finalize();

        // Base64 encode
        general_purpose::STANDARD.encode(result.into_bytes())
    }

    /// Build authenticated headers for BloFin API
    fn build_headers(&self, timestamp: &str, signature: &str, nonce: &str) -> Result<HeaderMap, ApiError> {
        let mut headers = HeaderMap::new();
        headers.insert("Content-Type", HeaderValue::from_static("application/json"));
        headers.insert(
            "ACCESS-KEY",
            HeaderValue::from_str(&self.api_key)
                .map_err(|e| ApiError::AuthenticationError(format!("Invalid API key: {}", e)))?,
        );
        headers.insert(
            "ACCESS-SIGN",
            HeaderValue::from_str(signature)
                .map_err(|e| ApiError::AuthenticationError(format!("Invalid signature: {}", e)))?,
        );
        headers.insert(
            "ACCESS-TIMESTAMP",
            HeaderValue::from_str(timestamp)
                .map_err(|e| ApiError::AuthenticationError(format!("Invalid timestamp: {}", e)))?,
        );
        headers.insert(
            "ACCESS-PASSPHRASE",
            HeaderValue::from_str(&self.passphrase)
                .map_err(|e| ApiError::AuthenticationError(format!("Invalid passphrase: {}", e)))?,
        );
        headers.insert(
            "ACCESS-NONCE",
            HeaderValue::from_str(nonce)
                .map_err(|e| ApiError::AuthenticationError(format!("Invalid nonce: {}", e)))?,
        );

        Ok(headers)
    }

    /// Fetch trade history with pagination
    async fn fetch_trade_history(&self, request: &TradeHistoryRequest) -> Result<Vec<BlofinTrade>, ApiError> {
        // Rate limit
        self.rate_limiter.acquire().await;

        // Current timestamp in ISO 8601 format
        let timestamp = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);

        // Generate nonce (UUID v4)
        let nonce = Uuid::new_v4().to_string();

        // Build query string
        let mut query_params = vec![];
        if let Some(ref inst_type) = request.inst_type {
            query_params.push(format!("instType={}", inst_type));
        }
        if let Some(ref inst_id) = request.inst_id {
            query_params.push(format!("instId={}", inst_id));
        }
        if let Some(ref ord_id) = request.ord_id {
            query_params.push(format!("ordId={}", ord_id));
        }
        if let Some(ref after) = request.after {
            query_params.push(format!("after={}", after));
        }
        if let Some(ref before) = request.before {
            query_params.push(format!("before={}", before));
        }
        if let Some(ref begin) = request.begin {
            query_params.push(format!("begin={}", begin));
        }
        if let Some(ref end) = request.end {
            query_params.push(format!("end={}", end));
        }
        if let Some(ref limit) = request.limit {
            query_params.push(format!("limit={}", limit));
        }

        let query_string = if query_params.is_empty() {
            String::new()
        } else {
            format!("?{}", query_params.join("&"))
        };

        let request_path = format!("{}{}", TRADE_HISTORY_ENDPOINT, query_string);

        // Generate signature (GET request, empty body)
        let signature = self.generate_signature(&timestamp, "GET", &request_path, "");

        // Build headers
        let headers = self.build_headers(&timestamp, &signature, &nonce)?;

        // Make request
        let url = format!("{}{}", BASE_URL, request_path);
        let response = self
            .http_client
            .get(&url)
            .headers(headers)
            .send()
            .await?;

        // Check status code
        let status = response.status();
        if status == 429 {
            return Err(ApiError::RateLimitError(
                "Rate limit exceeded. Please wait before retrying.".to_string(),
            ));
        }

        if status == 401 || status == 403 {
            return Err(ApiError::AuthenticationError(
                "Invalid API credentials or permissions".to_string(),
            ));
        }

        // Parse response
        let response_text = response.text().await?;
        let api_response: BlofinResponse<BlofinTrade> = serde_json::from_str(&response_text)
            .map_err(|e| ApiError::ParseError(format!("Failed to parse response: {} - Body: {}", e, response_text)))?;

        // Check response code
        if api_response.code != "0" {
            return Err(ApiError::ExchangeError {
                code: api_response.code,
                message: api_response.msg,
            });
        }

        Ok(api_response.data.unwrap_or_default())
    }
}

#[async_trait]
impl ExchangeClient for BlofinClient {
    fn exchange_name(&self) -> &str {
        "blofin"
    }

    async fn fetch_trades(&self, request: FetchTradesRequest) -> Result<FetchTradesResponse, ApiError> {
        let mut all_raw_trades = Vec::new();
        let mut current_cursor = request.cursor.clone();
        let limit = request.limit.unwrap_or(100);

        loop {
            let blofin_request = TradeHistoryRequest {
                inst_type: Some("SWAP".to_string()), // Perpetual futures
                inst_id: request.symbol.clone(),
                ord_id: None,
                after: current_cursor.clone(),
                before: None,
                begin: request.start_time.map(|ts| ts.to_string()),
                end: request.end_time.map(|ts| ts.to_string()),
                limit: Some("100".to_string()), // Max per request
            };

            let trades = self.fetch_trade_history(&blofin_request).await?;

            // Map trades to raw trades
            for trade in &trades {
                match map_trade_to_raw_trade(trade) {
                    Ok(raw_trade) => all_raw_trades.push(raw_trade),
                    Err(e) => {
                        eprintln!("Warning: Failed to map BloFin trade: {}", e);
                    }
                }
            }

            // Check if we should continue pagination
            let has_more = !trades.is_empty() && trades.len() == 100;
            let next_cursor = trades.last().map(|t| t.trade_id.clone());

            if !has_more || all_raw_trades.len() >= limit as usize {
                return Ok(FetchTradesResponse {
                    trades: all_raw_trades,
                    next_cursor,
                    has_more,
                });
            }

            current_cursor = next_cursor;
        }
    }

    async fn test_credentials(&self) -> Result<bool, ApiError> {
        // Test with a minimal request (fetch 1 trade)
        let request = TradeHistoryRequest {
            inst_type: Some("SWAP".to_string()),
            inst_id: None,
            ord_id: None,
            after: None,
            before: None,
            begin: None,
            end: None,
            limit: Some("1".to_string()),
        };

        match self.fetch_trade_history(&request).await {
            Ok(_) => Ok(true),
            Err(ApiError::AuthenticationError(_)) => Ok(false),
            Err(e) => Err(e),
        }
    }

    fn rate_limit(&self) -> RateLimitConfig {
        RateLimitConfig {
            requests_per_second: 3,
            burst_size: 5,
        }
    }
}
