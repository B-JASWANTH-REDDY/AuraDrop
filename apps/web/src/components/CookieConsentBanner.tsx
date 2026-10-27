import React, { useState, useEffect } from 'react';

interface CookieConsentBannerProps {
  onOpenPolicy: () => void;
  isDark?: boolean;
}

export const CookieConsentBanner: React.FC<CookieConsentBannerProps> = ({ onOpenPolicy, isDark = false }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    try {
      const consent = localStorage.getItem('auradrop_cookie_consent');
      if (!consent) {
        // Show after a brief delay for smooth entrance
        const timer = setTimeout(() => setIsVisible(true), 900);
        return () => clearTimeout(timer);
      }
    } catch {
      // Ignore localStorage issues
    }
  }, []);

  const handleAccept = () => {
    try {
      localStorage.setItem('auradrop_cookie_consent', JSON.stringify({ choice: 'all', timestamp: Date.now() }));
    } catch {}
    setIsVisible(false);
  };

  const handleEssentialOnly = () => {
    try {
      localStorage.setItem('auradrop_cookie_consent', JSON.stringify({ choice: 'essential', timestamp: Date.now() }));
    } catch {}
    setIsVisible(false);
  };

  if (!isVisible) return null;

  const cardBg = isDark ? '#111116' : '#ffffff';
  const borderCol = isDark ? '#27272a' : '#e2e8f0';
  const textHead = isDark ? '#ffffff' : '#0f172a';
  const textBody = isDark ? '#94a3b8' : '#475569';
  const linkCol = isDark ? '#60a5fa' : '#2563eb';
  const btnSecBg = isDark ? '#1c1c22' : '#f8fafc';
  const btnSecBorder = isDark ? '#2e2e38' : '#cbd5e1';
  const btnSecText = isDark ? '#e4e4e7' : '#334155';
  const btnPriBg = isDark ? '#ffffff' : '#0f172a';
  const btnPriText = isDark ? '#000000' : '#ffffff';

  return (
    <aside
      aria-label="Privacy and Cookie Consent"
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        maxWidth: '460px',
        width: 'calc(100vw - 48px)',
        background: cardBg,
        border: `1px solid ${borderCol}`,
        borderRadius: '18px',
        padding: '18px 20px',
        zIndex: 4000,
        boxShadow: isDark
          ? '0 20px 48px -10px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.05)'
          : '0 20px 48px -10px rgba(15, 23, 42, 0.16), 0 0 0 1px rgba(15, 23, 42, 0.04)',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        transition: 'all 0.25s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        <div
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '10px',
            background: isDark ? 'rgba(59, 130, 246, 0.15)' : '#eff6ff',
            border: `1px solid ${isDark ? 'rgba(59, 130, 246, 0.3)' : '#bfdbfe'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            color: isDark ? '#60a5fa' : '#2563eb',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '13.5px', fontWeight: 800, color: textHead, marginBottom: '4px', letterSpacing: '-0.01em' }}>
            Privacy-First Consent (DPDP Act 2023)
          </div>
          <p style={{ fontSize: '12px', color: textBody, lineHeight: 1.55, margin: 0 }}>
            AuraDrop uses strictly necessary local storage for peer pairing and your theme preference. We do <strong>not</strong> use tracking cookies or sell your data.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', paddingTop: '4px', borderTop: `1px solid ${borderCol}` }}>
        <button
          onClick={onOpenPolicy}
          style={{
            background: 'none',
            border: 'none',
            color: linkCol,
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            padding: '4px 0',
            textDecoration: 'underline',
          }}
        >
          Privacy &amp; Cookie Policy
        </button>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={handleEssentialOnly}
            style={{
              padding: '7px 13px',
              borderRadius: '9999px',
              background: btnSecBg,
              border: `1px solid ${btnSecBorder}`,
              color: btnSecText,
              fontSize: '11.5px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            Essential Only
          </button>
          <button
            onClick={handleAccept}
            style={{
              padding: '7px 16px',
              borderRadius: '9999px',
              background: btnPriBg,
              border: 'none',
              color: btnPriText,
              fontSize: '11.5px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
              transition: 'all 0.15s ease',
            }}
          >
            Accept &amp; Continue
          </button>
        </div>
      </div>
    </aside>
  );
};
