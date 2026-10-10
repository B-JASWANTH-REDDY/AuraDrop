//! Cryptographic utilities for AuraDrop authenticated TCP streaming
//! Provides HKDF-SHA256 key derivation and AES-256-GCM AEAD chunk encryption/decryption.

use ring::aead::{Aad, LessSafeKey, Nonce, UnboundKey, AES_256_GCM};
use ring::hkdf;

/// Derive a 256-bit symmetric session key bound to peer identities and transfer ID using HKDF-SHA256.
pub fn derive_session_key(
    token: &str,
    transfer_id: &str,
    sender_id: &str,
    receiver_id: &str,
) -> [u8; 32] {
    let salt = hkdf::Salt::new(hkdf::HKDF_SHA256, transfer_id.as_bytes());
    let prk = salt.extract(token.as_bytes());
    let info_str = format!("auradrop/tcp/aead/v1:{}:{}", sender_id, receiver_id);
    let info = [info_str.as_bytes()];
    
    let okm = prk.expand(&info, &AES_256_GCM).expect("HKDF expand failed");
    let mut key_bytes = [0u8; 32];
    okm.fill(&mut key_bytes).expect("HKDF fill failed");
    key_bytes
}

/// Create a deterministic 96-bit (12-byte) nonce for a chunk sequence.
/// First 4 bytes: random salt prefix. Last 8 bytes: big-endian chunk index.
pub fn create_chunk_nonce(salt_prefix: u32, chunk_index: u64) -> [u8; 12] {
    let mut nonce = [0u8; 12];
    nonce[0..4].copy_from_slice(&salt_prefix.to_be_bytes());
    nonce[4..12].copy_from_slice(&chunk_index.to_be_bytes());
    nonce
}

/// Encrypt a chunk using AES-256-GCM.
/// Returns ciphertext with appended 16-byte authentication tag.
pub fn encrypt_chunk(
    key: &[u8; 32],
    nonce_bytes: &[u8; 12],
    aad: &[u8],
    plaintext: &[u8],
) -> Result<Vec<u8>, String> {
    let unbound_key = UnboundKey::new(&AES_256_GCM, key)
        .map_err(|e| format!("Invalid AES-256-GCM key: {:?}", e))?;
    let less_safe_key = LessSafeKey::new(unbound_key);
    let nonce = Nonce::assume_unique_for_key(*nonce_bytes);

    let mut in_out = plaintext.to_vec();
    less_safe_key
        .seal_in_place_append_tag(nonce, Aad::from(aad), &mut in_out)
        .map_err(|e| format!("AEAD encryption failed: {:?}", e))?;

    Ok(in_out)
}

/// Decrypt an AES-256-GCM chunk and verify its 16-byte authentication tag.
/// Returns the decrypted plaintext or error if authentication fails.
pub fn decrypt_chunk(
    key: &[u8; 32],
    nonce_bytes: &[u8; 12],
    aad: &[u8],
    ciphertext_and_tag: &[u8],
) -> Result<Vec<u8>, String> {
    if ciphertext_and_tag.len() < AES_256_GCM.tag_len() {
        return Err("Ciphertext too short to contain AEAD authentication tag".to_string());
    }

    let unbound_key = UnboundKey::new(&AES_256_GCM, key)
        .map_err(|e| format!("Invalid AES-256-GCM key: {:?}", e))?;
    let less_safe_key = LessSafeKey::new(unbound_key);
    let nonce = Nonce::assume_unique_for_key(*nonce_bytes);

    let mut in_out = ciphertext_and_tag.to_vec();
    let plaintext = less_safe_key
        .open_in_place(nonce, Aad::from(aad), &mut in_out)
        .map_err(|e| format!("AEAD tag verification failed (tampered ciphertext or invalid key): {:?}", e))?;

    Ok(plaintext.to_vec())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_aead_encrypt_decrypt_roundtrip() {
        let key = derive_session_key("secret_token_123", "xfer_001", "sender_a", "receiver_b");
        let nonce = create_chunk_nonce(1337, 0);
        let aad = b"xfer_001:0";
        let plaintext = b"Hello, secure authenticated AuraDrop file transfer payload!";

        let encrypted = encrypt_chunk(&key, &nonce, aad, plaintext).expect("Encryption failed");
        assert_ne!(&encrypted[..plaintext.len()], plaintext);

        let decrypted = decrypt_chunk(&key, &nonce, aad, &encrypted).expect("Decryption failed");
        assert_eq!(&decrypted[..], plaintext);
    }

    #[test]
    fn test_aead_tamper_rejection() {
        let key = derive_session_key("secret_token_123", "xfer_001", "sender_a", "receiver_b");
        let nonce = create_chunk_nonce(1337, 0);
        let aad = b"xfer_001:0";
        let plaintext = b"Confidential financial records";

        let mut encrypted = encrypt_chunk(&key, &nonce, aad, plaintext).unwrap();
        
        // Single bit flip in ciphertext
        encrypted[5] ^= 0x01;

        let result = decrypt_chunk(&key, &nonce, aad, &encrypted);
        assert!(result.is_err(), "Decryption must fail when ciphertext is modified");
    }

    #[test]
    fn test_peer_binding_key_derivation() {
        let key1 = derive_session_key("token_xyz", "xfer_1", "peer_A", "peer_B");
        let key2 = derive_session_key("token_xyz", "xfer_1", "peer_A", "peer_ATTACKER");

        assert_ne!(key1, key2, "Session keys for different peer identities must not match");
    }
}
