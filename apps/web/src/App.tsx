import React, { useState, useEffect, useRef } from 'react';
import { HeroGlobe } from './components/HeroGlobe';
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

// React Bits Suite
import TiltedCard from './components/reactbits/TiltedCard';
import BranchedMenu from './components/reactbits/BranchedMenu';
import SlideCommit from './components/reactbits/SlideCommit';
import AnimatedContent from './components/reactbits/AnimatedContent';
import {
  Tick02Icon,
  Layers01Icon,
  Rocket01Icon,
  PaintBoardIcon,
} from '@hugeicons/core-free-icons';

const supportMenuItems = [
  {
    label: 'Direct UPI & QR',
    children: [
      { value: 'upi_copy', label: 'Copy UPI ID (9182769225@ybl)', icon: Tick02Icon },
      { value: 'upi_qr', label: 'PhonePe / GPay QR Code', icon: Layers01Icon },
    ],
  },
  {
    label: 'Support Tiers',
    children: [
      { value: 'tier_50', label: '1 Coffee (₹50 / $1)', icon: Rocket01Icon },
      { value: 'tier_150', label: '3 Coffees (₹150 / $2)', icon: Rocket01Icon },
      { value: 'tier_500', label: 'Supporter Star (₹500 / $6)', icon: PaintBoardIcon },
    ],
  },
];

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

  // Active Real Transfer Progress
  const [transferProgress, setTransferProgress] = useState<TransferProgress | null>(null);

  // Transfer History
  const [transferHistory, setTransferHistory] = useState<TransferRecord[]>(() => storage.getHistory());

  // Copy UPI state & Support Tier
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [selectedTier, setSelectedTier] = useState<number>(50);
  const [supportNotice, setSupportNotice] = useState<string>('');

  // Modals
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

    const unsubscribeEvents = engine.onEngineEvent((evt: TransferEngineEvent) => {
      if (evt.type === 'progress') {
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
              }
            : null
        );
        setTransferHistory(storage.getHistory());
      } else if (evt.type === 'failed') {
        setTransferProgress((prev) => (prev ? { ...prev, state: 'FAILED' } : null));
      }
    });

    return () => {
      unsubscribePeers();
      unsubscribeEvents();
    };
  }, [engine, storage]);

  // Handle Copy UPI ID
  const handleCopyUpi = () => {
    navigator.clipboard.writeText('9182769225@ybl');
    setCopiedUpi(true);
    setSupportNotice('UPI ID copied to clipboard (9182769225@ybl)');
    setTimeout(() => setCopiedUpi(false), 2500);
  };

  // Handle SlideCommit success
  const handleSlideCommit = () => {
    setSupportNotice(`Thank you for supporting AuraDrop with ₹${selectedTier}!`);
  };

  // Handle BranchedMenu item selection
  const handleSupportMenuSelect = (value: string) => {
    if (value === 'upi_copy') {
      handleCopyUpi();
    } else if (value === 'upi_qr') {
      setSupportNotice('Scan the PhonePe / GPay QR code using any UPI app');
    } else if (value === 'tier_50') {
      setSelectedTier(50);
      setSupportNotice('Selected: 1 Coffee (₹50 / $1)');
    } else if (value === 'tier_150') {
      setSelectedTier(150);
      setSupportNotice('Selected: 3 Coffees (₹150 / $2)');
    } else if (value === 'tier_500') {
      setSelectedTier(500);
      setSupportNotice('Selected: Supporter Star (₹500 / $6)');
    }
  };

  // Scroll helper
  const scrollToPreview = () => {
    windowPreviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#ffffff',
        backgroundImage: 'radial-gradient(rgba(15, 23, 42, 0.08) 1.25px, transparent 1.25px)',
        backgroundSize: '24px 24px',
        color: '#0f172a',
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
          color: #475569;
          text-decoration: none;
          font-size: 14px;
          font-weight: 500;
          letter-spacing: -0.01em;
          transition: color 0.2s ease;
        }
        .nav-link:hover { color: #0f172a; }
        .feature-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 20px;
          padding: 34px 30px;
          text-align: left;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.03);
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .feature-card:hover {
          border-color: #cbd5e1 !important;
          transform: translateY(-2px);
          box-shadow: 0 14px 32px rgba(15, 23, 42, 0.06);
        }
        .dl-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 22px;
          padding: 36px 32px;
          text-align: left;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          position: relative;
          box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .dl-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 16px 36px rgba(15, 23, 42, 0.08);
        }
        .hero-pill-btn {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          background: #0f172a;
          color: #ffffff;
          padding: 14px 32px;
          border-radius: 9999px;
          font-size: 15px;
          font-weight: 700;
          text-decoration: none;
          border: 1px solid #0f172a;
          box-shadow: 0 4px 16px rgba(15, 23, 42, 0.16);
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .hero-pill-btn:hover {
          background: #1e293b;
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.24);
        }
        .hero-ghost-btn {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          background: #ffffff;
          border: 1px solid #cbd5e1;
          color: #0f172a;
          padding: 14px 28px;
          border-radius: 9999px;
          font-size: 15px;
          font-weight: 600;
          text-decoration: none;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .hero-ghost-btn:hover {
          background: #f8fafc;
          border-color: #94a3b8;
          transform: translateY(-2px);
        }
        .hero-subtle-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: transparent;
          border: none;
          color: #64748b;
          padding: 14px 20px;
          border-radius: 9999px;
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
          transition: all 0.2s ease;
          cursor: pointer;
        }
        .hero-subtle-btn:hover {
          color: #0f172a;
        }
        @keyframes pulseDot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.35; transform: scale(0.85); }
        }
      `}</style>

      {/* ══════════════════════════════════════════════════════════════════════════
           TOP NAVIGATION BAR (Clean White Frosted Glass, High-End Minimal)
      ══════════════════════════════════════════════════════════════════════════ */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 1000,
          width: '100%',
          backgroundColor: 'rgba(255, 255, 255, 0.88)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(0, 0, 0, 0.08)',
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
          {/* Brand Link */}
          <a
            href="/"
            className="cursor-pointer"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              textDecoration: 'none',
              color: '#0f172a',
            }}
          >
            <img
              src="/logo.png"
              alt="AuraDrop"
              width="28"
              height="28"
              style={{ borderRadius: '7px', objectFit: 'contain' }}
            />
            <span style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '-0.03em' }}>AuraDrop</span>
          </a>

          {/* Center Nav Links */}
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
            <a href="#architecture" className="nav-link cursor-pointer">Architecture</a>
            <a href="#downloads" className="nav-link cursor-pointer">Downloads</a>
            <a href="#support" className="nav-link cursor-pointer">Support</a>
          </nav>

          {/* Right Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <a
              href="https://github.com/JACK-AI7/AuraDrop"
              target="_blank"
              rel="noopener noreferrer"
              className="cursor-pointer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderRadius: '9999px',
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                color: '#0f172a',
                fontSize: '13px',
                fontWeight: 600,
                textDecoration: 'none',
                transition: 'all 0.2s ease',
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
              </svg>
              <span>GitHub</span>
            </a>

            <a
              href="#downloads"
              className="cursor-pointer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '8px 20px',
                borderRadius: '9999px',
                backgroundColor: '#0f172a',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: 700,
                textDecoration: 'none',
                transition: 'all 0.2s ease',
              }}
            >
              Get AuraDrop
            </a>

            <button
              onClick={() => setIsSettingsOpen(true)}
              title="AuraDrop Settings"
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '50%',
                background: '#f1f5f9',
                border: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#334155',
                cursor: 'pointer',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* ══════════════════════════════════════════════════════════════════════════
           HERO SECTION (Clean White Background, Dot Matrix, Senior Dev Aesthetics)
      ══════════════════════════════════════════════════════════════════════════ */}
      <section
        id="about"
        style={{
          position: 'relative',
          padding: '80px 0 54px',
          textAlign: 'center',
          overflow: 'hidden',
        }}
      >
        <div style={{ maxWidth: '1220px', margin: '0 auto', padding: '0 28px' }}>
          <AnimatedContent distance={30} duration={0.8} threshold={0.05}>
            {/* Centered White Squircle with AuraDrop Logo Icon */}
            <div
              className="cursor-pointer"
              onClick={scrollToPreview}
              style={{
                width: '74px',
                height: '74px',
                borderRadius: '20px',
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 8px 30px rgba(15, 23, 42, 0.08)',
                marginBottom: '26px',
                transition: 'transform 0.2s ease',
              }}
            >
              <img
                src="/logo.png"
                alt="AuraDrop Logo"
                width="46"
                height="46"
                style={{ objectFit: 'contain' }}
              />
            </div>

            {/* Protocol Badge */}
            <div style={{ marginBottom: '18px' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 14px',
                  borderRadius: '9999px',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#475569',
                }}
              >
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#16a34a' }} />
                AuraDrop Protocol v2.0.1 · Zero Cloud Relay
              </span>
            </div>

            {/* Main Headline */}
            <h1
              style={{
                fontSize: 'clamp(38px, 5.4vw, 70px)',
                fontWeight: 800,
                letterSpacing: '-0.04em',
                lineHeight: 1.08,
                color: '#0f172a',
                marginBottom: '18px',
              }}
            >
              Share anything with AuraDrop
            </h1>

            {/* Subtitle */}
            <p
              style={{
                fontSize: 'clamp(16px, 1.8vw, 20px)',
                color: '#475569',
                maxWidth: '660px',
                margin: '0 auto 36px',
                lineHeight: 1.6,
                fontWeight: 400,
                letterSpacing: '-0.01em',
              }}
            >
              Move faster, go further, and transfer at full LAN speed with zero cloud relay. Cross-platform peer-to-peer file sharing between Android, Windows, and Web.
            </p>

            {/* Hero Action Buttons - Clean Minimal Pill Buttons (No Black Card!) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '16px',
                flexWrap: 'wrap',
                marginBottom: '44px',
              }}
            >
              <a
                href="/downloads/AuraDrop-Setup.exe"
                download="AuraDrop-Setup.exe"
                className="hero-pill-btn cursor-pointer"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
                </svg>
                <span>Download for Windows</span>
              </a>

              <a
                href="https://github.com/JACK-AI7/AuraDrop/releases/download/v2.0.1/AuraDrop-Android.apk"
                target="_blank"
                rel="noopener noreferrer"
                className="hero-ghost-btn cursor-pointer"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.551 0 .9993.4482.9993.9993.0001.5511-.4483.9997-.9993.9997m-11.046 0c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993 0 .5511-.4482.9997-.9993.9997m11.4045-6.02l1.9973-3.4592a.416.416 0 00-.1521-.5676.416.416 0 00-.5676.1521l-2.0223 3.503C15.5902 8.4116 13.8533 8.1 12 8.1s-3.5902.3116-5.1368.8497L4.8409 5.4467a.4161.4161 0 00-.5677-.1521.4157.4157 0 00-.1521.5676l1.9973 3.4592C2.6889 11.1867.3432 14.6589 0 18.761h24c-.3432-4.1021-2.6889-7.5743-6.1185-9.4396"/>
                </svg>
                <span>Android APK</span>
              </a>

              <button
                onClick={scrollToPreview}
                className="hero-subtle-btn cursor-pointer"
              >
                <span>Live Interactive Demo ↓</span>
              </button>
            </div>
          </AnimatedContent>

          {/* Supported Platforms Strip with Real Clean SVGs */}
          <div style={{ marginBottom: '50px' }}>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                color: '#64748b',
                marginBottom: '20px',
              }}
            >
              Supported Cross-Platform Ecosystem
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '36px',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#334155', fontSize: '14px', fontWeight: 600 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/></svg>
                <span>Windows 11</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#334155', fontSize: '14px', fontWeight: 600 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.551 0 .9993.4482.9993.9993.0001.5511-.4483.9997-.9993.9997m-11.046 0c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993 0 .5511-.4482.9997-.9993.9997m11.4045-6.02l1.9973-3.4592a.416.416 0 00-.1521-.5676.416.416 0 00-.5676.1521l-2.0223 3.503C15.5902 8.4116 13.8533 8.1 12 8.1s-3.5902.3116-5.1368.8497L4.8409 5.4467a.4161.4161 0 00-.5677-.1521.4157.4157 0 00-.1521.5676l1.9973 3.4592C2.6889 11.1867.3432 14.6589 0 18.761h24c-.3432-4.1021-2.6889-7.5743-6.1185-9.4396"/></svg>
                <span>Android 15</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#334155', fontSize: '14px', fontWeight: 600 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.61-.75 1.04-1.8 1.01-2.87-.96.04-2.06.66-2.7 1.45-.56.66-.99 1.72-.94 2.76 1.08.08 2.02-.59 2.63-1.34z"/></svg>
                <span>Apple macOS / iOS</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#334155', fontSize: '14px', fontWeight: 600 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                <span>Web P2P</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#334155', fontSize: '14px', fontWeight: 600 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12.003 2c-2.22 0-3.99 1.77-3.99 3.99 0 .42.06.82.18 1.2-1.39.46-2.4 1.76-2.4 3.31 0 1.34.76 2.5 1.86 3.07-.09.34-.15.7-.15 1.08 0 2.65 2.01 4.8 4.5 4.8s4.5-2.15 4.5-4.8c0-.38-.06-.74-.15-1.08 1.1-.57 1.86-1.73 1.86-3.07 0-1.55-1.01-2.85-2.4-3.31.12-.38.18-.78.18-1.2 0-2.22-1.77-3.99-3.99-3.99z"/></svg>
                <span>Linux</span>
              </div>
            </div>
          </div>

          {/* ── Framed Live App Interactive Demo Preview with TiltedCard ────── */}
          <div
            ref={windowPreviewRef}
            style={{
              maxWidth: '960px',
              margin: '0 auto 60px',
              position: 'relative',
              textAlign: 'left',
            }}
          >
            <TiltedCard
              containerWidth="100%"
              containerHeight="auto"
              imageWidth="100%"
              imageHeight="auto"
              rotateAmplitude={5}
              scaleOnHover={1.01}
              glare={0.15}
              shadow={0.35}
              showTooltip={false}
              radius={18}
            >
              <div
                style={{
                  backgroundColor: '#09090b',
                  border: '1px solid #1e293b',
                  borderRadius: '18px',
                  overflow: 'hidden',
                  boxShadow: '0 25px 60px -15px rgba(15, 23, 42, 0.22), 0 0 0 1px rgba(0, 0, 0, 0.08)',
                  width: '100%',
                }}
              >
                {/* Window Titlebar */}
                <div
                  style={{
                    height: '42px',
                    backgroundColor: '#111116',
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
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255, 255, 255, 0.7)' }}>
                    AuraDrop Desktop · Dynamic Island &amp; Proximity Radar Demo
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'rgba(255, 255, 255, 0.45)' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
                  </div>
                </div>

                {/* Window Content */}
                <div
                  style={{
                    padding: '38px 28px 44px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    background: 'radial-gradient(circle at 50% 25%, rgba(99, 102, 241, 0.12) 0%, transparent 60%), #09090b',
                  }}
                >
                  {/* Floating Dynamic Island Pill */}
                  <div
                    style={{
                      backgroundColor: 'rgba(24, 24, 32, 0.95)',
                      border: '1px solid rgba(255, 255, 255, 0.14)',
                      borderRadius: '9999px',
                      padding: '9px 20px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '12px',
                      boxShadow: '0 12px 35px rgba(0, 0, 0, 0.75)',
                      marginBottom: '26px',
                    }}
                  >
                    <div
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: '#34C759',
                        animation: 'pulseDot 1.8s ease-in-out infinite',
                      }}
                    />
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}>
                      {selectedPeer
                        ? `${selectedPeer.name} Connected · Direct LAN Turbo`
                        : 'Pixel 9 Pro Connected · Direct LAN Turbo'}
                    </span>
                    <span
                      style={{
                        fontSize: '11px',
                        color: '#94a3b8',
                        borderLeft: '1px solid rgba(255, 255, 255, 0.18)',
                        paddingLeft: '10px',
                      }}
                    >
                      67.7 MB/s
                    </span>
                  </div>

                  {/* 3D Interactive Hero Globe with Real Connection Beams */}
                  <div style={{ marginBottom: '26px' }}>
                    <HeroGlobe
                      peers={peers.length > 0 ? peers : [
                        { id: 'demo-1', name: 'Pixel 9 Pro', platform: 'android', connectionState: 'READY_TO_TRANSFER', ip: '192.168.1.12' },
                        { id: 'demo-2', name: 'Surface Studio', platform: 'windows', connectionState: 'CONNECTED', ip: '192.168.1.15' },
                      ]}
                      selectedPeerId={selectedPeer?.id || 'demo-1'}
                      onSelectPeer={(p) => setSelectedPeer(p)}
                      isTransferring={false}
                      transferSpeed="67.7 MB/s"
                      size={240}
                    />
                  </div>

                  {/* High-End Connected Device Status Row (No Fake Mobiles, Minimal Vector Icons) */}
                  <div style={{ width: '100%', maxWidth: '720px', marginBottom: '22px' }}>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
                      <div
                        style={{
                          backgroundColor: 'rgba(99, 102, 241, 0.14)',
                          border: '1px solid rgba(99, 102, 241, 0.45)',
                          borderRadius: '14px',
                          padding: '12px 18px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          flex: '1 1 200px',
                        }}
                      >
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
                          <line x1="12" y1="18" x2="12.01" y2="18"/>
                        </svg>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF' }}>Pixel 9 Pro</div>
                          <div style={{ fontSize: '11px', color: '#34C759', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#34C759', display: 'inline-block' }} />
                            Android 15 · Ready to transfer
                          </div>
                        </div>
                      </div>

                      <div
                        style={{
                          backgroundColor: 'rgba(255, 255, 255, 0.04)',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          borderRadius: '14px',
                          padding: '12px 18px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          flex: '1 1 200px',
                        }}
                      >
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                          <line x1="8" y1="21" x2="16" y2="21"/>
                          <line x1="12" y1="17" x2="12" y2="21"/>
                        </svg>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF' }}>Surface Studio</div>
                          <div style={{ fontSize: '11px', color: '#94a3b8' }}>Windows 11 · Dynamic Island Ready</div>
                        </div>
                      </div>

                      <div
                        style={{
                          backgroundColor: 'rgba(255, 255, 255, 0.04)',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          borderRadius: '14px',
                          padding: '12px 18px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          flex: '1 1 200px',
                        }}
                      >
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"/>
                          <line x1="2" y1="12" x2="22" y2="12"/>
                          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                        </svg>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF' }}>Chrome on macOS</div>
                          <div style={{ fontSize: '11px', color: '#94a3b8' }}>WebRTC · Zero-Install</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Transfer Simulation Box */}
                  <div
                    style={{
                      width: '100%',
                      maxWidth: '720px',
                      backgroundColor: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '14px',
                      padding: '16px 20px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF' }}>4K_Cinematic_Broll.mov</span>
                      <span style={{ fontSize: '12px', color: '#34C759', fontWeight: 600 }}>82% · 1.8s remaining</span>
                    </div>
                    <div style={{ height: '6px', backgroundColor: 'rgba(255, 255, 255, 0.08)', borderRadius: '9999px', overflow: 'hidden', margin: '12px 0 10px' }}>
                      <div style={{ height: '100%', width: '82%', background: 'linear-gradient(90deg, #6366f1, #38bdf8)', borderRadius: '9999px' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8' }}>
                      <span>3.7 GB of 4.5 GB transferred at 67.7 MB/s</span>
                      <span>SHA-256 Checksum Verified</span>
                    </div>
                  </div>
                </div>
              </div>
            </TiltedCard>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════════
           FEATURES SECTION
      ══════════════════════════════════════════════════════════════════════════ */}
      <AnimatedContent distance={40} duration={0.8} threshold={0.08}>
        <section id="features" style={{ padding: '96px 0', borderTop: '1px solid #e2e8f0' }}>
          <div style={{ maxWidth: '1220px', margin: '0 auto', padding: '0 28px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#4f46e5', marginBottom: '14px' }}>
              Engine Capabilities
            </div>
            <h2 style={{ fontSize: 'clamp(32px, 4.2vw, 48px)', fontWeight: 800, letterSpacing: '-0.03em', color: '#0f172a', marginBottom: '16px', lineHeight: 1.15 }}>
              Engineered for pure local velocity.
            </h2>
            <p style={{ fontSize: '17px', color: '#475569', maxWidth: '620px', lineHeight: 1.6, marginBottom: '56px' }}>
              AuraDrop bypasses public cloud intermediaries and streams data directly over high-speed local network sockets, Wi-Fi 6/7, and WebRTC data channels.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
              <div className="feature-card">
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#4f46e5', marginBottom: '18px' }}>01 / SPEED</div>
                <h3 style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', marginBottom: '10px' }}>100+ MB/s LAN Streaming</h3>
                <p style={{ fontSize: '14px', color: '#475569', lineHeight: 1.65 }}>Direct TCP and HTTP chunked streams transfer raw bytes at the physical throughput limit of your local router without uploading to any external server.</p>
              </div>
              <div className="feature-card">
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#4f46e5', marginBottom: '18px' }}>02 / ZERO-CONFIG</div>
                <h3 style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', marginBottom: '10px' }}>Seamless Auto-Discovery</h3>
                <p style={{ fontSize: '14px', color: '#475569', lineHeight: 1.65 }}>UDP Multicast announcements detect phones and PCs on the same Wi-Fi instantly. No Bluetooth pairing pins, no login credentials, and no setup friction.</p>
              </div>
              <div className="feature-card">
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#4f46e5', marginBottom: '18px' }}>03 / SECURITY</div>
                <h3 style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', marginBottom: '10px' }}>Fail-Closed Authentication</h3>
                <p style={{ fontSize: '14px', color: '#475569', lineHeight: 1.65 }}>Single-use cryptographic upload tokens expire in 60 seconds and invalidate immediately upon transfer initiation. Spoofed device IDs receive immediate 403s.</p>
              </div>
              <div className="feature-card">
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#4f46e5', marginBottom: '18px' }}>04 / INTEGRITY</div>
                <h3 style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', marginBottom: '10px' }}>SHA-256 Byte Verification</h3>
                <p style={{ fontSize: '14px', color: '#475569', lineHeight: 1.65 }}>Receivers calculate streaming SHA-256 checksums incrementally. Files with mismatched hashes or truncated bytes are automatically rejected.</p>
              </div>
              <div className="feature-card">
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#4f46e5', marginBottom: '18px' }}>05 / PRIVACY</div>
                <h3 style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', marginBottom: '10px' }}>Zero Cloud Staging</h3>
                <p style={{ fontSize: '14px', color: '#475569', lineHeight: 1.65 }}>Files stream device-to-device directly over LAN sockets. Signaling relays negotiate WebRTC handshakes only and never touch raw file bytes.</p>
              </div>
              <div className="feature-card">
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#4f46e5', marginBottom: '18px' }}>06 / MESSAGING</div>
                <h3 style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', marginBottom: '10px' }}>Encrypted P2P Chat</h3>
                <p style={{ fontSize: '14px', color: '#475569', lineHeight: 1.65 }}>Send instant messages, code snippets, and clipboard links across devices securely with zero server retention or third-party storage.</p>
              </div>
            </div>
          </div>
        </section>
      </AnimatedContent>

      {/* ══════════════════════════════════════════════════════════════════════════
           PROTOCOL SECTION
      ══════════════════════════════════════════════════════════════════════════ */}
      <AnimatedContent distance={40} duration={0.8} threshold={0.08}>
        <section id="protocol" style={{ padding: '96px 0', borderTop: '1px solid #e2e8f0' }}>
          <div style={{ maxWidth: '1220px', margin: '0 auto', padding: '0 28px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#4f46e5', marginBottom: '14px' }}>
              Wire Protocol Flow
            </div>
            <h2 style={{ fontSize: 'clamp(32px, 4.2vw, 48px)', fontWeight: 800, letterSpacing: '-0.03em', color: '#0f172a', marginBottom: '16px', lineHeight: 1.15 }}>
              How AuraDrop transfers work.
            </h2>
            <p style={{ fontSize: '17px', color: '#475569', maxWidth: '620px', lineHeight: 1.6, marginBottom: '56px' }}>
              Four deterministic stages guarantee private, zero-latency transfers across any combination of operating systems.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
              <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '28px 24px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#0f172a', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '13px', marginBottom: '18px' }}>1</div>
                <h4 style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>LAN Discovery</h4>
                <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.6 }}>Devices announce presence via UDP multicast on port 53317. Peer IP addresses and capabilities are resolved instantly.</p>
              </div>
              <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '28px 24px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#0f172a', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '13px', marginBottom: '18px' }}>2</div>
                <h4 style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>Token Handshake</h4>
                <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.6 }}>Sender requests a single-use authorization token. The receiver verifies sender identity and derives an ephemeral 60s key.</p>
              </div>
              <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '28px 24px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#0f172a', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '13px', marginBottom: '18px' }}>3</div>
                <h4 style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>Direct Streaming</h4>
                <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.6 }}>Bytes stream directly over high-throughput local sockets or WebRTC data channels, utilizing 100% of available LAN bandwidth.</p>
              </div>
              <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '28px 24px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#0f172a', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '13px', marginBottom: '18px' }}>4</div>
                <h4 style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>Checksum Audit</h4>
                <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.6 }}>The receiver verifies exact byte length and SHA-256 hash before flushing the file to disk or the Android MediaStore gallery.</p>
              </div>
            </div>
          </div>
        </section>
      </AnimatedContent>

      {/* ══════════════════════════════════════════════════════════════════════════
           APP ARCHITECTURE SECTION (Clean SVGs, No Cheap Emojis)
      ══════════════════════════════════════════════════════════════════════════ */}
      <AnimatedContent distance={40} duration={0.8} threshold={0.08}>
        <section id="architecture" style={{ padding: '96px 0', borderTop: '1px solid #e2e8f0' }}>
          <div style={{ maxWidth: '1220px', margin: '0 auto', padding: '0 28px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#4f46e5', marginBottom: '14px' }}>
              System Architecture
            </div>
            <h2 style={{ fontSize: 'clamp(32px, 4.2vw, 48px)', fontWeight: 800, letterSpacing: '-0.03em', color: '#0f172a', marginBottom: '16px', lineHeight: 1.15 }}>
              Built for native platform excellence.
            </h2>
            <p style={{ fontSize: '17px', color: '#475569', maxWidth: '620px', lineHeight: 1.6, marginBottom: '56px' }}>
              AuraDrop is engineered with specialized native runtimes for Windows, Android, and Web, sharing a unified cryptographic protocol.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px' }}>
              <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '28px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
                <div style={{ width: '42px', height: '42px', borderRadius: '10px', backgroundColor: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4" y="4" width="16" height="16" rx="2"/>
                    <rect x="9" y="9" width="6" height="6"/>
                    <line x1="9" y1="1" x2="9" y2="4"/>
                    <line x1="15" y1="1" x2="15" y2="4"/>
                    <line x1="9" y1="20" x2="9" y2="23"/>
                    <line x1="15" y1="20" x2="15" y2="23"/>
                    <line x1="20" y1="9" x2="23" y2="9"/>
                    <line x1="20" y1="14" x2="23" y2="14"/>
                    <line x1="1" y1="9" x2="4" y2="9"/>
                    <line x1="1" y1="14" x2="4" y2="14"/>
                  </svg>
                </div>
                <h4 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>Tauri &amp; Rust Desktop Core</h4>
                <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.6 }}>Ultra-lean 5.96 MB Windows installer with negligible RAM usage, native Windows Dynamic Island overlay, and local socket server.</p>
              </div>

              <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '28px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
                <div style={{ width: '42px', height: '42px', borderRadius: '10px', backgroundColor: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
                    <line x1="12" y1="18" x2="12.01" y2="18"/>
                  </svg>
                </div>
                <h4 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>Flutter &amp; Kotlin Android Engine</h4>
                <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.6 }}>Optimized foreground service, dynamic notification pill, direct port 8080 HTTP server, and automatic gallery integration.</p>
              </div>

              <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '28px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
                <div style={{ width: '42px', height: '42px', borderRadius: '10px', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="2" y1="12" x2="22" y2="12"/>
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                  </svg>
                </div>
                <h4 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>Universal Web P2P Engine</h4>
                <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.6 }}>Peer-to-peer browser connectivity using WebRTC DataChannels with STUN/TURN traversal for cross-network file exchanges.</p>
              </div>

              <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '28px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
                <div style={{ width: '42px', height: '42px', borderRadius: '10px', backgroundColor: '#faf5ff', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#9333ea" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    <polyline points="9 12 11 14 15 10"/>
                  </svg>
                </div>
                <h4 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>17-Point Regression Suite</h4>
                <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.6 }}>Automated tests continuously auditing path traversal sanitization, device identity binding, and SHA-256 byte integrity.</p>
              </div>
            </div>
          </div>
        </section>
      </AnimatedContent>

      {/* ══════════════════════════════════════════════════════════════════════════
           PRODUCTION RELEASES (No Noisy Pixel Dots, 100% Readable Text, Clean Borders)
      ══════════════════════════════════════════════════════════════════════════ */}
      <AnimatedContent distance={40} duration={0.8} threshold={0.08}>
        <section id="downloads" style={{ padding: '96px 0', borderTop: '1px solid #e2e8f0' }}>
          <div style={{ maxWidth: '1220px', margin: '0 auto', padding: '0 28px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#4f46e5', marginBottom: '14px' }}>
              Production Releases
            </div>
            <h2 style={{ fontSize: 'clamp(32px, 4.2vw, 48px)', fontWeight: 800, letterSpacing: '-0.03em', color: '#0f172a', marginBottom: '16px', lineHeight: 1.15 }}>
              Download AuraDrop v2.0.1
            </h2>
            <p style={{ fontSize: '17px', color: '#475569', maxWidth: '620px', lineHeight: 1.6, marginBottom: '56px' }}>
              Official release binaries. Code signed for Windows, standalone APK for Android, and verified SHA-256 integrity checksums.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '28px' }}>
              {/* Windows Desktop Card */}
              <div
                className="dl-card"
                style={{
                  border: '1px solid #e2e8f0',
                  borderTop: '3px solid #6366f1',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                      <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0f172a' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/></svg>
                      </div>
                      <div>
                        <div style={{ fontSize: '21px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>Windows Desktop</div>
                        <div style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>v2.0.1 · Windows 10 &amp; 11 (64-bit)</div>
                      </div>
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '9999px', background: '#dcfce7', color: '#16a34a', border: '1px solid #bbf7d0' }}>
                      Stable
                    </span>
                  </div>

                  <p style={{ fontSize: '14px', color: '#475569', lineHeight: 1.65, marginBottom: '24px' }}>
                    Tauri v2 native desktop application featuring native Windows Dynamic Island, local TCP chunk streaming, and zero-config peer discovery.
                  </p>

                  {/* Technical Specs Strip */}
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '28px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#475569', background: '#f1f5f9', padding: '4px 10px', borderRadius: '6px' }}>x64 Arch</span>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#475569', background: '#f1f5f9', padding: '4px 10px', borderRadius: '6px' }}>Rust Engine</span>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#475569', background: '#f1f5f9', padding: '4px 10px', borderRadius: '6px' }}>SHA-256 Verified</span>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' }}>
                  <a
                    href="/downloads/AuraDrop-Setup.exe"
                    download="AuraDrop-Setup.exe"
                    className="cursor-pointer"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '14px 22px',
                      borderRadius: '12px',
                      backgroundColor: '#0f172a',
                      color: '#ffffff',
                      textDecoration: 'none',
                      fontSize: '14px',
                      fontWeight: 700,
                      transition: 'all 0.2s ease',
                      boxShadow: '0 4px 14px rgba(15, 23, 42, 0.15)',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      Download Setup.exe
                    </span>
                    <span style={{ opacity: 0.85, fontSize: '13px' }}>5.96 MB</span>
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
                        backgroundColor: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        color: '#0f172a',
                        textDecoration: 'none',
                        fontSize: '13px',
                        fontWeight: 600,
                      }}
                    >
                      <span>MSI Package</span>
                      <span style={{ color: '#64748b', fontSize: '12px' }}>9.25 MB</span>
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
                        backgroundColor: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        color: '#0f172a',
                        textDecoration: 'none',
                        fontSize: '13px',
                        fontWeight: 600,
                      }}
                    >
                      <span>Portable ZIP</span>
                      <span style={{ color: '#64748b', fontSize: '12px' }}>8.42 MB</span>
                    </a>
                  </div>
                </div>
              </div>

              {/* Android Mobile Card */}
              <div
                className="dl-card"
                style={{
                  border: '1px solid #e2e8f0',
                  borderTop: '3px solid #16a34a',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                      <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.551 0 .9993.4482.9993.9993.0001.5511-.4483.9997-.9993.9997m-11.046 0c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993 0 .5511-.4482.9997-.9993.9997m11.4045-6.02l1.9973-3.4592a.416.416 0 00-.1521-.5676.416.416 0 00-.5676.1521l-2.0223 3.503C15.5902 8.4116 13.8533 8.1 12 8.1s-3.5902.3116-5.1368.8497L4.8409 5.4467a.4161.4161 0 00-.5677-.1521.4157.4157 0 00-.1521.5676l1.9973 3.4592C2.6889 11.1867.3432 14.6589 0 18.761h24c-.3432-4.1021-2.6889-7.5743-6.1185-9.4396"/></svg>
                      </div>
                      <div>
                        <div style={{ fontSize: '21px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>Android Mobile</div>
                        <div style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>v2.0.1 · Android 8.0+ (ARM64)</div>
                      </div>
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '9999px', background: '#dcfce7', color: '#16a34a', border: '1px solid #bbf7d0' }}>
                      Stable
                    </span>
                  </div>

                  <p style={{ fontSize: '14px', color: '#475569', lineHeight: 1.65, marginBottom: '24px' }}>
                    Flutter &amp; Kotlin foreground service app with real-time notification dynamic island, MediaStore gallery exports, and embedded socket server.
                  </p>

                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '28px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#475569', background: '#f1f5f9', padding: '4px 10px', borderRadius: '6px' }}>ARM64-v8a</span>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#475569', background: '#f1f5f9', padding: '4px 10px', borderRadius: '6px' }}>Scoped Storage</span>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#475569', background: '#f1f5f9', padding: '4px 10px', borderRadius: '6px' }}>Zero Battery Drain</span>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' }}>
                  <a
                    href="https://github.com/JACK-AI7/AuraDrop/releases/download/v2.0.1/AuraDrop-Android.apk"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cursor-pointer"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '14px 22px',
                      borderRadius: '12px',
                      backgroundColor: '#0f172a',
                      color: '#ffffff',
                      textDecoration: 'none',
                      fontSize: '14px',
                      fontWeight: 700,
                      transition: 'all 0.2s ease',
                      boxShadow: '0 4px 14px rgba(15, 23, 42, 0.15)',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      Download Direct APK
                    </span>
                    <span style={{ opacity: 0.85, fontSize: '13px' }}>113.7 MB</span>
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
                      backgroundColor: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      color: '#0f172a',
                      textDecoration: 'none',
                      fontSize: '13px',
                      fontWeight: 600,
                    }}
                  >
                    <span>View GitHub Release Notes ↗</span>
                    <span style={{ color: '#64748b', fontSize: '12px' }}>Changelog</span>
                  </a>
                </div>
              </div>

              {/* Apple & Linux Card */}
              <div
                className="dl-card"
                style={{
                  border: '1px solid #e2e8f0',
                  borderTop: '3px solid #f59e0b',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                      <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0f172a' }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.61-.75 1.04-1.8 1.01-2.87-.96.04-2.06.66-2.7 1.45-.56.66-.99 1.72-.94 2.76 1.08.08 2.02-.59 2.63-1.34z"/></svg>
                      </div>
                      <div>
                        <div style={{ fontSize: '21px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>Apple &amp; Linux</div>
                        <div style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>macOS, iOS, Ubuntu, Debian</div>
                      </div>
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '9999px', background: '#fef3c7', color: '#d97706', border: '1px solid #fde68a' }}>
                      Roadmap
                    </span>
                  </div>

                  <p style={{ fontSize: '14px', color: '#475569', lineHeight: 1.65, marginBottom: '24px' }}>
                    Native macOS Apple Silicon DMG and Linux AppImage packages are actively compiling. Safari and Chrome users can share instantly using WebRTC data planes.
                  </p>

                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '28px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#475569', background: '#f1f5f9', padding: '4px 10px', borderRadius: '6px' }}>Apple Silicon</span>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#475569', background: '#f1f5f9', padding: '4px 10px', borderRadius: '6px' }}>AppImage</span>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#475569', background: '#f1f5f9', padding: '4px 10px', borderRadius: '6px' }}>MIT License</span>
                  </div>
                </div>

                <a
                  href="https://github.com/JACK-AI7/AuraDrop"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cursor-pointer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 22px',
                    borderRadius: '12px',
                    backgroundColor: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    color: '#0f172a',
                    textDecoration: 'none',
                    fontSize: '14px',
                    fontWeight: 600,
                    marginTop: '16px',
                  }}
                >
                  <span>Track Progress on GitHub ↗</span>
                  <span style={{ color: '#64748b', fontSize: '12px' }}>Open Source</span>
                </a>
              </div>
            </div>
          </div>
        </section>
      </AnimatedContent>

      {/* ══════════════════════════════════════════════════════════════════════════
           BUY ME A COFFEE / SUPPORT (High-End White Container, Clean QR, Verified UPI)
      ══════════════════════════════════════════════════════════════════════════ */}
      <AnimatedContent distance={40} duration={0.8} threshold={0.08}>
        <section id="support" style={{ padding: '96px 0', borderTop: '1px solid #e2e8f0' }}>
          <div style={{ maxWidth: '860px', margin: '0 auto', padding: '0 28px', textAlign: 'center' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#4f46e5', marginBottom: '14px' }}>
              Support Independent Development
            </div>
            <h2 style={{ fontSize: 'clamp(30px, 3.8vw, 46px)', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.03em', marginBottom: '16px' }}>
              Support AuraDrop Development
            </h2>
            <p style={{ fontSize: '16px', color: '#475569', lineHeight: 1.6, maxWidth: '620px', margin: '0 auto 40px auto' }}>
              AuraDrop is 100% free, private, and open source with zero advertisements, zero tracking, and zero cloud surveillance. If this tool saves you time, consider supporting future development directly.
            </p>

            {/* Direct UPI Payment & Contribution Card */}
            <div
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '24px',
                padding: '40px 32px',
                boxShadow: '0 10px 35px rgba(15, 23, 42, 0.05)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}
            >
              {/* Top Flex Layout: QR Code on Left, BranchedMenu on Right */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '36px',
                  flexWrap: 'wrap',
                  marginBottom: '32px',
                  width: '100%',
                }}
              >
                {/* Real Verified QR Code */}
                <div
                  style={{
                    padding: '18px',
                    borderRadius: '18px',
                    backgroundColor: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    textAlign: 'center',
                  }}
                >
                  <img
                    src="/upi_qr.png"
                    alt="Union Bank Of India / PhonePe QR - B.JASWANTH REDDY"
                    width="170"
                    height="170"
                    style={{ borderRadius: '12px', objectFit: 'contain', display: 'block', margin: '0 auto' }}
                  />
                  <div style={{ marginTop: '12px' }}>
                    <p style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>Union Bank of India • PhonePe QR</p>
                    <p style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>Payee: B.JASWANTH REDDY</p>
                  </div>
                </div>

                {/* Branched Menu for Payment / Support */}
                <div
                  style={{
                    backgroundColor: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '18px',
                    padding: '20px',
                    textAlign: 'left',
                    minWidth: '280px',
                  }}
                >
                  <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b', marginBottom: '10px' }}>
                    Payment Method &amp; Tiers
                  </div>
                  <BranchedMenu
                    items={supportMenuItems}
                    defaultOpen={[0, 1]}
                    defaultActive="upi_copy"
                    onSelect={(val) => handleSupportMenuSelect(val)}
                    color="#1e293b"
                    accentColor="#4f46e5"
                    lineColor="#cbd5e1"
                    width={280}
                    rowHeight={34}
                    indent={36}
                    trunk={12}
                    radius={8}
                    lineWidth={1.5}
                    fontSize={13}
                  />
                </div>
              </div>

              {/* Direct UPI ID Pill with One-Click Copy */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '14px',
                  padding: '12px 20px',
                  width: '100%',
                  maxWidth: '460px',
                  margin: '0 auto 24px auto',
                }}
              >
                <div style={{ textAlign: 'left' }}>
                  <span style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 700, color: '#64748b', letterSpacing: '0.08em', display: 'block' }}>
                    Direct UPI ID
                  </span>
                  <span style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', fontFamily: 'monospace' }}>
                    9182769225@ybl
                  </span>
                </div>
                <button
                  onClick={handleCopyUpi}
                  className="cursor-pointer"
                  style={{
                    backgroundColor: copiedUpi ? '#16a34a' : '#0f172a',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '8px 16px',
                    fontSize: '12px',
                    fontWeight: 700,
                    transition: 'all 0.2s ease',
                  }}
                >
                  {copiedUpi ? 'Copied ✓' : 'Copy UPI'}
                </button>
              </div>

              {/* SlideCommit Component for interactive commitment */}
              <div style={{ marginTop: '4px', marginBottom: '22px' }}>
                <SlideCommit
                  label={`Slide to support · ₹${selectedTier}`}
                  doneLabel="Support confirmed! Thank you"
                  errorLabel="Action failed"
                  onConfirm={handleSlideCommit}
                  trackColor="#0f172a"
                  handleColor="#ffffff"
                  successColor="#16a34a"
                  dangerColor="#e5484d"
                  width={340}
                  height={52}
                  radius={26}
                  speed={50}
                />
              </div>

              {supportNotice && (
                <div style={{ fontSize: '13px', color: '#16a34a', fontWeight: 600, marginBottom: '18px' }}>
                  {supportNotice}
                </div>
              )}

              {/* Coffee Tiers with Clean Vector SVGs (No Cheap Emojis!) */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: '14px', flexWrap: 'wrap', width: '100%' }}>
                <div
                  onClick={() => { setSelectedTier(50); setSupportNotice('Selected: 1 Coffee (₹50 / $1)'); }}
                  className="cursor-pointer"
                  style={{
                    padding: '14px 20px',
                    borderRadius: '16px',
                    background: selectedTier === 50 ? '#eef2ff' : '#f8fafc',
                    border: selectedTier === 50 ? '2px solid #4f46e5' : '1px solid #e2e8f0',
                    minWidth: '130px',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={{ marginBottom: '6px', color: selectedTier === 50 ? '#4f46e5' : '#64748b' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto' }}>
                      <path d="M18 8h1a4 4 0 0 1 0 8h-1"/>
                      <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>
                      <line x1="6" y1="1" x2="6" y2="4"/>
                      <line x1="10" y1="1" x2="10" y2="4"/>
                      <line x1="14" y1="1" x2="14" y2="4"/>
                    </svg>
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>1 Coffee</div>
                  <div style={{ fontSize: '11px', color: selectedTier === 50 ? '#4f46e5' : '#64748b', marginTop: '2px', fontWeight: 600 }}>₹50 / $1</div>
                </div>

                <div
                  onClick={() => { setSelectedTier(150); setSupportNotice('Selected: 3 Coffees (₹150 / $2)'); }}
                  className="cursor-pointer"
                  style={{
                    padding: '14px 20px',
                    borderRadius: '16px',
                    background: selectedTier === 150 ? '#eef2ff' : '#f8fafc',
                    border: selectedTier === 150 ? '2px solid #4f46e5' : '1px solid #e2e8f0',
                    minWidth: '130px',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={{ marginBottom: '6px', color: selectedTier === 150 ? '#4f46e5' : '#64748b', display: 'flex', justifyContent: 'center', gap: '3px' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>
                    </svg>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>
                    </svg>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>
                    </svg>
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>3 Coffees</div>
                  <div style={{ fontSize: '11px', color: selectedTier === 150 ? '#4f46e5' : '#64748b', marginTop: '2px', fontWeight: 600 }}>₹150 / $2</div>
                </div>

                <div
                  onClick={() => { setSelectedTier(500); setSupportNotice('Selected: Supporter Star (₹500 / $6)'); }}
                  className="cursor-pointer"
                  style={{
                    padding: '14px 20px',
                    borderRadius: '16px',
                    background: selectedTier === 500 ? '#faf5ff' : '#f8fafc',
                    border: selectedTier === 500 ? '2px solid #9333ea' : '1px solid #e2e8f0',
                    minWidth: '130px',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={{ marginBottom: '6px', color: selectedTier === 500 ? '#9333ea' : '#eab308' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none" style={{ margin: '0 auto' }}>
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                    </svg>
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>Supporter</div>
                  <div style={{ fontSize: '11px', color: selectedTier === 500 ? '#9333ea' : '#64748b', marginTop: '2px', fontWeight: 600 }}>₹500 / $6</div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </AnimatedContent>

      {/* ══════════════════════════════════════════════════════════════════════════
           FOOTER (Clean Light Mode, Senior Dev Quality)
      ══════════════════════════════════════════════════════════════════════════ */}
      <footer style={{ borderTop: '1px solid #e2e8f0', padding: '64px 0 36px', backgroundColor: '#ffffff' }}>
        <div style={{ maxWidth: '1220px', margin: '0 auto', padding: '0 28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '36px' }}>
            <div style={{ maxWidth: '340px', textAlign: 'left' }}>
              <a href="/" className="cursor-pointer" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none', color: '#0f172a' }}>
                <img src="/logo.png" alt="AuraDrop" width="24" height="24" style={{ borderRadius: '6px', objectFit: 'contain' }} />
                <span style={{ fontSize: '17px', fontWeight: 800 }}>AuraDrop</span>
              </a>
              <p style={{ fontSize: '13px', color: '#64748b', marginTop: '12px', lineHeight: 1.6 }}>
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

          <div style={{ marginTop: '50px', paddingTop: '24px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#94a3b8' }}>
            <span>© 2026 AuraDrop. Open source under the MIT License. Created by B. Jaswanth Reddy.</span>
            <span>Version 2.0.1</span>
          </div>
        </div>
      </footer>

      {/* MODALS */}
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
