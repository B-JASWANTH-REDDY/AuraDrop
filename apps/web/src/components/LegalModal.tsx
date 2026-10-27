import React, { useState } from 'react';
import { ModalWrapper } from './Modals';

export type LegalTab = 'privacy' | 'terms' | 'cookies' | 'refund' | 'business';

interface LegalModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: LegalTab;
  isDark?: boolean;
}

export const LegalModal: React.FC<LegalModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'privacy',
  isDark = false,
}) => {
  const [activeTab, setActiveTab] = useState<LegalTab>(initialTab);

  React.useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  const textPrimary = isDark ? '#f8fafc' : '#0f172a';
  const textMuted = isDark ? '#94a3b8' : '#64748b';
  const borderSubtle = isDark ? '#27272a' : '#e2e8f0';
  const sectionBg = isDark ? '#18181c' : '#f8fafc';
  const tabsBg = isDark ? '#18181c' : '#f1f5f9';

  return (
    <ModalWrapper
      title="Legal & Compliance Center"
      isOpen={isOpen}
      onClose={onClose}
      isDark={isDark}
      maxWidth="680px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        {/* Navigation Tabs */}
        <div
          style={{
            display: 'flex',
            gap: '6px',
            background: tabsBg,
            padding: '4px',
            borderRadius: '12px',
            border: `1px solid ${borderSubtle}`,
            overflowX: 'auto',
            scrollbarWidth: 'none',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {(
            [
              { id: 'privacy', label: 'Privacy (DPDP)' },
              { id: 'terms', label: 'Terms & Conditions' },
              { id: 'cookies', label: 'Cookie Policy' },
              { id: 'refund', label: 'Refund Policy' },
              { id: 'business', label: 'Business Details' },
            ] as const
          ).map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="cursor-pointer"
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: 'none',
                  background: isActive ? (isDark ? '#ffffff' : '#0f172a') : 'transparent',
                  color: isActive ? (isDark ? '#000000' : '#ffffff') : textMuted,
                  fontSize: '12px',
                  fontWeight: isActive ? 700 : 500,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.18s ease',
                  boxShadow: isActive ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab 1: Privacy Policy & DPDP Act 2023 */}
        {activeTab === 'privacy' && (
          <div style={{ fontSize: '13px', color: textMuted, lineHeight: 1.65, display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div
              style={{
                background: isDark ? 'rgba(22, 163, 74, 0.12)' : '#f0fdf4',
                border: `1px solid ${isDark ? 'rgba(22, 163, 74, 0.28)' : '#bbf7d0'}`,
                borderRadius: '12px',
                padding: '14px 16px',
              }}
            >
              <strong style={{ color: '#16a34a', display: 'block', fontSize: '13px', fontWeight: 700 }}>
                Digital Personal Data Protection (DPDP) Act 2023 &amp; GDPR Compliant
              </strong>
              <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: textMuted }}>
                AuraDrop is engineered with strict Privacy-by-Design. No file bytes or chat messages ever transit or get saved on our cloud servers.
              </p>
            </div>

            <div style={{ background: sectionBg, border: `1px solid ${borderSubtle}`, borderRadius: '14px', padding: '16px' }}>
              <h4 style={{ color: textPrimary, fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>1. Data Fiduciary &amp; Overview</h4>
              <p style={{ margin: 0 }}>
                AuraDrop (&quot;we&quot;, &quot;us&quot;) operates as a zero-relay, decentralized peer-to-peer file transfer engine. In accordance with the Digital Personal Data Protection Act, 2023 (India) and global privacy benchmarks, we only process the absolute minimum data required to establish direct device connections.
              </p>
            </div>

            <div style={{ background: sectionBg, border: `1px solid ${borderSubtle}`, borderRadius: '14px', padding: '16px' }}>
              <h4 style={{ color: textPrimary, fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>2. Data We Do NOT Collect</h4>
              <ul style={{ paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '6px', margin: 0 }}>
                <li><strong style={{ color: textPrimary }}>No File Data:</strong> Files transferred between your devices never pass through or get stored on any cloud server or database.</li>
                <li><strong style={{ color: textPrimary }}>No Chat Logs:</strong> Direct peer messages are exchanged over end-to-end encrypted WebRTC DataChannels or local LAN sockets.</li>
                <li><strong style={{ color: textPrimary }}>No Tracking / Ad Cookies:</strong> We do not deploy third-party advertising cookies, fingerprinting pixels, or behavioral cross-site trackers.</li>
              </ul>
            </div>

            <div style={{ background: sectionBg, border: `1px solid ${borderSubtle}`, borderRadius: '14px', padding: '16px' }}>
              <h4 style={{ color: textPrimary, fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>3. Ephemeral Signaling Data (Purpose Limitation)</h4>
              <p style={{ margin: 0 }}>
                To discover peers on the same network or pair via 6-digit PIN, our serverless signaling relay temporarily handles:
              </p>
              <ul style={{ paddingLeft: '18px', marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: 0 }}>
                <li>A random ephemeral Device ID (e.g. <code>dev_x89a</code>) and user-chosen device display name.</li>
                <li>Hashed network coordinates (internal IP:port) for local WebRTC candidate negotiation.</li>
                <li>All signaling sessions expire and are purged automatically within 45 seconds of inactivity.</li>
              </ul>
            </div>

            <div style={{ background: sectionBg, border: `1px solid ${borderSubtle}`, borderRadius: '14px', padding: '16px' }}>
              <h4 style={{ color: textPrimary, fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>4. Data Principal Rights &amp; Grievance Redressal</h4>
              <p style={{ margin: 0 }}>
                Under Section 11-14 of the DPDP Act 2023, you have the right to access, correct, and erase any personal data, as well as the right to grievance redressal. Since we maintain zero persistent logs of users or files, any ephemeral pairing token can be revoked instantly by clicking &quot;Revoke Trusted Peers&quot; in Settings.
              </p>
              <p style={{ marginTop: '8px', marginBottom: 0 }}>
                For any privacy questions or data grievance requests, contact our designated Grievance Officer:
                <br />
                <strong style={{ color: textPrimary }}>Email:</strong> <a href="mailto:privacy@auradrop.org" style={{ color: '#3b82f6' }}>privacy@auradrop.org</a>
                <br />
                <strong style={{ color: textPrimary }}>Response Window:</strong> Within 48 business hours.
              </p>
            </div>
          </div>
        )}

        {/* Tab 2: Terms and Conditions */}
        {activeTab === 'terms' && (
          <div style={{ fontSize: '13px', color: textMuted, lineHeight: 1.65, display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ background: sectionBg, border: `1px solid ${borderSubtle}`, borderRadius: '14px', padding: '16px' }}>
              <h4 style={{ color: textPrimary, fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>1. Agreement to Terms</h4>
              <p style={{ margin: 0 }}>
                By downloading, accessing, or using AuraDrop (via web, Windows desktop, or Android APK), you agree to be bound by these Terms and Conditions and our MIT open-source license.
              </p>
            </div>

            <div style={{ background: sectionBg, border: `1px solid ${borderSubtle}`, borderRadius: '14px', padding: '16px' }}>
              <h4 style={{ color: textPrimary, fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>2. Open Source License (MIT)</h4>
              <p style={{ margin: 0 }}>
                AuraDrop is open-source software licensed under the MIT License. You are free to inspect the source code, verify cryptography and checksums, audit security, and build the binaries locally.
              </p>
            </div>

            <div style={{ background: sectionBg, border: `1px solid ${borderSubtle}`, borderRadius: '14px', padding: '16px' }}>
              <h4 style={{ color: textPrimary, fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>3. Acceptable Use</h4>
              <p style={{ margin: 0 }}>
                You agree not to use AuraDrop to transmit illicit, infringing, or malicious content (malware, viruses, or copyrighted files for which you do not possess the necessary distribution rights). As a decentralized protocol, you retain full and exclusive legal responsibility for all content you transfer.
              </p>
            </div>

            <div style={{ background: sectionBg, border: `1px solid ${borderSubtle}`, borderRadius: '14px', padding: '16px' }}>
              <h4 style={{ color: textPrimary, fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>4. Disclaimer of Warranty &amp; Limitation of Liability</h4>
              <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.6 }}>
                THE SOFTWARE IS PROVIDED &quot;AS IS&quot;, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY.
              </p>
            </div>
          </div>
        )}

        {/* Tab 3: Cookies & Storage Policy */}
        {activeTab === 'cookies' && (
          <div style={{ fontSize: '13px', color: textMuted, lineHeight: 1.65, display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ background: sectionBg, border: `1px solid ${borderSubtle}`, borderRadius: '14px', padding: '16px' }}>
              <h4 style={{ color: textPrimary, fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>1. What We Store Locally</h4>
              <p style={{ margin: 0 }}>
                AuraDrop strictly uses browser <code>localStorage</code> solely for essential functionality. We do not use third-party cookies or advertising trackers.
              </p>
            </div>

            <div style={{ background: sectionBg, border: `1px solid ${borderSubtle}`, borderRadius: '14px', padding: '12px', overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse', minWidth: '380px' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${borderSubtle}`, textAlign: 'left', color: textPrimary }}>
                    <th style={{ padding: '8px 10px', fontWeight: 700 }}>Key</th>
                    <th style={{ padding: '8px 10px', fontWeight: 700 }}>Type</th>
                    <th style={{ padding: '8px 10px', fontWeight: 700 }}>Purpose</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: `1px solid ${borderSubtle}` }}>
                    <td style={{ padding: '8px 10px', fontFamily: 'monospace', color: textPrimary }}>auradrop_theme</td>
                    <td style={{ padding: '8px 10px' }}>Essential</td>
                    <td style={{ padding: '8px 10px' }}>Remembers Dark or Light UI preference</td>
                  </tr>
                  <tr style={{ borderBottom: `1px solid ${borderSubtle}` }}>
                    <td style={{ padding: '8px 10px', fontFamily: 'monospace', color: textPrimary }}>auradrop_trusted_peers</td>
                    <td style={{ padding: '8px 10px' }}>Essential</td>
                    <td style={{ padding: '8px 10px' }}>Stores locally approved peer public keys</td>
                  </tr>
                  <tr style={{ borderBottom: `1px solid ${borderSubtle}` }}>
                    <td style={{ padding: '8px 10px', fontFamily: 'monospace', color: textPrimary }}>auradrop_history</td>
                    <td style={{ padding: '8px 10px' }}>Functional</td>
                    <td style={{ padding: '8px 10px' }}>Local transfer logs (never leaves browser)</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px 10px', fontFamily: 'monospace', color: textPrimary }}>auradrop_consent</td>
                    <td style={{ padding: '8px 10px' }}>Compliance</td>
                    <td style={{ padding: '8px 10px' }}>Remembers your cookie &amp; policy consent</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div style={{ background: sectionBg, border: `1px solid ${borderSubtle}`, borderRadius: '14px', padding: '16px' }}>
              <h4 style={{ color: textPrimary, fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>2. Managing Stored Data</h4>
              <p style={{ margin: 0 }}>
                You can purge all stored state at any time by clearing your browser cache, clicking &quot;Clear Transfer History&quot; in the History tab, or resetting your browser storage.
              </p>
            </div>
          </div>
        )}

        {/* Tab 4: Refund Policy */}
        {activeTab === 'refund' && (
          <div style={{ fontSize: '13px', color: textMuted, lineHeight: 1.65, display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ background: sectionBg, border: `1px solid ${borderSubtle}`, borderRadius: '14px', padding: '16px' }}>
              <h4 style={{ color: textPrimary, fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>1. 100% Free Software</h4>
              <p style={{ margin: 0 }}>
                AuraDrop is 100% free software. There are no paid tiers, no premium lockouts, no subscription fees, and no gated file transfer speeds.
              </p>
            </div>

            <div style={{ background: sectionBg, border: `1px solid ${borderSubtle}`, borderRadius: '14px', padding: '16px' }}>
              <h4 style={{ color: textPrimary, fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>2. Voluntary Sponsorships &amp; Coffees</h4>
              <p style={{ margin: 0 }}>
                Any contributions made via UPI (e.g. <code>9182769225@ybl</code>) or GitHub Sponsors are voluntary donations to help cover open-source hosting, domain maintenance, and TURN relay infrastructure costs.
              </p>
            </div>

            <div style={{ background: sectionBg, border: `1px solid ${borderSubtle}`, borderRadius: '14px', padding: '16px' }}>
              <h4 style={{ color: textPrimary, fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>3. Refund Policy on Voluntary Contributions</h4>
              <p style={{ margin: 0 }}>
                Because donations and coffee sponsorships are voluntary gifts supporting open-source development and are immediately committed to operational costs, they are generally non-refundable. However, if a duplicate transaction occurred in error, please reach out with transaction proof to:
                <br />
                <strong style={{ color: textPrimary }}>Support Email:</strong> <a href="mailto:support@auradrop.org" style={{ color: '#3b82f6' }}>support@auradrop.org</a>
              </p>
            </div>
          </div>
        )}

        {/* Tab 5: Business Details & Integrity */}
        {activeTab === 'business' && (
          <div style={{ fontSize: '13px', color: textMuted, lineHeight: 1.65, display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ background: sectionBg, border: `1px solid ${borderSubtle}`, borderRadius: '14px', padding: '16px' }}>
              <h4 style={{ color: textPrimary, fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>Official Project Details</h4>
              <ul style={{ paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '6px', margin: 0 }}>
                <li><strong style={{ color: textPrimary }}>Project:</strong> AuraDrop Open Source Peer-to-Peer Engine</li>
                <li><strong style={{ color: textPrimary }}>Creator / Maintainer:</strong> B. Jaswanth Reddy</li>
                <li><strong style={{ color: textPrimary }}>Repository:</strong> <a href="https://github.com/JACK-AI7/AuraDrop" target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6' }}>github.com/JACK-AI7/AuraDrop</a></li>
                <li><strong style={{ color: textPrimary }}>License:</strong> MIT License (Open Source)</li>
                <li><strong style={{ color: textPrimary }}>Official Website:</strong> auradrop.org / Vercel Production Deployment</li>
                <li><strong style={{ color: textPrimary }}>Contact / Inquiries:</strong> <a href="mailto:contact@auradrop.org" style={{ color: '#3b82f6' }}>contact@auradrop.org</a></li>
              </ul>
            </div>

            <div style={{ background: sectionBg, border: `1px solid ${borderSubtle}`, borderRadius: '14px', padding: '16px' }}>
              <h4 style={{ color: textPrimary, fontSize: '13px', fontWeight: 700, marginBottom: '4px' }}>Authenticity &amp; Integrity Verification</h4>
              <p style={{ fontSize: '12px', color: textMuted, margin: 0 }}>
                We uphold strict authenticity standards: No fake user testimonials, no manipulated speed metrics, and no false encryption claims. All benchmark figures (100+ MB/s on Gigabit Wi-Fi) are verified through automated end-to-end integration test suites available in the open repository.
              </p>
            </div>
          </div>
        )}

        <div style={{ borderTop: `1px solid ${borderSubtle}`, paddingTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            className="cursor-pointer"
            style={{
              padding: '10px 22px',
              borderRadius: '10px',
              border: 'none',
              background: isDark ? '#ffffff' : '#0f172a',
              color: isDark ? '#000000' : '#ffffff',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'all 0.18s ease',
            }}
          >
            I Understand &amp; Close
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
};
