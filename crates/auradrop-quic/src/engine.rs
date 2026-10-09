//! Robust QUIC Client & Server Transfer Engine using Quinn, Tokio, and Rustls

use crate::framing::*;
use crate::tls::{build_client_config, generate_self_signed_cert};
use quinn::{Connection, Endpoint, RecvStream, SendStream};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::fs::File;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::RwLock;

pub const DEFAULT_CHUNK_SIZE: usize = 512 * 1024; // 512 KiB bounded streaming buffer

pub type ProgressCallback = Arc<dyn Fn(u64, u64, f64) -> bool + Send + Sync>;
pub type CompletionCallback = Arc<dyn Fn(&str, &Path) + Send + Sync>;

#[derive(Clone)]
pub struct ApprovedTransfer {
    pub transfer_id: String,
    pub token: String,
    pub file_name: String,
    pub file_size: u64,
    pub expected_sha256: String,
    pub destination_path: PathBuf,
    pub expires_at: Instant,
    pub on_progress: Option<ProgressCallback>,
    pub on_complete: Option<CompletionCallback>,
}

impl Default for ApprovedTransfer {
    fn default() -> Self {
        Self {
            transfer_id: String::new(),
            token: String::new(),
            file_name: String::new(),
            file_size: 0,
            expected_sha256: String::new(),
            destination_path: PathBuf::new(),
            expires_at: Instant::now(),
            on_progress: None,
            on_complete: None,
        }
    }
}

impl ApprovedTransfer {
    pub fn simple(
        transfer_id: String,
        token: String,
        file_name: String,
        file_size: u64,
        expected_sha256: String,
        destination_path: PathBuf,
        expires_at: Instant,
    ) -> Self {
        Self {
            transfer_id,
            token,
            file_name,
            file_size,
            expected_sha256,
            destination_path,
            expires_at,
            on_progress: None,
            on_complete: None,
        }
    }
}

#[derive(Clone)]
pub struct QuicEngine {
    endpoint: Endpoint,
    cert_fingerprint: String,
    approved_transfers: Arc<RwLock<HashMap<String, ApprovedTransfer>>>,
    active_cancellations: Arc<RwLock<HashMap<String, Arc<AtomicBool>>>>,
    is_running: Arc<AtomicBool>,
}

impl QuicEngine {
    /// Starts a new QUIC server endpoint bound to the specified UDP address (e.g. "0.0.0.0:53318" or "0.0.0.0:0").
    pub async fn start(
        bind_addr: SocketAddr,
        device_id: &str,
    ) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let (server_config, cert_fingerprint, _) = generate_self_signed_cert(device_id)?;

        let mut endpoint = Endpoint::server(server_config, bind_addr)?;
        // Default client config for outgoing transfers
        let default_client_config = build_client_config(&cert_fingerprint)?;
        endpoint.set_default_client_config(default_client_config);

        let engine = Self {
            endpoint,
            cert_fingerprint,
            approved_transfers: Arc::new(RwLock::new(HashMap::new())),
            active_cancellations: Arc::new(RwLock::new(HashMap::new())),
            is_running: Arc::new(AtomicBool::new(true)),
        };

        // Start background receiver listener
        let engine_clone = engine.clone();
        tokio::spawn(async move {
            engine_clone.server_loop().await;
        });

