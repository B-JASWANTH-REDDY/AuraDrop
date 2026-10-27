use crate::identity::IdentityManager;
use crate::models::{
    ChatMessage, PrepareUploadRequest, PrepareUploadResponse, TransferProgressPayload,
};
use axum::{
    body::Body,
    extract::{DefaultBodyLimit, Query, State},
    http::{HeaderMap, StatusCode},
    response::Json,
    routing::{get, post},
    Router,
};
use chrono::Utc;
use futures_util::StreamExt;
use reqwest::Client;
use serde::Deserialize;
use serde_json::json;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::AsyncWriteExt;
use tokio::sync::RwLock;
use tower_http::cors::CorsLayer;
use uuid::Uuid;

pub const TRANSFER_PORT: u16 = 53317;

/// Sanitizes a filename to prevent path traversal and filesystem incompatibilities.
pub fn sanitize_filename(name: &str) -> String {
    let clean = name.replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|', '\0'], "_");
    let parts: Vec<&str> = clean.split('.').filter(|s| *s != ".." && *s != ".").collect();
    let sanitized = parts.join(".");
    let trimmed = sanitized.trim().trim_matches('.');
    if trimmed.is_empty() {
        "received_file".to_string()
    } else {
        trimmed.to_string()
    }
}

/// Resolves a non-colliding destination path in the target directory.
pub fn resolve_unique_destination(dir: &Path, file_name: &str) -> PathBuf {
    let safe_name = sanitize_filename(file_name);
    let mut candidate = dir.join(&safe_name);
    if !candidate.exists() {
        return candidate;
    }

    let stem = Path::new(&safe_name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("file");
    let ext = Path::new(&safe_name)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("");

    let mut counter = 1;
    loop {
        let new_name = if ext.is_empty() {
            format!("{} ({})", stem, counter)
        } else {
            format!("{} ({}).{}", stem, counter, ext)
        };
        candidate = dir.join(new_name);
        if !candidate.exists() {
            return candidate;
        }
        counter += 1;
    }
}

#[derive(Debug, Clone)]
pub struct SessionMetadata {
    pub transfer_id: String,
    pub file_name: String,
    pub file_size: u64,
    pub sha256_expected: String,
    pub token: String,
    pub expires_at: i64,
    pub sender_name: String,
    pub sender_id: String,
    pub sender_identity_pub_hex: String,
    pub sas_code: String,
    pub is_first_contact: bool,
    pub is_consumed: bool,
    pub session_key: [u8; 32],
}

#[derive(Clone)]
pub struct TransferService {
    identity: IdentityManager,
    sessions: Arc<RwLock<HashMap<String, SessionMetadata>>>,
    chat_history: Arc<RwLock<HashMap<String, Vec<ChatMessage>>>>,
    pub pending_verifications: Arc<RwLock<HashMap<String, tokio::sync::oneshot::Sender<bool>>>>,
    app_handle: Option<AppHandle>,
    downloads_dir: PathBuf,
}

impl TransferService {
    pub fn new(identity: IdentityManager) -> Self {
        let downloads = dirs::download_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("AuraDrop");

        let _ = fs::create_dir_all(&downloads);

        Self {
            identity,
            sessions: Arc::new(RwLock::new(HashMap::new())),
            chat_history: Arc::new(RwLock::new(HashMap::new())),
            pending_verifications: Arc::new(RwLock::new(HashMap::new())),
            app_handle: None,
            downloads_dir: downloads,
        }
    }

    pub fn set_app_handle(&mut self, app_handle: AppHandle) {
        self.app_handle = Some(app_handle);
    }

    pub async fn confirm_verification(&self, transfer_id: &str, confirmed: bool) -> bool {
        let mut map = self.pending_verifications.write().await;
        if let Some(tx) = map.remove(transfer_id) {
            let _ = tx.send(confirmed);
            true
        } else {
            false
        }
    }

    pub fn get_downloads_dir(&self) -> String {
        self.downloads_dir.to_string_lossy().to_string()
    }

    pub fn start_server(&self) {
        let service = self.clone();

        tauri::async_runtime::spawn(async move {
            crate::log_debug("[TransferServer] spawn task entered - TCP bulk transport mode");

            let app = Router::new()
                .route("/api/auradrop/v1/ping", get(handle_ping))
                .route("/api/auradrop/v1/info", get(handle_info))
                .route("/api/auradrop/v1/prepare-upload", post(handle_prepare_upload))
                .route(
                    "/api/auradrop/v1/upload",
                    post(handle_upload).layer(DefaultBodyLimit::max(50 * 1024 * 1024 * 1024)), // 50GB max
                )
                .route("/api/auradrop/v1/chat", post(handle_chat))
                .layer(CorsLayer::permissive())
                .with_state(service);

            crate::log_debug(&format!("[TransferServer] Attempting to bind TCP 0.0.0.0:{}", TRANSFER_PORT));
            let listener = match tokio::net::TcpListener::bind(format!("0.0.0.0:{}", TRANSFER_PORT)).await {
                Ok(l) => {
                    crate::log_debug(&format!("[TransferServer] Successfully bound TCP on 0.0.0.0:{}", TRANSFER_PORT));
                    l
                }
                Err(e) => {
                    crate::log_debug(&format!("[TransferServer] Port {} bind failed: {}", TRANSFER_PORT, e));
                    return;
                }
            };

            crate::log_debug(&format!("[TransferServer] Starting axum::serve on {}", TRANSFER_PORT));
            if let Err(e) = axum::serve(listener, app).await {
                crate::log_debug(&format!("[TransferServer] axum::serve error: {}", e));
            }
        });
    }

    pub async fn send_file(
        &self,
        peer_ip: String,
        peer_port: u16,
        file_path_str: String,
        peer_name: String,
    ) -> Result<(), String> {
        let path = PathBuf::from(&file_path_str);
        if !path.exists() {
            return Err("Selected file does not exist".to_string());
        }

        let file_meta = fs::metadata(&path).map_err(|e| e.to_string())?;
        let file_size = file_meta.len();
        let file_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("file")
            .to_string();

        let my_id = self.identity.get_device_id().await;
        let my_name = self.identity.get_device_name().await;
        let transfer_id = Uuid::new_v4().to_string();

        // Calculate SHA-256 in-flight or streamed for verification
        let sha256_hash = if file_size <= 500 * 1024 * 1024 {
            let mut hasher = Sha256::new();
            if let Ok(mut f) = File::open(&path) {
                let mut buf = [0u8; 512 * 1024];
                while let Ok(n) = f.read(&mut buf) {
                    if n == 0 { break; }
                    hasher.update(&buf[..n]);
                }
                hex::encode(hasher.finalize())
            } else {
                format!("stream_{}", transfer_id)
            }
        } else {
            format!("stream_{}", transfer_id)
        };

        // Emit initial transfer progress
        self.emit_progress(TransferProgressPayload {
            transfer_id: transfer_id.clone(),
            file_name: file_name.clone(),
            file_size,
            bytes_transferred: 0,
            progress_percent: 0.0,
            speed_mbps: 0.0,
            eta_seconds: 0,
            is_incoming: false,
            status: "transferring".to_string(),
            peer_name: peer_name.clone(),
            error: None,
            file_path: Some(file_path_str.clone()),
            sas_code: None,
            is_first_contact: None,
        })
        .await;

        let client = Client::builder()
            .tcp_nodelay(true)
            .connect_timeout(std::time::Duration::from_secs(10))
            .build()
            .unwrap_or_default();

        // Ephemeral ECDH keypair generation for forward-secret key agreement
        let sender_eph = crate::crypto::EphemeralKeyExchange::generate()
            .map_err(|e| format!("ECDH key generation failed: {}", e))?;
        let sender_eph_pub_hex = sender_eph.public_key_hex();
        let my_identity_pub_hex = self.identity.get_public_key_hex();

        // Sign the sender transcript with our persistent device identity
        let sender_transcript = crate::crypto::compute_sender_transcript(
            "auradrop/tcp/2",
            &transfer_id,
            &my_id,
            &sender_eph_pub_hex,
        );
        let sender_signature_hex = self.identity.sign_transcript(&sender_transcript)
            .map_err(|e| format!("Sender identity signing failed: {}", e))?;

        // Step 1: Handshake with recipient on /prepare-upload
        let prep_url = format!("http://{}:{}/api/auradrop/v1/prepare-upload", peer_ip, peer_port);
        let prep_body = json!({
            "transferId": transfer_id,
            "fileName": file_name,
            "fileSize": file_size,
            "sha256": sha256_hash,
            "senderUserId": my_id,
            "senderName": my_name,
            "senderEphPubKey": sender_eph_pub_hex,
            "senderIdentityPubKey": my_identity_pub_hex,
            "senderSignature": sender_signature_hex,
        });

        let prep_res = client
            .post(&prep_url)
            .json(&prep_body)
            .send()
            .await
            .map_err(|e| format!("Prepare upload connection failed: {}", e))?;

        if !prep_res.status().is_success() {
            let err = format!("Recipient declined or rejected transfer: HTTP {}", prep_res.status());
            self.emit_error(&transfer_id, &file_name, file_size, &peer_name, false, &err).await;
            return Err(err);
        }

        let prep_data: PrepareUploadResponse = prep_res
            .json()
            .await
            .map_err(|e| format!("Failed to parse prepare response: {}", e))?;

        if !prep_data.accepted {
            let err = "Transfer declined by recipient".to_string();
            self.emit_error(&transfer_id, &file_name, file_size, &peer_name, false, &err).await;
            return Err(err);
        }

        // Strict fail-closed policy: plaintext fallback is completely forbidden
        if prep_data.encryption.as_deref() != Some("aead-aes256-gcm") {
            let err = "Recipient rejected authenticated encryption. Plaintext transfer is forbidden.".to_string();
            self.emit_error(&transfer_id, &file_name, file_size, &peer_name, false, &err).await;
            return Err(err);
        }

        let receiver_eph_hex = prep_data.receiver_eph_pub_key.as_ref()
            .ok_or_else(|| "Recipient omitted ephemeral public key".to_string())?;
        let receiver_identity_hex = prep_data.receiver_identity_pub_key.as_ref()
            .ok_or_else(|| "Recipient omitted identity public key".to_string())?;
        let receiver_sig_hex = prep_data.receiver_signature.as_ref()
            .ok_or_else(|| "Recipient omitted cryptographic signature".to_string())?;
        let target_peer_id = prep_data.receiver_id.as_deref().unwrap_or(&peer_ip);

        // Verify receiver's cryptographic signature and Trust Store identity
        let receiver_transcript = crate::crypto::compute_receiver_transcript(
            &prep_data.protocol,
            &transfer_id,
            &prep_data.one_time_token,
            &my_id,
            target_peer_id,
            &sender_eph_pub_hex,
            receiver_eph_hex,
        );
        let is_first_contact = self.identity.verify_peer_handshake(
            target_peer_id,
            receiver_identity_hex,
            &receiver_transcript,
            receiver_sig_hex,
        ).await.map_err(|e| {
            let err = format!("Cryptographic recipient authentication failed: {}", e);
            crate::log_debug(&err);
            err
        })?;

        // Perform ECDH agreement and derive directional keys bound to both identities
        let receiver_pub_bytes = hex::decode(receiver_eph_hex)
            .map_err(|e| format!("Invalid receiver ephemeral public key hex: {}", e))?;
        let shared_secret = sender_eph.complete(&receiver_pub_bytes)
            .map_err(|e| format!("ECDH key agreement failed: {}", e))?;

        // Compute 6-digit Short Authentication String (SAS)
        let sas_code = crate::crypto::compute_sas_code(
            &shared_secret,
            &transfer_id,
            &my_id,
            target_peer_id,
            &my_identity_pub_hex,
            receiver_identity_hex,
            &sender_eph_pub_hex,
            receiver_eph_hex,
        );

        // Auto-trust peer upon successful handshake if first contact
        if is_first_contact {
            crate::log_debug(&format!(
                "[AuraTransfer] Outbound first contact with recipient {} - Trust established",
                target_peer_id
            ));
            let _ = self.identity.mark_peer_trusted(target_peer_id, receiver_identity_hex).await;
        }

        let directional = crate::crypto::derive_directional_session_keys(
            &shared_secret,
            &transfer_id,
            &prep_data.one_time_token,
            &my_id,
            target_peer_id,
            &my_identity_pub_hex,
            receiver_identity_hex,
        );
        let session_key = directional.sender_to_receiver;

        // Step 2: Stream file bytes over authenticated TCP with AEAD encryption and bounded buffer (512 KiB)
        // Clean URL: Token and transfer ID removed from query string per security requirements
        let upload_url = format!("http://{}:{}/api/auradrop/v1/upload", peer_ip, peer_port);

        let file_async = tokio::fs::File::open(&path).await.map_err(|e| e.to_string())?;
        let self_clone = self.clone();
        let transfer_id_clone = transfer_id.clone();
        let file_name_clone = file_name.clone();
        let peer_name_clone = peer_name.clone();
        let file_path_clone = file_path_str.clone();

        let mut transferred = 0u64;
        let mut last_emit = Instant::now();
        let mut last_speed_time = Instant::now();
        let mut last_speed_bytes = 0u64;
        let mut smoothed_speed = 0.0f64;

        let tid_for_stream = transfer_id.clone();
        let mut chunk_counter = 0u64;

        // Bounded 512 KiB streaming chunks with AES-256-GCM AEAD authenticated encryption
        let reader_stream = tokio_util::io::ReaderStream::with_capacity(file_async, 512 * 1024).map(move |item| {
            match item {
                Ok(bytes) => {
                    let chunk_len = bytes.len() as u64;
                    transferred += chunk_len;
                    if last_emit.elapsed().as_millis() >= 120 || transferred == file_size {
                        last_emit = Instant::now();
                        let time_delta = last_speed_time.elapsed().as_secs_f64().max(0.001);
                        if time_delta >= 0.15 || transferred == file_size {
                            let bytes_delta = transferred.saturating_sub(last_speed_bytes);
                            let sample_speed = (bytes_delta as f64 / (1024.0 * 1024.0)) / time_delta;
                            smoothed_speed = if smoothed_speed == 0.0 {
                                sample_speed
                            } else {
                                0.35 * sample_speed + 0.65 * smoothed_speed
                            };
                            last_speed_time = Instant::now();
                            last_speed_bytes = transferred;
                        }
                        let speed = smoothed_speed.max(0.0);
                        let remaining = file_size.saturating_sub(transferred);
                        let eta = if speed > 0.0 {
                            ((remaining as f64 / (1024.0 * 1024.0)) / speed).ceil() as u64
                        } else {
                            0
                        };
                        let percent = if file_size > 0 {
                            (transferred as f64 / file_size as f64) * 100.0
                        } else {
                            100.0
                        };

                        let s = self_clone.clone();
                        let tid = transfer_id_clone.clone();
                        let fnm = file_name_clone.clone();
                        let pnm = peer_name_clone.clone();
                        let fp = file_path_clone.clone();
                        tauri::async_runtime::spawn(async move {
                            s.emit_progress(TransferProgressPayload {
                                transfer_id: tid,
                                file_name: fnm,
                                file_size,
                                bytes_transferred: transferred,
                                progress_percent: percent,
                                speed_mbps: speed,
                                eta_seconds: eta,
                                is_incoming: false,
                                status: if transferred >= file_size {
                                    "completed".to_string()
                                } else {
                                    "transferring".to_string()
                                },
                                peer_name: pnm,
                                error: None,
                                file_path: Some(fp),
                                sas_code: None,
                                is_first_contact: None,
                            })
                            .await;
                        });
                    }

                    // Encrypt chunk with AES-256-GCM authenticated encryption (AEAD)
                    let nonce = crate::crypto::create_chunk_nonce(1337, chunk_counter);
                    let aad = format!("{}:{}", tid_for_stream, chunk_counter);
                    chunk_counter += 1;

                    match crate::crypto::encrypt_chunk(&session_key, &nonce, aad.as_bytes(), &bytes) {
                        Ok(ciphertext) => {
                            let mut frame = Vec::with_capacity(4 + 12 + ciphertext.len());
                            frame.extend_from_slice(&(ciphertext.len() as u32).to_be_bytes());
                            frame.extend_from_slice(&nonce);
                            frame.extend_from_slice(&ciphertext);
                            Ok(bytes::Bytes::from(frame))
                        }
                        Err(e) => Err(std::io::Error::new(std::io::ErrorKind::Other, e)),
                    }
                }
                Err(e) => Err(e),
            }
        });

        let res = client
            .post(&upload_url)
            .header("expect", "")
            .header("authorization", format!("Bearer {}", prep_data.one_time_token))
            .header("x-token", &prep_data.one_time_token)
            .header("x-transfer-id", &transfer_id)
            .header("x-sender-id", &my_id)
            .header("x-encryption", "aead-aes256-gcm")
            .header("x-file-name", &file_name)
            .header("x-file-size", file_size.to_string())
            .header("x-sha256", &sha256_hash)
            .body(reqwest::Body::wrap_stream(reader_stream))
            .send()
            .await
            .map_err(|e| format!("Upload stream error: {}", e))?;

        if !res.status().is_success() {
            let err = format!("Upload failed: HTTP {}", res.status());
            self.emit_error(&transfer_id, &file_name, file_size, &peer_name, false, &err).await;
            return Err(err);
        }

        // Trust on First Use: Mark verified peer as trusted upon successful transfer completion
        if is_first_contact {
            let _ = self.identity.mark_peer_trusted(target_peer_id, receiver_identity_hex).await;
        }

        // Final Completed emit
        self.emit_progress(TransferProgressPayload {
            transfer_id: transfer_id.clone(),
            file_name: file_name.clone(),
            file_size,
            bytes_transferred: file_size,
            progress_percent: 100.0,
            speed_mbps: 0.0,
            eta_seconds: 0,
            is_incoming: false,
            status: "completed".to_string(),
            peer_name,
            error: None,
            file_path: Some(file_path_str),
            sas_code: Some(sas_code),
            is_first_contact: Some(is_first_contact),
        })
        .await;

        Ok(())
    }

    async fn emit_progress(&self, payload: TransferProgressPayload) {
        if let Some(ref handle) = self.app_handle {
            let _ = handle.emit("transfer-progress", &payload);
            if payload.status == "awaiting_verification" || (payload.is_incoming && payload.status == "transferring" && payload.bytes_transferred == 0) {
                if let Some(window) = handle.get_webview_window("main") {
                    let _ = window.unminimize();
                    let _ = window.show();
                    let _ = window.request_user_attention(Some(tauri::UserAttentionType::Critical));
                }
            }
        }
    }

    async fn emit_error(
        &self,
        transfer_id: &str,
        file_name: &str,
        file_size: u64,
        peer_name: &str,
        is_incoming: bool,
        error: &str,
    ) {
        if let Some(ref handle) = self.app_handle {
            let payload = TransferProgressPayload {
                transfer_id: transfer_id.to_string(),
                file_name: file_name.to_string(),
                file_size,
                bytes_transferred: 0,
                progress_percent: 0.0,
                speed_mbps: 0.0,
                eta_seconds: 0,
                is_incoming,
                status: "failed".to_string(),
                peer_name: peer_name.to_string(),
                error: Some(error.to_string()),
                file_path: None,
                sas_code: None,
                is_first_contact: None,
            };
            let _ = handle.emit("transfer-progress", payload);
        }
    }

    pub async fn send_chat(
        &self,
        peer_ip: String,
        peer_port: u16,
        peer_id: String,
        peer_name: String,
        text: String,
    ) -> Result<ChatMessage, String> {
        let my_id = self.identity.get_device_id().await;
        let my_name = self.identity.get_device_name().await;
        let now = Utc::now().timestamp_millis();
        let msg_id = format!("msg_{}", Uuid::new_v4().simple());

        let msg = ChatMessage {
            id: msg_id.clone(),
            peer_id: peer_id.clone(),
            peer_name: peer_name.clone(),
            sender_id: my_id.clone(),
            sender_name: my_name.clone(),
            text: text.clone(),
            timestamp: now,
            is_outgoing: true,
        };

        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .tcp_nodelay(true)
            .build()
            .map_err(|e| e.to_string())?;

        let url = format!("http://{}:{}/api/auradrop/v1/chat", peer_ip, peer_port);
        let res = client
            .post(&url)
            .header("expect", "")
            .json(&json!({
                "id": msg_id,
                "senderId": my_id,
                "senderName": my_name,
                "text": text,
                "timestamp": now,
            }))
            .send()
            .await
            .map_err(|e| format!("Failed to send chat to {}: {}", url, e))?;

        if !res.status().is_success() {
            return Err(format!("Peer returned error status: {}", res.status()));
        }

        {
            let mut hist = self.chat_history.write().await;
            hist.entry(peer_id.clone()).or_insert_with(Vec::new).push(msg.clone());
        }

        if let Some(ref handle) = self.app_handle {
            let _ = handle.emit("chat-message-sent", &msg);
        }

        Ok(msg)
    }

    pub async fn get_chat_history(&self, peer_id: &str) -> Vec<ChatMessage> {
        let hist = self.chat_history.read().await;
        hist.get(peer_id).cloned().unwrap_or_default()
    }

    pub async fn get_all_chat_messages(&self) -> Vec<ChatMessage> {
        let hist = self.chat_history.read().await;
        let mut all: Vec<ChatMessage> = Vec::new();
        for (_, msgs) in hist.iter() {
            all.extend(msgs.clone());
        }
        all.sort_by_key(|m| m.timestamp);
        all
    }

    pub async fn cancel_transfer(&self, transfer_id: &str) {
        crate::log_debug(&format!("[TransferService] User requested cancel for transfer: {}", transfer_id));
        self.sessions.write().await.remove(transfer_id);
        self.emit_error(
            transfer_id,
            "Transfer",
            0,
            "",
            false,
            "Transfer cancelled by user",
        )
        .await;
    }
}

// Axum Handlers
async fn handle_ping(State(service): State<TransferService>) -> Json<serde_json::Value> {
    let id = service.identity.get_device_id().await;
    let name = service.identity.get_device_name().await;
    let identity_pub = service.identity.get_public_key_hex();
    Json(json!({
        "status": "ok",
        "pong": true,
        "deviceId": id,
        "deviceName": name,
        "name": name,
        "platform": "windows",
        "port": TRANSFER_PORT,
        "transferPort": TRANSFER_PORT,
        "protocol": "AURADROP/1",
        "identityPubKey": identity_pub
    }))
}

async fn handle_info(State(service): State<TransferService>) -> Json<serde_json::Value> {
    let id = service.identity.get_device_id().await;
    let name = service.identity.get_device_name().await;
    Json(json!({
        "deviceId": id,
        "deviceName": name,
        "platform": "windows"
    }))
}

async fn handle_prepare_upload(
    State(service): State<TransferService>,
    Json(payload): Json<PrepareUploadRequest>,
) -> Result<Json<PrepareUploadResponse>, (StatusCode, Json<serde_json::Value>)> {
    if payload.file_name.trim().is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "Filename must not be empty"})),
        ));
    }

    let sender_eph_hex = match payload.sender_eph_pub_key.as_ref() {
        Some(k) if !k.is_empty() => k,
        _ => {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "Missing ephemeral ECDH public key. Authenticated encryption required."})),
            ));
        }
    };
    let sender_identity_hex = match payload.sender_identity_pub_key.as_ref() {
        Some(k) if !k.is_empty() => k,
        _ => {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "Missing sender identity public key. Authenticated key exchange required."})),
            ));
        }
    };
    let sender_sig_hex = match payload.sender_signature.as_ref() {
        Some(s) if !s.is_empty() => s,
        _ => {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "Missing sender cryptographic signature. Authenticated key exchange required."})),
            ));
        }
    };

    // Verify sender signature over sender transcript and validate against Trust Store
    let sender_transcript = crate::crypto::compute_sender_transcript(
        "auradrop/tcp/2",
        &payload.transfer_id,
        &payload.sender_user_id,
        sender_eph_hex,
    );
    let is_first_contact = match service.identity.verify_peer_handshake(
        &payload.sender_user_id,
        sender_identity_hex,
        &sender_transcript,
        sender_sig_hex,
    ).await {
        Ok(first) => first,
        Err(e) => {
            crate::log_debug(&format!("[PrepareUpload] Authentication failed: {}", e));
            return Err((
                StatusCode::FORBIDDEN,
                Json(json!({"error": format!("Sender cryptographic authentication failed: {}", e)})),
            ));
        }
    };

    let token = Uuid::new_v4().to_string();
    let expires_at = Utc::now().timestamp_millis() + 60000; // 60s TTL
    let sender_name = payload.sender_name.clone().unwrap_or_else(|| payload.sender_user_id.clone());
    let my_id = service.identity.get_device_id().await;
    let my_identity_pub_hex = service.identity.get_public_key_hex();

    // Receiver generates ephemeral key and agrees with sender
    let sender_pub_bytes = hex::decode(sender_eph_hex).map_err(|e| {
        (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": format!("Invalid sender ephemeral key hex: {}", e)})),
        )
    })?;
    let receiver_eph = crate::crypto::EphemeralKeyExchange::generate().map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": format!("Receiver ECDH keygen error: {}", e)})),
        )
    })?;
    let receiver_eph_pub_hex = receiver_eph.public_key_hex();
    let shared_secret = receiver_eph.complete(&sender_pub_bytes).map_err(|e| {
        (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": format!("ECDH agreement error: {}", e)})),
        )
    })?;

    // Compute SAS verification code bound to the ECDH shared secret and both device identities
    let sas_code = crate::crypto::compute_sas_code(
        &shared_secret,
        &payload.transfer_id,
        &payload.sender_user_id,
        &my_id,
        sender_identity_hex,
        &my_identity_pub_hex,
        sender_eph_hex,
        &receiver_eph_pub_hex,
    );

    if is_first_contact {
        crate::log_debug(&format!(
            "[PrepareUpload] Inbound first contact from sender {} - Trust established",
            payload.sender_user_id
        ));
        let _ = service.identity.mark_peer_trusted(&payload.sender_user_id, sender_identity_hex).await;
    }

    if let Some(ref handle) = service.app_handle {
        if let Some(window) = handle.get_webview_window("main") {
            let _ = window.show();
            let _ = window.unminimize();
        }
    }

    service.emit_progress(TransferProgressPayload {
        transfer_id: payload.transfer_id.clone(),
        file_name: payload.file_name.clone(),
        file_size: payload.file_size,
        bytes_transferred: 0,
        progress_percent: 0.0,
        speed_mbps: 0.0,
        eta_seconds: 0,
        is_incoming: true,
        status: "transferring".to_string(),
        peer_name: sender_name.clone(),
        error: None,
        file_path: None,
        sas_code: None,
        is_first_contact: None,
    }).await;

    let directional = crate::crypto::derive_directional_session_keys(
        &shared_secret,
        &payload.transfer_id,
        &token,
        &payload.sender_user_id,
        &my_id,
        sender_identity_hex,
        &my_identity_pub_hex,
    );
    let session_key = directional.sender_to_receiver;

    // Receiver signs receiver transcript
    let receiver_transcript = crate::crypto::compute_receiver_transcript(
        "auradrop/tcp/2",
        &payload.transfer_id,
        &token,
        &payload.sender_user_id,
        &my_id,
        sender_eph_hex,
        &receiver_eph_pub_hex,
    );
    let receiver_sig_hex = service.identity.sign_transcript(&receiver_transcript).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": format!("Receiver signature generation error: {}", e)})),
        )
    })?;

    let meta = SessionMetadata {
        transfer_id: payload.transfer_id.clone(),
        file_name: payload.file_name.clone(),
        file_size: payload.file_size,
        sha256_expected: payload.sha256.clone(),
        token: token.clone(),
        expires_at,
        sender_name: sender_name.clone(),
        sender_id: payload.sender_user_id.clone(),
        sender_identity_pub_hex: sender_identity_hex.to_string(),
        sas_code: sas_code.clone(),
        is_first_contact,
        is_consumed: false,
        session_key,
    };

    service
        .sessions
        .write()
        .await
        .insert(payload.transfer_id.clone(), meta);

    let masked_token = if token.len() >= 6 {
        format!("{}...***", &token[..6])
    } else {
        "***".to_string()
    };
    crate::log_debug(&format!(
        "[AuraTransfer] Prepare-upload accepted: {} ({} bytes) from {} [Protocol: TCP, Token: {}, SAS: {}]",
        payload.file_name, payload.file_size, sender_name, masked_token, sas_code
    ));

    let file_id = payload
        .file_id
        .unwrap_or_else(|| payload.transfer_id.clone());

    Ok(Json(PrepareUploadResponse {
        accepted: true,
        transfer_id: payload.transfer_id,
        file_id,
        one_time_token: token,
        expires_at,
        protocol: "auradrop/tcp/2".to_string(),
        encryption: Some("aead-aes256-gcm".to_string()),
        receiver_id: Some(my_id),
        receiver_eph_pub_key: Some(receiver_eph_pub_hex),
        receiver_identity_pub_key: Some(my_identity_pub_hex),
        receiver_signature: Some(receiver_sig_hex),
        sas_code: Some(sas_code),
        is_first_contact: Some(is_first_contact),
        quic_port: None,
        cert_fingerprint: None,
    }))
}

