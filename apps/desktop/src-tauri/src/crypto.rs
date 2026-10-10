//! Cryptographic utilities for AuraDrop authenticated TCP streaming
//! Provides Diffie-Hellman Ephemeral (ECDH P-256) key agreement,
//! directional HKDF-SHA256 session key derivation, and AES-256-GCM AEAD chunk encryption/decryption.

use ring::aead::{Aad, LessSafeKey, Nonce, UnboundKey, AES_256_GCM};
use ring::agreement::{self, EphemeralPrivateKey, UnparsedPublicKey, ECDH_P256};
use ring::hkdf;
use ring::rand::SystemRandom;
use ring::signature::{EcdsaKeyPair, KeyPair, ECDSA_P256_SHA256_ASN1, ECDSA_P256_SHA256_ASN1_SIGNING};
use std::sync::Arc;

/// Persistent cryptographic device identity for mutual authentication of handshakes
#[derive(Clone)]
pub struct DeviceIdentity {
    key_pair: Arc<EcdsaKeyPair>,
    public_key_bytes: Vec<u8>,
    pkcs8_bytes: Vec<u8>,
}

impl DeviceIdentity {
    pub fn generate() -> Result<Self, String> {
        let rng = SystemRandom::new();
        let pkcs8 = EcdsaKeyPair::generate_pkcs8(&ECDSA_P256_SHA256_ASN1_SIGNING, &rng)
            .map_err(|e| format!("ECDSA P-256 keygen failed: {:?}", e))?;
        let pkcs8_bytes = pkcs8.as_ref().to_vec();
        Self::from_pkcs8(&pkcs8_bytes)
    }

    pub fn from_pkcs8(pkcs8_bytes: &[u8]) -> Result<Self, String> {
        let rng = SystemRandom::new();
        let key_pair = EcdsaKeyPair::from_pkcs8(&ECDSA_P256_SHA256_ASN1_SIGNING, pkcs8_bytes, &rng)
            .map_err(|e| format!("Invalid ECDSA PKCS#8: {:?}", e))?;
        let public_key_bytes = key_pair.public_key().as_ref().to_vec();
        Ok(Self {
            key_pair: Arc::new(key_pair),
            public_key_bytes,
            pkcs8_bytes: pkcs8_bytes.to_vec(),
        })
    }

    pub fn public_key_bytes(&self) -> &[u8] {
        &self.public_key_bytes
    }

    pub fn public_key_hex(&self) -> String {
        hex::encode(&self.public_key_bytes)
    }

    pub fn pkcs8_hex(&self) -> String {
        hex::encode(&self.pkcs8_bytes)
    }

    pub fn sign(&self, data: &[u8]) -> Result<Vec<u8>, String> {
        let rng = SystemRandom::new();
        let sig = self.key_pair.sign(&rng, data)
            .map_err(|e| format!("ECDSA signing failed: {:?}", e))?;
        Ok(sig.as_ref().to_vec())
    }

    pub fn verify(peer_pub_bytes: &[u8], data: &[u8], signature_bytes: &[u8]) -> Result<(), String> {
        let peer_pub = ring::signature::UnparsedPublicKey::new(&ECDSA_P256_SHA256_ASN1, peer_pub_bytes);
        peer_pub.verify(data, signature_bytes)
            .map_err(|e| format!("Cryptographic signature verification failed (invalid signature or wrong identity key): {:?}", e))
    }
}

/// Directional symmetric keys derived from ECDH shared secret and transfer metadata.
#[derive(Debug, Clone)]
pub struct DirectionalSessionKeys {
    /// 256-bit symmetric key for streaming data from sender to receiver.
    pub sender_to_receiver: [u8; 32],
    /// 256-bit symmetric key for streaming data or control frames from receiver to sender.
    pub receiver_to_sender: [u8; 32],
}

/// Ephemeral Diffie-Hellman Key Exchange (NIST P-256 / secp256r1)
pub struct EphemeralKeyExchange {
    private_key: EphemeralPrivateKey,
    public_key_bytes: Vec<u8>,
}

impl EphemeralKeyExchange {
    /// Generate a fresh, cryptographically secure ephemeral P-256 key pair.
    pub fn generate() -> Result<Self, String> {
        let rng = SystemRandom::new();
        let private_key = EphemeralPrivateKey::generate(&ECDH_P256, &rng)
            .map_err(|e| format!("Failed to generate ephemeral ECDH key: {:?}", e))?;
        let public_key_bytes = private_key
            .compute_public_key()
            .map_err(|e| format!("Failed to compute public key: {:?}", e))?
            .as_ref()
            .to_vec();
        Ok(Self {
            private_key,
            public_key_bytes,
        })
    }

