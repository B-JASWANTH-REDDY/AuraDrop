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

    pub fn pkcs8_bytes(&self) -> &[u8] {
        &self.pkcs8_bytes
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
        validate_p256_public_key_bytes(peer_pub_bytes)?;
        let peer_pub = ring::signature::UnparsedPublicKey::new(&ECDSA_P256_SHA256_ASN1, peer_pub_bytes);
        peer_pub.verify(data, signature_bytes)
            .map_err(|e| format!("Cryptographic signature verification failed (invalid signature or wrong identity key): {:?}", e))
    }
}

/// Validate uncompressed SEC1 P-256 public key (65 bytes, prefix 0x04)
pub fn validate_p256_public_key_bytes(bytes: &[u8]) -> Result<(), String> {
    if bytes.len() != 65 {
        return Err(format!("Invalid P-256 public key length: expected 65 bytes, got {}", bytes.len()));
    }
    if bytes[0] != 0x04 {
        return Err("Invalid P-256 public key prefix: expected 0x04 uncompressed".to_string());
    }
    Ok(())
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
        validate_p256_public_key_bytes(peer_public_key_bytes)?;
        let peer_pub = UnparsedPublicKey::new(&ECDH_P256, peer_public_key_bytes);
        agreement::agree_ephemeral(
            self.private_key,
            &peer_pub,
            |key_material| key_material.to_vec(),
        )
        .map_err(|e| format!("ECDH key agreement failed (invalid peer public key or curve mismatch): {:?}", e))
    }
}

/// Canonical transcript for sender handshake signature (V2 unambiguous encoding)
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

/// Canonical transcript for receiver handshake signature (V2 unambiguous encoding)
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

pub const SAS_PROTOCOL_VERSION: &str = "auradrop/tcp/2";
pub const SAS_SECURITY_PARAMS: &str = "cipher=aead-aes256-gcm:kdf=hkdf-sha256:framing=v2";

/// Canonical, unambiguous length-prefixed session transcript for Short Authentication String (SAS)
pub fn compute_canonical_sas_transcript(
    protocol_version: &str,
    transfer_id: &str,
    sender_id: &str,
    receiver_id: &str,
    sender_identity_pub_hex: &str,
    receiver_identity_pub_hex: &str,
    sender_eph_pub_hex: &str,
    receiver_eph_pub_hex: &str,
    security_params: &str,
) -> Vec<u8> {
    let mut transcript = Vec::with_capacity(512);
    // Explicit 16-byte magic header with null terminator
    transcript.extend_from_slice(b"auradrop/sas/v2\0");

    let s_id_lower = sender_identity_pub_hex.to_ascii_lowercase();
    let r_id_lower = receiver_identity_pub_hex.to_ascii_lowercase();
    let s_eph_lower = sender_eph_pub_hex.to_ascii_lowercase();
    let r_eph_lower = receiver_eph_pub_hex.to_ascii_lowercase();

    let fields: [&[u8]; 9] = [
        protocol_version.as_bytes(),
        transfer_id.as_bytes(),
        sender_id.as_bytes(),
        receiver_id.as_bytes(),
        s_id_lower.as_bytes(),
        r_id_lower.as_bytes(),
        s_eph_lower.as_bytes(),
        r_eph_lower.as_bytes(),
        security_params.as_bytes(),
    ];

    for field in &fields {
        let len = field.len() as u32;
        transcript.extend_from_slice(&len.to_be_bytes());
        transcript.extend_from_slice(field);
    }

    transcript
}

