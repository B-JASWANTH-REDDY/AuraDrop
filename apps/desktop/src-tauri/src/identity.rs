use crate::crypto::DeviceIdentity;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IdentityData {
    pub device_id: String,
    pub device_name: String,
    #[serde(default)]
    pub pkcs8_hex: Option<String>,
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

        // Load or generate DeviceIdentity
        let device_identity = if let Some(ref pkcs8_hex) = identity.pkcs8_hex {
            if let Ok(pkcs8_bytes) = hex::decode(pkcs8_hex) {
                DeviceIdentity::from_pkcs8(&pkcs8_bytes).unwrap_or_else(|_| {
                    DeviceIdentity::generate().expect("Failed to generate ECDSA device identity")
                })
            } else {
                DeviceIdentity::generate().expect("Failed to generate ECDSA device identity")
            }
        } else {
            DeviceIdentity::generate().expect("Failed to generate ECDSA device identity")
        };

        // Ensure identity data contains the keys and is saved
        let needs_save = identity.pkcs8_hex.is_none() || identity.public_key_hex.is_none();
        identity.pkcs8_hex = Some(device_identity.pkcs8_hex());
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

    pub async fn verify_and_trust_peer(
        &self,
        peer_id: &str,
        peer_pub_hex: &str,
        data: &[u8],
        sig_hex: &str,
    ) -> Result<(), String> {
        let peer_pub_bytes = hex::decode(peer_pub_hex)
            .map_err(|e| format!("Invalid peer public key hex: {}", e))?;
        let sig_bytes = hex::decode(sig_hex)
            .map_err(|e| format!("Invalid signature hex: {}", e))?;

        // 1. Verify Trust Store (Trust On First Use / Anti-Impersonation)
        {
            let mut store = self.trust_store.write().await;
            if let Some(trusted_pub) = store.trusted_peers.get(peer_id) {
                if trusted_pub != peer_pub_hex {
                    return Err(format!(
                        "Cryptographic identity mismatch! Peer {} presented public key {} but was previously trusted as {}. Potential MitM / impersonation attack detected.",
                        peer_id, peer_pub_hex, trusted_pub
                    ));
                }
            } else {
                // Trust On First Use (TOFU)
                crate::log_debug(&format!(
                    "[TrustStore] First contact with peer {}. Recording trusted identity: {}",
                    peer_id, peer_pub_hex
                ));
                store.trusted_peers.insert(peer_id.to_string(), peer_pub_hex.to_string());
                if let Ok(json) = serde_json::to_string_pretty(&*store) {
                    let _ = fs::write(&self.trust_store_path, json);
                }
            }
        }

        // 2. Verify ECDSA signature over transcript
        DeviceIdentity::verify(&peer_pub_bytes, data, &sig_bytes)
    }

    pub async fn set_device_name(&self, new_name: String) {
        let mut w = self.data.write().await;
        w.device_name = new_name;
        if let Ok(json) = serde_json::to_string_pretty(&*w) {
            let _ = fs::write(&self.config_path, json);
        }
    }
}
