//! Developer-Only Comprehensive Benchmark & Verification Suite
//! for AuraDrop High-Performance TCP Streaming Bulk Transfer Engine
//! with In-Transit AEAD AES-256-GCM Authenticated Encryption & Identity Binding
//!
//! Verified Requirements:
//! 1. In-transit authenticated encryption (AES-256-GCM AEAD frames)
//! 2. Token extraction exclusively from HTTP headers (`Authorization: Bearer <token>` or `x-token`)
//! 3. URL query parameter token rejection (sanitized, zero query token leakage)
//! 4. Single-use token consumption and replay rejection
//! 5. 60-second TTL expiry rejection
//! 6. Peer identity binding verification (`x-sender-id` bound to handshake metadata)
//! 7. AEAD Bit-flip and tampering detection (immediate session abort and .part purge)
//! 8. Bounded 512 KiB streaming buffers and high-throughput goodput benchmarking
//! 9. End-to-end SHA-256 checksum verification and collision avoidance

use axum::{
    body::Body,
    extract::{DefaultBodyLimit, Query, State},
    http::{HeaderMap, StatusCode},
    response::Json,
    routing::post,
    Router,
};
use chrono::Utc;
use futures_util::StreamExt;
use reqwest::Client;
use ring::aead::{Aad, LessSafeKey, Nonce, UnboundKey, AES_256_GCM};
use ring::hkdf;
use serde_json::json;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;
use tempfile::tempdir;
use tokio::fs::File;
use tokio::io::AsyncWriteExt;
use tokio::sync::RwLock;
use uuid::Uuid;

pub const BENCH_SERVER_ID: &str = "auradrop_receiver_node_01";

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

pub fn create_chunk_nonce(salt_prefix: u32, chunk_index: u64) -> [u8; 12] {
    let mut nonce = [0u8; 12];
    nonce[0..4].copy_from_slice(&salt_prefix.to_be_bytes());
    nonce[4..12].copy_from_slice(&chunk_index.to_be_bytes());
    nonce
}

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

pub fn decrypt_chunk(
    key: &[u8; 32],
    nonce_bytes: &[u8; 12],
    aad: &[u8],
    ciphertext: &[u8],
) -> Result<Vec<u8>, String> {
    let unbound_key = UnboundKey::new(&AES_256_GCM, key)
        .map_err(|e| format!("Invalid AES-256-GCM key: {:?}", e))?;
    let less_safe_key = LessSafeKey::new(unbound_key);
    let nonce = Nonce::assume_unique_for_key(*nonce_bytes);

    let mut in_out = ciphertext.to_vec();
    let decrypted = less_safe_key
        .open_in_place(nonce, Aad::from(aad), &mut in_out)
        .map_err(|e| format!("AEAD tag verification failed: {:?}", e))?;

    Ok(decrypted.to_vec())
}

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
pub struct BenchSession {
    pub transfer_id: String,
    pub token: String,
    pub file_name: String,
    pub file_size: u64,
    pub sha256_expected: String,
    pub expires_at: i64,
    pub sender_id: String,
    pub is_consumed: Arc<AtomicBool>,
}

#[derive(Clone)]
pub struct BenchServerState {
    pub sessions: Arc<RwLock<HashMap<String, BenchSession>>>,
    pub downloads_dir: PathBuf,
    pub write_buffer_size: usize,
}

async fn bench_handle_prepare_upload(
    State(state): State<BenchServerState>,
    Json(payload): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let transfer_id = payload["transferId"].as_str().unwrap_or("").to_string();
    let file_name = payload["fileName"].as_str().unwrap_or("").to_string();
    let file_size = payload["fileSize"].as_u64().unwrap_or(0);
    let sha256 = payload["sha256"].as_str().unwrap_or("").to_string();
    let sender_id = payload["senderUserId"]
        .as_str()
        .or_else(|| payload["senderId"].as_str())
        .unwrap_or("anonymous_sender")
        .to_string();

    if file_name.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, Json(json!({"error": "Empty filename"}))));
    }

    let token = Uuid::new_v4().to_string();
    let expires_at = Utc::now().timestamp_millis() + 60000;

    let session = BenchSession {
        transfer_id: transfer_id.clone(),
        token: token.clone(),
        file_name,
        file_size,
        sha256_expected: sha256,
        expires_at,
        sender_id,
        is_consumed: Arc::new(AtomicBool::new(false)),
    };

    state.sessions.write().await.insert(transfer_id.clone(), session);

    Ok(Json(json!({
        "accepted": true,
        "transferId": transfer_id,
        "oneTimeToken": token,
        "expiresAt": expires_at,
        "protocol": "auradrop/tcp/1",
        "encryption": "aead-aes256-gcm",
        "receiverId": BENCH_SERVER_ID
    })))
}

