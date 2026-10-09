import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { LocalDeviceInfo, TransferProgressPayload } from '../types';
import logoImg from '../assets/logo.png';
import upiQrImg from '../assets/upi_qr.png';
import {
  Settings,
  Shield,
  HardDrive,
  Info,
  Coffee,
  Sparkles,
  Heart,
  HelpCircle,
  FileText,
  Check,
  X,
  ExternalLink,
  Moon,
  FolderOpen,
  Trash2,
  Cpu,
  Network,
  History,
  Lock,
  Copy,
  CheckCheck,
} from 'lucide-react';

interface SettingsAndAboutModalProps {
  isOpen: boolean;
  onDismiss: () => void;
  info: LocalDeviceInfo | null;
  onSaveName: (name: string) => void;
  history: TransferProgressPayload[];
  onClearHistory: () => void;
  initialTab?: TabKey;
}

export type TabKey =
  | 'general'
  | 'appearance'
  | 'device'
  | 'security'
  | 'storage'
  | 'history'
  | 'help'
  | 'coffee'
  | 'about'
  | 'privacy'
  | 'terms'
  | 'license'
  | 'thirdparty';

export const SettingsAndAboutModal: React.FC<SettingsAndAboutModalProps> = ({
  isOpen,
  onDismiss,
  info,
  onSaveName,
  history,
  onClearHistory,
  initialTab = 'general',
}) => {
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [deviceName, setDeviceName] = useState(info?.deviceName || '');
  const [reducedMotion, setReducedMotion] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [copiedUpi, setCopiedUpi] = useState(false);

  if (!isOpen || !info) return null;

  const handleSave = () => {
    onSaveName(deviceName);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const handleOpenDownloads = () => {
    invoke('open_downloads_folder').catch(console.error);
  };

  const handleOpenUrl = (url: string) => {
    invoke('open_url', { url }).catch(() => {
      window.open(url, '_blank');
    });
  };

  const menuItems: Array<{ id: TabKey; label: string; icon: React.ReactNode }> = [
    { id: 'general', label: 'General', icon: <Settings className="w-4 h-4" /> },
    { id: 'appearance', label: 'Appearance', icon: <Moon className="w-4 h-4" /> },
    { id: 'device', label: 'Device Info', icon: <Cpu className="w-4 h-4" /> },
    { id: 'security', label: 'Privacy & Security', icon: <Shield className="w-4 h-4" /> },
    { id: 'storage', label: 'Storage & History', icon: <HardDrive className="w-4 h-4" /> },
    { id: 'history', label: 'Transfers', icon: <History className="w-4 h-4" /> },
    { id: 'help', label: 'Help & FAQ', icon: <HelpCircle className="w-4 h-4" /> },
    { id: 'coffee', label: 'Buy Me a Coffee', icon: <Coffee className="w-4 h-4 text-[#FFDD00]" /> },
    { id: 'about', label: 'About AuraDrop', icon: <Info className="w-4 h-4" /> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl select-none">
      <div className="w-full max-w-3xl h-[620px] bg-neutral-950/95 border border-white/15 rounded-3xl shadow-[0_24px_80px_rgba(0,0,0,0.9)] backdrop-blur-3xl flex flex-col overflow-hidden relative">
        {/* Top Header */}
        <div className="h-14 border-b border-white/10 px-6 flex items-center justify-between bg-black/40">
          <div className="flex items-center gap-3">
            <img src={logoImg} alt="AuraDrop" className="w-7 h-7 rounded-xl object-cover border border-white/10" />
            <span className="text-sm font-bold text-white tracking-tight">AuraDrop Settings & System</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/10 text-white/80 border border-white/10">
              v2.0.1 Native
            </span>
          </div>

          <button
            onClick={onDismiss}
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body: Sidebar + Main Panel */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Navigation Sidebar */}
          <div className="w-56 border-r border-white/10 p-3 space-y-1 bg-black/30 overflow-y-auto">
            {menuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                  activeTab === item.id
                    ? 'bg-white text-black shadow-sm font-semibold'
                    : 'text-neutral-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}

            <div className="pt-3 border-t border-white/10 mt-3 space-y-1">
              <span className="px-3 text-[10px] font-semibold tracking-wider text-neutral-500 uppercase">
                Legal & Notices
              </span>
              <button
                onClick={() => setActiveTab('privacy')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs transition-all ${
                  activeTab === 'privacy'
                    ? 'bg-white text-black font-semibold'
                    : 'text-neutral-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Privacy Policy</span>
              </button>
              <button
                onClick={() => setActiveTab('terms')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs transition-all ${
                  activeTab === 'terms'
                    ? 'bg-white text-black font-semibold'
                    : 'text-neutral-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Terms of Service</span>
              </button>
              <button
                onClick={() => setActiveTab('license')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs transition-all ${
                  activeTab === 'license'
                    ? 'bg-white text-black font-semibold'
                    : 'text-neutral-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Software License</span>
              </button>
              <button
                onClick={() => setActiveTab('thirdparty')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs transition-all ${
                  activeTab === 'thirdparty'
                    ? 'bg-white text-black font-semibold'
                    : 'text-neutral-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Third-Party Notices</span>
              </button>
            </div>
          </div>

          {/* Right Content Panel */}
          <div className="flex-1 p-6 overflow-y-auto bg-neutral-950/40">
            {/* GENERAL TAB */}
            {activeTab === 'general' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-base font-bold text-white mb-1">General Settings</h3>
                  <p className="text-xs text-neutral-400">Configure your device presence and file storage preferences.</p>
                </div>

                <div className="p-4 rounded-2xl bg-black border border-white/10 space-y-3">
                  <label className="block text-xs font-semibold text-neutral-300">Device Display Name</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={deviceName}
                      onChange={(e) => setDeviceName(e.target.value)}
                      placeholder="Enter device display name"
                      className="flex-1 px-3 py-2 rounded-xl bg-neutral-900 border border-white/20 text-white text-xs focus:outline-none focus:border-white transition-colors"
                    />
                    <button
                      onClick={handleSave}
                      className="px-4 py-2 rounded-xl bg-white hover:bg-neutral-200 text-black text-xs font-bold transition-all flex items-center gap-1.5"
                    >
                      {savedSuccess ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Check className="w-3.5 h-3.5" />}
                      <span>{savedSuccess ? 'Saved' : 'Save'}</span>
                    </button>
                  </div>
                  <p className="text-[11px] text-neutral-500">
                    This name will appear on nearby devices during LAN discovery beacons.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-black border border-white/10 space-y-3">
                  <label className="block text-xs font-semibold text-neutral-300">Default Downloads Folder</label>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-neutral-900 border border-white/10 text-xs">
                    <span className="font-mono text-neutral-300 truncate max-w-[340px]">{info.downloadsDir}</span>
                    <button
                      onClick={handleOpenDownloads}
                      className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium flex items-center gap-1.5 transition-all"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      <span>Open Folder</span>
                    </button>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-black border border-white/10 flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-semibold text-white">Discovery & Turbo Port</h4>
                    <p className="text-[11px] text-neutral-400">Port 53317 (UDP multicast & TCP stream socket)</p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-mono">
                    LISTENING
                  </span>
                </div>
              </div>
            )}

            {/* APPEARANCE TAB */}
            {activeTab === 'appearance' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-base font-bold text-white mb-1">Appearance & Visuals</h3>
                  <p className="text-xs text-neutral-400">Customize the user interface styling and rendering behavior.</p>
                </div>

                <div className="p-4 rounded-2xl bg-black border border-white/10 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-semibold text-white">Interface Theme</h4>
                      <p className="text-[11px] text-neutral-400">Minimal high-contrast monochromatic style</p>
                    </div>
                    <span className="px-3 py-1 rounded-lg bg-white/10 text-white text-xs font-medium">
                      OLED Dark / Monochrome
                    </span>
                  </div>

                  <div className="border-t border-white/10 pt-4 flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-semibold text-white">Reduced Motion</h4>
                      <p className="text-[11px] text-neutral-400">Diminish heavy 3D globe spinning and background ripples</p>
                    </div>
                    <button
                      onClick={() => setReducedMotion(!reducedMotion)}
                      className={`w-11 h-6 rounded-full transition-colors relative ${
                        reducedMotion ? 'bg-white' : 'bg-neutral-800'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-full transition-transform absolute top-1 ${
                          reducedMotion ? 'bg-black left-6' : 'bg-neutral-400 left-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* DEVICE INFO TAB */}
            {activeTab === 'device' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-base font-bold text-white mb-1">Device & Network Telemetry</h3>
                  <p className="text-xs text-neutral-400">Hardware parameters, physical IP addresses, and socket details.</p>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-black border border-white/10">
                    <span className="text-neutral-400 flex items-center gap-2">
                      <Shield className="w-4 h-4 text-white" /> Device Identifier
                    </span>
                    <span className="font-mono text-white text-[11px] truncate max-w-[260px]">{info.deviceId}</span>
                  </div>

                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-black border border-white/10">
                    <span className="text-neutral-400 flex items-center gap-2">
                      <Network className="w-4 h-4 text-white" /> Physical IPv4 Address
                    </span>
                    <span className="font-mono text-white font-bold">{info.activeIp}</span>
                  </div>

                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-black border border-white/10">
                    <span className="text-neutral-400 flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-white" /> Network Adapter
                    </span>
                    <span className="text-white font-medium truncate max-w-[260px]">{info.activeInterface}</span>
                  </div>

                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-black border border-white/10">
                    <span className="text-neutral-400 flex items-center gap-2">
                      <Network className="w-4 h-4 text-white" /> UDP Multicast Group
                    </span>
                    <span className="font-mono text-white">224.0.0.167:53317</span>
                  </div>

                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-black border border-white/10">
                    <span className="text-neutral-400 flex items-center gap-2">
                      <Network className="w-4 h-4 text-white" /> Direct TCP Socket
                    </span>
                    <span className="font-mono text-white">Port {info.port} (Streaming Socket)</span>
                  </div>
                </div>
              </div>
            )}

            {/* PRIVACY & SECURITY TAB */}
            {activeTab === 'security' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-base font-bold text-white mb-1">Privacy & Security Engine</h3>
                  <p className="text-xs text-neutral-400">Strict local-only network operation with zero cloud dependencies.</p>
                </div>

                <div className="p-4 rounded-2xl bg-black border border-white/10 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                      <Lock className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white">Zero Cloud Guarantee</h4>
                      <p className="text-[11px] text-neutral-400">No servers, no tracking, no external file routing</p>
                    </div>
                  </div>
                  <p className="text-xs text-neutral-300 leading-relaxed">
                    All file transfer traffic streams directly between your local devices over physical TCP sockets. File bytes never traverse third-party cloud servers or external networks.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-black border border-white/10 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-white/10 text-white flex items-center justify-center">
                      <Shield className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white">Hardware Cryptographic Hashes</h4>
                      <p className="text-[11px] text-neutral-400">Automated SHA-256 bit-level verification</p>
                    </div>
                  </div>
                  <p className="text-xs text-neutral-300 leading-relaxed">
                    Every transfer computes a SHA-256 hash on both the sending and receiving hardware to ensure that no file corruption occurred during local Wi-Fi transmission.
                  </p>
                </div>
              </div>
            )}

            {/* STORAGE & HISTORY TAB */}
            {activeTab === 'storage' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-base font-bold text-white mb-1">Storage & Local Records</h3>
                  <p className="text-xs text-neutral-400">Manage received files and local session history.</p>
                </div>

                <div className="p-4 rounded-2xl bg-black border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-semibold text-white">Transfer History Records</h4>
                      <p className="text-[11px] text-neutral-400">{history.length} logged transfer sessions</p>
                    </div>
                    <button
                      onClick={onClearHistory}
                      className="px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs font-medium flex items-center gap-1.5 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Clear History</span>
                    </button>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-black border border-white/10 space-y-2">
                  <h4 className="text-xs font-semibold text-white">Disk Location</h4>
                  <p className="text-xs text-neutral-400 font-mono break-all">{info.downloadsDir}</p>
                  <button
                    onClick={handleOpenDownloads}
                    className="mt-2 px-3 py-1.5 rounded-lg bg-white text-black text-xs font-bold flex items-center gap-1.5"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>Open Downloads in Explorer</span>
                  </button>
                </div>
              </div>
            )}

            {/* TRANSFERS TAB */}
            {activeTab === 'history' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-white">Recent Transfers</h3>
                    <p className="text-xs text-neutral-400">Record of files sent and received via LAN.</p>
                  </div>
                  {history.length > 0 && (
                    <button
                      onClick={onClearHistory}
                      className="text-xs text-neutral-400 hover:text-red-400 transition-colors"
                    >
                      Clear All
                    </button>
                  )}
                </div>

                {history.length === 0 ? (
                  <div className="p-12 text-center text-xs text-neutral-500 border border-dashed border-white/10 rounded-2xl">
                    No files transferred yet. Pick a device and send a file to see records here.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[440px] overflow-y-auto pr-1">
                    {history.map((item, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl bg-black border border-white/10 flex items-center justify-between text-xs"
                      >
                        <div className="truncate max-w-[280px]">
                          <p className="font-medium text-white truncate">{item.fileName}</p>
                          <p className="text-[11px] text-neutral-400">
                            {(item.bytesTransferred / (1024 * 1024)).toFixed(1)} MB • {item.speedMbps.toFixed(1)} MB/s
                          </p>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            item.status === 'completed'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : 'bg-red-500/20 text-red-400 border border-red-500/30'
                          }`}
                        >
                          {item.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* HELP & FAQ TAB */}
            {activeTab === 'help' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-bold text-white mb-1">Help & Troubleshooting</h3>
                  <p className="text-xs text-neutral-400">Common questions and local Wi-Fi connectivity diagnostics.</p>
                </div>

                <div className="p-4 rounded-2xl bg-black border border-white/10 space-y-2">
                  <h4 className="text-xs font-bold text-white">Devices not appearing on radar?</h4>
                  <ul className="text-xs text-neutral-300 space-y-1 list-disc list-inside">
                    <li>Verify both devices are connected to the exact same Wi-Fi router / SSID.</li>
                    <li>Ensure "Client Isolation" or "AP Isolation" is disabled on the router.</li>
                    <li>Verify Windows Firewall allows inbound UDP & TCP traffic on Port 53317.</li>
                    <li>Use the "Scan Subnet" button in the top bar to probe peers directly.</li>
                  </ul>
                </div>

                <div className="p-4 rounded-2xl bg-black border border-white/10 space-y-2">
                  <h4 className="text-xs font-bold text-white">Does AuraDrop need Internet?</h4>
                  <p className="text-xs text-neutral-300">
                    No. AuraDrop functions 100% offline over your local Wi-Fi or mobile hotspot. The wide-area internet can be disconnected without interrupting transfers.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-black border border-white/10 flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-white">Need More Help?</h4>
                    <p className="text-[11px] text-neutral-400">Visit our official repository issue tracker</p>
                  </div>
                  <button
                    onClick={() => handleOpenUrl('https://github.com/JACK-AI7/AuraDrop')}
                    className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-medium flex items-center gap-1.5 transition-all"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open GitHub</span>
                  </button>
                </div>
              </div>
            )}

            {/* BUY ME A COFFEE TAB */}
            {activeTab === 'coffee' && (
              <div className="space-y-5 text-center">
                <div className="w-16 h-16 rounded-2xl bg-[#FFDD00] text-black mx-auto flex items-center justify-center shadow-lg shadow-[#FFDD00]/10">
                  <Coffee className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-white">Support AuraDrop</h3>
                  <p className="text-xs text-neutral-400 mt-1">Direct Contribution • 100% Free & Open-Source</p>
                </div>

                <p className="text-xs text-neutral-300 max-w-md mx-auto leading-relaxed">
                  AuraDrop is built with zero ads, tracking, or cloud surveillance. If this project helps you transfer files effortlessly across Android and PC, consider supporting development directly.
                </p>

                {/* Direct UPI Payment Card with Real QR */}
                <div className="p-4 rounded-2xl bg-black border border-white/10 max-w-md mx-auto space-y-4">
                  <div className="p-3 rounded-xl bg-neutral-900 border border-white/10 inline-block mx-auto">
                    <img
                      src={upiQrImg}
                      alt="Union Bank / PhonePe QR Code - B.JASWANTH REDDY"
                      className="w-44 h-44 object-contain rounded-lg mx-auto"
                    />
                    <div className="mt-2 text-center">
                      <p className="text-[11px] font-bold text-white">Union Bank Of India • PhonePe QR</p>
                      <p className="text-[11px] font-medium text-neutral-400">Payee: B.JASWANTH REDDY</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 bg-neutral-900 border border-white/10 rounded-xl px-4 py-3">
                    <div className="text-left">
                      <span className="text-[10px] uppercase font-bold text-neutral-400 block tracking-wider">
                        Direct UPI ID
                      </span>
                      <span className="text-sm font-mono font-bold text-white select-all">
                        9182769225@ybl
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText('9182769225@ybl');
                        setCopiedUpi(true);
                        setTimeout(() => setCopiedUpi(false), 2000);
                      }}
                      className="px-3.5 py-2 rounded-xl bg-white hover:bg-neutral-200 text-black text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 shadow-md shadow-white/5"
                    >
                      {copiedUpi ? <CheckCheck className="w-3.5 h-3.5 text-black" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedUpi ? 'Copied!' : 'Copy UPI'}</span>
                    </button>
                  </div>

                  <div className="flex items-center justify-center gap-2 text-[11px] text-neutral-400">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span>Scan with PhonePe, Google Pay, Paytm, or BHIM UPI</span>
                  </div>
                </div>

                <div className="flex justify-center gap-3">
                  <div className="flex flex-col items-center justify-center p-3 rounded-2xl bg-neutral-950 border border-white/10 hover:border-white/20 transition-all w-28 gap-1.5 shadow-sm">
                    <Coffee className="w-5 h-5 text-[#FFDD00]" />
                    <span className="block text-xs font-bold text-white">1 Coffee</span>
                    <span className="text-[11px] font-mono text-neutral-400">₹50 / $1</span>
                  </div>
                  <div className="flex flex-col items-center justify-center p-3 rounded-2xl bg-neutral-950 border border-white/10 hover:border-white/20 transition-all w-28 gap-1.5 shadow-sm">
                    <Sparkles className="w-5 h-5 text-amber-400" />
                    <span className="block text-xs font-bold text-white">3 Coffees</span>
                    <span className="text-[11px] font-mono text-neutral-400">₹150 / $3</span>
                  </div>
                  <div className="flex flex-col items-center justify-center p-3 rounded-2xl bg-neutral-950 border border-white/10 hover:border-white/20 transition-all w-28 gap-1.5 shadow-sm">
                    <Heart className="w-5 h-5 text-rose-500 fill-rose-500/20" />
                    <span className="block text-xs font-bold text-white">Supporter</span>
                    <span className="text-[11px] font-mono text-neutral-400">₹500 / $10</span>
                  </div>
                </div>
              </div>
            )}

            {/* ABOUT TAB */}
            {activeTab === 'about' && (
              <div className="space-y-6 text-center">
                <div className="w-20 h-20 rounded-3xl bg-neutral-900 border border-white/20 mx-auto flex items-center justify-center overflow-hidden shadow-2xl">
                  <img src={logoImg} alt="AuraDrop Official Logo" className="w-full h-full object-cover" />
                </div>

                <div>
                  <h3 className="text-xl font-black text-white">AuraDrop Desktop</h3>
                  <p className="text-xs font-mono text-neutral-400 mt-1">Version 2.0.1 (Production Release)</p>
                </div>

                <div className="p-4 rounded-2xl bg-black border border-white/10 text-left space-y-2.5 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-neutral-400">Product</span>
                    <span className="text-white font-medium">AuraDrop for Desktop</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-neutral-400">Version</span>
                    <span className="text-white font-mono">2.0.1 (Build 4)</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-neutral-400">Lead Engineer</span>
                    <span className="text-white font-semibold">B.JASWANTH REDDY</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-neutral-400">Software License</span>
                    <span className="text-white font-mono">MIT Open Source</span>
                  </div>
                </div>

                <div className="flex justify-center gap-2">
                  <button
                    onClick={() => setActiveTab('privacy')}
                    className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white text-xs font-medium"
                  >
                    Privacy Policy
                  </button>
                  <button
                    onClick={() => setActiveTab('terms')}
                    className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white text-xs font-medium"
                  >
                    Terms of Service
                  </button>
                  <button
                    onClick={() => setActiveTab('license')}
                    className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white text-xs font-medium"
                  >
                    MIT License
                  </button>
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-semibold text-white">
                    Built by B.JASWANTH REDDY
                  </p>
                  <p className="text-[11px] text-neutral-400">
                    Copyright © 2026 B.JASWANTH REDDY. All rights reserved.
                  </p>
                </div>
              </div>
            )}

            {/* PRIVACY POLICY TAB */}
            {activeTab === 'privacy' && (
              <div className="space-y-4 text-xs text-neutral-300 leading-relaxed">
                <div>
                  <h3 className="text-base font-bold text-white mb-1">Privacy Policy</h3>
                  <p className="text-[11px] font-mono text-neutral-400">Effective Date: October 9, 2026 • v2.0.1</p>
                </div>

                <p>
                  AuraDrop is built with privacy as an engineering guarantee. We operate under a strict zero-cloud, peer-to-peer (P2P) model.
                </p>

                <h4 className="font-bold text-white text-xs mt-3">1. Zero Cloud Uploads</h4>
                <p>
                  Your files, photos, videos, and messages stream directly from your device to the recipient device over your local network. No file data is ever uploaded to or stored on intermediate cloud servers.
                </p>

                <h4 className="font-bold text-white text-xs mt-3">2. Zero Telemetry & Tracking</h4>
                <p>
                  AuraDrop does not collect telemetry, analytics, IP addresses, or tracking cookies. No external analytics SDKs are incorporated into this application.
                </p>

                <h4 className="font-bold text-white text-xs mt-3">3. Local Network Discovery</h4>
                <p>
                  Device discovery uses local UDP multicast on 224.0.0.167:53317. Discovery packets carry only your chosen device display name and local IP:port and cannot traverse past your local subnet router.
                </p>

                <h4 className="font-bold text-white text-xs mt-3">4. Voluntary Support Donations</h4>
                <p>
                  Voluntary tips via Buy Me a Coffee are processed externally through BuyMeACoffee.com. AuraDrop never collects or retains credit card or payment information.
                </p>
              </div>
            )}

            {/* TERMS OF SERVICE TAB */}
            {activeTab === 'terms' && (
              <div className="space-y-4 text-xs text-neutral-300 leading-relaxed">
                <div>
                  <h3 className="text-base font-bold text-white mb-1">Terms of Service</h3>
                  <p className="text-[11px] font-mono text-neutral-400">Effective Date: October 9, 2026 • v2.0.1</p>
                </div>

                <p>
                  By using AuraDrop, you agree to these Terms. AuraDrop provides local-first file transfer software and does not provide hosted storage or internet relay servers.
                </p>

                <h4 className="font-bold text-white text-xs mt-3">1. Acceptable Use</h4>
                <p>
                  You agree not to use AuraDrop to transfer malware, viruses, or illegal material. You are solely responsible for the content you transmit across your network.
                </p>

                <h4 className="font-bold text-white text-xs mt-3">2. Disclaimer of Warranties</h4>
                <p>
                  AURADROP IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND. THE AUTHORS DO NOT WARRANT UNINTERRUPTED SERVICE OR IMMUNITY FROM LOCAL NETWORK PACKET LOSS.
                </p>

                <h4 className="font-bold text-white text-xs mt-3">3. Limitation of Liability</h4>
                <p>
                  IN NO EVENT SHALL THE AUTHORS BE LIABLE FOR ANY DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES ARISING OUT OF THE USE OF THIS SOFTWARE.
                </p>
              </div>
            )}

            {/* SOFTWARE LICENSE (EULA) TAB */}
            {activeTab === 'license' && (
              <div className="space-y-4 text-xs text-neutral-300 leading-relaxed">
                <div>
                  <h3 className="text-base font-bold text-white mb-1">Software License (MIT)</h3>
                  <p className="text-[11px] font-mono text-neutral-400">Copyright (c) 2026 AuraDrop Contributors</p>
                </div>

                <div className="p-4 rounded-xl bg-black border border-white/10 font-mono text-[11px] space-y-3 leading-relaxed">
                  <p>
                    Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
                  </p>
                  <p>
                    The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
                  </p>
                  <p>
                    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
                  </p>
                </div>
              </div>
            )}

            {/* THIRD-PARTY LICENSES TAB */}
            {activeTab === 'thirdparty' && (
              <div className="space-y-4 text-xs text-neutral-300 leading-relaxed">
                <div>
                  <h3 className="text-base font-bold text-white mb-1">Third-Party Open Source Notices</h3>
                  <p className="text-[11px] text-neutral-400">Gratitude to open source projects powering AuraDrop Desktop:</p>
                </div>

                <div className="space-y-2">
                  {[
                    { name: 'Tauri 2 Framework', lic: 'Apache-2.0 / MIT', desc: 'Secure desktop application runtime' },
                    { name: 'Tokio', lic: 'MIT', desc: 'Asynchronous Rust runtime' },
                    { name: 'Axum', lic: 'MIT', desc: 'High-performance HTTP streaming' },
                    { name: 'Tower HTTP', lic: 'MIT', desc: 'Network middleware components' },
                    { name: 'React & React DOM', lic: 'MIT', desc: 'Component rendering framework' },
                    { name: 'Lucide Icons', lic: 'ISC', desc: 'Vector iconography' },
                    { name: 'Three.js', lic: 'MIT', desc: 'Monochrome 3D globe visualization' },
                    { name: 'Tailwind CSS', lic: 'MIT', desc: 'Utility-first styling system' },
                  ].map((dep, idx) => (
                    <div key={idx} className="p-3 rounded-xl bg-black border border-white/10 flex items-center justify-between">
                      <div>
                        <span className="font-bold text-white">{dep.name}</span>
                        <p className="text-[11px] text-neutral-400">{dep.desc}</p>
                      </div>
                      <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-white/10 text-white">
                        {dep.lic}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