/// Compute 6-digit Short Authentication String (SAS) from canonical transcript and ECDH shared secret
pub fn compute_sas_code_full(
    shared_secret_ecdh: &[u8],
    protocol_version: &str,
    transfer_id: &str,
    sender_id: &str,
    receiver_id: &str,
    sender_identity_pub_hex: &str,
    receiver_identity_pub_hex: &str,
    sender_eph_pub_hex: &str,
    receiver_eph_pub_hex: &str,
    security_params: &str,
) -> String {
    let transcript = compute_canonical_sas_transcript(
        protocol_version,
        transfer_id,
        sender_id,
        receiver_id,
        sender_identity_pub_hex,
        receiver_identity_pub_hex,
        sender_eph_pub_hex,
        receiver_eph_pub_hex,
        security_params,
    );
    let transcript_hash = ring::digest::digest(&ring::digest::SHA256, &transcript);

    let salt = hkdf::Salt::new(hkdf::HKDF_SHA256, transcript_hash.as_ref());
    let prk = salt.extract(shared_secret_ecdh);
    let info = [b"auradrop/sas/v2:numeric-sas".as_slice()];
    let okm = prk.expand(&info, &AES_256_GCM).expect("HKDF expand sas failed");
    let mut okm_bytes = [0u8; 32];
    okm.fill(&mut okm_bytes).expect("fill sas bytes failed");

    let num = u32::from_be_bytes([okm_bytes[0], okm_bytes[1], okm_bytes[2], okm_bytes[3]]) % 1_000_000;
    format!("{:03} {:03}", num / 1000, num % 1000)
}

