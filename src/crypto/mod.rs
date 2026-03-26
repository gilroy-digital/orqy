use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use rand::RngCore;

/// Encrypt a plaintext PAT using AES-256-GCM.
/// Returns base64-encoded "nonce:ciphertext".
pub fn encrypt_pat(plaintext: &str, key: &[u8; 32]) -> anyhow::Result<String> {
    let cipher = Aes256Gcm::new_from_slice(key)?;
    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| anyhow::anyhow!("Encryption failed: {}", e))?;

    let combined = format!("{}:{}", B64.encode(nonce_bytes), B64.encode(ciphertext));
    Ok(combined)
}

/// Decrypt a PAT from base64-encoded "nonce:ciphertext".
pub fn decrypt_pat(encrypted: &str, key: &[u8; 32]) -> anyhow::Result<String> {
    let parts: Vec<&str> = encrypted.splitn(2, ':').collect();
    if parts.len() != 2 {
        anyhow::bail!("Invalid encrypted format");
    }

    let nonce_bytes = B64.decode(parts[0])?;
    let ciphertext = B64.decode(parts[1])?;

    let cipher = Aes256Gcm::new_from_slice(key)?;
    let nonce = Nonce::from_slice(&nonce_bytes);

    let plaintext = cipher
        .decrypt(nonce, ciphertext.as_ref())
        .map_err(|e| anyhow::anyhow!("Decryption failed: {}", e))?;

    Ok(String::from_utf8(plaintext)?)
}

/// Derive a 32-byte key from a passphrase (simple, use a real KDF in production).
pub fn derive_key(secret: &str) -> [u8; 32] {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(secret.as_bytes());
    hasher.finalize().into()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let key = derive_key("test-secret-key");
        let original = "ghp_abc123mytoken";
        let encrypted = encrypt_pat(original, &key).unwrap();
        let decrypted = decrypt_pat(&encrypted, &key).unwrap();
        assert_eq!(original, decrypted);
    }
}
