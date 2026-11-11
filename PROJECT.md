# Project: AuraDrop - Cross-Device File Sharing & Dynamic Island

## Architecture
AuraDrop is a production-ready, fullstack cross-device file sharing system supporting Mobile (Flutter/Android, React Native), Desktop (Tauri 2.1, Rust, React 18), and Web (React 18, Vite 6, WebRTC, OPFS).
- **Data Plane (High-Speed Transfer)**:
  - LAN HTTP Socket (`0.0.0.0:53317` Axum Rust on Desktop, Dart HttpServer on Android) with Chrome Private Network Access (PNA) streaming at line-rate (>120 MB/s).
  - WebRTC DataChannel (`packages/protocol`, `packages/transfer-engine`, `apps/web/src/engine/webRtcTransport.ts`) with 4-channel striping, backpressure flow control, and Coturn TURN relay fallback.
  - End-to-end data integrity: FIPS 180-4 streaming SHA-256 chunked hashing, AEAD AES-256-GCM chunk encryption, OPFS bounded disk writing (`.part` staging), and atomic rename on verified checksum.
  - Fullstack reliability: pre-flight disk space checks (`GetDiskFreeSpaceExW`), resumable transfer checkpoints, path traversal sanitization, and graceful disconnection recovery.
- **UI & Presentation Plane (Dynamic Island)**:
  - Desktop: Dedicated borderless transparent floating Tauri overlay window (`apps/desktop/src/components/DesktopIsland.tsx` and `src-tauri/src/commands.rs`).
  - Web: Floating responsive Dynamic Island modal (`apps/web/src/components/AirDropNotification.tsx`).
  - Mobile: System-level floating overlay window manager (`apps/android` / `AuraOverlayManager.kt`).
  - Desktop Dismiss Support: Top-level close ('X') button on both collapsed pill and expanded card, session-level dismissal state, Tauri backend sync to prevent blur revival, and dual restoration channels (manual header toggle + automatic transfer wake-up).

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | High-Speed Cross-Device Transfer | Line-rate (>100 MB/s) transfers across mobile-mobile, mobile-desktop, desktop-desktop via LAN HTTP Turbo and WebRTC DataChannels | M1 | ORIGINAL_REQUEST §R1 |
| 2 | End-to-End Data Integrity | FIPS 180-4 incremental streaming SHA-256 verification and bit-exact validation across all transfers | M1 | ORIGINAL_REQUEST §R1 |
| 3 | Interruption & Connection Drop Handling | Resumable checkpoints (`.part`), graceful disconnection detection, and error reporting | M1 | ORIGINAL_REQUEST §R1, §R3 |
| 4 | Dynamic Island UI Activity Updates | Real-time state transitions across idle, discovering, waiting_approval, transferring, verifying, completed, and error | M1 | ORIGINAL_REQUEST §R2 |
| 5 | Dynamic Island Desktop Close ('X') Button | Persistent 'X' close button on both collapsed pill and expanded card in desktop interface | M1 | ORIGINAL_REQUEST §R2 |
| 6 | Dynamic Island Session Dismissal | Clicking 'X' dismisses the dynamic island window for the current session and stops window blur from re-showing it | M1 | ORIGINAL_REQUEST §R2 |
| 7 | Dynamic Island Restoration Trigger | Restores island display and full functionality on user manual trigger (header toggle) and on new transfer activity | M1 | ORIGINAL_REQUEST §R2 |
| 8 | Fullstack Build & Verification Suite | Clean build across monorepo packages, automated unit/integration tests for dismiss interactions & transfer mechanics | M1 | ORIGINAL_REQUEST §R3, Acceptance Criteria |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Dynamic Island Desktop Dismiss & Fullstack Integration | Implement desktop dismiss ('X') button on dynamic island, session persistence, Tauri backend blur handling fix, restoration triggers (manual & auto on transfer), and dynamic island interaction verification tests | None | DONE |

## Interface Contracts
### Desktop Island UI ↔ Tauri Host Window
- **Dismiss Command**: `invoke('dismiss_island_session')` / `invoke('hide_island_window')` hides Tauri `island` window and sets `is_island_dismissed = true`.
- **Restore Command**: `invoke('restore_island_session')` / `invoke('show_island_window')` shows Tauri `island` window and sets `is_island_dismissed = false`.
- **Focus Listener**: `WindowEvent::Focused(focused)` in `lib.rs` must check `!is_island_dismissed` before calling `island.show()`.
- **Session State**: `sessionStorage.getItem('auradrop_island_dismissed')` tracks frontend dismissal; reset upon incoming transfer or manual toggle.

### Transfer Engine ↔ Dynamic Island State Machine
- **Events**:
  - `incoming-share` / `TRANSFER_REQUEST`: Clears dismissal state, restores island window, sets phase to `waiting_approval`.
  - `transfer-progress` / `TRANSFER_PROGRESS`: Updates transferred bytes, speed, ETA, progress percentage.
  - `transfer-complete` / `TRANSFER_COMPLETE`: Sets phase to `completed`, triggers completion confetti/badge.
  - `transfer-error` / `TRANSFER_FAILED`: Sets phase to `failed`, shows retry/dismiss options.

## Code Layout
- `apps/desktop/src/components/DesktopIsland.tsx`: Desktop dynamic island component (collapsed pill, expanded card, close buttons, session dismiss hook).
- `apps/desktop/src/App.tsx`: Desktop main window (header with Dynamic Island restore button, transfer triggers).
- `apps/desktop/src-tauri/src/lib.rs`: Tauri window event listeners and application setup.
- `apps/desktop/src-tauri/src/commands.rs`: Tauri IPC commands (`dismiss_island_session`, `restore_island_session`, `set_island_size`, `hide_island_window`, `show_island_window`).
- `apps/web/src/components/AirDropNotification.tsx`: Web dynamic island notification component with dismiss support.
- `tests/test-dynamic-island-dismiss.ts`: Verification test suite for Dynamic Island dismiss and restore lifecycle.
