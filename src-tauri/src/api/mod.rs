pub mod bitget;
pub mod blofin;
pub mod client;
pub mod credentials;
pub mod error;
pub mod rate_limiter;

pub use client::{ExchangeClient, FetchTradesRequest, FetchTradesResponse, RateLimitConfig, RawTrade};
pub use credentials::{decrypt_credential, encrypt_credential};
pub use error::ApiError;
pub use rate_limiter::RateLimiter;
