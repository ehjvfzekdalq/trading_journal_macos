use thiserror::Error;

#[derive(Error, Debug)]
pub enum ApiError {
    #[error("HTTP request failed: {0}")]
    HttpError(#[from] reqwest::Error),

    #[error("Authentication failed: {0}")]
    AuthenticationError(String),

    #[error("Rate limit exceeded: {0}")]
    RateLimitError(String),

    #[error("Invalid API response: {0}")]
    ParseError(String),

    #[error("Encryption error: {0}")]
    EncryptionError(String),

    #[error("Database error: {0}")]
    DatabaseError(String),

    #[error("Exchange API error: {code} - {message}")]
    ExchangeError { code: String, message: String },

    #[error("Invalid credentials")]
    InvalidCredentials,

    #[error("Network error: {0}")]
    NetworkError(String),

    #[error("Timeout: {0}")]
    TimeoutError(String),

    #[error("Unknown error: {0}")]
    Unknown(String),
}

impl From<rusqlite::Error> for ApiError {
    fn from(err: rusqlite::Error) -> Self {
        ApiError::DatabaseError(err.to_string())
    }
}

impl From<serde_json::Error> for ApiError {
    fn from(err: serde_json::Error) -> Self {
        ApiError::ParseError(err.to_string())
    }
}

impl From<aes_gcm::Error> for ApiError {
    fn from(err: aes_gcm::Error) -> Self {
        ApiError::EncryptionError(err.to_string())
    }
}
