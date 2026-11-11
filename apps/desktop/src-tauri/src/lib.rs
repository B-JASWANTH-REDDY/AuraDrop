pub mod commands;
pub mod crypto;
pub mod discovery;
pub mod identity;
pub mod models;
pub mod network;
pub mod transfer;

use commands::{
    cancel_transfer, check_for_updates, confirm_transfer_verification, connect_to_peer, get_all_chat_conversations,
    get_chat_history, get_local_info, get_nearby_peers, open_chat_window, open_downloads_folder,
    open_file, open_url, pick_files, probe_device_ip, rescan_network, send_chat_message,
    send_files_to_peer, set_device_name, set_island_size, show_file_in_folder, show_main_window,
    hide_island_window, show_island_window, dismiss_island_session, restore_island_session,
    is_island_dismissed, AppState,
};
use discovery::DiscoveryService;
use identity::IdentityManager;
use std::fs::OpenOptions;
use std::io::Write;
use tauri::Manager;
use transfer::TransferService;

fn get_app_log_dir() -> std::path::PathBuf {
    let base = dirs::data_local_dir()
        .unwrap_or_else(|| std::env::temp_dir())
        .join("AuraDrop");
    let _ = std::fs::create_dir_all(&base);
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    log_debug("run() called");
    let identity = IdentityManager::init();
    log_debug("identity initialized");
    let discovery = DiscoveryService::new(identity.clone());
    let transfer = TransferService::new(identity.clone());

    let res = tauri::Builder::default()
        .setup({
            let discovery = discovery.clone();
            let transfer = transfer.clone();
            let identity = identity.clone();

            move |app| {
                log_debug("setup() hook running");
                let handle = app.handle().clone();
                let mut d = discovery.clone();
                let mut t = transfer.clone();
                d.set_app_handle(handle.clone());
                t.set_app_handle(handle.clone());

                log_debug("starting discovery & transfer server");
                d.start();
                t.start_server();

                // Position floating island window at top center of primary display
                if let Some(island) = app.get_webview_window("island") {
                    if let Ok(Some(monitor)) = island.primary_monitor() {
                        let screen_size = monitor.size();
                        let scale = monitor.scale_factor();
                        let w = (280.0 * scale) as i32;
                        let x = ((screen_size.width as i32) - w) / 2;
                        let y = (14.0 * scale) as i32;
                        let _ = island.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }));
                    }
                    let _ = island.set_always_on_top(true);
                    let _ = island.show();
                }

                let is_island_dismissed = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));

                // Native window focus/blur/close handlers: Auto-hide island when main window has focus;
                // keep island active 24/7 when main window loses focus or is closed/minimized,
                // BUT respect session dismissal so blur events do not forcefully un-hide a dismissed island!
                if let Some(main) = app.get_webview_window("main") {
                    let app_handle = handle.clone();
                    let island_dismissed_flag = is_island_dismissed.clone();
                    main.on_window_event(move |event| {
                        match event {
                            tauri::WindowEvent::Focused(focused) => {
                                if let Some(island) = app_handle.get_webview_window("island") {
                                    if *focused {
                                        let _ = island.hide();
                                    } else {
                                        if !island_dismissed_flag.load(std::sync::atomic::Ordering::SeqCst) {
                                            let _ = island.show();
                                        }
                                    }
                                }
                            }
                            tauri::WindowEvent::CloseRequested { api, .. } => {
                                api.prevent_close();
                                if let Some(main_win) = app_handle.get_webview_window("main") {
                                    let _ = main_win.hide();
                                }
                                if let Some(island) = app_handle.get_webview_window("island") {
                                    if !island_dismissed_flag.load(std::sync::atomic::Ordering::SeqCst) {
                                        let _ = island.show();
                                    }
                                }
                            }
                            _ => {}
                        }
                    });
                }

                app.manage(AppState {
                    identity,
                    discovery: d,
                    transfer: t,
                    is_island_dismissed,
                });
                log_debug("setup() complete");

                Ok(())
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_local_info,
            set_device_name,
            get_nearby_peers,
            pick_files,
            send_files_to_peer,
            cancel_transfer,
            confirm_transfer_verification,
            open_downloads_folder,
            rescan_network,
            probe_device_ip,
            connect_to_peer,
            send_chat_message,
            get_chat_history,
            get_all_chat_conversations,
            check_for_updates,
            show_file_in_folder,
            open_file,
            open_url,
            show_main_window,
            open_chat_window,
            set_island_size,
            hide_island_window,
            show_island_window,
            dismiss_island_session,
            restore_island_session,
            is_island_dismissed
        ])
        .run(tauri::generate_context!());

    match res {
        Ok(_) => log_debug("tauri app exited normally with Ok(())"),
        Err(e) => log_debug(&format!("tauri app exited with Error: {:?}", e)),
    }
}
