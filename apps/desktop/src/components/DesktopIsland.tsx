/**
 * AuraDrop Windows Desktop Dynamic Island
 * =========================================
 * Compact, floating, pill-shaped status island.
 * Subscribes to real Tauri events (peers-updated, transfer-progress).
 * No fake state engine — all data comes from the actual transport layer.
 */
import React, { useCallback, useEffect, useReducer, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import type { PeerDevice, TransferProgressPayload } from '../types';

type IslandPhase =
  | 'idle' | 'discovering' | 'connecting' | 'waiting_approval'
  | 'connected' | 'transferring' | 'completed' | 'failed' | 'messaging';

interface IslandState {
  phase: IslandPhase;
  expanded: boolean;
  peerCount: number;
  peerName: string;
  fileName: string;
  fileSizeBytes: number;
  transferredBytes: number;
  speedBytesPerSec: number;
  etaSeconds: number;
  errorMessage: string;
  transferId: string;
}

type IslandAction =
  | { type: 'PEERS_UPDATED'; peerCount: number; peerName: string }
  | { type: 'TRANSFER_START'; payload: TransferProgressPayload }
  | { type: 'TRANSFER_PROGRESS'; payload: TransferProgressPayload }
  | { type: 'TRANSFER_COMPLETE'; payload: TransferProgressPayload }
  | { type: 'TRANSFER_FAILED'; payload: TransferProgressPayload }
  | { type: 'TRANSFER_CANCELLED' }
  | { type: 'EXPAND' }
  | { type: 'COLLAPSE' }
  | { type: 'DISMISS' };

const initialState: IslandState = {
  phase: 'idle', expanded: false, peerCount: 0, peerName: '',
  fileName: '', fileSizeBytes: 0, transferredBytes: 0,
  speedBytesPerSec: 0, etaSeconds: 0, errorMessage: '', transferId: '',
};

function islandReducer(state: IslandState, action: IslandAction): IslandState {
  switch (action.type) {
    case 'PEERS_UPDATED': {
      const phase: IslandPhase = action.peerCount > 0 ? 'discovering' : 'idle';
      if (['transferring', 'waiting_approval', 'connecting'].includes(state.phase)) {
        return { ...state, peerCount: action.peerCount, peerName: action.peerName };
      }
      return { ...state, phase, peerCount: action.peerCount, peerName: action.peerName,
        expanded: action.peerCount > 0 && !state.expanded ? true : state.expanded };
    }
    case 'TRANSFER_START':
      return { ...state, phase: 'transferring', expanded: true,
        fileName: action.payload.fileName || '', fileSizeBytes: action.payload.totalBytes || 0,
        transferredBytes: 0, speedBytesPerSec: 0, etaSeconds: 0,
        transferId: action.payload.transferId || '', peerName: action.payload.peerName || state.peerName,
        errorMessage: '' };
    case 'TRANSFER_PROGRESS':
      return { ...state, phase: 'transferring',
        transferredBytes: action.payload.transferredBytes || 0,
        fileSizeBytes: action.payload.totalBytes || state.fileSizeBytes,
        speedBytesPerSec: action.payload.speedBytesPerSec || 0,
        etaSeconds: action.payload.etaSeconds || 0 };
    case 'TRANSFER_COMPLETE':
      return { ...state, phase: 'completed',
        transferredBytes: action.payload.totalBytes || state.fileSizeBytes,
        speedBytesPerSec: 0, etaSeconds: 0 };
    case 'TRANSFER_FAILED':
      return { ...state, phase: 'failed', errorMessage: action.payload.error || 'Transfer failed' };
    case 'TRANSFER_CANCELLED':
      return { ...state, phase: 'idle', expanded: false, errorMessage: '' };
    case 'EXPAND':   return { ...state, expanded: true };
    case 'COLLAPSE': return { ...state, expanded: false };
    case 'DISMISS':  return {
      ...state,
      phase: (state.phase === 'completed' || state.phase === 'failed') ? 'idle' : state.phase,
      expanded: false, errorMessage: '' };
    default: return state;
  }
}

function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024*1024) return `${(b/1024).toFixed(1)} KB`;
  if (b < 1024*1024*1024) return `${(b/(1024*1024)).toFixed(1)} MB`;
  return `${(b/(1024*1024*1024)).toFixed(2)} GB`;
}
function fmtSpeed(bps: number) {
  if (bps < 1024) return `${bps.toFixed(0)} B/s`;
  if (bps < 1024*1024) return `${(bps/1024).toFixed(1)} KB/s`;
  return `${(bps/(1024*1024)).toFixed(1)} MB/s`;
}
function fmtEta(sec: number) {
  if (sec <= 0) return '';
  if (sec < 60)   return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec/60)}m ${sec%60}s`;
  return `${Math.floor(sec/3600)}h`;
}

// ── Inject global keyframes once ──────────────────────────────────────────────
if (typeof document !== 'undefined' && !document.getElementById('__ai_island__')) {
  const s = document.createElement('style');
  s.id = '__ai_island__';
  s.textContent = `
    @keyframes island-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.45;transform:scale(.8)} }
    @keyframes island-spin   { to{transform:rotate(360deg)} }
    @media(prefers-reduced-motion:reduce){*{animation-duration:.01ms!important;transition-duration:.01ms!important}}
  `;
  document.head.appendChild(s);
}

// ── DesktopIsland ─────────────────────────────────────────────────────────────
export const DesktopIsland: React.FC<{ onOpenMain: () => void }> = ({ onOpenMain }) => {
  const [state, dispatch] = useReducer(islandReducer, initialState);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const scheduleCollapse = useCallback((ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => dispatch({ type: 'DISMISS' }), ms);
  }, []);

  useEffect(() => {
    if (state.phase === 'completed') scheduleCollapse(5000);
    if (state.phase === 'failed')    scheduleCollapse(8000);
    if (state.phase === 'idle')      scheduleCollapse(4000);
  }, [state.phase, scheduleCollapse]);

  useEffect(() => {
    invoke<PeerDevice[]>('get_nearby_peers').then((peers) =>
      dispatch({ type: 'PEERS_UPDATED', peerCount: peers.length, peerName: peers[0]?.name ?? '' })
    ).catch(() => {});

    const ul: Promise<() => void>[] = [];
    ul.push(listen<PeerDevice[]>('peers-updated', (e) => {
      dispatch({ type: 'PEERS_UPDATED', peerCount: e.payload.length, peerName: e.payload[0]?.name ?? '' });
    }));
    ul.push(listen<TransferProgressPayload>('transfer-progress', (e) => {
      const p = e.payload;
      if (p.status === 'sending' || p.status === 'receiving') {
        if (!p.transferredBytes) dispatch({ type: 'TRANSFER_START', payload: p });
        else dispatch({ type: 'TRANSFER_PROGRESS', payload: p });
      } else if (p.status === 'completed') dispatch({ type: 'TRANSFER_COMPLETE', payload: p });
      else if (p.status === 'failed')      dispatch({ type: 'TRANSFER_FAILED',   payload: p });
      else if (p.status === 'cancelled')   dispatch({ type: 'TRANSFER_CANCELLED' });
    }));
    return () => { ul.forEach((p) => p.then((f) => f())); if (timer.current) clearTimeout(timer.current); };
  }, []);

  const pct = state.fileSizeBytes > 0
    ? Math.min(100, Math.round((state.transferredBytes / state.fileSizeBytes) * 100)) : 0;

  const pillLabel = (() => {
    switch (state.phase) {
      case 'idle':        return 'AuraDrop';
      case 'discovering': return state.peerCount === 1 ? state.peerName : `${state.peerCount} nearby`;
      case 'transferring':return `${pct}%`;
      case 'completed':   return '✓ Done';
      case 'failed':      return '✕ Failed';
      default:            return 'AuraDrop';
    }
  })();

  const accentColor = () => {
    switch (state.phase) {
      case 'transferring': return '#60A5FA';
      case 'completed':    return '#4ADE80';
      case 'failed':       return '#F87171';
      case 'discovering':  return '#A78BFA';
      default:             return '#6B7280';
    }
  };

  return (
    <div
      role="status" aria-live="polite" aria-label="AuraDrop status"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Escape') dispatch({ type: 'COLLAPSE' });
        if (e.key === 'Enter')  state.expanded ? onOpenMain() : dispatch({ type: 'EXPAND' });
      }}
      onClick={() => dispatch(state.expanded ? { type: 'COLLAPSE' } : { type: 'EXPAND' })}
      style={{
        position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 99999,
        background: 'rgba(9,9,11,0.96)', backdropFilter: 'blur(24px)',
        border: `1px solid rgba(255,255,255,0.07)`,
        borderRadius: state.expanded ? 20 : 100,
        boxShadow: '0 8px 40px rgba(0,0,0,.7), 0 0 0 .5px rgba(255,255,255,.05)',
        cursor: 'pointer', userSelect: 'none', outline: 'none',
        fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
        color: '#fff', fontSize: 13,
        width: state.expanded ? 320 : 'auto', minWidth: state.expanded ? 260 : 100, maxWidth: 340,
        transition: 'border-radius .35s cubic-bezier(.34,1.56,.64,1), width .35s cubic-bezier(.34,1.56,.64,1)',
      }}
    >
      {/* ── Collapsed pill ── */}
      {!state.expanded && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px' }}>
          {/* Icon */}
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="2.5" fill={accentColor()} />
            <circle cx="12" cy="12" r="6"   stroke={accentColor()} strokeWidth="1.5" fill="none" opacity=".6" />
            <circle cx="12" cy="12" r="10"  stroke={accentColor()} strokeWidth="1"   fill="none" opacity=".3" />
          </svg>
          <span style={{ fontSize: 12, fontWeight: 500, color: '#E5E7EB', whiteSpace: 'nowrap' }}>
            {pillLabel}
          </span>
          {state.phase === 'transferring' && (
            <svg width={18} height={18} viewBox="0 0 18 18" style={{ flexShrink: 0 }}>
              <circle cx="9" cy="9" r="7" fill="none" stroke="#1F2937" strokeWidth={2} />
              <circle cx="9" cy="9" r="7" fill="none" stroke="#60A5FA" strokeWidth={2}
                strokeDasharray={`${(pct/100)*44} 44`} strokeLinecap="round"
                transform="rotate(-90 9 9)" />
            </svg>
          )}
          {state.phase === 'discovering' && (
            <div style={{ width:6, height:6, borderRadius:'50%', background:'#A78BFA',
              animation:'island-pulse 1.5s ease-in-out infinite' }} />
          )}
        </div>
      )}

      {/* ── Expanded panel ── */}
      {state.expanded && (
        <div style={{ padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="2.5" fill={accentColor()} />
              <circle cx="12" cy="12" r="6"   stroke={accentColor()} strokeWidth="1.5" fill="none" opacity=".6" />
              <circle cx="12" cy="12" r="10"  stroke={accentColor()} strokeWidth="1"   fill="none" opacity=".3" />
            </svg>
            <div style={{ flex: 1 }}>
              <span style={{ fontWeight: 600, color: accentColor() }}>
                {state.phase === 'idle'        ? 'AuraDrop'
                : state.phase === 'discovering' ? (state.peerCount > 1 ? `${state.peerCount} Devices` : state.peerName)
                : state.phase === 'transferring'? 'Transferring'
                : state.phase === 'completed'   ? 'Complete'
                : state.phase === 'failed'      ? 'Failed'
                : 'AuraDrop'}
              </span>
              <span style={{ marginLeft: 4, fontSize: 11, color: '#6B7280' }}>
                {state.phase === 'discovering' ? 'Nearby' : state.peerName ? `· ${state.peerName}` : ''}
              </span>
            </div>
            <button
              aria-label="Open AuraDrop"
              onClick={(e) => { e.stopPropagation(); onOpenMain(); }}
              style={{ background:'transparent', border:'1px solid rgba(255,255,255,.1)',
                borderRadius:6, color:'#9CA3AF', cursor:'pointer', fontSize:13, padding:'3px 6px' }}>
              ↗
            </button>
          </div>

          {/* Transfer details */}
          {(state.phase === 'transferring' || state.phase === 'completed' || state.phase === 'failed') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
              <div style={{ fontSize:12, color:'#D1D5DB', overflow:'hidden', textOverflow:'ellipsis',
                whiteSpace:'nowrap', fontWeight:500 }} title={state.fileName}>
                {state.fileName || 'Unknown file'}
              </div>
              {state.phase === 'transferring' && (
                <>
                  <div style={{ height:4, background:'#1F2937', borderRadius:100, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${pct}%`,
                      background:'linear-gradient(90deg,#3B82F6,#60A5FA)', borderRadius:100,
                      transition:'width .4s ease' }} />
                  </div>
                  <div style={{ display:'flex', gap:8, fontSize:11, color:'#6B7280' }}>
                    <span>{fmtBytes(state.transferredBytes)} / {fmtBytes(state.fileSizeBytes)}</span>
                    <span>{fmtSpeed(state.speedBytesPerSec)}</span>
                    {state.etaSeconds > 0 && <span>ETA {fmtEta(state.etaSeconds)}</span>}
                  </div>
                </>
              )}
              {state.phase === 'completed' && (
                <div style={{ fontSize:11, color:'#4ADE80', fontWeight:500 }}>
                  ✓ Transfer complete · {fmtBytes(state.fileSizeBytes)}
                </div>
              )}
              {state.phase === 'failed' && (
                <div style={{ fontSize:11, color:'#F87171', fontWeight:500 }}>
                  {state.errorMessage || 'Transfer failed'}
                </div>
              )}
            </div>
          )}

          {/* Discovery */}
          {state.phase === 'discovering' && (
            <div style={{ display:'flex', flexDirection:'column', gap:4, marginTop:2 }}>
              <div style={{ display:'flex', gap:4 }}>
                {Array.from({ length: Math.min(state.peerCount, 4) }).map((_, i) => (
                  <div key={i} style={{ width:28, height:28, borderRadius:'50%',
                    background:`hsl(${260+i*30} 65% 52%)`, display:'flex', alignItems:'center',
                    justifyContent:'center', fontSize:11, color:'#fff', fontWeight:700,
                    border:'1.5px solid #111' }}>
                    {i === 0 ? (state.peerName.charAt(0).toUpperCase() || '?') : String(i+1)}
                  </div>
                ))}
                {state.peerCount > 4 && (
                  <div style={{ width:28,height:28,borderRadius:'50%',background:'#374151',
                    display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,color:'#9CA3AF' }}>
                    +{state.peerCount-4}
                  </div>
                )}
              </div>
              <div style={{ fontSize:11, color:'#9CA3AF' }}>
                {state.peerCount === 1 ? '1 device nearby' : `${state.peerCount} devices nearby`}
              </div>
            </div>
          )}

          {state.phase === 'idle' && (
            <div style={{ fontSize:11, color:'#4B5563' }}>Searching for nearby devices…</div>
          )}
        </div>
      )}
    </div>
  );
};