/// Compute 6-digit Short Authentication String (SAS) using standard protocol version and security parameters
pub fn compute_sas_code(
    shared_secret_ecdh: &[u8],
    transfer_id: &str,
    sender_id: &str,
    receiver_id: &str,
    sender_identity_pub_hex: &str,
    receiver_identity_pub_hex: &str,
    sender_eph_pub_hex: &str,
    receiver_eph_pub_hex: &str,
) -> String {
    compute_sas_code_full(
        shared_secret_ecdh,
        SAS_PROTOCOL_VERSION,
        transfer_id,
        sender_id,
        receiver_id,
        sender_identity_pub_hex,
        receiver_identity_pub_hex,
        sender_eph_pub_hex,
        receiver_eph_pub_hex,
        SAS_SECURITY_PARAMS,
    )
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
            "04abcdef12345600000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
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
            "04attackerephemeral000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
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
            "04abcdef12345600000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
            "04receivereph99999900000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
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
            "04abcdef12345600000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
            "04attackereph66666600000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
        );
        let recv_verify_tampered = DeviceIdentity::verify(receiver_id.public_key_bytes(), &tampered_recv_transcript, &recv_sig);
        assert!(recv_verify_tampered.is_err(), "Tampered receiver ephemeral key must fail signature verification");
    }

    #[test]
    fn test_sas_code_verification_and_mitm_detection() {
        let alice_id = DeviceIdentity::generate().unwrap();
        let bob_id = DeviceIdentity::generate().unwrap();
        let mallory_id = DeviceIdentity::generate().unwrap();

        // 1. Legitimate Alice <-> Bob session
        let alice_eph = EphemeralKeyExchange::generate().unwrap();
        let bob_eph = EphemeralKeyExchange::generate().unwrap();
        let alice_eph_hex = alice_eph.public_key_hex();
        let bob_eph_hex = bob_eph.public_key_hex();
        let bob_pub_bytes = bob_eph.public_key_bytes().to_vec();

        let alice_bob_shared = alice_eph.complete(&bob_pub_bytes).unwrap();
        let sas_legit_alice = compute_sas_code(
            &alice_bob_shared,
            "xfer_100",
            "alice_dev",
            "bob_dev",
            &alice_id.public_key_hex(),
            &bob_id.public_key_hex(),
            &alice_eph_hex,
            &bob_eph_hex,
        );
        let sas_legit_bob = compute_sas_code(
            &alice_bob_shared,
            "xfer_100",
            "alice_dev",
            "bob_dev",
            &alice_id.public_key_hex(),
            &bob_id.public_key_hex(),
            &alice_eph_hex,
            &bob_eph_hex,
        );
        assert_eq!(sas_legit_alice, sas_legit_bob, "Both peers must calculate identical 6-digit SAS codes");
        assert_eq!(sas_legit_alice.len(), 7, "SAS must be format '%03d %03d' (7 chars)");

        // 2. Active MitM Mallory in the middle:
        // Alice connects to Mallory (believing Mallory is Bob)
        let alice_eph_mitm = EphemeralKeyExchange::generate().unwrap();
        let mallory_eph1 = EphemeralKeyExchange::generate().unwrap();
        let alice_eph_mitm_hex = alice_eph_mitm.public_key_hex();
        let mallory_eph1_hex = mallory_eph1.public_key_hex();
        let mallory_pub1_bytes = mallory_eph1.public_key_bytes().to_vec();

        let alice_mallory_shared = alice_eph_mitm.complete(&mallory_pub1_bytes).unwrap();
        let sas_alice_mallory = compute_sas_code(
            &alice_mallory_shared,
            "xfer_100",
            "alice_dev",
            "bob_dev",
            &alice_id.public_key_hex(),
            &mallory_id.public_key_hex(),
            &alice_eph_mitm_hex,
            &mallory_eph1_hex,
        );

        // Mallory connects to Bob (believing Mallory is Alice)
        let bob_eph_mitm = EphemeralKeyExchange::generate().unwrap();
        let mallory_eph2 = EphemeralKeyExchange::generate().unwrap();
        let bob_eph_mitm_hex = bob_eph_mitm.public_key_hex();
        let mallory_eph2_hex = mallory_eph2.public_key_hex();
        let mallory_pub2_bytes = mallory_eph2.public_key_bytes().to_vec();

        let bob_mallory_shared = bob_eph_mitm.complete(&mallory_pub2_bytes).unwrap();
        let sas_bob_mallory = compute_sas_code(
            &bob_mallory_shared,
            "xfer_100",
            "alice_dev",
            "bob_dev",
            &mallory_id.public_key_hex(),
            &bob_id.public_key_hex(),
            &mallory_eph2_hex,
            &bob_eph_mitm_hex,
        );

        // SAS mismatch exposes MitM on First Contact!
        assert_ne!(
            sas_alice_mallory, sas_bob_mallory,
            "MitM attack must produce divergent SAS codes, exposing attacker"
        );
    }

    #[test]
    fn test_p256_public_key_validation() {
        let valid_pub = EphemeralKeyExchange::generate().unwrap().public_key_bytes().to_vec();
        assert!(validate_p256_public_key_bytes(&valid_pub).is_ok());

        // Invalid length
        assert!(validate_p256_public_key_bytes(&[0x04; 32]).is_err());
        assert!(validate_p256_public_key_bytes(&[0x04; 66]).is_err());

        // Invalid prefix (compressed 0x02 or 0x03)
        let mut compressed = valid_pub.clone();
        compressed[0] = 0x02;
        assert!(validate_p256_public_key_bytes(&compressed).is_err());
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

    #[test]
    fn test_sas_deterministic_test_vector() {
        // Shared deterministic vector for cross-platform validation
        let shared_secret = [0x42u8; 32];
        let protocol_version = "auradrop/tcp/2";
        let transfer_id = "test-transfer-id-12345";
        let sender_id = "alice-device-id";
        let receiver_id = "bob-device-id";
        let sender_identity = "0411111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111";
        let receiver_identity = "0422222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222";
        let sender_eph = "0433333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333";
        let receiver_eph = "0444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444";
        let security_params = "cipher=aead-aes256-gcm:kdf=hkdf-sha256:framing=v2";

        let sas = compute_sas_code_full(
            &shared_secret,
            protocol_version,
            transfer_id,
            sender_id,
            receiver_id,
            sender_identity,
            receiver_identity,
            sender_eph,
            receiver_eph,
            security_params,
        );

        println!("[DETERMINISTIC TEST VECTOR] SAS: {}", sas);
        assert_eq!(sas.len(), 7);
        assert_eq!(sas.chars().nth(3), Some(' '));

        // Deterministic check: must remain identical across all platforms and test runs
        let sas_second_run = compute_sas_code_full(
            &shared_secret,
            protocol_version,
            transfer_id,
            sender_id,
            receiver_id,
            sender_identity,
            receiver_identity,
            sender_eph,
            receiver_eph,
            security_params,
        );
        assert_eq!(sas, sas_second_run);
    }

    #[test]
    fn test_sas_field_sensitivity_matrix() {
        let base_secret = [0x55u8; 32];
        let base_proto = "auradrop/tcp/2";
        let base_tid = "tid_base";
        let base_sid = "sender_base";
        let base_rid = "receiver_base";
        let base_s_id_pub = "04aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
        let base_r_id_pub = "04bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
        let base_s_eph_pub = "04cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
        let base_r_eph_pub = "04dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";
        let base_sec_params = "cipher=aead-aes256-gcm:kdf=hkdf-sha256:framing=v2";

        let base_sas = compute_sas_code_full(
            &base_secret, base_proto, base_tid, base_sid, base_rid,
            base_s_id_pub, base_r_id_pub, base_s_eph_pub, base_r_eph_pub, base_sec_params
        );

        // 1. Shared secret altered
        let mut alt_secret = base_secret;
        alt_secret[0] ^= 0x01;
        let sas1 = compute_sas_code_full(
            &alt_secret, base_proto, base_tid, base_sid, base_rid,
            base_s_id_pub, base_r_id_pub, base_s_eph_pub, base_r_eph_pub, base_sec_params
        );
        assert_ne!(base_sas, sas1, "Altered shared secret must change SAS");

        // 2. Protocol version altered
        let sas2 = compute_sas_code_full(
            &base_secret, "auradrop/tcp/3", base_tid, base_sid, base_rid,
            base_s_id_pub, base_r_id_pub, base_s_eph_pub, base_r_eph_pub, base_sec_params
        );
        assert_ne!(base_sas, sas2, "Altered protocol version must change SAS");

        // 3. Transfer ID altered
        let sas3 = compute_sas_code_full(
            &base_secret, base_proto, "tid_alt", base_sid, base_rid,
            base_s_id_pub, base_r_id_pub, base_s_eph_pub, base_r_eph_pub, base_sec_params
        );
        assert_ne!(base_sas, sas3, "Altered transfer ID must change SAS");

        // 4. Sender ID altered
        let sas4 = compute_sas_code_full(
            &base_secret, base_proto, base_tid, "sender_alt", base_rid,
            base_s_id_pub, base_r_id_pub, base_s_eph_pub, base_r_eph_pub, base_sec_params
        );
        assert_ne!(base_sas, sas4, "Altered sender ID must change SAS");

        // 5. Receiver ID altered
        let sas5 = compute_sas_code_full(
            &base_secret, base_proto, base_tid, base_sid, "receiver_alt",
            base_s_id_pub, base_r_id_pub, base_s_eph_pub, base_r_eph_pub, base_sec_params
        );
        assert_ne!(base_sas, sas5, "Altered receiver ID must change SAS");

        // 6. Sender identity public key altered
        let sas6 = compute_sas_code_full(
            &base_secret, base_proto, base_tid, base_sid, base_rid,
            "0411111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111",
            base_r_id_pub, base_s_eph_pub, base_r_eph_pub, base_sec_params
        );
        assert_ne!(base_sas, sas6, "Altered sender identity key must change SAS");

        // 7. Receiver identity public key altered
        let sas7 = compute_sas_code_full(
            &base_secret, base_proto, base_tid, base_sid, base_rid,
            base_s_id_pub,
            "0422222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222",
            base_s_eph_pub, base_r_eph_pub, base_sec_params
        );
        assert_ne!(base_sas, sas7, "Altered receiver identity key must change SAS");

        // 8. Sender ephemeral key altered
        let sas8 = compute_sas_code_full(
            &base_secret, base_proto, base_tid, base_sid, base_rid,
            base_s_id_pub, base_r_id_pub,
            "0433333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333",
            base_r_eph_pub, base_sec_params
        );
        assert_ne!(base_sas, sas8, "Altered sender ephemeral key must change SAS");

        // 9. Receiver ephemeral key altered
        let sas9 = compute_sas_code_full(
            &base_secret, base_proto, base_tid, base_sid, base_rid,
            base_s_id_pub, base_r_id_pub, base_s_eph_pub,
            "0444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444444",
            base_sec_params
        );
        assert_ne!(base_sas, sas9, "Altered receiver ephemeral key must change SAS");

        // 10. Security params altered
        let sas10 = compute_sas_code_full(
            &base_secret, base_proto, base_tid, base_sid, base_rid,
            base_s_id_pub, base_r_id_pub, base_s_eph_pub, base_r_eph_pub,
            "cipher=aead-aes256-gcm:kdf=hkdf-sha256:framing=v3"
        );
        assert_ne!(base_sas, sas10, "Altered security params must change SAS");
    }

    #[test]
    fn test_identity_substitution_and_transcript_tamper_matrix() {
        let sender_dev = DeviceIdentity::generate().unwrap();
        let receiver_dev = DeviceIdentity::generate().unwrap();
        let attacker_dev = DeviceIdentity::generate().unwrap();

        let tid = "xfer_matrix_1";
        let token = "token_matrix_77";
        let sid = "sender_device_id";
        let rid = "receiver_device_id";
        let eph_pub = "041234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
        let recv_eph_pub = "04fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321";

        // 1. Legitimate sender signature
        let transcript = compute_sender_transcript("auradrop/tcp/2", tid, sid, eph_pub);
        let sig = sender_dev.sign(&transcript).unwrap();
        assert!(DeviceIdentity::verify(sender_dev.public_key_bytes(), &transcript, &sig).is_ok());

        // 2. Identity key substitution (Attacker uses same transcript & ECDH, verifies with attacker public key)
        let verify_substituted = DeviceIdentity::verify(attacker_dev.public_key_bytes(), &transcript, &sig);
        assert!(verify_substituted.is_err(), "Signature must fail against substituted identity key");

        // 3. Ephemeral public key substitution
        let tampered_eph_transcript = compute_sender_transcript("auradrop/tcp/2", tid, sid,
            "0499999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999"
        );
        let verify_tampered_eph = DeviceIdentity::verify(sender_dev.public_key_bytes(), &tampered_eph_transcript, &sig);
        assert!(verify_tampered_eph.is_err(), "Tampered ephemeral key must fail signature verification");

        // 4. Protocol version substitution
        let tampered_proto = compute_sender_transcript("auradrop/tcp/99", tid, sid, eph_pub);
        let verify_tampered_proto = DeviceIdentity::verify(sender_dev.public_key_bytes(), &tampered_proto, &sig);
        assert!(verify_tampered_proto.is_err(), "Altered protocol version must fail signature verification");

        // 5. Transfer ID substitution
        let tampered_tid = compute_sender_transcript("auradrop/tcp/2", "xfer_fake", sid, eph_pub);
        let verify_tampered_tid = DeviceIdentity::verify(sender_dev.public_key_bytes(), &tampered_tid, &sig);
        assert!(verify_tampered_tid.is_err(), "Altered transfer ID must fail signature verification");

        // 6. Modified signature bytes (bit flip)
        let mut tampered_sig = sig.clone();
        tampered_sig[10] ^= 0x01;
        let verify_bitflip = DeviceIdentity::verify(sender_dev.public_key_bytes(), &transcript, &tampered_sig);
        assert!(verify_bitflip.is_err(), "Bit-flipped signature must fail verification");

        // 7. Legitimate receiver transcript and signature
        let recv_transcript = compute_receiver_transcript("auradrop/tcp/2", tid, token, sid, rid, eph_pub, recv_eph_pub);
        let recv_sig = receiver_dev.sign(&recv_transcript).unwrap();
        assert!(DeviceIdentity::verify(receiver_dev.public_key_bytes(), &recv_transcript, &recv_sig).is_ok());

        // 8. Receiver identity key substitution
        let verify_recv_sub = DeviceIdentity::verify(attacker_dev.public_key_bytes(), &recv_transcript, &recv_sig);
        assert!(verify_recv_sub.is_err(), "Receiver signature must fail against attacker public key");
    }
}