    /// Return the raw SEC1 uncompressed public key bytes (65 bytes: 0x04 || X || Y).
    pub fn public_key_bytes(&self) -> &[u8] {
        &self.public_key_bytes
    }

    /// Return hex-encoded public key.
    pub fn public_key_hex(&self) -> String {
        hex::encode(&self.public_key_bytes)
    }

    /// Perform Diffie-Hellman key agreement with peer's public key bytes.
    /// Returns the 32-byte shared secret (DH x-coordinate).
    pub fn complete(self, peer_public_key_bytes: &[u8]) -> Result<Vec<u8>, String> {
        let peer_pub = UnparsedPublicKey::new(&ECDH_P256, peer_public_key_bytes);
        agreement::agree_ephemeral(
            self.private_key,
            &peer_pub,
            |key_material| key_material.to_vec(),
        )
        .map_err(|e| format!("ECDH key agreement failed (invalid peer public key or curve mismatch): {:?}", e))
    }
}

/// Compute transcript for sender handshake signature.
pub fn compute_sender_transcript(
    protocol: &str,
    transfer_id: &str,
    sender_id: &str,
    sender_eph_pub_hex: &str,
) -> Vec<u8> {
    format!(
        "auradrop/auth/v1/sender:{}:{}:{}:{}",
        protocol, transfer_id, sender_id, sender_eph_pub_hex
    ).into_bytes()
}

/// Compute transcript for receiver handshake signature.
pub fn compute_receiver_transcript(
    protocol: &str,
    transfer_id: &str,
    token: &str,
    sender_id: &str,
    receiver_id: &str,
    sender_eph_pub_hex: &str,
    receiver_eph_pub_hex: &str,
) -> Vec<u8> {
    format!(
        "auradrop/auth/v1/receiver:{}:{}:{}:{}:{}:{}:{}",
        protocol, transfer_id, token, sender_id, receiver_id, sender_eph_pub_hex, receiver_eph_pub_hex
    ).into_bytes()
}

/// Derive directional 256-bit symmetric session keys using HKDF-SHA256.
/// Bound to the ECDH shared secret, transfer ID, authorization token, and peer device identities.
pub fn derive_directional_session_keys(
    shared_secret_ecdh: &[u8],
    transfer_id: &str,
    token: &str,
    sender_id: &str,
    receiver_id: &str,
    sender_identity_pub_hex: &str,
    receiver_identity_pub_hex: &str,
) -> DirectionalSessionKeys {
    let mut salt_bytes = Vec::with_capacity(transfer_id.len() + 1 + token.len());
    salt_bytes.extend_from_slice(transfer_id.as_bytes());
    salt_bytes.push(b':');
    salt_bytes.extend_from_slice(token.as_bytes());

    let salt = hkdf::Salt::new(hkdf::HKDF_SHA256, &salt_bytes);
    let prk = salt.extract(shared_secret_ecdh);

    // Directional info: sender -> receiver with cryptographic identity binding
    let s2r_info_str = format!(
        "auradrop/tcp/aead/v3/sender-to-receiver:{}:{}:{}:{}",
        sender_id, receiver_id, sender_identity_pub_hex, receiver_identity_pub_hex
    );
    let s2r_info = [s2r_info_str.as_bytes()];
    let okm_s2r = prk.expand(&s2r_info, &AES_256_GCM).expect("HKDF expand s2r failed");
    let mut s2r_key = [0u8; 32];
    okm_s2r.fill(&mut s2r_key).expect("HKDF fill s2r failed");

    // Directional info: receiver -> sender with cryptographic identity binding
    let r2s_info_str = format!(
        "auradrop/tcp/aead/v3/receiver-to-sender:{}:{}:{}:{}",
        sender_id, receiver_id, sender_identity_pub_hex, receiver_identity_pub_hex
    );
    let r2s_info = [r2s_info_str.as_bytes()];
    let okm_r2s = prk.expand(&r2s_info, &AES_256_GCM).expect("HKDF expand r2s failed");
    let mut r2s_key = [0u8; 32];
    okm_r2s.fill(&mut r2s_key).expect("HKDF fill r2s failed");

    DirectionalSessionKeys {
        sender_to_receiver: s2r_key,
        receiver_to_sender: r2s_key,
    }
}

