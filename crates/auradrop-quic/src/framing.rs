//! Versioned Transfer Framing & Path Sanitization for AuraDrop QUIC Engine

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

pub const MAGIC_BYTES: &[u8; 4] = b"AURA";
pub const PROTOCOL_VERSION_1: u32 = 1;
pub const MAX_HEADER_SIZE: usize = 64 * 1024; // 64 KiB strict maximum

// Status Codes (4 bytes big-endian)
pub const STATUS_SUCCESS: u32 = 0x0000_0000;
pub const STATUS_AUTH_FAILED: u32 = 0x0000_0001;
pub const STATUS_HASH_MISMATCH: u32 = 0x0000_0002;
pub const STATUS_SIZE_MISMATCH: u32 = 0x0000_0003;
pub const STATUS_IO_ERROR: u32 = 0x0000_0004;
pub const STATUS_CANCELLED: u32 = 0x0000_0005;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferHeader {
    pub transfer_id: String,
    pub one_time_token: String,
    pub file_name: String,
    pub file_size: u64,
    pub expected_sha256: String,
    pub sender_device_id: String,
    #[serde(default = "default_version")]
    pub client_version: String,
}

fn default_version() -> String {
    "2.0.1".to_string()
}

impl TransferHeader {
    pub fn validate(&self) -> Result<(), String> {
        if self.transfer_id.is_empty() || self.transfer_id.len() > 128 {
            return Err("Invalid transfer_id length".to_string());
        }
        if self.one_time_token.is_empty() || self.one_time_token.len() > 128 {
            return Err("Invalid one_time_token length".to_string());
        }
        if self.file_name.is_empty() || self.file_name.len() > 512 {
            return Err("Invalid file_name length".to_string());
        }
        if self.expected_sha256.len() > 128 {
            return Err("Invalid expected_sha256 length".to_string());
        }
        Ok(())
    }

    pub fn encode(&self) -> Result<Vec<u8>, String> {
        self.validate()?;
        let json_bytes = serde_json::to_vec(self).map_err(|e| e.to_string())?;
        if json_bytes.len() > MAX_HEADER_SIZE {
            return Err(format!("Header size {} exceeds maximum {}", json_bytes.len(), MAX_HEADER_SIZE));
        }

        let mut buf = Vec::with_capacity(12 + json_bytes.len());
        buf.extend_from_slice(MAGIC_BYTES);
        buf.extend_from_slice(&PROTOCOL_VERSION_1.to_be_bytes());
        buf.extend_from_slice(&(json_bytes.len() as u32).to_be_bytes());
        buf.extend_from_slice(&json_bytes);
        Ok(buf)
    }

    pub fn decode(buf: &[u8]) -> Result<(Self, usize), String> {
        if buf.len() < 12 {
            return Err("Buffer too short for framing header prefix".to_string());
        }

        if &buf[0..4] != MAGIC_BYTES {
            return Err("Invalid framing magic bytes (expected 'AURA')".to_string());
        }

        let version = u32::from_be_bytes(buf[4..8].try_into().unwrap());
        if version != PROTOCOL_VERSION_1 {
            return Err(format!("Unsupported protocol version: {}", version));
        }

        let header_len = u32::from_be_bytes(buf[8..12].try_into().unwrap()) as usize;
        if header_len > MAX_HEADER_SIZE {
            return Err(format!("Declared header size {} exceeds maximum limit", header_len));
        }

        if buf.len() < 12 + header_len {
            return Err(format!("Incomplete header payload: expected {} bytes, got {}", 12 + header_len, buf.len()));
        }

        let json_bytes = &buf[12..12 + header_len];
        let header: TransferHeader = serde_json::from_slice(json_bytes).map_err(|e| format!("Invalid header JSON: {}", e))?;
        header.validate()?;

        Ok((header, 12 + header_len))
    }
}

/// Sanitizes a filename to prevent path traversal vulnerabilities.
/// Replaces directory separators, parent path tokens ('..'), control characters, and reserved Windows device names.
pub fn sanitize_filename(raw_name: &str) -> String {
    // 1. Take only the file basename
    let raw = raw_name.replace('\\', "/");
    let base = raw.rsplit('/').next().unwrap_or("file");

    // 2. Filter dangerous or control characters
    let mut clean: String = base
        .chars()
        .filter(|c| !c.is_control() && *c != '\0' && *c != '/' && *c != '\\')
        .collect();

    // 3. Prevent '..' traversal or empty strings
    if clean.is_empty() || clean == "." || clean == ".." {
        clean = format!("auradrop_file_{}", uuid::Uuid::new_v4().simple());
    }

    // 4. Windows reserved device names check
    let upper = clean.to_uppercase();
    let reserved = ["CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"];
    let stem = clean.split('.').next().unwrap_or("").to_uppercase();
    if reserved.contains(&stem.as_str()) || reserved.contains(&upper.as_str()) {
        clean = format!("safe_{}", clean);
    }

    clean
}

/// Resolves a unique destination path in the target directory to avoid unexpected overwrite.
pub fn resolve_unique_destination(target_dir: &Path, raw_file_name: &str) -> PathBuf {
    let safe_name = sanitize_filename(raw_file_name);
    let mut candidate = target_dir.join(&safe_name);

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
        candidate = target_dir.join(new_name);
        if !candidate.exists() {
            return candidate;
        }
        counter += 1;
        if counter > 10000 {
            return target_dir.join(format!("{}_{}", uuid::Uuid::new_v4().simple(), safe_name));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_header_encode_decode() {
        let header = TransferHeader {
            transfer_id: "xfer_12345".to_string(),
            one_time_token: "tok_secret".to_string(),
            file_name: "test_presentation.pdf".to_string(),
            file_size: 1048576,
            expected_sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855".to_string(),
            sender_device_id: "dev_macbook".to_string(),
            client_version: "2.0.1".to_string(),
        };

        let encoded = header.encode().expect("Failed to encode");
        let (decoded, consumed) = TransferHeader::decode(&encoded).expect("Failed to decode");

        assert_eq!(consumed, encoded.len());
        assert_eq!(decoded.transfer_id, header.transfer_id);
        assert_eq!(decoded.file_name, header.file_name);
        assert_eq!(decoded.file_size, header.file_size);
        assert_eq!(decoded.expected_sha256, header.expected_sha256);
    }

    #[test]
    fn test_sanitize_filename() {
        assert_eq!(sanitize_filename("../../etc/passwd"), "passwd");
        assert_eq!(sanitize_filename("C:\\Windows\\System32\\cmd.exe"), "cmd.exe");
        assert!(sanitize_filename("..").starts_with("auradrop_file_"));
        assert_eq!(sanitize_filename("CON.txt"), "safe_CON.txt");
        assert_eq!(sanitize_filename("my_document.docx"), "my_document.docx");
    }
}
