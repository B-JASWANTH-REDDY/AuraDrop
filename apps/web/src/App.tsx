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
import { LegalModal, LegalTab } from './components/LegalModal';
import { CookieConsentBanner } from './components/CookieConsentBanner';
import { CommandMenu } from './components/CommandMenu';
import { ToastNotification, ToastMessage } from './components/ToastNotification';
import { LiveStatusPill } from './components/LiveStatusPill';
import { analytics } from './engine/analytics';
import { TransferEngine, TransferEngineEvent } from './engine/transferEngine';
import { TransferStorage } from './engine/transferStorage';
import { PeerDevice, PickedFile, TransferProgress, TransferRecord, VisibilityMode } from './types';

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

export const App: React.FC = () => {
  const engine = TransferEngine.getInstance();
  const storage = TransferStorage.getInstance();

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

  // Navigation tab state
  const [visibility, setVisibility] = useState<VisibilityMode>('everyone');

  // Real Discovered Peers from TransferEngine
  const [peers, setPeers] = useState<PeerDevice[]>([]);
  const [selectedPeer, setSelectedPeer] = useState<PeerDevice | null>(null);

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
    addToast({
      title: 'UPI ID Copied',
      description: '9182769225@ybl ready to paste in GPay, PhonePe, or Paytm',
      icon: '📋',
      actionLabel: 'Dismiss',
    });
    setTimeout(() => setCopiedUpi(false), 2500);
  };

  // Handle SlideCommit success
  const handleSlideCommit = () => {
    const msg = `Thank you for supporting AuraDrop with ₹${selectedTier}!`;
    setSupportNotice(msg);
    addToast({
      title: 'Support Tier Selected',
      description: msg,
      icon: '❤️',
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

      {/* ══════════════════════════════════════════════════════════════════════════
           TOP NAVIGATION BAR (Real Links, Clean Logo, Light/Dark Switcher)
      ══════════════════════════════════════════════════════════════════════════ */}
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
            {/* Live Signaling Status Indicator */}
            <div className="desktop-nav" style={{ flexShrink: 0 }}>
              <LiveStatusPill peerCount={peers.length} onClick={() => setIsDiagnosticsOpen(true)} isDark={isDark} />
            </div>

            {/* Quick Find (⌘K) Command Menu Trigger */}
            <button
              onClick={() => setIsCommandMenuOpen(true)}
              title="Search & Commands (⌘K / Ctrl+K)"
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
              <kbd style={{ fontSize: '10px', background: isDark ? '#1a1a20' : '#e2e8f0', padding: '1px 5px', borderRadius: '4px', border: `1px solid ${borderSubtle}` }}>⌘K</kbd>
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

            {/* Settings Dialog Trigger */}
            <button
              onClick={() => setIsSettingsOpen(true)}
              title="AuraDrop Settings"
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: isDark ? 'rgba(255, 255, 255, 0.08)' : '#f1f5f9',
                border: `1px solid ${borderSubtle}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: textPrimary,
                cursor: 'pointer',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>

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

      {/* ══════════════════════════════════════════════════════════════════════════
           HERO SECTION (Bold Visible Logo Squircle, Perfectly Aligned Typography)
      ══════════════════════════════════════════════════════════════════════════ */}
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

            {/* Protocol & Live Status Badge Row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '18px' }}>
              <LiveStatusPill peerCount={peers.length} onClick={() => setIsDiagnosticsOpen(true)} isDark={isDark} />
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
                <span>Zero Cloud Relay · P2P</span>
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
                <span>Live Interactive Demo ↓</span>
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
                gap: '36px',
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

          {/* ── Desktop Live App Showcase (Static Viewing Card, Not Movable) ── */}
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
                  border: '1px solid rgba(255, 255, 255, 0.14)',
                  borderRadius: '9999px',
                  padding: windowWidth < 480 ? '7px 14px' : '9px 20px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '10px',
                  boxShadow: '0 12px 35px rgba(0, 0, 0, 0.75)',
                  marginBottom: '26px',
                  maxWidth: '100%',
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                }}
              >
                <div
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: '#34C759',
                    animation: 'pulseDot 1.8s ease-in-out infinite',
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: windowWidth < 480 ? '11px' : '13px', fontWeight: 600, color: '#FFFFFF', textAlign: 'center' }}>
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

              {/* 3D Interactive Hero Globe with Pure White Connection Line */}
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
                  size={windowWidth < 480 ? 190 : 240}
                />
              </div>

              {/* Minimal Connected Device Status Row */}
              <div style={{ width: '100%', maxWidth: '720px', marginBottom: '22px' }}>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
                  <div
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.06)',
                      border: '1px solid rgba(255, 255, 255, 0.16)',
                      borderRadius: '14px',
                      padding: '12px 18px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      flex: '1 1 200px',
                      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
                    }}
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                  <div style={{ height: '100%', width: '82%', background: 'linear-gradient(90deg, #34C759, #30D158)', borderRadius: '9999px' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8' }}>
                  <span>3.7 GB of 4.5 GB transferred at 67.7 MB/s</span>
                  <span>SHA-256 Checksum Verified</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════════
           FEATURES SECTION
      ══════════════════════════════════════════════════════════════════════════ */}
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

      {/* ══════════════════════════════════════════════════════════════════════════
           PROTOCOL SECTION
      ══════════════════════════════════════════════════════════════════════════ */}
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

      {/* ══════════════════════════════════════════════════════════════════════════
           APP ARCHITECTURE SECTION
      ══════════════════════════════════════════════════════════════════════════ */}
      <AnimatedContent distance={40} duration={0.8} threshold={0.08}>
        <section id="architecture" style={{ padding: '96px 0', borderTop: `1px solid ${borderSubtle}` }}>
          <div style={{ maxWidth: '1220px', margin: '0 auto', padding: '0 28px' }}>
            <div style={{ textAlign: 'center', maxWidth: '720px', margin: '0 auto 56px auto' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: textMuted, marginBottom: '14px' }}>
                System Architecture
              </div>
              <h2 style={{ fontSize: 'clamp(32px, 4.2vw, 48px)', fontWeight: 800, letterSpacing: '-0.03em', color: textPrimary, marginBottom: '16px', lineHeight: 1.15 }}>
                Built for native platform excellence.
              </h2>
              <p style={{ fontSize: '17px', color: textMuted, lineHeight: 1.6 }}>
                AuraDrop is engineered with specialized native runtimes for Windows, Android, and Web, sharing a unified cryptographic protocol.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px' }}>
              <TiltCard style={{ backgroundColor: cardBg, border: `1px solid ${borderSubtle}`, borderRadius: '16px', padding: '28px', boxShadow: isDark ? '0 4px 16px rgba(0,0,0,0.4)' : '0 2px 8px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', height: '100%' }}>
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
                <h4 style={{ fontSize: '16px', fontWeight: 700, color: textPrimary, marginBottom: '8px', minHeight: '44px', display: 'flex', alignItems: 'center' }}>Tauri &amp; Rust Desktop Core</h4>
                <p style={{ fontSize: '13px', color: textMuted, lineHeight: 1.6, margin: 0, minHeight: '66px' }}>Ultra-lean 5.96 MB Windows installer with negligible RAM usage, native Windows Dynamic Island overlay, and local socket server.</p>
              </TiltCard>

              <TiltCard style={{ backgroundColor: cardBg, border: `1px solid ${borderSubtle}`, borderRadius: '16px', padding: '28px', boxShadow: isDark ? '0 4px 16px rgba(0,0,0,0.4)' : '0 2px 8px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ width: '42px', height: '42px', borderRadius: '10px', backgroundColor: isDark ? 'rgba(22, 163, 74, 0.15)' : '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px', border: `1px solid ${borderSubtle}` }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
                    <line x1="12" y1="18" x2="12.01" y2="18"/>
                  </svg>
                </div>
                <h4 style={{ fontSize: '16px', fontWeight: 700, color: textPrimary, marginBottom: '8px', minHeight: '44px', display: 'flex', alignItems: 'center' }}>Flutter &amp; Kotlin Android Engine</h4>
                <p style={{ fontSize: '13px', color: textMuted, lineHeight: 1.6, margin: 0, minHeight: '66px' }}>Optimized foreground service, dynamic notification pill, direct port 8080 HTTP server, and automatic gallery integration.</p>
              </TiltCard>

              <TiltCard style={{ backgroundColor: cardBg, border: `1px solid ${borderSubtle}`, borderRadius: '16px', padding: '28px', boxShadow: isDark ? '0 4px 16px rgba(0,0,0,0.4)' : '0 2px 8px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ width: '42px', height: '42px', borderRadius: '10px', backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px', border: `1px solid ${borderSubtle}` }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={textPrimary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="2" y1="12" x2="22" y2="12"/>
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                  </svg>
                </div>
                <h4 style={{ fontSize: '16px', fontWeight: 700, color: textPrimary, marginBottom: '8px', minHeight: '44px', display: 'flex', alignItems: 'center' }}>Universal Web P2P Engine</h4>
                <p style={{ fontSize: '13px', color: textMuted, lineHeight: 1.6, margin: 0, minHeight: '66px' }}>Peer-to-peer browser connectivity using WebRTC DataChannels with STUN/TURN traversal for cross-network file exchanges.</p>
              </TiltCard>

              <TiltCard style={{ backgroundColor: cardBg, border: `1px solid ${borderSubtle}`, borderRadius: '16px', padding: '28px', boxShadow: isDark ? '0 4px 16px rgba(0,0,0,0.4)' : '0 2px 8px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ width: '42px', height: '42px', borderRadius: '10px', backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px', border: `1px solid ${borderSubtle}` }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={textPrimary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    <polyline points="9 12 11 14 15 10"/>
                  </svg>
                </div>
                <h4 style={{ fontSize: '16px', fontWeight: 700, color: textPrimary, marginBottom: '8px', minHeight: '44px', display: 'flex', alignItems: 'center' }}>17-Point Regression Suite</h4>
                <p style={{ fontSize: '13px', color: textMuted, lineHeight: 1.6, margin: 0, minHeight: '66px' }}>Automated tests continuously auditing path traversal sanitization, device identity binding, and SHA-256 byte integrity.</p>
              </TiltCard>
            </div>
          </div>
        </section>
      </AnimatedContent>

      {/* ══════════════════════════════════════════════════════════════════════════
           PRODUCTION RELEASES (With Dynamic Proximity BorderGlow, Perfectly Aligned)
      ══════════════════════════════════════════════════════════════════════════ */}
      <AnimatedContent distance={40} duration={0.8} threshold={0.08}>
        <section id="downloads" style={{ padding: '96px 0', borderTop: `1px solid ${borderSubtle}` }}>
          <div style={{ maxWidth: '1220px', margin: '0 auto', padding: '0 28px' }}>
            <div style={{ textAlign: 'center', maxWidth: '720px', margin: '0 auto 56px auto' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: textMuted, marginBottom: '14px' }}>
                Production Releases
              </div>
              <h2 style={{ fontSize: 'clamp(32px, 4.2vw, 48px)', fontWeight: 800, letterSpacing: '-0.03em', color: textPrimary, marginBottom: '16px', lineHeight: 1.15 }}>
                Download AuraDrop v2.0.1
              </h2>
              <p style={{ fontSize: '17px', color: textMuted, lineHeight: 1.6 }}>
                Official release binaries. Code signed for Windows, standalone APK for Android, and verified SHA-256 integrity checksums.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '28px' }}>
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
                  style={{
                    padding: '36px 32px',
                    height: '100%',
                    minHeight: '490px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    textAlign: 'left',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', minHeight: '62px', marginBottom: '18px' }}>
                      <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                        <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: isDark ? 'rgba(255,255,255,0.06)' : '#f8fafc', border: `1px solid ${borderSubtle}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: textPrimary }}>
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/></svg>
                        </div>
                        <div>
                          <div style={{ fontSize: '21px', fontWeight: 800, color: textPrimary, letterSpacing: '-0.02em' }}>Windows Desktop</div>
                          <div style={{ fontSize: '13px', color: textMuted, marginTop: '2px' }}>v2.0.1 · Windows 10 &amp; 11 (64-bit)</div>
                        </div>
                      </div>
                      <span style={{ fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '9999px', background: isDark ? 'rgba(22, 163, 74, 0.2)' : '#dcfce7', color: '#16a34a', border: '1px solid #bbf7d0' }}>
                        Stable
                      </span>
                    </div>

                    <p style={{ fontSize: '14px', color: textMuted, lineHeight: 1.65, minHeight: '72px', marginBottom: '20px' }}>
                      Tauri v2 native desktop application featuring native Windows Dynamic Island, local TCP chunk streaming, and zero-config peer discovery.
                    </p>

                    {/* Technical Specs Strip */}
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', minHeight: '30px', marginBottom: '28px' }}>
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
                  style={{
                    padding: '36px 32px',
                    height: '100%',
                    minHeight: '490px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    textAlign: 'left',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', minHeight: '62px', marginBottom: '18px' }}>
                      <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                        <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: isDark ? 'rgba(255,255,255,0.06)' : '#f8fafc', border: `1px solid ${borderSubtle}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a' }}>
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.551 0 .9993.4482.9993.9993.0001.5511-.4483.9997-.9993.9997m-11.046 0c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993 0 .5511-.4482.9997-.9993.9997m11.4045-6.02l1.9973-3.4592a.416.416 0 00-.1521-.5676.416.416 0 00-.5676.1521l-2.0223 3.503C15.5902 8.4116 13.8533 8.1 12 8.1s-3.5902.3116-5.1368.8497L4.8409 5.4467a.4161.4161 0 00-.5677-.1521.4157.4157 0 00-.1521.5676l1.9973 3.4592C2.6889 11.1867.3432 14.6589 0 18.761h24c-.3432-4.1021-2.6889-7.5743-6.1185-9.4396"/></svg>
                        </div>
                        <div>
                          <div style={{ fontSize: '21px', fontWeight: 800, color: textPrimary, letterSpacing: '-0.02em' }}>Android Mobile</div>
                          <div style={{ fontSize: '13px', color: textMuted, marginTop: '2px' }}>v2.0.1 · Android 8.0+ (ARM64)</div>
                        </div>
                      </div>
                      <span style={{ fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '9999px', background: isDark ? 'rgba(22, 163, 74, 0.2)' : '#dcfce7', color: '#16a34a', border: '1px solid #bbf7d0' }}>
                        Stable
                      </span>
                    </div>

                    <p style={{ fontSize: '14px', color: textMuted, lineHeight: 1.65, minHeight: '72px', marginBottom: '20px' }}>
                      Flutter &amp; Kotlin foreground service app with real-time notification dynamic island, MediaStore gallery exports, and embedded socket server.
                    </p>

                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', minHeight: '30px', marginBottom: '28px' }}>
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
                      <span>View GitHub Release Notes ↗</span>
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
                  style={{
                    padding: '36px 32px',
                    height: '100%',
                    minHeight: '490px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    textAlign: 'left',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', minHeight: '62px', marginBottom: '18px' }}>
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

                    <p style={{ fontSize: '14px', color: textMuted, lineHeight: 1.65, minHeight: '72px', marginBottom: '20px' }}>
                      Native macOS Apple Silicon DMG and Linux AppImage packages are actively compiling. Safari and Chrome users can share instantly using WebRTC data planes.
                    </p>

                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', minHeight: '30px', marginBottom: '28px' }}>
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
                      <span>Track Progress on GitHub ↗</span>
                      <span style={{ color: textMuted, fontSize: '12px' }}>Open Source</span>
                    </a>
                  </div>
                </div>
              </BorderGlow>
            </div>
          </div>
        </section>
      </AnimatedContent>

      {/* ══════════════════════════════════════════════════════════════════════════
           BUY ME A COFFEE / SUPPORT (Dynamic Proximity BorderGlow, Clean Direct UI)
      ══════════════════════════════════════════════════════════════════════════ */}
      <AnimatedContent distance={40} duration={0.8} threshold={0.08}>
        <section id="support" style={{ padding: '96px 0', borderTop: `1px solid ${borderSubtle}` }}>
          <div style={{ maxWidth: '860px', margin: '0 auto', padding: '0 28px', textAlign: 'center' }}>
            <div style={{ textAlign: 'center', maxWidth: '720px', margin: '0 auto 46px auto' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: textMuted, marginBottom: '14px' }}>
                Support Independent Development
              </div>
              <h2 style={{ fontSize: 'clamp(30px, 3.8vw, 46px)', fontWeight: 800, color: textPrimary, letterSpacing: '-0.03em', marginBottom: '16px' }}>
                Support AuraDrop Development
              </h2>
              <p style={{ fontSize: '16px', color: textMuted, lineHeight: 1.6 }}>
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
                  padding: '40px 32px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  width: '100%',
                }}
              >
                {/* Real Verified QR Code Container */}
                <div
                  style={{
                    padding: '20px',
                    borderRadius: '18px',
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : '#f8fafc',
                    border: `1px solid ${borderSubtle}`,
                    textAlign: 'center',
                    marginBottom: '26px',
                  }}
                >
                  <img
                    src="/upi_qr.png"
                    alt="Union Bank Of India / PhonePe QR - B.JASWANTH REDDY"
                    width="180"
                    height="180"
                    style={{ borderRadius: '12px', objectFit: 'contain', display: 'block', margin: '0 auto' }}
                  />
                  <div style={{ marginTop: '12px' }}>
                    <p style={{ fontSize: '13px', fontWeight: 700, color: textPrimary }}>Union Bank of India • PhonePe QR</p>
                    <p style={{ fontSize: '11px', color: textMuted, marginTop: '2px' }}>Payee: B.JASWANTH REDDY</p>
                  </div>
                </div>

                {/* Direct UPI ID Pill with One-Click Copy */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#f8fafc',
                    border: `1px solid ${borderSubtle}`,
                    borderRadius: '14px',
                    padding: '12px 20px',
                    width: '100%',
                    maxWidth: '440px',
                    margin: '0 auto 24px auto',
                  }}
                >
                  <div style={{ textAlign: 'left' }}>
                    <span style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 700, color: textMuted, letterSpacing: '0.08em', display: 'block' }}>
                      Direct UPI ID
                    </span>
                    <span style={{ fontSize: '15px', fontWeight: 800, color: textPrimary, fontFamily: 'monospace' }}>
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
                    trackColor={isDark ? 'rgba(255, 255, 255, 0.1)' : '#0f172a'}
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

                {/* Clean Support Tiers */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: '14px', flexWrap: 'wrap', width: '100%' }}>
                  <div
                    onClick={() => { setSelectedTier(50); setSupportNotice('Selected: 1 Coffee (₹50 / $1)'); }}
                    className="cursor-pointer"
                    style={{
                      padding: '14px 20px',
                      borderRadius: '16px',
                      background: selectedTier === 50 ? (isDark ? '#ffffff' : '#0f172a') : (isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc'),
                      border: selectedTier === 50 ? (isDark ? '2px solid #ffffff' : '2px solid #0f172a') : `1px solid ${borderSubtle}`,
                      minWidth: '130px',
                      transition: 'all 0.2s ease',
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
                    <div style={{ fontSize: '11px', color: selectedTier === 50 ? (isDark ? '#000000' : '#ffffff') : textMuted, marginTop: '2px', fontWeight: 600 }}>₹50 / $1</div>
                  </div>

                  <div
                    onClick={() => { setSelectedTier(150); setSupportNotice('Selected: 3 Coffees (₹150 / $2)'); }}
                    className="cursor-pointer"
                    style={{
                      padding: '14px 20px',
                      borderRadius: '16px',
                      background: selectedTier === 150 ? (isDark ? '#ffffff' : '#0f172a') : (isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc'),
                      border: selectedTier === 150 ? (isDark ? '2px solid #ffffff' : '2px solid #0f172a') : `1px solid ${borderSubtle}`,
                      minWidth: '130px',
                      transition: 'all 0.2s ease',
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
                    <div style={{ fontSize: '11px', color: selectedTier === 150 ? (isDark ? '#000000' : '#ffffff') : textMuted, marginTop: '2px', fontWeight: 600 }}>₹150 / $2</div>
                  </div>

                  <div
                    onClick={() => { setSelectedTier(500); setSupportNotice('Selected: Supporter Star (₹500 / $6)'); }}
                    className="cursor-pointer"
                    style={{
                      padding: '14px 20px',
                      borderRadius: '16px',
                      background: selectedTier === 500 ? (isDark ? 'rgba(245, 158, 11, 0.2)' : '#fffbeb') : (isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc'),
                      border: selectedTier === 500 ? '2px solid #f59e0b' : `1px solid ${borderSubtle}`,
                      minWidth: '130px',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <div style={{ marginBottom: '6px', color: selectedTier === 500 ? '#f59e0b' : '#eab308' }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none" style={{ margin: '0 auto' }}>
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                      </svg>
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: selectedTier === 500 ? (isDark ? '#f59e0b' : '#b45309') : textPrimary }}>Supporter</div>
                    <div style={{ fontSize: '11px', color: selectedTier === 500 ? (isDark ? '#f59e0b' : '#b45309') : textMuted, marginTop: '2px', fontWeight: 600 }}>₹500 / $6</div>
                  </div>
                </div>
              </div>
            </BorderGlow>
          </div>
        </section>
      </AnimatedContent>

      {/* ══════════════════════════════════════════════════════════════════════════
           FOOTER
      ══════════════════════════════════════════════════════════════════════════ */}
      <footer style={{ borderTop: `1px solid ${borderSubtle}`, padding: '64px 0 36px', backgroundColor: pageBg, transition: 'background-color 0.3s ease, border-color 0.3s ease' }}>
        <div style={{ maxWidth: '1220px', margin: '0 auto', padding: '0 28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '36px' }}>
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

            <div style={{ display: 'flex', gap: '44px', flexWrap: 'wrap' }}>
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
                      Cookie Settings ⚙️
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

          <div style={{ marginTop: '50px', paddingTop: '24px', borderTop: `1px solid ${borderSubtle}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', fontSize: '12px', color: textMuted }}>
            <span>© 2026 AuraDrop. Open source under the MIT License. Developed by B. Jaswanth Reddy · DPDP Act 2023 Compliant.</span>
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
                Press ⌘K for Commands
              </button>
              <span className="tabular-nums">Version 2.0.1</span>
            </div>
          </div>
        </div>
      </footer>

      {/* MODALS & OVERLAYS */}
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
      <DiagnosticsModal isOpen={isDiagnosticsOpen} onClose={() => setIsDiagnosticsOpen(false)} isDark={isDark} />
      <DownloadsModal isOpen={isDownloadsOpen} onClose={() => setIsDownloadsOpen(false)} isDark={isDark} />
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
      <LegalModal
        isOpen={isLegalOpen}
        onClose={() => setIsLegalOpen(false)}
        initialTab={legalTab}
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
        onOpenPairing={() => setIsPairModalOpen(true)}
        onOpenHistory={() => setIsHistoryOpen(true)}
        onOpenChat={() => setIsChatOpen(true)}
        onOpenDiagnostics={() => setIsDiagnosticsOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenLegal={(tab) => {
          setLegalTab(tab);
          setIsLegalOpen(true);
        }}
        onToggleTheme={() => setTheme(isDark ? 'light' : 'dark')}
        isDark={isDark}
      />
      <ToastNotification toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
};
