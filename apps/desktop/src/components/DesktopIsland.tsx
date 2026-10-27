/**
 * AuraDrop Windows Desktop Dynamic Island
 * =========================================
 * Apple AirDrop-style floating Dynamic Island pill & card for Windows.
 * Listens 24/7 to local transfer events and peer discovery.
 * Displays interactive modal popup with Accept/Decline, verification SAS,
 * live transfer speed and progress.
 */
import React, { useCallback, useEffect, useReducer, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import type { PeerDevice, TransferProgressPayload } from '../types';

type IslandPhase =
  | 'idle'
  | 'discovering'
  | 'waiting_approval'
  | 'transferring'
  | 'completed'
  | 'failed'
  | 'message';

interface IslandState {
  phase: IslandPhase;
  expanded: boolean;
  peerCount: number;
  peerName: string;
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
}

type IslandAction =
  | { type: 'PEERS_UPDATED'; peerCount: number; peerName: string }
  | { type: 'TRANSFER_REQUEST'; payload: Partial<TransferProgressPayload> }
  | { type: 'TRANSFER_START'; payload: Partial<TransferProgressPayload> }
  | { type: 'TRANSFER_PROGRESS'; payload: Partial<TransferProgressPayload> }
  | { type: 'TRANSFER_COMPLETE'; payload: Partial<TransferProgressPayload> }
  | { type: 'TRANSFER_FAILED'; payload: Partial<TransferProgressPayload> }
  | { type: 'TRANSFER_CANCELLED' }
  | { type: 'CHAT_MESSAGE'; senderName: string; text: string; peerId: string }
  | { type: 'EXPAND' }
  | { type: 'COLLAPSE' }
  | { type: 'DISMISS' };

const initialState: IslandState = {
  phase: 'idle',
  expanded: false,
  peerCount: 0,
  peerName: '',
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
};

function islandReducer(state: IslandState, action: IslandAction): IslandState {
  switch (action.type) {
    case 'PEERS_UPDATED': {
      if (['transferring', 'waiting_approval'].includes(state.phase)) {
        return { ...state, peerCount: action.peerCount, peerName: action.peerName || state.peerName };
      }
      const phase: IslandPhase = action.peerCount > 0 ? 'discovering' : 'idle';
      return {
        ...state,
        phase,
        peerCount: action.peerCount,
        peerName: action.peerName,
      };
    }

    case 'TRANSFER_REQUEST': {
      const p = action.payload;
      return {
        ...state,
        phase: 'waiting_approval',
        expanded: true,
        transferId: p.transferId || state.transferId,
        fileName: p.fileName || state.fileName || 'Incoming File',
        filePath: p.filePath || '',
        fileSizeBytes: p.fileSize ?? p.totalBytes ?? state.fileSizeBytes,
        transferredBytes: 0,
        speedBytesPerSec: 0,
        etaSeconds: 0,
        isIncoming: true,
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
        transferredBytes: transferred,
        fileSizeBytes: total > 0 ? total : state.fileSizeBytes,
        speedBytesPerSec: speed,
        etaSeconds: p.etaSeconds || state.etaSeconds,
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

    default:
      return state;
  }
}

function fmtBytes(b: number) {
  if (b <= 0) return '0 B';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function fmtSpeed(bps: number) {
  if (bps <= 0) return '0 B/s';
  if (bps < 1024) return `${bps.toFixed(0)} B/s`;
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
  return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
}

function fmtEta(sec: number) {
  if (sec <= 0) return '';
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  return `${Math.floor(sec / 3600)}h`;
}

// ── Inject global keyframes ───────────────────────────────────────────────────
if (typeof document !== 'undefined' && !document.getElementById('__ai_island_styles__')) {
  const s = document.createElement('style');
  s.id = '__ai_island_styles__';
  s.textContent = `
    @keyframes island-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.85)} }
    @keyframes island-glow { 0%,100%{box-shadow:0 0 15px rgba(59,130,246,0.3)} 50%{box-shadow:0 0 30px rgba(59,130,246,0.7)} }
    @keyframes island-spin { to{transform:rotate(360deg)} }
    @media(prefers-reduced-motion:reduce){*{animation-duration:.01ms!important;transition-duration:.01ms!important}}
  `;
  document.head.appendChild(s);
}

// ── DesktopIsland Component ───────────────────────────────────────────────────
export const DesktopIsland: React.FC<{
  onOpenMain: () => void;
  onOpenChat?: (peerId: string) => void;
}> = ({ onOpenMain, onOpenChat }) => {
  const [state, dispatch] = useReducer(islandReducer, initialState);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const scheduleCollapse = useCallback((ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => dispatch({ type: 'DISMISS' }), ms);
  }, []);

  useEffect(() => {
    if (state.phase === 'completed') scheduleCollapse(7000);
    if (state.phase === 'failed') scheduleCollapse(9000);
    if (state.phase === 'message') scheduleCollapse(6000);
  }, [state.phase, scheduleCollapse]);

  useEffect(() => {
    // 1. Initial peers probe
    invoke<PeerDevice[]>('get_nearby_peers')
      .then((peers) => {
        if (peers && peers.length > 0) {
          dispatch({ type: 'PEERS_UPDATED', peerCount: peers.length, peerName: peers[0]?.name ?? '' });
        }
      })
      .catch(() => {});

    const ul: Promise<() => void>[] = [];

    // 2. Peer updates listener
    ul.push(
      listen<PeerDevice[]>('peers-updated', (e) => {
        const peers = e.payload || [];
        dispatch({
          type: 'PEERS_UPDATED',
          peerCount: peers.length,
          peerName: peers[0]?.name ?? '',
        });
      })
    );

    // 3. Real-time transfer progress listener
    ul.push(
      listen<TransferProgressPayload>('transfer-progress', (e) => {
        const p = e.payload;
        if (!p) return;

        const transferred = p.bytesTransferred ?? p.transferredBytes ?? 0;
        const total = p.fileSize ?? p.totalBytes ?? 0;
        const speed = p.speedBytesPerSec ?? (p.speedMbps ? Math.round(p.speedMbps * 1024 * 1024) : 0);
        const isInc = p.isIncoming ?? false;

        const normalized: Partial<TransferProgressPayload> = {
          ...p,
          bytesTransferred: transferred,
          fileSize: total,
          speedBytesPerSec: speed,
          isIncoming: isInc,
        };

        if (p.status === 'awaiting_verification') {
          dispatch({ type: 'TRANSFER_REQUEST', payload: normalized });
        } else if (p.status === 'transferring' || p.status === 'sending' || p.status === 'receiving') {
          if (transferred === 0) {
            dispatch({ type: 'TRANSFER_START', payload: normalized });
          } else {
            dispatch({ type: 'TRANSFER_PROGRESS', payload: normalized });
          }
        } else if (p.status === 'completed') {
          dispatch({ type: 'TRANSFER_COMPLETE', payload: normalized });
        } else if (p.status === 'failed') {
          dispatch({ type: 'TRANSFER_FAILED', payload: normalized });
        } else if (p.status === 'cancelled' || p.status === 'canceled') {
          dispatch({ type: 'TRANSFER_CANCELLED' });
        }
      })
    );

    // 4. Also listen for explicit incoming share request events
    ul.push(
      listen<any>('incoming-share', (e) => {
        const p = e.payload;
        if (p) {
          dispatch({
            type: 'TRANSFER_REQUEST',
            payload: {
              transferId: p.transferId || p.requestId || '',
              fileName: p.fileName || p.firstFileName || 'Incoming File',
              fileSize: p.fileSize || p.totalBytes || 0,
              peerName: p.senderName || p.peerName || 'Nearby Device',
              sasCode: p.sasCode || '',
              isIncoming: true,
            },
          });
        }
      })
    );

    // 5. Real-time chat message listener
    ul.push(
      listen<any>('chat-message-received', (e) => {
        const p = e.payload;
        if (p && !p.isOutgoing) {
          dispatch({
            type: 'CHAT_MESSAGE',
            senderName: p.senderName || p.peerName || 'Nearby Peer',
            text: p.text || '',
            peerId: p.peerId || p.senderId || '',
          });
        }
      })
    );

    return () => {
      ul.forEach((p) => p.then((f) => f()));
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  // Accept incoming transfer
  const handleAccept = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await invoke('confirm_transfer_verification', {
        transferId: state.transferId,
        confirmed: true,
      });
    } catch (err) {
      console.error('Accept transfer error:', err);
    }
  };

  // Decline incoming transfer
  const handleDecline = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await invoke('confirm_transfer_verification', {
        transferId: state.transferId,
        confirmed: false,
      });
      await invoke('cancel_transfer', { transferId: state.transferId });
    } catch (_) {}
    dispatch({ type: 'DISMISS' });
  };

  // Open file or folder
  const handleOpenFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    invoke('open_file', { fileName: state.filePath || state.fileName }).catch(() => {
      invoke('open_downloads_folder').catch(console.error);
    });
  };

  const handleOpenFolder = (e: React.MouseEvent) => {
    e.stopPropagation();
    invoke('open_downloads_folder').catch(console.error);
  };

  const pct =
    state.fileSizeBytes > 0
      ? Math.min(100, Math.round((state.transferredBytes / state.fileSizeBytes) * 100))
      : 0;

  const pillLabel = (() => {
    switch (state.phase) {
      case 'idle':
        return 'AuraDrop';
      case 'discovering':
        return state.peerCount === 1 ? state.peerName || '1 Device' : `${state.peerCount} nearby`;
      case 'waiting_approval':
        return `AirDrop: ${state.peerName}`;
      case 'transferring':
        return `${state.isIncoming ? '⬇' : '⬆'} ${pct}% · ${fmtSpeed(state.speedBytesPerSec)}`;
      case 'completed':
        return '✓ Transfer Complete';
      case 'failed':
        return '✕ Transfer Failed';
      case 'message':
        return `💬 ${state.chatSender}: ${state.chatText.slice(0, 18)}${state.chatText.length > 18 ? '…' : ''}`;
      default:
        return 'AuraDrop';
    }
  })();

  const accentColor = () => {
    switch (state.phase) {
      case 'waiting_approval':
      case 'message':
        return '#38BDF8';
      case 'transferring':
        return '#60A5FA';
      case 'completed':
        return '#4ADE80';
      case 'failed':
        return '#F87171';
      case 'discovering':
        return '#A78BFA';
      default:
        return '#6B7280';
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="AuraDrop Dynamic Island status"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Escape') dispatch({ type: 'COLLAPSE' });
        if (e.key === 'Enter') state.expanded ? onOpenMain() : dispatch({ type: 'EXPAND' });
      }}
      onClick={() => dispatch(state.expanded ? { type: 'COLLAPSE' } : { type: 'EXPAND' })}
      style={{
        position: 'fixed',
        top: 14,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 99999,
        background: 'rgba(10, 10, 12, 0.94)',
        backdropFilter: 'blur(28px)',
        border:
          state.phase === 'waiting_approval'
            ? '1.5px solid rgba(56, 189, 248, 0.7)'
            : '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: state.expanded ? 24 : 100,
        boxShadow:
          state.phase === 'waiting_approval'
            ? '0 12px 48px rgba(0,0,0,0.85), 0 0 24px rgba(56,189,248,0.3)'
            : '0 12px 40px rgba(0,0,0,0.75), 0 0 0 .5px rgba(255,255,255,0.06)',
        cursor: 'pointer',
        userSelect: 'none',
        outline: 'none',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: '#fff',
        fontSize: 13,
        width: state.expanded ? 340 : 'auto',
        minWidth: state.expanded ? 300 : 110,
        maxWidth: 380,
        transition:
          'border-radius .38s cubic-bezier(.34,1.56,.64,1), width .38s cubic-bezier(.34,1.56,.64,1), box-shadow .38s ease',
      }}
    >
      {/* ── Collapsed Dynamic Pill ── */}
      {!state.expanded && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 14px' }}>
          {/* Pulsing Aura Ring */}
          <svg width={15} height={15} viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="3" fill={accentColor()} />
            <circle cx="12" cy="12" r="6" stroke={accentColor()} strokeWidth="1.6" fill="none" opacity=".6" />
            <circle cx="12" cy="12" r="10" stroke={accentColor()} strokeWidth="1.1" fill="none" opacity=".3" />
          </svg>

          <span style={{ fontSize: 12, fontWeight: 600, color: '#F3F4F6', whiteSpace: 'nowrap' }}>
            {pillLabel}
          </span>

          {state.phase === 'waiting_approval' && (
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: '#38BDF8',
                animation: 'island-pulse 1.2s infinite ease-in-out',
              }}
            />
          )}

          {state.phase === 'transferring' && (
            <svg width={18} height={18} viewBox="0 0 18 18" style={{ flexShrink: 0 }}>
              <circle cx="9" cy="9" r="7" fill="none" stroke="#262626" strokeWidth={2.2} />
              <circle
                cx="9"
                cy="9"
                r="7"
                fill="none"
                stroke="#60A5FA"
                strokeWidth={2.2}
                strokeDasharray={`${(pct / 100) * 44} 44`}
                strokeLinecap="round"
                transform="rotate(-90 9 9)"
              />
            </svg>
          )}

          {state.phase === 'discovering' && (
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#A78BFA',
                animation: 'island-pulse 1.5s ease-in-out infinite',
              }}
            />
          )}
        </div>
      )}

      {/* ── Expanded AirDrop Card ── */}
      {state.expanded && (
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Header Row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width={20} height={20} viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle cx="12" cy="12" r="3" fill={accentColor()} />
                <circle cx="12" cy="12" r="6" stroke={accentColor()} strokeWidth="1.6" fill="none" opacity=".7" />
                <circle cx="12" cy="12" r="10" stroke={accentColor()} strokeWidth="1.1" fill="none" opacity=".4" />
              </svg>
              <div>
                <span style={{ fontWeight: 700, fontSize: 13, color: accentColor() }}>
                  {state.phase === 'waiting_approval'
                    ? 'AirDrop Request'
                    : state.phase === 'transferring'
                    ? state.isIncoming
                      ? 'Receiving Files'
                      : 'Sending Files'
                    : state.phase === 'completed'
                    ? 'Transfer Complete'
                    : state.phase === 'failed'
                    ? 'Transfer Failed'
                    : state.phase === 'discovering'
                    ? `${state.peerCount} Devices Nearby`
                    : 'AuraDrop'}
                </span>
                <span style={{ marginLeft: 6, fontSize: 11, color: '#9CA3AF' }}>
                  {state.peerName ? `· ${state.peerName}` : ''}
                </span>
              </div>
            </div>

            <button
              aria-label="Open main app"
              onClick={(e) => {
                e.stopPropagation();
                onOpenMain();
              }}
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 8,
                color: '#E5E7EB',
                cursor: 'pointer',
                fontSize: 12,
                padding: '4px 8px',
                fontWeight: 600,
              }}
            >
              Open ↗
            </button>
          </div>

          {/* Phase 1: Incoming AirDrop Request Popup (Accept / Decline) */}
          {state.phase === 'waiting_approval' && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                padding: '10px 12px',
                background: 'rgba(255,255,255,0.04)',
                borderRadius: 14,
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <div style={{ fontSize: 12, color: '#E5E7EB', fontWeight: 500 }}>
                <span style={{ fontWeight: 700, color: '#fff' }}>{state.peerName}</span> wants to share:
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: '#fff',
                  fontWeight: 600,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {state.fileName}
              </div>
              <div style={{ fontSize: 11, color: '#9CA3AF' }}>
                {fmtBytes(state.fileSizeBytes)} • Direct Wi-Fi P2P
              </div>

              {state.sasCode && (
                <div
                  style={{
                    fontSize: 12,
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    letterSpacing: 2,
                    color: '#38BDF8',
                    background: 'rgba(56, 189, 248, 0.1)',
                    padding: '4px 8px',
                    borderRadius: 6,
                    textAlign: 'center',
                  }}
                >
                  Verify: {state.sasCode}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button
                  onClick={handleDecline}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 10,
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    color: '#D1D5DB',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Decline
                </button>
                <button
                  onClick={handleAccept}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 10,
                    background: '#2563EB',
                    border: 'none',
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(37,99,235,0.4)',
                  }}
                >
                  Accept
                </button>
              </div>
            </div>
          )}

          {/* Phase 2: Live Transfer Progress */}
          {state.phase === 'transferring' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div
                style={{
                  fontSize: 12,
                  color: '#E5E7EB',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontWeight: 600,
                }}
                title={state.fileName}
              >
                {state.fileName || 'Transferring...'}
              </div>

              {/* Progress Track */}
              <div style={{ height: 5, background: '#1F2937', borderRadius: 100, overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${pct}%`,
                    background: 'linear-gradient(90deg, #3B82F6, #60A5FA)',
                    borderRadius: 100,
                    transition: 'width .35s ease',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9CA3AF' }}>
                <span>
                  {fmtBytes(state.transferredBytes)} / {fmtBytes(state.fileSizeBytes)} ({pct}%)
                </span>
                <span>{fmtSpeed(state.speedBytesPerSec)}</span>
                {state.etaSeconds > 0 && <span>ETA {fmtEta(state.etaSeconds)}</span>}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 2 }}>
                <button
                  onClick={handleDecline}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 6,
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.12)',
                    color: '#9CA3AF',
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Phase 3: Completed */}
          {state.phase === 'completed' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12, color: '#4ADE80', fontWeight: 600 }}>
                ✓ {state.fileName} ({fmtBytes(state.fileSizeBytes)})
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={handleOpenFile}
                  style={{
                    flex: 1,
                    padding: '7px 10px',
                    borderRadius: 8,
                    background: '#fff',
                    border: 'none',
                    color: '#000',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Open File
                </button>
                <button
                  onClick={handleOpenFolder}
                  style={{
                    flex: 1,
                    padding: '7px 10px',
                    borderRadius: 8,
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Open Folder
                </button>
              </div>
            </div>
          )}

          {/* Phase 4: Failed */}
          {state.phase === 'failed' && (
            <div style={{ fontSize: 12, color: '#F87171', fontWeight: 500 }}>
              {state.errorMessage || 'Transfer was interrupted or failed'}
            </div>
          )}

          {/* Phase: Chat Message Alert */}
          {state.phase === 'message' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, color: '#38BDF8', fontWeight: 700 }}>💬 {state.chatSender}</span>
                <span style={{ fontSize: 11, color: '#9CA3AF' }}>just now</span>
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: '#F3F4F6',
                  background: 'rgba(255, 255, 255, 0.06)',
                  padding: '8px 10px',
                  borderRadius: 10,
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  wordBreak: 'break-word',
                  lineHeight: 1.4,
                }}
              >
                {state.chatText}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onOpenChat && state.chatPeerId) {
                      onOpenChat(state.chatPeerId);
                    } else {
                      onOpenMain();
                    }
                    dispatch({ type: 'DISMISS' });
                  }}
                  style={{
                    flex: 1,
                    padding: '7px 12px',
                    borderRadius: 8,
                    background: '#38BDF8',
                    border: 'none',
                    color: '#000',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Reply in Chat
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    dispatch({ type: 'DISMISS' });
                  }}
                  style={{
                    padding: '7px 12px',
                    borderRadius: 8,
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    color: '#9CA3AF',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Phase 5: Nearby Devices Discovery */}
          {state.phase === 'discovering' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 12, color: '#D1D5DB' }}>
                {state.peerCount === 1
                  ? `${state.peerName} is ready to connect`
                  : `${state.peerCount} devices discovered nearby`}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenMain();
                }}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  background: 'rgba(167, 139, 250, 0.15)',
                  border: '1px solid rgba(167, 139, 250, 0.3)',
                  color: '#C4B5FD',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  alignSelf: 'flex-start',
                }}
              >
                Send Files via AirDrop
              </button>
            </div>
          )}

          {/* Phase 6: Idle */}
          {state.phase === 'idle' && (
            <div style={{ fontSize: 11, color: '#6B7280' }}>
              Listening for nearby transfers 24/7…
            </div>
          )}
        </div>
      )}
    </div>
  );
};
export default DesktopIsland;
