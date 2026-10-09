//! AuraDrop QUIC Data Plane Engine

pub mod tls;
pub mod framing;
pub mod engine;
pub mod jni;

pub fn version() -> &'static str {
    "0.1.0"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_version() {
        assert_eq!(version(), "0.1.0");
    }
}
