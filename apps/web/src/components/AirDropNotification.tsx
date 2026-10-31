import React, { useState, useEffect } from 'react';
import { TransferProgress } from '../types';

export interface AirDropNotificationProps {
  isOpen: boolean;
  isIncoming?: boolean;
  senderName?: string;
  peerName?: string;
  senderAvatarUrl?: string | null;
  filesCount?: number;
  totalSizeText?: string;
  fileName?: string;
  previewUrl?: string | null;
  onAccept?: () => void;
  onDecline?: () => void;
  onCancel?: () => void;
  transferProgress?: TransferProgress | null;
  onDone?: () => void;
}

/**
 * AirDropNotification
 * Apple AirDrop & Dynamic Island proximity card
 * - Jet-black floating Dynamic Island pill at top of screen
 * - Shimmering fluid iridescent rim glow at the top bezel
 * - Concentric radiating AirDrop waves with device badge overlay
 * - Live real-time stats: byte progress, MB/s speed, ETA, and SHA-256 verification
 * - Bidirectional support: handles both incoming requests and outgoing transfers
 */
export const AirDropNotification: React.FC<AirDropNotificationProps> = ({
  isOpen,
  isIncoming = true,
  senderName,
  peerName: propPeerName,
  senderAvatarUrl,
  filesCount = 1,
  totalSizeText = '',
  fileName,
  previewUrl,
  onAccept,
  onDecline,
  onCancel,
  transferProgress,
  onDone,
}) => {
  const [isRendered, setIsRendered] = useState(isOpen);
  const [isAnimatingIn, setIsAnimatingIn] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsRendered(true);
      requestAnimationFrame(() => {
        setIsAnimatingIn(true);
      });
    } else {
      setIsAnimatingIn(false);
      const timer = setTimeout(() => setIsRendered(false), 380);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isRendered) return null;

  const activePeerName = propPeerName || senderName || 'Nearby Device';
  const currentState = (transferProgress?.state || '').toUpperCase();
  const isTransferring = currentState === 'TRANSFERRING' || currentState === 'VERIFYING';
  const isVerifying = currentState === 'VERIFYING';
  const isCompleted = currentState === 'COMPLETED';
  const isWaiting = currentState === 'WAITING_FOR_ACCEPTANCE' || (!isTransferring && !isCompleted);

  const totalBytes = transferProgress?.fileSize || 0;
  const transferred = transferProgress?.transferredBytes || 0;
  const progressPct =
    totalBytes > 0
      ? Math.min(100, Math.round((transferred / totalBytes) * 100))
      : 0;

  const speedMb = ((transferProgress?.speedBytesPerSec || 0) / (1024 * 1024)).toFixed(1);
  const transferredMb = (transferred / (1024 * 1024)).toFixed(1);
  const totalMb = (totalBytes / (1024 * 1024)).toFixed(1);
  const etaSec = transferProgress?.etaSeconds || 0;

  const initials = activePeerName
    ? activePeerName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .substring(0, 2)
        .toUpperCase()
    : 'AD';

  // Subtitle computation
  let subtitleText = '';
  if (isIncoming) {
    if (isCompleted) {
      subtitleText = `Received ${fileName || 'file'} (${totalSizeText}) from ${activePeerName} ✓`;
    } else if (isVerifying) {
      subtitleText = `Verifying SHA-256 hash checksum...`;
    } else if (isTransferring) {
      subtitleText = `Receiving ${fileName || 'file'} from ${activePeerName}...`;
    } else {
      subtitleText = `${activePeerName} would like to share ${
        filesCount > 1 ? `${filesCount} files` : fileName || '1 file'
      }${totalSizeText ? ` (${totalSizeText})` : ''}`;
    }
  } else {
    // Outgoing
    if (isCompleted) {
      subtitleText = `Sent ${fileName || 'file'} to ${activePeerName} successfully ✓`;
    } else if (isVerifying) {
      subtitleText = `Verifying SHA-256 integrity with ${activePeerName}...`;
    } else if (isTransferring) {
      subtitleText = `Sending ${fileName || 'file'} to ${activePeerName}...`;
    } else {
      subtitleText = `Waiting for ${activePeerName} to accept...`;
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: '12px',
        left: '50%',
        transform: `translateX(-50%) translateY(${isAnimatingIn ? '0px' : '-130px'}) scale(${isAnimatingIn ? '1' : '0.94'})`,
        opacity: isAnimatingIn ? 1 : 0,
        transition: 'all 0.45s cubic-bezier(0.16, 1, 0.3, 1)',
        zIndex: 9999,
        width: 'calc(100% - 24px)',
        maxWidth: '430px',
        pointerEvents: 'auto',
      }}
    >
      {/* Dynamic Island Capsule Container */}
      <div
        style={{
          position: 'relative',
          background: '#000000',
          border: '1px solid rgba(255, 255, 255, 0.14)',
          borderRadius: '34px',
          padding: '16px 20px',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.95), 0 0 1px 1px rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(32px)',
          overflow: 'hidden',
        }}
      >
        {/* Shimmering Top Fluid Rim Glow */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: '12%',
            right: '12%',
            height: '2px',
            background: isCompleted
              ? 'linear-gradient(90deg, rgba(52,199,89,0) 0%, rgba(52,199,89,0.9) 30%, rgba(100,240,130,1) 50%, rgba(52,199,89,0.9) 70%, rgba(52,199,89,0) 100%)'
              : 'linear-gradient(90deg, rgba(255,70,85,0) 0%, rgba(255,75,95,0.9) 30%, rgba(255,160,180,1) 50%, rgba(255,75,95,0.9) 70%, rgba(255,70,85,0) 100%)',
            boxShadow: isCompleted
              ? '0 0 14px 3px rgba(52, 199, 89, 0.85)'
              : '0 0 14px 3px rgba(255, 75, 95, 0.85)',
            filter: 'blur(0.5px)',
          }}
        />

        {/* Top Info Row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {/* Left: Concentric Wave Icon with avatar badge */}
          <div style={{ position: 'relative', width: '48px', height: '48px', flexShrink: 0 }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                background: '#000000',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 17C14.7614 17 17 14.7614 17 12C17 9.23858 14.7614 7 12 7"
                  stroke={isCompleted ? '#34C759' : '#FFFFFF'}
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
                <path
                  d="M12 20C16.4183 20 20 16.4183 20 12C20 7.58172 16.4183 4 12 4"
                  stroke={isCompleted ? '#34C759' : '#FFFFFF'}
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
                <circle cx="12" cy="12" r="2.2" fill={isCompleted ? '#34C759' : '#FFFFFF'} />
              </svg>
            </div>

            {/* Overlapping Profile Avatar Badge */}
            <div
              style={{
                position: 'absolute',
                bottom: '-2px',
                right: '-2px',
                width: '22px',
                height: '22px',
                borderRadius: '50%',
                border: '2px solid #000000',
                background: '#2C2C2E',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {senderAvatarUrl ? (
                <img
                  src={senderAvatarUrl}
                  alt={activePeerName}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <span style={{ fontSize: '9px', fontWeight: 800, color: '#FFFFFF' }}>{initials}</span>
              )}
            </div>
          </div>

          {/* Center: Title & Subtitle */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span
                style={{
                  fontSize: '16px',
                  fontWeight: 700,
                  color: '#FFFFFF',
                  letterSpacing: '-0.3px',
                  lineHeight: 1.2,
                }}
              >
                AirDrop
              </span>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '2px 7px',
                  borderRadius: '9999px',
                  backgroundColor: isIncoming ? 'rgba(56, 189, 248, 0.15)' : 'rgba(52, 199, 89, 0.15)',
                  color: isIncoming ? '#38BDF8' : '#34C759',
                  border: isIncoming ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid rgba(52, 199, 89, 0.3)',
                }}
              >
                {isIncoming ? 'Incoming' : 'Outgoing'}
              </span>
            </div>

            <div
              style={{
                fontSize: '13px',
                color: '#A0A0A5',
                marginTop: '4px',
                lineHeight: 1.25,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {subtitleText}
            </div>
          </div>

          {/* Right: Rounded Square Photo / File Preview Thumbnail */}
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              background: '#1A1A1E',
              border: '1px solid #28282D',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              overflow: 'hidden',
              boxShadow: 'inset 0 0 10px rgba(0, 0, 0, 0.6)',
            }}
          >
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="preview"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  background: isIncoming
                    ? 'linear-gradient(135deg, #1C3048 0%, #0E1B2A 100%)'
                    : 'linear-gradient(135deg, #1C402E 0%, #0E2218 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={isIncoming ? '#5AC8FA' : '#34C759'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="12" y1="18" x2="12" y2="12" />
                  <line x1="9" y1="15" x2="15" y2="15" />
                </svg>
              </div>
            )}
          </div>
        </div>

        {/* Live Transfer Progress State */}
        {isTransferring && (
          <div style={{ marginTop: '14px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '12px',
                color: '#8E8E93',
                marginBottom: '6px',
                fontWeight: 600,
              }}
            >
              <span style={{ color: '#FFFFFF' }}>{progressPct}%</span>
              <span>
                {transferredMb} / {totalMb} MB (
                {speedMb} MB/s
                {etaSec > 0 ? ` · ${etaSec}s left` : ''})
              </span>
            </div>
            <div
              style={{
                width: '100%',
                height: '6px',
                background: '#2C2C2E',
                borderRadius: '3px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${progressPct}%`,
                  background: isVerifying ? '#F59E0B' : '#34C759',
                  borderRadius: '3px',
                  transition: 'width 0.15s ease',
                  boxShadow: isVerifying
                    ? '0 0 10px rgba(245, 158, 11, 0.6)'
                    : '0 0 10px rgba(52, 199, 89, 0.6)',
                }}
              />
            </div>
          </div>
        )}

        {/* Incoming Awaiting Action: [Decline] and [Accept] */}
        {isIncoming && isWaiting && (
          <div style={{ display: 'flex', gap: '12px', marginTop: '14px' }}>
            <button
              onClick={onDecline}
              style={{
                flex: 1,
                height: '44px',
                borderRadius: '22px',
                background: '#2C2C2E',
                border: 'none',
                color: '#FFFFFF',
                fontSize: '15px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'background 0.2s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#3A3A3C')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#2C2C2E')}
            >
              Decline
            </button>
            <button
              onClick={onAccept}
              style={{
                flex: 1,
                height: '44px',
                borderRadius: '22px',
                background: '#FFFFFF',
                border: 'none',
                color: '#000000',
                fontSize: '15px',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(255, 255, 255, 0.25)',
                transition: 'background 0.2s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#E5E5EA')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#FFFFFF')}
            >
              Accept
            </button>
          </div>
        )}

        {/* Active Transferring / Waiting Action: [Cancel Transfer] */}
        {((!isIncoming && isWaiting) || isTransferring) && (
          <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={onCancel || onDecline}
              style={{
                height: '32px',
                padding: '0 16px',
                borderRadius: '16px',
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#EF4444',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239, 68, 68, 0.25)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(239, 68, 68, 0.12)')}
            >
              Cancel Transfer
            </button>
          </div>
        )}

        {/* Completed State Button */}
        {isCompleted && (
          <div style={{ marginTop: '14px' }}>
            <button
              onClick={onDone}
              style={{
                width: '100%',
                height: '44px',
                borderRadius: '22px',
                background: '#34C759',
                border: 'none',
                color: '#FFFFFF',
                fontSize: '15px',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(52, 199, 89, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <span>✓</span>
              <span>{isIncoming ? 'Done • Save / Open Received File' : 'Sent Successfully • Done'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
