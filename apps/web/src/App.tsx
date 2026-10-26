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

// React Bits High-End Component Suite
import ShapeWaves from './components/reactbits/ShapeWaves';
import TiltedCard from './components/reactbits/TiltedCard';
import PixelCard from './components/reactbits/PixelCard';
import BorderGlow from './components/reactbits/BorderGlow';
import BranchedMenu from './components/reactbits/BranchedMenu';
import SlideCommit from './components/reactbits/SlideCommit';
import ElectricLogo from './components/reactbits/ElectricLogo';
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

  // Staged Files for Transfer (for demo / staging in preview window)
  const [stagedFiles, setStagedFiles] = useState<PickedFile[]>([]);

  // Active Real Transfer Progress
  const [transferProgress, setTransferProgress] = useState<TransferProgress | null>(null);

  // Transfer History
  const [transferHistory, setTransferHistory] = useState<TransferRecord[]>(() => storage.getHistory());

  // Copy UPI state & Support Tier
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [selectedTier, setSelectedTier] = useState<number>(50);
  const [supportNotice, setSupportNotice] = useState<string>('');

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
                speedBytesPerSec: 0,
                etaSeconds: 0,
              }
            : null
        );
        setTimeout(() => setTransferProgress(null), 4000);
        setTransferHistory(storage.getHistory());
      }
    });

    return () => {
      unsubscribePeers();
      unsubscribeEvents();
    };
  }, [engine, storage]);

  const handleCopyUpi = () => {
    navigator.clipboard.writeText('9182769225@ybl');
    setCopiedUpi(true);
    setSupportNotice('Copied UPI ID: 9182769225@ybl');
    setTimeout(() => {
      setCopiedUpi(false);
      setSupportNotice('');
    }, 3000);
  };

  const handleSupportMenuSelect = (val: string) => {
    if (val === 'upi_copy') {
      handleCopyUpi();
    } else if (val === 'tier_50') {
      setSelectedTier(50);
      setSupportNotice('Selected: 1 Coffee (₹50 / $1)');
    } else if (val === 'tier_150') {
      setSelectedTier(150);
      setSupportNotice('Selected: 3 Coffees (₹150 / $2)');
    } else if (val === 'tier_500') {
      setSelectedTier(500);
      setSupportNotice('Selected: Supporter Star (₹500 / $6)');
    }
  };

  const handleSlideCommit = () => {
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        handleCopyUpi();
        setSupportNotice(`Contribution registered for ₹${selectedTier}! Thank you for fueling AuraDrop.`);
        resolve();
      }, 700);
    });
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
        .feature-card {
          background: #08080b;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 20px;
          padding: 34px 30px;
          text-align: left;
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .feature-card:hover {
          border-color: rgba(255, 255, 255, 0.24) !important;
          transform: translateY(-2px);
          background: #0d0d12 !important;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.8), 0 0 40px rgba(99, 102, 241, 0.08);
        }
        .dl-card {
          background: linear-gradient(180deg, rgba(16, 16, 22, 0.95) 0%, rgba(10, 10, 14, 0.95) 100%);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 22px;
          padding: 36px 32px;
          text-align: left;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          position: relative;
          overflow: hidden;
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .dl-card:hover {
          border-color: rgba(255, 255, 255, 0.26);
          transform: translateY(-2px);
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.9), 0 0 50px rgba(99, 102, 241, 0.12);
        }
        .hero-pill-btn {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          background: #ffffff;
          color: #000000;
          padding: 14px 34px;
          border-radius: 9999px;
          font-size: 15px;
          font-weight: 700;
          text-decoration: none;
          box-shadow: 0 4px 25px rgba(255, 255, 255, 0.22);
          transition: all 0.2s ease;
        }
        .hero-pill-btn:hover {
          opacity: 0.94;
          transform: translateY(-2px);
          box-shadow: 0 10px 38px rgba(255, 255, 255, 0.32);
        }
        .hero-ghost-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.22);
          color: #ffffff;
          padding: 14px 28px;
          border-radius: 9999px;
          font-size: 15px;
          font-weight: 600;
          text-decoration: none;
          backdrop-filter: blur(10px);
          transition: all 0.2s ease;
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
           TOP NAVIGATION BAR (Clean, Minimal, Senior Dev Quality)
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
          {/* Brand Link */}
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
                backgroundColor: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.14)',
                color: '#FFFFFF',
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
                backgroundColor: '#FFFFFF',
                color: '#000000',
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
           HERO SECTION (High-End Atmosphere)
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
          <AnimatedContent distance={30} duration={0.8} threshold={0.05}>
            {/* Centered White Squircle with Crisp Black AuraDrop Logo Icon */}
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
                width="50"
                height="50"
                style={{
                  objectFit: 'contain',
                  filter: 'brightness(0)',
                }}
              />
            </div>

            {/* Main Headline */}
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

            {/* Subtitle */}
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
          </AnimatedContent>

          {/* Interactive ShapeWaves Canvas Backdrop with Embedded Action Buttons */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: '660px',
              height: '145px',
              margin: '0 auto 28px',
              borderRadius: '24px',
              overflow: 'hidden',
              border: '1px solid rgba(255, 255, 255, 0.14)',
              boxShadow: '0 24px 60px rgba(0, 0, 0, 0.8), 0 0 50px rgba(99, 102, 241, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
              <ShapeWaves
                text="AuraDrop"
                fontFamily='Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                fontWeight={800}
                textSize={0.42}
                shapes="mixed"
                cellSize={9}
                dotSize={0.75}
                color="#4f46e5"
                hoverColor="#ffffff"
                backgroundColor="#050508"
                speed={1.2}
                scale={0.9}
                contrast={1.1}
                brightness={0.4}
                glow={0.35}
                interactive={true}
                splashRadius={36}
                splashStrength={0.45}
                intro={true}
              />
            </div>
            <div
              style={{
                position: 'relative',
                zIndex: 2,
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                flexWrap: 'wrap',
                justifyContent: 'center',
                background: 'rgba(0, 0, 0, 0.72)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                padding: '10px 16px',
                borderRadius: '9999px',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                boxShadow: '0 12px 36px rgba(0, 0, 0, 0.85)',
              }}
            >
              <a
                href="/downloads/AuraDrop-Setup.exe"
                download="AuraDrop-Setup.exe"
                className="hero-pill-btn cursor-pointer"
                style={{ padding: '12px 28px' }}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
                </svg>
                <span>Download for Windows</span>
              </a>

              <a
                href="https://github.com/JACK-AI7/AuraDrop/releases/download/v2.0.1/AuraDrop-Android.apk"
                target="_blank"
                rel="noopener noreferrer"
                className="hero-ghost-btn cursor-pointer"
                style={{ padding: '12px 24px' }}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.551 0 .9993.4482.9993.9993.0001.5511-.4483.9997-.9993.9997m-11.046 0c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993 0 .5511-.4482.9997-.9993.9997m11.4045-6.02l1.9973-3.4592a.416.416 0 00-.1521-.5676.416.416 0 00-.5676.1521l-2.0223 3.503C15.5902 8.4116 13.8533 8.1 12 8.1s-3.5902.3116-5.1368.8497L4.8409 5.4467a.4161.4161 0 00-.5677-.1521.4157.4157 0 00-.1521.5676l1.9973 3.4592C2.6889 11.1867.3432 14.6589 0 18.761h24c-.3432-4.1021-2.6889-7.5743-6.1185-9.4396"/>
                </svg>
                <span>Android APK</span>
              </a>
            </div>
          </div>

          {/* Supported Platforms Strip */}
          <div style={{ marginTop: '48px', marginBottom: '46px' }}>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'rgba(255,255,255,0.8)', fontSize: '15px', fontWeight: 600 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/></svg>
                <span>Windows 11</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'rgba(255,255,255,0.8)', fontSize: '15px', fontWeight: 600 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.551 0 .9993.4482.9993.9993.0001.5511-.4483.9997-.9993.9997m-11.046 0c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993 0 .5511-.4482.9997-.9993.9997m11.4045-6.02l1.9973-3.4592a.416.416 0 00-.1521-.5676.416.416 0 00-.5676.1521l-2.0223 3.503C15.5902 8.4116 13.8533 8.1 12 8.1s-3.5902.3116-5.1368.8497L4.8409 5.4467a.4161.4161 0 00-.5677-.1521.4157.4157 0 00-.1521.5676l1.9973 3.4592C2.6889 11.1867.3432 14.6589 0 18.761h24c-.3432-4.1021-2.6889-7.5743-6.1185-9.4396"/></svg>
                <span>Android 15</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'rgba(255,255,255,0.8)', fontSize: '15px', fontWeight: 600 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.61-.75 1.04-1.8 1.01-2.87-.96.04-2.06.66-2.7 1.45-.56.66-.99 1.72-.94 2.76 1.08.08 2.02-.59 2.63-1.34z"/></svg>
                <span>Apple macOS / iOS</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'rgba(255,255,255,0.8)', fontSize: '15px', fontWeight: 600 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
                <span>Web P2P</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'rgba(255,255,255,0.8)', fontSize: '15px', fontWeight: 600 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12.003 2c-2.22 0-3.99 1.77-3.99 3.99 0 .42.06.82.18 1.2-1.39.46-2.4 1.76-2.4 3.31 0 1.34.76 2.5 1.86 3.07-.09.34-.15.7-.15 1.08 0 2.65 2.01 4.8 4.5 4.8s4.5-2.15 4.5-4.8c0-.38-.06-.74-.15-1.08 1.1-.57 1.86-1.73 1.86-3.07 0-1.55-1.01-2.85-2.4-3.31.12-.38.18-.78.18-1.2 0-2.22-1.77-3.99-3.99-3.99z"/></svg>
                <span>Linux</span>
              </div>
            </div>
          </div>

          {/* ── Framed Live App Interactive Demo Preview with TiltedCard ────── */}
          <div
            ref={windowPreviewRef}
            style={{
              maxWidth: '980px',
              margin: '0 auto 70px',
              position: 'relative',
              textAlign: 'left',
            }}
          >
            <TiltedCard
              containerWidth="100%"
              containerHeight="auto"
              imageWidth="100%"
              imageHeight="auto"
              rotateAmplitude={6}
              scaleOnHover={1.01}
              glare={0.2}
              shadow={0.5}
              showTooltip={false}
              radius={18}
            >
              <div
                style={{
                  backgroundColor: '#08080A',
                  border: '1px solid rgba(255, 255, 255, 0.14)',
                  borderRadius: '18px',
                  overflow: 'hidden',
                  boxShadow: '0 40px 120px rgba(0, 0, 0, 0.9), 0 0 90px rgba(99, 102, 241, 0.15)',
                  width: '100%',
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
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255, 255, 255, 0.65)' }}>
                    AuraDrop Desktop · Dynamic Island &amp; Proximity Radar Demo
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'rgba(255, 255, 255, 0.4)', fontSize: '13px' }}>
                    <span>🔍</span>
                    <span>⧉</span>
                  </div>
                </div>

                {/* Window Content */}
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
                        color: '#8E8E93',
                        borderLeft: '1px solid rgba(255, 255, 255, 0.18)',
                        paddingLeft: '10px',
                      }}
                    >
                      67.7 MB/s
                    </span>
                  </div>

                  {/* 3D Interactive Hero Globe */}
                  <div style={{ marginBottom: '24px' }}>
                    <HeroGlobe
                      peers={peers.length > 0 ? peers : [
                        { id: 'demo-1', name: 'Pixel 9 Pro', platform: 'android', connectionState: 'READY_TO_TRANSFER', ip: '192.168.1.12' },
                        { id: 'demo-2', name: 'Surface Studio', platform: 'windows', connectionState: 'CONNECTED', ip: '192.168.1.15' },
                      ]}
                      selectedPeerId={selectedPeer?.id || 'demo-1'}
                      onSelectPeer={(p) => setSelectedPeer(p)}
                      isTransferring={false}
                      transferSpeed="67.7 MB/s"
                      size={220}
                    />
                  </div>

                  {/* Nodes Mockup */}
                  <div style={{ width: '100%', maxWidth: '720px', marginBottom: '24px' }}>
                    <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', justifyContent: 'center' }}>
                      <div style={{ backgroundColor: 'rgba(99, 102, 241, 0.12)', border: '1px solid rgba(99, 102, 241, 0.45)', borderRadius: '14px', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '12px', flex: '1 1 200px' }}>
                        <span style={{ fontSize: '20px' }}>📱</span>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: '#FFFFFF' }}>Pixel 9 Pro</div>
                          <div style={{ fontSize: '11px', color: '#34C759' }}>Android 15 · Ready to transfer</div>
                        </div>
                      </div>
                      <div style={{ backgroundColor: '#0F0F14', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '14px', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '12px', flex: '1 1 200px' }}>
                        <span style={{ fontSize: '20px' }}>💻</span>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: '#FFFFFF' }}>Surface Studio</div>
                          <div style={{ fontSize: '11px', color: '#8E8E93' }}>Windows 11 · Dynamic Island Ready</div>
                        </div>
                      </div>
                      <div style={{ backgroundColor: '#0F0F14', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '14px', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '12px', flex: '1 1 200px' }}>
                        <span style={{ fontSize: '20px' }}>🌐</span>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: '#FFFFFF' }}>Chrome on macOS</div>
                          <div style={{ fontSize: '11px', color: '#8E8E93' }}>WebRTC · Zero-Install</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Transfer Simulation Box */}
                  <div
                    style={{
                      width: '100%',
                      maxWidth: '720px',
                      backgroundColor: '#0A0A0D',
                      border: '1px solid rgba(255, 255, 255, 0.09)',
                      borderRadius: '14px',
                      padding: '16px 20px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF' }}>4K_Cinematic_Broll.mov</span>
                      <span style={{ fontSize: '12px', color: '#34C759', fontWeight: 600 }}>82% · 1.8s remaining</span>
                    </div>
                    <div style={{ height: '6px', backgroundColor: '#181820', borderRadius: '9999px', overflow: 'hidden', margin: '12px 0 10px' }}>
                      <div style={{ height: '100%', width: '82%', background: 'linear-gradient(90deg, #6366f1, #38bdf8)', borderRadius: '9999px' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#8E8E93' }}>
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
              <div className="feature-card">
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255, 255, 255, 0.35)', marginBottom: '22px' }}>01 / SPEED</div>
                <h3 style={{ fontSize: '21px', fontWeight: 700, color: '#FFFFFF', marginBottom: '12px' }}>100+ MB/s LAN Streaming</h3>
                <p style={{ fontSize: '14px', color: '#8E8E93', lineHeight: 1.65 }}>Direct TCP and HTTP chunked streams transfer raw bytes at the physical throughput limit of your local router without uploading to any external server.</p>
              </div>
              <div className="feature-card">
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255, 255, 255, 0.35)', marginBottom: '22px' }}>02 / ZERO-CONFIG</div>
                <h3 style={{ fontSize: '21px', fontWeight: 700, color: '#FFFFFF', marginBottom: '12px' }}>Seamless Auto-Discovery</h3>
                <p style={{ fontSize: '14px', color: '#8E8E93', lineHeight: 1.65 }}>UDP Multicast announcements detect phones and PCs on the same Wi-Fi instantly. No Bluetooth pairing pins, no login credentials, and no setup friction.</p>
              </div>
              <div className="feature-card">
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255, 255, 255, 0.35)', marginBottom: '22px' }}>03 / SECURITY</div>
                <h3 style={{ fontSize: '21px', fontWeight: 700, color: '#FFFFFF', marginBottom: '12px' }}>Fail-Closed Authentication</h3>
                <p style={{ fontSize: '14px', color: '#8E8E93', lineHeight: 1.65 }}>Single-use cryptographic upload tokens expire in 60 seconds and invalidate immediately upon transfer initiation. Spoofed device IDs receive immediate 403s.</p>
              </div>
              <div className="feature-card">
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255, 255, 255, 0.35)', marginBottom: '22px' }}>04 / INTEGRITY</div>
                <h3 style={{ fontSize: '21px', fontWeight: 700, color: '#FFFFFF', marginBottom: '12px' }}>SHA-256 Byte Verification</h3>
                <p style={{ fontSize: '14px', color: '#8E8E93', lineHeight: 1.65 }}>Receivers calculate streaming SHA-256 checksums incrementally. Files with mismatched hashes or truncated bytes are automatically rejected.</p>
              </div>
              <div className="feature-card">
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255, 255, 255, 0.35)', marginBottom: '22px' }}>05 / PRIVACY</div>
                <h3 style={{ fontSize: '21px', fontWeight: 700, color: '#FFFFFF', marginBottom: '12px' }}>Zero Cloud Staging</h3>
                <p style={{ fontSize: '14px', color: '#8E8E93', lineHeight: 1.65 }}>Files stream device-to-device directly over LAN sockets. Signaling relays negotiate WebRTC handshakes only and never touch raw file bytes.</p>
              </div>
              <div className="feature-card">
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255, 255, 255, 0.35)', marginBottom: '22px' }}>06 / MESSAGING</div>
                <h3 style={{ fontSize: '21px', fontWeight: 700, color: '#FFFFFF', marginBottom: '12px' }}>Encrypted P2P Chat</h3>
                <p style={{ fontSize: '14px', color: '#8E8E93', lineHeight: 1.65 }}>Send instant messages, code snippets, and clipboard links across devices securely with zero server retention or third-party storage.</p>
              </div>
            </div>
          </div>
        </section>
      </AnimatedContent>

      {/* ══════════════════════════════════════════════════════════════════════════
           PROTOCOL SECTION
      ══════════════════════════════════════════════════════════════════════════ */}
      <AnimatedContent distance={40} duration={0.8} threshold={0.08}>
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
                <p style={{ fontSize: '13px', color: '#8E8E93', lineHeight: 1.6 }}>Devices announce presence via UDP multicast on port 53317. Peer IP addresses and capabilities are resolved instantly.</p>
              </div>
              <div style={{ backgroundColor: '#070709', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '16px', padding: '28px 24px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '13px', marginBottom: '18px' }}>2</div>
                <h4 style={{ fontSize: '17px', fontWeight: 700, color: '#FFFFFF', marginBottom: '8px' }}>Token Handshake</h4>
                <p style={{ fontSize: '13px', color: '#8E8E93', lineHeight: 1.6 }}>Sender requests a single-use authorization token. The receiver verifies sender identity and derives an ephemeral 60s key.</p>
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
      </AnimatedContent>

      {/* ══════════════════════════════════════════════════════════════════════════
           APP ARCHITECTURE SECTION (Replaced Single-Feature Island section)
      ══════════════════════════════════════════════════════════════════════════ */}
      <AnimatedContent distance={40} duration={0.8} threshold={0.08}>
        <section id="architecture" style={{ padding: '96px 0', borderTop: '1px solid rgba(255, 255, 255, 0.07)', backgroundColor: '#000000' }}>
          <div style={{ maxWidth: '1220px', margin: '0 auto', padding: '0 28px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255, 255, 255, 0.45)', marginBottom: '14px' }}>
              System Architecture
            </div>
            <h2 style={{ fontSize: 'clamp(32px, 4.2vw, 52px)', fontWeight: 700, letterSpacing: '-0.03em', color: '#FFFFFF', marginBottom: '16px', lineHeight: 1.15 }}>
              Built for native platform excellence.
            </h2>
            <p style={{ fontSize: '17px', color: '#8E8E93', maxWidth: '620px', lineHeight: 1.6, marginBottom: '56px' }}>
              AuraDrop is engineered with specialized native runtimes for Windows, Android, and Web, sharing a unified cryptographic protocol.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px' }}>
              <div style={{ backgroundColor: '#08080A', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '16px', padding: '28px' }}>
                <div style={{ fontSize: '22px', marginBottom: '14px' }}>🦀</div>
                <h4 style={{ fontSize: '16px', fontWeight: 700, color: '#FFFFFF', marginBottom: '8px' }}>Tauri &amp; Rust Desktop Core</h4>
                <p style={{ fontSize: '13px', color: '#8E8E93', lineHeight: 1.6 }}>Ultra-lean 5.96 MB Windows installer with negligible RAM usage, native Windows Dynamic Island overlay, and local socket server.</p>
              </div>
              <div style={{ backgroundColor: '#08080A', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '16px', padding: '28px' }}>
                <div style={{ fontSize: '22px', marginBottom: '14px' }}>📱</div>
                <h4 style={{ fontSize: '16px', fontWeight: 700, color: '#FFFFFF', marginBottom: '8px' }}>Flutter &amp; Kotlin Android Engine</h4>
                <p style={{ fontSize: '13px', color: '#8E8E93', lineHeight: 1.6 }}>Optimized foreground service, dynamic notification pill, direct port 8080 HTTP server, and automatic gallery integration.</p>
              </div>
              <div style={{ backgroundColor: '#08080A', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '16px', padding: '28px' }}>
                <div style={{ fontSize: '22px', marginBottom: '14px' }}>🌐</div>
                <h4 style={{ fontSize: '16px', fontWeight: 700, color: '#FFFFFF', marginBottom: '8px' }}>Universal Web P2P Engine</h4>
                <p style={{ fontSize: '13px', color: '#8E8E93', lineHeight: 1.6 }}>Peer-to-peer browser connectivity using WebRTC DataChannels with STUN/TURN traversal for cross-network file exchanges.</p>
              </div>
              <div style={{ backgroundColor: '#08080A', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '16px', padding: '28px' }}>
                <div style={{ fontSize: '22px', marginBottom: '14px' }}>🛡️</div>
                <h4 style={{ fontSize: '16px', fontWeight: 700, color: '#FFFFFF', marginBottom: '8px' }}>17-Point Regression Suite</h4>
                <p style={{ fontSize: '13px', color: '#8E8E93', lineHeight: 1.6 }}>Automated tests continuously auditing path traversal sanitization, device identity binding, and SHA-256 byte integrity.</p>
              </div>
            </div>
          </div>
        </section>
      </AnimatedContent>

      {/* ══════════════════════════════════════════════════════════════════════════
           UPGRADED HIGH-END DOWNLOADS SECTION (BorderGlow + PixelCard)
      ══════════════════════════════════════════════════════════════════════════ */}
      <AnimatedContent distance={40} duration={0.8} threshold={0.08}>
        <section id="downloads" style={{ padding: '96px 0', borderTop: '1px solid rgba(255, 255, 255, 0.07)', backgroundColor: '#000000' }}>
          <div style={{ maxWidth: '1220px', margin: '0 auto', padding: '0 28px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255, 255, 255, 0.45)', marginBottom: '14px' }}>
              Production Releases
            </div>
            <h2 style={{ fontSize: 'clamp(32px, 4.2vw, 52px)', fontWeight: 700, letterSpacing: '-0.03em', color: '#FFFFFF', marginBottom: '16px', lineHeight: 1.15 }}>
              Download AuraDrop v2.0.1
            </h2>
            <p style={{ fontSize: '17px', color: '#8E8E93', maxWidth: '620px', lineHeight: 1.6, marginBottom: '56px' }}>
              Official release binaries. Code signed for Windows, standalone APK for Android, and verified SHA-256 integrity checksums.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '28px' }}>
              {/* Windows Desktop Card with BorderGlow & PixelCard */}
              <BorderGlow
                borderRadius={22}
                backgroundColor="#08080c"
                glowColor="240 80 80"
                colors={['#6366f1', '#38bdf8', '#c084fc']}
                edgeSensitivity={30}
                glowRadius={35}
                glowIntensity={1.0}
              >
                <PixelCard
                  theme="dark"
                  variant="blue"
                  radius={22}
                  gap={6}
                  speed={30}
                  style={{
                    width: '100%',
                    height: '100%',
                    padding: '36px 32px',
                    textAlign: 'left',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                      <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                        <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(255, 255, 255, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/></svg>
                        </div>
                        <div>
                          <div style={{ fontSize: '22px', fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.02em' }}>Windows Desktop</div>
                          <div style={{ fontSize: '13px', color: '#8E8E93', marginTop: '2px' }}>v2.0.1 · Windows 10 &amp; 11 (64-bit)</div>
                        </div>
                      </div>
                      <span style={{ fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '9999px', background: 'rgba(52, 199, 89, 0.12)', color: '#34C759', border: '1px solid rgba(52, 199, 89, 0.25)' }}>
                        Stable
                      </span>
                    </div>

                    <p style={{ fontSize: '14px', color: '#8E8E93', lineHeight: 1.6, marginBottom: '24px' }}>
                      Tauri v2 native desktop application featuring native Windows Dynamic Island, local TCP chunk streaming, and zero-config peer discovery.
                    </p>

                    {/* Technical Specs Strip */}
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '28px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.7)', background: 'rgba(255,255,255,0.05)', padding: '4px 10px', borderRadius: '6px' }}>x64 Arch</span>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.7)', background: 'rgba(255,255,255,0.05)', padding: '4px 10px', borderRadius: '6px' }}>Rust Engine</span>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.7)', background: 'rgba(255,255,255,0.05)', padding: '4px 10px', borderRadius: '6px' }}>SHA-256 Verified</span>
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
                        backgroundColor: '#FFFFFF',
                        color: '#000000',
                        textDecoration: 'none',
                        fontSize: '14px',
                        fontWeight: 700,
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        Download Setup.exe
                      </span>
                      <span style={{ opacity: 0.7 }}>5.96 MB</span>
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
                          backgroundColor: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          color: '#FFFFFF',
                          textDecoration: 'none',
                          fontSize: '13px',
                          fontWeight: 600,
                        }}
                      >
                        <span>MSI Package</span>
                        <span style={{ color: '#8E8E93', fontSize: '12px' }}>9.25 MB</span>
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
                          backgroundColor: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          color: '#FFFFFF',
                          textDecoration: 'none',
                          fontSize: '13px',
                          fontWeight: 600,
                        }}
                      >
                        <span>Portable ZIP</span>
                        <span style={{ color: '#8E8E93', fontSize: '12px' }}>8.42 MB</span>
                      </a>
                    </div>
                  </div>
                </PixelCard>
              </BorderGlow>

              {/* Android Mobile Card with BorderGlow & PixelCard */}
              <BorderGlow
                borderRadius={22}
                backgroundColor="#08080c"
                glowColor="140 80 80"
                colors={['#34C759', '#38bdf8', '#6366f1']}
                edgeSensitivity={30}
                glowRadius={35}
                glowIntensity={1.0}
              >
                <PixelCard
                  theme="dark"
                  variant="yellow"
                  radius={22}
                  gap={6}
                  speed={30}
                  style={{
                    width: '100%',
                    height: '100%',
                    padding: '36px 32px',
                    textAlign: 'left',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                      <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                        <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(255, 255, 255, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.551 0 .9993.4482.9993.9993.0001.5511-.4483.9997-.9993.9997m-11.046 0c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993 0 .5511-.4482.9997-.9993.9997m11.4045-6.02l1.9973-3.4592a.416.416 0 00-.1521-.5676.416.416 0 00-.5676.1521l-2.0223 3.503C15.5902 8.4116 13.8533 8.1 12 8.1s-3.5902.3116-5.1368.8497L4.8409 5.4467a.4161.4161 0 00-.5677-.1521.4157.4157 0 00-.1521.5676l1.9973 3.4592C2.6889 11.1867.3432 14.6589 0 18.761h24c-.3432-4.1021-2.6889-7.5743-6.1185-9.4396"/></svg>
                        </div>
                        <div>
                          <div style={{ fontSize: '22px', fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.02em' }}>Android Mobile</div>
                          <div style={{ fontSize: '13px', color: '#8E8E93', marginTop: '2px' }}>v2.0.1 · Android 8.0+ (ARM64)</div>
                        </div>
                      </div>
                      <span style={{ fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '9999px', background: 'rgba(52, 199, 89, 0.12)', color: '#34C759', border: '1px solid rgba(52, 199, 89, 0.25)' }}>
                        Stable
                      </span>
                    </div>

                    <p style={{ fontSize: '14px', color: '#8E8E93', lineHeight: 1.6, marginBottom: '24px' }}>
                      Flutter &amp; Kotlin foreground service app with real-time notification dynamic island, MediaStore gallery exports, and embedded socket server.
                    </p>

                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '28px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.7)', background: 'rgba(255,255,255,0.05)', padding: '4px 10px', borderRadius: '6px' }}>ARM64-v8a</span>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.7)', background: 'rgba(255,255,255,0.05)', padding: '4px 10px', borderRadius: '6px' }}>Scoped Storage</span>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.7)', background: 'rgba(255,255,255,0.05)', padding: '4px 10px', borderRadius: '6px' }}>Zero Battery Drain</span>
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
                        backgroundColor: '#FFFFFF',
                        color: '#000000',
                        textDecoration: 'none',
                        fontSize: '14px',
                        fontWeight: 700,
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        Download Direct APK
                      </span>
                      <span style={{ opacity: 0.7 }}>113.7 MB</span>
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
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        color: '#FFFFFF',
                        textDecoration: 'none',
                        fontSize: '13px',
                        fontWeight: 600,
                      }}
                    >
                      <span>View GitHub Release Notes ↗</span>
                      <span style={{ color: '#8E8E93', fontSize: '12px' }}>Changelog</span>
                    </a>
                  </div>
                </PixelCard>
              </BorderGlow>

              {/* Apple & Linux Ecosystem Card with BorderGlow & PixelCard */}
              <BorderGlow
                borderRadius={22}
                backgroundColor="#08080c"
                glowColor="30 80 80"
                colors={['#FF9F0A', '#c084fc', '#38bdf8']}
                edgeSensitivity={30}
                glowRadius={35}
                glowIntensity={1.0}
              >
                <PixelCard
                  theme="dark"
                  variant="default"
                  radius={22}
                  gap={6}
                  speed={30}
                  style={{
                    width: '100%',
                    height: '100%',
                    padding: '36px 32px',
                    textAlign: 'left',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                      <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                        <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(255, 255, 255, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.61-.75 1.04-1.8 1.01-2.87-.96.04-2.06.66-2.7 1.45-.56.66-.99 1.72-.94 2.76 1.08.08 2.02-.59 2.63-1.34z"/></svg>
                        </div>
                        <div>
                          <div style={{ fontSize: '22px', fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.02em' }}>Apple &amp; Linux</div>
                          <div style={{ fontSize: '13px', color: '#8E8E93', marginTop: '2px' }}>macOS, iOS, Ubuntu, Debian</div>
                        </div>
                      </div>
                      <span style={{ fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '9999px', background: 'rgba(255, 159, 10, 0.12)', color: '#FF9F0A', border: '1px solid rgba(255, 159, 10, 0.25)' }}>
                        Roadmap
                      </span>
                    </div>

                    <p style={{ fontSize: '14px', color: '#8E8E93', lineHeight: 1.6, marginBottom: '24px' }}>
                      Native macOS Apple Silicon DMG and Linux AppImage packages are actively compiling. Safari and Chrome users can share instantly using WebRTC data planes.
                    </p>

                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '28px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.7)', background: 'rgba(255,255,255,0.05)', padding: '4px 10px', borderRadius: '6px' }}>Apple Silicon</span>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.7)', background: 'rgba(255,255,255,0.05)', padding: '4px 10px', borderRadius: '6px' }}>AppImage</span>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.7)', background: 'rgba(255,255,255,0.05)', padding: '4px 10px', borderRadius: '6px' }}>MIT License</span>
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
                      backgroundColor: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.14)',
                      color: '#FFFFFF',
                      textDecoration: 'none',
                      fontSize: '14px',
                      fontWeight: 600,
                      marginTop: '16px',
                    }}
                  >
                    <span>Track Progress on GitHub ↗</span>
                    <span style={{ color: '#8E8E93', fontSize: '12px' }}>Open Source</span>
                  </a>
                </PixelCard>
              </BorderGlow>
            </div>
          </div>
        </section>
      </AnimatedContent>

      {/* ══════════════════════════════════════════════════════════════════════════
           BUY ME A COFFEE / SUPPORT (BorderGlow + PixelCard + BranchedMenu + SlideCommit)
      ══════════════════════════════════════════════════════════════════════════ */}
      <AnimatedContent distance={40} duration={0.8} threshold={0.08}>
        <section id="support" style={{ padding: '96px 0', borderTop: '1px solid rgba(255, 255, 255, 0.07)', backgroundColor: '#050508' }}>
          <div style={{ maxWidth: '860px', margin: '0 auto', padding: '0 28px', textAlign: 'center' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255, 255, 255, 0.45)', marginBottom: '14px' }}>
              Support Independent Development
            </div>
            <h2 style={{ fontSize: 'clamp(30px, 3.8vw, 48px)', fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.03em', marginBottom: '16px' }}>
              Buy Me a Coffee ☕
            </h2>
            <p style={{ fontSize: '16px', color: '#8E8E93', lineHeight: 1.6, maxWidth: '620px', margin: '0 auto 40px auto' }}>
              AuraDrop is 100% free, private, and open source with zero advertisements, zero tracking, and zero cloud surveillance. If this tool saves you time, consider supporting future development directly.
            </p>

            {/* Direct UPI Payment & Contribution Card with BorderGlow + PixelCard */}
            <BorderGlow
              borderRadius={24}
              backgroundColor="#0A0A0E"
              glowColor="280 80 80"
              colors={['#ec4899', '#8b5cf6', '#38bdf8']}
              edgeSensitivity={32}
              glowRadius={42}
              glowIntensity={1.1}
            >
              <PixelCard
                theme="dark"
                variant="pink"
                radius={24}
                gap={6}
                speed={40}
                style={{ width: '100%', height: '100%', padding: '38px 30px' }}
              >
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  {/* Top Flex Layout: QR Code on Left, BranchedMenu on Right */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '36px',
                      flexWrap: 'wrap',
                      marginBottom: '28px',
                      width: '100%',
                    }}
                  >
                    {/* QR Code */}
                    <div
                      style={{
                        padding: '16px',
                        borderRadius: '18px',
                        backgroundColor: '#121216',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
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
                      <div style={{ marginTop: '10px' }}>
                        <p style={{ fontSize: '12px', fontWeight: 700, color: '#FFFFFF' }}>Union Bank of India • PhonePe QR</p>
                        <p style={{ fontSize: '11px', color: '#8E8E93', marginTop: '2px' }}>Payee: B.JASWANTH REDDY</p>
                      </div>
                    </div>

                    {/* Branched Menu for Payment / Support */}
                    <div
                      style={{
                        backgroundColor: 'rgba(18, 18, 24, 0.85)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '16px',
                        padding: '18px 20px',
                        textAlign: 'left',
                        minWidth: '280px',
                      }}
                    >
                      <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8E8E93', marginBottom: '8px' }}>
                        Payment Method &amp; Tiers
                      </div>
                      <BranchedMenu
                        items={supportMenuItems}
                        defaultOpen={[0, 1]}
                        defaultActive="upi_copy"
                        onSelect={(val) => handleSupportMenuSelect(val)}
                        color="#FFFFFF"
                        accentColor="#6366f1"
                        lineColor="#3f3f46"
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
                      backgroundColor: '#14141A',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '14px',
                      padding: '12px 20px',
                      width: '100%',
                      maxWidth: '460px',
                      margin: '0 auto 20px auto',
                    }}
                  >
                    <div style={{ textAlign: 'left' }}>
                      <span style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 700, color: '#8E8E93', letterSpacing: '0.08em', display: 'block' }}>
                        Direct UPI ID
                      </span>
                      <span style={{ fontSize: '15px', fontWeight: 700, color: '#FFFFFF', fontFamily: 'monospace' }}>
                        9182769225@ybl
                      </span>
                    </div>
                    <button
                      onClick={handleCopyUpi}
                      className="cursor-pointer"
                      style={{
                        backgroundColor: copiedUpi ? '#34C759' : '#FFFFFF',
                        color: copiedUpi ? '#FFFFFF' : '#000000',
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
                  <div style={{ marginTop: '6px', marginBottom: '18px' }}>
                    <SlideCommit
                      label={`Slide to support · ₹${selectedTier}`}
                      doneLabel="Support confirmed! Thank you ☕"
                      errorLabel="Action failed"
                      onConfirm={handleSlideCommit}
                      trackColor="#16161f"
                      handleColor="#FFFFFF"
                      successColor="#34C759"
                      dangerColor="#e5484d"
                      width={340}
                      height={52}
                      radius={26}
                      speed={50}
                    />
                  </div>

                  {supportNotice && (
                    <div style={{ fontSize: '13px', color: '#34C759', fontWeight: 600, marginBottom: '16px' }}>
                      {supportNotice}
                    </div>
                  )}

                  {/* Coffee Tiers */}
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '14px', flexWrap: 'wrap', width: '100%' }}>
                    <div
                      onClick={() => { setSelectedTier(50); setSupportNotice('Selected 1 Coffee (₹50)'); }}
                      className="cursor-pointer"
                      style={{
                        padding: '14px 20px',
                        borderRadius: '16px',
                        background: selectedTier === 50 ? 'rgba(99, 102, 241, 0.16)' : 'rgba(255,255,255,0.04)',
                        border: selectedTier === 50 ? '1px solid #6366f1' : '1px solid rgba(255,255,255,0.08)',
                        minWidth: '130px',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <div style={{ fontSize: '20px', marginBottom: '4px' }}>☕</div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF' }}>1 Coffee</div>
                      <div style={{ fontSize: '11px', color: selectedTier === 50 ? '#818cf8' : '#8E8E93', marginTop: '2px' }}>₹50 / $1</div>
                    </div>
                    <div
                      onClick={() => { setSelectedTier(150); setSupportNotice('Selected 3 Coffees (₹150)'); }}
                      className="cursor-pointer"
                      style={{
                        padding: '14px 20px',
                        borderRadius: '16px',
                        background: selectedTier === 150 ? 'rgba(99, 102, 241, 0.16)' : 'rgba(255,255,255,0.04)',
                        border: selectedTier === 150 ? '1px solid #6366f1' : '1px solid rgba(255,255,255,0.08)',
                        minWidth: '130px',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <div style={{ fontSize: '20px', marginBottom: '4px' }}>☕☕☕</div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF' }}>3 Coffees</div>
                      <div style={{ fontSize: '11px', color: selectedTier === 150 ? '#818cf8' : '#8E8E93', marginTop: '2px' }}>₹150 / $2</div>
                    </div>
                    <div
                      onClick={() => { setSelectedTier(500); setSupportNotice('Selected Supporter Star (₹500)'); }}
                      className="cursor-pointer"
                      style={{
                        padding: '14px 20px',
                        borderRadius: '16px',
                        background: selectedTier === 500 ? 'rgba(99, 102, 241, 0.2)' : 'rgba(99, 102, 241, 0.08)',
                        border: selectedTier === 500 ? '1px solid #a855f7' : '1px solid rgba(99, 102, 241, 0.3)',
                        minWidth: '130px',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <div style={{ fontSize: '20px', marginBottom: '4px' }}>⭐</div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF' }}>Supporter</div>
                      <div style={{ fontSize: '11px', color: '#38bdf8', marginTop: '2px' }}>₹500 / $6</div>
                    </div>
                  </div>
                </div>
              </PixelCard>
            </BorderGlow>
          </div>
        </section>
      </AnimatedContent>

      {/* ══════════════════════════════════════════════════════════════════════════
           ELECTRIC LOGO SHOWCASE (Interactive Electric Lightning Core)
      ══════════════════════════════════════════════════════════════════════════ */}
      <AnimatedContent distance={40} duration={0.8} threshold={0.1}>
        <section
          id="electric-logo-section"
          style={{
            padding: '80px 0 60px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            backgroundColor: '#000000',
            textAlign: 'center',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ maxWidth: '1220px', margin: '0 auto', padding: '0 28px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255, 255, 255, 0.45)', marginBottom: '14px' }}>
              Electric Core Teleportation
            </div>
            <h2 style={{ fontSize: 'clamp(28px, 3.6vw, 44px)', fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.03em', marginBottom: '12px' }}>
              Powered by AuraDrop Protocol
            </h2>
            <p style={{ fontSize: '15px', color: '#8E8E93', maxWidth: '580px', margin: '0 auto 36px', lineHeight: 1.6 }}>
              Interactive electric field tracing our native logo. Hover to charge the lightning filaments, click to discharge high-voltage sparks across the node.
            </p>

            <div
              style={{
                width: '100%',
                maxWidth: '520px',
                height: '340px',
                margin: '0 auto',
                position: 'relative',
                borderRadius: '24px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                background: 'radial-gradient(circle at 50% 50%, rgba(99, 102, 241, 0.12) 0%, #060609 80%)',
                boxShadow: '0 30px 80px rgba(0, 0, 0, 0.9), 0 0 60px rgba(99, 102, 241, 0.2)',
                overflow: 'hidden',
              }}
            >
              <ElectricLogo
                src="/logo.png"
                color="#ecc7ff"
                glowColor="#818cf8"
                scale={0.65}
                strands={4}
                bend={0.6}
                crackle={1.5}
                arcs={2}
                speed={2.2}
                interactive={true}
                cursorIntensity={0.8}
                cursorRadius={110}
              />
            </div>
          </div>
        </section>
      </AnimatedContent>

      {/* ══════════════════════════════════════════════════════════════════════════
           FOOTER
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
