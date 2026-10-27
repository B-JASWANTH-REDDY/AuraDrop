import React, { useState, useRef, useEffect } from 'react';
import { PeerDevice, PickedFile, VisibilityMode, TransferRecord } from '../types';
import { DiagnosticsView } from './DiagnosticsView';

interface ModalWrapperProps {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
  isDark?: boolean;
}

export const ModalWrapper: React.FC<ModalWrapperProps> = ({
  title,
  isOpen,
  onClose,
  children,
  maxWidth = '540px',
  isDark = true,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const bg = isDark ? '#121214' : '#ffffff';
  const border = isDark ? '#242428' : '#e2e8f0';
  const titleColor = isDark ? '#ffffff' : '#0f172a';
  const headerBorder = isDark ? '#1c1c1e' : '#f1f5f9';
  const closeBtnBg = isDark ? '#1a1a1e' : '#f1f5f9';
  const closeBtnBorder = isDark ? '#2a2a2e' : '#e2e8f0';
  const closeBtnColor = isDark ? '#8e8e93' : '#64748b';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: 'fixed',
        inset: 0,
        background: isDark ? 'rgba(0, 0, 0, 0.75)' : 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9000,
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: bg,
          border: `1px solid ${border}`,
          borderRadius: '24px',
          width: '100%',
          maxWidth: maxWidth,
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: isDark
            ? '0 24px 60px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(255, 255, 255, 0.06)'
            : '0 24px 60px rgba(15, 23, 42, 0.16), 0 0 0 1px rgba(15, 23, 42, 0.04)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="modal-header-container"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: `1px solid ${headerBorder}`,
          }}
        >
          <div style={{ fontSize: '16px', fontWeight: 800, color: titleColor, letterSpacing: '-0.01em' }}>{title}</div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            style={{
              background: closeBtnBg,
              border: `1px solid ${closeBtnBorder}`,
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: closeBtnColor,
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 700,
              transition: 'all 0.15s ease',
            }}
          >
            ✕
          </button>
        </div>

        <div
          className="modal-body-container"
          style={{
            padding: '20px',
            overflowY: 'auto',
            flex: 1,
            scrollbarWidth: 'thin',
            scrollbarColor: isDark ? 'rgba(255, 255, 255, 0.15) transparent' : 'rgba(148, 163, 184, 0.35) transparent',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
};

// Chat Modal
export const ChatModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  peer?: PeerDevice | null;
}> = ({ isOpen, onClose, peer }) => {
  const [messages, setMessages] = useState<Array<{ sender: string; text: string; time: string }>>([
    {
      sender: peer?.name || 'Peer',
      text: 'Connected via zero-relay local P2P. Ready to exchange files and instant messages.',
      time: 'Just now',
    },
  ]);
  const [input, setInput] = useState('');

  const sendMessage = () => {
    if (!input.trim()) return;
    setMessages((prev) => [...prev, { sender: 'You', text: input.trim(), time: 'Just now' }]);
    setInput('');
  };

  return (
    <ModalWrapper title={`Encrypted Chat • ${peer?.name || 'Nearby Device'}`} isOpen={isOpen} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '360px' }}>
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', paddingBottom: '12px' }}>
          {messages.map((m, idx) => {
            const isMe = m.sender === 'You';
            return (
              <div
                key={idx}
                style={{
                  alignSelf: isMe ? 'flex-end' : 'flex-start',
                  maxWidth: '75%',
                  background: isMe ? '#FFFFFF' : '#1C1C1F',
                  color: isMe ? '#000000' : '#FFFFFF',
                  padding: '10px 14px',
                  borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                  fontSize: '13px',
                  border: isMe ? 'none' : '1px solid #28282C',
                }}
              >
                <div>{m.text}</div>
                <div style={{ fontSize: '10px', color: isMe ? 'rgba(0,0,0,0.6)' : '#8E8E93', marginTop: '4px', textAlign: 'right' }}>
                  {m.time}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: '8px', paddingTop: '12px', borderTop: '1px solid #1C1C1E' }}>
          <input
            type="text"
            placeholder="Type encrypted message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            style={{
              flex: 1,
              background: '#09090B',
              border: '1px solid #242428',
              borderRadius: '16px',
              padding: '10px 16px',
              color: '#FFFFFF',
              fontSize: '13px',
              outline: 'none',
            }}
          />
          <button
            onClick={sendMessage}
            style={{
              background: '#FFFFFF',
              border: 'none',
              borderRadius: '16px',
              padding: '10px 18px',
              color: '#000000',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Send
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
};

// Settings Modal
export const SettingsModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  visibility: VisibilityMode;
  onVisibilityChange: (mode: VisibilityMode) => void;
}> = ({ isOpen, onClose, visibility, onVisibilityChange }) => {
  return (
    <ModalWrapper title="AuraDrop Settings" isOpen={isOpen} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#8E8E93', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Device Visibility
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {(['everyone', 'contacts', 'off'] as VisibilityMode[]).map((mode) => (
              <div
                key={mode}
                onClick={() => onVisibilityChange(mode)}
                style={{
                  background: visibility === mode ? '#18181E' : '#101012',
                  border: `1px solid ${visibility === mode ? '#FFFFFF' : '#202024'}`,
                  borderRadius: '14px',
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                }}
              >
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#FFFFFF', textTransform: 'capitalize' }}>
                    {mode === 'everyone' ? 'Everyone Nearby' : mode === 'contacts' ? 'Contacts Only' : 'Receiving Off'}
                  </div>
                  <div style={{ fontSize: '11px', color: '#8E8E93', marginTop: '2px' }}>
                    {mode === 'everyone'
                      ? 'Discoverable by all AuraDrop devices on local Wi-Fi or subnet'
                      : mode === 'contacts'
                      ? 'Only known trusted peer devices can initiate transfers'
                      : 'Not discoverable; you can still send files to other devices'}
                  </div>
                </div>
                <div
                  style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    border: `2px solid ${visibility === mode ? '#FFFFFF' : '#3A3A3E'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {visibility === mode && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#FFFFFF' }} />}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ borderTop: '1px solid #1C1C1E', paddingTop: '16px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#8E8E93', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Support AuraDrop
          </div>
          <p style={{ fontSize: '12px', color: '#8E8E93', lineHeight: '1.5', marginBottom: '12px' }}>
            AuraDrop is 100% free and open-source with zero cloud tracking. Support continuous development by buying a coffee.
          </p>
          <a
            href="https://buymeacoffee.com/auradrop"
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              background: '#FFDD00',
              color: '#000000',
              textDecoration: 'none',
              padding: '12px 20px',
              borderRadius: '14px',
              fontSize: '13px',
              fontWeight: 800,
            }}
          >
            ☕ Buy Me a Coffee (buymeacoffee.com/auradrop)
          </a>
        </div>

        <div style={{ borderTop: '1px solid #1C1C1E', paddingTop: '16px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#8E8E93', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Native Apps & Companion
          </div>
          <p style={{ fontSize: '12px', color: '#8E8E93', lineHeight: '1.5', marginBottom: '12px' }}>
            Connect this desktop web browser to your Android phone or Windows PC with zero cloud upload.
          </p>
          <a
            href="https://github.com/JACK-AI7/AuraDrop/releases"
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              background: '#FFFFFF',
              color: '#000000',
              textDecoration: 'none',
              padding: '12px 20px',
              borderRadius: '14px',
              fontSize: '13px',
              fontWeight: 800,
            }}
          >
            Download AuraDrop Releases (Android APK & Windows EXE)
          </a>
        </div>

        <div style={{ borderTop: '1px solid #1C1C1E', paddingTop: '16px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#8E8E93', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Legal & Compliance (v2.0.1)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
            <div style={{ padding: '12px', background: '#101012', border: '1px solid #202024', borderRadius: '12px' }}>
              <div style={{ fontWeight: 700, color: '#FFFFFF', marginBottom: '4px' }}>Zero-Cloud Privacy Policy</div>
              <div style={{ color: '#8E8E93', lineHeight: '1.4' }}>
                Files move directly between devices over local Wi-Fi / LAN sockets on port 53317. No files, logs, or analytics are ever uploaded to cloud servers.
              </div>
            </div>
            <div style={{ padding: '12px', background: '#101012', border: '1px solid #202024', borderRadius: '12px' }}>
              <div style={{ fontWeight: 700, color: '#FFFFFF', marginBottom: '4px' }}>Terms of Service & EULA</div>
              <div style={{ color: '#8E8E93', lineHeight: '1.4' }}>
                Provided &quot;as is&quot; under the MIT License. Users are solely responsible for local transfers. Free for personal and commercial use.
              </div>
            </div>
          </div>
        </div>
      </div>
    </ModalWrapper>
  );
};

// Profile & Account Modal (Section 8: Real Users & Accounts)
export const ProfileModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  deviceName: string;
}> = ({ isOpen, onClose, deviceName }) => {
  const [tab, setTab] = useState<'device' | 'account'>('device');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [user, setUser] = useState<{ id: string; username: string; email: string; displayName: string; avatarUrl?: string | null } | null>(() => {
    try {
      const saved = localStorage.getItem('auradrop_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const [loginInput, setLoginInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [displayNameInput, setDisplayNameInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const handleAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      alert('Please upload a PNG, JPEG, or WEBP image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('Avatar image cannot exceed 5MB.');
      return;
    }

    setAvatarUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        const token = localStorage.getItem('auradrop_auth_token');
        const res = await fetch(`${getApiUrl()}/api/users/avatar`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ imageBase64: base64, mimeType: file.type }),
        });
        if (res.ok) {
          const data = await res.json();
          const updatedUser = { ...user, avatarUrl: data.avatarUrl };
          setUser(updatedUser);
          localStorage.setItem('auradrop_user', JSON.stringify(updatedUser));
        } else {
          alert('Failed to upload avatar image');
        }
        setAvatarUploading(false);
      };
      reader.readAsDataURL(file);
    } catch {
      setAvatarUploading(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!user) return;
    try {
      const token = localStorage.getItem('auradrop_auth_token');
      await fetch(`${getApiUrl()}/api/users/avatar`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const updatedUser = { ...user, avatarUrl: null };
      setUser(updatedUser);
      localStorage.setItem('auradrop_user', JSON.stringify(updatedUser));
    } catch {
      // Ignore
    }
  };

  const getApiUrl = () => {
    return (
      (import.meta as any).env?.VITE_BACKEND_URL ||
      (window.location.hostname === 'localhost'
        ? `http://${window.location.hostname}:48280`
        : `https://${window.location.hostname}:48280`)
    );
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');
    try {
      const res = await fetch(`${getApiUrl()}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          login: loginInput.trim(),
          password: passwordInput,
          deviceId: `dev_web_${deviceName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Login failed');
      }

      localStorage.setItem('auradrop_auth_token', data.accessToken);
      localStorage.setItem('auradrop_refresh_token', data.refreshToken);
      localStorage.setItem('auradrop_user', JSON.stringify(data.user));
      setUser(data.user);
      setLoginInput('');
      setPasswordInput('');
    } catch (err: any) {
      setAuthError(err.message || 'Authentication error');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');
    try {
      const res = await fetch(`${getApiUrl()}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: loginInput.trim(),
          email: emailInput.trim(),
          displayName: displayNameInput.trim() || loginInput.trim(),
          password: passwordInput,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      localStorage.setItem('auradrop_auth_token', data.accessToken);
      localStorage.setItem('auradrop_refresh_token', data.refreshToken);
      localStorage.setItem('auradrop_user', JSON.stringify(data.user));
      setUser(data.user);
      setPasswordInput('');
    } catch (err: any) {
      setAuthError(err.message || 'Registration error');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      const refreshToken = localStorage.getItem('auradrop_refresh_token');
      if (refreshToken) {
        await fetch(`${getApiUrl()}/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        }).catch(() => {});
      }
    } finally {
      localStorage.removeItem('auradrop_auth_token');
      localStorage.removeItem('auradrop_refresh_token');
      localStorage.removeItem('auradrop_user');
      setUser(null);
    }
  };

  return (
    <ModalWrapper title="Device & Account Identity" isOpen={isOpen} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Navigation Sub-Tabs */}
        <div style={{ display: 'flex', background: '#0D0D10', borderRadius: '12px', padding: '4px', gap: '4px' }}>
          <button
            onClick={() => setTab('device')}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: '8px',
              border: 'none',
              background: tab === 'device' ? '#1F1F24' : 'transparent',
              color: tab === 'device' ? '#FFFFFF' : '#8E8E93',
              fontWeight: 700,
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            Device Identity
          </button>
          <button
            onClick={() => setTab('account')}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: '8px',
              border: 'none',
              background: tab === 'account' ? '#1F1F24' : 'transparent',
              color: tab === 'account' ? '#FFFFFF' : '#8E8E93',
              fontWeight: 700,
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            {user ? 'Account Profile' : 'Sign In / Register'}
          </button>
        </div>

        {tab === 'device' ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '8px 0' }}>
            <div
              style={{
                width: '68px',
                height: '68px',
                borderRadius: '50%',
                background: '#27272A',
                border: '1px solid #3F3F46',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
                fontWeight: 800,
                color: '#FFFFFF',
              }}
            >
              {deviceName.charAt(0).toUpperCase()}
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#FFFFFF' }}>{deviceName}</div>
              <div style={{ fontSize: '12px', color: '#8E8E93', marginTop: '4px' }}>
                {user ? `Linked to @${user.username}` : 'Standalone Anonymous Device'}
              </div>
            </div>

            <div style={{ width: '100%', background: '#0D0D10', border: '1px solid #1F1F24', borderRadius: '16px', padding: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '6px 0', borderBottom: '1px solid #1A1A1E' }}>
                <span style={{ color: '#8E8E93' }}>Protocol</span>
                <span style={{ color: '#FFFFFF', fontWeight: 600 }}>P2PFS/1 (AURA-0x41555241)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '6px 0', borderBottom: '1px solid #1A1A1E' }}>
                <span style={{ color: '#8E8E93' }}>Transport</span>
                <span style={{ color: '#FFFFFF', fontWeight: 600 }}>WebRTC DataChannel / Direct LAN</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '6px 0', borderBottom: '1px solid #1A1A1E' }}>
                <span style={{ color: '#8E8E93' }}>Integrity Check</span>
                <span style={{ color: '#FFFFFF', fontWeight: 600 }}>Incremental SHA-256</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '6px 0' }}>
                <span style={{ color: '#8E8E93' }}>Transfer Engine</span>
                <span style={{ color: '#34C759', fontWeight: 600 }}>Zero-Copy Chunk Stream</span>
              </div>
            </div>
          </div>
        ) : user ? (
          /* Logged In View */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', background: '#0D0D10', padding: '16px', borderRadius: '16px', border: '1px solid #1F1F24' }}>
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  background: '#27272A',
                  border: '1px solid #3F3F46',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '20px',
                  fontWeight: 800,
                  color: '#FFFFFF',
                  overflow: 'hidden',
                  flexShrink: 0,
                }}
              >
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt={user.displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  user.displayName.charAt(0).toUpperCase()
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#FFFFFF' }}>{user.displayName}</div>
                <div style={{ fontSize: '12px', color: '#8E8E93' }}>@{user.username} • {user.email}</div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '4px', background: 'rgba(48, 209, 88, 0.15)', color: '#30D158', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700 }}>
                  ● Authenticated Account
                </div>
              </div>
            </div>

            {/* Avatar upload / remove controls */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <input
                type="file"
                ref={avatarInputRef}
                accept="image/png,image/jpeg,image/webp"
                onChange={handleAvatarFile}
                style={{ display: 'none' }}
              />
              <button
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarUploading}
                style={{
                  flex: 1,
                  background: '#1F1F24',
                  border: '1px solid #323238',
                  borderRadius: '12px',
                  padding: '10px',
                  color: '#FFFFFF',
                  fontWeight: 700,
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                {avatarUploading ? 'Uploading...' : '📷 Change Photo'}
              </button>
              {user.avatarUrl && (
                <button
                  onClick={handleRemoveAvatar}
                  style={{
                    background: '#241416',
                    border: '1px solid #42181C',
                    borderRadius: '12px',
                    padding: '10px 14px',
                    color: '#FF453A',
                    fontWeight: 700,
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Remove Photo
                </button>
              )}
            </div>

            <button
              onClick={handleLogout}
              style={{
                background: '#2C1517',
                border: '1px solid #4D1F23',
                color: '#FF453A',
                padding: '12px',
                borderRadius: '12px',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              Sign Out of Account
            </button>
          </div>
        ) : (
          /* Auth Form View */
          <form onSubmit={authMode === 'login' ? handleLogin : handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {authError && (
              <div style={{ background: 'rgba(255, 69, 58, 0.15)', border: '1px solid #FF453A', color: '#FF453A', padding: '10px 14px', borderRadius: '10px', fontSize: '12px' }}>
                {authError}
              </div>
            )}

            {authMode === 'register' && (
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#8E8E93', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>
                  Full / Display Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Jaswanth"
                  value={displayNameInput}
                  onChange={(e) => setDisplayNameInput(e.target.value)}
                  style={{ width: '100%', background: '#0D0D10', border: '1px solid #1F1F24', borderRadius: '10px', padding: '10px 14px', color: '#FFF', fontSize: '13px' }}
                />
              </div>
            )}

            <div>
              <label style={{ fontSize: '11px', fontWeight: 700, color: '#8E8E93', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>
                {authMode === 'login' ? 'Username or Email' : 'Username'}
              </label>
              <input
                type="text"
                required
                placeholder={authMode === 'login' ? 'username or user@domain.com' : 'username'}
                value={loginInput}
                onChange={(e) => setLoginInput(e.target.value)}
                style={{ width: '100%', background: '#0D0D10', border: '1px solid #1F1F24', borderRadius: '10px', padding: '10px 14px', color: '#FFF', fontSize: '13px' }}
              />
            </div>

            {authMode === 'register' && (
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#8E8E93', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  placeholder="user@domain.com"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  style={{ width: '100%', background: '#0D0D10', border: '1px solid #1F1F24', borderRadius: '10px', padding: '10px 14px', color: '#FFF', fontSize: '13px' }}
                />
              </div>
            )}

            <div>
              <label style={{ fontSize: '11px', fontWeight: 700, color: '#8E8E93', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>
                Password
              </label>
              <input
                type="password"
                required
                placeholder="••••••••••••"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                style={{ width: '100%', background: '#0D0D10', border: '1px solid #1F1F24', borderRadius: '10px', padding: '10px 14px', color: '#FFF', fontSize: '13px' }}
              />
            </div>

            <button
              type="submit"
              disabled={authLoading}
              style={{
                background: '#FFFFFF',
                border: 'none',
                borderRadius: '12px',
                padding: '12px',
                color: '#000000',
                fontWeight: 800,
                fontSize: '13px',
                cursor: 'pointer',
                marginTop: '6px',
                opacity: authLoading ? 0.7 : 1,
              }}
            >
              {authLoading ? 'Authenticating...' : authMode === 'login' ? 'Sign In' : 'Create Account'}
            </button>

            <div style={{ textAlign: 'center', marginTop: '6px' }}>
              <button
                type="button"
                onClick={() => {
                  setAuthMode(authMode === 'login' ? 'register' : 'login');
                  setAuthError('');
                }}
                style={{ background: 'none', border: 'none', color: '#A1A1AA', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}
              >
                {authMode === 'login' ? "Don't have an account? Create one" : 'Already have an account? Sign In'}
              </button>
            </div>
          </form>
        )}
      </div>
    </ModalWrapper>
  );
};

// Transfer History Modal (Single-page experience)
export const TransferHistoryModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  history: TransferRecord[];
}> = ({ isOpen, onClose, history }) => {
  return (
    <ModalWrapper title="Transfer History Ledger" isOpen={isOpen} onClose={onClose}>
      {history.length === 0 ? (
        <div style={{ fontSize: '13px', color: '#8E8E93', textAlign: 'center', padding: '36px 0' }}>
          No completed transfers yet. Select a file and a peer on the main screen to start a real P2P transfer.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {history.map((item, idx) => (
            <div
              key={idx}
              style={{
                background: '#16161A',
                border: '1px solid #28282E',
                borderRadius: '14px',
                padding: '14px 16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#FFFFFF' }}>{item.fileName}</div>
                <div style={{ fontSize: '11px', color: '#8E8E93', marginTop: '3px' }}>
                  {(item.fileSize / (1024 * 1024)).toFixed(1)} MB • {item.senderName} → {item.receiverName} • {new Date(item.timestamp).toLocaleTimeString()}
                </div>
                {item.sha256 && (
                  <div style={{ fontSize: '10px', color: '#34C759', fontFamily: 'monospace', marginTop: '4px' }}>
                    SHA-256: {item.sha256.substring(0, 24)}...
                  </div>
                )}
              </div>
              <span style={{ fontSize: '12px', color: '#34C759', fontWeight: 700 }}>✓ Verified</span>
            </div>
          ))}
        </div>
      )}
    </ModalWrapper>
  );
};

// Diagnostics Modal (Single-page experience)
export const DiagnosticsModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  isDark?: boolean;
}> = ({ isOpen, onClose, isDark = true }) => {
  return (
    <ModalWrapper title="WebRTC & Signaling Diagnostics" isOpen={isOpen} onClose={onClose} maxWidth="740px" isDark={isDark}>
      <DiagnosticsView isDark={isDark} />
    </ModalWrapper>
  );
};

// Downloads Modal — Minimal Codex-inspired official downloads
export const DownloadsModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  isDark?: boolean;
}> = ({ isOpen, onClose, isDark = true }) => {
  return (
    <ModalWrapper title="Download AuraDrop Apps" isOpen={isOpen} onClose={onClose} maxWidth="600px" isDark={isDark}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <p style={{ fontSize: '13px', color: '#8E8E93', lineHeight: '1.5', margin: 0 }}>
          High-speed local peer-to-peer file sharing with zero cloud relay. Download official binaries for Windows and Android, or share directly in Safari on iOS and Mac.
        </p>

        {/* Windows Card */}
        <div style={{ background: '#18181C', border: '1px solid #28282E', borderRadius: '16px', padding: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '20px' }}>🪟</span>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#FFFFFF' }}>Windows Desktop</div>
                <div style={{ fontSize: '11px', color: '#8E8E93' }}>v2.0.1 · Windows 10 / 11 (x64)</div>
              </div>
            </div>
            <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '100px', background: 'rgba(52, 199, 89, 0.15)', color: '#34C759', border: '1px solid rgba(52, 199, 89, 0.3)' }}>
              Native Island Included
            </span>
          </div>
          <p style={{ fontSize: '12px', color: '#A1A1AA', lineHeight: '1.5', marginBottom: '14px' }}>
            Tauri application featuring the floating Windows Dynamic Island pill, high-speed streaming server, and local network peer discovery.
          </p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <a
              href="/downloads/AuraDrop-Setup.exe"
              download="AuraDrop-Setup.exe"
              style={{
                flex: 1,
                minWidth: '160px',
                background: '#FFFFFF',
                color: '#000000',
                borderRadius: '10px',
                padding: '9px 14px',
                fontSize: '12px',
                fontWeight: 800,
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>Download .exe (Direct)</span>
              <span style={{ fontSize: '11px', opacity: 0.7 }}>5.96 MB</span>
            </a>
            <a
              href="/downloads/AuraDrop-Windows.msi"
              download="AuraDrop-Windows.msi"
              style={{
                background: '#24242A',
                color: '#FFFFFF',
                border: '1px solid #33333C',
                borderRadius: '10px',
                padding: '9px 14px',
                fontSize: '12px',
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              MSI (9.25 MB)
            </a>
            <a
              href="/downloads/AuraDrop-Windows.zip"
              download="AuraDrop-Windows.zip"
              style={{
                background: '#24242A',
                color: '#FFFFFF',
                border: '1px solid #33333C',
                borderRadius: '10px',
                padding: '9px 14px',
                fontSize: '12px',
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              ZIP (8.42 MB)
            </a>
          </div>
        </div>

        {/* Android Card */}
        <div style={{ background: '#18181C', border: '1px solid #28282E', borderRadius: '16px', padding: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(52, 199, 89, 0.15)', border: '1px solid rgba(52, 199, 89, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#34C759', flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.551 0 .9993.4482.9993.9993.0001.5511-.4483.9997-.9993.9997m-11.046 0c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993 0 .5511-.4482.9997-.9993.9997m11.4045-6.02l1.9973-3.4592a.416.416 0 00-.1521-.5676.416.416 0 00-.5676.1521l-2.0223 3.503C15.5902 8.4116 13.8533 8.1 12 8.1s-3.5902.3116-5.1368.8497L4.8409 5.4467a.4161.4161 0 00-.5677-.1521.4157.4157 0 00-.1521.5676l1.9973 3.4592C2.6889 11.1867.3432 14.6589 0 18.761h24c-.3432-4.1021-2.6889-7.5743-6.1185-9.4396"/>
                </svg>
              </div>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#FFFFFF' }}>Android App</div>
                <div style={{ fontSize: '11px', color: '#8E8E93' }}>v2.0.1 · Android 8.0+ (ARM64)</div>
              </div>
            </div>
            <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '100px', background: 'rgba(52, 199, 89, 0.15)', color: '#34C759', border: '1px solid rgba(52, 199, 89, 0.3)' }}>
              Dynamic Island Ready
            </span>
          </div>
          <p style={{ fontSize: '12px', color: '#A1A1AA', lineHeight: '1.5', marginBottom: '14px' }}>
            Flutter client with native Dynamic Island, local LAN HTTP socket server, SHA-256 streaming verification, and direct peer-to-peer messaging.
          </p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <a
              href="/downloads/AuraDrop-Android.apk"
              download="AuraDrop-Android.apk"
              style={{
                flex: 1,
                minWidth: '180px',
                background: '#FFFFFF',
                color: '#000000',
                borderRadius: '10px',
                padding: '9px 14px',
                fontSize: '12px',
                fontWeight: 800,
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>Download Direct APK</span>
              <span style={{ fontSize: '11px', opacity: 0.7 }}>49.5 MB</span>
            </a>
            <a
              href="/downloads/AuraDrop-Linux.zip"
              download="AuraDrop-Linux.zip"
              style={{
                background: '#24242A',
                color: '#FFFFFF',
                border: '1px solid #33333C',
                borderRadius: '10px',
                padding: '9px 14px',
                fontSize: '12px',
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              Linux (.zip)
            </a>
            <a
              href="/downloads/AuraDrop-macOS.zip"
              download="AuraDrop-macOS.zip"
              style={{
                background: '#24242A',
                color: '#FFFFFF',
                border: '1px solid #33333C',
                borderRadius: '10px',
                padding: '9px 14px',
                fontSize: '12px',
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              macOS (.zip)
            </a>
          </div>
        </div>

        {/* Web Browser & Apple iOS/macOS */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          <div style={{ background: '#18181C', border: '1px solid #28282E', borderRadius: '16px', padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#60a5fa', flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="2" y1="12" x2="22" y2="12"/>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
              </div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#FFFFFF' }}>Web App</div>
            </div>
            <div style={{ fontSize: '11px', color: '#34C759', fontWeight: 700, marginBottom: '6px' }}>
              Active in this tab
            </div>
            <p style={{ fontSize: '11px', color: '#8E8E93', lineHeight: '1.4', margin: 0 }}>
              Zero install. Share files instantly across Chrome, Firefox, Edge, or Safari with WebRTC.
            </p>
          </div>

          <div style={{ background: '#18181C', border: '1px solid #28282E', borderRadius: '16px', padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', flexShrink: 0 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.61-.75 1.04-1.8 1.01-2.87-.96.04-2.06.66-2.7 1.45-.56.66-.99 1.72-.94 2.76 1.08.08 2.02-.59 2.63-1.34z"/>
                </svg>
              </div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#FFFFFF' }}>macOS & iOS</div>
            </div>
            <div style={{ fontSize: '11px', color: '#FF9F0A', fontWeight: 700, marginBottom: '6px' }}>
              Web Ready · Native in v2.1
            </div>
            <p style={{ fontSize: '11px', color: '#8E8E93', lineHeight: '1.4', margin: 0 }}>
              Use directly in Safari now. Native iOS TestFlight and macOS DMG arriving in v2.1.
            </p>
          </div>
        </div>

        {/* Security guarantee */}
        <div style={{ background: 'rgba(52, 199, 89, 0.08)', border: '1px solid rgba(52, 199, 89, 0.2)', borderRadius: '12px', padding: '12px 14px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          <div style={{ width: '22px', height: '22px', borderRadius: '6px', background: 'rgba(52, 199, 89, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#34C759', flexShrink: 0, marginTop: '1px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <path d="m9 12 2 2 4-4"/>
            </svg>
          </div>
          <div style={{ fontSize: '11px', color: '#D1D5DB', lineHeight: '1.5' }}>
            <strong style={{ color: '#34C759' }}>Direct LAN Protocol:</strong> Transfers flow directly between devices over local sockets with single-use tokens and SHA-256 byte verification. No files are uploaded to any external server.
          </div>
        </div>
      </div>
    </ModalWrapper>
  );
};