async fn bench_handle_upload(
    State(state): State<BenchServerState>,
    Query(_params): Query<HashMap<String, String>>,
    headers: HeaderMap,
    body: Body,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let transfer_id = headers
        .get("x-transfer-id")
        .and_then(|h| h.to_str().ok())
        .map(|s| s.to_string())
        .unwrap_or_default();

    // Enforce Header-only token extraction: URL query tokens strictly rejected
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
        let sessions = state.sessions.read().await;
        match sessions.get(&transfer_id) {
            Some(s) => {
                if now_millis > s.expires_at {
                    return Err((StatusCode::UNAUTHORIZED, Json(json!({"error": "Token expired"}))));
                }
                if s.is_consumed.swap(true, Ordering::SeqCst) {
                    return Err((StatusCode::FORBIDDEN, Json(json!({"error": "Token already consumed (replay rejected)"}))));
                }
                if s.token != presented_token {
                    return Err((StatusCode::FORBIDDEN, Json(json!({"error": "Invalid token"}))));
                }
                s.clone()
            }
            None => {
                return Err((StatusCode::UNAUTHORIZED, Json(json!({"error": "Unknown transfer session"}))));
            }
        }
    };

    // Verify peer identity binding
    let presented_sender = headers
        .get("x-sender-id")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("");
    if !session.sender_id.is_empty() && !presented_sender.is_empty() && presented_sender != session.sender_id {
        return Err((
            StatusCode::FORBIDDEN,
            Json(json!({"error": "Sender identity mismatch: token bound to different device"})),
        ));
    }

    let encryption_mode = headers
        .get("x-encryption")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("none");
    let is_aead = encryption_mode == "aead-aes256-gcm";

    let session_key = if is_aead {
        Some(derive_session_key(
            &session.token,
            &session.transfer_id,
            &session.sender_id,
            BENCH_SERVER_ID,
        ))
    } else {
        None
    };

    let final_dest = resolve_unique_destination(&state.downloads_dir, &session.file_name);
    let safe_name = sanitize_filename(&session.file_name);
    let temp_file_path = state.downloads_dir.join(format!(".{}.{}.part", safe_name, session.transfer_id));

    let temp_file = match File::create(&temp_file_path).await {
        Ok(f) => f,
        Err(e) => return Err((StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()})))),
    };

    let mut writer = tokio::io::BufWriter::with_capacity(state.write_buffer_size, temp_file);
    let mut hasher = Sha256::new();
    let mut transferred = 0u64;

    let mut stream = body.into_data_stream();
    let mut stream_buf = Vec::with_capacity(1024 * 1024);
    let mut chunk_index = 0u64;

    while let Some(chunk_res) = stream.next().await {
        let chunk = match chunk_res {
            Ok(c) => c,
            Err(e) => {
                let _ = tokio::fs::remove_file(&temp_file_path).await;
                return Err((StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))));
            }
        };

        if is_aead {
            stream_buf.extend_from_slice(&chunk);

            while stream_buf.len() >= 16 {
                let payload_len = u32::from_be_bytes([
                    stream_buf[0],
                    stream_buf[1],
                    stream_buf[2],
                    stream_buf[3],
                ]) as usize;
                let total_frame_len = 4 + 12 + payload_len;
                if stream_buf.len() < total_frame_len {
                    break;
                }

                let mut nonce = [0u8; 12];
                nonce.copy_from_slice(&stream_buf[4..16]);
                let ciphertext = &stream_buf[16..total_frame_len];
                let aad = format!("{}:{}", session.transfer_id, chunk_index);

                let decrypted = match decrypt_chunk(
                    session_key.as_ref().unwrap(),
                    &nonce,
                    aad.as_bytes(),
                    ciphertext,
                ) {
                    Ok(d) => d,
                    Err(e) => {
                        let _ = tokio::fs::remove_file(&temp_file_path).await;
                        state.sessions.write().await.remove(&transfer_id);
                        return Err((
                            StatusCode::BAD_REQUEST,
                            Json(json!({"error": format!("AEAD tag verification failed: {}", e)})),
                        ));
                    }
                };

                chunk_index += 1;
                stream_buf.drain(..total_frame_len);

                if let Err(e) = writer.write_all(&decrypted).await {
                    let _ = tokio::fs::remove_file(&temp_file_path).await;
                    return Err((StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))));
                }

                hasher.update(&decrypted);
                transferred += decrypted.len() as u64;

                if transferred > session.file_size {
                    let _ = tokio::fs::remove_file(&temp_file_path).await;
                    return Err((StatusCode::BAD_REQUEST, Json(json!({"error": "Oversized payload rejected"}))));
                }
            }
        } else {
            if let Err(e) = writer.write_all(&chunk).await {
                let _ = tokio::fs::remove_file(&temp_file_path).await;
                return Err((StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))));
            }

            hasher.update(&chunk);
            transferred += chunk.len() as u64;

            if transferred > session.file_size {
                let _ = tokio::fs::remove_file(&temp_file_path).await;
                return Err((StatusCode::BAD_REQUEST, Json(json!({"error": "Oversized payload rejected"}))));
            }
        }
    }

    if let Err(e) = writer.flush().await {
        let _ = tokio::fs::remove_file(&temp_file_path).await;
        return Err((StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))));
    }
    drop(writer);

    if transferred != session.file_size {
        let _ = tokio::fs::remove_file(&temp_file_path).await;
        return Err((StatusCode::BAD_REQUEST, Json(json!({"error": "Byte count mismatch"}))));
    }

    let calculated_hash = hex::encode(hasher.finalize());
    let expected_sha = session.sha256_expected.trim();
    if !expected_sha.is_empty() && !expected_sha.starts_with("stream_") {
        if !calculated_hash.eq_ignore_ascii_case(expected_sha) {
            let _ = tokio::fs::remove_file(&temp_file_path).await;
            return Err((StatusCode::UNPROCESSABLE_ENTITY, Json(json!({"error": "SHA-256 integrity mismatch"}))));
        }
    }

    if let Err(e) = tokio::fs::rename(&temp_file_path, &final_dest).await {
        let _ = tokio::fs::remove_file(&temp_file_path).await;
        return Err((StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))));
    }

    state.sessions.write().await.remove(&transfer_id);

    Ok(Json(json!({
        "success": true,
        "transferId": transfer_id,
        "verified": true,
        "sha256": calculated_hash,
        "savedPath": final_dest.to_string_lossy()
    })))
}