/// Legacy single-key derivation for fallback compatibility
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
    fn test_ecdh_key_exchange_and_directional_derivation() {
        // Alice generates ephemeral ECDH
        let alice_eph = EphemeralKeyExchange::generate().unwrap();
        let alice_pub = alice_eph.public_key_bytes().to_vec();

        // Bob generates ephemeral ECDH
        let bob_eph = EphemeralKeyExchange::generate().unwrap();
        let bob_pub = bob_eph.public_key_bytes().to_vec();

        // Alice and Bob perform key agreement
        let alice_shared = alice_eph.complete(&bob_pub).unwrap();
        let bob_shared = bob_eph.complete(&alice_pub).unwrap();

        assert_eq!(alice_shared, bob_shared, "ECDH shared secrets must be identical");
        assert_eq!(alice_shared.len(), 32, "P-256 shared secret must be 32 bytes");

        // Alice and Bob derive directional keys bound to device identities
        let alice_identity = DeviceIdentity::generate().unwrap();
        let bob_identity = DeviceIdentity::generate().unwrap();

        let alice_keys = derive_directional_session_keys(
            &alice_shared,
            "transfer_abc",
            "token_xyz",
            "device_alice",
            "device_bob",
            &alice_identity.public_key_hex(),
            &bob_identity.public_key_hex(),
        );
        let bob_keys = derive_directional_session_keys(
            &bob_shared,
            "transfer_abc",
            "token_xyz",
            "device_alice",
            "device_bob",
            &alice_identity.public_key_hex(),
            &bob_identity.public_key_hex(),
        );

        assert_eq!(alice_keys.sender_to_receiver, bob_keys.sender_to_receiver);
        assert_eq!(alice_keys.receiver_to_sender, bob_keys.receiver_to_sender);
        assert_ne!(alice_keys.sender_to_receiver, alice_keys.receiver_to_sender);

        // Verify AEAD encryption with sender_to_receiver key
        let nonce = create_chunk_nonce(1337, 0);
        let aad = b"transfer_abc:0";
        let plaintext = b"Classified bulk file data";

        let ciphertext = encrypt_chunk(&alice_keys.sender_to_receiver, &nonce, aad, plaintext).unwrap();
        let decrypted = decrypt_chunk(&bob_keys.sender_to_receiver, &nonce, aad, &ciphertext).unwrap();
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn test_device_identity_signatures_and_tamper_rejection() {
        let sender_id = DeviceIdentity::generate().unwrap();
        let receiver_id = DeviceIdentity::generate().unwrap();
        let attacker_id = DeviceIdentity::generate().unwrap();

        let sender_transcript = compute_sender_transcript(
            "auradrop/tcp/2",
            "xfer_999",
            "sender_device_1",
            "04abcdef123456",
        );

        // Sender signs transcript
        let sig = sender_id.sign(&sender_transcript).unwrap();

        // Valid signature verifies
        let verify_ok = DeviceIdentity::verify(sender_id.public_key_bytes(), &sender_transcript, &sig);
        assert!(verify_ok.is_ok(), "Authentic sender signature must verify");

        // Attacker attempts to replace ephemeral public key (tampered transcript)
        let tampered_transcript = compute_sender_transcript(
            "auradrop/tcp/2",
            "xfer_999",
            "sender_device_1",
            "04attackerephemeral000000",
        );
        let verify_tampered = DeviceIdentity::verify(sender_id.public_key_bytes(), &tampered_transcript, &sig);
        assert!(verify_tampered.is_err(), "Tampered ephemeral key must fail signature verification");

        // Attacker tries to sign with attacker key for sender device
        let attacker_sig = attacker_id.sign(&tampered_transcript).unwrap();
        let verify_wrong_key = DeviceIdentity::verify(sender_id.public_key_bytes(), &tampered_transcript, &attacker_sig);
        assert!(verify_wrong_key.is_err(), "Attacker signature verified against sender public key must fail");

        // Test Receiver transcript and signature
        let receiver_transcript = compute_receiver_transcript(
            "auradrop/tcp/2",
            "xfer_999",
            "token_777",
            "sender_device_1",
            "receiver_device_2",
            "04abcdef123456",
            "04receivereph999999",
        );
        let recv_sig = receiver_id.sign(&receiver_transcript).unwrap();
        let recv_verify_ok = DeviceIdentity::verify(receiver_id.public_key_bytes(), &receiver_transcript, &recv_sig);
        assert!(recv_verify_ok.is_ok(), "Authentic receiver signature must verify");

        // Receiver ephemeral key tampering
        let tampered_recv_transcript = compute_receiver_transcript(
            "auradrop/tcp/2",
            "xfer_999",
            "token_777",
            "sender_device_1",
            "receiver_device_2",
            "04abcdef123456",
            "04attackereph666666",
        );
        let recv_verify_tampered = DeviceIdentity::verify(receiver_id.public_key_bytes(), &tampered_recv_transcript, &recv_sig);
        assert!(recv_verify_tampered.is_err(), "Tampered receiver ephemeral key must fail signature verification");
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
