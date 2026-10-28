#![windows_subsystem = "windows"]

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;

fn get_app_log_dir() -> PathBuf {
    let base = dirs::data_local_dir()
        .unwrap_or_else(|| std::env::temp_dir())
        .join("AuraDrop");
    let _ = fs::create_dir_all(&base);
    base
}

pub fn log_debug(msg: &str) {
    let log_path = get_app_log_dir().join("debug.log");
    if let Ok(mut f) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
    {
        let _ = writeln!(f, "[{}] {}", chrono::Local::now().format("%H:%M:%S%.3f"), msg);
    }
}

fn main() {
    log_debug("=== AuraDrop main() started ===");

    std::panic::set_hook(Box::new(|info| {
        let msg = format!("PANIC: {:?}\n", info);
        log_debug(&msg);
        let crash_path = get_app_log_dir().join("crash.log");
        let _ = std::fs::write(&crash_path, &msg);
        eprintln!("{}", msg);
    }));

    auradrop_lib::run();
    log_debug("=== AuraDrop main() exited ===");
}
