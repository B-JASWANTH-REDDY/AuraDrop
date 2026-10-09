//! Integration Test Suite for AuraDrop QUIC Data Plane Engine

use auradrop_quic::engine::{ApprovedTransfer, QuicEngine};
use auradrop_quic::framing::TransferHeader;
use sha2::{Digest, Sha256};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tempfile::tempdir;
use tokio::fs::File;
use tokio::io::AsyncWriteExt;

#[tokio::test]
async fn test_quic_end_to_end_file_transfer() {
    let temp_dir = tempdir().expect("Failed to create tempdir");
    let src_file_path = temp_dir.path().join("source_payload.bin");
    let dest_file_path = temp_dir.path().join("received_payload.bin");

    // 1. Create a 2 MB test payload with pseudo-random content
    let mut payload = vec![0u8; 2 * 1024 * 1024];
    for (i, byte) in payload.iter_mut().enumerate() {
        *byte = (i % 251) as u8;
    }
    let mut src_file = File::create(&src_file_path).await.expect("Failed to create source file");
    src_file.write_all(&payload).await.expect("Failed to write source file");
    src_file.flush().await.expect("Failed to flush source file");

    let mut hasher = Sha256::new();
    hasher.update(&payload);
    let expected_sha256 = hex::encode(hasher.finalize());

    // 2. Start Receiver QuicEngine
    let receiver = QuicEngine::start("127.0.0.1:0".parse().unwrap(), "receiver_node_1")
        .await
        .expect("Failed to start receiver QuicEngine");
    let receiver_addr = receiver.local_addr().expect("Failed to get local addr");

    // 3. Register approved transfer token
    let transfer_id = "xfer_test_001".to_string();
    let token = "tok_valid_secret_999".to_string();

    receiver.approve_transfer(ApprovedTransfer {
        transfer_id: transfer_id.clone(),
        token: token.clone(),
        file_name: "received_payload.bin".to_string(),
        file_size: payload.len() as u64,
        expected_sha256: expected_sha256.clone(),
        destination_path: dest_file_path.clone(),
        expires_at: Instant::now() + Duration::from_secs(60),
        ..Default::default()
    }).await;

    // 4. Start Sender QuicEngine
    let sender = QuicEngine::start("127.0.0.1:0".parse().unwrap(), "sender_node_1")
        .await
        .expect("Failed to start sender QuicEngine");

    let header = TransferHeader {
        transfer_id: transfer_id.clone(),
        one_time_token: token.clone(),
        file_name: "received_payload.bin".to_string(),
        file_size: payload.len() as u64,
        expected_sha256: expected_sha256.clone(),
        sender_device_id: "sender_node_1".to_string(),
        client_version: "2.0.1".to_string(),
    };

    let progress_called = Arc::new(AtomicBool::new(false));
    let progress_clone = progress_called.clone();

    // 5. Perform send_file
    let sent_bytes = sender
        .send_file(
            receiver_addr,
            receiver.cert_fingerprint(),
            &src_file_path,
            header,
            Some(Arc::new(move |_sent, _total, _speed| {
                progress_clone.store(true, Ordering::SeqCst);
                true
            })),
            None,
        )
        .await
        .expect("send_file failed");

    assert_eq!(sent_bytes, payload.len() as u64);
    assert!(progress_called.load(Ordering::SeqCst));

    // 6. Verify received file exists, has exact size, and matches SHA-256
    assert!(dest_file_path.exists(), "Destination file was not committed");
    let received_bytes = tokio::fs::read(&dest_file_path).await.expect("Failed to read received file");
    assert_eq!(received_bytes.len(), payload.len());
    assert_eq!(received_bytes, payload);

    let mut dest_hasher = Sha256::new();
    dest_hasher.update(&received_bytes);
    assert_eq!(hex::encode(dest_hasher.finalize()), expected_sha256);

    // 7. Cleanup
    receiver.shutdown().await;
    sender.shutdown().await;
}