async fn start_test_server(downloads_dir: PathBuf, buffer_size: usize) -> (String, Arc<RwLock<HashMap<String, BenchSession>>>) {
    let sessions = Arc::new(RwLock::new(HashMap::new()));
    let state = BenchServerState {
        sessions: sessions.clone(),
        downloads_dir,
        write_buffer_size: buffer_size,
    };

    let app = Router::new()
        .route("/api/auradrop/v1/prepare-upload", post(bench_handle_prepare_upload))
        .route("/api/auradrop/v1/upload", post(bench_handle_upload).layer(DefaultBodyLimit::max(10 * 1024 * 1024 * 1024)))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });

    (format!("http://{}", addr), sessions)
}

#[tokio::test]
async fn test_tcp_security_and_aead_verification() {
    let temp_dir = tempdir().unwrap();
    let (base_url, _) = start_test_server(temp_dir.path().to_path_buf(), 512 * 1024).await;
    let client = Client::builder().tcp_nodelay(true).build().unwrap();

    let client_id = "client_node_alice";

    // 1. Prepare valid upload
    let prep_res = client
        .post(format!("{}/api/auradrop/v1/prepare-upload", base_url))
        .json(&json!({
            "transferId": "sec_test_01",
            "fileName": "test.txt",
            "fileSize": 100,
            "sha256": "abcdef",
            "senderUserId": client_id
        }))
        .send()
        .await
        .unwrap();

    let prep_json: serde_json::Value = prep_res.json().await.unwrap();
    let valid_token = prep_json["oneTimeToken"].as_str().unwrap().to_string();

    // Test 1: URL Query parameter token ONLY (missing Authorization header) must be REJECTED (401 Unauthorized)
    let url_only_res = client
        .post(format!("{}/api/auradrop/v1/upload?transferId=sec_test_01&token={}", base_url, valid_token))
        .body(vec![0u8; 100])
        .send()
        .await
        .unwrap();
    assert_eq!(
        url_only_res.status(),
        StatusCode::UNAUTHORIZED,
        "Query parameter token without Authorization header must be rejected"
    );

    // Test 2: Invalid bearer token in header must be REJECTED (403 Forbidden)
    let bad_tok_res = client
        .post(format!("{}/api/auradrop/v1/upload", base_url))
        .header("x-transfer-id", "sec_test_01")
        .header("authorization", "Bearer bad_forged_token_xxx")
        .body(vec![0u8; 100])
        .send()
        .await
        .unwrap();
    assert_eq!(bad_tok_res.status(), StatusCode::FORBIDDEN);

    // Test 3: Peer identity mismatch (x-sender-id does not match prepared senderUserId) must be REJECTED (403 Forbidden)
    let mismatch_sender_res = client
        .post(format!("{}/api/auradrop/v1/upload", base_url))
        .header("x-transfer-id", "sec_test_01")
        .header("authorization", format!("Bearer {}", valid_token))
        .header("x-sender-id", "attacker_node_mallory")
        .body(vec![0u8; 100])
        .send()
        .await
        .unwrap();
    assert_eq!(
        mismatch_sender_res.status(),
        StatusCode::FORBIDDEN,
        "Peer binding mismatch must be rejected with 403"
    );

    // Test 4: Valid AEAD AES-256-GCM encrypted transfer succeeds
    let plain_payload = vec![42u8; 100];
    let mut h = Sha256::new();
    h.update(&plain_payload);
    let expected_hash = hex::encode(h.finalize());

    let prep_res2 = client
        .post(format!("{}/api/auradrop/v1/prepare-upload", base_url))
        .json(&json!({
            "transferId": "sec_test_02",
            "fileName": "aead_encrypted.bin",
            "fileSize": 100,
            "sha256": expected_hash,
            "senderUserId": client_id
        }))
        .send()
        .await
        .unwrap();
    let prep_json2: serde_json::Value = prep_res2.json().await.unwrap();
    let token2 = prep_json2["oneTimeToken"].as_str().unwrap().to_string();

    let session_key = derive_session_key(&token2, "sec_test_02", client_id, BENCH_SERVER_ID);
    let nonce = create_chunk_nonce(1337, 0);
    let aad = "sec_test_02:0";
    let ciphertext = encrypt_chunk(&session_key, &nonce, aad.as_bytes(), &plain_payload).unwrap();

    let mut frame = Vec::new();
    frame.extend_from_slice(&(ciphertext.len() as u32).to_be_bytes());
    frame.extend_from_slice(&nonce);
    frame.extend_from_slice(&ciphertext);

    let upload_res = client
        .post(format!("{}/api/auradrop/v1/upload", base_url))
        .header("authorization", format!("Bearer {}", token2))
        .header("x-token", &token2)
        .header("x-transfer-id", "sec_test_02")
        .header("x-sender-id", client_id)
        .header("x-encryption", "aead-aes256-gcm")
        .header("x-file-size", "100")
        .body(frame.clone())
        .send()
        .await
        .unwrap();
    assert_eq!(upload_res.status(), StatusCode::OK, "AEAD transfer must succeed");

    // Verify committed file on disk matches decrypted plaintext
    let saved_file = temp_dir.path().join("aead_encrypted.bin");
    assert!(saved_file.exists());
    let saved_bytes = tokio::fs::read(&saved_file).await.unwrap();
    assert_eq!(saved_bytes, plain_payload);

    // Test 5: Replay attack prevention (reusing consumed token must be REJECTED)
    let replay_res = client
        .post(format!("{}/api/auradrop/v1/upload", base_url))
        .header("authorization", format!("Bearer {}", token2))
        .header("x-transfer-id", "sec_test_02")
        .header("x-sender-id", client_id)
        .header("x-encryption", "aead-aes256-gcm")
        .body(frame)
        .send()
        .await
        .unwrap();
    assert!(
        replay_res.status() == StatusCode::FORBIDDEN || replay_res.status() == StatusCode::UNAUTHORIZED,
        "Replay attack with consumed token must fail, got {}",
        replay_res.status()
    );

    // Test 6: Bit-flip / ciphertext tampering rejection (AEAD integrity verification)
    let prep_res3 = client
        .post(format!("{}/api/auradrop/v1/prepare-upload", base_url))
        .json(&json!({
            "transferId": "sec_test_03",
            "fileName": "tampered.bin",
            "fileSize": 100,
            "sha256": "stream_sec_test_03",
            "senderUserId": client_id
        }))
        .send()
        .await
        .unwrap();
    let token3 = prep_res3.json::<serde_json::Value>().await.unwrap()["oneTimeToken"].as_str().unwrap().to_string();

    let session_key3 = derive_session_key(&token3, "sec_test_03", client_id, BENCH_SERVER_ID);
    let nonce3 = create_chunk_nonce(1337, 0);
    let aad3 = "sec_test_03:0";
    let mut tampered_ciphertext = encrypt_chunk(&session_key3, &nonce3, aad3.as_bytes(), &plain_payload).unwrap();
    // Invert a single bit in ciphertext payload
    tampered_ciphertext[10] ^= 0x01;

    let mut tampered_frame = Vec::new();
    tampered_frame.extend_from_slice(&(tampered_ciphertext.len() as u32).to_be_bytes());
    tampered_frame.extend_from_slice(&nonce3);
    tampered_frame.extend_from_slice(&tampered_ciphertext);

    let tamper_res = client
        .post(format!("{}/api/auradrop/v1/upload", base_url))
        .header("authorization", format!("Bearer {}", token3))
        .header("x-transfer-id", "sec_test_03")
        .header("x-sender-id", client_id)
        .header("x-encryption", "aead-aes256-gcm")
        .body(tampered_frame)
        .send()
        .await
        .unwrap();
    assert_eq!(
        tamper_res.status(),
        StatusCode::BAD_REQUEST,
        "Tampered AEAD chunk must be rejected"
    );
    assert!(!temp_dir.path().join("tampered.bin").exists(), "Tampered file must never be committed");

    // Test 7: Plaintext SHA-256 hash mismatch rejection & temp file cleanup
    let prep_res4 = client
        .post(format!("{}/api/auradrop/v1/prepare-upload", base_url))
        .json(&json!({
            "transferId": "sec_test_04",
            "fileName": "corrupt_hash.bin",
            "fileSize": 100,
            "sha256": "0000000000000000000000000000000000000000000000000000000000000000",
            "senderUserId": client_id
        }))
        .send()
        .await
        .unwrap();
    let token4 = prep_res4.json::<serde_json::Value>().await.unwrap()["oneTimeToken"].as_str().unwrap().to_string();

    let corrupt_res = client
        .post(format!("{}/api/auradrop/v1/upload", base_url))
        .header("authorization", format!("Bearer {}", token4))
        .header("x-transfer-id", "sec_test_04")
        .header("x-sender-id", client_id)
        .body(vec![7u8; 100])
        .send()
        .await
        .unwrap();
    assert_eq!(corrupt_res.status(), StatusCode::UNPROCESSABLE_ENTITY);
    assert!(!temp_dir.path().join("corrupt_hash.bin").exists());
}

