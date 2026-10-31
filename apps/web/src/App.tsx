import React, { useState, useEffect, useRef } from 'react';
import { HeroGlobe } from './components/HeroGlobe';
import { DownloadsModal, DiagnosticsModal } from './components/Modals';
import { LegalModal, LegalTab } from './components/LegalModal';
import { CookieConsentBanner } from './components/CookieConsentBanner';
import { CommandMenu } from './components/CommandMenu';
import { ToastNotification, ToastMessage } from './components/ToastNotification';
import { AirDropNotification } from './components/AirDropNotification';
import { analytics } from './engine/analytics';
import { PeerDevice, TransferProgress } from './types';

// React Bits Suite
import BorderGlow from './components/reactbits/BorderGlow';
import SlideCommit from './components/reactbits/SlideCommit';
import AnimatedContent from './components/reactbits/AnimatedContent';

// Interactive 3D Tilt Card that smoothly follows cursor movement
const TiltCard: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
  onClick?: () => void;
}> = ({ children, style, className = '', onClick }) => {
  const ref = useRef<HTMLDivElement>(null);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const rotX = ((y - rect.height / 2) / (rect.height / 2)) * -6;
    const rotY = ((x - rect.width / 2) / (rect.width / 2)) * 6;
    el.style.transform = `perspective(800px) rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg) translateY(-4px)`;
    el.style.transition = 'transform 0.08s ease-out, box-shadow 0.2s ease, border-color 0.2s ease';
  };

  const handlePointerLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = 'perspective(800px) rotateX(0deg) rotateY(0deg) translateY(0px)';
    el.style.transition = 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease, border-color 0.2s ease';
  };

  return (
    <div
      ref={ref}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className={className}
      onClick={onClick}
      style={{
        transformStyle: 'preserve-3d',
        willChange: 'transform',
        ...style,
      }}
    >
      {children}
    </div>
  );
};

const DEMO_PEERS: PeerDevice[] = [
  {
    id: 'demo-1',
    deviceId: 'demo-1',
    name: 'Pixel 9 Pro',
    deviceName: 'Pixel 9 Pro',
    platform: 'android',
    connectionState: 'READY_TO_TRANSFER',
    ip: '192.168.1.12',
    port: 51820,
    lastSeen: new Date(),
    transport: 'Native LAN Turbo (124+ MB/s)',
  },
  {
    id: 'demo-2',
    deviceId: 'demo-2',
    name: 'Surface Studio',
    deviceName: 'Surface Studio',
    platform: 'windows',
    connectionState: 'READY_TO_TRANSFER',
    ip: '192.168.1.15',
    port: 51820,
    lastSeen: new Date(),
    transport: 'Direct High-Speed P2P',
  },
  {
    id: 'demo-3',
    deviceId: 'demo-3',
    name: 'MacBook Pro M3',
    deviceName: 'MacBook Pro M3',
    platform: 'macos',
    connectionState: 'READY_TO_TRANSFER',
    ip: '192.168.1.24',
    port: 51820,
    lastSeen: new Date(),
    transport: 'Direct High-Speed P2P',
  },
];

