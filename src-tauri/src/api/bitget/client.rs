use async_trait::async_trait;
use base64::{engine::general_purpose, Engine as _};
use hmac::{Hmac, Mac};
use reqwest::header::{HeaderMap, HeaderValue};
use sha2::Sha256;

use crate::api::{
    client::{ExchangeClient, FetchTradesRequest, FetchTradesResponse, RateLimitConfig},
    error::ApiError,
    rate_limiter::RateLimiter,
};

use super::{
    mapper::map_fill_to_raw_trade,
    types::{BitgetResponse, FillHistoryData, FillHistoryRequest, BitgetPosition, AllPositionsRequest, PendingOrdersData, PendingOrdersRequest},
};

type HmacSha256 = Hmac<Sha256>;

const BASE_URL: &str = "https://api.bitget.com";
const FILL_HISTORY_ENDPOINT: &str = "/api/v2/mix/order/fill-history";
const ALL_POSITIONS_ENDPOINT: &str = "/api/v2/mix/position/all-position";
const PENDING_ORDERS_ENDPOINT: &str = "/api/v2/mix/order/orders-pending";

pub struct BitgetClient {
    api_key: String,
    api_secret: String,
    passphrase: String,
    http_client: reqwest::Client,
    rate_limiter: RateLimiter,
}

impl BitgetClient {
    pub fn new(api_key: String, api_secret: String, passphrase: String) -> Self {
        let rate_limiter = RateLimiter::new(RateLimitConfig {
            requests_per_second: 10,
            burst_size: 10,
        });

        Self {
            api_key,
            api_secret,
            passphrase,
            http_client: reqwest::Client::new(),
            rate_limiter,
        }
    }

    /// Generate HMAC-SHA256 signature for BitGet API
    fn generate_signature(&self, timestamp: &str, method: &str, request_path: &str, body: &str) -> String {
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

    /// Build authenticated headers for BitGet API
    fn build_headers(&self, timestamp: &str, signature: &str) -> Result<HeaderMap, ApiError> {
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
        headers.insert("locale", HeaderValue::from_static("en-US"));

        Ok(headers)
    }

    /// Fetch fill history with pagination
    async fn fetch_fill_history(&self, request: &FillHistoryRequest) -> Result<FillHistoryData, ApiError> {
        // Rate limit
        self.rate_limiter.acquire().await;

        // Current timestamp in milliseconds
        let timestamp = chrono::Utc::now().timestamp_millis().to_string();

        // Build query string
        let mut query_params = vec![format!("productType={}", request.product_type)];
        if let Some(ref symbol) = request.symbol {
            query_params.push(format!("symbol={}", symbol));
        }
        if let Some(ref start_time) = request.start_time {
            query_params.push(format!("startTime={}", start_time));
        }
        if let Some(ref end_time) = request.end_time {
            query_params.push(format!("endTime={}", end_time));
        }
        if let Some(ref id_less_than) = request.id_less_than {
            query_params.push(format!("idLessThan={}", id_less_than));
        }
        if let Some(ref limit) = request.limit {
            query_params.push(format!("limit={}", limit));
        }

        let query_string = query_params.join("&");
        let request_path = format!("{}?{}", FILL_HISTORY_ENDPOINT, query_string);

        // Generate signature (GET request, empty body)
        let signature = self.generate_signature(&timestamp, "GET", &request_path, "");

        // Build headers
        let headers = self.build_headers(&timestamp, &signature)?;

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
        let api_response: BitgetResponse<FillHistoryData> = serde_json::from_str(&response_text)
            .map_err(|e| ApiError::ParseError(format!("Failed to parse response: {} - Body: {}", e, response_text)))?;

        // Check response code
        if api_response.code != "00000" {
            return Err(ApiError::ExchangeError {
                code: api_response.code,
                message: api_response.msg,
            });
        }

        api_response.data.ok_or_else(|| {
            ApiError::ParseError("Response data is empty".to_string())
        })
    }

    /// Fetch all current positions
    pub async fn fetch_all_positions(&self, request: &AllPositionsRequest) -> Result<Vec<BitgetPosition>, ApiError> {
        // Rate limit
        self.rate_limiter.acquire().await;

        // Current timestamp in milliseconds
        let timestamp = chrono::Utc::now().timestamp_millis().to_string();

        // Build query string
        let mut query_params = vec![format!("productType={}", request.product_type)];
        if let Some(ref margin_coin) = request.margin_coin {
            query_params.push(format!("marginCoin={}", margin_coin));
        }

        let query_string = query_params.join("&");
        let request_path = format!("{}?{}", ALL_POSITIONS_ENDPOINT, query_string);

        // Generate signature (GET request, empty body)
        let signature = self.generate_signature(&timestamp, "GET", &request_path, "");

        // Build headers
        let headers = self.build_headers(&timestamp, &signature)?;

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
        let api_response: BitgetResponse<Vec<BitgetPosition>> = serde_json::from_str(&response_text)
            .map_err(|e| ApiError::ParseError(format!("Failed to parse response: {} - Body: {}", e, response_text)))?;

        // Check response code
        if api_response.code != "00000" {
            return Err(ApiError::ExchangeError {
                code: api_response.code,
                message: api_response.msg,
            });
        }

        api_response.data.ok_or_else(|| {
            ApiError::ParseError("Response data is empty".to_string())
        })
    }

    /// Fetch pending orders
    pub async fn fetch_pending_orders(&self, request: &PendingOrdersRequest) -> Result<PendingOrdersData, ApiError> {
        // Rate limit
        self.rate_limiter.acquire().await;

        // Current timestamp in milliseconds
        let timestamp = chrono::Utc::now().timestamp_millis().to_string();

        // Build query string
        let mut query_params = vec![format!("productType={}", request.product_type)];
        if let Some(ref symbol) = request.symbol {
            query_params.push(format!("symbol={}", symbol));
        }
        if let Some(ref order_id) = request.order_id {
            query_params.push(format!("orderId={}", order_id));
        }

        let query_string = query_params.join("&");
        let request_path = format!("{}?{}", PENDING_ORDERS_ENDPOINT, query_string);

        // Generate signature (GET request, empty body)
        let signature = self.generate_signature(&timestamp, "GET", &request_path, "");

        // Build headers
        let headers = self.build_headers(&timestamp, &signature)?;

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
        let api_response: BitgetResponse<PendingOrdersData> = serde_json::from_str(&response_text)
            .map_err(|e| ApiError::ParseError(format!("Failed to parse response: {} - Body: {}", e, response_text)))?;

        // Check response code
        if api_response.code != "00000" {
            return Err(ApiError::ExchangeError {
                code: api_response.code,
                message: api_response.msg,
            });
        }

        api_response.data.ok_or_else(|| {
            ApiError::ParseError("Response data is empty".to_string())
        })
    }
}

#[async_trait]
impl ExchangeClient for BitgetClient {
    fn exchange_name(&self) -> &str {
        "bitget"
    }

