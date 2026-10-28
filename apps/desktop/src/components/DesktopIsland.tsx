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
import logoImg from '../assets/logo.png';

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
  | { type: 'TRANSFER_VERIFYING'; payload: Partial<TransferProgressPayload> }
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
      const isNew = action.peerCount > 0 && (state.peerCount === 0 || (action.peerName && action.peerName !== state.peerName));
      const phase: IslandPhase = action.peerCount > 0 ? 'discovering' : 'idle';
      return {
        ...state,
        phase,
        expanded: isNew ? true : state.expanded,
        peerCount: action.peerCount,
        peerName: action.peerName || state.peerName,
      };
    }

    case 'TRANSFER_REQUEST': {
      const p = action.payload;
      const isInc = p.isIncoming !== undefined ? p.isIncoming : true;
      return {
        ...state,
        phase: 'waiting_approval',
        expanded: true,
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

    case 'TRANSFER_VERIFYING': {
      const p = action.payload;
      const total = p.fileSize ?? p.totalBytes ?? state.fileSizeBytes;
      return {
        ...state,
        phase: 'verifying',
        expanded: true,
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
  isOverlayWindow?: boolean;
}> = ({ onOpenMain, onOpenChat, isOverlayWindow = false }) => {
  const [state, dispatch] = useReducer(islandReducer, initialState);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const scheduleCollapse = useCallback((ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => dispatch({ type: 'DISMISS' }), ms);
  }, []);

  useEffect(() => {
    if (!isOverlayWindow) return;
    const isExpanded =
      state.expanded ||
      state.phase === 'waiting_approval' ||
      state.phase === 'transferring' ||
      state.phase === 'verifying' ||
      state.phase === 'completed' ||
      state.phase === 'message';
    const targetW = isExpanded ? 460 : 280;
    const targetH = isExpanded ? 310 : 52;
    invoke('set_island_size', { width: targetW, height: targetH }).catch(() => {});
  }, [state.phase, state.expanded, isOverlayWindow]);

  useEffect(() => {
    if (state.phase === 'completed') scheduleCollapse(7000);
    if (state.phase === 'failed') scheduleCollapse(9000);
    if (state.phase === 'message') scheduleCollapse(6000);
    if (state.phase === 'discovering' && state.expanded) scheduleCollapse(7000);
  }, [state.phase, state.expanded, scheduleCollapse]);

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

        if (p.status === 'awaiting_verification' || p.status === 'awaiting_approval') {
          dispatch({ type: 'TRANSFER_REQUEST', payload: normalized });
        } else if (p.status === 'verifying') {
          dispatch({ type: 'TRANSFER_VERIFYING', payload: normalized });
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
      dispatch({
        type: 'TRANSFER_START',
        payload: {
          transferId: state.transferId,
          fileName: state.fileName,
          fileSize: state.fileSizeBytes,
          peerName: state.peerName,
          isIncoming: true,
        },
      });
    } catch (err: any) {
      console.error('Accept transfer error:', err);
      dispatch({
        type: 'TRANSFER_FAILED',
        payload: { error: `Failed to accept transfer: ${err?.message || err}` },
      });
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
    } catch (err) {
      console.warn('Decline transfer cleanup error:', err);
    }
    dispatch({ type: 'TRANSFER_CANCELLED' });
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
        return state.isIncoming ? `AirDrop: ${state.peerName}` : `Waiting for ${state.peerName}…`;
      case 'transferring':
        return `${state.isIncoming ? '⬇' : '⬆'} ${pct}% · ${fmtSpeed(state.speedBytesPerSec)}`;
      case 'verifying':
        return '⏳ Verifying SHA-256...';
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
      case 'verifying':
        return '#A855F7';
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
        position: isOverlayWindow ? 'relative' : 'fixed',
        top: isOverlayWindow ? 0 : 14,
        left: isOverlayWindow ? 'auto' : '50%',
        transform: isOverlayWindow ? 'none' : 'translateX(-50%)',
        zIndex: 99999,
        background: '#000000',
        backdropFilter: 'blur(30px)',
        WebkitBackdropFilter: 'blur(30px)',
        border:
          state.phase === 'waiting_approval'
            ? '1.5px solid rgba(0, 122, 255, 0.85)'
            : '1px solid rgba(255, 255, 255, 0.18)',
        borderRadius: state.expanded ? 28 : 100,
        boxShadow: 'none',
        cursor: 'pointer',
        userSelect: 'none',
        outline: 'none',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: '#fff',
        fontSize: 13,
        width: state.expanded ? 420 : 'auto',
        minWidth: state.expanded ? 400 : 110,
        maxWidth: 440,
        transition:
          'border-radius .38s cubic-bezier(.34,1.56,.64,1), width .38s cubic-bezier(.34,1.56,.64,1)',
      }}
    >
      {/* ── Collapsed Dynamic Pill ── */}
      {!state.expanded && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px' }}>
          {/* Official AuraDrop Logo */}
          <img
            src={logoImg}
            alt="AuraDrop"
            style={{ width: 17, height: 17, objectFit: 'contain', flexShrink: 0 }}
          />

          <span style={{ fontSize: 12, fontWeight: 600, color: '#F3F4F6', whiteSpace: 'nowrap' }}>
            {pillLabel}
          </span>

          {state.phase === 'waiting_approval' && (
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: '#007AFF',
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
                stroke="#007AFF"
                strokeWidth={2.2}
                strokeDasharray={`${(pct / 100) * 44} 44`}
                strokeLinecap="round"
                transform="rotate(-90 9 9)"
              />
            </svg>
          )}

          {state.phase === 'verifying' && (
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: '#A855F7',
                animation: 'island-pulse 1s infinite ease-in-out',
              }}
            />
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

      {/* ── Expanded AirDrop Card (Mobile Layout Parity) ── */}
      {state.expanded && (
        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Top Row: Icon/Avatar + Details + Preview Thumbnail */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Left: 44x44 Official AuraDrop Logo Badge */}
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: '#18181B',
                border: '1px solid rgba(255, 255, 255, 0.14)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <img
                src={logoImg}
                alt="AuraDrop"
                style={{ width: 28, height: 28, objectFit: 'contain' }}
              />
            </div>

            {/* Middle: Title, Subtitle, Status */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#FFFFFF', lineHeight: 1.2 }}>
                {state.phase === 'waiting_approval'
                  ? (state.isIncoming ? 'AirDrop Request' : 'Waiting for Recipient...')
                  : state.phase === 'verifying'
                  ? 'Verifying Integrity...'
                  : state.phase === 'transferring'
                  ? state.isIncoming ? 'AirDrop Receiving...' : 'AirDrop Sending...'
                  : state.phase === 'completed'
                  ? 'Transfer Complete ✓'
                  : state.phase === 'failed'
                  ? 'Transfer Failed'
                  : state.phase === 'discovering'
                  ? 'AuraDrop Nearby'
                  : state.phase === 'message'
                  ? 'AuraDrop Message'
                  : 'AuraDrop'}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: '#8E8E93',
                  marginTop: 3,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {state.phase === 'waiting_approval'
                  ? (state.isIncoming
                      ? `${state.peerName} would like to share "${state.fileName}"`
                      : `Waiting for ${state.peerName} to accept "${state.fileName}"...`)
                  : state.phase === 'transferring'
                  ? state.fileName
                  : state.phase === 'verifying'
                  ? state.fileName
                  : state.phase === 'completed'
                  ? state.fileName
                  : state.phase === 'failed'
                  ? (state.errorMessage || 'Transfer failed or interrupted')
                  : state.phase === 'discovering'
                  ? `${state.peerName || '1 Device'} • Nearby Device`
                  : state.phase === 'message'
                  ? `${state.chatSender}: ${state.chatText}`
                  : 'Nearby device discovered'}
              </div>
              <div style={{ fontSize: 11, color: '#636366', marginTop: 1 }}>
                {state.phase === 'waiting_approval' || state.phase === 'transferring'
                  ? `${fmtBytes(state.fileSizeBytes)} • Direct Wi-Fi`
                  : state.phase === 'verifying'
                  ? 'SHA-256 Checksum • Validating'
                  : state.phase === 'completed'
                  ? `${fmtBytes(state.fileSizeBytes)} • SHA-256 Verified`
                  : state.phase === 'discovering'
                  ? 'Direct Wi-Fi • Ready'
                  : state.phase === 'message'
                  ? 'Direct LAN • Chat'
                  : 'Ready'}
              </div>
            </div>

            {/* Right: Rounded Square File Preview Thumbnail (48x48) */}
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                color: '#9CA3AF',
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
              }}
            >
              {state.fileName ? state.fileName.split('.').pop()?.slice(0, 4) || 'FILE' : 'P2P'}
            </div>
          </div>

          {/* Middle: Transfer Progress Bar (when transferring or verifying) */}
          {(state.phase === 'transferring' || state.phase === 'verifying') && (
            <div style={{ marginTop: 2, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ height: 6, background: '#2C2C2E', borderRadius: 9999, overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: state.phase === 'verifying' ? '100%' : `${pct}%`,
                    background: state.phase === 'verifying' ? 'linear-gradient(90deg, #A855F7, #38BDF8)' : 'linear-gradient(90deg, #007AFF, #38BDF8)',
                    borderRadius: 9999,
                    transition: 'width .25s ease',
                    animation: state.phase === 'verifying' ? 'island-pulse 1.2s infinite ease-in-out' : undefined,
                  }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11.5, color: '#8E8E93' }}>
                  {state.phase === 'verifying'
                    ? `${fmtBytes(state.fileSizeBytes)} • Cryptographic Verification`
                    : `${fmtBytes(state.transferredBytes)} / ${fmtBytes(state.fileSizeBytes)} • ${pct}%`}
                </span>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: '#FFFFFF' }}>
                  {state.phase === 'verifying' ? '⏳ Verifying' : `⚡ ${fmtSpeed(state.speedBytesPerSec)}`}
                </span>
              </div>
            </div>
          )}

          {/* Bottom Action Pill Buttons: Apple Style Full Rounded Pills */}
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            {state.phase === 'waiting_approval' && (
              state.isIncoming ? (
                <>
                  <button
                    onClick={handleDecline}
                    style={{
                      flex: 1,
                      height: 40,
                      borderRadius: 9999,
                      background: '#2C2C2E',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      color: '#FFFFFF',
                      fontSize: 14,
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    Decline
                  </button>
                  <button
                    onClick={handleAccept}
                    style={{
                      flex: 1,
                      height: 40,
                      borderRadius: 9999,
                      background: '#007AFF',
                      border: 'none',
                      color: '#FFFFFF',
                      fontSize: 14,
                      fontWeight: 700,
                      cursor: 'pointer',
                      boxShadow: '0 4px 16px rgba(0, 122, 255, 0.45)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    Accept
                  </button>
                </>
              ) : (
                <button
                  onClick={handleDecline}
                  style={{
                    width: '100%',
                    height: 40,
                    borderRadius: 9999,
                    background: '#2C2C2E',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#EF4444',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Cancel Request
                </button>
              )
            )}

            {state.phase === 'transferring' && (
              <button
                onClick={handleDecline}
                style={{
                  width: '100%',
                  height: 36,
                  borderRadius: 9999,
                  background: '#2C2C2E',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#9CA3AF',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            )}

            {state.phase === 'completed' && (
              <>
                <button
                  onClick={handleOpenFolder}
                  style={{
                    flex: 1,
                    height: 38,
                    borderRadius: 9999,
                    background: '#2C2C2E',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#FFFFFF',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Open Folder
                </button>
                <button
                  onClick={handleOpenFile}
                  style={{
                    flex: 1,
                    height: 38,
                    borderRadius: 9999,
                    background: '#007AFF',
                    border: 'none',
                    color: '#FFFFFF',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 4px 16px rgba(0, 122, 255, 0.35)',
                  }}
                >
                  Open File
                </button>
              </>
            )}

            {(state.phase === 'discovering' || state.phase === 'idle') && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    dispatch({ type: 'DISMISS' });
                  }}
                  style={{
                    flex: 1,
                    height: 40,
                    borderRadius: 9999,
                    background: '#2C2C2E',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#FFFFFF',
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Dismiss
                </button>
                {state.peerName && (
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
                      height: 40,
                      borderRadius: 9999,
                      background: '#2C2C2E',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      color: '#FFFFFF',
                      fontSize: 14,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Chat
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenMain();
                    dispatch({ type: 'DISMISS' });
                  }}
                  style={{
                    flex: 1.2,
                    height: 40,
                    borderRadius: 9999,
                    background: '#007AFF',
                    border: 'none',
                    color: '#FFFFFF',
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 4px 16px rgba(0, 122, 255, 0.45)',
                  }}
                >
                  Share Files
                </button>
              </>
            )}

            {state.phase === 'message' && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    dispatch({ type: 'DISMISS' });
                  }}
                  style={{
                    flex: 1,
                    height: 40,
                    borderRadius: 9999,
                    background: '#2C2C2E',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#FFFFFF',
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Dismiss
                </button>
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
                    flex: 1.2,
                    height: 40,
                    borderRadius: 9999,
                    background: '#007AFF',
                    border: 'none',
                    color: '#FFFFFF',
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 4px 16px rgba(0, 122, 255, 0.45)',
                  }}
                >
                  Open Chat
                </button>
              </>
            )}

            {state.phase === 'failed' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  dispatch({ type: 'DISMISS' });
                }}
                style={{
                  width: '100%',
                  height: 38,
                  borderRadius: 9999,
                  background: '#2C2C2E',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#FFFFFF',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Standalone Desktop Island Overlay (for system-wide background window) ───
export const DesktopIslandOverlay: React.FC = () => {
  const handleOpenMain = () => {
    invoke('show_main_window').catch(() => {});
  };

  const handleOpenChat = (peerId: string) => {
    invoke('open_chat_window', { peerId }).catch(() => {});
  };

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        paddingTop: 4,
        background: 'transparent',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      <DesktopIsland onOpenMain={handleOpenMain} onOpenChat={handleOpenChat} isOverlayWindow={true} />
    </div>
  );
};

export default DesktopIsland;