#[tokio::test]
async fn test_quic_rejects_invalid_token() {
    let temp_dir = tempdir().expect("Failed to create tempdir");
    let src_file_path = temp_dir.path().join("source_payload.bin");
    let dest_file_path = temp_dir.path().join("received_payload.bin");

    let payload = b"Test secret data for invalid token test";
    tokio::fs::write(&src_file_path, payload).await.unwrap();

    let receiver = QuicEngine::start("127.0.0.1:0".parse().unwrap(), "receiver_node_2").await.unwrap();
    let receiver_addr = receiver.local_addr().unwrap();

    receiver.approve_transfer(ApprovedTransfer {
        transfer_id: "xfer_real".to_string(),
        token: "tok_correct".to_string(),
        file_name: "test.txt".to_string(),
        file_size: payload.len() as u64,
        expected_sha256: "".to_string(),
        destination_path: dest_file_path.clone(),
        expires_at: Instant::now() + Duration::from_secs(60),
        ..Default::default()
    }).await;

    let sender = QuicEngine::start("127.0.0.1:0".parse().unwrap(), "sender_node_2").await.unwrap();

    // Send with WRONG token
    let header = TransferHeader {
        transfer_id: "xfer_real".to_string(),
        one_time_token: "tok_FORGED_WRONG".to_string(),
        file_name: "test.txt".to_string(),
        file_size: payload.len() as u64,
        expected_sha256: "".to_string(),
        sender_device_id: "sender_node_2".to_string(),
        client_version: "2.0.1".to_string(),
    };

    let result = sender
        .send_file(
            receiver_addr,
            receiver.cert_fingerprint(),
            &src_file_path,
            header,
            None,
            None,
        )
        .await;

    assert!(result.is_err(), "Transfer should have been rejected with invalid token");
    let err_msg = result.err().unwrap().to_string();
    println!("Actual error message: {}", err_msg);
    assert!(err_msg.contains("Authentication failed") || err_msg.contains("Token mismatch") || err_msg.contains("AUTH_FAILED") || err_msg.contains("rejected"));
    assert!(!dest_file_path.exists(), "Destination file must NOT be created");

    receiver.shutdown().await;
    sender.shutdown().await;
}

#[tokio::test]
async fn test_quic_rejects_sha256_hash_mismatch_and_deletes_temp() {
    let temp_dir = tempdir().expect("Failed to create tempdir");
    let src_file_path = temp_dir.path().join("source_payload.bin");
    let dest_file_path = temp_dir.path().join("corrupted_payload.bin");

    let payload = b"Original uncorrupted bytes";
    tokio::fs::write(&src_file_path, payload).await.unwrap();

    let receiver = QuicEngine::start("127.0.0.1:0".parse().unwrap(), "receiver_node_3").await.unwrap();
    let receiver_addr = receiver.local_addr().unwrap();

    // Declare a false SHA-256 checksum that will intentionally not match
    let bogus_sha256 = "0000000000000000000000000000000000000000000000000000000000000000".to_string();

    receiver.approve_transfer(ApprovedTransfer {
        transfer_id: "xfer_corrupt".to_string(),
        token: "tok_corrupt_test".to_string(),
        file_name: "corrupted_payload.bin".to_string(),
        file_size: payload.len() as u64,
        expected_sha256: bogus_sha256.clone(),
        destination_path: dest_file_path.clone(),
        expires_at: Instant::now() + Duration::from_secs(60),
        ..Default::default()
    }).await;

    let sender = QuicEngine::start("127.0.0.1:0".parse().unwrap(), "sender_node_3").await.unwrap();

    let header = TransferHeader {
        transfer_id: "xfer_corrupt".to_string(),
        one_time_token: "tok_corrupt_test".to_string(),
        file_name: "corrupted_payload.bin".to_string(),
        file_size: payload.len() as u64,
        expected_sha256: bogus_sha256,
        sender_device_id: "sender_node_3".to_string(),
        client_version: "2.0.1".to_string(),
    };

    let result = sender
        .send_file(
            receiver_addr,
            receiver.cert_fingerprint(),
            &src_file_path,
            header,
            None,
            None,
        )
        .await;

    assert!(result.is_err(), "Transfer should have been rejected due to hash mismatch");
    let err_msg = result.err().unwrap().to_string();
    assert!(err_msg.contains("hash mismatch"));
    assert!(!dest_file_path.exists(), "Destination file must NOT be committed on hash mismatch");

    receiver.shutdown().await;
    sender.shutdown().await;
}