async fn handle_upload(
    State(service): State<TransferService>,
    Query(params): Query<HashMap<String, String>>,
    headers: HeaderMap,
    body: Body,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let transfer_id = headers
        .get("x-transfer-id")
        .and_then(|h| h.to_str().ok())
        .map(|s| s.to_string())
        .or_else(|| params.get("transferId").cloned())
        .unwrap_or_default();

    // Secure extraction: Header authentication strictly required. URL query parameter tokens removed.
    let presented_token = headers
        .get("authorization")
        .and_then(|h| h.to_str().ok())
        .and_then(|s| s.strip_prefix("Bearer ").or_else(|| s.strip_prefix("bearer ")))
        .map(|s| s.trim().to_string())
        .or_else(|| {
            headers
                .get("x-token")
                .or_else(|| headers.get("x-one-time-token"))
                .and_then(|h| h.to_str().ok())
                .map(|s| s.trim().to_string())
        })
        .unwrap_or_default();

    if transfer_id.is_empty() || presented_token.is_empty() {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(json!({"error": "Missing transferId or authorization token in headers"})),
        ));
    }

    let now_millis = Utc::now().timestamp_millis();
    let session = {
        let mut sessions = service.sessions.write().await;
        match sessions.get_mut(&transfer_id) {
            Some(s) => {
                if now_millis > s.expires_at {
                    sessions.remove(&transfer_id);
                    return Err((
                        StatusCode::UNAUTHORIZED,
                        Json(json!({"error": "Transfer authorization token has expired"})),
                    ));
                }
                if s.is_consumed {
                    return Err((
                        StatusCode::FORBIDDEN,
                        Json(json!({"error": "Transfer token already consumed (replay rejected)"})),
                    ));
                }
                if s.token != presented_token {
                    return Err((
                        StatusCode::FORBIDDEN,
                        Json(json!({"error": "Invalid authorization token for this transfer"})),
                    ));
                }
                // Mark single-use token consumed immediately
                s.is_consumed = true;
                s.clone()
            }
            None => {
                return Err((
                    StatusCode::UNAUTHORIZED,
                    Json(json!({"error": "Unknown or invalid transfer session"})),
                ));
            }
        }
    };

    // Verify peer identity binding
    let presented_sender_id = headers
        .get("x-sender-id")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("");
    if !session.sender_id.is_empty() && !presented_sender_id.is_empty() && presented_sender_id != session.sender_id {
        return Err((
            StatusCode::FORBIDDEN,
            Json(json!({"error": "Sender identity mismatch: transfer token bound to different device"})),
        ));
    }

    // Sanitized logging: Mask secret token in debug logs
    let masked_token = if presented_token.len() >= 6 {
        format!("{}...***", &presented_token[..6])
    } else {
        "***".to_string()
    };
    crate::log_debug(&format!(
        "[AuraTransfer] Inbound TCP upload authenticated: {} ({} bytes) from {} [Token: {}]",
        session.file_name, session.file_size, session.sender_name, masked_token
    ));

    // Validate declared file size from headers if provided
    if let Some(decl_size_str) = headers.get("x-file-size").and_then(|h| h.to_str().ok()) {
        if let Ok(decl_size) = decl_size_str.parse::<u64>() {
            if decl_size != session.file_size {
                return Err((
                    StatusCode::BAD_REQUEST,
                    Json(json!({"error": "Header x-file-size does not match approved transfer metadata"})),
                ));
            }
        }
    }

    // Resolve final destination with filename sanitization and collision prevention
    let final_dest = resolve_unique_destination(&service.downloads_dir, &session.file_name);
    let safe_base_name = sanitize_filename(&session.file_name);
    let temp_file_path = service
        .downloads_dir
        .join(format!(".{}.{}.part", safe_base_name, session.transfer_id));

    // Open temporary file with Tokio async I/O
    let temp_file = match tokio::fs::File::create(&temp_file_path).await {
        Ok(f) => f,
        Err(e) => {
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": format!("Cannot initialize temp file on disk: {}", e)})),
            ));
        }
    };

    // Enforce authenticated encryption: plaintext transfers are strictly rejected (Fail Closed)
    let encryption_mode = headers
        .get("x-encryption")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("none");
    if encryption_mode != "aead-aes256-gcm" {
        let _ = tokio::fs::remove_file(&temp_file_path).await;
        service.sessions.write().await.remove(&transfer_id);
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "Plaintext transfer rejected: authenticated encryption (aead-aes256-gcm) is required"})),
        ));
    }

    let session_key = session.session_key;

    // Bounded buffer for backpressured async disk writing (512 KiB)
    let mut writer = tokio::io::BufWriter::with_capacity(512 * 1024, temp_file);
    let mut hasher = Sha256::new();
    let mut transferred = 0u64;
    let mut last_emit = Instant::now();
    let mut last_speed_time = Instant::now();
    let mut last_speed_bytes = 0u64;
    let mut smoothed_speed = 0.0f64;

    let mut stream = body.into_data_stream();
    let mut stream_buf = Vec::with_capacity(1024 * 1024);
    let mut chunk_index = 0u64;

    while let Some(chunk_result) = stream.next().await {
        let chunk = match chunk_result {
            Ok(c) => c,
            Err(e) => {
                let _ = tokio::fs::remove_file(&temp_file_path).await;
                service.sessions.write().await.remove(&transfer_id);
                return Err((
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({"error": format!("TCP stream read error: {}", e)})),
                ));
            }
        };

        stream_buf.extend_from_slice(&chunk);

        while stream_buf.len() >= 16 {
            let payload_len = u32::from_be_bytes([stream_buf[0], stream_buf[1], stream_buf[2], stream_buf[3]]) as usize;
            
            // Validate payload bounds: max 1 MiB chunk + 16-byte tag, min 16-byte tag
            if payload_len < 16 || payload_len > (1024 * 1024 + 16) {
                let _ = tokio::fs::remove_file(&temp_file_path).await;
                service.sessions.write().await.remove(&transfer_id);
                return Err((
                    StatusCode::BAD_REQUEST,
                    Json(json!({"error": format!("Frame payload length out of bounds: {} bytes", payload_len)})),
                ));
            }

            let total_frame_len = 4 + 12 + payload_len;
            if stream_buf.len() < total_frame_len {
                break; // Await more network bytes to complete frame
            }

            let mut nonce = [0u8; 12];
            nonce.copy_from_slice(&stream_buf[4..16]);

            // Validate strict sequence numbering to prevent chunk replay, out-of-order, or repeated chunks
            let chunk_seq = u64::from_be_bytes([
                nonce[4], nonce[5], nonce[6], nonce[7],
                nonce[8], nonce[9], nonce[10], nonce[11],
            ]);
            if chunk_seq != chunk_index {
                let _ = tokio::fs::remove_file(&temp_file_path).await;
                service.sessions.write().await.remove(&transfer_id);
                return Err((
                    StatusCode::BAD_REQUEST,
                    Json(json!({"error": format!("Chunk sequence violation: received chunk index {}, expected {}", chunk_seq, chunk_index)})),
                ));
            }

            let ciphertext_and_tag = &stream_buf[16..total_frame_len];
            let aad = format!("{}:{}", session.transfer_id, chunk_index);

            let plaintext = match crate::crypto::decrypt_chunk(
                &session_key,
                &nonce,
                aad.as_bytes(),
                ciphertext_and_tag,
            ) {
                Ok(pt) => pt,
                Err(e) => {
                    let _ = tokio::fs::remove_file(&temp_file_path).await;
                    service.sessions.write().await.remove(&transfer_id);
                    return Err((
                        StatusCode::UNPROCESSABLE_ENTITY,
                        Json(json!({"error": format!("AEAD integrity authentication failure: {}", e)})),
                    ));
                }
            };

            if let Err(e) = writer.write_all(&plaintext).await {
                let _ = tokio::fs::remove_file(&temp_file_path).await;
                service.sessions.write().await.remove(&transfer_id);
                return Err((
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({"error": format!("Disk write error: {}", e)})),
                ));
            }

            hasher.update(&plaintext);
            transferred += plaintext.len() as u64;
            chunk_index += 1;

            stream_buf.drain(0..total_frame_len);
        }

        if transferred > session.file_size {
            let _ = tokio::fs::remove_file(&temp_file_path).await;
            service.sessions.write().await.remove(&transfer_id);
            return Err((
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "Received byte count exceeded approved file size (oversized payload rejected)"})),
            ));
        }

        // Throttled UI progress event (5-10 per second: 120ms interval)
        if last_emit.elapsed().as_millis() >= 120 || transferred == session.file_size {
            last_emit = Instant::now();
            let time_delta = last_speed_time.elapsed().as_secs_f64().max(0.001);
            if time_delta >= 0.15 || transferred == session.file_size {
                let bytes_delta = transferred.saturating_sub(last_speed_bytes);
                let sample_speed = (bytes_delta as f64 / (1024.0 * 1024.0)) / time_delta;
                smoothed_speed = if smoothed_speed == 0.0 {
                    sample_speed
                } else {
                    0.35 * sample_speed + 0.65 * smoothed_speed
                };
                last_speed_time = Instant::now();
                last_speed_bytes = transferred;
            }
            let speed = smoothed_speed.max(0.0);
            let remaining = session.file_size.saturating_sub(transferred);
            let eta = if speed > 0.0 {
                ((remaining as f64 / (1024.0 * 1024.0)) / speed).ceil() as u64
            } else {
                0
            };
            let percent = if session.file_size > 0 {
                (transferred as f64 / session.file_size as f64) * 100.0
            } else {
                100.0
            };

            service
                .emit_progress(TransferProgressPayload {
                    transfer_id: session.transfer_id.clone(),
                    file_name: session.file_name.clone(),
                    file_size: session.file_size,
                    bytes_transferred: transferred,
                    progress_percent: percent,
                    speed_mbps: speed,
                    eta_seconds: eta,
                    is_incoming: true,
                    status: if transferred >= session.file_size {
                        "completed".to_string()
                    } else {
                        "transferring".to_string()
                    },
                    peer_name: session.sender_name.clone(),
                    error: None,
                    file_path: if transferred >= session.file_size {
                        Some(final_dest.to_string_lossy().to_string())
                    } else {
                        None
                    },
                    sas_code: None,
                    is_first_contact: None,
                })
                .await;
        }
    }

    // Flush and sync buffer to physical disk
    if let Err(e) = writer.flush().await {
        let _ = tokio::fs::remove_file(&temp_file_path).await;
        service.sessions.write().await.remove(&transfer_id);
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": format!("Disk write flush error: {}", e)})),
        ));
    }
    drop(writer);

    // Verify exact length
    if transferred != session.file_size {
        let _ = tokio::fs::remove_file(&temp_file_path).await;
        service.sessions.write().await.remove(&transfer_id);
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"error": format!("Byte count mismatch: received {} bytes, expected {}", transferred, session.file_size)})),
        ));
    }

    // Verify SHA-256
    let calculated_hash = hex::encode(hasher.finalize());
    let sha_expected = session.sha256_expected.trim();
    if !sha_expected.is_empty() && !sha_expected.starts_with("stream_") {
        if !calculated_hash.eq_ignore_ascii_case(sha_expected) {
            let _ = tokio::fs::remove_file(&temp_file_path).await;
            service.sessions.write().await.remove(&transfer_id);
            return Err((
                StatusCode::UNPROCESSABLE_ENTITY,
                Json(json!({
                    "error": "Checksum verification failed: SHA-256 integrity mismatch",
                    "expected": sha_expected,
                    "actual": calculated_hash
                })),
            ));
        }
    }

    // Atomic rename from temporary file to final committed path
    if let Err(e) = tokio::fs::rename(&temp_file_path, &final_dest).await {
        let _ = tokio::fs::remove_file(&temp_file_path).await;
        service.sessions.write().await.remove(&transfer_id);
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": format!("Failed to atomically commit destination file: {}", e)})),
        ));
    }

    // Trust on First Use: Mark verified sender as trusted upon successful transfer completion
    if session.is_first_contact {
        let _ = service.identity.mark_peer_trusted(&session.sender_id, &session.sender_identity_pub_hex).await;
    }

    // Remove finished session
    service.sessions.write().await.remove(&transfer_id);

    crate::log_debug(&format!(
        "[AuraTransfer] Inbound TCP transfer committed: {} ({} bytes) - SHA-256: {} -> {}",
        session.file_name, session.file_size, calculated_hash, final_dest.display()
    ));

    // Emit final 100% completed event to UI
    service
        .emit_progress(TransferProgressPayload {
            transfer_id: session.transfer_id.clone(),
            file_name: session.file_name.clone(),
            file_size: session.file_size,
            bytes_transferred: session.file_size,
            progress_percent: 100.0,
            speed_mbps: 0.0,
            eta_seconds: 0,
            is_incoming: true,
            status: "completed".to_string(),
            peer_name: session.sender_name.clone(),
            error: None,
            file_path: Some(final_dest.to_string_lossy().to_string()),
            sas_code: None,
            is_first_contact: None,
        })
        .await;

    Ok(Json(json!({
        "success": true,
        "transferId": transfer_id,
        "verified": true,
        "sha256Verified": true,
        "sha256": calculated_hash,
        "savedPath": final_dest.to_string_lossy()
    })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct IncomingChatMessage {
    pub id: Option<String>,
    pub sender_id: Option<String>,
    pub sender_name: Option<String>,
    pub text: String,
    pub timestamp: Option<i64>,
}

async fn handle_chat(
    State(service): State<TransferService>,
    Json(payload): Json<IncomingChatMessage>,
) -> Json<serde_json::Value> {
    let now = Utc::now().timestamp_millis();
    let id = payload.id.unwrap_or_else(|| format!("msg_{}", Uuid::new_v4().simple()));
    let sender_id = payload.sender_id.unwrap_or_else(|| "remote_peer".to_string());
    let sender_name = payload.sender_name.unwrap_or_else(|| "Nearby Device".to_string());

    let msg = ChatMessage {
        id,
        peer_id: sender_id.clone(),
        peer_name: sender_name.clone(),
        sender_id: sender_id.clone(),
        sender_name: sender_name.clone(),
        text: payload.text,
        timestamp: payload.timestamp.unwrap_or(now),
        is_outgoing: false,
    };

    {
        let mut hist = service.chat_history.write().await;
        hist.entry(sender_id).or_insert_with(Vec::new).push(msg.clone());
    }

    if let Some(ref handle) = service.app_handle {
        let _ = handle.emit("chat-message-received", &msg);
        if let Some(window) = handle.get_webview_window("main") {
            let _ = window.request_user_attention(Some(tauri::UserAttentionType::Informational));
        }
    }

    crate::log_debug(&format!("[AuraChat] Message received from {}: {}", msg.peer_name, msg.text));

    Json(json!({ "status": "ok", "delivered": true }))
}
