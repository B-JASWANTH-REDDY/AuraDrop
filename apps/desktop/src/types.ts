export interface PeerDevice {
  id: string;
  name: string;
  platform: string;
  ip: string;
  port: number;
  status: string;
  version: string;
  lastSeenMs: number;
  isOnline: boolean;
  connectionState?: string;
}

export interface LocalDeviceInfo {
  deviceId: string;
  deviceName: string;
  platform: string;
  activeIp: string;
  activeInterface: string;
  port: number;
  downloadsDir: string;
}

export interface SelectedFileInfo {
  name: string;
  path: string;
  size: number;
}

export interface TransferProgressPayload {
  transferId: string;
  fileName: string;
  fileSize: number;
  bytesTransferred: number;
  progressPercent: number;
  speedMbps: number;
  etaSeconds: number;
  isIncoming: boolean;
  status:
    | 'transferring' | 'sending' | 'receiving'
    | 'verifying'
    | 'completed' | 'failed' | 'canceled' | 'cancelled'
    | 'awaiting_verification';
  peerName: string;
  error?: string | null;
  filePath?: string | null;
  sasCode?: string | null;
  isFirstContact?: boolean | null;
  // Island-compatible aliases (emitted by some transports)
  totalBytes?: number;
  transferredBytes?: number;
  speedBytesPerSec?: number;
}


export interface ChatMessage {
  id: string;
  peerId: string;
  peerName: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
  isOutgoing: boolean;
}

export interface UpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseNotes: string;
  downloadUrl?: string | null;
  pubDate: string;
}