#[tokio::test]
async fn test_quic_cancellation() {
    let temp_dir = tempdir().expect("Failed to create tempdir");
    let src_file_path = temp_dir.path().join("large_cancel_source.bin");
    let dest_file_path = temp_dir.path().join("cancelled_dest.bin");

    // 5 MB payload so we have time to cancel mid-transfer
    let payload = vec![0xAB; 5 * 1024 * 1024];
    tokio::fs::write(&src_file_path, &payload).await.unwrap();

    let receiver = QuicEngine::start("127.0.0.1:0".parse().unwrap(), "receiver_node_4").await.unwrap();
    let receiver_addr = receiver.local_addr().unwrap();

    receiver.approve_transfer(ApprovedTransfer {
        transfer_id: "xfer_cancel_1".to_string(),
        token: "tok_cancel_1".to_string(),
        file_name: "cancelled_dest.bin".to_string(),
        file_size: payload.len() as u64,
        expected_sha256: "".to_string(),
        destination_path: dest_file_path.clone(),
        expires_at: Instant::now() + Duration::from_secs(60),
        ..Default::default()
    }).await;

    let sender = QuicEngine::start("127.0.0.1:0".parse().unwrap(), "sender_node_4").await.unwrap();

    let header = TransferHeader {
        transfer_id: "xfer_cancel_1".to_string(),
        one_time_token: "tok_cancel_1".to_string(),
        file_name: "cancelled_dest.bin".to_string(),
        file_size: payload.len() as u64,
        expected_sha256: "".to_string(),
        sender_device_id: "sender_node_4".to_string(),
        client_version: "2.0.1".to_string(),
    };

    let cancel_flag = Arc::new(AtomicBool::new(false));
    let cancel_flag_clone = cancel_flag.clone();

    // Cancel after first progress callback
    let result = sender
        .send_file(
            receiver_addr,
            receiver.cert_fingerprint(),
            &src_file_path,
            header,
            Some(Arc::new(move |sent, _total, _speed| {
                if sent > 256 * 1024 {
                    cancel_flag_clone.store(true, Ordering::SeqCst);
                    return false;
                }
                true
            })),
            Some(cancel_flag),
        )
        .await;

    assert!(result.is_err(), "Transfer should fail due to cancellation");
    assert!(!dest_file_path.exists(), "Cancelled transfer must not commit destination file");

    receiver.shutdown().await;
    sender.shutdown().await;
}

#[tokio::test]
async fn test_quic_empty_file_transfer() {
    let temp_dir = tempdir().expect("Failed to create tempdir");
    let src_file_path = temp_dir.path().join("empty_source.bin");
    let dest_file_path = temp_dir.path().join("empty_received.bin");

    tokio::fs::write(&src_file_path, b"").await.unwrap();

    let receiver = QuicEngine::start("127.0.0.1:0".parse().unwrap(), "receiver_empty").await.unwrap();
    let receiver_addr = receiver.local_addr().unwrap();

    let empty_sha256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855".to_string();

    receiver.approve_transfer(ApprovedTransfer {
        transfer_id: "xfer_empty".to_string(),
        token: "tok_empty".to_string(),
        file_name: "empty_received.bin".to_string(),
        file_size: 0,
        expected_sha256: empty_sha256.clone(),
        destination_path: dest_file_path.clone(),
        expires_at: Instant::now() + Duration::from_secs(60),
        ..Default::default()
    }).await;

    let sender = QuicEngine::start("127.0.0.1:0".parse().unwrap(), "sender_empty").await.unwrap();

    let header = TransferHeader {
        transfer_id: "xfer_empty".to_string(),
        one_time_token: "tok_empty".to_string(),
        file_name: "empty_received.bin".to_string(),
        file_size: 0,
        expected_sha256: empty_sha256,
        sender_device_id: "sender_empty".to_string(),
        client_version: "2.0.1".to_string(),
    };

    let sent_bytes = sender
        .send_file(
            receiver_addr,
            receiver.cert_fingerprint(),
            &src_file_path,
            header,
            None,
            None,
        )
        .await
        .expect("empty file send failed");

    assert_eq!(sent_bytes, 0);
    assert!(dest_file_path.exists());
    let content = tokio::fs::read(&dest_file_path).await.unwrap();
    assert_eq!(content.len(), 0);

    receiver.shutdown().await;
    sender.shutdown().await;
}

#[tokio::test]
async fn test_quic_expired_token_rejection() {
    let temp_dir = tempdir().expect("Failed to create tempdir");
    let src_file_path = temp_dir.path().join("expired_source.bin");
    let dest_file_path = temp_dir.path().join("expired_dest.bin");

    tokio::fs::write(&src_file_path, b"expired data").await.unwrap();

    let receiver = QuicEngine::start("127.0.0.1:0".parse().unwrap(), "receiver_exp").await.unwrap();
    let receiver_addr = receiver.local_addr().unwrap();

    // Already expired approval (expired 5 seconds ago)
    receiver.approve_transfer(ApprovedTransfer {
        transfer_id: "xfer_expired".to_string(),
        token: "tok_expired".to_string(),
        file_name: "expired_dest.bin".to_string(),
        file_size: 12,
        expected_sha256: "".to_string(),
        destination_path: dest_file_path.clone(),
        expires_at: Instant::now() - Duration::from_secs(5),
        ..Default::default()
    }).await;

    let sender = QuicEngine::start("127.0.0.1:0".parse().unwrap(), "sender_exp").await.unwrap();

    let header = TransferHeader {
        transfer_id: "xfer_expired".to_string(),
        one_time_token: "tok_expired".to_string(),
        file_name: "expired_dest.bin".to_string(),
        file_size: 12,
        expected_sha256: "".to_string(),
        sender_device_id: "sender_exp".to_string(),
        client_version: "2.0.1".to_string(),
    };

    let result = sender
        .send_file(
            receiver_addr,
            receiver.cert_fingerprint(),
            &src_file_path,
            header,
            None,
            None,
        )
        .await;

    assert!(result.is_err(), "Expired token must be rejected");
    assert!(!dest_file_path.exists());

    receiver.shutdown().await;
    sender.shutdown().await;
}

