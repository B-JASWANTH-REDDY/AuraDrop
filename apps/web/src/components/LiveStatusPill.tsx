import React, { useState, useEffect } from 'react';
import { TransferEngine } from '../engine/transferEngine';

interface LiveStatusPillProps {
  peerCount: number;
  onClick: () => void;
  isDark?: boolean;
}

export const LiveStatusPill: React.FC<LiveStatusPillProps> = ({ peerCount, onClick, isDark = true }) => {
  const [latency, setLatency] = useState<number | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [lastChecked, setLastChecked] = useState<string>('Just now');

  useEffect(() => {
    let isMounted = true;

    const checkHealth = async () => {
      const start = performance.now();
      try {
        const res = await fetch('/api/health', { method: 'GET', cache: 'no-cache' });
        if (res.ok) {
          const rtt = Math.round(performance.now() - start);
          if (isMounted) {
            setLatency(rtt);
            setIsOnline(true);
            setLastChecked(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
          }
        } else {
          try {
            const diag = TransferEngine.getInstance().getSignalingDiagnostics();
            if (diag.wsState === 'OPEN') {
              if (isMounted) {
                setIsOnline(true);
                setLatency(null);
                setLastChecked(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
              }
              return;
            }
          } catch {}
          if (isMounted) {
            setIsOnline(false);
            setLatency(null);
          }
        }
      } catch {
        let meshOnline = false;
        try {
          const diag = TransferEngine.getInstance().getSignalingDiagnostics();
          if (diag.wsState === 'OPEN' || diag.connectedPeersCount > 0 || peerCount > 0) {
            meshOnline = true;
          }
        } catch {}

        if (isMounted) {
          setIsOnline(meshOnline);
          setLatency(null);
          setLastChecked(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        }
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 15000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [peerCount]);

  return (
    <div
      onClick={onClick}
      role="status"
      aria-label="Live Control Plane Status"
      title={`Live WebRTC Signaling active. Last checked: ${lastChecked}. Click for full diagnostics.`}
      className="cursor-pointer"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '7px',
        padding: '5px 11px',
        borderRadius: '9999px',
        background: isDark ? (isOnline ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)') : (isOnline ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)'),
        border: `1px solid ${isDark ? (isOnline ? 'rgba(34, 197, 94, 0.28)' : 'rgba(239, 68, 68, 0.28)') : (isOnline ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)')}`,
        color: isDark ? (isOnline ? '#4ade80' : '#f87171') : (isOnline ? '#15803d' : '#b91c1c'),
        fontSize: '11.5px',
        fontWeight: 700,
        whiteSpace: 'nowrap',
        flexShrink: 0,
        transition: 'all 0.2s ease',
      }}
    >
      <span
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          backgroundColor: isOnline ? '#22c55e' : '#ef4444',
          boxShadow: isOnline ? '0 0 6px #22c55e' : 'none',
          animation: isOnline ? 'pulseDot 2s infinite ease-in-out' : 'none',
          flexShrink: 0,
        }}
      />
      <span>{isOnline ? 'Live Control' : 'Offline'}</span>
      {isOnline && latency !== null && (
        <span
          className="tabular-nums"
          style={{
            fontSize: '11px',
            opacity: 0.85,
            borderLeft: `1px solid ${isDark ? 'rgba(34, 197, 94, 0.3)' : 'rgba(34, 197, 94, 0.3)'}`,
            paddingLeft: '6px',
          }}
        >
          {latency}ms
        </span>
      )}
      {peerCount > 0 && (
        <span
          className="tabular-nums"
          style={{
            fontSize: '10.5px',
            background: isDark ? 'rgba(34, 197, 94, 0.2)' : 'rgba(34, 197, 94, 0.2)',
            padding: '1px 5px',
            borderRadius: '100px',
            fontWeight: 700,
          }}
        >
          {peerCount}
        </span>
      )}
    </div>
  );
};
