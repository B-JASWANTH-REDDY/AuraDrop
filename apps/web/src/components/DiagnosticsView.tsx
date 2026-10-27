// AuraDrop Production Forensic Connectivity Diagnostics (Section 2 & 30)
// Exposes real WebSocket status, close codes, signaling URL configuration,
// WebRTC ICE states, candidates, and 1-tap LAN auto-configuration.

import React, { useState, useEffect } from 'react';
import { TransferEngine } from '../engine/transferEngine';
import { TransportStatistics } from '../engine/transport';
import { SignalingDiagnostics } from '../engine/signalingClient';

interface DiagnosticsViewProps {
  isDark?: boolean;
}

export const DiagnosticsView: React.FC<DiagnosticsViewProps> = ({ isDark = true }) => {
  const engine = TransferEngine.getInstance();
  const signalingClient = engine.getSignalingClient();

  const [transportStats, setTransportStats] = useState<TransportStatistics>(() => engine.getDiagnostics());
  const [signalingDiag, setSignalingDiag] = useState<SignalingDiagnostics>(() => engine.getSignalingDiagnostics());
  const [customUrlInput, setCustomUrlInput] = useState(() => signalingDiag.customConfiguredUrl || '');
  const [showConfigSaved, setShowConfigSaved] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setTransportStats(engine.getDiagnostics());
      setSignalingDiag(engine.getSignalingDiagnostics());
    }, 600);
    return () => clearInterval(timer);
  }, [engine]);

  const handleSaveSignalingUrl = (urlToSet: string) => {
    signalingClient.setCustomSignalingUrl(urlToSet ? urlToSet.trim() : null);
    setSignalingDiag(engine.getSignalingDiagnostics());
    setShowConfigSaved(true);
    setTimeout(() => setShowConfigSaved(false), 2000);
  };

  const isConnected = signalingDiag.wsState === 'OPEN';

  // Theme-aware tokens
  const textPrimary = isDark ? '#FFFFFF' : '#0F172A';
  const textMuted = isDark ? '#8E8E93' : '#64748B';
  const panelBg = isDark ? '#16161A' : '#F8FAFC';
  const panelBorder = isDark ? '#282830' : '#E2E8F0';
  const inputBg = isDark ? '#0E0E10' : '#FFFFFF';
  const inputBorder = isDark ? '#2C2C32' : '#CBD5E1';
  const btnPriBg = isDark ? '#FFFFFF' : '#0F172A';
  const btnPriText = isDark ? '#000000' : '#FFFFFF';
  const btnSecBg = isDark ? '#24242A' : '#E2E8F0';
  const btnSecText = isDark ? '#E4E4E7' : '#334155';
  const monoValColor = isDark ? '#FFFFFF' : '#0F172A';

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* Top Header / Live State Pill */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 800, color: textPrimary, letterSpacing: '-0.02em' }}>
            Forensic Physical Connectivity
          </div>
          <p style={{ fontSize: '12px', color: textMuted, margin: '2px 0 0' }}>
            Real-time peer registry, WebSocket telemetry &amp; WebRTC direct data plane
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              background: isConnected
                ? (isDark ? 'rgba(52, 199, 89, 0.15)' : '#ecfdf5')
                : (isDark ? 'rgba(255, 69, 58, 0.15)' : '#fef2f2'),
              border: `1px solid ${isConnected ? (isDark ? '#34C759' : '#10b981') : (isDark ? '#FF453A' : '#ef4444')}`,
              color: isConnected ? (isDark ? '#34C759' : '#059669') : (isDark ? '#FF453A' : '#dc2626'),
              fontSize: '11px',
              fontWeight: 800,
              padding: '4px 11px',
              borderRadius: '9999px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: isConnected ? '#10b981' : '#ef4444',
                boxShadow: isConnected ? '0 0 6px #10b981' : 'none',
              }}
            />
            SIGNALING: {signalingDiag.wsState}
          </span>
        </div>
      </div>

      {/* 1. SIGNALING TRACE PANEL */}
      <div
        style={{
          background: panelBg,
          border: `1px solid ${panelBorder}`,
          borderRadius: '16px',
          padding: '16px 18px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: textPrimary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Physical Signaling &amp; Peer Registry
          </div>
          <span style={{ fontSize: '11.5px', color: textMuted }}>
            Peers Online: <strong style={{ color: textPrimary }}>{signalingDiag.connectedPeersCount}</strong>
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', fontSize: '12px' }}>
          <div>
            <span style={{ color: textMuted }}>Web App URL: </span>
            <div style={{ color: monoValColor, fontFamily: 'monospace', fontSize: '11px', wordBreak: 'break-all', marginTop: '3px' }}>
              {signalingDiag.webAppUrl}
            </div>
          </div>
          <div>
            <span style={{ color: textMuted }}>Active Signaling URL: </span>
            <div style={{ color: monoValColor, fontFamily: 'monospace', fontSize: '11px', wordBreak: 'break-all', marginTop: '3px' }}>
              {signalingDiag.signalingUrl || 'None configured'}
            </div>
          </div>
          <div>
            <span style={{ color: textMuted }}>WebSocket State: </span>
            <span style={{ color: isConnected ? '#10b981' : '#ef4444', fontWeight: 700 }}>
              {signalingDiag.wsState}
            </span>
          </div>
          <div>
            <span style={{ color: textMuted }}>Registration Status: </span>
            <span style={{ color: signalingDiag.registrationStatus === 'CONFIRMED' ? '#10b981' : '#f59e0b', fontWeight: 700 }}>
              {signalingDiag.registrationStatus}
            </span>
          </div>
          <div>
            <span style={{ color: textMuted }}>Last Socket Error: </span>
            <span style={{ color: signalingDiag.lastWsError ? '#ef4444' : '#10b981', fontWeight: 600 }}>
              {signalingDiag.lastWsError || 'None (Healthy)'}
            </span>
          </div>
          <div>
            <span style={{ color: textMuted }}>Last Close Code: </span>
            <span style={{ color: monoValColor, fontFamily: 'monospace' }}>
              {signalingDiag.lastWsCloseCode ? signalingDiag.lastWsCloseCode : 'N/A'}
            </span>
          </div>
          <div>
            <span style={{ color: textMuted }}>Device ID: </span>
            <span style={{ color: monoValColor, fontFamily: 'monospace' }}>{engine.localId}</span>
          </div>
          <div>
            <span style={{ color: textMuted }}>Secure Context: </span>
            <span style={{ color: signalingDiag.isSecureContext ? '#10b981' : '#f59e0b', fontWeight: 600 }}>
              {signalingDiag.isSecureContext ? 'Yes (HTTPS/localhost)' : 'HTTP LAN (WebRTC functional)'}
            </span>
          </div>
        </div>

        {/* Warning Callout when WebSocket is disconnected */}
        {!isConnected && (
          <div
            style={{
              marginTop: '14px',
              padding: '10px 14px',
              background: isDark ? 'rgba(239, 68, 68, 0.12)' : '#fef2f2',
              border: `1px solid ${isDark ? 'rgba(239, 68, 68, 0.3)' : '#fecaca'}`,
              borderRadius: '10px',
              fontSize: '11.5px',
              color: isDark ? '#fca5a5' : '#b91c1c',
              lineHeight: 1.5,
            }}
          >
            <strong>Signaling Disconnected:</strong> Cannot reach <code>{signalingDiag.signalingUrl}</code>. If testing on mobile, ensure your device is connected to the same Wi-Fi.
          </div>
        )}

        {/* Custom Signaling URL Configuration Form */}
        <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: `1px solid ${panelBorder}` }}>
          <div style={{ fontSize: '11px', color: textMuted, fontWeight: 700, textTransform: 'uppercase', marginBottom: '8px' }}>
            Desktop / Custom Signaling Server Endpoint (Same Wi-Fi)
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="e.g. ws://192.168.0.21:48280"
              value={customUrlInput}
              onChange={(e) => setCustomUrlInput(e.target.value)}
              style={{
                flex: 1,
                minWidth: '220px',
                background: inputBg,
                border: `1px solid ${inputBorder}`,
                borderRadius: '8px',
                padding: '8px 12px',
                color: monoValColor,
                fontSize: '12px',
                fontFamily: 'monospace',
                outline: 'none',
              }}
            />
            <button
              onClick={() => handleSaveSignalingUrl(customUrlInput)}
              style={{
                background: btnPriBg,
                border: 'none',
                borderRadius: '8px',
                padding: '8px 16px',
                color: btnPriText,
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Connect
            </button>
            <button
              onClick={() => {
                setCustomUrlInput('');
                handleSaveSignalingUrl('');
              }}
              style={{
                background: btnSecBg,
                border: 'none',
                borderRadius: '8px',
                padding: '8px 12px',
                color: btnSecText,
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Reset
            </button>
          </div>

          {/* Quick preset buttons for local LAN */}
          <div style={{ display: 'flex', gap: '6px', marginTop: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11px', color: textMuted }}>Detected LAN Presets:</span>
            <button
              onClick={() => {
                const url = 'wss://api.auradrop.network/ws';
                setCustomUrlInput(url);
                handleSaveSignalingUrl(url);
              }}
              style={{
                background: isDark ? '#1A2433' : '#ecfdf5',
                border: `1px solid ${isDark ? '#34C759' : '#10b981'}`,
                borderRadius: '6px',
                color: isDark ? '#34C759' : '#059669',
                fontSize: '10.5px',
                fontWeight: 700,
                padding: '3px 8px',
                cursor: 'pointer',
              }}
            >
              ☁️ Cloud Relay
            </button>
            <button
              onClick={() => {
                const url = `ws://${window.location.hostname}:48280`;
                setCustomUrlInput(url);
                handleSaveSignalingUrl(url);
              }}
              style={{
                background: isDark ? '#1E1E24' : '#f1f5f9',
                border: `1px solid ${isDark ? '#2C2C32' : '#cbd5e1'}`,
                borderRadius: '6px',
                color: textMuted,
                fontSize: '10.5px',
                fontWeight: 600,
                padding: '3px 8px',
                cursor: 'pointer',
              }}
            >
              Host: {window.location.hostname}:48280
            </button>
            {showConfigSaved && (
              <span style={{ fontSize: '11px', color: '#10b981', fontWeight: 700, marginLeft: '6px' }}>
                ✓ Applied &amp; Reconnecting...
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 2. WEBRTC TELEMETRY PANEL */}
      <div
        style={{
          background: panelBg,
          border: `1px solid ${panelBorder}`,
          borderRadius: '16px',
          padding: '16px 18px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: isDark ? '#34C759' : '#059669', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            WebRTC Direct Data Plane
          </div>
          <span style={{ fontSize: '11.5px', color: textMuted }}>
            Transport: <strong style={{ color: textPrimary }}>{transportStats.transportName}</strong>
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', fontSize: '12px' }}>
          <div>
            <span style={{ color: textMuted }}>ICE State: </span>
            <span style={{ color: transportStats.iceState === 'connected' ? '#10b981' : '#f59e0b', fontWeight: 700 }}>
              {transportStats.iceState}
            </span>
          </div>
          <div>
            <span style={{ color: textMuted }}>Connection: </span>
            <span style={{ color: transportStats.connectionState === 'connected' ? '#10b981' : textMuted }}>
              {transportStats.connectionState}
            </span>
          </div>
          <div>
            <span style={{ color: textMuted }}>Data Channel: </span>
            <span style={{ color: transportStats.dataChannelState === 'open' ? '#10b981' : textMuted, fontWeight: 700 }}>
              {transportStats.dataChannelState}
            </span>
          </div>
          <div>
            <span style={{ color: textMuted }}>Round-Trip Time: </span>
            <span style={{ color: textPrimary, fontWeight: 600 }}>{transportStats.rttMs} ms</span>
          </div>
          <div>
            <span style={{ color: textMuted }}>Selected Candidate: </span>
            <span style={{ color: textPrimary, fontFamily: 'monospace' }}>{transportStats.localCandidateType || 'host'}</span>
          </div>
          <div>
            <span style={{ color: textMuted }}>Socket Buffer: </span>
            <span style={{ color: textPrimary }}>{(transportStats.bufferedAmount / 1024).toFixed(1)} KB</span>
          </div>
          <div>
            <span style={{ color: textMuted }}>Throughput Sent: </span>
            <span style={{ color: textPrimary }}>{(transportStats.bytesSent / (1024 * 1024)).toFixed(2)} MB</span>
          </div>
        </div>
      </div>

      {/* 3. PHYSICAL VERIFICATION INSTRUCTIONS */}
      <div
        style={{
          borderTop: `1px solid ${panelBorder}`,
          paddingTop: '12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px',
        }}
      >
        <div style={{ fontSize: '11px', color: textMuted }}>
          Testing on same Wi-Fi? Verify backend health at <code>/health</code>
        </div>
        <a
          href="/health"
          target="_blank"
          rel="noreferrer"
          style={{
            background: btnSecBg,
            border: `1px solid ${panelBorder}`,
            color: textPrimary,
            textDecoration: 'none',
            fontSize: '11px',
            fontWeight: 700,
            padding: '5px 12px',
            borderRadius: '8px',
          }}
        >
          Verify Backend /health
        </a>
      </div>
    </div>
  );
};