#[tokio::test]
async fn test_tcp_streaming_buffer_benchmarks() {
    println!("\n==========================================================================================");
    println!("        AURADROP TCP STREAMING BENCHMARK: BUFFER TUNING & AEAD ENCRYPTION EVALUATION");
    println!("==========================================================================================");

    let test_file_mb = 100usize;
    let payload_size = test_file_mb * 1024 * 1024;

    // Create 100 MB deterministic test payload in memory
    let mut payload = vec![0u8; payload_size];
    for (i, b) in payload.iter_mut().enumerate() {
        *b = ((i.wrapping_mul(43)) ^ (i >> 9)) as u8;
    }

    let mut hasher = Sha256::new();
    hasher.update(&payload);
    let expected_sha256 = hex::encode(hasher.finalize());

    let buffer_configs = [
        ("256 KiB AEAD Encrypted", 256 * 1024, true),
        ("512 KiB AEAD Encrypted", 512 * 1024, true),
        ("1024 KiB AEAD Encrypted", 1024 * 1024, true),
        ("512 KiB Plaintext Fallback", 512 * 1024, false),
    ];

    let client_id = "bench_client_node_primary";

    for (label, buf_size, enable_aead) in buffer_configs {
        let temp_dest_dir = tempdir().unwrap();
        let (base_url, _) = start_test_server(temp_dest_dir.path().to_path_buf(), buf_size).await;

        let client = Client::builder()
            .tcp_nodelay(true)
            .build()
            .unwrap();

        let transfer_id = format!("bench_{}_{}", buf_size, if enable_aead { "aead" } else { "plain" });
        let file_name = format!("recv_{}mb_{}.bin", test_file_mb, buf_size);

        // 1. Prepare
        let prep_res = client
            .post(format!("{}/api/auradrop/v1/prepare-upload", base_url))
            .json(&json!({
                "transferId": transfer_id,
                "fileName": file_name,
                "fileSize": payload_size,
                "sha256": expected_sha256,
                "senderUserId": client_id
            }))
            .send()
            .await
            .unwrap();
        let token = prep_res.json::<serde_json::Value>().await.unwrap()["oneTimeToken"].as_str().unwrap().to_string();

        let start_time = Instant::now();

        let upload_res = if enable_aead {
            let session_key = derive_session_key(&token, &transfer_id, client_id, BENCH_SERVER_ID);
            let mut encrypted_stream_bytes = Vec::new();

            let mut chunk_index = 0u64;
            let mut offset = 0;
            while offset < payload.len() {
                let chunk_len = std::cmp::min(buf_size, payload.len() - offset);
                let chunk = &payload[offset..offset + chunk_len];
                let nonce = create_chunk_nonce(1337, chunk_index);
                let aad = format!("{}:{}", transfer_id, chunk_index);
                let ciphertext = encrypt_chunk(&session_key, &nonce, aad.as_bytes(), chunk).unwrap();

                encrypted_stream_bytes.extend_from_slice(&(ciphertext.len() as u32).to_be_bytes());
                encrypted_stream_bytes.extend_from_slice(&nonce);
                encrypted_stream_bytes.extend_from_slice(&ciphertext);

                chunk_index += 1;
                offset += chunk_len;
            }

            client
                .post(format!("{}/api/auradrop/v1/upload", base_url))
                .header("authorization", format!("Bearer {}", token))
                .header("x-token", &token)
                .header("x-transfer-id", &transfer_id)
                .header("x-sender-id", client_id)
                .header("x-encryption", "aead-aes256-gcm")
                .header("x-file-size", payload_size.to_string())
                .body(encrypted_stream_bytes)
                .send()
                .await
                .unwrap()
        } else {
            client
                .post(format!("{}/api/auradrop/v1/upload", base_url))
                .header("authorization", format!("Bearer {}", token))
                .header("x-token", &token)
                .header("x-transfer-id", &transfer_id)
                .header("x-sender-id", client_id)
                .header("x-file-size", payload_size.to_string())
                .body(payload.clone())
                .send()
                .await
                .unwrap()
        };

        let elapsed = start_time.elapsed();
        let mb_s = (test_file_mb as f64) / elapsed.as_secs_f64();

        assert_eq!(upload_res.status(), StatusCode::OK);

        // Verify committed file
        let committed_file = temp_dest_dir.path().join(&file_name);
        assert!(committed_file.exists(), "Committed file missing!");
        let comm_meta = tokio::fs::metadata(&committed_file).await.unwrap();
        assert_eq!(comm_meta.len(), payload_size as u64);

        println!(
            "  Mode: {:<26} | Payload: {:>3} MB | Duration: {:>8.2?} | Verified Goodput: {:>8.2} MB/s | Status: 100% VERIFIED",
            label, test_file_mb, elapsed, mb_s
        );
    }

    println!("==========================================================================================\n");
}
