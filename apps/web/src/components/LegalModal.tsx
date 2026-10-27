import React, { useState } from 'react';
import { ModalWrapper } from './Modals';

export type LegalTab = 'privacy' | 'terms' | 'cookies' | 'refund' | 'business';

interface LegalModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: LegalTab;
}

export const LegalModal: React.FC<LegalModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'privacy',
}) => {
  const [activeTab, setActiveTab] = useState<LegalTab>(initialTab);

  React.useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  return (
    <ModalWrapper title="Legal & Compliance Center" isOpen={isOpen} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Navigation Tabs */}
        <div
          style={{
            display: 'flex',
            gap: '6px',
            background: '#18181c',
            padding: '4px',
            borderRadius: '12px',
            border: '1px solid #28282e',
            overflowX: 'auto',
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
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: '8px',
                border: 'none',
                background: activeTab === tab.id ? '#ffffff' : 'transparent',
                color: activeTab === tab.id ? '#000000' : '#8e8e93',
                fontSize: '12px',
                fontWeight: activeTab === tab.id ? 700 : 500,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab 1: Privacy Policy & DPDP Act 2023 */}
        {activeTab === 'privacy' && (
          <div style={{ fontSize: '13px', color: '#d1d5db', lineHeight: 1.65, display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ background: 'rgba(52, 199, 89, 0.1)', border: '1px solid rgba(52, 199, 89, 0.25)', borderRadius: '12px', padding: '12px 16px' }}>
              <strong style={{ color: '#34c759' }}>Digital Personal Data Protection (DPDP) Act 2023 &amp; GDPR Compliant</strong>
              <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#9ca3af' }}>
                AuraDrop is engineered with strict Privacy-by-Design. No file bytes or chat messages ever transit or get saved on our cloud servers.
              </p>
            </div>

            <div>
              <h4 style={{ color: '#ffffff', fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>1. Data Fiduciary &amp; Overview</h4>
              <p>
                AuraDrop (&quot;we&quot;, &quot;us&quot;) operates as a zero-relay, decentralized peer-to-peer file transfer engine. In accordance with the Digital Personal Data Protection Act, 2023 (India) and global privacy benchmarks, we only process the absolute minimum data required to establish direct device connections.
              </p>
            </div>

            <div>
              <h4 style={{ color: '#ffffff', fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>2. Data We Do NOT Collect</h4>
              <ul style={{ paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <li><strong>No File Data:</strong> Files transferred between your devices never pass through or get stored on any cloud server or database.</li>
                <li><strong>No Chat Logs:</strong> Direct peer messages are exchanged over end-to-end encrypted WebRTC DataChannels or local LAN sockets.</li>
                <li><strong>No Tracking / Ad Cookies:</strong> We do not deploy third-party advertising cookies, fingerprinting pixels, or behavioral cross-site trackers.</li>
              </ul>
            </div>

            <div>
              <h4 style={{ color: '#ffffff', fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>3. Ephemeral Signaling Data (Purpose Limitation)</h4>
              <p>
                To discover peers on the same network or pair via 6-digit PIN, our serverless signaling relay temporarily handles:
              </p>
              <ul style={{ paddingLeft: '18px', marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <li>A random ephemeral Device ID (e.g. <code>dev_x89a</code>) and user-chosen device display name.</li>
                <li>Hashed network coordinates (internal IP:port) for local WebRTC candidate negotiation.</li>
                <li>All signaling sessions expire and are purged automatically within 45 seconds of inactivity.</li>
              </ul>
            </div>

            <div>
              <h4 style={{ color: '#ffffff', fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>4. Data Principal Rights &amp; Grievance Redressal</h4>
              <p>
                Under Section 11-14 of the DPDP Act 2023, you have the right to access, correct, and erase any personal data, as well as the right to grievance redressal. Since we maintain zero persistent logs of users or files, any ephemeral pairing token can be revoked instantly by clicking &quot;Revoke Trusted Peers&quot; in Settings.
              </p>
              <p style={{ marginTop: '6px' }}>
                For any privacy questions or data grievance requests, contact our designated Grievance Officer:
                <br />
                <strong>Email:</strong> <a href="mailto:privacy@auradrop.org" style={{ color: '#60a5fa' }}>privacy@auradrop.org</a>
                <br />
                <strong>Response Window:</strong> Within 48 business hours.
              </p>
            </div>
          </div>
        )}

        {/* Tab 2: Terms and Conditions */}
        {activeTab === 'terms' && (
          <div style={{ fontSize: '13px', color: '#d1d5db', lineHeight: 1.65, display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <h4 style={{ color: '#ffffff', fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>1. Agreement to Terms</h4>
              <p>
                By downloading, accessing, or using AuraDrop (via web, Windows desktop, or Android APK), you agree to be bound by these Terms and Conditions and our MIT open-source license.
              </p>
            </div>

            <div>
              <h4 style={{ color: '#ffffff', fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>2. Open Source License (MIT)</h4>
              <p>
                AuraDrop is open-source software licensed under the MIT License. You are free to inspect the source code, verify cryptography and checksums, audit security, and build the binaries locally.
              </p>
            </div>

            <div>
              <h4 style={{ color: '#ffffff', fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>3. Acceptable Use</h4>
              <p>
                You agree not to use AuraDrop to transmit illicit, infringing, or malicious content (malware, viruses, or copyrighted files for which you do not possess the necessary distribution rights). As a decentralized protocol, you retain full and exclusive legal responsibility for all content you transfer.
              </p>
            </div>

            <div>
              <h4 style={{ color: '#ffffff', fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>4. Disclaimer of Warranty &amp; Limitation of Liability</h4>
              <p>
                THE SOFTWARE IS PROVIDED &quot;AS IS&quot;, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
              </p>
            </div>
          </div>
        )}

        {/* Tab 3: Cookies & Storage Policy */}
        {activeTab === 'cookies' && (
          <div style={{ fontSize: '13px', color: '#d1d5db', lineHeight: 1.65, display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <h4 style={{ color: '#ffffff', fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>1. What We Store Locally</h4>
              <p>
                AuraDrop strictly uses browser <code>localStorage</code> solely for essential functionality. We do not use third-party cookies or advertising trackers.
              </p>
            </div>

            <div style={{ background: '#18181c', border: '1px solid #28282e', borderRadius: '12px', padding: '12px' }}>
              <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #28282e', textAlign: 'left', color: '#9ca3af' }}>
                    <th style={{ padding: '6px 8px' }}>Key</th>
                    <th style={{ padding: '6px 8px' }}>Type</th>
                    <th style={{ padding: '6px 8px' }}>Purpose</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid #222' }}>
                    <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>auradrop_theme</td>
                    <td style={{ padding: '6px 8px' }}>Essential</td>
                    <td style={{ padding: '6px 8px' }}>Remembers Dark or Light UI preference</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #222' }}>
                    <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>auradrop_trusted_peers</td>
                    <td style={{ padding: '6px 8px' }}>Essential</td>
                    <td style={{ padding: '6px 8px' }}>Stores locally approved peer public keys</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #222' }}>
                    <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>auradrop_history</td>
                    <td style={{ padding: '6px 8px' }}>Functional</td>
                    <td style={{ padding: '6px 8px' }}>Local transfer logs (never leaves browser)</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>auradrop_consent</td>
                    <td style={{ padding: '6px 8px' }}>Compliance</td>
                    <td style={{ padding: '6px 8px' }}>Remembers your cookie &amp; policy consent</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div>
              <h4 style={{ color: '#ffffff', fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>2. Managing Stored Data</h4>
              <p>
                You can purge all stored state at any time by clearing your browser cache, clicking &quot;Clear Transfer History&quot; in the History tab, or resetting your browser storage.
              </p>
            </div>
          </div>
        )}

        {/* Tab 4: Refund Policy */}
        {activeTab === 'refund' && (
          <div style={{ fontSize: '13px', color: '#d1d5db', lineHeight: 1.65, display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <h4 style={{ color: '#ffffff', fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>1. 100% Free Software</h4>
              <p>
                AuraDrop is 100% free software. There are no paid tiers, no premium lockouts, no subscription fees, and no gated file transfer speeds.
              </p>
            </div>

            <div>
              <h4 style={{ color: '#ffffff', fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>2. Voluntary Sponsorships &amp; Coffees</h4>
              <p>
                Any contributions made via UPI (e.g. <code>9182769225@ybl</code>) or GitHub Sponsors are voluntary donations to help cover open-source hosting, domain maintenance, and TURN relay infrastructure costs.
              </p>
            </div>

            <div>
              <h4 style={{ color: '#ffffff', fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>3. Refund Policy on Voluntary Contributions</h4>
              <p>
                Because donations and coffee sponsorships are voluntary gifts supporting open-source development and are immediately committed to operational costs, they are generally non-refundable. However, if a duplicate transaction occurred in error, please reach out with transaction proof to:
                <br />
                <strong>Support Email:</strong> <a href="mailto:support@auradrop.org" style={{ color: '#60a5fa' }}>support@auradrop.org</a>
              </p>
            </div>
          </div>
        )}

        {/* Tab 5: Business Details & Integrity */}
        {activeTab === 'business' && (
          <div style={{ fontSize: '13px', color: '#d1d5db', lineHeight: 1.65, display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <h4 style={{ color: '#ffffff', fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>Official Project Details</h4>
              <ul style={{ paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <li><strong>Project:</strong> AuraDrop Open Source Peer-to-Peer Engine</li>
                <li><strong>Creator / Maintainer:</strong> B. Jaswanth Reddy</li>
                <li><strong>Repository:</strong> <a href="https://github.com/JACK-AI7/AuraDrop" target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa' }}>github.com/JACK-AI7/AuraDrop</a></li>
                <li><strong>License:</strong> MIT License (Open Source)</li>
                <li><strong>Official Website:</strong> auradrop.org / Vercel Production Deployment</li>
                <li><strong>Contact / Inquiries:</strong> <a href="mailto:contact@auradrop.org" style={{ color: '#60a5fa' }}>contact@auradrop.org</a></li>
              </ul>
            </div>

            <div style={{ background: '#18181c', border: '1px solid #28282e', borderRadius: '12px', padding: '12px' }}>
              <h4 style={{ color: '#ffffff', fontSize: '13px', fontWeight: 700, marginBottom: '4px' }}>Authenticity &amp; Integrity Verification</h4>
              <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>
                We uphold strict authenticity standards: No fake user testimonials, no manipulated speed metrics, and no false encryption claims. All benchmark figures (100+ MB/s on Gigabit Wi-Fi) are verified through automated end-to-end integration test suites available in the open repository.
              </p>
            </div>
          </div>
        )}

        <div style={{ borderTop: '1px solid #28282e', paddingTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 20px',
              borderRadius: '10px',
              border: 'none',
              background: '#ffffff',
              color: '#000000',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            I Understand &amp; Close
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
};