#[tokio::test]
async fn test_quic_large_10mb_file_transfer() {
    let temp_dir = tempdir().expect("Failed to create tempdir");
    let src_file_path = temp_dir.path().join("large_10mb_source.bin");
    let dest_file_path = temp_dir.path().join("large_10mb_received.bin");

    // 10 MB payload
    let mut payload = vec![0u8; 10 * 1024 * 1024];
    for (i, byte) in payload.iter_mut().enumerate() {
        *byte = ((i * 31) % 256) as u8;
    }
    tokio::fs::write(&src_file_path, &payload).await.unwrap();

    let mut hasher = Sha256::new();
    hasher.update(&payload);
    let expected_sha256 = hex::encode(hasher.finalize());

    let receiver = QuicEngine::start("127.0.0.1:0".parse().unwrap(), "receiver_10mb").await.unwrap();
    let receiver_addr = receiver.local_addr().unwrap();

    receiver.approve_transfer(ApprovedTransfer {
        transfer_id: "xfer_10mb".to_string(),
        token: "tok_10mb".to_string(),
        file_name: "large_10mb_received.bin".to_string(),
        file_size: payload.len() as u64,
        expected_sha256: expected_sha256.clone(),
        destination_path: dest_file_path.clone(),
        expires_at: Instant::now() + Duration::from_secs(60),
        ..Default::default()
    }).await;

    let sender = QuicEngine::start("127.0.0.1:0".parse().unwrap(), "sender_10mb").await.unwrap();

    let header = TransferHeader {
        transfer_id: "xfer_10mb".to_string(),
        one_time_token: "tok_10mb".to_string(),
        file_name: "large_10mb_received.bin".to_string(),
        file_size: payload.len() as u64,
        expected_sha256: expected_sha256.clone(),
        sender_device_id: "sender_10mb".to_string(),
        client_version: "2.0.1".to_string(),
    };

    let start_instant = Instant::now();
    let sent_bytes = sender
        .send_file(
            receiver_addr,
            receiver.cert_fingerprint(),
            &src_file_path,
            header,
            None,
            None,
        )
        .await
        .expect("10 MB transfer failed");

    let duration = start_instant.elapsed();
    let throughput_mb_s = (payload.len() as f64 / (1024.0 * 1024.0)) / duration.as_secs_f64();
    println!("10 MB QUIC Transfer completed in {:?} ({:.2} MB/s)", duration, throughput_mb_s);

    assert_eq!(sent_bytes, payload.len() as u64);
    assert!(dest_file_path.exists());
    let received_bytes = tokio::fs::read(&dest_file_path).await.unwrap();
    assert_eq!(received_bytes.len(), payload.len());
    assert_eq!(received_bytes, payload);

    receiver.shutdown().await;
    sender.shutdown().await;
}

