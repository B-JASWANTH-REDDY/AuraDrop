import React, { useState, useEffect } from 'react';
import { PeerDevice } from '../types';
import { ArrowUpRight, CheckCircle2, RefreshCw, PlusCircle, MessageSquare, Star } from 'lucide-react';

interface DeviceShelfProps {
  peers: PeerDevice[];
  selectedPeerId: string | null;
  onSelectPeer: (peer: PeerDevice) => void;
  onSendFiles: (peer: PeerDevice) => void;
  onOpenChat?: (peer: PeerDevice) => void;
  onScanSubnet?: () => void;
  onAddDirectIp?: () => void;
  isScanning?: boolean;
}

// Precision Hardware Vector SVGs matching user specifications
export const HardwareLaptopIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-label="Laptop">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M4 4C2.9 4 2 4.9 2 6V15C2 15.55 2.45 16 3 16H21C21.55 16 22 15.55 22 15V6C22 4.9 21.1 4 20 4H4ZM4.2 6.2H19.8V13.8H4.2V6.2Z"
    />
    <path d="M0.8 17C0.8 18.1 1.7 19 2.8 19H21.2C22.3 19 23.2 18.1 23.2 17C23.2 16.4 22.7 16 22 16H2C1.3 16 0.8 16.4 0.8 17Z" />
  </svg>
);

export const HardwarePhoneIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-label="Phone">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M7 2C5.9 2 5 2.9 5 4V20C5 21.1 5.9 22 7 22H17C18.1 22 19 21.1 19 20V4C19 2.9 18.1 2 17 2H7ZM7 4.5H17V18.5H7V4.5Z"
    />
    <path d="M10.5 20C10.2 20 10 20.2 10 20.5C10 20.8 10.2 21 10.5 21H13.5C13.8 21 14 20.8 14 20.5C14 20.2 13.8 20 13.5 20H10.5Z" />
  </svg>
);

