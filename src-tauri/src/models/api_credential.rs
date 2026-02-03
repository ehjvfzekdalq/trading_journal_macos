use serde::{Deserialize, Serialize};

/// API Credential model (for frontend communication)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiCredential {
    pub id: String,
    pub exchange: String,
    pub label: String,
    #[serde(skip_serializing)]
    #[allow(dead_code)]
    pub api_key: String, // Never send full key to frontend
    pub api_key_preview: String, // Only last 4 chars
    #[serde(skip_serializing)]
    #[allow(dead_code)]
    pub api_secret: String, // Never send to frontend
    #[serde(skip_serializing_if = "Option::is_none")]
    pub passphrase: Option<String>, // Never send to frontend
    pub is_active: bool,
    pub last_sync_timestamp: Option<i64>,
    pub auto_sync_enabled: bool,
    pub auto_sync_interval: i64, // Interval in seconds
    pub live_mirror_enabled: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

impl ApiCredential {
    /// Create API key preview (last 4 characters)
    pub fn create_preview(api_key: &str) -> String {
        let len = api_key.len();
        if len <= 4 {
            "*".repeat(len)
        } else {
            format!("{}...{}", "*".repeat(4), &api_key[len - 4..])
        }
    }

    /// Convert to safe version for frontend (strips secrets)
    pub fn to_safe(&self) -> ApiCredentialSafe {
        ApiCredentialSafe {
            id: self.id.clone(),
            exchange: self.exchange.clone(),
            label: self.label.clone(),
            api_key_preview: self.api_key_preview.clone(),
            is_active: self.is_active,
            last_sync_timestamp: self.last_sync_timestamp,
            auto_sync_enabled: self.auto_sync_enabled,
            auto_sync_interval: self.auto_sync_interval,
            live_mirror_enabled: self.live_mirror_enabled,
            created_at: self.created_at,
            updated_at: self.updated_at,
        }
    }
}

/// Safe version of ApiCredential (no secrets)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiCredentialSafe {
    pub id: String,
    pub exchange: String,
    pub label: String,
    pub api_key_preview: String,
    pub is_active: bool,
    pub last_sync_timestamp: Option<i64>,
    pub auto_sync_enabled: bool,
    pub auto_sync_interval: i64, // Interval in seconds
    pub live_mirror_enabled: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

/// Input for creating/updating API credentials
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiCredentialInput {
    pub id: Option<String>, // None for new, Some for update
    pub exchange: String,
    pub label: String,
    pub api_key: String,
    pub api_secret: String,
    pub passphrase: Option<String>,
    pub is_active: Option<bool>,
    pub auto_sync_enabled: Option<bool>,
    pub auto_sync_interval: Option<i64>,
    pub live_mirror_enabled: Option<bool>,
}

/// API Sync History record
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiSyncHistory {
    pub id: String,
    pub credential_id: String,
    pub exchange: String,
    pub sync_type: String,
    pub last_sync_timestamp: i64,
    pub trades_imported: i32,
    pub trades_duplicated: i32,
    pub last_trade_id: Option<String>,
    pub status: String,
    pub error_message: Option<String>,
    pub created_at: i64,
}

/// Sync configuration from frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncConfig {
    pub credential_id: String,
    pub start_date: Option<i64>,
    pub end_date: Option<i64>,
    pub skip_duplicates: bool,
    #[serde(default)]
    pub is_auto_sync: bool,
}

/// Sync result returned to frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncResult {
    pub imported: i32,
    pub duplicates: i32,
    pub errors: Vec<String>,
    pub total_pnl: Option<f64>,
}
