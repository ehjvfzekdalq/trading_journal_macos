use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose, Engine as _};
use rand::Rng;
use sha2::{Digest, Sha256};

use super::error::ApiError;

const NONCE_SIZE: usize = 12;
const APP_IDENTIFIER: &str = "trading-journal-macos-api-credentials";

/// Derive encryption key from app identifier and machine-specific data
fn derive_key() -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(APP_IDENTIFIER.as_bytes());

    // In production, consider adding machine ID for hardware binding
    // For now, use consistent app-level key
    hasher.update(b"v1-static-key");

    let result = hasher.finalize();
    let mut key = [0u8; 32];
    key.copy_from_slice(&result[..]);
    key
}

/// Encrypt a credential string using AES-256-GCM
pub fn encrypt_credential(plaintext: &str) -> Result<String, ApiError> {
    let key = derive_key();
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|e| ApiError::EncryptionError(format!("Failed to create cipher: {}", e)))?;

    // Generate random nonce
    let mut rng = rand::thread_rng();
    let nonce_bytes: [u8; NONCE_SIZE] = rng.gen();
    let nonce = Nonce::from_slice(&nonce_bytes);

    // Encrypt
    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| ApiError::EncryptionError(format!("Encryption failed: {}", e)))?;

    // Combine nonce + ciphertext and encode as base64
    let mut combined = nonce_bytes.to_vec();
    combined.extend_from_slice(&ciphertext);

    Ok(general_purpose::STANDARD.encode(&combined))
}

/// Decrypt a credential string using AES-256-GCM
pub fn decrypt_credential(encrypted: &str) -> Result<String, ApiError> {
    let key = derive_key();
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|e| ApiError::EncryptionError(format!("Failed to create cipher: {}", e)))?;

    // Decode from base64
    let combined = general_purpose::STANDARD
        .decode(encrypted)
        .map_err(|e| ApiError::EncryptionError(format!("Failed to decode base64: {}", e)))?;

    if combined.len() < NONCE_SIZE {
        return Err(ApiError::EncryptionError(
            "Invalid encrypted data: too short".to_string(),
        ));
    }

    // Split nonce and ciphertext
    let (nonce_bytes, ciphertext) = combined.split_at(NONCE_SIZE);
    let nonce = Nonce::from_slice(nonce_bytes);

    // Decrypt
    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| ApiError::EncryptionError(format!("Decryption failed: {}", e)))?;

    String::from_utf8(plaintext)
        .map_err(|e| ApiError::EncryptionError(format!("Invalid UTF-8: {}", e)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let original = "my-secret-api-key-12345";
        let encrypted = encrypt_credential(original).unwrap();
        let decrypted = decrypt_credential(&encrypted).unwrap();
        assert_eq!(original, decrypted);
    }

    #[test]
    fn test_different_nonces() {
        let plaintext = "test-secret";
        let encrypted1 = encrypt_credential(plaintext).unwrap();
        let encrypted2 = encrypt_credential(plaintext).unwrap();
        // Same plaintext should produce different ciphertext due to random nonce
        assert_ne!(encrypted1, encrypted2);
        // But both should decrypt to same plaintext
        assert_eq!(decrypt_credential(&encrypted1).unwrap(), plaintext);
        assert_eq!(decrypt_credential(&encrypted2).unwrap(), plaintext);
    }

    #[test]
    fn test_invalid_base64() {
        let result = decrypt_credential("not-valid-base64!!!");
        assert!(result.is_err());
    }

    #[test]
    fn test_too_short() {
        let result = decrypt_credential("YWJj"); // "abc" in base64 (too short)
        assert!(result.is_err());
    }
}
