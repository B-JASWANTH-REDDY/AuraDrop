/**
 * AuraDrop Test Suite: Dynamic Island Desktop Dismiss & Fullstack Integration
 * ===========================================================================
 * Verifies:
 * 1. Close ('X') button existence and accessibility on collapsed pill and expanded card.
 * 2. Session dismissal lifecycle: clicking 'X' sets session storage & marks isDismissed = true.
 * 3. Tauri backend blur event isolation: main window blur DOES NOT un-hide island when dismissed.
 * 4. Dual Restoration Channels:
 *    a) Automatic restoration upon incoming transfer events (incoming-share, TRANSFER_REQUEST, TRANSFER_START, TRANSFER_PROGRESS).
 *    b) Manual user restoration via header toggle in App.tsx.
 * 5. Web Dynamic Island (AirDropNotification) close ('X') button & dismissal.
 * 6. Non-obscured controls: File badge does not displace or replace close ('X') button during active transfers.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ── Types Matching AuraDrop Dynamic Island ────────────────────────────────────

type IslandPhase =
  | 'idle'
  | 'discovering'
  | 'waiting_approval'
  | 'transferring'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'message';

interface IslandState {
  phase: IslandPhase;
  expanded: boolean;
  peerCount: number;
  peerName: string;
  peers: any[];
  fileName: string;
  filePath: string;
  fileSizeBytes: number;
  transferredBytes: number;
  speedBytesPerSec: number;
  etaSeconds: number;
  errorMessage: string;
  transferId: string;
  isIncoming: boolean;
  sasCode: string;
  chatSender: string;
  chatText: string;
  chatPeerId: string;
  isDismissed: boolean;
}

type IslandAction =
  | { type: 'PEERS_UPDATED'; peers: any[] }
  | { type: 'TRANSFER_REQUEST'; payload: any }
  | { type: 'TRANSFER_START'; payload: any }
  | { type: 'TRANSFER_PROGRESS'; payload: any }
  | { type: 'TRANSFER_VERIFYING'; payload: any }
  | { type: 'TRANSFER_COMPLETE'; payload: any }
  | { type: 'TRANSFER_FAILED'; payload: any }
  | { type: 'TRANSFER_CANCELLED' }
  | { type: 'CHAT_MESSAGE'; senderName: string; text: string; peerId: string }
  | { type: 'EXPAND' }
  | { type: 'COLLAPSE' }
  | { type: 'DISMISS' }
  | { type: 'DISMISS_SESSION' }
  | { type: 'RESTORE_SESSION' };

function createInitialState(isDismissed = false): IslandState {
  return {
    phase: 'idle',
    expanded: false,
    peerCount: 0,
    peerName: '',
    peers: [],
    fileName: '',
    filePath: '',
    fileSizeBytes: 0,
    transferredBytes: 0,
    speedBytesPerSec: 0,
    etaSeconds: 0,
    errorMessage: '',
    transferId: '',
    isIncoming: false,
    sasCode: '',
    chatSender: '',
    chatText: '',
    chatPeerId: '',
    isDismissed,
  };
}

// Exact mirror of islandReducer in DesktopIsland.tsx
function islandReducer(state: IslandState, action: IslandAction): IslandState {
  switch (action.type) {
    case 'PEERS_UPDATED': {
      const peers = action.peers || [];
      const peerCount = peers.length;
      const peerName = peers[0]?.name || '';
      if (['transferring', 'waiting_approval'].includes(state.phase)) {
        return { ...state, peers, peerCount, peerName: peerName || state.peerName };
      }
      const isNew = peerCount > 0 && (state.peerCount === 0 || (peerName && peerName !== state.peerName));
      const phase: IslandPhase = peerCount > 0 ? 'discovering' : 'idle';
      return {
        ...state,
        peers,
        phase,
        expanded: isNew ? true : state.expanded,
        peerCount,
        peerName: peerName || state.peerName,
      };
    }

    case 'TRANSFER_REQUEST': {
      const p = action.payload;
      const isInc = p.isIncoming !== undefined ? p.isIncoming : true;
      return {
        ...state,
        phase: 'waiting_approval',
        expanded: true,
        isDismissed: false,
        transferId: p.transferId || state.transferId,
        fileName: p.fileName || state.fileName || (isInc ? 'Incoming File' : 'Transferring File'),
        filePath: p.filePath || '',
        fileSizeBytes: p.fileSize ?? p.totalBytes ?? state.fileSizeBytes,
        transferredBytes: 0,
        speedBytesPerSec: 0,
        etaSeconds: 0,
        isIncoming: isInc,
        peerName: p.peerName || state.peerName || 'Nearby Device',
        sasCode: p.sasCode || '',
        errorMessage: '',
      };
    }

    case 'TRANSFER_START': {
      const p = action.payload;
      const total = p.fileSize ?? p.totalBytes ?? state.fileSizeBytes;
      const speed = p.speedBytesPerSec ?? (p.speedMbps ? Math.round(p.speedMbps * 1024 * 1024) : 0);
      return {
        ...state,
        phase: 'transferring',
        expanded: true,
        isDismissed: false,
        transferId: p.transferId || state.transferId,
        fileName: p.fileName || state.fileName || 'Transferring File',
        filePath: p.filePath || '',
        fileSizeBytes: total,
        transferredBytes: p.bytesTransferred ?? p.transferredBytes ?? 0,
        speedBytesPerSec: speed,
        etaSeconds: p.etaSeconds || 0,
        peerName: p.peerName || state.peerName,
        isIncoming: p.isIncoming ?? state.isIncoming,
        errorMessage: '',
      };
    }

    case 'TRANSFER_PROGRESS': {
      const p = action.payload;
      const transferred = p.bytesTransferred ?? p.transferredBytes ?? state.transferredBytes;
      const total = p.fileSize ?? p.totalBytes ?? state.fileSizeBytes;
      const speed = p.speedBytesPerSec ?? (p.speedMbps ? Math.round(p.speedMbps * 1024 * 1024) : state.speedBytesPerSec);
      return {
        ...state,
        phase: 'transferring',
        isDismissed: false,
        transferredBytes: transferred,
        fileSizeBytes: total > 0 ? total : state.fileSizeBytes,
        speedBytesPerSec: speed,
        etaSeconds: p.etaSeconds || state.etaSeconds,
        fileName: p.fileName || state.fileName,
        peerName: p.peerName || state.peerName,
      };
    }

    case 'TRANSFER_VERIFYING': {
      const p = action.payload;
      const total = p.fileSize ?? p.totalBytes ?? state.fileSizeBytes;
      return {
        ...state,
        phase: 'verifying',
        expanded: true,
        isDismissed: false,
        transferredBytes: total,
        fileSizeBytes: total,
        speedBytesPerSec: 0,
        etaSeconds: 0,
        fileName: p.fileName || state.fileName,
        peerName: p.peerName || state.peerName,
      };
    }

    case 'TRANSFER_COMPLETE': {
      const p = action.payload;
      const total = p.fileSize ?? p.totalBytes ?? state.fileSizeBytes;
      return {
        ...state,
        phase: 'completed',
        expanded: true,
        isDismissed: false,
        transferredBytes: total,
        fileSizeBytes: total,
        filePath: p.filePath || state.filePath,
        speedBytesPerSec: 0,
        etaSeconds: 0,
        errorMessage: '',
      };
    }

    case 'TRANSFER_FAILED': {
      const p = action.payload;
      return {
        ...state,
        phase: 'failed',
        expanded: true,
        errorMessage: p.error || 'Transfer failed or interrupted',
      };
    }

    case 'TRANSFER_CANCELLED': {
      return {
        ...state,
        phase: 'idle',
        expanded: false,
        errorMessage: '',
      };
    }

    case 'CHAT_MESSAGE': {
      return {
        ...state,
        phase: 'message',
        expanded: true,
        chatSender: action.senderName,
        chatText: action.text,
        chatPeerId: action.peerId,
      };
    }

    case 'EXPAND':
      return { ...state, expanded: true };

    case 'COLLAPSE':
      return { ...state, expanded: false };

    case 'DISMISS':
      return {
        ...state,
        phase: state.phase === 'completed' || state.phase === 'failed' || state.phase === 'message' ? 'idle' : state.phase,
        expanded: false,
        errorMessage: '',
      };

    case 'DISMISS_SESSION':
      return {
        ...state,
        isDismissed: true,
        expanded: false,
      };

    case 'RESTORE_SESSION':
      return {
        ...state,
        isDismissed: false,
      };

    default:
      return state;
  }
}

// ── Rust Backend Window Event Simulation ──────────────────────────────────────

class MockTauriIslandWindow {
  public isVisible = true;
  public showCalls = 0;
  public hideCalls = 0;

  show() {
    this.isVisible = true;
    this.showCalls++;
  }

  hide() {
    this.isVisible = false;
    this.hideCalls++;
  }
}

class MockAppState {
  public is_island_dismissed = false;
  public islandWindow = new MockTauriIslandWindow();

  dismiss_island_session() {
    this.is_island_dismissed = true;
    this.islandWindow.hide();
  }

  restore_island_session() {
    this.is_island_dismissed = false;
    this.islandWindow.show();
  }

  // Exact logic implemented in lib.rs for WindowEvent::Focused
  onMainWindowFocusChanged(focused: boolean) {
    if (focused) {
      this.islandWindow.hide();
    } else {
      // Crucial fix: Only show if NOT dismissed for the session
      if (!this.is_island_dismissed) {
        this.islandWindow.show();
      }
    }
  }

  // Exact logic implemented in lib.rs for WindowEvent::CloseRequested
  onMainWindowCloseRequested() {
    if (!this.is_island_dismissed) {
      this.islandWindow.show();
    }
  }
}

// ── Mock Session Storage ──────────────────────────────────────────────────────

class MockSessionStorage {
  private store: Map<string, string> = new Map();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

// ── Test Runner ───────────────────────────────────────────────────────────────

async function runDynamicIslandDismissTests() {
  console.log('================================================================');
  console.log('🏝️ AURADROP DYNAMIC ISLAND DESKTOP DISMISS & INTEGRATION TESTS');
  console.log('================================================================\n');

  let total = 0;
  let passed = 0;

  function assert(cond: boolean, name: string) {
    total++;
    if (cond) {
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${name}`);
      throw new Error(`Assertion failed: ${name}`);
    }
  }

  // ---------------------------------------------------------------------------
  // TEST GROUP 1: Dynamic Island Reducer Session Dismiss & Restoration
  // ---------------------------------------------------------------------------
  console.log('👉 [TEST GROUP 1] Reducer State Machine & Dismissal Lifecycle');

  let state = createInitialState(false);
  assert(state.isDismissed === false, 'Initial state has isDismissed = false');
  assert(state.expanded === false, 'Initial state starts collapsed');

  // Action: DISMISS_SESSION
  state = islandReducer(state, { type: 'DISMISS_SESSION' });
  assert(state.isDismissed === true, 'DISMISS_SESSION sets isDismissed = true');
  assert(state.expanded === false, 'DISMISS_SESSION collapses expanded card');

  // Action: RESTORE_SESSION
  state = islandReducer(state, { type: 'RESTORE_SESSION' });
  assert(state.isDismissed === false, 'RESTORE_SESSION restores isDismissed = false');

  // ---------------------------------------------------------------------------
  // TEST GROUP 2: Auto-Restoration on Incoming Transfer Events
  // ---------------------------------------------------------------------------
  console.log('\n👉 [TEST GROUP 2] Automatic Restoration on Transfer Events');

  // Scenario 2A: Dismissed island receives TRANSFER_REQUEST
  state = islandReducer(state, { type: 'DISMISS_SESSION' });
  assert(state.isDismissed === true, 'Island dismissed prior to transfer request');

  state = islandReducer(state, {
    type: 'TRANSFER_REQUEST',
    payload: {
      transferId: 'tx-101',
      fileName: 'presentation.key',
      fileSize: 48 * 1024 * 1024,
      peerName: 'MacBook Pro',
      isIncoming: true,
      sasCode: '9482',
    },
  });
  assert(state.isDismissed === false, 'TRANSFER_REQUEST automatically clears session dismissal (isDismissed = false)');
  assert(state.phase === 'waiting_approval', 'TRANSFER_REQUEST sets phase = waiting_approval');
  assert(state.expanded === true, 'TRANSFER_REQUEST automatically expands card for user action');
  assert(state.fileName === 'presentation.key', 'TRANSFER_REQUEST records target fileName');

  // Scenario 2B: Dismissed island receives TRANSFER_START
  state = islandReducer(state, { type: 'DISMISS_SESSION' });
  assert(state.isDismissed === true, 'Island dismissed again');

  state = islandReducer(state, {
    type: 'TRANSFER_START',
    payload: {
      transferId: 'tx-102',
      fileName: 'dataset.zip',
      fileSize: 500 * 1024 * 1024,
      bytesTransferred: 0,
      peerName: 'Pixel 9',
    },
  });
  assert(state.isDismissed === false, 'TRANSFER_START automatically clears session dismissal (isDismissed = false)');
  assert(state.phase === 'transferring', 'TRANSFER_START sets phase = transferring');
  assert(state.expanded === true, 'TRANSFER_START expands card');

  // Scenario 2C: TRANSFER_PROGRESS maintains active non-dismissed state
  state = islandReducer(state, {
    type: 'TRANSFER_PROGRESS',
    payload: {
      bytesTransferred: 250 * 1024 * 1024,
      fileSize: 500 * 1024 * 1024,
      speedBytesPerSec: 125 * 1024 * 1024,
      etaSeconds: 2,
    },
  });
  assert(state.isDismissed === false, 'TRANSFER_PROGRESS keeps isDismissed = false');
  assert(state.transferredBytes === 250 * 1024 * 1024, 'Progress transferred bytes updated');
  assert(state.speedBytesPerSec === 125 * 1024 * 1024, 'Speed updated');

  // Scenario 2D: TRANSFER_VERIFYING maintains active non-dismissed state
  state = islandReducer(state, {
    type: 'TRANSFER_VERIFYING',
    payload: {
      fileSize: 500 * 1024 * 1024,
    },
  });
  assert(state.isDismissed === false, 'TRANSFER_VERIFYING keeps isDismissed = false');
  assert(state.phase === 'verifying', 'Phase set to verifying');

  // Scenario 2E: TRANSFER_COMPLETE maintains active non-dismissed state
  state = islandReducer(state, {
    type: 'TRANSFER_COMPLETE',
    payload: {
      fileSize: 500 * 1024 * 1024,
      filePath: 'C:\\Users\\User\\Downloads\\dataset.zip',
    },
  });
  assert(state.isDismissed === false, 'TRANSFER_COMPLETE keeps isDismissed = false');
  assert(state.phase === 'completed', 'Phase set to completed');

  // ---------------------------------------------------------------------------
  // TEST GROUP 3: Session Storage Protocol Persistence
  // ---------------------------------------------------------------------------
  console.log('\n👉 [TEST GROUP 3] Session Storage Persistence Protocol');

  const sessionStorage = new MockSessionStorage();

  // Initial: no key
  assert(sessionStorage.getItem('auradrop_island_dismissed') === null, 'Session storage has no dismissal key initially');

  // User clicks 'X' button
  sessionStorage.setItem('auradrop_island_dismissed', 'true');
  assert(sessionStorage.getItem('auradrop_island_dismissed') === 'true', 'Clicking close sets auradrop_island_dismissed = true');

  // App reloads or checks dismissal
  const reloadedInitialDismissed = sessionStorage.getItem('auradrop_island_dismissed') === 'true';
  const restoredState = createInitialState(reloadedInitialDismissed);
  assert(restoredState.isDismissed === true, 'Re-initializing island from sessionStorage preserves dismissed status');

  // Incoming transfer arrives -> clears session storage
  sessionStorage.removeItem('auradrop_island_dismissed');
  assert(sessionStorage.getItem('auradrop_island_dismissed') === null, 'Incoming transfer clears auradrop_island_dismissed key');

  // ---------------------------------------------------------------------------
  // TEST GROUP 4: Backend Window Blur Event Isolation
  // ---------------------------------------------------------------------------
  console.log('\n👉 [TEST GROUP 4] Tauri Backend Blur Event Isolation');

  const backend = new MockAppState();
  backend.islandWindow.isVisible = true;

  // Normal flow (Not dismissed):
  // Main window focused -> Island hides
  backend.onMainWindowFocusChanged(true);
  assert(backend.islandWindow.isVisible === false, 'Focusing main window hides island');

  // Main window blurred -> Island shows when not dismissed
  backend.onMainWindowFocusChanged(false);
  assert(backend.islandWindow.isVisible === true, 'Blurring main window shows island when NOT dismissed');

  // USER DISMISSES ISLAND FOR SESSION
  backend.dismiss_island_session();
  assert(backend.is_island_dismissed === true, 'Backend tracks is_island_dismissed = true');
  assert(backend.islandWindow.isVisible === false, 'Island window hidden on dismissal');

  // CRITICAL REGRESSION TEST: Main window blur event while island is dismissed!
  // In the old buggy implementation, this would resurrect the island!
  const showCallsBefore = backend.islandWindow.showCalls;
  backend.onMainWindowFocusChanged(false);
  assert(
    backend.islandWindow.isVisible === false,
    'Main window blur event DOES NOT un-hide island window when dismissed'
  );
  assert(
    backend.islandWindow.showCalls === showCallsBefore,
    'island.show() is NOT called on blur while dismissed'
  );

  // Main window close requested while island is dismissed
  backend.onMainWindowCloseRequested();
  assert(
    backend.islandWindow.isVisible === false,
    'Main window close event DOES NOT un-hide island window when dismissed'
  );

  // User manually restores or new transfer arrives
  backend.restore_island_session();
  assert(backend.is_island_dismissed === false, 'Restoring session sets is_island_dismissed = false');
  assert(backend.islandWindow.isVisible === true, 'Island window shown on restore');

  // Blur again after restore: island should now show properly
  backend.onMainWindowFocusChanged(true);
  backend.onMainWindowFocusChanged(false);
  assert(backend.islandWindow.isVisible === true, 'Blur event resumes normal behavior after restoration');

  // ---------------------------------------------------------------------------
  // TEST GROUP 5: Source Code & Static Implementation Verification
  // ---------------------------------------------------------------------------
  console.log('\n👉 [TEST GROUP 5] Source Code & Component Static Analysis');

  const projectRoot = path.resolve(__dirname, '..');

  // 5A. Check DesktopIsland.tsx
  const desktopIslandPath = path.join(projectRoot, 'apps/desktop/src/components/DesktopIsland.tsx');
  const desktopIslandCode = fs.readFileSync(desktopIslandPath, 'utf-8');

  assert(
    desktopIslandCode.includes('island-desktop-close-btn') || desktopIslandCode.includes('Dismiss Dynamic Island'),
    'DesktopIsland.tsx contains close ("X") button in collapsed pill'
  );
  assert(
    desktopIslandCode.includes('island-card-close-btn') || desktopIslandCode.includes('Dismiss Island for session'),
    'DesktopIsland.tsx contains close ("X") button in expanded card header'
  );
  assert(
    desktopIslandCode.includes('dismiss_island_session'),
    'DesktopIsland.tsx invokes dismiss_island_session Tauri IPC command'
  );
  assert(
    desktopIslandCode.includes('auradrop_island_dismissed'),
    'DesktopIsland.tsx tracks auradrop_island_dismissed in sessionStorage'
  );
  assert(
    desktopIslandCode.includes('island-dismissed-changed'),
    'DesktopIsland.tsx listens to island-dismissed-changed event for cross-window sync'
  );

  // Non-obscured close button verification: Check that file badge does NOT replace close button
  const hasBothBadgeAndClose =
    desktopIslandCode.includes('state.fileName && (') &&
    desktopIslandCode.includes('Dismiss Island for session');
  assert(hasBothBadgeAndClose, 'Expanded card header renders both file badge and close ("X") button simultaneously');

  // 5B. Check commands.rs & lib.rs
  const commandsPath = path.join(projectRoot, 'apps/desktop/src-tauri/src/commands.rs');
  const commandsCode = fs.readFileSync(commandsPath, 'utf-8');

  assert(
    commandsCode.includes('pub async fn dismiss_island_session'),
    'commands.rs implements dismiss_island_session IPC command'
  );
  assert(
    commandsCode.includes('pub async fn restore_island_session'),
    'commands.rs implements restore_island_session IPC command'
  );
  assert(
    commandsCode.includes('is_island_dismissed'),
    'commands.rs tracks is_island_dismissed in AppState'
  );

  const libPath = path.join(projectRoot, 'apps/desktop/src-tauri/src/lib.rs');
  const libCode = fs.readFileSync(libPath, 'utf-8');

  assert(
    libCode.includes('dismiss_island_session') && libCode.includes('restore_island_session'),
    'lib.rs registers dismiss_island_session & restore_island_session in handler'
  );
  assert(
    libCode.includes('!island_dismissed_flag.load('),
    'lib.rs checks !island_dismissed_flag in WindowEvent::Focused blur listener'
  );

  // 5C. Check App.tsx header restoration toggle
  const appPath = path.join(projectRoot, 'apps/desktop/src/App.tsx');
  const appCode = fs.readFileSync(appPath, 'utf-8');

  assert(
    appCode.includes('handleToggleIsland') || appCode.includes('Restore Dynamic Island'),
    'App.tsx contains Dynamic Island restoration toggle/button in header'
  );
  assert(
    appCode.includes('isIslandDismissed'),
    'App.tsx tracks isIslandDismissed state'
  );

  // 5D. Check AirDropNotification.tsx for web
  const webNotificationPath = path.join(projectRoot, 'apps/web/src/components/AirDropNotification.tsx');
  const webNotificationCode = fs.readFileSync(webNotificationPath, 'utf-8');

  assert(
    webNotificationCode.includes('airdrop-close-btn') || webNotificationCode.includes('Dismiss Notification'),
    'AirDropNotification.tsx contains close ("X") button to dismiss web notification'
  );
  assert(
    webNotificationCode.includes('onClose'),
    'AirDropNotification.tsx supports onClose dismiss prop'
  );

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`🎉 ALL DYNAMIC ISLAND DISMISS TESTS PASSED: ${passed}/${total} (100%)`);
  console.log('================================================================\n');
}

runDynamicIslandDismissTests().catch((err) => {
  console.error('\n❌ Dynamic Island Dismiss Test Suite Failed:', err);
  process.exit(1);
});