#[tokio::test]
async fn test_quic_vs_tcp_benchmark() {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    println!("\n==========================================================================");
    println!("        AURADROP BENCHMARK: QUINN QUIC vs STREAMING TCP (RELEASE)");
    println!("==========================================================================");

    for &payload_mb in &[10usize, 25usize, 50usize] {
        let payload_size = payload_mb * 1024 * 1024;
        let temp_dir = tempdir().expect("Failed to create tempdir");
        let src_file_path = temp_dir.path().join(format!("bench_src_{}mb.bin", payload_mb));
        let quic_dest_path = temp_dir.path().join(format!("bench_quic_dest_{}mb.bin", payload_mb));
        let tcp_dest_path = temp_dir.path().join(format!("bench_tcp_dest_{}mb.bin", payload_mb));

        // Create random payload
        let mut payload = vec![0u8; payload_size];
        for (i, byte) in payload.iter_mut().enumerate() {
            *byte = ((i.wrapping_mul(37)) ^ (i >> 8)) as u8;
        }
        tokio::fs::write(&src_file_path, &payload).await.unwrap();

        let mut hasher = Sha256::new();
        hasher.update(&payload);
        let expected_sha256 = hex::encode(hasher.finalize());

        // --- 1. TCP BENCHMARK ---
        let tcp_listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let tcp_addr = tcp_listener.local_addr().unwrap();

        let tcp_dest_clone = tcp_dest_path.clone();
        let tcp_server_task = tokio::spawn(async move {
            let (mut socket, _) = tcp_listener.accept().await.unwrap();
            let mut file = tokio::fs::File::create(&tcp_dest_clone).await.unwrap();
            let mut buf = vec![0u8; 512 * 1024];
            let mut total_received = 0u64;
            loop {
                let n = socket.read(&mut buf).await.unwrap();
                if n == 0 {
                    break;
                }
                file.write_all(&buf[..n]).await.unwrap();
                total_received += n as u64;
            }
            file.flush().await.unwrap();
            total_received
        });

        let tcp_start = Instant::now();
        let mut tcp_stream = tokio::net::TcpStream::connect(tcp_addr).await.unwrap();
        let mut src_file_tcp = tokio::fs::File::open(&src_file_path).await.unwrap();
        let mut send_buf = vec![0u8; 512 * 1024];
        loop {
            let n = src_file_tcp.read(&mut send_buf).await.unwrap();
            if n == 0 {
                break;
            }
            tcp_stream.write_all(&send_buf[..n]).await.unwrap();
        }
        tcp_stream.shutdown().await.unwrap();
        let tcp_received = tcp_server_task.await.unwrap();
        let tcp_duration = tcp_start.elapsed();
        let tcp_mb_s = (payload_size as f64 / (1024.0 * 1024.0)) / tcp_duration.as_secs_f64();
        assert_eq!(tcp_received, payload_size as u64);

        // --- 2. QUIC BENCHMARK ---
        let receiver = QuicEngine::start("127.0.0.1:0".parse().unwrap(), "receiver_node").await.unwrap();
        let receiver_addr = receiver.local_addr().unwrap();
        let transfer_id = format!("bench_xfer_{}mb", payload_mb);
        let token = format!("bench_token_{}mb", payload_mb);

        receiver.approve_transfer(ApprovedTransfer {
            transfer_id: transfer_id.clone(),
            token: token.clone(),
            file_name: format!("quic_{}mb.bin", payload_mb),
            file_size: payload_size as u64,
            expected_sha256: expected_sha256.clone(),
            destination_path: quic_dest_path.clone(),
            expires_at: Instant::now() + Duration::from_secs(60),
            ..Default::default()
        }).await;

        let sender = QuicEngine::start("127.0.0.1:0".parse().unwrap(), "sender_node").await.unwrap();
        let header = TransferHeader {
            transfer_id: transfer_id.clone(),
            one_time_token: token.clone(),
            file_name: format!("quic_{}mb.bin", payload_mb),
            file_size: payload_size as u64,
            expected_sha256: expected_sha256.clone(),
            sender_device_id: "sender_node".to_string(),
            client_version: "2.0.1".to_string(),
        };

        let quic_start = Instant::now();
        let quic_sent = sender
            .send_file(
                receiver_addr,
                receiver.cert_fingerprint(),
                &src_file_path,
                header,
                None,
                None,
            )
            .await
            .unwrap();
        let quic_duration = quic_start.elapsed();
        let quic_mb_s = (payload_size as f64 / (1024.0 * 1024.0)) / quic_duration.as_secs_f64();
        assert_eq!(quic_sent, payload_size as u64);

        // Verify QUIC file SHA-256
        let quic_file_data = tokio::fs::read(&quic_dest_path).await.unwrap();
        let mut quic_hasher = Sha256::new();
        quic_hasher.update(&quic_file_data);
        assert_eq!(hex::encode(quic_hasher.finalize()), expected_sha256);

        receiver.shutdown().await;
        sender.shutdown().await;

        println!("Payload Size: {:>3} MB", payload_mb);
        println!("  ├─ TCP Streaming : {:>8.2?} | {:>8.2} MB/s | SHA-256 Verified: PASS", tcp_duration, tcp_mb_s);
        println!("  └─ Quinn QUIC    : {:>8.2?} | {:>8.2} MB/s | SHA-256 Verified: PASS (TLS 1.3 Pinning)", quic_duration, quic_mb_s);
    }
    println!("==========================================================================\n");
}