    async fn fetch_trades(&self, request: FetchTradesRequest) -> Result<FetchTradesResponse, ApiError> {
        let mut all_raw_trades = Vec::new();
        let mut current_cursor = request.cursor.clone();
        let limit = request.limit.unwrap_or(100);

        loop {
            let bitget_request = FillHistoryRequest {
                product_type: "USDT-FUTURES".to_string(), // TODO: Make configurable
                symbol: request.symbol.clone(),
                start_time: request.start_time.map(|ts| ts.to_string()),
                end_time: request.end_time.map(|ts| ts.to_string()),
                id_less_than: current_cursor.clone(),
                limit: Some("100".to_string()), // Max per request
            };

            let history_data = self.fetch_fill_history(&bitget_request).await?;

            // Map fills to raw trades (handle null fillList)
            let empty_vec = vec![];
            let fills = history_data.fill_list.as_ref().unwrap_or(&empty_vec);
            for fill in fills {
                match map_fill_to_raw_trade(fill) {
                    Ok(raw_trade) => all_raw_trades.push(raw_trade),
                    Err(e) => {
                        eprintln!("Warning: Failed to map BitGet fill: {}", e);
                    }
                }
            }

            // Check if we should continue pagination
            let has_more = history_data.end_id.is_some() && !fills.is_empty();

            if !has_more || all_raw_trades.len() >= limit as usize {
                return Ok(FetchTradesResponse {
                    trades: all_raw_trades,
                    next_cursor: history_data.end_id.clone(),
                    has_more,
                });
            }

            current_cursor = history_data.end_id.clone();
        }
    }

    async fn test_credentials(&self) -> Result<bool, ApiError> {
        // Test with a minimal request (fetch 1 trade)
        let request = FillHistoryRequest {
            product_type: "USDT-FUTURES".to_string(),
            symbol: None,
            start_time: None,
            end_time: None,
            id_less_than: None,
            limit: Some("1".to_string()),
        };

        match self.fetch_fill_history(&request).await {
            Ok(_) => Ok(true),
            Err(ApiError::AuthenticationError(_)) => Ok(false),
            Err(e) => Err(e),
        }
    }

    fn rate_limit(&self) -> RateLimitConfig {
        RateLimitConfig {
            requests_per_second: 10,
            burst_size: 10,
        }
    }
}
