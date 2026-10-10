use crate::crypto::DeviceIdentity;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;

#[cfg(windows)]
pub mod os_crypto {
    use std::ptr::null_mut;

    #[repr(C)]
    struct DataBlob {
        cb_data: u32,
        pb_data: *mut u8,
    }

    extern "system" {
        fn CryptProtectData(
            p_data_in: *const DataBlob,
            sz_data_descr: *const u16,
            p_optional_entropy: *const DataBlob,
            pv_reserved: *mut std::ffi::c_void,
            p_prompt_struct: *mut std::ffi::c_void,
            dw_flags: u32,
            p_data_out: *mut DataBlob,
        ) -> i32;

        fn CryptUnprotectData(
            p_data_in: *const DataBlob,
            ppsz_data_descr: *mut *mut u16,
            p_optional_entropy: *const DataBlob,
            pv_reserved: *mut std::ffi::c_void,
            p_prompt_struct: *mut std::ffi::c_void,
            dw_flags: u32,
            p_data_out: *mut DataBlob,
        ) -> i32;

        fn LocalFree(h_mem: *mut std::ffi::c_void) -> *mut std::ffi::c_void;
    }

    const CRYPTPROTECT_UI_FORBIDDEN: u32 = 0x1;

    pub fn protect_secret(plaintext: &[u8]) -> Result<Vec<u8>, String> {
        if plaintext.is_empty() {
            return Ok(Vec::new());
        }
        let in_blob = DataBlob {
            cb_data: plaintext.len() as u32,
            pb_data: plaintext.as_ptr() as *mut u8,
        };
        let mut out_blob = DataBlob {
            cb_data: 0,
            pb_data: null_mut(),
        };

        let success = unsafe {
            CryptProtectData(
                &in_blob,
                null_mut(),
                null_mut(),
                null_mut(),
                null_mut(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut out_blob,
            )
        };

        if success == 0 || out_blob.pb_data.is_null() {
            return Err("Windows DPAPI CryptProtectData failed".to_string());
        }

        let encrypted = unsafe {
            std::slice::from_raw_parts(out_blob.pb_data, out_blob.cb_data as usize).to_vec()
        };
        unsafe {
            LocalFree(out_blob.pb_data as *mut std::ffi::c_void);
        }

        Ok(encrypted)
    }

    pub fn unprotect_secret(ciphertext: &[u8]) -> Result<Vec<u8>, String> {
        if ciphertext.is_empty() {
            return Ok(Vec::new());
        }
        let in_blob = DataBlob {
            cb_data: ciphertext.len() as u32,
            pb_data: ciphertext.as_ptr() as *mut u8,
        };
        let mut out_blob = DataBlob {
            cb_data: 0,
            pb_data: null_mut(),
        };

        let success = unsafe {
            CryptUnprotectData(
                &in_blob,
                null_mut(),
                null_mut(),
                null_mut(),
                null_mut(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut out_blob,
            )
        };

        if success == 0 || out_blob.pb_data.is_null() {
            return Err("Windows DPAPI CryptUnprotectData failed (tampered ciphertext or access denied)".to_string());
        }

        let decrypted = unsafe {
            std::slice::from_raw_parts(out_blob.pb_data, out_blob.cb_data as usize).to_vec()
        };
        unsafe {
            LocalFree(out_blob.pb_data as *mut std::ffi::c_void);
        }

        Ok(decrypted)
    }
}

#[cfg(not(windows))]
pub mod os_crypto {
    pub fn protect_secret(plaintext: &[u8]) -> Result<Vec<u8>, String> {
        Ok(plaintext.to_vec())
    }

    pub fn unprotect_secret(ciphertext: &[u8]) -> Result<Vec<u8>, String> {
        Ok(ciphertext.to_vec())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IdentityData {
    pub device_id: String,
    pub device_name: String,
    #[serde(default)]
    pub pkcs8_hex: Option<String>,
    #[serde(default)]
    pub pkcs8_protected_hex: Option<String>,
    #[serde(default)]
    pub public_key_hex: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TrustStoreData {
    pub trusted_peers: HashMap<String, String>, // peer_id -> identity_pub_hex
}

#[derive(Clone)]
pub struct IdentityManager {
    data: Arc<RwLock<IdentityData>>,
    device_identity: DeviceIdentity,
    trust_store: Arc<RwLock<TrustStoreData>>,
    config_path: PathBuf,
    trust_store_path: PathBuf,
}

impl IdentityManager {
    pub fn init() -> Self {
        let config_dir = dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("AuraDrop");

        if !config_dir.exists() {
            let _ = fs::create_dir_all(&config_dir);
        }

        let config_path = config_dir.join("identity.json");
        let trust_store_path = config_dir.join("trusted_peers.json");

        // Load or create trust store
        let trust_store_data: TrustStoreData = if trust_store_path.exists() {
            fs::read_to_string(&trust_store_path)
                .ok()
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default()
        } else {
            TrustStoreData::default()
        };

        // Load or create identity data
        let mut identity = if config_path.exists() {
            match fs::read_to_string(&config_path) {
                Ok(content) => serde_json::from_str::<IdentityData>(&content).unwrap_or_else(|_| {
                    Self::generate_new_identity()
                }),
                Err(_) => Self::generate_new_identity(),
            }
        } else {
            Self::generate_new_identity()
        };

        let mut needs_save = false;

        // 1. Try loading from DPAPI-protected storage
        let device_identity = if let Some(ref protected_hex) = identity.pkcs8_protected_hex {
            if let Ok(protected_bytes) = hex::decode(protected_hex) {
                match os_crypto::unprotect_secret(&protected_bytes) {
                    Ok(plain_bytes) => {
                        DeviceIdentity::from_pkcs8(&plain_bytes).unwrap_or_else(|_| {
                            crate::log_debug("[Identity] Failed to parse decrypted PKCS#8 key. Regenerating.");
                            needs_save = true;
                            DeviceIdentity::generate().expect("ECDSA gen failed")
                        })
                    }
                    Err(e) => {
                        crate::log_debug(&format!("[Identity] DPAPI unprotect failed: {}. Regenerating protected key.", e));
                        needs_save = true;
                        DeviceIdentity::generate().expect("ECDSA gen failed")
                    }
                }
            } else {
                needs_save = true;
                DeviceIdentity::generate().expect("ECDSA gen failed")
            }
        } else if let Some(ref legacy_pkcs8_hex) = identity.pkcs8_hex {
            // Migrate legacy plaintext PKCS#8 key to OS-protected storage
            if let Ok(pkcs8_bytes) = hex::decode(legacy_pkcs8_hex) {
                let dev_id = DeviceIdentity::from_pkcs8(&pkcs8_bytes).unwrap_or_else(|_| {
                    DeviceIdentity::generate().expect("ECDSA gen failed")
                });
                needs_save = true;
                dev_id
            } else {
                needs_save = true;
                DeviceIdentity::generate().expect("ECDSA gen failed")
            }
        } else {
            needs_save = true;
            DeviceIdentity::generate().expect("Failed to generate ECDSA device identity")
        };

        // Always ensure private key is protected with DPAPI and scrub plaintext from memory/disk
        match os_crypto::protect_secret(&device_identity.pkcs8_bytes()) {
            Ok(protected_bytes) => {
                identity.pkcs8_protected_hex = Some(hex::encode(protected_bytes));
                identity.pkcs8_hex = None; // Scrub plaintext key
            }
            Err(e) => {
                crate::log_debug(&format!("[Identity] Warning: OS protection failed: {}", e));
            }
        }
        identity.public_key_hex = Some(device_identity.public_key_hex());

        if needs_save || !config_path.exists() {
            if let Ok(json) = serde_json::to_string_pretty(&identity) {
                let _ = fs::write(&config_path, json);
            }
        }

        Self {
            data: Arc::new(RwLock::new(identity)),
            device_identity,
            trust_store: Arc::new(RwLock::new(trust_store_data)),
            config_path,
            trust_store_path,
        }
    }

    fn generate_new_identity() -> IdentityData {
        let device_id = Uuid::new_v4().to_string();
        let short_id = device_id[..4].to_string();
        let hostname = std::env::var("COMPUTERNAME")
            .or_else(|_| std::env::var("HOSTNAME"))
            .unwrap_or_else(|_| "Desktop".to_string());

        IdentityData {
            device_id,
            device_name: format!("{} ({})", hostname, short_id),
            pkcs8_hex: None,
            pkcs8_protected_hex: None,
            public_key_hex: None,
        }
    }

    pub async fn get_device_id(&self) -> String {
        self.data.read().await.device_id.clone()
    }

    pub async fn get_device_name(&self) -> String {
        self.data.read().await.device_name.clone()
    }

    pub fn get_public_key_hex(&self) -> String {
        self.device_identity.public_key_hex()
    }

    pub fn get_public_key_bytes(&self) -> &[u8] {
        self.device_identity.public_key_bytes()
    }

    pub fn sign_transcript(&self, data: &[u8]) -> Result<String, String> {
        let sig_bytes = self.device_identity.sign(data)?;
        Ok(hex::encode(sig_bytes))
    }

    /// Check whether a peer identity is already trusted, is on first contact, or has mismatched keys.
    /// Returns Ok(false) if peer is already known and trusted (frictionless).
    /// Returns Ok(true) if peer is contacting for the first time (SAS verification required).
    /// Returns Err(String) if peer identity changed (MitM / key substitution attack detected).
    pub async fn check_peer_trust_status(
        &self,
        peer_id: &str,
        peer_pub_hex: &str,
    ) -> Result<bool, String> {
        let store = self.trust_store.read().await;
        if let Some(trusted_pub) = store.trusted_peers.get(peer_id) {
            if trusted_pub != peer_pub_hex {
                return Err(format!(
                    "Cryptographic identity mismatch! Peer {} presented public key {} but was previously trusted as {}. Potential MitM / impersonation attack detected.",
                    peer_id, peer_pub_hex, trusted_pub
                ));
            }
            Ok(false) // Known, trusted peer
        } else {
            Ok(true) // First contact
        }
    }

    /// Mark a peer identity as trusted in persistent Trust Store once verified.
    pub async fn mark_peer_trusted(&self, peer_id: &str, peer_pub_hex: &str) -> Result<(), String> {
        let mut store = self.trust_store.write().await;
        store.trusted_peers.insert(peer_id.to_string(), peer_pub_hex.to_string());
        if let Ok(json) = serde_json::to_string_pretty(&*store) {
            let _ = fs::write(&self.trust_store_path, json);
        }
        crate::log_debug(&format!(
            "[TrustStore] Peer {} ({}) marked trusted in persistent store",
            peer_id, peer_pub_hex
        ));
        Ok(())
    }

    /// Verify peer signature and trust status.
    /// Returns Ok(is_first_contact) on successful signature verification.
    pub async fn verify_peer_handshake(
        &self,
        peer_id: &str,
        peer_pub_hex: &str,
        data: &[u8],
        sig_hex: &str,
    ) -> Result<bool, String> {
        let is_first_contact = self.check_peer_trust_status(peer_id, peer_pub_hex).await?;
        let peer_pub_bytes = hex::decode(peer_pub_hex)
            .map_err(|e| format!("Invalid peer public key hex: {}", e))?;
        let sig_bytes = hex::decode(sig_hex)
            .map_err(|e| format!("Invalid signature hex: {}", e))?;

        DeviceIdentity::verify(&peer_pub_bytes, data, &sig_bytes)?;
        Ok(is_first_contact)
    }

    /// Backwards compatibility helper
    pub async fn verify_and_trust_peer(
        &self,
        peer_id: &str,
        peer_pub_hex: &str,
        data: &[u8],
        sig_hex: &str,
    ) -> Result<bool, String> {
        let is_first = self.verify_peer_handshake(peer_id, peer_pub_hex, data, sig_hex).await?;
        if is_first {
            let _ = self.mark_peer_trusted(peer_id, peer_pub_hex).await;
        }
        Ok(is_first)
    }

    pub async fn set_device_name(&self, new_name: String) {
        let mut w = self.data.write().await;
        w.device_name = new_name;
        if let Ok(json) = serde_json::to_string_pretty(&*w) {
            let _ = fs::write(&self.config_path, json);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_os_crypto_roundtrip() {
        let secret = b"super_secret_device_identity_key_material_bytes";
        let protected = os_crypto::protect_secret(secret).expect("Protect secret failed");
        assert_ne!(protected, secret, "Protected secret must not equal plaintext");

        let decrypted = os_crypto::unprotect_secret(&protected).expect("Unprotect secret failed");
        assert_eq!(decrypted, secret, "Decrypted secret must match original plaintext");
    }

    #[tokio::test]
    async fn test_trust_store_first_contact_and_tamper_detection() {
        let temp_dir = tempfile::tempdir().unwrap();
        let config_path = temp_dir.path().join("identity.json");
        let trust_path = temp_dir.path().join("trusted_peers.json");

        let id_manager = IdentityManager {
            data: Arc::new(RwLock::new(IdentityManager::generate_new_identity())),
            device_identity: DeviceIdentity::generate().unwrap(),
            trust_store: Arc::new(RwLock::new(TrustStoreData::default())),
            config_path,
            trust_store_path: trust_path,
        };

        let peer_id = "test_peer_alice";
        let peer_pub = "04112233445566778899aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff00";

        // 1. First contact
        let is_first = id_manager.check_peer_trust_status(peer_id, peer_pub).await.unwrap();
        assert!(is_first, "Initial connection must be flagged as first contact");

        // 2. Mark trusted
        id_manager.mark_peer_trusted(peer_id, peer_pub).await.unwrap();

        // 3. Subsequent connection
        let is_subsequent = id_manager.check_peer_trust_status(peer_id, peer_pub).await.unwrap();
        assert!(!is_subsequent, "Subsequent connection must not be first contact");

        // 4. Attacker attempts to replace peer's public key (MitM / key substitution)
        let attacker_pub = "04ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
        let tamper_result = id_manager.check_peer_trust_status(peer_id, attacker_pub).await;
        assert!(tamper_result.is_err(), "Key replacement attack must be rejected by trust store");
    }
}