        Ok(engine)
    }

    pub fn local_addr(&self) -> Result<SocketAddr, std::io::Error> {
        self.endpoint.local_addr()
    }

    pub fn cert_fingerprint(&self) -> &str {
        &self.cert_fingerprint
    }

    /// Registers an approved transfer token from the control plane.
    pub async fn approve_transfer(&self, approved: ApprovedTransfer) {
        let mut map = self.approved_transfers.write().await;
        map.insert(approved.transfer_id.clone(), approved);
    }

    /// Cancels an active transfer by transfer ID.
    pub async fn cancel_transfer(&self, transfer_id: &str) {
        let cancellations = self.active_cancellations.read().await;
        if let Some(flag) = cancellations.get(transfer_id) {
            flag.store(true, Ordering::SeqCst);
        }
        let mut approved = self.approved_transfers.write().await;
        approved.remove(transfer_id);
    }

    /// Prunes expired approvals (older than 60s).
    pub async fn prune_expired(&self) {
        let now = Instant::now();
        let mut map = self.approved_transfers.write().await;
        map.retain(|_, v| v.expires_at > now);
    }

    /// Graceful shutdown of the QUIC engine.
    pub async fn shutdown(&self) {
        self.is_running.store(false, Ordering::SeqCst);
        self.endpoint.close(0u32.into(), b"shutdown");
    }

    /// Background loop accepting incoming QUIC connections.
    async fn server_loop(&self) {
        while self.is_running.load(Ordering::SeqCst) {
            match self.endpoint.accept().await {
                Some(incoming) => {
                    let engine = self.clone();
                    tokio::spawn(async move {
                        if let Ok(conn) = incoming.await {
                            engine.handle_incoming_connection(conn).await;
                        }
                    });
                }
                None => break,
            }
        }
    }

    /// Handles an incoming QUIC connection and its bidirectional file stream.
    async fn handle_incoming_connection(&self, conn: Connection) {
        while let Ok((mut send_stream, mut recv_stream)) = conn.accept_bi().await {
            let engine = self.clone();
            tokio::spawn(async move {
                if let Err(e) = engine.process_inbound_stream(&mut send_stream, &mut recv_stream).await {
                    tracing::warn!("[QuicEngine] Inbound transfer error: {}", e);
                }
            });
        }
    }

    /// Processes an inbound file stream with header validation, streaming hash verification, and safe commit.
    async fn process_inbound_stream(
        &self,
        send_stream: &mut SendStream,
        recv_stream: &mut RecvStream,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        // Step 1: Read framing header prefix (12 bytes)
        let mut prefix_buf = [0u8; 12];
        recv_stream.read_exact(&mut prefix_buf).await?;

        if &prefix_buf[0..4] != MAGIC_BYTES {
            send_stream.write_all(&STATUS_AUTH_FAILED.to_be_bytes()).await?;
            return Err("Invalid magic bytes".into());
        }

        let version = u32::from_be_bytes(prefix_buf[4..8].try_into().unwrap());
        if version != PROTOCOL_VERSION_1 {
            send_stream.write_all(&STATUS_AUTH_FAILED.to_be_bytes()).await?;
            return Err(format!("Unsupported protocol version: {}", version).into());
        }

        let header_len = u32::from_be_bytes(prefix_buf[8..12].try_into().unwrap()) as usize;
        if header_len > MAX_HEADER_SIZE {
            send_stream.write_all(&STATUS_AUTH_FAILED.to_be_bytes()).await?;
            return Err("Header length exceeded limit".into());
        }

        // Step 2: Read header JSON
        let mut json_buf = vec![0u8; header_len];
        recv_stream.read_exact(&mut json_buf).await?;

        let header: TransferHeader = serde_json::from_slice(&json_buf)?;
        header.validate().map_err(|e| format!("Header validation failed: {}", e))?;

        // Step 3: Validate token against approved transfers
        let approval = {
            let mut map = self.approved_transfers.write().await;
            match map.remove(&header.transfer_id) {
                Some(appr) => {
                    if appr.token != header.one_time_token {
                        let _ = send_stream.write_all(&STATUS_AUTH_FAILED.to_be_bytes()).await;
                        let _ = send_stream.finish();
                        return Err("Token mismatch".into());
                    }
                    if Instant::now() > appr.expires_at {
                        let _ = send_stream.write_all(&STATUS_AUTH_FAILED.to_be_bytes()).await;
                        let _ = send_stream.finish();
                        return Err("Approval token expired".into());
                    }
                    if appr.file_size != header.file_size {
                        let _ = send_stream.write_all(&STATUS_SIZE_MISMATCH.to_be_bytes()).await;
                        let _ = send_stream.finish();
                        return Err("Declared file size mismatch".into());
                    }
                    appr
                }
                None => {
                    let _ = send_stream.write_all(&STATUS_AUTH_FAILED.to_be_bytes()).await;
                    let _ = send_stream.finish();
                    return Err("Transfer ID not approved or already consumed".into());
                }
            }
        };

        // Register cancellation tracker
        let cancel_flag = Arc::new(AtomicBool::new(false));
        {
            let mut cancellations = self.active_cancellations.write().await;
            cancellations.insert(header.transfer_id.clone(), cancel_flag.clone());
        }

        // Step 4: Stream payload bytes into a temporary file
        let dest_path = approval.destination_path.clone();
        let parent_dir = dest_path.parent().unwrap_or_else(|| Path::new("."));
        let temp_filename = format!(
            ".{}.auradrop.tmp.{}",
            sanitize_filename(&header.file_name),
            uuid::Uuid::new_v4().simple()
        );
        let temp_path = parent_dir.join(&temp_filename);

        let mut temp_file = match File::create(&temp_path).await {
            Ok(f) => f,
            Err(e) => {
                send_stream.write_all(&STATUS_IO_ERROR.to_be_bytes()).await?;
                return Err(format!("Failed to create temporary file: {}", e).into());
            }
        };

        let mut hasher = Sha256::new();
        let mut total_received = 0u64;
        let mut buffer = vec![0u8; DEFAULT_CHUNK_SIZE];
        let start_time = Instant::now();
        let mut last_progress = Instant::now();

        while total_received < header.file_size {
            if cancel_flag.load(Ordering::SeqCst) {
                let _ = tokio::fs::remove_file(&temp_path).await;
                send_stream.write_all(&STATUS_CANCELLED.to_be_bytes()).await?;
                return Err("Transfer cancelled by recipient".into());
            }

            let to_read = std::cmp::min(buffer.len() as u64, header.file_size - total_received) as usize;
            match recv_stream.read(&mut buffer[..to_read]).await {
                Ok(Some(n)) if n > 0 => {
                    temp_file.write_all(&buffer[..n]).await?;
                    hasher.update(&buffer[..n]);
                    total_received += n as u64;

                    if last_progress.elapsed().as_millis() >= 150 || total_received == header.file_size {
                        last_progress = Instant::now();
                        let elapsed = start_time.elapsed().as_secs_f64().max(0.001);
                        let speed_mbps = (total_received as f64 / (1024.0 * 1024.0)) / elapsed;
                        if let Some(ref cb) = approval.on_progress {
                            if !cb(total_received, header.file_size, speed_mbps) {
                                cancel_flag.store(true, Ordering::SeqCst);
                            }
                        }
                    }
                }
                Ok(_) => break, // EOF reached
                Err(e) => {
                    let _ = tokio::fs::remove_file(&temp_path).await;
                    send_stream.write_all(&STATUS_IO_ERROR.to_be_bytes()).await?;
                    return Err(format!("Stream read error: {}", e).into());
                }
            }
        }

        // Flush and close temp file
        temp_file.flush().await?;
        drop(temp_file);

        // Remove cancellation tracker
        {
            let mut cancellations = self.active_cancellations.write().await;
            cancellations.remove(&header.transfer_id);
        }

        // Step 5: Verify byte count and SHA-256 hash
        if total_received != header.file_size {
            let _ = tokio::fs::remove_file(&temp_path).await;
            send_stream.write_all(&STATUS_SIZE_MISMATCH.to_be_bytes()).await?;
            return Err(format!(
                "Byte count mismatch: expected {}, got {}",
                header.file_size, total_received
            )
            .into());
        }

        let calculated_hash = hex::encode(hasher.finalize()).to_lowercase();
        let expected_hash = header.expected_sha256.to_lowercase();

        if !expected_hash.is_empty()
            && !expected_hash.starts_with("stream_")
            && calculated_hash != expected_hash
        {
            let _ = tokio::fs::remove_file(&temp_path).await;
            send_stream.write_all(&STATUS_HASH_MISMATCH.to_be_bytes()).await?;
            return Err(format!(
                "SHA-256 mismatch: expected {}, got {}",
                expected_hash, calculated_hash
            )
            .into());
        }

        // Step 6: Atomic commit (rename .tmp to final destination)
        if let Err(_e) = tokio::fs::rename(&temp_path, &dest_path).await {
            // If cross-device or permission error on rename, fallback to copy + delete
            if let Err(copy_err) = tokio::fs::copy(&temp_path, &dest_path).await {
                let _ = tokio::fs::remove_file(&temp_path).await;
                send_stream.write_all(&STATUS_IO_ERROR.to_be_bytes()).await?;
                return Err(format!("Failed to commit file to destination: {}", copy_err).into());
            }
            let _ = tokio::fs::remove_file(&temp_path).await;
        }

        // Step 7: Acknowledge success to sender
        send_stream.write_all(&STATUS_SUCCESS.to_be_bytes()).await?;
        send_stream.finish()?;

        if let Some(ref cb) = approval.on_complete {
            cb(&header.transfer_id, &dest_path);
        }

        tracing::info!(
            "[QuicEngine] File transfer completed and verified: {} ({} bytes)",
            dest_path.display(),
            total_received
        );

        Ok(())
    }

    /// Client: Sends a file over QUIC to a remote peer with certificate fingerprint pinning and progress telemetry.
    pub async fn send_file(
        &self,
        peer_addr: SocketAddr,
        expected_fingerprint: &str,
        file_path: &Path,
        header: TransferHeader,
        progress: Option<ProgressCallback>,
        cancel_flag: Option<Arc<AtomicBool>>,
    ) -> Result<u64, Box<dyn std::error::Error + Send + Sync>> {
        let client_config = build_client_config(expected_fingerprint)?;

        // Connect to peer QUIC endpoint with pinned certificate
        let conn = self
            .endpoint
            .connect_with(client_config, peer_addr, "localhost")?
            .await?;

        let (mut send_stream, mut recv_stream) = conn.open_bi().await?;

        // 1. Write header framing
        let header_bytes = header.encode().map_err(|e| format!("Header encode failed: {}", e))?;
        send_stream.write_all(&header_bytes).await?;

        // 2. Stream file bytes with bounded buffer
        let mut file = File::open(file_path).await?;
        let file_size = header.file_size;
        let mut buffer = vec![0u8; DEFAULT_CHUNK_SIZE];
        let mut sent_bytes = 0u64;

        let start_time = Instant::now();
        let mut last_progress_time = Instant::now();

        while sent_bytes < file_size {
            if let Some(ref cf) = cancel_flag {
                if cf.load(Ordering::SeqCst) {
                    let _ = send_stream.reset(0u32.into());
                    conn.close(0u32.into(), b"cancelled");
                    return Err("Transfer cancelled by sender".into());
                }
            }

            let to_read = std::cmp::min(buffer.len() as u64, file_size - sent_bytes) as usize;
            let n = file.read(&mut buffer[..to_read]).await?;
            if n == 0 {
                break;
            }

            if let Err(write_err) = send_stream.write_all(&buffer[..n]).await {
                // If receiver closed the write stream early, read receiver's rejection frame
                let mut status_buf = [0u8; 4];
                if let Ok(()) = recv_stream.read_exact(&mut status_buf).await {
                    let status = u32::from_be_bytes(status_buf);
                    return match status {
                        STATUS_AUTH_FAILED => Err("Receiver rejected transfer: Authentication failed (invalid or expired token)".into()),
                        STATUS_HASH_MISMATCH => Err("Receiver rejected transfer: SHA-256 hash mismatch".into()),
                        STATUS_SIZE_MISMATCH => Err("Receiver rejected transfer: Byte count mismatch".into()),
                        STATUS_IO_ERROR => Err("Receiver disk error while saving file".into()),
                        STATUS_CANCELLED => Err("Transfer cancelled by recipient".into()),
                        other => Err(format!("Receiver error status: 0x{:08X}", other).into()),
                    };
                }
                return Err(format!("Stream write failed: {}", write_err).into());
            }
            sent_bytes += n as u64;

            // Throttled progress callback (~10-15 updates/sec)
            if last_progress_time.elapsed() >= Duration::from_millis(90) || sent_bytes == file_size {
                last_progress_time = Instant::now();
                let elapsed_secs = start_time.elapsed().as_secs_f64().max(0.001);
                let speed_mbps = (sent_bytes as f64 / (1024.0 * 1024.0)) / elapsed_secs;

                if let Some(ref cb) = progress {
                    let should_continue = cb(sent_bytes, file_size, speed_mbps);
                    if !should_continue {
                        let _ = send_stream.reset(0u32.into());
                        conn.close(0u32.into(), b"cancelled");
                        return Err("Transfer cancelled by sender callback".into());
                    }
                }

                if let Some(ref cf) = cancel_flag {
                    if cf.load(Ordering::SeqCst) {
                        let _ = send_stream.reset(0u32.into());
                        conn.close(0u32.into(), b"cancelled");
                        return Err("Transfer cancelled by sender".into());
                    }
                }
            }
        }

        if let Some(ref cf) = cancel_flag {
            if cf.load(Ordering::SeqCst) {
                let _ = send_stream.reset(0u32.into());
                conn.close(0u32.into(), b"cancelled");
                return Err("Transfer cancelled by sender".into());
            }
        }

        // Finish sending
        let _ = send_stream.finish();

        // 3. Await receiver ACK status frame (4 bytes)
        let mut status_buf = [0u8; 4];
        recv_stream.read_exact(&mut status_buf).await?;
        let status = u32::from_be_bytes(status_buf);

        match status {
            STATUS_SUCCESS => Ok(sent_bytes),
            STATUS_AUTH_FAILED => Err("Receiver rejected transfer: Authentication failed (invalid or expired token)".into()),
            STATUS_HASH_MISMATCH => Err("Receiver rejected transfer: SHA-256 hash mismatch".into()),
            STATUS_SIZE_MISMATCH => Err("Receiver rejected transfer: Byte count mismatch".into()),
            STATUS_IO_ERROR => Err("Receiver disk error while saving file".into()),
            STATUS_CANCELLED => Err("Transfer cancelled by recipient".into()),
            other => Err(format!("Unknown error status from receiver: 0x{:08X}", other).into()),
        }
    }
}
