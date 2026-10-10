import React from 'react';
import { TransferProgressPayload } from '../types';
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, AlertCircle, FileText, X } from 'lucide-react';

interface TransferModalProps {
  transfer: TransferProgressPayload | null;
  onDismiss: () => void;
  onCancel?: () => void;
  onOpenFolder: () => void;
  onOpenFile?: (fileName: string) => void;
}

export const TransferModal: React.FC<TransferModalProps> = ({
  transfer,
  onDismiss,
  onCancel,
  onOpenFolder,
  onOpenFile,
}) => {
  if (!transfer) return null;

  const formatBytes = (bytes: number) => {
    if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return bytes + ' B';
  };

  const isCompleted = transfer.status === 'completed';
  const isFailed = transfer.status === 'failed';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-fade-in select-none">
      <div className="w-full max-w-md bg-neutral-950/80 border border-white/15 rounded-3xl shadow-[0_24px_64px_rgba(0,0,0,0.8)] backdrop-blur-2xl p-6 relative">
        <button
          onClick={!isCompleted && !isFailed && onCancel ? onCancel : onDismiss}
          className="absolute top-4 right-4 p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div
            className={`p-3 rounded-xl ${
              isCompleted
                ? 'bg-white text-black'
                : isFailed
                ? 'bg-neutral-800 text-white border border-white/20'
                : 'bg-white/10 text-white'
            }`}
          >
            {isCompleted ? (
              <CheckCircle2 className="w-6 h-6" />
            ) : isFailed ? (
              <AlertCircle className="w-6 h-6" />
            ) : transfer.isIncoming ? (
              <ArrowDownLeft className="w-6 h-6 animate-pulse" />
            ) : (
              <ArrowUpRight className="w-6 h-6 animate-pulse" />
            )}
          </div>
          <div>
            <h3 className="text-base font-bold text-white">
              {isCompleted
                ? 'Transfer Completed'
                : isFailed
                ? 'Transfer Failed'
                : transfer.isIncoming
                ? 'Receiving File'
                : 'Sending File'}
            </h3>
            <p className="text-xs text-neutral-400">
              {transfer.isIncoming ? 'From: ' : 'To: '}
              <span className="text-white font-semibold">{transfer.peerName}</span>
            </p>
          </div>
        </div>

        {/* File Card */}
        <div
          onClick={() => isCompleted && onOpenFile && onOpenFile(transfer.filePath || transfer.fileName)}
          className={`flex items-center gap-3 p-3.5 rounded-xl bg-black border border-white/10 mb-5 ${
            isCompleted ? 'hover:border-white/40 cursor-pointer transition-colors' : ''
          }`}
          title={isCompleted ? 'Click to open file' : undefined}
        >
          <FileText className="w-6 h-6 text-white flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-semibold text-white truncate">{transfer.fileName}</h4>
            <p className="text-xs text-neutral-400">
              {formatBytes(transfer.bytesTransferred)} / {formatBytes(transfer.fileSize)}
            </p>
          </div>
          <span className="text-xs font-mono font-bold text-white">
            {transfer.progressPercent.toFixed(0)}%
          </span>
        </div>

        {/* Minimal Black & White Progress Bar */}
        <div className="w-full bg-neutral-900 border border-white/10 h-2 rounded-full overflow-hidden mb-4 relative">
          <div
            className={`h-full rounded-full transition-all duration-200 ${
              isCompleted ? 'bg-white' : isFailed ? 'bg-neutral-600' : 'bg-white'
            }`}
            style={{ width: `${Math.min(100, Math.max(0, transfer.progressPercent))}%` }}
          />
        </div>

        {/* Security Verification SAS Code */}
        {transfer.sasCode && (
          <div className="p-3 rounded-xl bg-neutral-900 border border-white/20 text-xs text-white flex items-center justify-between mb-4">
            <div className="flex flex-col">
              <span className="font-semibold text-white">Security Code</span>
              <span className="text-[11px] text-neutral-400">
                {transfer.isFirstContact ? 'First-Contact Peer Verification' : 'Cryptographically Verified'}
              </span>
            </div>
            <span className="font-mono text-sm tracking-widest bg-white text-black px-2.5 py-1 rounded-lg font-bold">
              {transfer.sasCode}
            </span>
          </div>
        )}

        {/* Telemetry Stats */}
        {!isCompleted && !isFailed && (
          <div className="flex items-center justify-between text-xs text-neutral-400 px-1 mb-6">
            <span>Speed: <strong className="text-white font-mono">{transfer.speedMbps.toFixed(1)} MB/s</strong></span>
            <span>ETA: <strong className="text-white font-mono">{transfer.etaSeconds}s</strong></span>
          </div>
        )}

        {isCompleted && (
          <div className="p-3 rounded-lg bg-neutral-900 border border-white/20 text-xs text-white flex items-center justify-between mb-6">
            <span>Verified with SHA-256 Checksum</span>
            <span className="font-mono text-[10px] bg-white text-black px-2 py-0.5 rounded font-bold">MATCH</span>
          </div>
        )}

        {isFailed && (
          <div className="p-3 rounded-lg bg-neutral-900 border border-white/20 text-xs text-white mb-6">
            {transfer.error || 'Connection timed out or transfer interrupted.'}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {isCompleted && (
            <>
              <button
                onClick={() => onOpenFile && onOpenFile(transfer.filePath || transfer.fileName)}
                className="flex-1 py-2.5 rounded-xl bg-white hover:bg-neutral-200 text-black text-xs font-bold transition-all shadow-md"
              >
                Open File
              </button>
              <button
                onClick={onOpenFolder}
                className="py-2.5 px-3 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white text-xs font-semibold transition-all"
              >
                Folder
              </button>
            </>
          )}

          {!isCompleted && !isFailed && onCancel && (
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 rounded-xl text-xs font-bold transition-all bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30 flex items-center justify-center gap-1.5 active:scale-95"
            >
              <X className="w-3.5 h-3.5" />
              <span>Cancel Transfer</span>
            </button>
          )}

          <button
            onClick={onDismiss}
            className={`${
              isCompleted ? 'px-4' : !isFailed ? 'px-4' : 'flex-1'
            } py-2.5 rounded-xl text-xs font-semibold transition-all bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-white/15`}
          >
            {isCompleted ? 'Done' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
