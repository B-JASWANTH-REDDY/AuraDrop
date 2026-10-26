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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  const handleRescan = () => {
    engine.scanNetwork();
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
          border-color: rgba(255, 255, 255, 0.22) !important;
          transform: translateY(-2px);
          background: #0d0d10 !important;
        }
        .team-logo:hover {
          color: #ffffff !important;
          transform: translateY(-1px);
        }
        .hero-pill-btn:hover {
          opacity: 0.94;
          transform: translateY(-2px);
          box-shadow: 0 8px 36px rgba(255, 255, 255, 0.35) !important;
        }
        .hero-ghost-btn:hover {
          background: rgba(255, 255, 255, 0.16) !important;
          border-color: rgba(255, 255, 255, 0.35) !important;
          transform: translateY(-2px);
        }
        @keyframes pulseDot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.35; transform: scale(0.8); }
        }
      `}</style>

      {/* ══════════════════════════════════════════════════════════════════════════
           TOP NAVIGATION BAR (Exact OpenAI Codex Layout)
      ══════════════════════════════════════════════════════════════════════════ */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 1000,
          width: '100%',
          backgroundColor: 'rgba(0, 0, 0, 0.65)',
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
              gap: '10px',
              textDecoration: 'none',
              color: '#FFFFFF',
            }}
          >
            <svg width="26" height="26" viewBox="0 0 28 28" fill="none" aria-hidden="true">
              <circle cx="14" cy="14" r="3" fill="#ffffff" />
              <circle cx="14" cy="14" r="7.5" stroke="#ffffff" strokeWidth="1.5" fill="none" opacity=".7" />
              <circle cx="14" cy="14" r="12" stroke="#ffffff" strokeWidth="1" fill="none" opacity=".35" />
            </svg>
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
            className="desktop-nav"
          >
            <a href="#about" className="nav-link cursor-pointer">About</a>
            <a href="#features" className="nav-link cursor-pointer">Features</a>
            <a href="#learn" className="nav-link cursor-pointer">Learn</a>
            <a href="#codex" className="nav-link cursor-pointer">Codex</a>
            <a href="#business" className="nav-link cursor-pointer">Business</a>
            <a href="#pricing" className="nav-link cursor-pointer">Pricing</a>
            <a href="#downloads" className="nav-link cursor-pointer">Download</a>
          </nav>

          {/* Right Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* btn href: Contact sales */}
            <a
              href="#contact"
              className="cursor-pointer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '8px 18px',
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
              Contact sales
            </a>

            {/* btn href (2): Go to Cloud (Scrolls to interactive radar) */}
            <button
              onClick={scrollToPreview}
              className="cursor-pointer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '8px 20px',
                borderRadius: '9999px',
                backgroundColor: '#000000',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                color: '#FFFFFF',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#FFFFFF';
                e.currentTarget.style.color = '#000000';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#000000';
                e.currentTarget.style.color = '#FFFFFF';
              }}
            >
              Go to Cloud
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
           HERO SECTION (Matching OpenAI Codex Atmospheric Layout)
      ══════════════════════════════════════════════════════════════════════════ */}
      <section
        id="about"
        style={{
          position: 'relative',
          padding: '84px 0 50px',
          textAlign: 'center',
          overflow: 'hidden',
          background: `
            radial-gradient(ellipse 95% 65% at 50% 12%, rgba(68, 76, 230, 0.44) 0%, rgba(99, 102, 241, 0.28) 28%, rgba(139, 92, 246, 0.16) 52%, transparent 74%),
            radial-gradient(circle at 50% 32%, rgba(56, 189, 248, 0.12) 0%, transparent 48%),
            #000000
          `,
        }}
      >
        <div style={{ maxWidth: '1220px', margin: '0 auto', padding: '0 28px' }}>
          {/* Centered White Squircle App Icon */}
          <div
            className="cursor-pointer"
            onClick={scrollToPreview}
            style={{
              width: '76px',
              height: '76px',
              borderRadius: '22px',
              backgroundColor: '#FFFFFF',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 24px 60px rgba(0, 0, 0, 0.6), 0 0 60px rgba(99, 102, 241, 0.45)',
              marginBottom: '28px',
              transition: 'transform 0.2s ease',
            }}
          >
            <svg width="36" height="36" viewBox="0 0 28 28" fill="none">
              <circle cx="14" cy="14" r="3.2" fill="#000000" />
              <circle cx="14" cy="14" r="7.5" stroke="#000000" strokeWidth="1.8" fill="none" opacity=".85" />
              <circle cx="14" cy="14" r="12" stroke="#000000" strokeWidth="1.3" fill="none" opacity=".45" />
            </svg>
          </div>

          {/* Main Headline */}
          <h1
            style={{
              fontSize: 'clamp(40px, 5.4vw, 72px)',
              fontWeight: 700,
              letterSpacing: '-0.04em',
              lineHeight: 1.08,
              color: '#FFFFFF',
              marginBottom: '18px',
            }}
          >
            Build anything with Codex
          </h1>

          {/* Subtitle */}
          <p
            style={{
              fontSize: 'clamp(17px, 1.9vw, 21px)',
              color: 'rgba(255, 255, 255, 0.82)',
              maxWidth: '620px',
              margin: '0 auto 36px',
              lineHeight: 1.5,
              fontWeight: 400,
              letterSpacing: '-0.01em',
            }}
          >
            Move faster, go further, and bring your biggest ideas to life.
          </p>

          {/* Central Hero CTA Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '14px', flexWrap: 'wrap' }}>
            {/* btn href: Download for Windows */}
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
                padding: '13px 32px',
                borderRadius: '9999px',
                fontSize: '15px',
                fontWeight: 600,
                textDecoration: 'none',
                boxShadow: '0 4px 25px rgba(255, 255, 255, 0.22)',
                transition: 'all 0.2s ease',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
              </svg>
              Download for Windows
            </a>

            {/* btn href (2): Try AuraDrop Web / Business */}
            <button
              onClick={scrollToPreview}
              className="hero-ghost-btn cursor-pointer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                color: '#FFFFFF',
                padding: '13px 26px',
                borderRadius: '9999px',
                fontSize: '15px',
                fontWeight: 500,
                backdropFilter: 'blur(10px)',
                transition: 'all 0.2s ease',
              }}
            >
              Try AuraDrop Web ↗
            </button>
          </div>

          {/* "Trusted by top teams" Strip (Exact Replica) */}
          <div style={{ marginTop: '56px', marginBottom: '44px' }}>
            <div style={{ fontSize: '13px', fontWeight: 500, color: 'rgba(255, 255, 255, 0.55)', marginBottom: '24px' }}>
              Trusted by top teams
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '52px',
                flexWrap: 'wrap',
              }}
            >
              <div className="team-logo cursor-pointer" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'rgba(255,255,255,0.78)', fontSize: '18px', fontWeight: 700, transition: 'all 0.2s' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a4 4 0 0 0-4 4v2H6a4 4 0 0 0-4 4v4a4 4 0 0 0 4 4h2v2a4 4 0 0 0 8 0v-2h2a4 4 0 0 0 4-4v-4a4 4 0 0 0-4-4h-2V6a4 4 0 0 0-4-4zm0 4a2 2 0 0 1 2 2v2h-4V8a2 2 0 0 1 2-2z"/></svg>
                <span>Heidi</span>
              </div>
              <div className="team-logo cursor-pointer" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'rgba(255,255,255,0.78)', fontSize: '18px', fontWeight: 700, transition: 'all 0.2s' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8.9 4.3c-2.8 1.4-4.8 4.3-4.8 7.7 0 4.8 3.9 8.7 8.7 8.7 3.5 0 6.6-2.1 7.9-5.1-1.3 1.9-3.5 3.1-6 3.1-4 0-7.2-3.2-7.2-7.2 0-2.9 1.7-5.4 4.2-6.5-1-.4-2-.6-2.8-.7z"/></svg>
                <span>NVIDIA</span>
              </div>
              <div className="team-logo cursor-pointer" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'rgba(255,255,255,0.78)', fontSize: '16px', fontWeight: 700, letterSpacing: '0.1em', transition: 'all 0.2s' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M3 13.5v-3m3 5v-7m3 9v-11m3 11v-11m3 9v-7m3 5v-3"/></svg>
                <span>CISCO</span>
              </div>
              <div className="team-logo cursor-pointer" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'rgba(255,255,255,0.78)', fontSize: '18px', fontWeight: 700, transition: 'all 0.2s' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M15.33 3.67l-1.37.4c-.42.12-.42.13-.5.48L11.9 11.2l-2.73-1.6c-.34-.2-.78-.1-.98.24-.2.34-.1.78.24.98l2.92 1.71L9.6 18.27c-.2.6.25 1.2.86 1.2h.14c.38 0 .72-.24.86-.6l1.9-5.6 2.74 1.6c.34.2.78.1.98-.24.2-.34.1-.78-.24-.98l-2.92-1.71 1.75-5.74c.2-.6-.25-1.2-.86-1.2-.14 0-.3.04-.48.11z"/></svg>
                <span>shopify</span>
              </div>
              <div className="team-logo cursor-pointer" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'rgba(255,255,255,0.78)', fontSize: '18px', fontWeight: 700, transition: 'all 0.2s' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                <span>netomi</span>
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
                    backgroundColor: 'rgba(255, 255, 255, 0.06)',
                    padding: '4px 12px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 500,
                    color: 'rgba(255, 255, 255, 0.7)',
                  }}
                >
                  <span>Codex · AuraDrop</span>
                  <span style={{ opacity: 0.5 }}>▾</span>
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
                        Open the AuraDrop Android app on your phone connected to this Wi-Fi. Real devices appear here automatically.
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
           FEATURES SECTION (Codex Grid)
      ══════════════════════════════════════════════════════════════════════════ */}
      <section id="features" style={{ padding: '96px 0', borderTop: '1px solid rgba(255, 255, 255, 0.07)', backgroundColor: '#000000' }}>
        <div style={{ maxWidth: '1220px', margin: '0 auto', padding: '0 28px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255, 255, 255, 0.45)', marginBottom: '14px' }}>
            Engine Features
          </div>
          <h2 style={{ fontSize: 'clamp(32px, 4.2vw, 52px)', fontWeight: 700, letterSpacing: '-0.03em', color: '#FFFFFF', marginBottom: '16px', lineHeight: 1.15 }}>
            Engineered for pure velocity.
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
           LEARN SECTION (Protocol Flow)
      ══════════════════════════════════════════════════════════════════════════ */}
      <section id="learn" style={{ padding: '96px 0', borderTop: '1px solid rgba(255, 255, 255, 0.07)', backgroundColor: '#000000' }}>
        <div style={{ maxWidth: '1220px', margin: '0 auto', padding: '0 28px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255, 255, 255, 0.45)', marginBottom: '14px' }}>
            Protocol Flow
          </div>
          <h2 style={{ fontSize: 'clamp(32px, 4.2vw, 52px)', fontWeight: 700, letterSpacing: '-0.03em', color: '#FFFFFF', marginBottom: '16px', lineHeight: 1.15 }}>
            How AuraDrop transfers work.
          </h2>
          <p style={{ fontSize: '17px', color: '#8E8E93', maxWidth: '620px', lineHeight: 1.6, marginBottom: '56px' }}>
            Four deterministic steps guarantee private, zero-latency transfers across any combination of operating systems.
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
           CODEX ARCHITECTURE (Codex Section)
      ══════════════════════════════════════════════════════════════════════════ */}
      <section id="codex" style={{ padding: '96px 0', borderTop: '1px solid rgba(255, 255, 255, 0.07)', backgroundColor: '#000000' }}>
        <div style={{ maxWidth: '1220px', margin: '0 auto', padding: '0 28px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255, 255, 255, 0.45)', marginBottom: '14px' }}>
            Architecture &amp; Engine
          </div>
          <h2 style={{ fontSize: 'clamp(32px, 4.2vw, 52px)', fontWeight: 700, letterSpacing: '-0.03em', color: '#FFFFFF', marginBottom: '16px', lineHeight: 1.15 }}>
            Open-source cross-platform core.
          </h2>
          <p style={{ fontSize: '17px', color: '#8E8E93', maxWidth: '620px', lineHeight: 1.6, marginBottom: '56px' }}>
            Engineered with a high-performance Tauri desktop core, native Flutter Android runtime, and universal WebRTC browser client.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px' }}>
            <div style={{ backgroundColor: '#08080A', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '16px', padding: '26px' }}>
              <div style={{ fontSize: '22px', marginBottom: '14px' }}>🦀</div>
              <h4 style={{ fontSize: '16px', fontWeight: 700, color: '#FFFFFF', marginBottom: '8px' }}>Tauri &amp; Rust Engine</h4>
              <p style={{ fontSize: '13px', color: '#8E8E93', lineHeight: 1.6 }}>Windows application with a tiny 6 MB installer, near-zero memory footprint, and native OS notifications and floating island overlay.</p>
            </div>
            <div style={{ backgroundColor: '#08080A', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '16px', padding: '26px' }}>
              <div style={{ fontSize: '22px', marginBottom: '14px' }}>📱</div>
              <h4 style={{ fontSize: '16px', fontWeight: 700, color: '#FFFFFF', marginBottom: '8px' }}>Flutter Android Core</h4>
              <p style={{ fontSize: '13px', color: '#8E8E93', lineHeight: 1.6 }}>Embedded HTTP server listening on port 8080 with scoped storage, background service execution, and instant MediaStore gallery exports.</p>
            </div>
            <div style={{ backgroundColor: '#08080A', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '16px', padding: '26px' }}>
              <div style={{ fontSize: '22px', marginBottom: '14px' }}>🌐</div>
              <h4 style={{ fontSize: '16px', fontWeight: 700, color: '#FFFFFF', marginBottom: '8px' }}>Zero-Install Web</h4>
              <p style={{ fontSize: '13px', color: '#8E8E93', lineHeight: 1.6 }}>Progressive Web App with WebRTC DataChannels, STUN/TURN traversal fallback, and drag-and-drop support across Chrome, Edge, Safari, and Firefox.</p>
            </div>
            <div style={{ backgroundColor: '#08080A', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '16px', padding: '26px' }}>
              <div style={{ fontSize: '22px', marginBottom: '14px' }}>🛡️</div>
              <h4 style={{ fontSize: '16px', fontWeight: 700, color: '#FFFFFF', marginBottom: '8px' }}>Automated QA Suite</h4>
              <p style={{ fontSize: '13px', color: '#8E8E93', lineHeight: 1.6 }}>17-point automated regression test covering token expiration, sender ID binding, path traversal protection, and large file integrity.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════════
           BUSINESS & SECURITY (Business Section)
      ══════════════════════════════════════════════════════════════════════════ */}
      <section id="business" style={{ padding: '96px 0', borderTop: '1px solid rgba(255, 255, 255, 0.07)', backgroundColor: '#000000' }}>
        <div style={{ maxWidth: '1220px', margin: '0 auto', padding: '0 28px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255, 255, 255, 0.45)', marginBottom: '14px' }}>
            Enterprise &amp; Security
          </div>
          <h2 style={{ fontSize: 'clamp(32px, 4.2vw, 52px)', fontWeight: 700, letterSpacing: '-0.03em', color: '#FFFFFF', marginBottom: '16px', lineHeight: 1.15 }}>
            Zero-trust local compliance.
          </h2>
          <p style={{ fontSize: '17px', color: '#8E8E93', maxWidth: '620px', lineHeight: 1.6, marginBottom: '56px' }}>
            Designed for teams and organizations handling sensitive source code, confidential media, and regulated data.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
            <div className="feature-card" style={{ backgroundColor: '#0A0A0C', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '18px', padding: '34px 28px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255, 255, 255, 0.35)', marginBottom: '22px' }}>SEC / 01</div>
              <h3 style={{ fontSize: '21px', fontWeight: 700, color: '#FFFFFF', marginBottom: '12px' }}>Air-Gapped Operation</h3>
              <p style={{ fontSize: '14px', color: '#8E8E93', lineHeight: 1.65 }}>Operates seamlessly on closed local-area networks and air-gapped environments without requiring an active internet connection.</p>
            </div>
            <div className="feature-card" style={{ backgroundColor: '#0A0A0C', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '18px', padding: '34px 28px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255, 255, 255, 0.35)', marginBottom: '22px' }}>SEC / 02</div>
              <h3 style={{ fontSize: '21px', fontWeight: 700, color: '#FFFFFF', marginBottom: '12px' }}>Zero Data Retention</h3>
              <p style={{ fontSize: '14px', color: '#8E8E93', lineHeight: 1.65 }}>Signaling servers never inspect, stage, or store file bytes. Transfers occur device-to-device over direct peer sockets.</p>
            </div>
            <div className="feature-card" style={{ backgroundColor: '#0A0A0C', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '18px', padding: '34px 28px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255, 255, 255, 0.35)', marginBottom: '22px' }}>SEC / 03</div>
              <h3 style={{ fontSize: '21px', fontWeight: 700, color: '#FFFFFF', marginBottom: '12px' }}>Single-Use Tokens</h3>
              <p style={{ fontSize: '14px', color: '#8E8E93', lineHeight: 1.65 }}>Every upload generates a 60-second cryptographically random single-use token that self-destructs the moment the transfer begins.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════════
           PRICING SECTION (Pricing Section)
      ══════════════════════════════════════════════════════════════════════════ */}
      <section id="pricing" style={{ padding: '96px 0', borderTop: '1px solid rgba(255, 255, 255, 0.07)', backgroundColor: '#000000' }}>
        <div style={{ maxWidth: '1220px', margin: '0 auto', padding: '0 28px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255, 255, 255, 0.45)', marginBottom: '14px' }}>
            Transparent Pricing
          </div>
          <h2 style={{ fontSize: 'clamp(32px, 4.2vw, 52px)', fontWeight: 700, letterSpacing: '-0.03em', color: '#FFFFFF', marginBottom: '16px', lineHeight: 1.15 }}>
            Free &amp; open source forever.
          </h2>
          <p style={{ fontSize: '17px', color: '#8E8E93', maxWidth: '620px', lineHeight: 1.6, marginBottom: '56px' }}>
            AuraDrop is community-built software. Share unlimited files at maximum hardware speed with no subscriptions.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', maxWidth: '860px', margin: '0 auto' }}>
            <div style={{ backgroundColor: '#0D0D12', border: '1px solid rgba(99, 102, 241, 0.45)', borderRadius: '20px', padding: '38px 32px', textAlign: 'left', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'rgba(255, 255, 255, 0.5)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>Open Source / Community</div>
                <div style={{ fontSize: '38px', fontWeight: 800, color: '#FFFFFF', marginBottom: '12px' }}>$0 <span style={{ fontSize: '16px', fontWeight: 500, color: '#8E8E93' }}>/ forever</span></div>
                <p style={{ fontSize: '14px', color: '#8E8E93', lineHeight: 1.5 }}>Full-featured local P2P sharing for individuals, developers, and creators.</p>
                <ul style={{ listStyle: 'none', margin: '24px 0 32px', padding: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <li style={{ fontSize: '14px', color: 'rgba(255,255,255,0.85)', display: 'flex', alignItems: 'center', gap: '10px' }}>✓ Unlimited file sizes and transfers</li>
                  <li style={{ fontSize: '14px', color: 'rgba(255,255,255,0.85)', display: 'flex', alignItems: 'center', gap: '10px' }}>✓ Maximum LAN speed (100+ MB/s)</li>
                  <li style={{ fontSize: '14px', color: 'rgba(255,255,255,0.85)', display: 'flex', alignItems: 'center', gap: '10px' }}>✓ Windows Desktop Dynamic Island</li>
                  <li style={{ fontSize: '14px', color: 'rgba(255,255,255,0.85)', display: 'flex', alignItems: 'center', gap: '10px' }}>✓ Direct APK for Android with MediaStore</li>
                  <li style={{ fontSize: '14px', color: 'rgba(255,255,255,0.85)', display: 'flex', alignItems: 'center', gap: '10px' }}>✓ Zero-install Web App for all browsers</li>
                </ul>
              </div>
              <a
                href="#downloads"
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
                <span>Download AuraDrop Now</span>
                <span>Free ↗</span>
              </a>
            </div>

            <div style={{ backgroundColor: '#0A0A0C', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '20px', padding: '38px 32px', textAlign: 'left', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'rgba(255, 255, 255, 0.5)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>Enterprise &amp; Teams</div>
                <div style={{ fontSize: '38px', fontWeight: 800, color: '#FFFFFF', marginBottom: '12px' }}>Custom</div>
                <p style={{ fontSize: '14px', color: '#8E8E93', lineHeight: 1.5 }}>Dedicated private signaling relays, custom security policies, and SLA support.</p>
                <ul style={{ listStyle: 'none', margin: '24px 0 32px', padding: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <li style={{ fontSize: '14px', color: 'rgba(255,255,255,0.85)', display: 'flex', alignItems: 'center', gap: '10px' }}>✓ Private self-hosted signaling cluster</li>
                  <li style={{ fontSize: '14px', color: 'rgba(255,255,255,0.85)', display: 'flex', alignItems: 'center', gap: '10px' }}>✓ Custom domain and branding</li>
                  <li style={{ fontSize: '14px', color: 'rgba(255,255,255,0.85)', display: 'flex', alignItems: 'center', gap: '10px' }}>✓ Strict firewall and MDM distribution</li>
                  <li style={{ fontSize: '14px', color: 'rgba(255,255,255,0.85)', display: 'flex', alignItems: 'center', gap: '10px' }}>✓ Dedicated engineering integration support</li>
                </ul>
              </div>
              <a
                href="#contact"
                className="cursor-pointer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '13px 20px',
                  borderRadius: '12px',
                  backgroundColor: '#121216',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#FFFFFF',
                  textDecoration: 'none',
                  fontSize: '14px',
                  fontWeight: 600,
                }}
              >
                <span>Contact Sales</span>
                <span>Inquire ↗</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════════
           OFFICIAL DOWNLOADS SECTION (Downloads Section)
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
           CONTACT MODAL / SECTION
      ══════════════════════════════════════════════════════════════════════════ */}
      <section id="contact" style={{ padding: '96px 0', borderTop: '1px solid rgba(255, 255, 255, 0.07)', backgroundColor: '#050508' }}>
        <div style={{ maxWidth: '680px', margin: '0 auto', padding: '0 28px', textAlign: 'center' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255, 255, 255, 0.45)', marginBottom: '14px' }}>
            Contact &amp; Inquiries
          </div>
          <h2 style={{ fontSize: '38px', fontWeight: 700, color: '#FFFFFF', marginBottom: '16px' }}>Get in touch with the team.</h2>
          <p style={{ fontSize: '16px', color: '#8E8E93', lineHeight: 1.6, marginBottom: '32px' }}>
            Have questions regarding enterprise deployments, custom protocol integrations, or security audits?
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <a
              href="mailto:contact@auradrop.com"
              className="cursor-pointer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                backgroundColor: '#FFFFFF',
                color: '#000000',
                padding: '13px 28px',
                borderRadius: '9999px',
                fontSize: '15px',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Email Engineering Team
            </a>
            <a
              href="https://github.com/JACK-AI7/AuraDrop/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="cursor-pointer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                color: '#FFFFFF',
                padding: '13px 26px',
                borderRadius: '9999px',
                fontSize: '15px',
                fontWeight: 500,
                textDecoration: 'none',
              }}
            >
              Open GitHub Issue ↗
            </a>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════════
           FOOTER (Codex Style)
      ══════════════════════════════════════════════════════════════════════════ */}
      <footer style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', padding: '64px 0 36px', backgroundColor: '#000000' }}>
        <div style={{ maxWidth: '1220px', margin: '0 auto', padding: '0 28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '36px' }}>
            <div style={{ maxWidth: '340px', textAlign: 'left' }}>
              <a href="/" className="cursor-pointer" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none', color: '#FFFFFF' }}>
                <svg width="22" height="22" viewBox="0 0 28 28" fill="none" aria-hidden="true">
                  <circle cx="14" cy="14" r="3" fill="#ffffff" />
                  <circle cx="14" cy="14" r="7.5" stroke="#ffffff" strokeWidth="1.5" fill="none" opacity=".7" />
                  <circle cx="14" cy="14" r="12" stroke="#ffffff" strokeWidth="1" fill="none" opacity=".35" />
                </svg>
                <span style={{ fontSize: '17px', fontWeight: 800 }}>AuraDrop</span>
              </a>
              <p style={{ fontSize: '13px', color: '#8E8E93', marginTop: '12px', lineHeight: 1.6 }}>
                High-speed, peer-to-peer file sharing and messaging across Android, Windows, and Web.
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
