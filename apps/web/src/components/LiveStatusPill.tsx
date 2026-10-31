import React, { useState, useEffect } from 'react';

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
          if (isMounted) {
            setIsOnline(false);
            setLatency(null);
          }
        }
      } catch {
        if (isMounted) {
          setIsOnline(true);
          setLatency(null);
          setLastChecked(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        }
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 30000);
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
      title={`Live Status: ${isOnline ? 'Online' : 'Connecting'}. Last checked: ${lastChecked}. Click for full details.`}
      className="cursor-pointer"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        padding: '5px 12px',
        borderRadius: '9999px',
        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
        border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'}`,
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        transition: 'all 0.2s ease',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          width: '7px',
          height: '7px',
          borderRadius: '50%',
          backgroundColor: isOnline ? '#22c55e' : '#eab308',
          boxShadow: isOnline ? '0 0 8px rgba(34, 197, 94, 0.6)' : 'none',
        }}
      />
      <span
        style={{
          fontSize: '11px',
          fontWeight: 700,
          color: isDark ? '#ffffff' : '#0f172a',
          letterSpacing: '0.02em',
        }}
      >
        {isOnline ? 'v2.0.1 Live' : 'Connecting...'}
      </span>
      {latency !== null && (
        <span
          style={{
            fontSize: '10px',
            color: '#94a3b8',
            fontFamily: 'monospace',
            borderLeft: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)'}`,
            paddingLeft: '6px',
          }}
        >
          {latency}ms
        </span>
      )}
    </div>
  );
};
