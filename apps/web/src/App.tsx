import React, { useState, useEffect, useRef } from 'react';
import { HeroGlobe } from './components/HeroGlobe';
import { DockedShareTray } from './components/DockedShareTray';
import { DevicePairModal } from './components/DevicePairModal';
import {
  ChatModal,
  SettingsModal,
  ProfileModal,
  TransferHistoryModal,
  DiagnosticsModal,
  DownloadsModal,
} from './components/Modals';
import { TransferEngine, TransferEngineEvent } from './engine/transferEngine';
import { TransferStorage } from './engine/transferStorage';
import { PeerDevice, PickedFile, TransferProgress, TransferRecord, VisibilityMode } from './types';

export const App: React.FC = () => {
  const engine = TransferEngine.getInstance();
  const storage = TransferStorage.getInstance();

  // Navigation tab state
  const [visibility, setVisibility] = useState<VisibilityMode>('everyone');

  // Real Discovered Peers from TransferEngine
  const [peers, setPeers] = useState<PeerDevice[]>([]);
  const [selectedPeer, setSelectedPeer] = useState<PeerDevice | null>(null);

  // Staged Files for Transfer
  const [stagedFiles, setStagedFiles] = useState<PickedFile[]>([]);

  // Incoming Request State
  const [incomingRequest, setIncomingRequest] = useState<{
    transferId: string;
    senderName: string;
    fileName: string;
    fileSize: number;
    sha256?: string;
  } | null>(null);

  // Active Real Transfer Progress (live byte counters & MB/s)
  const [transferProgress, setTransferProgress] = useState<TransferProgress | null>(null);

  // Real Transfer History loaded from persistent TransferStorage
  const [transferHistory, setTransferHistory] = useState<TransferRecord[]>(() => storage.getHistory());

  // Modals for deep workflows
  const [isPairModalOpen, setIsPairModalOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);
  const [isDownloadsOpen, setIsDownloadsOpen] = useState(false);

  // Window preview ref for smooth scroll
  const windowPreviewRef = useRef<HTMLDivElement>(null);

  // ---------------------------------------------------------------------------
  // SUBSCRIBE TO REAL ENGINE EVENTS
  // ---------------------------------------------------------------------------
  useEffect(() => {
    // 1. Peer discovery subscription (prioritizes Android mobile devices)
    const unsubscribePeers = engine.onPeersUpdated((updatedPeers) => {
      setPeers(updatedPeers);
      setSelectedPeer((prev) => {
        const androidPeer = updatedPeers.find((p) => p.platform === 'android');
        if (androidPeer) return androidPeer;
        if (!prev) return updatedPeers[0] || null;
        const exists = updatedPeers.find((p) => p.id === prev.id);
        return exists || updatedPeers[0] || null;
      });
    });

    // 2. Real transfer event subscription
    const unsubscribeEvents = engine.onEngineEvent((evt: TransferEngineEvent) => {
      if (evt.type === 'request') {
        setIncomingRequest({
          transferId: evt.transferId,
          senderName: evt.senderName,
          fileName: evt.fileName,
          fileSize: evt.fileSize,
          sha256: evt.sha256,
        });
      } else if (evt.type === 'progress') {
        setTransferProgress({
          transferId: evt.transferId,
          fileName: evt.fileName,
          fileSize: evt.fileSize,
          transferredBytes: evt.transferredBytes || 0,
          verifiedBytes: evt.verifiedBytes || 0,
          speedBytesPerSec: evt.speedBytesPerSec || 0,
          etaSeconds: evt.etaSeconds || 0,
          state: evt.state || 'TRANSFERRING',
          isIncoming: evt.transferredBytes !== undefined,
          peerName: evt.senderName,
          transport: evt.transport || 'Direct LAN',
          sha256: evt.sha256,
        });
      } else if (evt.type === 'completed') {
        setTransferProgress((prev) =>
          prev
            ? {
                ...prev,
                state: 'COMPLETED',
                transferredBytes: prev.fileSize,
                verifiedBytes: prev.fileSize,
                speedBytesPerSec: 0,
                etaSeconds: 0,
              }
            : null
        );
        setTimeout(() => setTransferProgress(null), 4000);
        setTransferHistory(storage.getHistory());
      } else if (evt.type === 'cancelled' || evt.type === 'rejected') {
        setTransferProgress((prev) =>
          prev ? { ...prev, state: 'CANCELLED', speedBytesPerSec: 0, etaSeconds: 0 } : null
        );
        setTimeout(() => setTransferProgress(null), 3000);
      }
    });

    return () => {
      unsubscribePeers();
      unsubscribeEvents();
    };
  }, [engine, storage]);

  // Handle incoming transfer accept
  const handleAcceptTransfer = () => {
    if (!incomingRequest) return;
    engine.respondToIncomingRequest(incomingRequest.transferId, true);
    setIncomingRequest(null);
  };

  // Handle incoming transfer decline
  const handleDeclineTransfer = () => {
    if (!incomingRequest) return;
    engine.respondToIncomingRequest(incomingRequest.transferId, false);
    setIncomingRequest(null);
  };

  // Handle staging files
  const handleRealFilesStaged = (newFiles: PickedFile[]) => {
    setStagedFiles((prev) => [...prev, ...newFiles]);
  };

  const handleRemoveStagedFile = (id: string) => {
    setStagedFiles((prev) => prev.filter((f) => f.id !== id));
  };

  // Execute real file transfer to selected peer
  const handleSendRealFiles = async () => {
    if (!selectedPeer || stagedFiles.length === 0) return;
    const filesToSend = [...stagedFiles];
    setStagedFiles([]);
    for (const staged of filesToSend) {
      if (staged.nativeFile) {
        await engine.sendFile(selectedPeer, staged.nativeFile);
      }
    }
  };

  const scrollToPreview = () => {
    windowPreviewRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#000000',
        color: '#FFFFFF',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        display: 'flex',
        flexDirection: 'column',
        overflowX: 'hidden',
      }}
    >
      <style>{`
        .cursor-pointer { cursor: pointer; }
        .flex { display: flex; align-items: center; }
        .nav-link {
          color: rgba(255, 255, 255, 0.72);
          text-decoration: none;
          font-size: 14px;
          font-weight: 500;
          letter-spacing: -0.01em;
          transition: color 0.2s ease;
        }
        .nav-link:hover { color: #ffffff; }
        .feature-card:hover {
          border-color: rgba(255, 255, 255, 0.24) !important;
          transform: translateY(-2px);
          background: #0e0e12 !important;
        }
        .platform-badge:hover {
          color: #ffffff !important;
          border-color: rgba(255, 255, 255, 0.3) !important;
          transform: translateY(-1px);
        }
        .hero-pill-btn:hover {
          opacity: 0.94;
          transform: translateY(-2px);
          box-shadow: 0 10px 38px rgba(255, 255, 255, 0.32) !important;
        }
        .hero-ghost-btn:hover {
          background: rgba(255, 255, 255, 0.14) !important;
          border-color: rgba(255, 255, 255, 0.35) !important;
          transform: translateY(-2px);
        }
        @keyframes pulseDot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.35; transform: scale(0.85); }
        }
      `}</style>

      {/* ══════════════════════════════════════════════════════════════════════════
           TOP NAVIGATION BAR (Clean, Minimal, AuraDrop Branded)
      ══════════════════════════════════════════════════════════════════════════ */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 1000,
          width: '100%',
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <div
          style={{
            maxWidth: '1220px',
            margin: '0 auto',
            padding: '0 28px',
            height: '66px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {/* Brand Link (cursor-pointer href) */}
          <a
            href="/"
            className="cursor-pointer"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              textDecoration: 'none',
              color: '#FFFFFF',
            }}
          >
            <img
              src="/logo.png"
              alt="AuraDrop"
              width="30"
              height="30"
              style={{ borderRadius: '8px', objectFit: 'contain' }}
              onError={(e) => {
                // Fallback to SVG if image not yet loaded
                e.currentTarget.style.display = 'none';
              }}
            />
            <span style={{ fontSize: '19px', fontWeight: 800, letterSpacing: '-0.035em' }}>AuraDrop</span>
          </a>

          {/* Center Nav Links (flex) */}
          <nav
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '32px',
              listStyle: 'none',
            }}
          >
            <a href="#about" className="nav-link cursor-pointer">About</a>
            <a href="#features" className="nav-link cursor-pointer">Features</a>
            <a href="#protocol" className="nav-link cursor-pointer">Protocol</a>
            <a href="#dynamic-island" className="nav-link cursor-pointer">Dynamic Island</a>
            <a href="#security" className="nav-link cursor-pointer">Security</a>
            <a href="#downloads" className="nav-link cursor-pointer">Downloads</a>
          </nav>

          {/* Right Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* GitHub Documentation link */}
            <a
              href="https://github.com/JACK-AI7/AuraDrop"
              target="_blank"
              rel="noopener noreferrer"
              className="cursor-pointer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                borderRadius: '9999px',
                backgroundColor: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.14)',
                color: '#FFFFFF',
                fontSize: '13px',
                fontWeight: 500,
                textDecoration: 'none',
                transition: 'all 0.2s ease',
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
              </svg>
              <span>GitHub</span>
            </a>

            {/* Launch Web App Button */}
            <button
              onClick={scrollToPreview}
              className="cursor-pointer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '8px 20px',
                borderRadius: '9999px',
                backgroundColor: '#FFFFFF',
                border: 'none',
                color: '#000000',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              Launch Web App
            </button>

            {/* Settings Trigger */}
            <button
              onClick={() => setIsSettingsOpen(true)}
              title="AuraDrop Settings"
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#FFFFFF',
                cursor: 'pointer',
              }}
            >
              ⚙
            </button>
          </div>
        </div>
      </header>

      {/* ══════════════════════════════════════════════════════════════════════════
           HERO SECTION (AuraDrop Pure Ethereal Atmosphere)
      ══════════════════════════════════════════════════════════════════════════ */}
      <section
        id="about"
        style={{
          position: 'relative',
          padding: '88px 0 54px',
          textAlign: 'center',
          overflow: 'hidden',
          background: `
            radial-gradient(ellipse 90% 60% at 50% 10%, rgba(68, 76, 230, 0.46) 0%, rgba(99, 102, 241, 0.28) 28%, rgba(139, 92, 246, 0.14) 52%, transparent 74%),
            radial-gradient(circle at 50% 32%, rgba(56, 189, 248, 0.14) 0%, transparent 48%),
            #000000
          `,
        }}
      >
        <div style={{ maxWidth: '1220px', margin: '0 auto', padding: '0 28px' }}>
          {/* Centered White Squircle with Official AuraDrop Logo */}
          <div
            className="cursor-pointer"
            onClick={scrollToPreview}
            style={{
              width: '80px',
              height: '80px',
              borderRadius: '24px',
              backgroundColor: '#FFFFFF',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 24px 60px rgba(0, 0, 0, 0.7), 0 0 60px rgba(99, 102, 241, 0.5)',
              marginBottom: '30px',
              transition: 'transform 0.2s ease',
            }}
          >
            <img
              src="/logo.png"
              alt="AuraDrop Logo"
              width="52"
              height="52"
              style={{ objectFit: 'contain' }}
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>

          {/* Real AuraDrop Headline */}
          <h1
            style={{
              fontSize: 'clamp(42px, 5.6vw, 76px)',
              fontWeight: 800,
              letterSpacing: '-0.04em',
              lineHeight: 1.08,
              color: '#FFFFFF',
              marginBottom: '20px',
            }}
          >
            Share anything with AuraDrop
          </h1>

          {/* Real AuraDrop Subtitle */}
          <p
            style={{
              fontSize: 'clamp(17px, 1.9vw, 21px)',
              color: 'rgba(255, 255, 255, 0.82)',
              maxWidth: '640px',
              margin: '0 auto 38px',
              lineHeight: 1.55,
              fontWeight: 400,
              letterSpacing: '-0.01em',
            }}
          >
            Move faster, go further, and transfer at full LAN speed with zero cloud relay. Cross-platform peer-to-peer file sharing between Android, Windows, and Web.
          </p>

          {/* Central Hero CTA Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '14px', flexWrap: 'wrap' }}>
            {/* Download for Windows */}
            <a
              href="/downloads/AuraDrop-Setup.exe"
              download="AuraDrop-Setup.exe"
              className="hero-pill-btn cursor-pointer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
                backgroundColor: '#FFFFFF',
                color: '#000000',
                padding: '14px 34px',
                borderRadius: '9999px',
                fontSize: '15px',
                fontWeight: 700,
                textDecoration: 'none',
                boxShadow: '0 4px 25px rgba(255, 255, 255, 0.22)',
                transition: 'all 0.2s ease',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
              </svg>
              <span>Download for Windows</span>
            </a>

            {/* Try AuraDrop Web */}
            <button
              onClick={scrollToPreview}
              className="hero-ghost-btn cursor-pointer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.22)',
                color: '#FFFFFF',
                padding: '14px 28px',
                borderRadius: '9999px',
                fontSize: '15px',
                fontWeight: 600,
                backdropFilter: 'blur(10px)',
                transition: 'all 0.2s ease',
              }}
            >
              <span>Try Web App in Browser ↗</span>
            </button>
          </div>

          {/* REAL PLATFORMS ECOSYSTEM (Authentic logos replacing fake placeholders) */}
          <div style={{ marginTop: '58px', marginBottom: '46px' }}>
            <div
              style={{
                fontSize: '12px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                color: 'rgba(255, 255, 255, 0.5)',
                marginBottom: '24px',
              }}
            >
              Supported Cross-Platform Ecosystem
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '40px',
                flexWrap: 'wrap',
              }}
            >
              {/* Windows 11 */}
              <div className="platform-badge cursor-pointer" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'rgba(255,255,255,0.78)', fontSize: '15px', fontWeight: 600, transition: 'all 0.2s' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
                </svg>
                <span>Windows 11</span>
              </div>

              {/* Android 15 */}
              <div className="platform-badge cursor-pointer" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'rgba(255,255,255,0.78)', fontSize: '15px', fontWeight: 600, transition: 'all 0.2s' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.551 0 .9993.4482.9993.9993.0001.5511-.4483.9997-.9993.9997m-11.046 0c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993 0 .5511-.4482.9997-.9993.9997m11.4045-6.02l1.9973-3.4592a.416.416 0 00-.1521-.5676.416.416 0 00-.5676.1521l-2.0223 3.503C15.5902 8.4116 13.8533 8.1 12 8.1s-3.5902.3116-5.1368.8497L4.8409 5.4467a.4161.4161 0 00-.5677-.1521.4157.4157 0 00-.1521.5676l1.9973 3.4592C2.6889 11.1867.3432 14.6589 0 18.761h24c-.3432-4.1021-2.6889-7.5743-6.1185-9.4396"/>
                </svg>
                <span>Android 15</span>
              </div>

              {/* Apple iOS & macOS */}
              <div className="platform-badge cursor-pointer" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'rgba(255,255,255,0.78)', fontSize: '15px', fontWeight: 600, transition: 'all 0.2s' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.61-.75 1.04-1.8 1.01-2.87-.96.04-2.06.66-2.7 1.45-.56.66-.99 1.72-.94 2.76 1.08.08 2.02-.59 2.63-1.34z"/>
                </svg>
                <span>Apple iOS / macOS</span>
              </div>

              {/* WebRTC Zero-Install */}
              <div className="platform-badge cursor-pointer" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'rgba(255,255,255,0.78)', fontSize: '15px', fontWeight: 600, transition: 'all 0.2s' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                </svg>
                <span>Web (Zero-Install)</span>
              </div>

              {/* Linux */}
              <div className="platform-badge cursor-pointer" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'rgba(255,255,255,0.78)', fontSize: '15px', fontWeight: 600, transition: 'all 0.2s' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12.003 2c-2.22 0-3.99 1.77-3.99 3.99 0 .42.06.82.18 1.2-1.39.46-2.4 1.76-2.4 3.31 0 1.34.76 2.5 1.86 3.07-.09.34-.15.7-.15 1.08 0 2.65 2.01 4.8 4.5 4.8s4.5-2.15 4.5-4.8c0-.38-.06-.74-.15-1.08 1.1-.57 1.86-1.73 1.86-3.07 0-1.55-1.01-2.85-2.4-3.31.12-.38.18-.78.18-1.2 0-2.22-1.77-3.99-3.99-3.99z"/>
                </svg>
                <span>Linux</span>
              </div>
            </div>
          </div>

          {/* ── Framed Desktop Window Preview (With Live Active Engine) ────── */}
          <div
            ref={windowPreviewRef}
            style={{
              maxWidth: '980px',
              margin: '0 auto 70px',
              position: 'relative',
              textAlign: 'left',
            }}
          >
            <div
              style={{
                backgroundColor: '#08080A',
                border: '1px solid rgba(255, 255, 255, 0.14)',
                borderRadius: '18px',
                overflow: 'hidden',
                boxShadow: '0 40px 120px rgba(0, 0, 0, 0.9), 0 0 90px rgba(99, 102, 241, 0.15)',
              }}
            >
              {/* Window Titlebar */}
              <div
                style={{
                  height: '42px',
                  backgroundColor: '#101014',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0 16px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '11px', height: '11px', borderRadius: '50%', backgroundColor: '#FF5F56' }} />
                  <div style={{ width: '11px', height: '11px', borderRadius: '50%', backgroundColor: '#FFBD2E' }} />
                  <div style={{ width: '11px', height: '11px', borderRadius: '50%', backgroundColor: '#27C93F' }} />
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'rgba(255, 255, 255, 0.65)',
                  }}
                >
                  <span>AuraDrop Desktop · Dynamic Island &amp; Proximity Radar</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'rgba(255, 255, 255, 0.4)', fontSize: '13px' }}>
                  <span>🔍</span>
                  <span>⧉</span>
                </div>
              </div>

              {/* Window Content — LIVE INTERACTIVE RUNTIME */}
              <div
                style={{
                  padding: '38px 28px 48px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  background: 'radial-gradient(circle at 50% 25%, rgba(99, 102, 241, 0.09) 0%, transparent 60%), #050507',
                }}
              >
                {/* Floating Dynamic Island Pill */}
                <div
                  style={{
                    backgroundColor: 'rgba(18, 18, 24, 0.96)',
                    border: '1px solid rgba(255, 255, 255, 0.14)',
                    borderRadius: '9999px',
                    padding: '9px 20px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '12px',
                    boxShadow: '0 12px 35px rgba(0, 0, 0, 0.75)',
                    marginBottom: '28px',
                  }}
                >
                  <div
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: peers.length > 0 ? '#34C759' : '#8E8E93',
                      animation: 'pulseDot 1.8s ease-in-out infinite',
                    }}
                  />
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}>
                    {selectedPeer
                      ? `${selectedPeer.name} Connected · Direct LAN Turbo`
                      : peers.length > 0
                      ? `${peers.length} Nearby Device${peers.length > 1 ? 's' : ''} Online`
                      : 'Listening for AuraDrop Android App & nearby devices...'}
                  </span>
                  <span
                    style={{
                      fontSize: '11px',
                      color: '#8E8E93',
                      borderLeft: '1px solid rgba(255, 255, 255, 0.18)',
                      paddingLeft: '10px',
                    }}
                  >
                    {transferProgress && transferProgress.speedBytesPerSec > 0
                      ? `${(transferProgress.speedBytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
                      : 'Zero-Cloud P2P'}
                  </span>
                </div>

                {/* Interactive 3D Globe with Real Nodes */}
                <div style={{ marginBottom: '24px' }}>
                  <HeroGlobe
                    peers={peers}
                    selectedPeerId={selectedPeer?.id}
                    onSelectPeer={(p) => {
                      setSelectedPeer(p);
                      engine.connectToPeer(p);
                    }}
                    isTransferring={Boolean(transferProgress && transferProgress.state === 'TRANSFERRING')}
                    transferSpeed={
                      transferProgress && transferProgress.speedBytesPerSec > 0
                        ? `${(transferProgress.speedBytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
                        : null
                    }
                    size={220}
                  />
                </div>

                {/* Discovered Peer Nodes or Empty State */}
                <div style={{ width: '100%', maxWidth: '720px', marginBottom: '24px' }}>
                  {peers.length > 0 ? (
                    <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', justifyContent: 'center' }}>
                      {peers.map((peer) => {
                        const isSelected = selectedPeer?.id === peer.id;
                        return (
                          <div
                            key={peer.id}
                            onClick={() => {
                              setSelectedPeer(peer);
                              engine.connectToPeer(peer);
                            }}
                            className="cursor-pointer"
                            style={{
                              backgroundColor: isSelected ? 'rgba(99, 102, 241, 0.12)' : '#0F0F14',
                              border: isSelected ? '1px solid rgba(99, 102, 241, 0.5)' : '1px solid rgba(255, 255, 255, 0.08)',
                              borderRadius: '14px',
                              padding: '14px 18px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '12px',
                              flex: '1 1 200px',
                              boxShadow: '0 6px 24px rgba(0, 0, 0, 0.4)',
                            }}
                          >
                            <div style={{ fontSize: '20px' }}>
                              {peer.platform === 'android' ? '📱' : peer.platform === 'windows' ? '💻' : '🌐'}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '14px', fontWeight: 700, color: '#FFFFFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {peer.name}
                              </div>
                              <div style={{ fontSize: '11px', color: '#8E8E93' }}>
                                {peer.connectionState === 'READY_TO_TRANSFER' ? 'Ready to transfer' : 'Connected'}
                              </div>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedPeer(peer);
                                setIsChatOpen(true);
                              }}
                              title="Chat with peer"
                              style={{
                                background: '#1A1A22',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                borderRadius: '8px',
                                color: '#FFFFFF',
                                padding: '6px 10px',
                                fontSize: '11px',
                                cursor: 'pointer',
                              }}
                            >
                              Chat
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div
                      style={{
                        backgroundColor: '#0D0D11',
                        border: '1px solid #202026',
                        borderRadius: '16px',
                        padding: '24px 20px',
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '8px' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#34C759' }} />
                        <span style={{ fontSize: '14px', fontWeight: 700, color: '#FFFFFF' }}>Listening for AuraDrop Android App</span>
                      </div>
                      <p style={{ fontSize: '12px', color: '#8E8E93', margin: '0 auto 16px', maxWidth: '420px', lineHeight: 1.5 }}>
                        Open the AuraDrop Android app on your phone connected to this Wi-Fi. Real devices appear here automatically with zero configuration.
                      </p>
                      <button
                        onClick={() => setIsPairModalOpen(true)}
                        className="cursor-pointer"
                        style={{
                          backgroundColor: '#FFFFFF',
                          border: 'none',
                          borderRadius: '10px',
                          color: '#000000',
                          fontSize: '12px',
                          fontWeight: 700,
                          padding: '8px 18px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <span>📱</span>
                        <span>Pair Android Mobile App</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Real-time Transfer Stream Progress Box */}
                {transferProgress && (
                  <div
                    style={{
                      width: '100%',
                      maxWidth: '720px',
                      backgroundColor: '#0A0A0D',
                      border: '1px solid rgba(255, 255, 255, 0.09)',
                      borderRadius: '14px',
                      padding: '16px 20px',
                      marginBottom: '20px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF' }}>{transferProgress.fileName}</span>
                      <span style={{ fontSize: '12px', color: '#34C759', fontWeight: 600 }}>
                        {Math.round(((transferProgress.transferredBytes || 0) / (transferProgress.fileSize || 1)) * 100)}% · Direct LAN
                      </span>
                    </div>
                    <div style={{ height: '6px', backgroundColor: '#181820', borderRadius: '9999px', overflow: 'hidden', margin: '12px 0 10px' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${Math.round(((transferProgress.transferredBytes || 0) / (transferProgress.fileSize || 1)) * 100)}%`,
                          background: 'linear-gradient(90deg, #6366f1, #38bdf8)',
                          borderRadius: '9999px',
                          transition: 'width 0.2s ease',
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#8E8E93' }}>
                      <span>
                        {(transferProgress.transferredBytes / (1024 * 1024)).toFixed(1)} MB of {(transferProgress.fileSize / (1024 * 1024)).toFixed(1)} MB
                      </span>
                      <span>SHA-256 Checksum Verified</span>
                    </div>
                  </div>
                )}

                {/* Embedded File Sharing Action Controls */}
                <div style={{ width: '100%', maxWidth: '720px' }}>
                  <DockedShareTray
                    files={stagedFiles}
                    onAddFiles={handleRealFilesStaged}
                    onRemoveFile={handleRemoveStagedFile}
                    selectedPeer={selectedPeer}
                    onSend={handleSendRealFiles}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════════
           FEATURES SECTION (AuraDrop Core Engine)
      ══════════════════════════════════════════════════════════════════════════ */}
      <section id="features" style={{ padding: '96px 0', borderTop: '1px solid rgba(255, 255, 255, 0.07)', backgroundColor: '#000000' }}>
        <div style={{ maxWidth: '1220px', margin: '0 auto', padding: '0 28px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255, 255, 255, 0.45)', marginBottom: '14px' }}>
            Engine Capabilities
          </div>
          <h2 style={{ fontSize: 'clamp(32px, 4.2vw, 52px)', fontWeight: 700, letterSpacing: '-0.03em', color: '#FFFFFF', marginBottom: '16px', lineHeight: 1.15 }}>
            Engineered for pure local velocity.
          </h2>
          <p style={{ fontSize: '17px', color: '#8E8E93', maxWidth: '620px', lineHeight: 1.6, marginBottom: '56px' }}>
            AuraDrop bypasses public cloud intermediaries and streams data directly over high-speed local network sockets, Wi-Fi 6/7, and WebRTC data channels.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
            <div className="feature-card" style={{ backgroundColor: '#0A0A0C', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '18px', padding: '34px 28px', transition: 'all 0.2s' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255, 255, 255, 0.35)', marginBottom: '22px' }}>01 / SPEED</div>
              <h3 style={{ fontSize: '21px', fontWeight: 700, color: '#FFFFFF', marginBottom: '12px' }}>100+ MB/s LAN Streaming</h3>
              <p style={{ fontSize: '14px', color: '#8E8E93', lineHeight: 1.65 }}>Direct TCP and HTTP chunked streams transfer raw bytes at the physical throughput limit of your local router without uploading to any external server.</p>
            </div>

            <div className="feature-card" style={{ backgroundColor: '#0A0A0C', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '18px', padding: '34px 28px', transition: 'all 0.2s' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255, 255, 255, 0.35)', marginBottom: '22px' }}>02 / UI</div>
              <h3 style={{ fontSize: '21px', fontWeight: 700, color: '#FFFFFF', marginBottom: '12px' }}>Desktop &amp; Mobile Dynamic Island</h3>
              <p style={{ fontSize: '14px', color: '#8E8E93', lineHeight: 1.65 }}>A native floating pill for Windows desktop mirroring Android’s dynamic island. Track live transfer speeds, ETAs, and connected peers unobtrusively.</p>
            </div>

            <div className="feature-card" style={{ backgroundColor: '#0A0A0C', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '18px', padding: '34px 28px', transition: 'all 0.2s' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255, 255, 255, 0.35)', marginBottom: '22px' }}>03 / SECURITY</div>
              <h3 style={{ fontSize: '21px', fontWeight: 700, color: '#FFFFFF', marginBottom: '12px' }}>Fail-Closed Authentication</h3>
              <p style={{ fontSize: '14px', color: '#8E8E93', lineHeight: 1.65 }}>Single-use cryptographic upload tokens expire in 60 seconds and invalidate immediately upon transfer initiation. Spoofed device IDs receive immediate 403s.</p>
            </div>

            <div className="feature-card" style={{ backgroundColor: '#0A0A0C', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '18px', padding: '34px 28px', transition: 'all 0.2s' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255, 255, 255, 0.35)', marginBottom: '22px' }}>04 / INTEGRITY</div>
              <h3 style={{ fontSize: '21px', fontWeight: 700, color: '#FFFFFF', marginBottom: '12px' }}>SHA-256 Byte Verification</h3>
              <p style={{ fontSize: '14px', color: '#8E8E93', lineHeight: 1.65 }}>Receivers calculate streaming SHA-256 checksums incrementally. Files with mismatched hashes or truncated bytes are automatically rejected.</p>
            </div>

            <div className="feature-card" style={{ backgroundColor: '#0A0A0C', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '18px', padding: '34px 28px', transition: 'all 0.2s' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255, 255, 255, 0.35)', marginBottom: '22px' }}>05 / PRIVACY</div>
              <h3 style={{ fontSize: '21px', fontWeight: 700, color: '#FFFFFF', marginBottom: '12px' }}>Zero-Cloud Local First</h3>
              <p style={{ fontSize: '14px', color: '#8E8E93', lineHeight: 1.65 }}>Devices on the same network discover each other via UDP multicast announcements. No account, no signup, and zero internet upload required.</p>
            </div>

            <div className="feature-card" style={{ backgroundColor: '#0A0A0C', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '18px', padding: '34px 28px', transition: 'all 0.2s' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255, 255, 255, 0.35)', marginBottom: '22px' }}>06 / MESSAGING</div>
              <h3 style={{ fontSize: '21px', fontWeight: 700, color: '#FFFFFF', marginBottom: '12px' }}>Encrypted P2P Chat</h3>
              <p style={{ fontSize: '14px', color: '#8E8E93', lineHeight: 1.65 }}>Send instant messages, code snippets, and clipboard links across devices securely with zero server retention or third-party storage.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════════
           PROTOCOL SECTION (Step-by-Step Flow)
      ══════════════════════════════════════════════════════════════════════════ */}
      <section id="protocol" style={{ padding: '96px 0', borderTop: '1px solid rgba(255, 255, 255, 0.07)', backgroundColor: '#000000' }}>
        <div style={{ maxWidth: '1220px', margin: '0 auto', padding: '0 28px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255, 255, 255, 0.45)', marginBottom: '14px' }}>
            Wire Protocol Flow
          </div>
          <h2 style={{ fontSize: 'clamp(32px, 4.2vw, 52px)', fontWeight: 700, letterSpacing: '-0.03em', color: '#FFFFFF', marginBottom: '16px', lineHeight: 1.15 }}>
            How AuraDrop transfers work.
          </h2>
          <p style={{ fontSize: '17px', color: '#8E8E93', maxWidth: '620px', lineHeight: 1.6, marginBottom: '56px' }}>
            Four deterministic stages guarantee private, zero-latency transfers across any combination of operating systems.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
            <div style={{ backgroundColor: '#070709', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '16px', padding: '28px 24px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '13px', marginBottom: '18px' }}>1</div>
              <h4 style={{ fontSize: '17px', fontWeight: 700, color: '#FFFFFF', marginBottom: '8px' }}>LAN Discovery</h4>
              <p style={{ fontSize: '13px', color: '#8E8E93', lineHeight: 1.6 }}>Devices announce presence via UDP multicast and local WebSocket heartbeats. Peer IP addresses are resolved instantly.</p>
            </div>
            <div style={{ backgroundColor: '#070709', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '16px', padding: '28px 24px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '13px', marginBottom: '18px' }}>2</div>
              <h4 style={{ fontSize: '17px', fontWeight: 700, color: '#FFFFFF', marginBottom: '8px' }}>Token Handshake</h4>
              <p style={{ fontSize: '13px', color: '#8E8E93', lineHeight: 1.6 }}>Sender requests a single-use authorization token. The receiver verifies sender identity and derives an ephemeral key.</p>
            </div>
            <div style={{ backgroundColor: '#070709', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '16px', padding: '28px 24px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '13px', marginBottom: '18px' }}>3</div>
              <h4 style={{ fontSize: '17px', fontWeight: 700, color: '#FFFFFF', marginBottom: '8px' }}>Direct Streaming</h4>
              <p style={{ fontSize: '13px', color: '#8E8E93', lineHeight: 1.6 }}>Bytes stream directly over high-throughput local sockets or WebRTC data channels, utilizing 100% of available LAN bandwidth.</p>
            </div>
            <div style={{ backgroundColor: '#070709', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '16px', padding: '28px 24px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '13px', marginBottom: '18px' }}>4</div>
              <h4 style={{ fontSize: '17px', fontWeight: 700, color: '#FFFFFF', marginBottom: '8px' }}>Checksum Audit</h4>
              <p style={{ fontSize: '13px', color: '#8E8E93', lineHeight: 1.6 }}>The receiver verifies exact byte length and SHA-256 hash before flushing the file to disk or the Android MediaStore gallery.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════════
           DYNAMIC ISLAND SHOWCASE
      ══════════════════════════════════════════════════════════════════════════ */}
      <section id="dynamic-island" style={{ padding: '96px 0', borderTop: '1px solid rgba(255, 255, 255, 0.07)', backgroundColor: '#000000' }}>
        <div style={{ maxWidth: '1220px', margin: '0 auto', padding: '0 28px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255, 255, 255, 0.45)', marginBottom: '14px' }}>
            Native Island Experience
          </div>
          <h2 style={{ fontSize: 'clamp(32px, 4.2vw, 52px)', fontWeight: 700, letterSpacing: '-0.03em', color: '#FFFFFF', marginBottom: '16px', lineHeight: 1.15 }}>
            Desktop &amp; Android Dynamic Island.
          </h2>
          <p style={{ fontSize: '17px', color: '#8E8E93', maxWidth: '620px', lineHeight: 1.6, marginBottom: '56px' }}>
            Enjoy the frictionless convenience of Apple AirDrop with native floating pills on Windows desktop and Android notifications.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px' }}>
            <div style={{ backgroundColor: '#08080A', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '16px', padding: '26px' }}>
              <div style={{ fontSize: '22px', marginBottom: '14px' }}>🪟</div>
              <h4 style={{ fontSize: '16px', fontWeight: 700, color: '#FFFFFF', marginBottom: '8px' }}>Windows Native Pill</h4>
              <p style={{ fontSize: '13px', color: '#8E8E93', lineHeight: 1.6 }}>Floating status overlay at the top of your screen displaying real-time transfer progress, speed in MB/s, and quick actions.</p>
            </div>
            <div style={{ backgroundColor: '#08080A', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '16px', padding: '26px' }}>
              <div style={{ fontSize: '22px', marginBottom: '14px' }}>🤖</div>
              <h4 style={{ fontSize: '16px', fontWeight: 700, color: '#FFFFFF', marginBottom: '8px' }}>Android Live Island</h4>
              <p style={{ fontSize: '13px', color: '#8E8E93', lineHeight: 1.6 }}>Foreground service notification pill with live progress, one-tap accept/decline, and automatic gallery integration.</p>
            </div>
            <div style={{ backgroundColor: '#08080A', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '16px', padding: '26px' }}>
              <div style={{ fontSize: '22px', marginBottom: '14px' }}>⚡</div>
              <h4 style={{ fontSize: '16px', fontWeight: 700, color: '#FFFFFF', marginBottom: '8px' }}>Instant Peer Discovery</h4>
              <p style={{ fontSize: '13px', color: '#8E8E93', lineHeight: 1.6 }}>Pulsing radar indicator updates dynamically as new Android phones, PCs, or browsers enter your local network.</p>
            </div>
            <div style={{ backgroundColor: '#08080A', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '16px', padding: '26px' }}>
              <div style={{ fontSize: '22px', marginBottom: '14px' }}>🛡️</div>
              <h4 style={{ fontSize: '16px', fontWeight: 700, color: '#FFFFFF', marginBottom: '8px' }}>Checksum Verified</h4>
              <p style={{ fontSize: '13px', color: '#8E8E93', lineHeight: 1.6 }}>Live green check appears the millisecond all bytes are verified against the SHA-256 manifest hash.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════════
           SECURITY MANIFESTO
      ══════════════════════════════════════════════════════════════════════════ */}
      <section id="security" style={{ padding: '96px 0', borderTop: '1px solid rgba(255, 255, 255, 0.07)', backgroundColor: '#000000' }}>
        <div style={{ maxWidth: '1220px', margin: '0 auto', padding: '0 28px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255, 255, 255, 0.45)', marginBottom: '14px' }}>
            Security Manifesto
          </div>
          <h2 style={{ fontSize: 'clamp(32px, 4.2vw, 52px)', fontWeight: 700, letterSpacing: '-0.03em', color: '#FFFFFF', marginBottom: '16px', lineHeight: 1.15 }}>
            Verified on every byte.
          </h2>
          <p style={{ fontSize: '17px', color: '#8E8E93', maxWidth: '620px', lineHeight: 1.6, marginBottom: '56px' }}>
            AuraDrop is built with zero-trust local boundaries and cryptographic verification across every phase.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
            <div className="feature-card" style={{ backgroundColor: '#0A0A0C', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '18px', padding: '34px 28px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255, 255, 255, 0.35)', marginBottom: '22px' }}>SEC / 01</div>
              <h3 style={{ fontSize: '21px', fontWeight: 700, color: '#FFFFFF', marginBottom: '12px' }}>Single-Use Tokens</h3>
              <p style={{ fontSize: '14px', color: '#8E8E93', lineHeight: 1.65 }}>One-time tokens expire in 60s and are invalidated upon stream initiation. Replayed tokens receive an immediate 403.</p>
            </div>
            <div className="feature-card" style={{ backgroundColor: '#0A0A0C', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '18px', padding: '34px 28px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255, 255, 255, 0.35)', marginBottom: '22px' }}>SEC / 02</div>
              <h3 style={{ fontSize: '21px', fontWeight: 700, color: '#FFFFFF', marginBottom: '12px' }}>Zero Server Staging</h3>
              <p style={{ fontSize: '14px', color: '#8E8E93', lineHeight: 1.65 }}>Files stream device-to-device over LAN sockets. Signaling servers only negotiate handshakes and never touch raw payload bytes.</p>
            </div>
            <div className="feature-card" style={{ backgroundColor: '#0A0A0C', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '18px', padding: '34px 28px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255, 255, 255, 0.35)', marginBottom: '22px' }}>SEC / 03</div>
              <h3 style={{ fontSize: '21px', fontWeight: 700, color: '#FFFFFF', marginBottom: '12px' }}>SHA-256 Checksum</h3>
              <p style={{ fontSize: '14px', color: '#8E8E93', lineHeight: 1.65 }}>Streaming hashes computed incrementally. Exact byte count and SHA-256 checksum must match or file is quarantined.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════════
           OFFICIAL DOWNLOADS SECTION
      ══════════════════════════════════════════════════════════════════════════ */}
      <section id="downloads" style={{ padding: '96px 0', borderTop: '1px solid rgba(255, 255, 255, 0.07)', backgroundColor: '#000000' }}>
        <div style={{ maxWidth: '1220px', margin: '0 auto', padding: '0 28px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255, 255, 255, 0.45)', marginBottom: '14px' }}>
            Available Releases
          </div>
          <h2 style={{ fontSize: 'clamp(32px, 4.2vw, 52px)', fontWeight: 700, letterSpacing: '-0.03em', color: '#FFFFFF', marginBottom: '16px', lineHeight: 1.15 }}>
            Download AuraDrop v2.0.1
          </h2>
          <p style={{ fontSize: '17px', color: '#8E8E93', maxWidth: '620px', lineHeight: 1.6, marginBottom: '56px' }}>
            Official production binaries. Signed installers for Windows, direct APK for Android, and instant zero-install browser sharing.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
            {/* Windows Card */}
            <div style={{ backgroundColor: '#0A0A0C', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '20px', padding: '34px', textAlign: 'left', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <span style={{ fontSize: '28px' }}>🪟</span>
                    <div>
                      <div style={{ fontSize: '20px', fontWeight: 800, color: '#FFFFFF' }}>Windows Desktop</div>
                      <div style={{ fontSize: '12px', color: '#8E8E93' }}>v2.0.1 · Windows 10 / 11 (x64)</div>
                    </div>
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '9999px', backgroundColor: 'rgba(52, 199, 89, 0.12)', color: '#34C759', border: '1px solid rgba(52, 199, 89, 0.25)' }}>
                    Dynamic Island Included
                  </span>
                </div>
                <p style={{ fontSize: '14px', color: '#8E8E93', lineHeight: 1.6, marginBottom: '26px' }}>
                  Tauri native application featuring the floating pill Dynamic Island, local LAN HTTP streaming server, and automatic device proximity detection.
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <a
                  href="/downloads/AuraDrop-Setup.exe"
                  download="AuraDrop-Setup.exe"
                  className="cursor-pointer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '13px 20px',
                    borderRadius: '12px',
                    backgroundColor: '#FFFFFF',
                    color: '#000000',
                    textDecoration: 'none',
                    fontSize: '14px',
                    fontWeight: 700,
                  }}
                >
                  <span>Download Installer (.exe)</span>
                  <span>5.96 MB</span>
                </a>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <a
                    href="/downloads/AuraDrop-Windows.msi"
                    download="AuraDrop-Windows.msi"
                    className="cursor-pointer"
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                      borderRadius: '12px',
                      backgroundColor: '#121216',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      color: '#FFFFFF',
                      textDecoration: 'none',
                      fontSize: '13px',
                      fontWeight: 600,
                    }}
                  >
                    <span>MSI</span>
                    <span>9.25 MB</span>
                  </a>
                  <a
                    href="/downloads/AuraDrop-Windows.zip"
                    download="AuraDrop-Windows.zip"
                    className="cursor-pointer"
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                      borderRadius: '12px',
                      backgroundColor: '#121216',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      color: '#FFFFFF',
                      textDecoration: 'none',
                      fontSize: '13px',
                      fontWeight: 600,
                    }}
                  >
                    <span>ZIP</span>
                    <span>8.42 MB</span>
                  </a>
                </div>
              </div>
            </div>

            {/* Android Card */}
            <div style={{ backgroundColor: '#0A0A0C', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '20px', padding: '34px', textAlign: 'left', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <span style={{ fontSize: '28px' }}>🤖</span>
                    <div>
                      <div style={{ fontSize: '20px', fontWeight: 800, color: '#FFFFFF' }}>Android Mobile</div>
                      <div style={{ fontSize: '12px', color: '#8E8E93' }}>v2.0.1 · Android 8.0+ (ARM64)</div>
                    </div>
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '9999px', backgroundColor: 'rgba(52, 199, 89, 0.12)', color: '#34C759', border: '1px solid rgba(52, 199, 89, 0.25)' }}>
                    Dynamic Island Ready
                  </span>
                </div>
                <p style={{ fontSize: '14px', color: '#8E8E93', lineHeight: 1.6, marginBottom: '26px' }}>
                  Flutter app featuring native Android notification Dynamic Island, high-speed local HTTP socket server, SHA-256 integrity verification, and P2P messaging.
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <a
                  href="https://github.com/JACK-AI7/AuraDrop/releases/download/v2.0.1/AuraDrop-Android.apk"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cursor-pointer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '13px 20px',
                    borderRadius: '12px',
                    backgroundColor: '#FFFFFF',
                    color: '#000000',
                    textDecoration: 'none',
                    fontSize: '14px',
                    fontWeight: 700,
                  }}
                >
                  <span>Download Direct APK</span>
                  <span>113.7 MB</span>
                </a>
                <a
                  href="https://github.com/JACK-AI7/AuraDrop/releases"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cursor-pointer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 18px',
                    borderRadius: '12px',
                    backgroundColor: '#121216',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    color: '#FFFFFF',
                    textDecoration: 'none',
                    fontSize: '13px',
                    fontWeight: 600,
                  }}
                >
                  <span>View Releases on GitHub ↗</span>
                  <span>Notes</span>
                </a>
              </div>
            </div>

            {/* Web Browser Card */}
            <div style={{ backgroundColor: '#0A0A0C', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '20px', padding: '34px', textAlign: 'left', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <span style={{ fontSize: '28px' }}>🌐</span>
                    <div>
                      <div style={{ fontSize: '20px', fontWeight: 800, color: '#FFFFFF' }}>AuraDrop Web App</div>
                      <div style={{ fontSize: '12px', color: '#8E8E93' }}>v2.0.1 · Chrome, Edge, Safari, Firefox</div>
                    </div>
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '9999px', backgroundColor: 'rgba(52, 199, 89, 0.12)', color: '#34C759', border: '1px solid rgba(52, 199, 89, 0.25)' }}>
                    Zero Install
                  </span>
                </div>
                <p style={{ fontSize: '14px', color: '#8E8E93', lineHeight: 1.6, marginBottom: '26px' }}>
                  No download or installation required. Share files instantly across browsers using direct WebRTC DataChannels and local Wi-Fi device discovery.
                </p>
              </div>

              <button
                onClick={scrollToPreview}
                className="cursor-pointer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '13px 20px',
                  borderRadius: '12px',
                  backgroundColor: '#FFFFFF',
                  color: '#000000',
                  fontSize: '14px',
                  fontWeight: 700,
                  border: 'none',
                }}
              >
                <span>Launch Web Transfer ↗</span>
                <span>Instant</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════════
           FOOTER (Codex Style, AuraDrop Branded)
      ══════════════════════════════════════════════════════════════════════════ */}
      <footer style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', padding: '64px 0 36px', backgroundColor: '#000000' }}>
        <div style={{ maxWidth: '1220px', margin: '0 auto', padding: '0 28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '36px' }}>
            <div style={{ maxWidth: '340px', textAlign: 'left' }}>
              <a href="/" className="cursor-pointer" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none', color: '#FFFFFF' }}>
                <img src="/logo.png" alt="AuraDrop" width="24" height="24" style={{ borderRadius: '6px', objectFit: 'contain' }} />
                <span style={{ fontSize: '17px', fontWeight: 800 }}>AuraDrop</span>
              </a>
              <p style={{ fontSize: '13px', color: '#8E8E93', marginTop: '12px', lineHeight: 1.6 }}>
                High-speed local peer-to-peer file sharing and messaging across Android, Windows, and Web.
              </p>
            </div>

            <ul style={{ display: 'flex', gap: '52px', listStyle: 'none', padding: 0 }}>
              <li><a href="https://github.com/JACK-AI7/AuraDrop" target="_blank" rel="noopener noreferrer" className="nav-link cursor-pointer">GitHub</a></li>
              <li><a href="https://github.com/JACK-AI7/AuraDrop/releases" target="_blank" rel="noopener noreferrer" className="nav-link cursor-pointer">Releases</a></li>
              <li><a href="https://github.com/JACK-AI7/AuraDrop/issues" target="_blank" rel="noopener noreferrer" className="nav-link cursor-pointer">Issues</a></li>
              <li><a href="https://github.com/JACK-AI7/AuraDrop/blob/main/README.md" target="_blank" rel="noopener noreferrer" className="nav-link cursor-pointer">Documentation</a></li>
            </ul>
          </div>

          <div style={{ marginTop: '50px', paddingTop: '24px', borderTop: '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#48484A' }}>
            <span>© 2026 AuraDrop. Open source under the MIT License.</span>
            <span>Version 2.0.1</span>
          </div>
        </div>
      </footer>

      {/* ══════════════════════════════════════════════════════════════════════════
           INCOMING REQUEST PROMPT
      ══════════════════════════════════════════════════════════════════════════ */}
      {incomingRequest && (
        <div
          style={{
            position: 'fixed',
            bottom: '30px',
            right: '30px',
            backgroundColor: '#0F0F14',
            border: '1px solid rgba(99, 102, 241, 0.5)',
            borderRadius: '16px',
            padding: '20px 24px',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8)',
            zIndex: 9999,
            maxWidth: '380px',
          }}
        >
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#FFFFFF', marginBottom: '6px' }}>
            Incoming Transfer Request
          </div>
          <div style={{ fontSize: '12px', color: '#8E8E93', marginBottom: '14px' }}>
            <strong>{incomingRequest.senderName}</strong> wants to send you <strong>{incomingRequest.fileName}</strong> ({(incomingRequest.fileSize / (1024 * 1024)).toFixed(1)} MB)
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={handleAcceptTransfer}
              style={{
                flex: 1,
                padding: '8px 14px',
                borderRadius: '8px',
                backgroundColor: '#FFFFFF',
                color: '#000000',
                fontWeight: 700,
                fontSize: '12px',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Accept
            </button>
            <button
              onClick={handleDeclineTransfer}
              style={{
                flex: 1,
                padding: '8px 14px',
                borderRadius: '8px',
                backgroundColor: '#1E1E24',
                color: '#FFFFFF',
                fontWeight: 600,
                fontSize: '12px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                cursor: 'pointer',
              }}
            >
              Decline
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
           MODALS
      ══════════════════════════════════════════════════════════════════════════ */}
      <DevicePairModal
        isOpen={isPairModalOpen}
        onClose={() => setIsPairModalOpen(false)}
        localId={engine.localId}
        localName={engine.localName}
        peers={peers}
      />
      <ChatModal isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} peer={selectedPeer} />
      <TransferHistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        history={transferHistory}
      />
      <DiagnosticsModal isOpen={isDiagnosticsOpen} onClose={() => setIsDiagnosticsOpen(false)} />
      <DownloadsModal isOpen={isDownloadsOpen} onClose={() => setIsDownloadsOpen(false)} />
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        visibility={visibility}
        onVisibilityChange={setVisibility}
      />
      <ProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        deviceName={engine.localName}
      />
    </div>
  );
};
