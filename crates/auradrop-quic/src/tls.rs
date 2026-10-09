//! TLS 1.3 Certificate Generation & Fingerprint-Pinned Verifier for Quinn

use std::sync::Arc;
use quinn::crypto::rustls::QuicServerConfig;
use rustls::client::danger::{HandshakeSignatureValid, ServerCertVerifier};
use rustls::pki_types::{CertificateDer, PrivateKeyDer, PrivatePkcs8KeyDer, ServerName, UnixTime};
use rustls::{DigitallySignedStruct, Error as TlsError, SignatureScheme};
use sha2::{Digest, Sha256};

/// Custom Rustls TLS 1.3 Verifier that validates the server certificate against
/// an expected SHA-256 fingerprint negotiated via the authenticated control plane.
#[derive(Debug)]
pub struct FingerprintCertVerifier {
    expected_fingerprint: String,
}

impl FingerprintCertVerifier {
    pub fn new(expected_fingerprint: String) -> Self {
        Self {
            expected_fingerprint: expected_fingerprint.to_lowercase().replace(':', ""),
        }
    }
}

impl ServerCertVerifier for FingerprintCertVerifier {
    fn verify_server_cert(
        &self,
        end_entity: &CertificateDer<'_>,
        _intermediates: &[CertificateDer<'_>],
        _server_name: &ServerName<'_>,
        _ocsp_response: &[u8],
        _now: UnixTime,
    ) -> Result<rustls::client::danger::ServerCertVerified, TlsError> {
        let mut hasher = Sha256::new();
        hasher.update(end_entity.as_ref());
        let cert_hash = hex::encode(hasher.finalize()).to_lowercase();

        if cert_hash == self.expected_fingerprint {
            Ok(rustls::client::danger::ServerCertVerified::assertion())
        } else {
            Err(TlsError::General(format!(
                "Certificate fingerprint mismatch: expected {}, got {}",
                self.expected_fingerprint, cert_hash
            )))
        }
    }

    fn verify_tls12_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, TlsError> {
        rustls::crypto::verify_tls12_signature(
            message,
            cert,
            dss,
            &rustls::crypto::ring::default_provider().signature_verification_algorithms,
        )
    }

    fn verify_tls13_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, TlsError> {
        rustls::crypto::verify_tls13_signature(
            message,
            cert,
            dss,
            &rustls::crypto::ring::default_provider().signature_verification_algorithms,
        )
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        rustls::crypto::ring::default_provider()
            .signature_verification_algorithms
            .supported_schemes()
    }
}

/// Generates a self-signed TLS 1.3 certificate for the local AuraDrop node.
/// Returns (ServerConfig, SHA-256 certificate fingerprint, CertificateDer).
pub fn generate_self_signed_cert(
    device_id: &str,
) -> Result<(quinn::ServerConfig, String, CertificateDer<'static>), Box<dyn std::error::Error + Send + Sync>> {
    let mut params = rcgen::CertificateParams::new(vec![format!("auradrop-{}.local", device_id), "localhost".to_string()])?;
    params.distinguished_name.push(rcgen::DnType::CommonName, format!("AuraDrop Node {}", device_id));

    let key_pair = rcgen::KeyPair::generate_for(&rcgen::PKCS_ED25519)?;
    let cert = params.self_signed(&key_pair)?;

    let cert_der_vec = cert.der().to_vec();
    let cert_der = CertificateDer::from(cert_der_vec.clone());

    let mut hasher = Sha256::new();
    hasher.update(&cert_der_vec);
    let fingerprint = hex::encode(hasher.finalize());

    let private_key = PrivateKeyDer::Pkcs8(PrivatePkcs8KeyDer::from(key_pair.serialized_der().to_vec()));

    let mut server_crypto = rustls::ServerConfig::builder_with_provider(Arc::new(rustls::crypto::ring::default_provider()))
        .with_safe_default_protocol_versions()?
        .with_no_client_auth()
        .with_single_cert(vec![cert_der.clone()], private_key)?;

    server_crypto.alpn_protocols = vec![b"auradrop/quic/1".to_vec()];

    let quic_server_config = QuicServerConfig::try_from(server_crypto)?;
    let mut server_config = quinn::ServerConfig::with_crypto(Arc::new(quic_server_config));
    server_config.transport_config(build_tuned_transport_config());

    Ok((server_config, fingerprint, cert_der))
}

/// Builds high-throughput Quinn transport settings tuned for local LAN file transfers
pub fn build_tuned_transport_config() -> Arc<quinn::TransportConfig> {
    let mut transport = quinn::TransportConfig::default();
    transport.stream_receive_window(quinn::VarInt::from_u32(16 * 1024 * 1024).into());
    transport.receive_window(quinn::VarInt::from_u32(32 * 1024 * 1024).into());
    transport.send_window(16 * 1024 * 1024);
    transport.max_idle_timeout(Some(std::time::Duration::from_secs(30).try_into().unwrap()));
    transport.keep_alive_interval(Some(std::time::Duration::from_secs(5)));
    Arc::new(transport)
}

/// Builds a client configuration that pins the peer's expected certificate fingerprint.
pub fn build_client_config(
    expected_fingerprint: &str,
) -> Result<quinn::ClientConfig, Box<dyn std::error::Error + Send + Sync>> {
    let verifier = Arc::new(FingerprintCertVerifier::new(expected_fingerprint.to_string()));

    let mut client_crypto = rustls::ClientConfig::builder_with_provider(Arc::new(rustls::crypto::ring::default_provider()))
        .with_safe_default_protocol_versions()?
        .dangerous()
        .with_custom_certificate_verifier(verifier)
        .with_no_client_auth();

    client_crypto.alpn_protocols = vec![b"auradrop/quic/1".to_vec()];

    let quic_client_config = quinn::crypto::rustls::QuicClientConfig::try_from(client_crypto)?;
    let mut client_config = quinn::ClientConfig::new(Arc::new(quic_client_config));
    client_config.transport_config(build_tuned_transport_config());

    Ok(client_config)
}