export const DeviceShelf: React.FC<DeviceShelfProps> = ({
  peers,
  selectedPeerId,
  onSelectPeer,
  onSendFiles,
  onOpenChat,
  onScanSubnet,
  onAddDirectIp,
  isScanning = false,
}) => {
  const [savedPeerIds, setSavedPeerIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('auradrop_saved_peers');
      if (stored) return JSON.parse(stored);
    } catch (_) {}
    return [];
  });

  const toggleSavePeer = (e: React.MouseEvent, peer: PeerDevice) => {
    e.stopPropagation();
    setSavedPeerIds((prev) => {
      const isSaved = prev.includes(peer.id) || prev.includes(peer.ip);
      const next = isSaved
        ? prev.filter((id) => id !== peer.id && id !== peer.ip)
        : [...prev, peer.id];
      try {
        localStorage.setItem('auradrop_saved_peers', JSON.stringify(next));
      } catch (_) {}
      return next;
    });
  };

  const getPlatformIcon = (platform: string) => {
    const p = platform.toLowerCase();
    if (p.includes('android') || p.includes('ios') || p.includes('phone') || p.includes('mobile')) {
      return <HardwarePhoneIcon className="w-5 h-5 text-white" />;
    }
    return <HardwareLaptopIcon className="w-5 h-5 text-white" />;
  };

  if (peers.length === 0) {
    return (
      <div className="w-full max-w-xl mx-auto py-3.5 px-6 rounded-2xl bg-neutral-950/80 border border-white/10 text-center backdrop-blur-2xl shadow-[0_16px_40px_rgba(0,0,0,0.6)]">
        <div className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-white/10 text-white mb-2 border border-white/15">
          <HardwarePhoneIcon className="w-4 h-4 animate-pulse" />
        </div>
        <h4 className="text-xs font-bold text-white tracking-wide">Listening for Nearby Devices</h4>
        <p className="text-[11px] text-neutral-400 mt-1 max-w-sm mx-auto leading-relaxed">
          Open AuraDrop on your Android phone or nearby PC on this Wi-Fi network. Real devices appear automatically.
        </p>

        <div className="mt-3 flex items-center justify-center gap-3">
          {onScanSubnet && (
            <button
              onClick={onScanSubnet}
              disabled={isScanning}
              className="px-3.5 py-2 rounded-xl bg-white hover:bg-neutral-200 text-black text-xs font-bold flex items-center gap-2 transition-all shadow-lg active:scale-95 disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${isScanning ? 'animate-spin' : ''}`} />
              {isScanning ? 'Sweeping Subnet...' : 'Scan Subnet Now'}
            </button>
          )}

          {onAddDirectIp && (
            <button
              onClick={onAddDirectIp}
              className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white border border-white/15 text-xs font-semibold flex items-center gap-2 transition-all active:scale-95 backdrop-blur-md"
            >
              <PlusCircle className="w-3 h-3" />
              Direct IP Connect
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-3.5 px-1">
        <h3 className="text-xs font-bold text-neutral-400 tracking-wider uppercase">
          Nearby Devices ({peers.length})
        </h3>
        <div className="flex items-center gap-3">
          {onScanSubnet && (
            <button
              onClick={onScanSubnet}
              disabled={isScanning}
              title="Rescan Local Subnet"
              className="text-[11px] text-neutral-400 hover:text-white flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className={`w-3 h-3 ${isScanning ? 'animate-spin text-white' : ''}`} />
              {isScanning ? 'Scanning...' : 'Rescan'}
            </button>
          )}
          <span className="text-[11px] text-white font-medium flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
            24/7 LAN Active
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {peers
          .filter((peer, index, self) => index === self.findIndex((p) => p.ip === peer.ip || p.id === peer.id))
          .sort((a, b) => {
            const aSaved = savedPeerIds.includes(a.id) || savedPeerIds.includes(a.ip) ? 1 : 0;
            const bSaved = savedPeerIds.includes(b.id) || savedPeerIds.includes(b.ip) ? 1 : 0;
            return bSaved - aSaved;
          })
          .map((peer) => {
            const isSelected = selectedPeerId === peer.id;
            const isSaved = savedPeerIds.includes(peer.id) || savedPeerIds.includes(peer.ip);
            return (
              <div
                key={peer.id}
                onClick={() => onSelectPeer(peer)}
                className={`p-4 rounded-2xl cursor-pointer transition-all duration-300 border relative group backdrop-blur-2xl ${
                  isSelected
                    ? 'bg-white/[0.12] border-white shadow-[0_16px_40px_rgba(255,255,255,0.08)] ring-1 ring-white/50'
                    : 'bg-neutral-900/60 hover:bg-neutral-900/80 border-white/10 hover:border-white/25 shadow-[0_10px_30px_rgba(0,0,0,0.5)]'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2.5 rounded-xl border transition-colors ${
                        isSelected
                          ? 'bg-white text-black border-white shadow-md'
                          : 'bg-white/10 text-white border-white/15'
                      }`}
                    >
                      {isSelected ? (
                        <span className="text-black">{getPlatformIcon(peer.platform)}</span>
                      ) : (
                        getPlatformIcon(peer.platform)
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h4 className="text-sm font-bold text-white group-hover:text-white transition-colors">
                          {peer.name}
                        </h4>
                        {isSaved && <span className="text-[10px] text-amber-400 font-bold">★</span>}
                      </div>
                      <p className="text-[11px] text-neutral-400 mt-0.5 font-mono">
                        {peer.ip}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={(e) => toggleSavePeer(e, peer)}
                      title={isSaved ? "Remove from saved devices" : "Save this device"}
                      className="p-1 rounded-lg hover:bg-white/10 transition-colors"
                    >
                      <Star className={`w-3.5 h-3.5 ${isSaved ? 'text-amber-400 fill-amber-400' : 'text-neutral-500 hover:text-white'}`} />
                    </button>
                    {isSelected ? (
                      <CheckCircle2 className="w-4 h-4 text-white" />
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-white/60" />
                    )}
                  </div>
                </div>

                <div className="mt-3.5 pt-3 border-t border-white/10 flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-400">
                    {peer.platform.toLowerCase().includes('android') ? 'Android Phone' : 'Windows PC'}
                  </span>
                  <div className="flex items-center gap-2">
                    {onOpenChat && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenChat(peer);
                        }}
                        title={`Encrypted chat with ${peer.name}`}
                        className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-1.5 transition-all border border-white/15 active:scale-95"
                      >
                        <MessageSquare className="w-3.5 h-3.5" /> Chat
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSendFiles(peer);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-white hover:bg-neutral-200 text-black text-xs font-bold flex items-center gap-1.5 transition-all shadow-md active:scale-95"
                    >
                      Send <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
};
