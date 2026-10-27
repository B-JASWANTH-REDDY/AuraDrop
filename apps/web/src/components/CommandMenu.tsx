import React, { useState, useEffect, useRef } from 'react';

export interface CommandAction {
  id: string;
  title: string;
  category: 'Downloads' | 'Showcase' | 'Navigation' | 'Legal' | 'Preferences';
  icon: React.ReactNode;
  badge?: string;
  shortcut?: string;
  perform: () => void;
}

interface CommandMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenDownloads: () => void;
  onOpenLegal: (tab: 'privacy' | 'terms' | 'cookies' | 'refund' | 'business') => void;
  onToggleTheme: () => void;
  isDark: boolean;
  onScrollToSection?: (id: string) => void;
  onOpenPairing?: () => void;
  onOpenHistory?: () => void;
  onOpenChat?: () => void;
  onOpenDiagnostics?: () => void;
  onOpenSettings?: () => void;
}

export const CommandMenu: React.FC<CommandMenuProps> = ({
  isOpen,
  onClose,
  onOpenDownloads,
  onOpenLegal,
  onToggleTheme,
  isDark,
  onScrollToSection,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollTo = (id: string) => {
    onClose();
    if (onScrollToSection) {
      onScrollToSection(id);
    } else {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      } else {
        window.location.hash = `#${id}`;
      }
    }
  };

  const actions: CommandAction[] = [
    {
      id: 'dl-win-setup',
      title: 'Download Windows Setup (.exe)',
      category: 'Downloads',
      badge: '5.96 MB',
      shortcut: 'EXE',
      icon: (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
          <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
        </svg>
      ),
      perform: () => {
        window.location.href = '/downloads/AuraDrop-Setup.exe';
        onClose();
      },
    },
    {
      id: 'dl-android',
      title: 'Download Android APK (Direct)',
      category: 'Downloads',
      badge: '49.5 MB',
      shortcut: 'APK',
      icon: (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.551 0 .9993.4482.9993.9993.0001.5511-.4483.9997-.9993.9997m-11.046 0c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993 0 .5511-.4482.9997-.9993.9997m11.4045-6.02l1.9973-3.4592a.416.416 0 00-.1521-.5676.416.416 0 00-.5676.1521l-2.0223 3.503C15.5902 8.4116 13.8533 8.1 12 8.1s-3.5902.3116-5.1368.8497L4.8409 5.4467a.4161.4161 0 00-.5677-.1521.4157.4157 0 00-.1521.5676l1.9973 3.4592C2.6889 11.1867.3432 14.6589 0 18.761h24c-.3432-4.1021-2.6889-7.5743-6.1185-9.4396" />
        </svg>
      ),
      perform: () => {
        window.location.href = '/downloads/AuraDrop-Android.apk';
        onClose();
      },
    },
    {
      id: 'dl-win-msi',
      title: 'Download Windows MSI Package',
      category: 'Downloads',
      badge: '9.25 MB',
      icon: (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m7.5 4.27 9 5.15" />
          <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
          <path d="m3.3 7 8.7 5 8.7-5" />
          <path d="M12 22V12" />
        </svg>
      ),
      perform: () => {
        window.location.href = '/downloads/AuraDrop-Windows.msi';
        onClose();
      },
    },
    {
      id: 'dl-win-zip',
      title: 'Download Windows Portable ZIP',
      category: 'Downloads',
      badge: '8.42 MB',
      icon: (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
          <line x1="12" y1="11" x2="12" y2="17" />
          <line x1="10" y1="13" x2="14" y2="13" />
        </svg>
      ),
      perform: () => {
        window.location.href = '/downloads/AuraDrop-Windows.zip';
        onClose();
      },
    },
    {
      id: 'dl-all',
      title: 'Open Official Downloads Center',
      category: 'Downloads',
      badge: 'Releases',
      icon: (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      ),
      perform: () => {
        onOpenDownloads();
        onClose();
      },
    },
    {
      id: 'showcase-demo',
      title: 'View Interactive Desktop & Island Demo',
      category: 'Showcase',
      shortcut: 'S',
      icon: (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      ),
      perform: () => scrollTo('about'),
    },
    {
      id: 'nav-features',
      title: 'Engine Capabilities & 100+ MB/s LAN Speed',
      category: 'Navigation',
      shortcut: 'F',
      icon: (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      ),
      perform: () => scrollTo('features'),
    },
    {
      id: 'nav-protocol',
      title: 'How Transfers Work (Wire Protocol Flow)',
      category: 'Navigation',
      shortcut: 'P',
      icon: (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="16" y="16" width="6" height="6" rx="1" />
          <rect x="2" y="16" width="6" height="6" rx="1" />
          <rect x="9" y="2" width="6" height="6" rx="1" />
          <path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3" />
          <path d="M12 12V8" />
        </svg>
      ),
      perform: () => scrollTo('protocol'),
    },
    {
      id: 'nav-architecture',
      title: 'Native Runtimes & System Architecture',
      category: 'Navigation',
      shortcut: 'A',
      icon: (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
          <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" />
          <path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" />
        </svg>
      ),
      perform: () => scrollTo('architecture'),
    },
    {
      id: 'action-theme',
      title: `Switch to ${isDark ? 'Light' : 'Dark'} Mode`,
      category: 'Preferences',
      shortcut: 'T',
      icon: isDark ? (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      ) : (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      ),
      perform: () => {
        onToggleTheme();
        onClose();
      },
    },
    {
      id: 'nav-github',
      title: 'GitHub Source Repository & Releases',
      category: 'Navigation',
      badge: 'Open Source',
      icon: (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
        </svg>
      ),
      perform: () => {
        window.open('https://github.com/JACK-AI7/AuraDrop', '_blank', 'noopener,noreferrer');
        onClose();
      },
    },
    {
      id: 'legal-privacy',
      title: 'Privacy Policy & DPDP Act 2023 Compliance',
      category: 'Legal',
      shortcut: 'DPDP',
      icon: (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      ),
      perform: () => {
        onOpenLegal('privacy');
        onClose();
      },
    },
    {
      id: 'legal-terms',
      title: 'Terms and Conditions (MIT License)',
      category: 'Legal',
      icon: (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <line x1="10" y1="9" x2="8" y2="9" />
        </svg>
      ),
      perform: () => {
        onOpenLegal('terms');
        onClose();
      },
    },
    {
      id: 'legal-cookies',
      title: 'Cookie & Local Storage Policy',
      category: 'Legal',
      icon: (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5" />
          <path d="M8.5 8.5v.01" />
          <path d="M16 15.5v.01" />
          <path d="M12 12v.01" />
          <path d="M11 17v.01" />
          <path d="M7 14v.01" />
        </svg>
      ),
      perform: () => {
        onOpenLegal('cookies');
        onClose();
      },
    },
    {
      id: 'legal-refund',
      title: 'Refund & Sponsorship Terms',
      category: 'Legal',
      icon: (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
        </svg>
      ),
      perform: () => {
        onOpenLegal('refund');
        onClose();
      },
    },
  ];

  const filtered = actions.filter(
    (a) =>
      a.title.toLowerCase().includes(query.toLowerCase()) ||
      a.category.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % Math.max(1, filtered.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filtered.length) % Math.max(1, filtered.length));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          filtered[selectedIndex].perform();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filtered, selectedIndex, onClose]);

  if (!isOpen) return null;

  const overlayBg = isDark ? 'rgba(0, 0, 0, 0.75)' : 'rgba(15, 23, 42, 0.45)';
  const cardBg = isDark ? '#111115' : '#ffffff';
  const cardBorder = isDark ? '#28282e' : '#e2e8f0';
  const cardShadow = isDark
    ? '0 25px 60px rgba(0, 0, 0, 0.95), 0 0 0 1px rgba(255, 255, 255, 0.08)'
    : '0 25px 60px rgba(15, 23, 42, 0.18), 0 0 0 1px rgba(15, 23, 42, 0.05)';
  const searchBorder = isDark ? '#202024' : '#f1f5f9';
  const inputColor = isDark ? '#ffffff' : '#0f172a';
  const escBg = isDark ? '#24242a' : '#f1f5f9';
  const escBorder = isDark ? '#33333a' : '#e2e8f0';
  const escColor = isDark ? '#a1a1aa' : '#64748b';
  const itemTextColor = isDark ? '#e4e4e7' : '#334155';
  const itemSelectedColor = isDark ? '#ffffff' : '#0f172a';
  const itemSelectedBg = isDark ? 'rgba(255, 255, 255, 0.08)' : '#f1f5f9';
  const badgeBg = isDark ? '#1c1c22' : '#f8fafc';
  const badgeBorder = isDark ? '#2a2a32' : '#e2e8f0';
  const badgeColor = isDark ? '#a1a1aa' : '#64748b';
  const footerBg = isDark ? '#0c0c0e' : '#f8fafc';
  const footerBorder = isDark ? '#1a1a20' : '#f1f5f9';
  const footerColor = isDark ? '#71717a' : '#64748b';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
      style={{
        position: 'fixed',
        inset: 0,
        background: overlayBg,
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '14vh',
        paddingLeft: '16px',
        paddingRight: '16px',
        zIndex: 10000,
      }}
      onClick={onClose}
    >
      <style>{`
        .command-search-input:focus,
        .command-search-input:focus-visible,
        .command-search-input:active {
          outline: none !important;
          box-shadow: none !important;
          border: none !important;
        }
      `}</style>
      <div
        style={{
          background: cardBg,
          border: `1px solid ${cardBorder}`,
          borderRadius: '20px',
          width: '100%',
          maxWidth: '580px',
          boxShadow: cardShadow,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          transition: 'background 0.2s ease, border-color 0.2s ease',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '16px 20px',
            borderBottom: `1px solid ${searchBorder}`,
          }}
        >
          {/* High-End Vector Search Icon */}
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke={isDark ? '#a1a1aa' : '#64748b'}
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0 }}
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            className="command-search-input"
            placeholder="Type a command or search downloads..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              boxShadow: 'none',
              color: inputColor,
              fontSize: '15px',
              fontWeight: 500,
              fontFamily: 'inherit',
            }}
          />
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              padding: '3px 7px',
              borderRadius: '5px',
              background: escBg,
              color: escColor,
              border: `1px solid ${escBorder}`,
              letterSpacing: '0.04em',
            }}
          >
            ESC
          </span>
        </div>

        {/* Command List with custom smooth transparent scrollbar */}
        <div
          style={{
            maxHeight: '420px',
            overflowY: 'auto',
            padding: '8px',
            scrollbarWidth: 'thin',
            scrollbarColor: isDark ? 'rgba(255, 255, 255, 0.15) transparent' : 'rgba(148, 163, 184, 0.35) transparent',
          }}
        >
          {filtered.length === 0 ? (
            <div style={{ padding: '36px 16px', textAlign: 'center', color: '#71717a', fontSize: '13px' }}>
              No matching commands or downloads found
            </div>
          ) : (
            filtered.map((item, index) => {
              const isSelected = index === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={() => item.perform()}
                  onMouseEnter={() => setSelectedIndex(index)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: '12px',
                    background: isSelected ? itemSelectedBg : 'transparent',
                    cursor: 'pointer',
                    transition: 'all 0.12s ease',
                    marginBottom: '2px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                    {/* High-End Vector Icon Container */}
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '9px',
                        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#f1f5f9',
                        border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: isSelected ? (isDark ? '#ffffff' : '#0f172a') : (isDark ? '#a1a1aa' : '#64748b'),
                        flexShrink: 0,
                        transition: 'all 0.12s ease',
                      }}
                    >
                      {item.icon}
                    </div>
                    <span
                      style={{
                        fontSize: '13.5px',
                        fontWeight: 600,
                        color: isSelected ? itemSelectedColor : itemTextColor,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {item.title}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    {item.badge && (
                      <span
                        className="tabular-nums"
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          color: badgeColor,
                          background: badgeBg,
                          padding: '2px 7px',
                          borderRadius: '5px',
                          border: `1px solid ${badgeBorder}`,
                        }}
                      >
                        {item.badge}
                      </span>
                    )}
                    {item.shortcut && (
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          color: badgeColor,
                          background: badgeBg,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          border: `1px solid ${badgeBorder}`,
                        }}
                      >
                        {item.shortcut}
                      </span>
                    )}
                    {isSelected && (
                      <span style={{ fontSize: '13px', color: itemSelectedColor, marginLeft: '2px' }}>↵</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info & shortcut hints */}
        <div
          style={{
            padding: '10px 18px',
            borderTop: `1px solid ${footerBorder}`,
            background: footerBg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '11.5px',
            color: footerColor,
          }}
        >
          <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>ESC Close</span>
          </div>
          <span style={{ fontWeight: 600 }}>AuraDrop Quick Navigation (⌘K)</span>
        </div>
      </div>
    </div>
  );
};
