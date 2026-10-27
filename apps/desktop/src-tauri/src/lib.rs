pub mod commands;
pub mod crypto;
pub mod discovery;
pub mod identity;
pub mod models;
pub mod network;
pub mod transfer;

use commands::{
    cancel_transfer, check_for_updates, confirm_transfer_verification, get_all_chat_conversations,
    get_chat_history, get_local_info, get_nearby_peers, open_chat_window, open_downloads_folder,
    open_file, open_url, pick_files, probe_device_ip, rescan_network, send_chat_message,
    send_files_to_peer, set_device_name, set_island_size, show_file_in_folder, show_main_window,
    hide_island_window, show_island_window, AppState,
};
use discovery::DiscoveryService;
use identity::IdentityManager;
use std::fs::OpenOptions;
use std::io::Write;
use tauri::Manager;
use transfer::TransferService;

pub fn log_debug(msg: &str) {
    if let Ok(mut f) = OpenOptions::new()
        .create(true)
        .append(true)
        .open("C:\\Users\\bjasw\\Downloads\\AuraDrop-Windows\\debug.log")
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

                // Native window focus/blur/close handlers: Auto-hide island when main window has focus;
                // keep island active 24/7 when main window loses focus or is closed/minimized!
                if let Some(main) = app.get_webview_window("main") {
                    let app_handle = handle.clone();
                    main.on_window_event(move |event| {
                        match event {
                            tauri::WindowEvent::Focused(focused) => {
                                if let Some(island) = app_handle.get_webview_window("island") {
                                    if *focused {
                                        let _ = island.hide();
                                    } else {
                                        let _ = island.show();
                                    }
                                }
                            }
                            tauri::WindowEvent::CloseRequested { api, .. } => {
                                api.prevent_close();
                                if let Some(main_win) = app_handle.get_webview_window("main") {
                                    let _ = main_win.hide();
                                }
                                if let Some(island) = app_handle.get_webview_window("island") {
                                    let _ = island.show();
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
            show_island_window
        ])
        .run(tauri::generate_context!());

    match res {
        Ok(_) => log_debug("tauri app exited normally with Ok(())"),
        Err(e) => log_debug(&format!("tauri app exited with Error: {:?}", e)),
    }
}
