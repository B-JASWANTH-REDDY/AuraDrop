import React, { useState, useEffect, useRef } from 'react';
import { PeerDevice, ChatMessage } from '../types';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Send, Image as ImageIcon, X, MessageSquare, Maximize2 } from 'lucide-react';
import { HardwareLaptopIcon, HardwarePhoneIcon } from './DeviceShelf';

interface ChatModalProps {
  peer: PeerDevice;
  onClose: () => void;
  onSendFile: (peer: PeerDevice) => void;
}

export const playMessageChime = () => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12); // A5
    gain.gain.setValueAtTime(0.20, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.36);
  } catch (e) {
    console.warn('Audio chime notice:', e);
  }
};

export const ChatModal: React.FC<ChatModalProps> = ({ peer, onClose }) => {
  // Load initially from localStorage for instant offline access
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem(`auradrop_chat_${peer.id}`) || (peer.ip ? localStorage.getItem(`auradrop_chat_${peer.ip}`) : null);
      if (saved) return JSON.parse(saved);
    } catch (_) {}
    return [];
  });
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const persistMessages = (msgs: ChatMessage[]) => {
    try {
      localStorage.setItem(`auradrop_chat_${peer.id}`, JSON.stringify(msgs));
      if (peer.ip) localStorage.setItem(`auradrop_chat_${peer.ip}`, JSON.stringify(msgs));
    } catch (_) {}
  };

  // Load chat history and listen for live incoming messages
  useEffect(() => {
    // 1. Fetch initial chat history from backend
    invoke<ChatMessage[]>('get_chat_history', { peerId: peer.id })
      .then((hist) => {
        if (hist && hist.length > 0) {
          setMessages((prev) => {
            const merged = [...prev];
            for (const m of hist) {
              if (!merged.some((x) => x.id === m.id)) merged.push(m);
            }
            merged.sort((a, b) => a.timestamp - b.timestamp);
            persistMessages(merged);
            return merged;
          });
        }
      })
      .catch((err) => console.error('Failed to load chat history:', err));

    // 2. Listen for incoming chat messages
    const unlistenReceived = listen<ChatMessage>('chat-message-received', (event) => {
      const msg = event.payload;
      if (msg.peerId === peer.id || msg.senderId === peer.id) {
        playMessageChime();
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          const updated = [...prev, msg];
          persistMessages(updated);
          return updated;
        });
      }
    });

    // 3. Listen for outgoing chat messages
    const unlistenSent = listen<ChatMessage>('chat-message-sent', (event) => {
      const msg = event.payload;
      if (msg.peerId === peer.id) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          const updated = [...prev, msg];
          persistMessages(updated);
          return updated;
        });
      }
    });

    return () => {
      unlistenReceived.then((fn) => fn());
      unlistenSent.then((fn) => fn());
    };
  }, [peer.id, peer.ip]);

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async () => {
    const text = inputText.trim();
    if (!text || isSending) return;

    setIsSending(true);
    setInputText('');

    try {
      const sentMsg = await invoke<ChatMessage>('send_chat_message', {
        peerId: peer.id,
        text,
        peerIp: peer.ip,
        peerPort: peer.port,
        peerName: peer.name,
      });
      setMessages((prev) => {
        if (prev.some((m) => m.id === sentMsg.id)) return prev;
        const updated = [...prev, sentMsg];
        persistMessages(updated);
        return updated;
      });
    } catch (err) {
      console.error('Failed to send message:', err);
      setInputText(text);
    } finally {
      setIsSending(false);
    }
  };

  const handleImageSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so user can pick the same file again if desired
    e.target.value = '';

    const reader = new FileReader();
    reader.onload = () => {
      const rawDataUrl = reader.result as string;
      if (!rawDataUrl) return;

      // Downscale & compress to max 1280px / 82% JPEG to eliminate memory blowup and socket stalls
      const img = new Image();
      img.onload = async () => {
        const maxDim = 1280;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, w, h);
        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.82);

        setIsSending(true);
        try {
          const payloadText = `[IMAGE]:${compressedDataUrl}`;
          const sentMsg = await invoke<ChatMessage>('send_chat_message', {
            peerId: peer.id,
            text: payloadText,
            peerIp: peer.ip,
            peerPort: peer.port,
            peerName: peer.name,
          });
          setMessages((prev) => {
            if (prev.some((m) => m.id === sentMsg.id)) return prev;
            const updated = [...prev, sentMsg];
            persistMessages(updated);
            return updated;
          });
        } catch (err) {
          console.error('Failed to send image message:', err);
        } finally {
          setIsSending(false);
        }
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const isAndroid = peer.platform.toLowerCase().includes('android') || peer.platform.toLowerCase().includes('phone');

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl select-none animate-fade-in">
        <div className="w-full max-w-lg h-[540px] bg-neutral-950/90 border border-white/15 rounded-3xl shadow-[0_24px_64px_rgba(0,0,0,0.8)] backdrop-blur-2xl flex flex-col relative overflow-hidden">
          {/* Header */}
          <div className="h-16 border-b border-white/10 px-5 flex items-center justify-between bg-white/[0.03]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center text-white shadow-inner">
                {isAndroid ? <HardwarePhoneIcon className="w-5 h-5" /> : <HardwareLaptopIcon className="w-5 h-5" />}
              </div>
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  {peer.name}
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-white text-black font-bold font-mono">
                    {peer.ip}
                  </span>
                </h3>
                <p className="text-xs text-neutral-400 flex items-center gap-1.5 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  <span>LAN Direct Peer-to-Peer</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="p-2 text-neutral-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors"
                title="Close Chat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages Scroll Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-black/40">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-neutral-500">
                <MessageSquare className="w-8 h-8 mb-2 opacity-40 text-white" />
                <p className="text-xs font-bold text-neutral-300">Direct Encrypted Local Chat</p>
                <p className="text-[11px] text-neutral-500 mt-1 max-w-[260px] leading-relaxed">
                  Messages and photos stream directly between device LAN IP addresses with zero internet dependency.
                </p>
              </div>
            ) : (
              messages.map((msg) => {
                const isImage = msg.text.startsWith('[IMAGE]:') || msg.text.startsWith('data:image/');
                const imageSrc = msg.text.startsWith('[IMAGE]:') ? msg.text.slice(8) : msg.text;

                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${msg.isOutgoing ? 'items-end' : 'items-start'}`}
                  >
                    {isImage ? (
                      <div
                        onClick={() => setPreviewImage(imageSrc)}
                        className={`group relative overflow-hidden rounded-2xl border cursor-pointer transition-transform hover:scale-[1.02] shadow-lg max-w-[260px] ${
                          msg.isOutgoing
                            ? 'border-white/30 bg-white/10'
                            : 'border-white/15 bg-white/5'
                        }`}
                        title="Click to view full photo"
                      >
                        <img
                          src={imageSrc}
                          alt="Shared Photo"
                          className="w-full max-h-56 object-cover rounded-2xl block"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white text-xs font-semibold backdrop-blur-xs">
                          <Maximize2 className="w-4 h-4" />
                          <span>View Full Photo</span>
                        </div>
                      </div>
                    ) : (
                      <div
                        className={`max-w-[78%] px-4 py-2.5 rounded-2xl text-xs font-medium break-words backdrop-blur-md ${
                          msg.isOutgoing
                            ? 'bg-white text-black rounded-br-xs shadow-lg'
                            : 'bg-white/[0.08] border border-white/15 text-white rounded-bl-xs'
                        }`}
                      >
                        {msg.text}
                      </div>
                    )}
                    <span className="text-[10px] text-neutral-500 mt-1 px-1 font-mono">
                      {formatTime(msg.timestamp)}
                    </span>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Bar */}
          <div className="p-3 border-t border-white/10 bg-white/[0.02] flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              className="hidden"
              onChange={handleImageSelected}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              title="Send Photo (Inline Chat)"
              disabled={isSending}
              className="p-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white transition-colors active:scale-95 disabled:opacity-50"
            >
              <ImageIcon className="w-4 h-4" />
            </button>
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Message ${peer.name}...`}
              className="flex-1 bg-white/[0.05] border border-white/15 rounded-xl px-4 py-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-white transition-colors"
            />
            <button
              onClick={handleSendMessage}
              disabled={!inputText.trim() || isSending}
              className="p-2.5 rounded-xl bg-white text-black hover:bg-neutral-200 transition-all disabled:opacity-40 disabled:hover:bg-white shadow-md active:scale-95"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Full-Screen Image Lightbox Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-60 bg-black/95 backdrop-blur-2xl flex items-center justify-center p-6 select-none animate-fade-in"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <img
              src={previewImage}
              alt="Fullscreen Preview"
              className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl border border-white/20"
            />
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute -top-4 -right-4 p-2.5 rounded-full bg-white text-black hover:bg-neutral-200 shadow-xl transition-all active:scale-90"
              title="Close Preview"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
};
