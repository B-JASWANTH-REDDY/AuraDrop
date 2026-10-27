use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PeerDevice {
    pub id: String,
    pub name: String,
    pub platform: String,
    pub ip: String,
    pub port: u16,
    pub status: String,
    pub version: String,
    pub last_seen_ms: i64,
    pub is_online: bool,
    #[serde(default)]
    pub identity_pub_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalDeviceInfo {
    pub device_id: String,
    pub device_name: String,
    pub platform: String,
    pub active_ip: String,
    pub active_interface: String,
    pub port: u16,
    pub downloads_dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectedFileInfo {
    pub name: String,
    pub path: String,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferProgressPayload {
    pub transfer_id: String,
    pub file_name: String,
    pub file_size: u64,
    pub bytes_transferred: u64,
    pub progress_percent: f64,
    pub speed_mbps: f64,
    pub eta_seconds: u64,
    pub is_incoming: bool,
    pub status: String, // "transferring", "completed", "failed", "canceled"
    pub peer_name: String,
    pub error: Option<String>,
    #[serde(default)]
    pub file_path: Option<String>,
    #[serde(default)]
    pub sas_code: Option<String>,
    #[serde(default)]
    pub is_first_contact: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveryPacket {
    #[serde(default)]
    pub protocol: String,
    #[serde(rename = "type", alias = "packetType", default)]
    pub packet_type: String,
    #[serde(rename = "deviceId", alias = "id", default)]
    pub device_id: String,
    #[serde(default)]
    pub name: String,
    #[serde(rename = "deviceName", default)]
    pub device_name: String,
    #[serde(default)]
    pub platform: String,
    #[serde(default)]
    pub port: Option<u16>,
    #[serde(rename = "transferPort", default)]
    pub transfer_port: Option<u16>,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub timestamp: Option<i64>,
    #[serde(default)]
    pub identity_pub_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareUploadRequest {
    pub transfer_id: String,
    #[serde(default)]
    pub file_id: Option<String>,
    pub file_name: String,
    pub file_size: u64,
    #[serde(default)]
    pub sha256: String,
    #[serde(default, alias = "senderId")]
    pub sender_user_id: String,
    #[serde(default, alias = "senderName")]
    pub sender_name: Option<String>,
    #[serde(default, alias = "receiverId")]
    pub receiver_user_id: Option<String>,
    #[serde(default)]
    pub supported_protocols: Option<Vec<String>>,
    #[serde(default)]
    pub client_quic_port: Option<u16>,
    #[serde(default)]
    pub sender_eph_pub_key: Option<String>,
    #[serde(default)]
    pub sender_identity_pub_key: Option<String>,
    #[serde(default)]
    pub sender_signature: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareUploadResponse {
    pub accepted: bool,
    pub transfer_id: String,
    pub file_id: String,
    pub one_time_token: String,
    pub expires_at: i64,
    pub protocol: String,
    #[serde(default)]
    pub encryption: Option<String>,
    #[serde(default)]
    pub receiver_id: Option<String>,
    #[serde(default)]
    pub receiver_eph_pub_key: Option<String>,
    #[serde(default)]
    pub receiver_identity_pub_key: Option<String>,
    #[serde(default)]
    pub receiver_signature: Option<String>,
    #[serde(default)]
    pub sas_code: Option<String>,
    #[serde(default)]
    pub is_first_contact: Option<bool>,
    #[serde(default)]
    pub quic_port: Option<u16>,
    #[serde(default)]
    pub cert_fingerprint: Option<String>,
    #[serde(default)]
    pub resume_offset: Option<u64>,
    #[serde(default)]
    pub resume_chunk_index: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferCheckpoint {
    pub transfer_id: String,
    pub file_name: String,
    pub file_size: u64,
    pub sha256_expected: String,
    pub sender_id: String,
    pub bytes_committed: u64,
    pub chunk_index: u64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub id: String,
    pub peer_id: String,
    pub peer_name: String,
    pub sender_id: String,
    pub sender_name: String,
    pub text: String,
    pub timestamp: i64,
    pub is_outgoing: bool,
}

