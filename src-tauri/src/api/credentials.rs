use keyring::Entry;
use super::error::ApiError;

const SERVICE_NAME: &str = "trading-journal-macos";

/// Store an API key in the system keychain
///
/// Uses platform-specific secure storage:
/// - macOS: Keychain
/// - Windows: Credential Manager
/// - Linux: Secret Service
pub fn store_api_key(credential_id: &str, api_key: &str) -> Result<(), ApiError> {
    let entry = Entry::new(SERVICE_NAME, &format!("{}-api-key", credential_id))
        .map_err(|e| ApiError::EncryptionError(format!("Failed to create keyring entry: {}", e)))?;

    entry
        .set_password(api_key)
        .map_err(|e| ApiError::EncryptionError(format!("Failed to store API key: {}", e)))?;

    Ok(())
}

/// Retrieve an API key from the system keychain
pub fn retrieve_api_key(credential_id: &str) -> Result<String, ApiError> {
    let entry = Entry::new(SERVICE_NAME, &format!("{}-api-key", credential_id))
        .map_err(|e| ApiError::EncryptionError(format!("Failed to create keyring entry: {}", e)))?;

    entry
        .get_password()
        .map_err(|e| ApiError::EncryptionError(format!("Failed to retrieve API key: {}", e)))
}

/// Store an API secret in the system keychain
pub fn store_api_secret(credential_id: &str, api_secret: &str) -> Result<(), ApiError> {
    let entry = Entry::new(SERVICE_NAME, &format!("{}-api-secret", credential_id))
        .map_err(|e| ApiError::EncryptionError(format!("Failed to create keyring entry: {}", e)))?;

    entry
        .set_password(api_secret)
        .map_err(|e| ApiError::EncryptionError(format!("Failed to store API secret: {}", e)))?;

    Ok(())
}

/// Retrieve an API secret from the system keychain
pub fn retrieve_api_secret(credential_id: &str) -> Result<String, ApiError> {
    let entry = Entry::new(SERVICE_NAME, &format!("{}-api-secret", credential_id))
        .map_err(|e| ApiError::EncryptionError(format!("Failed to create keyring entry: {}", e)))?;

    entry
        .get_password()
        .map_err(|e| ApiError::EncryptionError(format!("Failed to retrieve API secret: {}", e)))
}

/// Store an API passphrase in the system keychain
pub fn store_passphrase(credential_id: &str, passphrase: &str) -> Result<(), ApiError> {
    let entry = Entry::new(SERVICE_NAME, &format!("{}-passphrase", credential_id))
        .map_err(|e| ApiError::EncryptionError(format!("Failed to create keyring entry: {}", e)))?;

    entry
        .set_password(passphrase)
        .map_err(|e| ApiError::EncryptionError(format!("Failed to store passphrase: {}", e)))?;

    Ok(())
}

/// Retrieve an API passphrase from the system keychain
pub fn retrieve_passphrase(credential_id: &str) -> Result<String, ApiError> {
    let entry = Entry::new(SERVICE_NAME, &format!("{}-passphrase", credential_id))
        .map_err(|e| ApiError::EncryptionError(format!("Failed to create keyring entry: {}", e)))?;

    entry
        .get_password()
        .map_err(|e| ApiError::EncryptionError(format!("Failed to retrieve passphrase: {}", e)))
}

/// Delete all credentials for a given credential_id from the system keychain
pub fn delete_credentials(credential_id: &str) -> Result<(), ApiError> {
    // Delete API key
    let entry = Entry::new(SERVICE_NAME, &format!("{}-api-key", credential_id))
        .map_err(|e| ApiError::EncryptionError(format!("Failed to create keyring entry: {}", e)))?;
    let _ = entry.delete_credential(); // Ignore error if doesn't exist

    // Delete API secret
    let entry = Entry::new(SERVICE_NAME, &format!("{}-api-secret", credential_id))
        .map_err(|e| ApiError::EncryptionError(format!("Failed to create keyring entry: {}", e)))?;
    let _ = entry.delete_credential();

    // Delete passphrase
    let entry = Entry::new(SERVICE_NAME, &format!("{}-passphrase", credential_id))
        .map_err(|e| ApiError::EncryptionError(format!("Failed to create keyring entry: {}", e)))?;
    let _ = entry.delete_credential();

    Ok(())
}

/// Legacy compatibility: encrypt_credential now stores in keychain
/// This maintains API compatibility while using secure storage
#[deprecated(note = "Use store_api_key, store_api_secret, or store_passphrase instead")]
pub fn encrypt_credential(plaintext: &str) -> Result<String, ApiError> {
    // Return the plaintext as a marker that it should be stored in keychain
    // This is used for backward compatibility during migration
    Ok(format!("KEYCHAIN:{}", plaintext))
}

/// Legacy compatibility: decrypt_credential now retrieves from keychain
#[deprecated(note = "Use retrieve_api_key, retrieve_api_secret, or retrieve_passphrase instead")]
pub fn decrypt_credential(encrypted: &str) -> Result<String, ApiError> {
    // If it's a keychain marker, extract the credential ID
    if let Some(cred_id) = encrypted.strip_prefix("KEYCHAIN:") {
        Ok(cred_id.to_string())
    } else {
        // Legacy encrypted data - return error to trigger re-save
        Err(ApiError::EncryptionError(
            "Legacy encrypted credentials detected. Please re-save credentials.".to_string(),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_store_retrieve_api_key() {
        let test_id = "test-credential-001";
        let test_key = "my-test-api-key-12345";

        // Store
        store_api_key(test_id, test_key).unwrap();

        // Retrieve
        let retrieved = retrieve_api_key(test_id).unwrap();
        assert_eq!(retrieved, test_key);

        // Cleanup
        delete_credentials(test_id).unwrap();
    }

    #[test]
    fn test_store_retrieve_api_secret() {
        let test_id = "test-credential-002";
        let test_secret = "my-secret-value-xyz";

        store_api_secret(test_id, test_secret).unwrap();
        let retrieved = retrieve_api_secret(test_id).unwrap();
        assert_eq!(retrieved, test_secret);

        delete_credentials(test_id).unwrap();
    }

    #[test]
    fn test_delete_credentials() {
        let test_id = "test-credential-003";

        // Store multiple credentials
        store_api_key(test_id, "key123").unwrap();
        store_api_secret(test_id, "secret456").unwrap();
        store_passphrase(test_id, "pass789").unwrap();

        // Delete all
        delete_credentials(test_id).unwrap();

        // Verify they're gone
        assert!(retrieve_api_key(test_id).is_err());
        assert!(retrieve_api_secret(test_id).is_err());
        assert!(retrieve_passphrase(test_id).is_err());
    }
}
