import React, { useState, useEffect } from 'react';

interface CookieConsentBannerProps {
  onOpenPolicy: () => void;
}

export const CookieConsentBanner: React.FC<CookieConsentBannerProps> = ({ onOpenPolicy }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    try {
      const consent = localStorage.getItem('auradrop_cookie_consent');
      if (!consent) {
        // Show after a brief delay for smoother initial load
        const timer = setTimeout(() => setIsVisible(true), 800);
        return () => clearTimeout(timer);
      }
    } catch {
      // Ignore localStorage errors
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

  return (
    <aside
      aria-label="Privacy and Cookie Consent"
      style={{
        position: 'fixed',
        bottom: '20px',
        left: '20px',
        right: '20px',
        maxWidth: '560px',
        margin: '0 auto',
        background: '#0d0d11',
        border: '1px solid #27272a',
        borderRadius: '16px',
        padding: '18px 22px',
        zIndex: 9999,
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.05)',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        backdropFilter: 'blur(16px)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        <span style={{ fontSize: '20px' }}>🛡️</span>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#ffffff', marginBottom: '4px' }}>
            Privacy-First Consent (DPDP Act 2023)
          </div>
          <p style={{ fontSize: '12px', color: '#a1a1aa', lineHeight: 1.55, margin: 0 }}>
            AuraDrop uses strictly necessary local storage for peer pairing and your dark/light theme preference. We do <strong>not</strong> use tracking cookies or sell your data.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
        <button
          onClick={onOpenPolicy}
          style={{
            background: 'none',
            border: 'none',
            color: '#60a5fa',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            padding: '4px 0',
            textDecoration: 'underline',
          }}
        >
          View Privacy &amp; Cookie Policy
        </button>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={handleEssentialOnly}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              background: '#1f1f23',
              border: '1px solid #333338',
              color: '#d1d5db',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 0.15s ease',
            }}
          >
            Essential Only
          </button>
          <button
            onClick={handleAccept}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              background: '#ffffff',
              border: 'none',
              color: '#000000',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(255, 255, 255, 0.15)',
            }}
          >
            Accept &amp; Continue
          </button>
        </div>
      </div>
    </aside>
  );
};
