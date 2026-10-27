import React, { useState, useEffect, useRef } from 'react';

interface CommandAction {
  id: string;
  title: string;
  category: 'Downloads' | 'Actions' | 'Tools' | 'Legal';
  icon: string;
  badge?: string;
  shortcut?: string;
  perform: () => void;
}

interface CommandMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenDownloads: () => void;
  onOpenPairing: () => void;
  onOpenHistory: () => void;
  onOpenChat: () => void;
  onOpenDiagnostics: () => void;
  onOpenSettings: () => void;
  onOpenLegal: (tab: 'privacy' | 'terms' | 'cookies' | 'refund' | 'business') => void;
  onToggleTheme: () => void;
  isDark: boolean;
}

export const CommandMenu: React.FC<CommandMenuProps> = ({
  isOpen,
  onClose,
  onOpenDownloads,
  onOpenPairing,
  onOpenHistory,
  onOpenChat,
  onOpenDiagnostics,
  onOpenSettings,
  onOpenLegal,
  onToggleTheme,
  isDark,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const actions: CommandAction[] = [
    {
      id: 'dl-win-setup',
      title: 'Download Windows Setup (.exe)',
      category: 'Downloads',
      icon: '🪟',
      badge: '5.96 MB',
      perform: () => {
        window.location.href = '/downloads/AuraDrop-Setup.exe';
        onClose();
      },
    },
    {
      id: 'dl-android',
      title: 'Download Android APK (Direct)',
      category: 'Downloads',
      icon: '🤖',
      badge: '49.5 MB',
      perform: () => {
        window.location.href = '/downloads/AuraDrop-Android.apk';
        onClose();
      },
    },
    {
      id: 'dl-win-msi',
      title: 'Download Windows MSI Package',
      category: 'Downloads',
      icon: '📦',
      badge: '9.25 MB',
      perform: () => {
        window.location.href = '/downloads/AuraDrop-Windows.msi';
        onClose();
      },
    },
    {
      id: 'dl-win-zip',
      title: 'Download Windows Portable ZIP',
      category: 'Downloads',
      icon: '📁',
      badge: '8.42 MB',
      perform: () => {
        window.location.href = '/downloads/AuraDrop-Windows.zip';
        onClose();
      },
    },
    {
      id: 'dl-all',
      title: 'Open Official Downloads Center',
      category: 'Downloads',
      icon: '⬇️',
      perform: () => {
        onOpenDownloads();
        onClose();
      },
    },
    {
      id: 'action-pair',
      title: 'Pair New Device (6-Digit PIN & QR)',
      category: 'Actions',
      icon: '🔗',
      shortcut: 'P',
      perform: () => {
        onOpenPairing();
        onClose();
      },
    },
    {
      id: 'action-chat',
      title: 'Open Peer-to-Peer Chat Hub',
      category: 'Actions',
      icon: '💬',
      shortcut: 'C',
      perform: () => {
        onOpenChat();
        onClose();
      },
    },
    {
      id: 'action-history',
      title: 'View Transfer History & Logs',
      category: 'Tools',
      icon: '📜',
      shortcut: 'H',
      perform: () => {
        onOpenHistory();
        onClose();
      },
    },
    {
      id: 'action-diagnostics',
      title: 'WebRTC Signaling & Transport Diagnostics',
      category: 'Tools',
      icon: '⚡',
      shortcut: 'D',
      perform: () => {
        onOpenDiagnostics();
        onClose();
      },
    },
    {
      id: 'action-theme',
      title: `Switch to ${isDark ? 'Light' : 'Dark'} Mode`,
      category: 'Tools',
      icon: isDark ? '☀️' : '🌙',
      shortcut: 'T',
      perform: () => {
        onToggleTheme();
        onClose();
      },
    },
    {
      id: 'legal-privacy',
      title: 'Privacy Policy & DPDP Act 2023 Compliance',
      category: 'Legal',
      icon: '🛡️',
      perform: () => {
        onOpenLegal('privacy');
        onClose();
      },
    },
    {
      id: 'legal-terms',
      title: 'Terms and Conditions (MIT License)',
      category: 'Legal',
      icon: '📄',
      perform: () => {
        onOpenLegal('terms');
        onClose();
      },
    },
    {
      id: 'legal-cookies',
      title: 'Cookie & Local Storage Policy',
      category: 'Legal',
      icon: '🍪',
      perform: () => {
        onOpenLegal('cookies');
        onClose();
      },
    },
    {
      id: 'legal-refund',
      title: 'Refund & Sponsorship Terms',
      category: 'Legal',
      icon: '☕',
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(16px)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '15vh',
        paddingLeft: '16px',
        paddingRight: '16px',
        zIndex: 10000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#111115',
          border: '1px solid #28282e',
          borderRadius: '20px',
          width: '100%',
          maxWidth: '560px',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.95), 0 0 0 1px rgba(255, 255, 255, 0.08)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
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
            borderBottom: '1px solid #202024',
          }}
        >
          <span style={{ fontSize: '18px', color: '#71717a' }}>🔍</span>
          <input
            ref={inputRef}
            type="text"
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
              color: '#ffffff',
              fontSize: '15px',
              fontFamily: 'inherit',
            }}
          />
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: '4px',
              background: '#24242a',
              color: '#a1a1aa',
              border: '1px solid #33333a',
            }}
          >
            ESC
          </span>
        </div>

        {/* Command List */}
        <div style={{ maxHeight: '380px', overflowY: 'auto', padding: '8px' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: '#71717a', fontSize: '13px' }}>
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
                    padding: '10px 14px',
                    borderRadius: '10px',
                    background: isSelected ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                    cursor: 'pointer',
                    transition: 'background 0.1s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '16px' }}>{item.icon}</span>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: isSelected ? '#ffffff' : '#e4e4e7' }}>
                      {item.title}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {item.badge && (
                      <span
                        className="tabular-nums"
                        style={{
                          fontSize: '11px',
                          color: '#a1a1aa',
                          background: '#1c1c22',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          border: '1px solid #2a2a32',
                        }}
                      >
                        {item.badge}
                      </span>
                    )}
                    {item.shortcut && (
                      <span
                        style={{
                          fontSize: '11px',
                          color: '#71717a',
                          background: '#1c1c22',
                          padding: '2px 6px',
                          borderRadius: '4px',
                        }}
                      >
                        {item.shortcut}
                      </span>
                    )}
                    {isSelected && (
                      <span style={{ fontSize: '12px', color: '#ffffff' }}>↵</span>
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
            padding: '10px 16px',
            borderTop: '1px solid #1a1a20',
            background: '#0c0c0e',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '11px',
            color: '#71717a',
          }}
        >
          <div style={{ display: 'flex', gap: '12px' }}>
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>ESC Close</span>
          </div>
          <span>AuraDrop Command Menu (⌘K)</span>
        </div>
      </div>
    </div>
  );
};