export const App: React.FC = () => {
  // Screen width for reactive mobile layout
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Theme mode: light or dark (default light with dark dot matrix)
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const isDark = theme === 'dark';

  // Showcase Demo Peers & State (Native Apps Presentation)
  const peers = DEMO_PEERS;
  const [selectedPeer, setSelectedPeer] = useState<PeerDevice | null>(DEMO_PEERS[0]);

  // Active AirDrop Transfer Progress (Interactive Showcase)
  const [activeTransfer, setActiveTransfer] = useState<TransferProgress | null>(null);
  const [incomingAirDrop, setIncomingAirDrop] = useState<{
    isOpen: boolean;
    senderName: string;
    fileName: string;
    fileSize: number;
    totalSizeText: string;
    transferId: string;
    blobUrl?: string;
  } | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const demoTimerRef = useRef<any>(null);

  // Interactive AirDrop Simulation for Showcase Visitors
  const runShowcaseDemo = (customFile?: File) => {
    if (demoTimerRef.current) clearInterval(demoTimerRef.current);

    const targetPeer = selectedPeer || DEMO_PEERS[0];
    const fileName = customFile ? customFile.name : '4K_Cinematic_Footage.mp4';
    const fileSize = customFile ? customFile.size : 450 * 1024 * 1024;
    const fmtSize =
      fileSize < 1024 * 1024
        ? `${(fileSize / 1024).toFixed(1)} KB`
        : `${(fileSize / (1024 * 1024)).toFixed(1)} MB`;

    setIncomingAirDrop({
      isOpen: true,
      senderName: targetPeer.name,
      fileName,
      fileSize,
      totalSizeText: fmtSize,
      transferId: 'showcase_' + Date.now(),
    });

    setActiveTransfer({
      transferId: 'showcase_' + Date.now(),
      fileName,
      fileSize,
      transferredBytes: 0,
      verifiedBytes: 0,
      speedBytesPerSec: 124.8 * 1024 * 1024,
      etaSeconds: 4,
      state: 'WAITING_FOR_ACCEPTANCE',
      isIncoming: true,
      peerName: targetPeer.name,
      transport: 'Native LAN Turbo (124+ MB/s)',
    });
  };

  const handleAcceptDemo = () => {
    if (!activeTransfer) return;
    const total = activeTransfer.fileSize;
    let current = 0;
    const speed = 128.5 * 1024 * 1024; // 128.5 MB/s
    const stepBytes = Math.max(1024, total / 22);

    setActiveTransfer((prev) => (prev ? { ...prev, state: 'TRANSFERRING' } : null));

    demoTimerRef.current = setInterval(() => {
      current += stepBytes;
      if (current >= total) {
        clearInterval(demoTimerRef.current);
        setActiveTransfer((prev) =>
          prev ? { ...prev, transferredBytes: total, state: 'VERIFYING', etaSeconds: 0 } : null
        );

        setTimeout(() => {
          setActiveTransfer((prev) =>
            prev ? { ...prev, state: 'COMPLETED', verifiedBytes: total } : null
          );

          addToast({
            title: 'AirDrop Demo Completed ✓',
            description: `Transferred at 128 MB/s! Download AuraDrop for Windows or Android to get this native speed on your devices.`,
            actionLabel: 'Download',
            onAction: () => setIsDownloadsOpen(true),
          });

          setTimeout(() => {
            setActiveTransfer(null);
            setIncomingAirDrop(null);
          }, 8000);
        }, 500);
      } else {
        const remaining = total - current;
        const eta = Math.max(1, Math.ceil(remaining / speed));
        setActiveTransfer((prev) =>
          prev ? { ...prev, transferredBytes: current, etaSeconds: eta, speedBytesPerSec: speed } : null
        );
      }
    }, 80);
  };

  const handleDeclineDemo = () => {
    if (demoTimerRef.current) clearInterval(demoTimerRef.current);
    setActiveTransfer(null);
    setIncomingAirDrop(null);
  };

  const handleSendFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    runShowcaseDemo(fileList[0]);
  };

  // Copy UPI state & Support Tier
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [selectedTier, setSelectedTier] = useState<number>(50);
  const [supportNotice, setSupportNotice] = useState<string>('');

  // Modals
  const [isDownloadsOpen, setIsDownloadsOpen] = useState(false);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);
  const [isLegalOpen, setIsLegalOpen] = useState(false);
  const [legalTab, setLegalTab] = useState<LegalTab>('privacy');
  const [isCommandMenuOpen, setIsCommandMenuOpen] = useState(false);

  // Undo Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const addToast = (toast: Omit<ToastMessage, 'id'>) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };
  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Global Keyboard Shortcuts (Cmd+K / Ctrl+K Command Menu)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandMenuOpen((prev) => !prev);
        analytics.track('command_menu_opened');
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // URL Hash routing for policies (#privacy, #terms, #cookies, #refund, #downloads)
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.toLowerCase();
      if (hash === '#privacy') {
        setLegalTab('privacy');
        setIsLegalOpen(true);
        analytics.track('policy_viewed', { tab: 'privacy' });
      } else if (hash === '#terms') {
        setLegalTab('terms');
        setIsLegalOpen(true);
        analytics.track('policy_viewed', { tab: 'terms' });
      } else if (hash === '#cookies') {
        setLegalTab('cookies');
        setIsLegalOpen(true);
        analytics.track('policy_viewed', { tab: 'cookies' });
      } else if (hash === '#refund') {
        setLegalTab('refund');
        setIsLegalOpen(true);
        analytics.track('policy_viewed', { tab: 'refund' });
      }
    };
    handleHash();
    window.addEventListener('hashchange', handleHash);
    analytics.track('page_view');
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  // Window preview ref for smooth scroll
  const windowPreviewRef = useRef<HTMLDivElement>(null);


  // Handle Copy UPI ID
  const handleCopyUpi = () => {
    navigator.clipboard.writeText('9182769225@ybl');
    setCopiedUpi(true);
    setSupportNotice('UPI ID copied to clipboard (9182769225@ybl)');
    addToast({
      title: 'UPI ID Copied',
      description: '9182769225@ybl ready to paste in GPay, PhonePe, or Paytm',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
          <path d="m9 14 2 2 4-4" />
        </svg>
      ),
      actionLabel: 'Dismiss',
    });
    setTimeout(() => setCopiedUpi(false), 2500);
  };

  // Handle SlideCommit success
  const handleSlideCommit = () => {
    const msg = `Thank you for supporting AuraDrop with â‚¹${selectedTier}!`;
    setSupportNotice(msg);
    addToast({
      title: 'Support Tier Selected',
      description: msg,
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="#ef4444" stroke="#ef4444" strokeWidth="1">
          <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
        </svg>
      ),
      actionLabel: 'Undo',
      onAction: () => setSupportNotice(''),
    });
  };

  // Scroll helper
  const scrollToPreview = () => {
    windowPreviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // Theme colors
  const pageBg = isDark ? '#060608' : '#ffffff';
  const dotPattern = isDark
    ? 'radial-gradient(rgba(255, 255, 255, 0.12) 1.25px, transparent 1.25px)'
    : 'radial-gradient(rgba(15, 23, 42, 0.08) 1.25px, transparent 1.25px)';
  const textPrimary = isDark ? '#ffffff' : '#0f172a';
  const textMuted = isDark ? '#94a3b8' : '#475569';
  const headerBg = isDark ? 'rgba(6, 6, 8, 0.88)' : 'rgba(255, 255, 255, 0.88)';
  const borderSubtle = isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0';
  const cardBg = isDark ? '#0b0b10' : '#ffffff';

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: pageBg,
        backgroundImage: dotPattern,
        backgroundSize: '24px 24px',
        color: textPrimary,
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        display: 'flex',
        flexDirection: 'column',
        overflowX: 'hidden',
        transition: 'background-color 0.3s ease, color 0.3s ease',
      }}
    >
      <style>{`
        .cursor-pointer { cursor: pointer; }
        .flex { display: flex; align-items: center; }
        .nav-link {
          color: ${textMuted};
          text-decoration: none;
          font-size: 14px;
          font-weight: 500;
          letter-spacing: -0.01em;
          transition: color 0.2s ease;
        }
        .nav-link:hover { color: ${textPrimary}; }
        .feature-card {
          background: ${cardBg};
          border: 1px solid ${borderSubtle};
          border-radius: 20px;
          padding: 34px 30px;
          text-align: left;
          box-shadow: ${isDark ? '0 4px 20px rgba(0,0,0,0.5)' : '0 2px 10px rgba(0,0,0,0.03)'};
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .feature-card:hover {
          border-color: ${isDark ? 'rgba(255, 255, 255, 0.22)' : '#cbd5e1'} !important;
          transform: translateY(-2px);
          box-shadow: ${isDark ? '0 16px 36px rgba(0,0,0,0.7)' : '0 14px 32px rgba(15, 23, 42, 0.06)'};
        }
        .hero-pill-btn {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          background: ${isDark ? '#ffffff' : '#0f172a'};
          color: ${isDark ? '#000000' : '#ffffff'};
          padding: 14px 32px;
          border-radius: 9999px;
          font-size: 15px;
          font-weight: 700;
          text-decoration: none;
          box-shadow: 0 4px 16px rgba(15, 23, 42, 0.16);
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .hero-pill-btn:hover {
          opacity: 0.92;
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.24);
        }
        .hero-ghost-btn {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          background: ${isDark ? 'rgba(255, 255, 255, 0.08)' : '#ffffff'};
          border: 1px solid ${isDark ? 'rgba(255, 255, 255, 0.16)' : '#cbd5e1'};
          color: ${textPrimary};
          padding: 14px 28px;
          border-radius: 9999px;
          font-size: 15px;
          font-weight: 600;
          text-decoration: none;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .hero-ghost-btn:hover {
          background: ${isDark ? 'rgba(255, 255, 255, 0.14)' : '#f8fafc'};
          border-color: ${isDark ? 'rgba(255, 255, 255, 0.3)' : '#94a3b8'};
          transform: translateY(-2px);
        }
        .hero-subtle-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: transparent;
          border: none;
          color: ${textMuted};
          padding: 14px 20px;
          border-radius: 9999px;
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
          transition: all 0.2s ease;
          cursor: pointer;
        }
        .hero-subtle-btn:hover {
          color: ${textPrimary};
        }
        @keyframes pulseDot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.35; transform: scale(0.85); }
        }
      `}</style>

      {/* ── Real Apple Dynamic Island Proximity Card (Incoming & Outgoing) ── */}
      <AirDropNotification
        isOpen={Boolean(incomingAirDrop?.isOpen || activeTransfer)}
        isIncoming={incomingAirDrop?.isOpen ? true : (activeTransfer ? activeTransfer.isIncoming : true)}
        peerName={
          incomingAirDrop?.senderName ||
          (activeTransfer?.isIncoming ? activeTransfer.peerName : activeTransfer?.peerName || selectedPeer?.name || 'Nearby Device')
        }
        filesCount={1}
        totalSizeText={
          incomingAirDrop?.totalSizeText ||
          (activeTransfer
            ? activeTransfer.fileSize < 1024 * 1024
              ? `${(activeTransfer.fileSize / 1024).toFixed(1)} KB`
              : `${(activeTransfer.fileSize / (1024 * 1024)).toFixed(1)} MB`
            : '0 MB')
        }
        fileName={incomingAirDrop?.fileName || activeTransfer?.fileName || 'file'}
        transferProgress={activeTransfer}
        onAccept={handleAcceptDemo}
        onDecline={handleDeclineDemo}
        onCancel={handleDeclineDemo}
        onDone={() => {
          setActiveTransfer(null);
          setIncomingAirDrop(null);
          setIsDownloadsOpen(true);
        }}
      />

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
           TOP NAVIGATION BAR (Real Links, Clean Logo, Light/Dark Switcher)
      â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 1000,
          width: '100%',
          backgroundColor: headerBg,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: `1px solid ${borderSubtle}`,
          transition: 'background-color 0.3s ease, border-color 0.3s ease',
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
          {/* Brand Link with Bold Visible Logo */}
          <a
            href="/"
            className="cursor-pointer"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              textDecoration: 'none',
              color: textPrimary,
              flexShrink: 0,
              marginRight: '36px',
            }}
          >
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: '#0f172a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
              }}
            >
              <img
                src="/logo.png"
                alt="AuraDrop"
                width="22"
                height="22"
                style={{ objectFit: 'contain', filter: 'brightness(3)' }}
              />
            </div>
            <span style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '-0.03em' }}>AuraDrop</span>
          </a>

          {/* Center Nav Links */}
          <nav
            className="desktop-nav"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '24px',
              listStyle: 'none',
              flex: 1,
            }}
          >
            <a href="#features" className="nav-link cursor-pointer">Features</a>
            <a href="#protocol" className="nav-link cursor-pointer">Protocol</a>
            <a href="#architecture" className="nav-link cursor-pointer">Architecture</a>
            <a href="#downloads" className="nav-link cursor-pointer">Downloads</a>
            <a href="#support" className="nav-link cursor-pointer">Support</a>
          </nav>

          {/* Right Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            
            {/* Quick Find (⌘K) Command Menu Trigger */}
            <button
              onClick={() => setIsCommandMenuOpen(true)}
              className="desktop-btn cursor-pointer"
              title="Search & Commands (âŒ˜K / Ctrl+K)"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '7px 12px',
                borderRadius: '9999px',
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#f1f5f9',
                border: `1px solid ${borderSubtle}`,
                color: textMuted,
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 600,
                transition: 'all 0.15s ease',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <span>Quick Find</span>
              <kbd style={{ fontSize: '10px', background: isDark ? '#1a1a20' : '#e2e8f0', padding: '1px 5px', borderRadius: '4px', border: `1px solid ${borderSubtle}` }}>âŒ˜K</kbd>
            </button>
            {/* Light / Dark Mode Toggle Selector */}
            <button
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              title={`Switch to ${isDark ? 'Light' : 'Dark'} mode`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#f1f5f9',
                border: `1px solid ${borderSubtle}`,
                color: textPrimary,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              {isDark ? (
                // Sun Icon (when currently dark, click for light)
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5"/>
                  <line x1="12" y1="1" x2="12" y2="3"/>
                  <line x1="12" y1="21" x2="12" y2="23"/>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                  <line x1="1" y1="12" x2="3" y2="12"/>
                  <line x1="21" y1="12" x2="23" y2="12"/>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                </svg>
              ) : (
                // Moon Icon (when currently light, click for dark)
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
              )}
            </button>

            {/* GitHub Repo Button */}
            <a
              href="https://github.com/JACK-AI7/AuraDrop"
              target="_blank"
              rel="noopener noreferrer"
              className="desktop-btn cursor-pointer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderRadius: '9999px',
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#f8fafc',
                border: `1px solid ${borderSubtle}`,
                color: textPrimary,
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

            {/* Get AuraDrop Download Button */}
            <a
              href="#downloads"
              className="desktop-btn cursor-pointer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '8px 20px',
                borderRadius: '9999px',
                backgroundColor: isDark ? '#ffffff' : '#0f172a',
                color: isDark ? '#000000' : '#ffffff',
                fontSize: '13px',
                fontWeight: 700,
                textDecoration: 'none',
                transition: 'all 0.2s ease',
              }}
            >
              Get AuraDrop
            </a>

            {/* Mobile Navigation Toggle Button */}
            <button
              className="mobile-menu-btn cursor-pointer"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              title="Menu"
              aria-label="Toggle navigation menu"
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#f1f5f9',
                border: `1px solid ${borderSubtle}`,
                display: 'none',
                alignItems: 'center',
                justifyContent: 'center',
                color: textPrimary,
                cursor: 'pointer',
              }}
            >
              {isMobileMenuOpen ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="4" y1="6" x2="20" y2="6"/>
                  <line x1="4" y1="12" x2="20" y2="12"/>
                  <line x1="4" y1="18" x2="20" y2="18"/>
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {isMobileMenuOpen && (
          <div
            className="mobile-nav-drawer"
            style={{
              backgroundColor: isDark ? '#09090b' : '#ffffff',
              borderTop: `1px solid ${borderSubtle}`,
              borderBottom: `1px solid ${borderSubtle}`,
              padding: '20px 24px 28px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            }}
          >
            <a href="#about" onClick={() => setIsMobileMenuOpen(false)} style={{ fontSize: '15px', fontWeight: 600, color: textPrimary, textDecoration: 'none', padding: '6px 0' }}>About</a>
            <a href="#features" onClick={() => setIsMobileMenuOpen(false)} style={{ fontSize: '15px', fontWeight: 600, color: textPrimary, textDecoration: 'none', padding: '6px 0' }}>Features</a>
            <a href="#protocol" onClick={() => setIsMobileMenuOpen(false)} style={{ fontSize: '15px', fontWeight: 600, color: textPrimary, textDecoration: 'none', padding: '6px 0' }}>Protocol</a>
            <a href="#architecture" onClick={() => setIsMobileMenuOpen(false)} style={{ fontSize: '15px', fontWeight: 600, color: textPrimary, textDecoration: 'none', padding: '6px 0' }}>Architecture</a>
            <a href="#downloads" onClick={() => setIsMobileMenuOpen(false)} style={{ fontSize: '15px', fontWeight: 600, color: textPrimary, textDecoration: 'none', padding: '6px 0' }}>Downloads</a>
            <a href="#support" onClick={() => setIsMobileMenuOpen(false)} style={{ fontSize: '15px', fontWeight: 600, color: textPrimary, textDecoration: 'none', padding: '6px 0' }}>Support</a>

            <div style={{ height: '1px', backgroundColor: borderSubtle, margin: '6px 0' }} />

            <div style={{ display: 'flex', gap: '10px', flexDirection: 'column' }}>
              <a
                href="/downloads/AuraDrop-Setup.exe"
                download="AuraDrop-Setup.exe"
                onClick={() => setIsMobileMenuOpen(false)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '12px 20px',
                  borderRadius: '12px',
                  backgroundColor: isDark ? '#ffffff' : '#0f172a',
                  color: isDark ? '#000000' : '#ffffff',
                  fontWeight: 700,
                  textDecoration: 'none',
                  fontSize: '14px',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/></svg>
                Download for Windows (Setup.exe)
              </a>

              <a
                href="/downloads/AuraDrop-Android.apk"
                download="AuraDrop-Android.apk"
                onClick={() => setIsMobileMenuOpen(false)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '12px 20px',
                  borderRadius: '12px',
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#f1f5f9',
                  border: `1px solid ${borderSubtle}`,
                  color: textPrimary,
                  fontWeight: 700,
                  textDecoration: 'none',
                  fontSize: '14px',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.551 0 .9993.4482.9993.9993.0001.5511-.4483.9997-.9993.9997m-11.046 0c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993 0 .5511-.4482.9997-.9993.9997m11.4045-6.02l1.9973-3.4592a.416.416 0 00-.1521-.5676.416.416 0 00-.5676.1521l-2.0223 3.503C15.5902 8.4116 13.8533 8.1 12 8.1s-3.5902.3116-5.1368.8497L4.8409 5.4467a.4161.4161 0 00-.5677-.1521.4157.4157 0 00-.1521.5676l1.9973 3.4592C2.6889 11.1867.3432 14.6589 0 18.761h24c-.3432-4.1021-2.6889-7.5743-6.1185-9.4396"/></svg>
                Download for Android (Direct APK)
              </a>
            </div>
          </div>
        )}
      </header>

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
           HERO SECTION (Bold Visible Logo Squircle, Perfectly Aligned Typography)
      â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      <section
        id="about"
        style={{
          position: 'relative',
          padding: windowWidth < 640 ? '48px 0 36px' : '80px 0 50px',
          textAlign: 'center',
          overflow: 'hidden',
        }}
      >
        <div className="section-container" style={{ maxWidth: '1220px', margin: '0 auto', padding: windowWidth < 640 ? '0 16px' : '0 28px' }}>
          <AnimatedContent distance={30} duration={0.8} threshold={0.05}>
            {/* Bold Contrast Logo Badge (Always 100% Boldly Visible) */}
            <div
              className="cursor-pointer"
              onClick={scrollToPreview}
              style={{
                width: '76px',
                height: '76px',
                borderRadius: '22px',
                backgroundColor: '#0f172a',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: isDark
                  ? '0 12px 36px rgba(0, 0, 0, 0.8), 0 0 35px rgba(255, 255, 255, 0.12)'
                  : '0 12px 30px rgba(15, 23, 42, 0.18)',
                marginBottom: '24px',
                transition: 'transform 0.2s ease',
              }}
            >
              <img
                src="/logo.png"
                alt="AuraDrop Logo"
                width="48"
                height="48"
                style={{ objectFit: 'contain', filter: 'brightness(3)' }}
              />
            </div>

            {/* Showcase Status Badge Row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '18px' }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 16px',
                  borderRadius: '9999px',
                  backgroundColor: isDark ? 'rgba(34, 197, 94, 0.12)' : 'rgba(34, 197, 94, 0.1)',
                  border: `1px solid ${isDark ? 'rgba(34, 197, 94, 0.28)' : 'rgba(34, 197, 94, 0.25)'}`,
                  fontSize: '12px',
                  fontWeight: 700,
                  color: isDark ? '#4ade80' : '#15803d',
                }}
              >
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#22c55e', display: 'inline-block', boxShadow: '0 0 8px #22c55e' }} />
                <span>AuraDrop Showcase Â· Production v2.0.1</span>
              </div>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 14px',
                  borderRadius: '9999px',
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#f8fafc',
                  border: `1px solid ${borderSubtle}`,
                  fontSize: '12px',
                  fontWeight: 600,
                  color: textMuted,
                }}
              >
                <span>Zero Cloud Relay Â· Direct LAN Speed</span>
              </span>
            </div>

            {/* Main Headline */}
            <h1
              className="balanced-headline"
              style={{
                fontSize: 'clamp(32px, 5.4vw, 68px)',
                fontWeight: 800,
                letterSpacing: '-0.04em',
                lineHeight: 1.1,
                color: textPrimary,
                marginBottom: '18px',
                maxWidth: '900px',
                marginLeft: 'auto',
                marginRight: 'auto',
              }}
            >
              Share anything with AuraDrop
            </h1>

            {/* Subtitle */}
            <p
              style={{
                fontSize: 'clamp(15px, 1.8vw, 20px)',
                color: textMuted,
                maxWidth: '660px',
                margin: '0 auto 36px',
                lineHeight: 1.6,
                fontWeight: 400,
                letterSpacing: '-0.01em',
              }}
            >
              Move faster, go further, and transfer at full LAN speed with zero cloud relay. Cross-platform peer-to-peer file sharing between Android, Windows, and Web.
            </p>

            {/* Hero Action Buttons - Clean Minimal Pill Buttons */}
            <div
              className="hero-btn-container"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '14px',
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
                href="/downloads/AuraDrop-Android.apk"
                download="AuraDrop-Android.apk"
                className="hero-ghost-btn cursor-pointer"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.551 0 .9993.4482.9993.9993.0001.5511-.4483.9997-.9993.9997m-11.046 0c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993 0 .5511-.4482.9997-.9993.9997m11.4045-6.02l1.9973-3.4592a.416.416 0 00-.1521-.5676.416.416 0 00-.5676.1521l-2.0223 3.503C15.5902 8.4116 13.8533 8.1 12 8.1s-3.5902.3116-5.1368.8497L4.8409 5.4467a.4161.4161 0 00-.5677-.1521.4157.4157 0 00-.1521.5676l1.9973 3.4592C2.6889 11.1867.3432 14.6589 0 18.761h24c-.3432-4.1021-2.6889-7.5743-6.1185-9.4396"/>
                </svg>
                <span>Download Android APK</span>
              </a>

              <button
                onClick={scrollToPreview}
                className="hero-subtle-btn cursor-pointer"
              >
                <span>Live Interactive Demo â†“</span>
              </button>
            </div>
          </AnimatedContent>

          {/* Supported Platforms Strip */}
          <div style={{ marginBottom: '50px' }}>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                color: textMuted,
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
                gap: windowWidth < 640 ? '14px 20px' : '36px',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: textPrimary, fontSize: '14px', fontWeight: 600 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/></svg>
                <span>Windows 11</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: textPrimary, fontSize: '14px', fontWeight: 600 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.551 0 .9993.4482.9993.9993.0001.5511-.4483.9997-.9993.9997m-11.046 0c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993 0 .5511-.4482.9997-.9993.9997m11.4045-6.02l1.9973-3.4592a.416.416 0 00-.1521-.5676.416.416 0 00-.5676.1521l-2.0223 3.503C15.5902 8.4116 13.8533 8.1 12 8.1s-3.5902.3116-5.1368.8497L4.8409 5.4467a.4161.4161 0 00-.5677-.1521.4157.4157 0 00-.1521.5676l1.9973 3.4592C2.6889 11.1867.3432 14.6589 0 18.761h24c-.3432-4.1021-2.6889-7.5743-6.1185-9.4396"/></svg>
                <span>Android 15</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: textPrimary, fontSize: '14px', fontWeight: 600 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.61-.75 1.04-1.8 1.01-2.87-.96.04-2.06.66-2.7 1.45-.56.66-.99 1.72-.94 2.76 1.08.08 2.02-.59 2.63-1.34z"/></svg>
                <span>Apple macOS / iOS</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: textPrimary, fontSize: '14px', fontWeight: 600 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                <span>Web P2P</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: textPrimary, fontSize: '14px', fontWeight: 600 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12.003 2c-2.22 0-3.99 1.77-3.99 3.99 0 .42.06.82.18 1.2-1.39.46-2.4 1.76-2.4 3.31 0 1.34.76 2.5 1.86 3.07-.09.34-.15.7-.15 1.08 0 2.65 2.01 4.8 4.5 4.8s4.5-2.15 4.5-4.8c0-.38-.06-.74-.15-1.08 1.1-.57 1.86-1.73 1.86-3.07 0-1.55-1.01-2.85-2.4-3.31.12-.38.18-.78.18-1.2 0-2.22-1.77-3.99-3.99-3.99z"/></svg>
                <span>Linux</span>
              </div>
            </div>
          </div>

          {/* â”€â”€ Desktop Live App Showcase (Static Viewing Card, Not Movable) â”€â”€ */}
          <div
            ref={windowPreviewRef}
            style={{
              maxWidth: '960px',
              margin: '0 auto 60px',
              position: 'relative',
              textAlign: 'left',
              backgroundColor: '#09090b',
              border: '1px solid #1e293b',
              borderRadius: '18px',
              overflow: 'hidden',
              boxShadow: isDark
                ? '0 25px 60px -15px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.08)'
                : '0 25px 60px -15px rgba(15, 23, 42, 0.18), 0 0 0 1px rgba(0, 0, 0, 0.08)',
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                <div style={{ width: '11px', height: '11px', borderRadius: '50%', backgroundColor: '#FF5F56' }} />
                <div style={{ width: '11px', height: '11px', borderRadius: '50%', backgroundColor: '#FFBD2E' }} />
                <div style={{ width: '11px', height: '11px', borderRadius: '50%', backgroundColor: '#27C93F' }} />
              </div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255, 255, 255, 0.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: windowWidth < 640 ? '160px' : 'none', textAlign: 'center' }}>
                {windowWidth < 640 ? 'AuraDrop Demo' : 'AuraDrop Desktop Â· Dynamic Island & Proximity Radar Demo'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'rgba(255, 255, 255, 0.45)', flexShrink: 0 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
              </div>
            </div>

            {/* Window Content */}
            <div
              style={{
                padding: windowWidth < 640 ? '24px 14px 30px' : '38px 28px 44px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                background: 'radial-gradient(circle at 50% 25%, rgba(255, 255, 255, 0.04) 0%, transparent 60%), #09090b',
              }}
            >
              {/* Floating Dynamic Island Pill */}
              <div
                style={{
                  backgroundColor: 'rgba(24, 24, 32, 0.95)',
                  border: activeTransfer ? '1px solid rgba(52, 199, 89, 0.45)' : '1px solid rgba(255, 255, 255, 0.14)',
                  borderRadius: '9999px',
                  padding: windowWidth < 480 ? '7px 14px' : '9px 20px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '10px',
                  boxShadow: activeTransfer ? '0 12px 35px rgba(52, 199, 89, 0.25)' : '0 12px 35px rgba(0, 0, 0, 0.75)',
                  marginBottom: '26px',
                  maxWidth: '100%',
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                  transition: 'all 0.3s ease',
                }}
              >
                <div
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: activeTransfer ? '#34C759' : selectedPeer ? '#38BDF8' : '#22c55e',
                    animation: 'pulseDot 1.8s ease-in-out infinite',
                    boxShadow: activeTransfer ? '0 0 10px #34C759' : 'none',
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: windowWidth < 480 ? '11px' : '13px', fontWeight: 600, color: '#FFFFFF', textAlign: 'center' }}>
                  {activeTransfer
                    ? `${activeTransfer.isIncoming ? 'Receiving from' : 'Sending to'} ${activeTransfer.peerName}: ${activeTransfer.fileName}`
                    : selectedPeer
                    ? `${selectedPeer.name} Connected · ${selectedPeer.transport || 'Direct P2P'}`
                    : peers.length > 0
                    ? `${peers.length} Nearby Demo Devices · Native High-Speed P2P`
                    : 'AuraDrop Native High-Speed Engine · Windows & Android'}
                </span>
                <span
                  style={{
                    fontSize: '11px',
                    color: '#94a3b8',
                    borderLeft: '1px solid rgba(255, 255, 255, 0.18)',
                    paddingLeft: '10px',
                  }}
                >
                  {activeTransfer
                    ? `${((activeTransfer.speedBytesPerSec || 0) / (1024 * 1024)).toFixed(1)} MB/s`
                    : selectedPeer
                    ? 'Ready to transfer'
                    : 'P2PFS/1 Engine'}
                </span>
              </div>

              {/* 3D Interactive Hero Globe */}
              <div style={{ marginBottom: '26px' }}>
                <HeroGlobe
                  peers={peers}
                  selectedPeerId={selectedPeer?.id || (peers.length > 0 ? peers[0].id : null)}
                  onSelectPeer={(p) => setSelectedPeer(p)}
                  isTransferring={Boolean(activeTransfer && (activeTransfer.state === 'TRANSFERRING' || activeTransfer.state === 'VERIFYING'))}
                  transferSpeed={activeTransfer ? `${((activeTransfer.speedBytesPerSec || 0) / (1024 * 1024)).toFixed(1)} MB/s` : null}
                  size={windowWidth < 480 ? 190 : 240}
                />
              </div>

              {/* Native Apps Quick Download & Ecosystem Row */}
              <div
                style={{
                  width: '100%',
                  maxWidth: '720px',
                  marginBottom: '22px',
                  backgroundColor: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '16px',
                  padding: '14px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '10px',
                      background: 'linear-gradient(135deg, #0078D4, #10B981)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '18px',
                      flexShrink: 0,
                    }}
                  >
                    ⚡
                  </div>
                  <div>
                    <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#FFFFFF' }}>
                      Native Direct Sockets (100+ MB/s)
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                      Zero cloud upload · Built natively for Windows & Android
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <a
                    href="/downloads/AuraDrop-Setup.exe"
                    download="AuraDrop-Setup.exe"
                    style={{
                      background: '#FFFFFF',
                      color: '#000000',
                      borderRadius: '9999px',
                      padding: '6px 14px',
                      fontSize: '12px',
                      fontWeight: 800,
                      textDecoration: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    <span>🪟 Windows</span>
                  </a>
                  <a
                    href="/downloads/AuraDrop-Android.apk"
                    download="AuraDrop-Android.apk"
                    style={{
                      background: 'rgba(52, 199, 89, 0.18)',
                      border: '1px solid rgba(52, 199, 89, 0.5)',
                      color: '#34C759',
                      borderRadius: '9999px',
                      padding: '6px 14px',
                      fontSize: '12px',
                      fontWeight: 800,
                      textDecoration: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    <span>📱 Android</span>
                  </a>
                </div>
              </div>

              {/* Hidden file input for native file selection */}
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={(e) => handleSendFiles(e.target.files)}
              />

              {/* Real AirDrop Interactive File Dropzone & Transfer Box */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  handleSendFiles(e.dataTransfer.files);
                }}
                style={{
                  width: '100%',
                  maxWidth: '720px',
                  backgroundColor: isDragging ? 'rgba(52, 199, 89, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                  border: isDragging ? '1.5px dashed #34C759' : '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '16px',
                  padding: windowWidth < 480 ? '16px 18px' : '20px 24px',
                  transition: 'all 0.2s ease',
                }}
              >
                {activeTransfer ? (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF' }}>
                        {activeTransfer.isIncoming ? '📥 Receiving: ' : '📤 Sending: '}
                        {activeTransfer.fileName}
                      </span>
                      <span style={{ fontSize: '12px', color: '#34C759', fontWeight: 600 }}>
                        {activeTransfer.fileSize > 0
                          ? `${Math.min(100, Math.round((activeTransfer.transferredBytes / activeTransfer.fileSize) * 100))}%`
                          : '0%'}
                        {' · '}
                        {activeTransfer.state === 'VERIFYING'
                          ? 'Verifying SHA-256...'
                          : activeTransfer.state === 'COMPLETED'
                          ? 'Completed ✓'
                          : activeTransfer.etaSeconds > 0
                          ? `${activeTransfer.etaSeconds}s remaining`
                          : 'Streaming...'}
                      </span>
                    </div>

                    {/* Live Progress Bar */}
                    <div style={{ height: '7px', backgroundColor: 'rgba(255, 255, 255, 0.08)', borderRadius: '9999px', overflow: 'hidden', margin: '14px 0 12px' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${activeTransfer.fileSize > 0 ? Math.min(100, Math.round((activeTransfer.transferredBytes / activeTransfer.fileSize) * 100)) : 0}%`,
                          background: 'linear-gradient(90deg, #34C759, #30D158)',
                          borderRadius: '9999px',
                          transition: 'width 0.15s ease',
                          boxShadow: '0 0 10px rgba(52, 199, 89, 0.5)',
                        }}
                      />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', fontSize: '11.5px', color: '#94a3b8' }}>
                      <span>
                        {((activeTransfer.transferredBytes || 0) / (1024 * 1024)).toFixed(1)} MB of {((activeTransfer.fileSize || 0) / (1024 * 1024)).toFixed(1)} MB transferred at {((activeTransfer.speedBytesPerSec || 0) / (1024 * 1024)).toFixed(1)} MB/s
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ color: activeTransfer.state === 'COMPLETED' ? '#34C759' : '#94a3b8' }}>
                          SHA-256 {activeTransfer.state === 'COMPLETED' ? 'Verified ✓' : 'Stream Hashing'}
                        </span>
                        <button
                          onClick={handleDeclineDemo}
                          style={{
                            background: 'rgba(239, 68, 68, 0.15)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            borderRadius: '6px',
                            padding: '2px 8px',
                            color: '#ef4444',
                            fontSize: '11px',
                            cursor: 'pointer',
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <div>
                      <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#FFFFFF' }}>
                        {selectedPeer ? `Ready to AirDrop to ${selectedPeer.name}` : 'AirDrop File Streamer'}
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '3px' }}>
                        {selectedPeer
                          ? 'Drag & drop any file here or click Browse to stream directly at full LAN speed'
                          : 'Select a nearby device above or drop files to initiate direct P2P transfer'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => runShowcaseDemo()}
                        style={{
                          background: 'linear-gradient(135deg, #34C759, #30D158)',
                          color: '#000000',
                          border: 'none',
                          borderRadius: '9999px',
                          padding: '8px 16px',
                          fontSize: '12px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          boxShadow: '0 4px 15px rgba(52, 199, 89, 0.3)',
                        }}
                      >
                        ▶ Run AirDrop Demo
                      </button>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                          background: 'rgba(255, 255, 255, 0.1)',
                          color: '#FFFFFF',
                          border: '1px solid rgba(255, 255, 255, 0.2)',
                          borderRadius: '9999px',
                          padding: '9px 18px',
                          fontSize: '12.5px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          boxShadow: '0 4px 12px rgba(255, 255, 255, 0.2)',
                          transition: 'all 0.2s ease',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#E5E5EA')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = '#FFFFFF')}
                      >
                        ⚡ Send File via AirDrop
                      </button>
                      <button
                        onClick={() => setIsDownloadsOpen(true)}
                        style={{
                          background: 'rgba(255, 255, 255, 0.08)',
                          color: '#FFFFFF',
                          border: '1px solid rgba(255, 255, 255, 0.16)',
                          borderRadius: '9999px',
                          padding: '9px 14px',
                          fontSize: '12.5px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                        }}
                      >
                        📥 Get Native Apps
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
           FEATURES SECTION
      â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      <AnimatedContent distance={40} duration={0.8} threshold={0.08}>
        <section id="features" style={{ padding: windowWidth < 640 ? '48px 0' : '96px 0', borderTop: `1px solid ${borderSubtle}` }}>
          <div className="section-container" style={{ maxWidth: '1220px', margin: '0 auto', padding: windowWidth < 640 ? '0 16px' : '0 28px' }}>
            <div style={{ textAlign: 'center', maxWidth: '720px', margin: '0 auto 40px auto' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: textMuted, marginBottom: '14px' }}>
                Engine Capabilities
              </div>
              <h2 style={{ fontSize: 'clamp(28px, 4.2vw, 48px)', fontWeight: 800, letterSpacing: '-0.03em', color: textPrimary, marginBottom: '16px', lineHeight: 1.15 }}>
                Engineered for pure local velocity.
              </h2>
              <p style={{ fontSize: 'clamp(15px, 1.6vw, 17px)', color: textMuted, lineHeight: 1.6 }}>
                AuraDrop bypasses public cloud intermediaries and streams data directly over high-speed local network sockets, Wi-Fi 6/7, and WebRTC data channels.
              </p>
            </div>

            <div className="features-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '20px' }}>
              <TiltCard className="feature-card" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: windowWidth < 640 ? '22px 18px' : '28px 24px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: textMuted, marginBottom: '16px', letterSpacing: '0.08em' }}>01 / SPEED</div>
                <h3 style={{ fontSize: '19px', fontWeight: 700, color: textPrimary, marginBottom: '10px', minHeight: windowWidth < 640 ? 'auto' : '52px', display: 'flex', alignItems: 'flex-start' }}>100+ MB/s LAN Streaming</h3>
                <p style={{ fontSize: '14px', color: textMuted, lineHeight: 1.65, margin: 0 }}>Direct TCP and HTTP chunked streams transfer raw bytes at the physical throughput limit of your local router without uploading to any external server.</p>
              </TiltCard>
              <TiltCard className="feature-card" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: windowWidth < 640 ? '22px 18px' : '28px 24px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: textMuted, marginBottom: '16px', letterSpacing: '0.08em' }}>02 / ZERO-CONFIG</div>
                <h3 style={{ fontSize: '19px', fontWeight: 700, color: textPrimary, marginBottom: '10px', minHeight: windowWidth < 640 ? 'auto' : '52px', display: 'flex', alignItems: 'flex-start' }}>Seamless Auto-Discovery</h3>
                <p style={{ fontSize: '14px', color: textMuted, lineHeight: 1.65, margin: 0 }}>UDP Multicast announcements detect phones and PCs on the same Wi-Fi instantly. No Bluetooth pairing pins, no login credentials, and no setup friction.</p>
              </TiltCard>
              <TiltCard className="feature-card" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: windowWidth < 640 ? '22px 18px' : '28px 24px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: textMuted, marginBottom: '16px', letterSpacing: '0.08em' }}>03 / SECURITY</div>
                <h3 style={{ fontSize: '19px', fontWeight: 700, color: textPrimary, marginBottom: '10px', minHeight: windowWidth < 640 ? 'auto' : '52px', display: 'flex', alignItems: 'flex-start' }}>Fail-Closed Authentication</h3>
                <p style={{ fontSize: '14px', color: textMuted, lineHeight: 1.65, margin: 0 }}>Single-use cryptographic upload tokens expire in 60 seconds and invalidate immediately upon transfer initiation. Spoofed device IDs receive immediate 403s.</p>
              </TiltCard>
              <TiltCard className="feature-card" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: windowWidth < 640 ? '22px 18px' : '28px 24px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: textMuted, marginBottom: '16px', letterSpacing: '0.08em' }}>04 / INTEGRITY</div>
                <h3 style={{ fontSize: '19px', fontWeight: 700, color: textPrimary, marginBottom: '10px', minHeight: windowWidth < 640 ? 'auto' : '52px', display: 'flex', alignItems: 'flex-start' }}>SHA-256 Byte Verification</h3>
                <p style={{ fontSize: '14px', color: textMuted, lineHeight: 1.65, margin: 0 }}>Receivers calculate streaming SHA-256 checksums incrementally. Files with mismatched hashes or truncated bytes are automatically rejected.</p>
              </TiltCard>
              <TiltCard className="feature-card" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: windowWidth < 640 ? '22px 18px' : '28px 24px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: textMuted, marginBottom: '16px', letterSpacing: '0.08em' }}>05 / PRIVACY</div>
                <h3 style={{ fontSize: '19px', fontWeight: 700, color: textPrimary, marginBottom: '10px', minHeight: windowWidth < 640 ? 'auto' : '52px', display: 'flex', alignItems: 'flex-start' }}>Zero Cloud Staging</h3>
                <p style={{ fontSize: '14px', color: textMuted, lineHeight: 1.65, margin: 0 }}>Files stream device-to-device directly over LAN sockets. Signaling relays negotiate WebRTC handshakes only and never touch raw file bytes.</p>
              </TiltCard>
              <TiltCard className="feature-card" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: windowWidth < 640 ? '22px 18px' : '28px 24px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: textMuted, marginBottom: '16px', letterSpacing: '0.08em' }}>06 / MESSAGING</div>
                <h3 style={{ fontSize: '19px', fontWeight: 700, color: textPrimary, marginBottom: '10px', minHeight: windowWidth < 640 ? 'auto' : '52px', display: 'flex', alignItems: 'flex-start' }}>Encrypted P2P Chat</h3>
                <p style={{ fontSize: '14px', color: textMuted, lineHeight: 1.65, margin: 0 }}>Send instant messages, code snippets, and clipboard links across devices securely with zero server retention or third-party storage.</p>
              </TiltCard>
            </div>
          </div>
        </section>
      </AnimatedContent>

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
           PROTOCOL SECTION
      â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      <AnimatedContent distance={40} duration={0.8} threshold={0.08}>
        <section id="protocol" style={{ padding: windowWidth < 640 ? '48px 0' : '96px 0', borderTop: `1px solid ${borderSubtle}` }}>
          <div className="section-container" style={{ maxWidth: '1220px', margin: '0 auto', padding: windowWidth < 640 ? '0 16px' : '0 28px' }}>
            <div style={{ textAlign: 'center', maxWidth: '720px', margin: '0 auto 40px auto' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: textMuted, marginBottom: '14px' }}>
                Wire Protocol Flow
              </div>
              <h2 style={{ fontSize: 'clamp(28px, 4.2vw, 48px)', fontWeight: 800, letterSpacing: '-0.03em', color: textPrimary, marginBottom: '16px', lineHeight: 1.15 }}>
                How AuraDrop transfers work.
              </h2>
              <p style={{ fontSize: 'clamp(15px, 1.6vw, 17px)', color: textMuted, lineHeight: 1.6 }}>
                Four deterministic stages guarantee private, zero-latency transfers across any combination of operating systems.
              </p>
            </div>

            <div className="protocol-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '16px' }}>
              <TiltCard style={{ backgroundColor: cardBg, border: `1px solid ${borderSubtle}`, borderRadius: '16px', padding: windowWidth < 640 ? '20px 18px' : '28px 24px', boxShadow: isDark ? '0 4px 16px rgba(0,0,0,0.4)' : '0 2px 8px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#0f172a', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '13px', marginBottom: '16px' }}>1</div>
                <h4 style={{ fontSize: '17px', fontWeight: 700, color: textPrimary, marginBottom: '8px', minHeight: windowWidth < 640 ? 'auto' : '26px' }}>LAN Discovery</h4>
                <p style={{ fontSize: '13px', color: textMuted, lineHeight: 1.6, margin: 0 }}>Devices announce presence via UDP multicast on port 53317. Peer IP addresses and capabilities are resolved instantly.</p>
              </TiltCard>
              <TiltCard style={{ backgroundColor: cardBg, border: `1px solid ${borderSubtle}`, borderRadius: '16px', padding: windowWidth < 640 ? '20px 18px' : '28px 24px', boxShadow: isDark ? '0 4px 16px rgba(0,0,0,0.4)' : '0 2px 8px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#0f172a', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '13px', marginBottom: '16px' }}>2</div>
                <h4 style={{ fontSize: '17px', fontWeight: 700, color: textPrimary, marginBottom: '8px', minHeight: windowWidth < 640 ? 'auto' : '26px' }}>Token Handshake</h4>
                <p style={{ fontSize: '13px', color: textMuted, lineHeight: 1.6, margin: 0 }}>Sender requests a single-use authorization token. The receiver verifies sender identity and derives an ephemeral 60s key.</p>
              </TiltCard>
              <TiltCard style={{ backgroundColor: cardBg, border: `1px solid ${borderSubtle}`, borderRadius: '16px', padding: windowWidth < 640 ? '20px 18px' : '28px 24px', boxShadow: isDark ? '0 4px 16px rgba(0,0,0,0.4)' : '0 2px 8px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#0f172a', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '13px', marginBottom: '16px' }}>3</div>
                <h4 style={{ fontSize: '17px', fontWeight: 700, color: textPrimary, marginBottom: '8px', minHeight: windowWidth < 640 ? 'auto' : '26px' }}>Direct Streaming</h4>
                <p style={{ fontSize: '13px', color: textMuted, lineHeight: 1.6, margin: 0 }}>Bytes stream directly over high-throughput local sockets or WebRTC data channels, utilizing 100% of available LAN bandwidth.</p>
              </TiltCard>
              <TiltCard style={{ backgroundColor: cardBg, border: `1px solid ${borderSubtle}`, borderRadius: '16px', padding: windowWidth < 640 ? '20px 18px' : '28px 24px', boxShadow: isDark ? '0 4px 16px rgba(0,0,0,0.4)' : '0 2px 8px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#0f172a', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '13px', marginBottom: '16px' }}>4</div>
                <h4 style={{ fontSize: '17px', fontWeight: 700, color: textPrimary, marginBottom: '8px', minHeight: windowWidth < 640 ? 'auto' : '26px' }}>Checksum Audit</h4>
                <p style={{ fontSize: '13px', color: textMuted, lineHeight: 1.6, margin: 0 }}>The receiver verifies exact byte length and SHA-256 hash before flushing the file to disk or the Android MediaStore gallery.</p>
              </TiltCard>
            </div>
          </div>
        </section>
      </AnimatedContent>

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
           APP ARCHITECTURE SECTION
      â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      <AnimatedContent distance={40} duration={0.8} threshold={0.08}>
        <section id="architecture" style={{ padding: windowWidth < 640 ? '48px 0' : '96px 0', borderTop: `1px solid ${borderSubtle}` }}>
          <div className="section-container" style={{ maxWidth: '1220px', margin: '0 auto', padding: windowWidth < 640 ? '0 16px' : '0 28px' }}>
            <div style={{ textAlign: 'center', maxWidth: '720px', margin: windowWidth < 640 ? '0 auto 36px auto' : '0 auto 56px auto' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: textMuted, marginBottom: '14px' }}>
                System Architecture
              </div>
              <h2 style={{ fontSize: 'clamp(28px, 4.2vw, 48px)', fontWeight: 800, letterSpacing: '-0.03em', color: textPrimary, marginBottom: '16px', lineHeight: 1.15 }}>
                Built for native platform excellence.
              </h2>
              <p style={{ fontSize: 'clamp(15px, 1.6vw, 17px)', color: textMuted, lineHeight: 1.6 }}>
                AuraDrop is engineered with specialized native runtimes for Windows, Android, and Web, sharing a unified cryptographic protocol.
              </p>
            </div>

            <div className="architecture-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: '20px' }}>
              <TiltCard style={{ backgroundColor: cardBg, border: `1px solid ${borderSubtle}`, borderRadius: '16px', padding: windowWidth < 640 ? '20px 18px' : '28px', boxShadow: isDark ? '0 4px 16px rgba(0,0,0,0.4)' : '0 2px 8px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ width: '42px', height: '42px', borderRadius: '10px', backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px', border: `1px solid ${borderSubtle}` }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={textPrimary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                <h4 style={{ fontSize: '16px', fontWeight: 700, color: textPrimary, marginBottom: '8px', minHeight: windowWidth < 640 ? 'auto' : '44px', display: 'flex', alignItems: 'center' }}>Tauri &amp; Rust Desktop Core</h4>
                <p style={{ fontSize: '13px', color: textMuted, lineHeight: 1.6, margin: 0, minHeight: windowWidth < 640 ? 'auto' : '66px' }}>Ultra-lean 5.96 MB Windows installer with negligible RAM usage, native Windows Dynamic Island overlay, and local socket server.</p>
              </TiltCard>

              <TiltCard style={{ backgroundColor: cardBg, border: `1px solid ${borderSubtle}`, borderRadius: '16px', padding: windowWidth < 640 ? '20px 18px' : '28px', boxShadow: isDark ? '0 4px 16px rgba(0,0,0,0.4)' : '0 2px 8px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ width: '42px', height: '42px', borderRadius: '10px', backgroundColor: isDark ? 'rgba(22, 163, 74, 0.15)' : '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px', border: `1px solid ${borderSubtle}` }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
                    <line x1="12" y1="18" x2="12.01" y2="18"/>
                  </svg>
                </div>
                <h4 style={{ fontSize: '16px', fontWeight: 700, color: textPrimary, marginBottom: '8px', minHeight: windowWidth < 640 ? 'auto' : '44px', display: 'flex', alignItems: 'center' }}>Flutter &amp; Kotlin Android Engine</h4>
                <p style={{ fontSize: '13px', color: textMuted, lineHeight: 1.6, margin: 0, minHeight: windowWidth < 640 ? 'auto' : '66px' }}>Optimized foreground service, dynamic notification pill, direct port 8080 HTTP server, and automatic gallery integration.</p>
              </TiltCard>

              <TiltCard style={{ backgroundColor: cardBg, border: `1px solid ${borderSubtle}`, borderRadius: '16px', padding: windowWidth < 640 ? '20px 18px' : '28px', boxShadow: isDark ? '0 4px 16px rgba(0,0,0,0.4)' : '0 2px 8px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ width: '42px', height: '42px', borderRadius: '10px', backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px', border: `1px solid ${borderSubtle}` }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={textPrimary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="2" y1="12" x2="22" y2="12"/>
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                  </svg>
                </div>
                <h4 style={{ fontSize: '16px', fontWeight: 700, color: textPrimary, marginBottom: '8px', minHeight: windowWidth < 640 ? 'auto' : '44px', display: 'flex', alignItems: 'center' }}>Universal Web P2P Engine</h4>
                <p style={{ fontSize: '13px', color: textMuted, lineHeight: 1.6, margin: 0, minHeight: windowWidth < 640 ? 'auto' : '66px' }}>Peer-to-peer browser connectivity using WebRTC DataChannels with STUN/TURN traversal for cross-network file exchanges.</p>
              </TiltCard>

              <TiltCard style={{ backgroundColor: cardBg, border: `1px solid ${borderSubtle}`, borderRadius: '16px', padding: windowWidth < 640 ? '20px 18px' : '28px', boxShadow: isDark ? '0 4px 16px rgba(0,0,0,0.4)' : '0 2px 8px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ width: '42px', height: '42px', borderRadius: '10px', backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px', border: `1px solid ${borderSubtle}` }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={textPrimary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    <polyline points="9 12 11 14 15 10"/>
                  </svg>
                </div>
                <h4 style={{ fontSize: '16px', fontWeight: 700, color: textPrimary, marginBottom: '8px', minHeight: windowWidth < 640 ? 'auto' : '44px', display: 'flex', alignItems: 'center' }}>17-Point Regression Suite</h4>
                <p style={{ fontSize: '13px', color: textMuted, lineHeight: 1.6, margin: 0, minHeight: windowWidth < 640 ? 'auto' : '66px' }}>Automated tests continuously auditing path traversal sanitization, device identity binding, and SHA-256 byte integrity.</p>
              </TiltCard>
            </div>
          </div>
        </section>
      </AnimatedContent>

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
           PRODUCTION RELEASES (With Dynamic Proximity BorderGlow, Perfectly Aligned)
      â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      <AnimatedContent distance={40} duration={0.8} threshold={0.08}>
        <section id="downloads" style={{ padding: windowWidth < 640 ? '48px 0' : '96px 0', borderTop: `1px solid ${borderSubtle}` }}>
          <div className="section-container" style={{ maxWidth: '1220px', margin: '0 auto', padding: windowWidth < 640 ? '0 16px' : '0 28px' }}>
            <div style={{ textAlign: 'center', maxWidth: '720px', margin: windowWidth < 640 ? '0 auto 36px auto' : '0 auto 56px auto' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: textMuted, marginBottom: '14px' }}>
                Production Releases
              </div>
              <h2 style={{ fontSize: 'clamp(28px, 4.2vw, 48px)', fontWeight: 800, letterSpacing: '-0.03em', color: textPrimary, marginBottom: '16px', lineHeight: 1.15 }}>
                Download AuraDrop v2.0.1
              </h2>
              <p style={{ fontSize: 'clamp(15px, 1.6vw, 17px)', color: textMuted, lineHeight: 1.6 }}>
                Official release binaries. Code signed for Windows, standalone APK for Android, and verified SHA-256 integrity checksums.
              </p>
            </div>

            <div className="releases-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: windowWidth < 640 ? '18px' : '28px' }}>
              {/* Windows Desktop Card with Dynamic Proximity BorderGlow */}
              <BorderGlow
                borderRadius={22}
                backgroundColor={cardBg}
                glowColor="240 80 80"
                colors={isDark ? ['#ffffff', '#cbd5e1', '#94a3b8'] : ['#0f172a', '#475569', '#64748b']}
                edgeSensitivity={30}
                glowRadius={40}
                glowIntensity={1.0}
              >
                <div
                  className="release-card-inner"
                  style={{
                    padding: windowWidth < 640 ? '22px 18px' : '36px 32px',
                    height: '100%',
                    minHeight: windowWidth < 640 ? 'auto' : '490px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    textAlign: 'left',
                  }}
                >
                  <div>
                    <div className="release-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', minHeight: windowWidth < 640 ? 'auto' : '62px', marginBottom: '18px' }}>
                      <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                        <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: isDark ? 'rgba(255,255,255,0.06)' : '#f8fafc', border: `1px solid ${borderSubtle}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: textPrimary }}>
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/></svg>
                        </div>
                        <div>
                          <div style={{ fontSize: '21px', fontWeight: 800, color: textPrimary, letterSpacing: '-0.02em' }}>Windows Desktop</div>
                          <div style={{ fontSize: '13px', color: textMuted, marginTop: '2px' }}>v2.0.1 Â· Windows 10 &amp; 11 (64-bit)</div>
                        </div>
                      </div>
                      <span style={{ fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '9999px', background: isDark ? 'rgba(22, 163, 74, 0.2)' : '#dcfce7', color: '#16a34a', border: '1px solid #bbf7d0' }}>
                        Stable
                      </span>
                    </div>

                    <p className="release-card-desc" style={{ fontSize: '14px', color: textMuted, lineHeight: 1.65, minHeight: windowWidth < 640 ? 'auto' : '72px', marginBottom: '20px' }}>
                      Tauri v2 native desktop application featuring native Windows Dynamic Island, local TCP chunk streaming, and zero-config peer discovery.
                    </p>

                    {/* Technical Specs Strip */}
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', minHeight: windowWidth < 640 ? 'auto' : '30px', marginBottom: '24px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: textMuted, background: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9', padding: '4px 10px', borderRadius: '6px' }}>x64 Arch</span>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: textMuted, background: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9', padding: '4px 10px', borderRadius: '6px' }}>Rust Engine</span>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: textMuted, background: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9', padding: '4px 10px', borderRadius: '6px' }}>SHA-256 Verified</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: 'auto' }}>
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
                        backgroundColor: isDark ? '#ffffff' : '#0f172a',
                        color: isDark ? '#000000' : '#ffffff',
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
                    <div className="release-card-buttons" style={{ display: 'flex', gap: '10px', flexDirection: windowWidth < 480 ? 'column' : 'row' }}>
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
                          backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#f8fafc',
                          border: `1px solid ${borderSubtle}`,
                          color: textPrimary,
                          textDecoration: 'none',
                          fontSize: '13px',
                          fontWeight: 600,
                        }}
                      >
                        <span>MSI Package</span>
                        <span style={{ color: textMuted, fontSize: '12px' }}>9.25 MB</span>
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
                          backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#f8fafc',
                          border: `1px solid ${borderSubtle}`,
                          color: textPrimary,
                          textDecoration: 'none',
                          fontSize: '13px',
                          fontWeight: 600,
                        }}
                      >
                        <span>Portable ZIP</span>
                        <span style={{ color: textMuted, fontSize: '12px' }}>8.42 MB</span>
                      </a>
                    </div>
                  </div>
                </div>
              </BorderGlow>

              {/* Android Mobile Card with Dynamic Proximity BorderGlow */}
              <BorderGlow
                borderRadius={22}
                backgroundColor={cardBg}
                glowColor="140 80 80"
                colors={['#16a34a', '#4ade80', '#22c55e']}
                edgeSensitivity={30}
                glowRadius={40}
                glowIntensity={1.0}
              >
                <div
                  className="release-card-inner"
                  style={{
                    padding: windowWidth < 640 ? '22px 18px' : '36px 32px',
                    height: '100%',
                    minHeight: windowWidth < 640 ? 'auto' : '490px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    textAlign: 'left',
                  }}
                >
                  <div>
                    <div className="release-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', minHeight: windowWidth < 640 ? 'auto' : '62px', marginBottom: '18px' }}>
                      <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                        <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: isDark ? 'rgba(255,255,255,0.06)' : '#f8fafc', border: `1px solid ${borderSubtle}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a' }}>
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.551 0 .9993.4482.9993.9993.0001.5511-.4483.9997-.9993.9997m-11.046 0c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993 0 .5511-.4482.9997-.9993.9997m11.4045-6.02l1.9973-3.4592a.416.416 0 00-.1521-.5676.416.416 0 00-.5676.1521l-2.0223 3.503C15.5902 8.4116 13.8533 8.1 12 8.1s-3.5902.3116-5.1368.8497L4.8409 5.4467a.4161.4161 0 00-.5677-.1521.4157.4157 0 00-.1521.5676l1.9973 3.4592C2.6889 11.1867.3432 14.6589 0 18.761h24c-.3432-4.1021-2.6889-7.5743-6.1185-9.4396"/></svg>
                        </div>
                        <div>
                          <div style={{ fontSize: '21px', fontWeight: 800, color: textPrimary, letterSpacing: '-0.02em' }}>Android Mobile</div>
                          <div style={{ fontSize: '13px', color: textMuted, marginTop: '2px' }}>v2.0.1 Â· Android 8.0+ (ARM64)</div>
                        </div>
                      </div>
                      <span style={{ fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '9999px', background: isDark ? 'rgba(22, 163, 74, 0.2)' : '#dcfce7', color: '#16a34a', border: '1px solid #bbf7d0' }}>
                        Stable
                      </span>
                    </div>

                    <p className="release-card-desc" style={{ fontSize: '14px', color: textMuted, lineHeight: 1.65, minHeight: windowWidth < 640 ? 'auto' : '72px', marginBottom: '20px' }}>
                      Flutter &amp; Kotlin foreground service app with real-time notification dynamic island, MediaStore gallery exports, and embedded socket server.
                    </p>

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', minHeight: windowWidth < 640 ? 'auto' : '30px', marginBottom: '24px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: textMuted, background: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9', padding: '4px 10px', borderRadius: '6px' }}>ARM64-v8a</span>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: textMuted, background: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9', padding: '4px 10px', borderRadius: '6px' }}>Scoped Storage</span>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: textMuted, background: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9', padding: '4px 10px', borderRadius: '6px' }}>Zero Battery Drain</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: 'auto' }}>
                    <a
                      href="/downloads/AuraDrop-Android.apk"
                      download="AuraDrop-Android.apk"
                      onClick={() => analytics.track('download_apk')}
                      className="cursor-pointer"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '14px 22px',
                        borderRadius: '12px',
                        backgroundColor: isDark ? '#ffffff' : '#0f172a',
                        color: isDark ? '#000000' : '#ffffff',
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
                      <span style={{ opacity: 0.85, fontSize: '13px' }}>49.5 MB</span>
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
                        backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#f8fafc',
                        border: `1px solid ${borderSubtle}`,
                        color: textPrimary,
                        textDecoration: 'none',
                        fontSize: '13px',
                        fontWeight: 600,
                      }}
                    >
                      <span>View GitHub Release Notes â†—</span>
                      <span style={{ color: textMuted, fontSize: '12px' }}>Changelog</span>
                    </a>
                  </div>
                </div>
              </BorderGlow>

              {/* Apple & Linux Card with Dynamic Proximity BorderGlow */}
              <BorderGlow
                borderRadius={22}
                backgroundColor={cardBg}
                glowColor="35 90 75"
                colors={['#f59e0b', '#fbbf24', '#d97706']}
                edgeSensitivity={30}
                glowRadius={40}
                glowIntensity={1.0}
              >
                <div
                  className="release-card-inner"
                  style={{
                    padding: windowWidth < 640 ? '22px 18px' : '36px 32px',
                    height: '100%',
                    minHeight: windowWidth < 640 ? 'auto' : '490px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    textAlign: 'left',
                  }}
                >
                  <div>
                    <div className="release-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', minHeight: windowWidth < 640 ? 'auto' : '62px', marginBottom: '18px' }}>
                      <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                        <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: isDark ? 'rgba(255,255,255,0.06)' : '#f8fafc', border: `1px solid ${borderSubtle}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: textPrimary }}>
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.61-.75 1.04-1.8 1.01-2.87-.96.04-2.06.66-2.7 1.45-.56.66-.99 1.72-.94 2.76 1.08.08 2.02-.59 2.63-1.34z"/></svg>
                        </div>
                        <div>
                          <div style={{ fontSize: '21px', fontWeight: 800, color: textPrimary, letterSpacing: '-0.02em' }}>Apple &amp; Linux</div>
                          <div style={{ fontSize: '13px', color: textMuted, marginTop: '2px' }}>macOS, iOS, Ubuntu, Debian</div>
                        </div>
                      </div>
                      <span style={{ fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '9999px', background: isDark ? 'rgba(245, 158, 11, 0.2)' : '#fef3c7', color: '#d97706', border: '1px solid #fde68a' }}>
                        Roadmap
                      </span>
                    </div>

                    <p className="release-card-desc" style={{ fontSize: '14px', color: textMuted, lineHeight: 1.65, minHeight: windowWidth < 640 ? 'auto' : '72px', marginBottom: '20px' }}>
                      Native macOS Apple Silicon DMG and Linux AppImage packages are actively compiling. Safari and Chrome users can share instantly using WebRTC data planes.
                    </p>

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', minHeight: windowWidth < 640 ? 'auto' : '30px', marginBottom: '24px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: textMuted, background: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9', padding: '4px 10px', borderRadius: '6px' }}>Apple Silicon</span>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: textMuted, background: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9', padding: '4px 10px', borderRadius: '6px' }}>AppImage</span>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: textMuted, background: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9', padding: '4px 10px', borderRadius: '6px' }}>MIT License</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: 'auto' }}>
                    <a
                      href="https://github.com/JACK-AI7/AuraDrop#building-from-source"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="cursor-pointer"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '14px 22px',
                        borderRadius: '12px',
                        backgroundColor: isDark ? '#ffffff' : '#0f172a',
                        color: isDark ? '#000000' : '#ffffff',
                        textDecoration: 'none',
                        fontSize: '14px',
                        fontWeight: 700,
                        transition: 'all 0.2s ease',
                        boxShadow: '0 4px 14px rgba(15, 23, 42, 0.15)',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                        Compile from Source (macOS DMG)
                      </span>
                      <span style={{ opacity: 0.85, fontSize: '13px' }}>ARM64</span>
                    </a>
                    <a
                      href="https://github.com/JACK-AI7/AuraDrop"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="cursor-pointer"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 18px',
                        borderRadius: '12px',
                        backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#f8fafc',
                        border: `1px solid ${borderSubtle}`,
                        color: textPrimary,
                        textDecoration: 'none',
                        fontSize: '13px',
                        fontWeight: 600,
                      }}
                    >
                      <span>Track Progress on GitHub â†—</span>
                      <span style={{ color: textMuted, fontSize: '12px' }}>Open Source</span>
                    </a>
                  </div>
                </div>
              </BorderGlow>
            </div>
          </div>
        </section>
      </AnimatedContent>

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
           BUY ME A COFFEE / SUPPORT (Dynamic Proximity BorderGlow, Clean Direct UI)
      â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      <AnimatedContent distance={40} duration={0.8} threshold={0.08}>
        <section id="support" style={{ padding: windowWidth < 640 ? '48px 0' : '96px 0', borderTop: `1px solid ${borderSubtle}` }}>
          <div className="section-container" style={{ maxWidth: '860px', margin: '0 auto', padding: windowWidth < 640 ? '0 16px' : '0 28px', textAlign: 'center' }}>
            <div style={{ textAlign: 'center', maxWidth: '720px', margin: windowWidth < 640 ? '0 auto 32px auto' : '0 auto 46px auto' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: textMuted, marginBottom: '14px' }}>
                Support Independent Development
              </div>
              <h2 style={{ fontSize: 'clamp(28px, 3.8vw, 46px)', fontWeight: 800, color: textPrimary, letterSpacing: '-0.03em', marginBottom: '16px' }}>
                Support AuraDrop Development
              </h2>
              <p style={{ fontSize: 'clamp(14px, 1.5vw, 16px)', color: textMuted, lineHeight: 1.6 }}>
                AuraDrop is 100% free, private, and open source with zero advertisements, zero tracking, and zero cloud surveillance. If this tool saves you time, consider supporting future development directly.
              </p>
            </div>

            {/* Direct UPI Payment & Contribution Card with Dynamic Proximity BorderGlow */}
            <BorderGlow
              borderRadius={24}
              backgroundColor={cardBg}
              glowColor="240 80 80"
              colors={isDark ? ['#ffffff', '#cbd5e1', '#94a3b8'] : ['#0f172a', '#475569', '#64748b']}
              edgeSensitivity={32}
              glowRadius={45}
              glowIntensity={1.0}
            >
              <div
                style={{
                  padding: windowWidth < 640 ? '24px 16px' : '40px 32px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  width: '100%',
                }}
              >
                {/* Real Verified QR Code Container */}
                <div
                  style={{
                    padding: windowWidth < 480 ? '14px' : '20px',
                    borderRadius: '18px',
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : '#f8fafc',
                    border: `1px solid ${borderSubtle}`,
                    textAlign: 'center',
                    marginBottom: '24px',
                  }}
                >
                  <img
                    src="/upi_qr.png"
                    alt="Union Bank Of India / PhonePe QR - B.JASWANTH REDDY"
                    width={windowWidth < 480 ? 150 : 180}
                    height={windowWidth < 480 ? 150 : 180}
                    style={{ borderRadius: '12px', objectFit: 'contain', display: 'block', margin: '0 auto' }}
                  />
                  <div style={{ marginTop: '12px' }}>
                    <p style={{ fontSize: '13px', fontWeight: 700, color: textPrimary }}>Union Bank of India â€¢ PhonePe QR</p>
                    <p style={{ fontSize: '11px', color: textMuted, marginTop: '2px' }}>Payee: B.JASWANTH REDDY</p>
                  </div>
                </div>

                {/* Direct UPI ID Pill with One-Click Copy */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: windowWidth < 420 ? 'wrap' : 'nowrap',
                    gap: '12px',
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#f8fafc',
                    border: `1px solid ${borderSubtle}`,
                    borderRadius: '14px',
                    padding: windowWidth < 480 ? '10px 14px' : '12px 20px',
                    width: '100%',
                    maxWidth: '440px',
                    margin: '0 auto 24px auto',
                  }}
                >
                  <div style={{ textAlign: 'left' }}>
                    <span style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 700, color: textMuted, letterSpacing: '0.08em', display: 'block' }}>
                      Direct UPI ID
                    </span>
                    <span style={{ fontSize: windowWidth < 400 ? '13px' : '15px', fontWeight: 800, color: textPrimary, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                      9182769225@ybl
                    </span>
                  </div>
                  <button
                    onClick={handleCopyUpi}
                    className="cursor-pointer"
                    style={{
                      backgroundColor: copiedUpi ? '#16a34a' : isDark ? '#ffffff' : '#0f172a',
                      color: copiedUpi ? '#ffffff' : isDark ? '#000000' : '#ffffff',
                      border: 'none',
                      borderRadius: '10px',
                      padding: '8px 16px',
                      fontSize: '12px',
                      fontWeight: 700,
                      transition: 'all 0.2s ease',
                      flexShrink: 0,
                    }}
                  >
                    {copiedUpi ? 'Copied âœ“' : 'Copy UPI'}
                  </button>
                </div>

                {/* SlideCommit Component for interactive commitment */}
                <div className="slide-commit" style={{ marginTop: '4px', marginBottom: '22px', maxWidth: '100%', display: 'flex', justifyContent: 'center' }}>
                  <SlideCommit
                    label={`Slide to support Â· â‚¹${selectedTier}`}
                    doneLabel="Support confirmed! Thank you"
                    errorLabel="Action failed"
                    onConfirm={handleSlideCommit}
                    trackColor={isDark ? 'rgba(255, 255, 255, 0.1)' : '#0f172a'}
                    handleColor="#ffffff"
                    successColor="#16a34a"
                    dangerColor="#e5484d"
                    width={Math.min(340, Math.max(260, windowWidth - 64))}
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

                {/* Clean Support Tiers */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: windowWidth < 480 ? '8px' : '14px', flexWrap: 'wrap', width: '100%' }}>
                  <div
                    onClick={() => { setSelectedTier(50); setSupportNotice('Selected: 1 Coffee (â‚¹50 / $1)'); }}
                    className="cursor-pointer"
                    style={{
                      padding: windowWidth < 480 ? '12px 14px' : '14px 20px',
                      borderRadius: '16px',
                      background: selectedTier === 50 ? (isDark ? '#ffffff' : '#0f172a') : (isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc'),
                      border: selectedTier === 50 ? (isDark ? '2px solid #ffffff' : '2px solid #0f172a') : `1px solid ${borderSubtle}`,
                      minWidth: windowWidth < 480 ? '90px' : '130px',
                      flex: windowWidth < 480 ? '1 1 90px' : '0 1 auto',
                      transition: 'all 0.2s ease',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ marginBottom: '6px', color: selectedTier === 50 ? (isDark ? '#000000' : '#ffffff') : textMuted }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto' }}>
                        <path d="M18 8h1a4 4 0 0 1 0 8h-1"/>
                        <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>
                        <line x1="6" y1="1" x2="6" y2="4"/>
                        <line x1="10" y1="1" x2="10" y2="4"/>
                        <line x1="14" y1="1" x2="14" y2="4"/>
                      </svg>
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: selectedTier === 50 ? (isDark ? '#000000' : '#ffffff') : textPrimary }}>1 Coffee</div>
                    <div style={{ fontSize: '11px', color: selectedTier === 50 ? (isDark ? '#000000' : '#ffffff') : textMuted, marginTop: '2px', fontWeight: 600 }}>â‚¹50 / $1</div>
                  </div>

                  <div
                    onClick={() => { setSelectedTier(150); setSupportNotice('Selected: 3 Coffees (â‚¹150 / $2)'); }}
                    className="cursor-pointer"
                    style={{
                      padding: windowWidth < 480 ? '12px 14px' : '14px 20px',
                      borderRadius: '16px',
                      background: selectedTier === 150 ? (isDark ? '#ffffff' : '#0f172a') : (isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc'),
                      border: selectedTier === 150 ? (isDark ? '2px solid #ffffff' : '2px solid #0f172a') : `1px solid ${borderSubtle}`,
                      minWidth: windowWidth < 480 ? '90px' : '130px',
                      flex: windowWidth < 480 ? '1 1 90px' : '0 1 auto',
                      transition: 'all 0.2s ease',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ marginBottom: '6px', color: selectedTier === 150 ? (isDark ? '#000000' : '#ffffff') : textMuted, display: 'flex', justifyContent: 'center', gap: '3px' }}>
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
                    <div style={{ fontSize: '13px', fontWeight: 700, color: selectedTier === 150 ? (isDark ? '#000000' : '#ffffff') : textPrimary }}>3 Coffees</div>
                    <div style={{ fontSize: '11px', color: selectedTier === 150 ? (isDark ? '#000000' : '#ffffff') : textMuted, marginTop: '2px', fontWeight: 600 }}>â‚¹150 / $2</div>
                  </div>

                  <div
                    onClick={() => { setSelectedTier(500); setSupportNotice('Selected: Supporter Star (â‚¹500 / $6)'); }}
                    className="cursor-pointer"
                    style={{
                      padding: windowWidth < 480 ? '12px 14px' : '14px 20px',
                      borderRadius: '16px',
                      background: selectedTier === 500 ? (isDark ? 'rgba(245, 158, 11, 0.2)' : '#fffbeb') : (isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc'),
                      border: selectedTier === 500 ? '2px solid #f59e0b' : `1px solid ${borderSubtle}`,
                      minWidth: windowWidth < 480 ? '90px' : '130px',
                      flex: windowWidth < 480 ? '1 1 90px' : '0 1 auto',
                      transition: 'all 0.2s ease',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ marginBottom: '6px', color: selectedTier === 500 ? '#f59e0b' : '#eab308' }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none" style={{ margin: '0 auto' }}>
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                      </svg>
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: selectedTier === 500 ? (isDark ? '#f59e0b' : '#b45309') : textPrimary }}>Supporter</div>
                    <div style={{ fontSize: '11px', color: selectedTier === 500 ? (isDark ? '#f59e0b' : '#b45309') : textMuted, marginTop: '2px', fontWeight: 600 }}>â‚¹500 / $6</div>
                  </div>
                </div>
              </div>
            </BorderGlow>
          </div>
        </section>
      </AnimatedContent>

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
           FOOTER
      â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      <footer style={{ borderTop: `1px solid ${borderSubtle}`, padding: windowWidth < 640 ? '44px 0 28px' : '64px 0 36px', backgroundColor: pageBg, transition: 'background-color 0.3s ease, border-color 0.3s ease' }}>
        <div className="section-container" style={{ maxWidth: '1220px', margin: '0 auto', padding: windowWidth < 640 ? '0 16px' : '0 28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: windowWidth < 640 ? '28px' : '36px' }}>
            <div style={{ maxWidth: '340px', textAlign: 'left' }}>
              <a href="/" className="cursor-pointer" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none', color: textPrimary }}>
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '7px',
                    backgroundColor: '#0f172a',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <img src="/logo.png" alt="AuraDrop" width="18" height="18" style={{ objectFit: 'contain', filter: 'brightness(3)' }} />
                </div>
                <span style={{ fontSize: '17px', fontWeight: 800 }}>AuraDrop</span>
              </a>
              <p style={{ fontSize: '13px', color: textMuted, marginTop: '12px', lineHeight: 1.6 }}>
                High-speed local peer-to-peer file sharing and messaging across Android, Windows, and Web.
              </p>
            </div>

            <div style={{ display: 'flex', gap: windowWidth < 640 ? '24px 32px' : '44px', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: textPrimary, marginBottom: '14px' }}>Navigation</div>
                <ul style={{ display: 'flex', flexDirection: 'column', gap: '10px', listStyle: 'none', padding: 0 }}>
                  <li><a href="#about" className="nav-link cursor-pointer">About</a></li>
                  <li><a href="#features" className="nav-link cursor-pointer">Features</a></li>
                  <li><a href="#protocol" className="nav-link cursor-pointer">Protocol</a></li>
                  <li><a href="#architecture" className="nav-link cursor-pointer">Architecture</a></li>
                  <li><a href="#downloads" className="nav-link cursor-pointer">Downloads</a></li>
                  <li><a href="#support" className="nav-link cursor-pointer">Support</a></li>
                </ul>
              </div>

              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: textPrimary, marginBottom: '14px' }}>Legal &amp; DPDP</div>
                <ul style={{ display: 'flex', flexDirection: 'column', gap: '10px', listStyle: 'none', padding: 0 }}>
                  <li>
                    <button
                      onClick={() => { setLegalTab('privacy'); setIsLegalOpen(true); }}
                      className="nav-link cursor-pointer"
                      style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', font: 'inherit' }}
                    >
                      Privacy Policy (DPDP)
                    </button>
                  </li>
                  <li>
                    <button
                      onClick={() => { setLegalTab('terms'); setIsLegalOpen(true); }}
                      className="nav-link cursor-pointer"
                      style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', font: 'inherit' }}
                    >
                      Terms &amp; Conditions
                    </button>
                  </li>
                  <li>
                    <button
                      onClick={() => { setLegalTab('cookies'); setIsLegalOpen(true); }}
                      className="nav-link cursor-pointer"
                      style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', font: 'inherit' }}
                    >
                      Cookie Policy
                    </button>
                  </li>
                  <li>
                    <button
                      onClick={() => { setLegalTab('refund'); setIsLegalOpen(true); }}
                      className="nav-link cursor-pointer"
                      style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', font: 'inherit' }}
                    >
                      Refund Policy
                    </button>
                  </li>
                  <li>
                    <button
                      onClick={() => { setLegalTab('cookies'); setIsLegalOpen(true); }}
                      className="nav-link cursor-pointer"
                      style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', font: 'inherit', color: '#60a5fa' }}
                    >
                      Cookie Preferences
                    </button>
                  </li>
                </ul>
              </div>

              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: textPrimary, marginBottom: '14px' }}>Community &amp; Source</div>
                <ul style={{ display: 'flex', flexDirection: 'column', gap: '10px', listStyle: 'none', padding: 0 }}>
                  <li><a href="https://github.com/JACK-AI7/AuraDrop" target="_blank" rel="noopener noreferrer" className="nav-link cursor-pointer">GitHub Repository</a></li>
                  <li><a href="https://github.com/JACK-AI7/AuraDrop/releases" target="_blank" rel="noopener noreferrer" className="nav-link cursor-pointer">Official Releases</a></li>
                  <li><a href="https://github.com/JACK-AI7/AuraDrop/issues" target="_blank" rel="noopener noreferrer" className="nav-link cursor-pointer">Security &amp; Issues</a></li>
                  <li><a href="https://github.com/JACK-AI7/AuraDrop/blob/main/README.md" target="_blank" rel="noopener noreferrer" className="nav-link cursor-pointer">Documentation</a></li>
                </ul>
              </div>
            </div>
          </div>

          <div style={{ marginTop: '40px', paddingTop: '24px', borderTop: `1px solid ${borderSubtle}`, display: 'flex', justifyContent: 'space-between', alignItems: windowWidth < 640 ? 'flex-start' : 'center', flexDirection: windowWidth < 640 ? 'column' : 'row', gap: '14px', fontSize: '12px', color: textMuted }}>
            <span>Â© 2026 AuraDrop. Open source under the MIT License. Developed by B. Jaswanth Reddy Â· DPDP Act 2023 Compliant.</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <button
                onClick={() => setIsCommandMenuOpen(true)}
                style={{
                  background: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9',
                  border: `1px solid ${borderSubtle}`,
                  borderRadius: '6px',
                  padding: '3px 8px',
                  color: textMuted,
                  fontSize: '11px',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Press âŒ˜K for Commands
              </button>
              <span className="tabular-nums">Version 2.0.1</span>
            </div>
          </div>
        </div>
      </footer>

      {/* MODALS & OVERLAYS */}
      <DownloadsModal isOpen={isDownloadsOpen} onClose={() => setIsDownloadsOpen(false)} isDark={isDark} />
      <DiagnosticsModal isOpen={isDiagnosticsOpen} onClose={() => setIsDiagnosticsOpen(false)} isDark={isDark} />
      <LegalModal
        isOpen={isLegalOpen}
        onClose={() => setIsLegalOpen(false)}
        initialTab={legalTab}
        isDark={isDark}
      />
      <CookieConsentBanner
        isDark={isDark}
        onOpenPolicy={() => {
          setLegalTab('cookies');
          setIsLegalOpen(true);
        }}
      />
      <CommandMenu
        isOpen={isCommandMenuOpen}
        onClose={() => setIsCommandMenuOpen(false)}
        onOpenDownloads={() => setIsDownloadsOpen(true)}
        onOpenLegal={(tab) => {
          setLegalTab(tab);
          setIsLegalOpen(true);
        }}
        onToggleTheme={() => setTheme(isDark ? 'light' : 'dark')}
        isDark={isDark}
        onScrollToSection={(id) => {
          const el = document.getElementById(id);
          if (el) el.scrollIntoView({ behavior: 'smooth' });
        }}
      />
      <ToastNotification toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
};
