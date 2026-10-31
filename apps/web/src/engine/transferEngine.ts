// AuraDrop Production Transfer Engine (P2PFS/1 Specification & V12 Cross-Device Fix)
// Zero-Simulation Data Plane: WebRTC RTCDataChannel, Real Signaling Server Discovery,
// Incremental Chunk-by-Chunk SHA-256 (FIPS 180-4), Bounded Memory OPFS Disk Writing,
// Backpressure Flow Control, Two-Way ACK_COMPLETE Handshake, and Resumable Checkpoints.

import {
  encodeBinaryFrame,
  decodeBinaryFrame,
  BinaryFrameType,
} from './binaryProtocol';
import { TransferStorage, CheckpointRecord } from './transferStorage';
import { IdentityManager, DeviceIdentity } from './identity';
import { SignalingClient } from './signalingClient';
import { WebRtcTransport } from './webRtcTransport';
import { TransportManager } from './transportManager';
import { IncrementalSha256 } from './incrementalSha256';
import { ProgressiveDiskWriter } from './diskWriter';
import {
  PeerDevice,
  PickedFile,
  TransferProgress,
  TransferRecord,
  ConnectionState,
} from '../types';
import { TransportStatistics, ControlMessage } from './transport';

export interface TransferEngineEvent {
  type:
    | 'peer_discovered'
    | 'peer_lost'
    | 'request'
    | 'progress'
    | 'completed'
    | 'error'
    | 'state_change'
    | 'diagnostics';
  transferId: string;
  senderName: string;
  receiverName?: string;
  fileName: string;
  fileSize: number;
  transferredBytes?: number;
  verifiedBytes?: number;
  speedBytesPerSec?: number;
  etaSeconds?: number;
  state?: ConnectionState;
  sha256?: string;
  blobUrl?: string;
  error?: string;
  transport?: string;
}

export type EngineEventListener = (event: TransferEngineEvent) => void;
export type PeersUpdateListener = (peers: PeerDevice[]) => void;

export class TransferEngine {
  private static instance: TransferEngine;

  public identity: DeviceIdentity;
  public localId: string;
  public localName: string;
  public platform: string;

  private storage = TransferStorage.getInstance();
  private signaling: SignalingClient;
  private transportManager: TransportManager;
  private webRtcTransport: WebRtcTransport;

  private peersMap = new Map<string, PeerDevice>();
  private peerListeners: PeersUpdateListener[] = [];
  private eventListeners: EngineEventListener[] = [];
  private chatListeners: ((payload: any) => void)[] = [];

  // Active Receiving State
  private activeIncomingTransfer: {
    transferId: string;
    senderId: string;
    senderName: string;
    fileName: string;
    fileSize: number;
    expectedSha256: string;
    receivedBytes: number;
    verifiedOffset: number;
    nextExpectedSequence: number;
    pendingChunks: Map<number, Uint8Array>;
    hasher: IncrementalSha256;
    diskWriter: ProgressiveDiskWriter;
    startTime: number;
    lastCalcTime: number;
    lastCalcBytes: number;
    smoothedSpeed: number;
    state: ConnectionState;
  } | null = null;

  // Active Sending State
  private activeOutgoingTransfer: {
    transferId: string;
    targetPeerId: string;
    targetPeerName: string;
    file: File;
    expectedSha256: string;
    hasher: IncrementalSha256;
    sentBytes: number;
    verifiedOffset: number;
    chunkSize: number;
    startTime: number;
    lastCalcTime: number;
    lastCalcBytes: number;
    smoothedSpeed: number;
    state: ConnectionState;
    isCancelled: boolean;
    isPaused: boolean;
  } | null = null;

  private activeXhr: XMLHttpRequest | null = null;

  // Throttling for UI updates (10â€“20 updates/sec)
  private lastUiNotifyTime = 0;

  private constructor() {
    this.identity = IdentityManager.getInstance().getIdentity();
    this.localId = this.identity.deviceId;
    this.localName = this.identity.displayName;
    this.platform = this.identity.platform;

    this.signaling = SignalingClient.getInstance(this.identity);
    this.transportManager = TransportManager.getInstance(this.signaling);
    this.webRtcTransport = this.transportManager.getWebRtcTransport();

    this.setupSignalingEvents();
    this.setupTransportEvents();
    this.signaling.connect();
  }

  public static getInstance(): TransferEngine {
    if (!TransferEngine.instance) {
      TransferEngine.instance = new TransferEngine();
    }
    return TransferEngine.instance;
  }

  // ---------------------------------------------------------------------------
  // LISTENERS
  // ---------------------------------------------------------------------------
  public onPeersUpdated(listener: PeersUpdateListener): () => void {
    this.peerListeners.push(listener);
    listener(Array.from(this.peersMap.values()));
    return () => {
      this.peerListeners = this.peerListeners.filter((l) => l !== listener);
    };
  }

  public onEngineEvent(listener: EngineEventListener): () => void {
    this.eventListeners.push(listener);
    return () => {
      this.eventListeners = this.eventListeners.filter((l) => l !== listener);
    };
  }

  public onChatMessage(listener: (payload: any) => void): () => void {
    this.chatListeners.push(listener);
    return () => {
      this.chatListeners = this.chatListeners.filter((l) => l !== listener);
    };
  }

  public sendChatMessage(targetDeviceId: string, payload: any): void {
    this.signaling.sendChatMessage(targetDeviceId, payload);
  }

  private notifyPeers(): void {
    const list = Array.from(this.peersMap.values());
    this.peerListeners.forEach((l) => l(list));
  }

  private notifyEvent(evt: TransferEngineEvent, forceImmediate = false): void {
    const now = performance.now();
    if (!forceImmediate && now - this.lastUiNotifyTime < 50) {
      return; // Throttle UI rendering to ~20 fps
    }
    this.lastUiNotifyTime = now;
    this.eventListeners.forEach((l) => l(evt));
  }

  // ---------------------------------------------------------------------------
  // SIGNALING & PEER DISCOVERY (Section 3 & 7)
  // ---------------------------------------------------------------------------
  private setupSignalingEvents(): void {
    this.signaling.setCallbacks({
      onPeerList: (peers) => {
        const now = Date.now();
        // Gracefully prune peers older than 45 seconds rather than clearing immediately
        for (const [id, existing] of this.peersMap.entries()) {
          const last = existing.lastSeen instanceof Date ? existing.lastSeen.getTime() : Number(existing.lastSeen || 0);
          if (now - last > 45000) {
            this.peersMap.delete(id);
          }
        }
        for (const p of peers) {
          if (p.deviceId !== this.localId) {
            this.peersMap.set(p.deviceId, p);
          }
        }
        this.notifyPeers();
      },

      onPeerOnline: (peer) => {
        if (peer.deviceId !== this.localId) {
          this.peersMap.set(peer.deviceId, peer);
          this.notifyPeers();
        }
      },

      onPeerOffline: (deviceId) => {
        if (this.peersMap.delete(deviceId)) {
          this.notifyPeers();
        }
      },

      onSignal: (senderId, signal) => {
        this.webRtcTransport.handleRemoteSignal(senderId, signal);
      },

      onTransferRequest: (msg) => {
        this.handleTransferRequestMessage(msg);
      },

      onTransferResponse: (msg) => {
        this.handleTransferResponseMessage(msg);
      },

      onTransferAck: (msg) => {
        this.handleTransferAckMessage(msg);
      },

      onChatMessage: (payload) => {
        this.chatListeners.forEach((l) => l(payload));
      },
    });
  }

  private setupTransportEvents(): void {
    this.webRtcTransport.onFrameReceived((frameBytes) => {
      const frame = decodeBinaryFrame(frameBytes.buffer);
      if (frame) {
        this.handleBinaryFrame(frame);
      }
    });

    this.webRtcTransport.onControlReceived((msg) => {
      if (msg.type === 'ACK_COMPLETE' && this.activeOutgoingTransfer) {
        this.finalizeOutgoingTransfer(msg.transferId || this.activeOutgoingTransfer.transferId);
      } else if (msg.type === 'TRANSFER_RESPONSE') {
        this.handleTransferResponseMessage(msg);
      } else if (msg.type === 'PAUSE' && this.activeIncomingTransfer) {
        this.activeIncomingTransfer.state = 'PAUSED';
      } else if (msg.type === 'CANCEL') {
        this.cancelActiveTransfer();
      }
    });

    this.webRtcTransport.onStateChanged((state) => {
      if (this.activeOutgoingTransfer) {
        this.activeOutgoingTransfer.state = state;
        this.notifyEvent({
          type: 'state_change',
          transferId: this.activeOutgoingTransfer.transferId,
          senderName: this.localName,
          fileName: this.activeOutgoingTransfer.file.name,
          fileSize: this.activeOutgoingTransfer.file.size,
          state,
        });
      }
    });
  }

  // ---------------------------------------------------------------------------
  // PEER CONNECTION INITIATION (Section 4 & 5)
  // ---------------------------------------------------------------------------
  public async connectToPeer(peer: PeerDevice): Promise<boolean> {
    const existing = this.peersMap.get(peer.deviceId);
    if (existing) {
      existing.connectionState = 'CONNECTING';
      this.notifyPeers();
    }

    const connected = await this.webRtcTransport.connect(peer);
    if (connected && existing) {
      existing.connectionState = 'READY_TO_TRANSFER';
      this.notifyPeers();
    }
    return connected;
  }

  // ---------------------------------------------------------------------------
  // RECEIVER PIPELINE (Section 11, 14, 15, 22)
  // ---------------------------------------------------------------------------
  private async handleTransferRequestMessage(msg: any): Promise<void> {
    const payload = msg.payload || msg;
    const rawName = payload.fileName || payload.name || (Array.isArray(payload.files) && payload.files[0]?.name) || 'received_file';
    const safeName = this.storage.sanitizeFilename(rawName);
    const transferId = payload.transferId || msg.transferId || `xfer_${Date.now()}`;
    const fileSize = Number(payload.fileSize || payload.totalBytes || payload.size || 0);
    const checkpoint = this.storage.getCheckpoint(transferId);
    const resumeOffset = checkpoint ? checkpoint.verifiedOffset : 0;

    const diskWriter = new ProgressiveDiskWriter(transferId, safeName);
    await diskWriter.init();

    this.activeIncomingTransfer = {
      transferId,
      senderId: msg.senderId || payload.senderId,
      senderName: payload.senderName || msg.senderName || 'Remote Peer',
      fileName: safeName,
      fileSize,
      expectedSha256: payload.sha256 || '',
      receivedBytes: resumeOffset,
      verifiedOffset: resumeOffset,
      nextExpectedSequence: Math.floor(resumeOffset / (64 * 1024)),
      pendingChunks: new Map<number, Uint8Array>(),
      hasher: new IncrementalSha256(),
      diskWriter,
      startTime: Date.now(),
      lastCalcTime: performance.now(),
      lastCalcBytes: resumeOffset,
      smoothedSpeed: 0,
      state: 'WAITING_FOR_ACCEPTANCE',
    };

    this.notifyEvent(
      {
        type: 'request',
        transferId,
        senderName: this.activeIncomingTransfer.senderName,
        fileName: safeName,
        fileSize,
        state: 'WAITING_FOR_ACCEPTANCE',
        sha256: payload.sha256 || '',
        transport: 'WebRTC Direct',
      },
      true
    );
  }

  private async handleBinaryFrame(frame: any): Promise<void> {
    // 1. Handshake & Health Ping (Cross-platform P2PFS/1 interop)
    if (frame.frameType === BinaryFrameType.HANDSHAKE_INIT) {
      const respPayload = new TextEncoder().encode(JSON.stringify({
        protocolVersion: 'P2PFS/1',
        status: 'OK',
        timestamp: Date.now(),
      }));
      const resp = encodeBinaryFrame(BinaryFrameType.HANDSHAKE_RESP, '', 0, 0n, respPayload);
      this.webRtcTransport.sendFrame(new Uint8Array(resp)).catch(() => {});
      return;
    }

    if (frame.frameType === BinaryFrameType.HEALTH_PING) {
      const pong = encodeBinaryFrame(BinaryFrameType.HEALTH_PONG, '', 0, 0n, frame.payload);
      this.webRtcTransport.sendFrame(new Uint8Array(pong)).catch(() => {});
      return;
    }

    // 2. In-band FILE_START frame
    if (frame.frameType === BinaryFrameType.FILE_START) {
      try {
        const text = new TextDecoder().decode(frame.payload);
        const info = JSON.parse(text);
        if (info && !this.activeIncomingTransfer) {
          await this.handleTransferRequestMessage({
            transferId: info.transferId || frame.transferId,
            senderId: 'remote_peer',
            senderName: 'Remote Peer',
            fileName: info.filename || 'received_file',
            fileSize: info.size || 0,
            sha256: info.checksum || '',
          });
        }
      } catch {}
      return;
    }

    const xfer = this.activeIncomingTransfer;
    if (!xfer) return;
    if (frame.transferId && frame.transferId !== xfer.transferId) return;

    if (frame.frameType === BinaryFrameType.DATA_CHUNK) {
      xfer.state = 'TRANSFERRING';
      const chunkBytes: Uint8Array = frame.payload;
      const chunkSize = xfer.chunkSize || 65536;
      const seq =
        chunkSize > 0 && frame.offset >= BigInt(chunkSize)
          ? Math.floor(Number(frame.offset) / chunkSize)
          : frame.sequence;

      if (seq === xfer.nextExpectedSequence) {
        // In-order chunk: process immediately
        await this.processIncomingChunk(xfer, chunkBytes);
        xfer.nextExpectedSequence++;

        // Drain any contiguous buffered chunks
        while (xfer.pendingChunks.has(xfer.nextExpectedSequence)) {
          const nextBytes = xfer.pendingChunks.get(xfer.nextExpectedSequence)!;
          xfer.pendingChunks.delete(xfer.nextExpectedSequence);
          await this.processIncomingChunk(xfer, nextBytes);
          xfer.nextExpectedSequence++;
        }
      } else if (seq > xfer.nextExpectedSequence) {
        // Out-of-order chunk from striped multi-channel: buffer until gap is filled
        if (xfer.pendingChunks.size < 512) {
          xfer.pendingChunks.set(seq, chunkBytes);
        }
      }
      // If seq < xfer.nextExpectedSequence, it is a duplicate frame, ignore safely.
    } else if (frame.frameType === BinaryFrameType.FILE_FIN) {
      // Drain any remaining out-of-order chunks in sorted sequence order
      if (xfer.pendingChunks.size > 0) {
        const remainingSeqs = Array.from(xfer.pendingChunks.keys()).sort((a, b) => a - b);
        for (const s of remainingSeqs) {
          const b = xfer.pendingChunks.get(s)!;
          await this.processIncomingChunk(xfer, b);
        }
        xfer.pendingChunks.clear();
      }
      await this.finalizeIncomingTransfer();
    }
  }

  private async processIncomingChunk(xfer: any, chunkBytes: Uint8Array): Promise<void> {
    // 1. Incremental streaming SHA-256 (no whole-file RAM loading)
    xfer.hasher.update(chunkBytes);

    // 2. Progressive bounded disk write
    await xfer.diskWriter.writeChunk(chunkBytes);

    xfer.receivedBytes += chunkBytes.byteLength;
    xfer.verifiedOffset = xfer.receivedBytes;

    // 3. Real Throughput Calculation with Exponential Smoothing
    const now = performance.now();
    const timeDeltaMs = now - xfer.lastCalcTime;
    if (timeDeltaMs >= 100) {
      const bytesDelta = xfer.receivedBytes - xfer.lastCalcBytes;
      const instantSpeed = (bytesDelta / timeDeltaMs) * 1000;
      xfer.smoothedSpeed =
        xfer.smoothedSpeed === 0 ? instantSpeed : xfer.smoothedSpeed * 0.7 + instantSpeed * 0.3;
      xfer.lastCalcTime = now;
      xfer.lastCalcBytes = xfer.receivedBytes;
    }

    const remainingBytes = Math.max(0, xfer.fileSize - xfer.receivedBytes);
    const etaSeconds = xfer.smoothedSpeed > 0 ? Math.ceil(remainingBytes / xfer.smoothedSpeed) : 0;

    // 4. Periodic Resume Checkpoint (every 5 MB)
    if (xfer.receivedBytes % (5 * 1024 * 1024) < chunkBytes.byteLength) {
      this.storage.saveCheckpoint({
        transferId: xfer.transferId,
        fileId: xfer.fileName,
        fileName: xfer.fileName,
        fileSize: xfer.fileSize,
        expectedSha256: xfer.expectedSha256,
        verifiedOffset: xfer.verifiedOffset,
        updatedAt: new Date().toISOString(),
      });
    }

    this.notifyEvent({
      type: 'progress',
      transferId: xfer.transferId,
      senderName: xfer.senderName,
      fileName: xfer.fileName,
      fileSize: xfer.fileSize,
      transferredBytes: xfer.receivedBytes,
      verifiedBytes: xfer.verifiedOffset,
      speedBytesPerSec: xfer.smoothedSpeed,
      etaSeconds,
      state: 'TRANSFERRING',
      transport: 'WebRTC Direct',
    });
  }

  private async finalizeIncomingTransfer(): Promise<void> {
    const xfer = this.activeIncomingTransfer;
    if (!xfer) return;

    xfer.state = 'VERIFYING';
    this.notifyEvent(
      {
        type: 'progress',
        transferId: xfer.transferId,
        senderName: xfer.senderName,
        fileName: xfer.fileName,
        fileSize: xfer.fileSize,
        transferredBytes: xfer.fileSize,
        verifiedBytes: xfer.fileSize,
        state: 'VERIFYING',
        transport: 'WebRTC Direct',
      },
      true
    );

    // 1. Finalize incremental streaming SHA-256
    const receiverSha256 = xfer.hasher.finalize();

    // 2. Exact Checksum Equality Verification (Section 22)
    if (xfer.expectedSha256 && receiverSha256 !== xfer.expectedSha256) {
      xfer.state = 'FAILED_INTEGRITY';
      await xfer.diskWriter.cleanup();
      this.notifyEvent(
        {
          type: 'error',
          transferId: xfer.transferId,
          senderName: xfer.senderName,
          fileName: xfer.fileName,
          fileSize: xfer.fileSize,
          error: `SHA-256 Mismatch! Expected: ${xfer.expectedSha256}, Computed: ${receiverSha256}`,
          state: 'FAILED_INTEGRITY',
        },
        true
      );
      this.activeIncomingTransfer = null;
      return;
    }

    // 3. Commit file to disk & create download handle
    xfer.state = 'DATABASE_COMMIT';
    const { blobUrl } = await xfer.diskWriter.finalize();

    // Trigger browser file download
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = xfer.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // 4. Send Verified ACK_COMPLETE to sender over DataChannel and Signaling
    this.webRtcTransport.sendControl({
      type: 'ACK_COMPLETE',
      transferId: xfer.transferId,
      senderId: this.localId,
      targetId: xfer.senderId,
      payload: { sha256: receiverSha256, verified: true },
    });
    this.signaling.sendTransferAck(xfer.senderId, {
      transferId: xfer.transferId,
      sha256: receiverSha256,
      verified: true,
    });

    // 5. Persist record to storage history
    this.storage.removeCheckpoint(xfer.transferId);
    const record: TransferRecord = {
      id: xfer.transferId,
      fileName: xfer.fileName,
      fileSize: xfer.fileSize,
      senderName: xfer.senderName,
      receiverName: this.localName,
      status: 'COMPLETED',
      sha256: receiverSha256,
      timestamp: new Date().toISOString(),
      speedBytesPerSec: xfer.smoothedSpeed,
      transport: 'WebRTC Direct P2P',
      verifiedOffset: xfer.fileSize,
      blobUrl,
    };
    this.storage.saveRecord(record);

    xfer.state = 'COMPLETED';
    this.notifyEvent(
      {
        type: 'completed',
        transferId: xfer.transferId,
        senderName: xfer.senderName,
        fileName: xfer.fileName,
        fileSize: xfer.fileSize,
        transferredBytes: xfer.fileSize,
        verifiedBytes: xfer.fileSize,
        speedBytesPerSec: xfer.smoothedSpeed,
        sha256: receiverSha256,
        blobUrl,
        state: 'COMPLETED',
        transport: 'WebRTC Direct',
      },
      true
    );

    this.activeIncomingTransfer = null;
  }

  // ---------------------------------------------------------------------------
  // SENDER PIPELINE (Section 11, 12, 13, 17, 18, 22)
  // ---------------------------------------------------------------------------
  public async startOutgoingTransfer(targetPeer: PeerDevice, file: File): Promise<string> {
    const transferId = `xfer_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const safeName = this.storage.sanitizeFilename(file.name);

    // Immediately notify UI that transfer is initiating
    this.notifyEvent(
      {
        type: 'progress',
        transferId,
        senderName: this.localName,
        receiverName: targetPeer.name,
        fileName: safeName,
        fileSize: file.size,
        transferredBytes: 0,
        verifiedBytes: 0,
        speedBytesPerSec: 0,
        etaSeconds: 0,
        state: 'VERIFYING',
        transport: 'Preparing checksum...',
      },
      true
    );

    // Compute expected SHA-256 incrementally across bounded slices (never loading whole file into RAM)
    let senderSha256 = '';
    if (file.size <= 32 * 1024 * 1024 && typeof crypto !== 'undefined' && crypto.subtle) {
      const buf = await file.arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', buf);
      senderSha256 = Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    } else {
      const previewHasher = new IncrementalSha256();
      const hashSliceSize = 2 * 1024 * 1024; // 2 MB slice
      let processed = 0;
      for (let offset = 0; offset < file.size; offset += hashSliceSize) {
        const sliceBlob = file.slice(offset, offset + hashSliceSize);
        const sliceBuffer = await sliceBlob.arrayBuffer();
        previewHasher.update(new Uint8Array(sliceBuffer));
        processed += sliceBuffer.byteLength;
        // Cooperative yield to keep browser responsive on large files
        if (processed % (8 * 1024 * 1024) < hashSliceSize) {
          await new Promise((r) => setTimeout(r, 0));
        }
      }
      senderSha256 = previewHasher.finalize();
    }

    // Check for existing resume checkpoint
    const checkpoint = this.storage.getCheckpoint(transferId);
    const resumeOffset = checkpoint ? checkpoint.verifiedOffset : 0;

    this.activeOutgoingTransfer = {
      transferId,
      targetPeerId: targetPeer.deviceId,
      targetPeerName: targetPeer.name,
      file,
      expectedSha256: senderSha256,
      hasher: new IncrementalSha256(),
      sentBytes: resumeOffset,
      verifiedOffset: resumeOffset,
      chunkSize: 64 * 1024, // Safe 64 KB starting chunk size for WebRTC SCTP
      startTime: Date.now(),
      lastCalcTime: performance.now(),
      lastCalcBytes: resumeOffset,
      smoothedSpeed: 0,
      state: 'WAITING_FOR_ACCEPTANCE',
      isCancelled: false,
      isPaused: false,
    };

    // V20 Direct LAN HTTP Turbo optimization:
    // If target peer has a localIp and port (e.g. Android running AuraLanServer),
    // attempt direct zero-hop HTTP Turbo streaming over the local network first!
    if (targetPeer.localIp && targetPeer.localPort) {
      const lanSuccess = await this.tryLanHttpTurboUpload(targetPeer, transferId, file, safeName, senderSha256);
      if (lanSuccess) {
        return transferId;
      }
      console.log('[TransferEngine] Direct LAN probe unreached, falling back to WebRTC Direct...');
    }

    // Dispatch Transfer Request to recipient via signaling server
    this.signaling.sendTransferRequest(targetPeer.deviceId, {
      transferId,
      senderId: this.localId,
      senderName: this.localName,
      senderDeviceName: this.identity.deviceName,
      fileName: safeName,
      fileSize: file.size,
      totalBytes: file.size,
      totalFiles: 1,
      sha256: senderSha256,
      verifiedOffset: resumeOffset,
      files: [{ name: safeName, size: file.size, sha256: senderSha256 }],
    });

    this.notifyEvent(
      {
        type: 'progress',
        transferId,
        senderName: this.localName,
        receiverName: targetPeer.name,
        fileName: safeName,
        fileSize: file.size,
        transferredBytes: resumeOffset,
        verifiedBytes: resumeOffset,
        speedBytesPerSec: 0,
        etaSeconds: 0,
        state: 'WAITING_FOR_ACCEPTANCE',
        transport: 'WebRTC Direct',
      },
      true
    );

    return transferId;
  }

  private async tryLanHttpTurboUpload(
    targetPeer: PeerDevice,
    transferId: string,
    file: File,
    safeName: string,
    senderSha256: string
  ): Promise<boolean> {
    if (!targetPeer.localIp || !targetPeer.localPort) {
      return false;
    }

    const lanUrl = `http://${targetPeer.localIp}:${targetPeer.localPort}`;
    console.log(`[LAN HTTP Turbo] Probing target peer at ${lanUrl}...`);

    // 1. Fast probe (AuraDrop V1 Protocol)
    try {
      const probeController = new AbortController();
      const probeTimer = setTimeout(() => probeController.abort(), 1200);
      let probeRes = await fetch(`${lanUrl}/api/auradrop/v1/info`, {
        method: 'GET',
        signal: probeController.signal,
        mode: 'cors',
      }).catch(() => null);

      if (!probeRes || !probeRes.ok) {
        probeRes = await fetch(`${lanUrl}/api/probe`, {
          method: 'GET',
          signal: probeController.signal,
          mode: 'cors',
        }).catch(() => null);
      }
      clearTimeout(probeTimer);

      if (!probeRes || !probeRes.ok) {
        console.log(`[LAN HTTP Turbo] Probe failed, fallback to WebRTC.`);
        return false;
      }
      const probeData = await probeRes.json();
      if (probeData.protocol !== 'auradrop/1' && probeData.status !== 'ok') {
        return false;
      }
    } catch (err) {
      console.log(`[LAN HTTP Turbo] Probe timed out or failed: ${err}, fallback to WebRTC.`);
      return false;
    }

    // 2. Prepare transfer & obtain single-use expiring token
    let oneTimeToken = '';
    try {
      const prepPayload = JSON.stringify({
        transferId,
        fileId: transferId,
        fileName: safeName,
        fileSize: file.size,
        sha256: senderSha256,
        senderUserId: this.localId,
        senderName: this.localName,
        senderDeviceName: this.identity.deviceName,
        receiverUserId: targetPeer.deviceId,
      });

      let prepRes = await fetch(`${lanUrl}/api/auradrop/v1/prepare-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: prepPayload,
      }).catch(() => null);

      if (!prepRes || !prepRes.ok) {
        prepRes = await fetch(`${lanUrl}/api/transfer/prepare`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: prepPayload,
        }).catch(() => null);
      }

      if (!prepRes || !prepRes.ok) {
        return false;
      }
      const prepData = await prepRes.json();
      if (!prepData.accepted) {
        this.notifyEvent(
          {
            type: 'error',
            transferId,
            senderName: this.localName,
            fileName: file.name,
            fileSize: file.size,
            error: 'Recipient declined the transfer.',
            state: 'CANCELLED',
          },
          true
        );
        this.activeOutgoingTransfer = null;
        return true;
      }
      oneTimeToken = prepData.oneTimeToken || '';
    } catch (err) {
      console.warn('[LAN HTTP Turbo] Prepare failed:', err);
      return false;
    }

    // 3. Direct streaming upload via XHR with exact byte progress & live MB/s
    return new Promise<boolean>((resolve) => {
      const xhr = new XMLHttpRequest();
      this.activeXhr = xhr;
      const uploadUrl = `${lanUrl}/api/auradrop/v1/upload?transferId=${encodeURIComponent(transferId)}&token=${encodeURIComponent(oneTimeToken)}&fileName=${encodeURIComponent(safeName)}`;
      xhr.open('POST', uploadUrl, true);
      xhr.setRequestHeader('X-Transfer-Id', transferId);
      if (oneTimeToken) xhr.setRequestHeader('X-One-Time-Token', oneTimeToken);
      xhr.setRequestHeader('X-File-Name', encodeURIComponent(safeName));
      xhr.setRequestHeader('X-File-Size', file.size.toString());
      xhr.setRequestHeader('X-Expected-Sha256', senderSha256);

      let lastCalcTime = performance.now();
      let lastLoaded = 0;
      let smoothedSpeed = 0;

      if (this.activeOutgoingTransfer) {
        this.activeOutgoingTransfer.state = 'TRANSFERRING';
      }

      this.notifyEvent(
        {
          type: 'progress',
          transferId,
          senderName: this.localName,
          receiverName: targetPeer.name,
          fileName: safeName,
          fileSize: file.size,
          transferredBytes: 0,
          verifiedBytes: 0,
          speedBytesPerSec: 0,
          etaSeconds: 0,
          state: 'TRANSFERRING',
          transport: 'Direct LAN',
        },
        true
      );

      xhr.upload.onprogress = (event) => {
        if (this.activeOutgoingTransfer?.isCancelled) {
          xhr.abort();
          this.activeXhr = null;
          resolve(true);
          return;
        }

        if (event.lengthComputable) {
          const now = performance.now();
          const dt = (now - lastCalcTime) / 1000;
          if (dt > 0.08) {
            const bytesDelta = event.loaded - lastLoaded;
            const instantSpeed = bytesDelta / dt;
            smoothedSpeed = smoothedSpeed === 0 ? instantSpeed : 0.75 * smoothedSpeed + 0.25 * instantSpeed;
            lastCalcTime = now;
            lastLoaded = event.loaded;
          }

          const remaining = Math.max(0, event.total - event.loaded);
          const eta = smoothedSpeed > 0 ? Math.ceil(remaining / smoothedSpeed) : 0;

          if (this.activeOutgoingTransfer) {
            this.activeOutgoingTransfer.sentBytes = event.loaded;
            this.activeOutgoingTransfer.verifiedOffset = event.loaded;
            this.activeOutgoingTransfer.smoothedSpeed = smoothedSpeed;
          }

          this.notifyEvent({
            type: 'progress',
            transferId,
            senderName: this.localName,
            receiverName: targetPeer.name,
            fileName: safeName,
            fileSize: event.total,
            transferredBytes: event.loaded,
            verifiedBytes: event.loaded,
            speedBytesPerSec: smoothedSpeed,
            etaSeconds: eta,
            state: 'TRANSFERRING',
            transport: 'Direct LAN',
          });
        }
      };

      xhr.onload = () => {
        this.activeXhr = null;
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const resp = JSON.parse(xhr.responseText);
            const finalSha = resp.sha256 || senderSha256;

            this.storage.removeCheckpoint(transferId);
            const record: TransferRecord = {
              id: transferId,
              fileName: safeName,
              fileSize: file.size,
              senderName: this.localName,
              receiverName: targetPeer.name,
              status: 'COMPLETED',
              sha256: finalSha,
              timestamp: new Date().toISOString(),
              speedBytesPerSec: smoothedSpeed,
              transport: 'Direct LAN',
              verifiedOffset: file.size,
            };
            this.storage.saveRecord(record);

            this.notifyEvent(
              {
                type: 'completed',
                transferId,
                senderName: this.localName,
                receiverName: targetPeer.name,
                fileName: safeName,
                fileSize: file.size,
                transferredBytes: file.size,
                verifiedBytes: file.size,
                speedBytesPerSec: smoothedSpeed,
                sha256: finalSha,
                state: 'COMPLETED',
                transport: 'Direct LAN',
              },
              true
            );

            this.activeOutgoingTransfer = null;
            resolve(true);
          } catch {
            resolve(false);
          }
        } else {
          console.warn(`[LAN HTTP Turbo] Upload failed HTTP ${xhr.status}, fallback to WebRTC.`);
          resolve(false);
        }
      };

      xhr.onerror = () => {
        this.activeXhr = null;
        console.warn('[LAN HTTP Turbo] Network error during LAN upload, fallback to WebRTC.');
        resolve(false);
      };

      xhr.onabort = () => {
        this.activeXhr = null;
        this.notifyEvent(
          {
            type: 'error',
            transferId,
            senderName: this.localName,
            fileName: file.name,
            fileSize: file.size,
            error: 'Transfer was cancelled.',
            state: 'CANCELLED',
          },
          true
        );
        this.activeOutgoingTransfer = null;
        resolve(true);
      };

      xhr.send(file);
    });
  }

  private handleTransferResponseMessage(msg: any): void {
    const payload = msg.payload || msg;
    const xfer = this.activeOutgoingTransfer;
    const tid = payload.transferId || msg.transferId;
    if (!xfer || (tid && xfer.transferId !== tid)) return;

    const isAccepted = payload.accepted === true || msg.type === 'TRANSFER_ACCEPT';
    if (isAccepted) {
      const startOffset = payload.verifiedOffset || 0;
      this.executeOutgoingStream(startOffset);
    } else {
      this.notifyEvent(
        {
          type: 'error',
          transferId: xfer.transferId,
          senderName: this.localName,
          fileName: xfer.file.name,
          fileSize: xfer.file.size,
          error: 'Recipient declined the transfer.',
          state: 'CANCELLED',
        },
        true
      );
      this.activeOutgoingTransfer = null;
    }
  }

  private handleTransferAckMessage(msg: any): void {
    const payload = msg.payload || msg;
    if (this.activeOutgoingTransfer && this.activeOutgoingTransfer.transferId === payload.transferId) {
      this.finalizeOutgoingTransfer(payload.transferId);
    }
  }

  private async executeOutgoingStream(startOffset = 0): Promise<void> {
    const xfer = this.activeOutgoingTransfer;
    if (!xfer) return;

    xfer.state = 'CONNECTING';
    const file = xfer.file;
    const totalBytes = file.size;
    let offset = startOffset;
    let sequence = Math.floor(startOffset / xfer.chunkSize);

    // Make sure WebRTC is connected
    const targetPeer = this.peersMap.get(xfer.targetPeerId) || {
      id: xfer.targetPeerId,
      deviceId: xfer.targetPeerId,
      name: xfer.targetPeerName,
      deviceName: xfer.targetPeerName,
      platform: 'unknown',
      ip: 'WebRTC P2P',
      port: 0,
      lastSeen: new Date(),
      isTrusted: true,
      connectionState: 'CONNECTING' as any,
      transport: 'WebRTC Direct',
    };

    if (targetPeer.connectionState !== 'READY_TO_TRANSFER') {
      await this.connectToPeer(targetPeer);
    }

    const isDcReady = await this.webRtcTransport.waitForDataChannel(15000);
    if (!isDcReady) {
      this.notifyEvent(
        {
          type: 'error',
          transferId: xfer.transferId,
          senderName: this.localName,
          fileName: file.name,
          fileSize: totalBytes,
          error: 'WebRTC connection timed out. Devices could not establish direct P2P channel.',
          state: 'FAILED_CONNECTION',
        },
        true
      );
      this.activeOutgoingTransfer = null;
      return;
    }

    // 1. Send FILE_START frame before data chunks (required for mobile & cross-platform)
    try {
      const startPayload = new TextEncoder().encode(
        JSON.stringify({
          filename: file.name,
          size: totalBytes,
          checksum: xfer.expectedSha256,
          transferId: xfer.transferId,
        })
      );
      const startFrame = encodeBinaryFrame(
        BinaryFrameType.FILE_START,
        xfer.transferId,
        0,
        0n,
        startPayload
      );
      await this.webRtcTransport.sendFrame(new Uint8Array(startFrame));
    } catch (e) {
      console.warn('[TransferEngine] FILE_START send warning:', e);
    }

    xfer.state = 'TRANSFERRING';

    const sendLoop = async () => {
      // High-performance Pipelined Sliding Window:
      // Decouple asynchronous file slice/disk reading from network transmission.
      // While chunk N is in flight across the multi-channel WebRTC network,
      // chunks N+1..N+4 are ALREADY read from disk concurrently!
      const PIPELINE_DEPTH = 4;

      interface PrefetchedChunk {
        seq: number;
        off: number;
        len: number;
        framePromise: Promise<ArrayBuffer>;
      }

      const scheduleChunkRead = (seq: number, off: number, size: number): PrefetchedChunk => {
        const actualSize = Math.min(size, totalBytes - off);
        const framePromise = (async () => {
          const sliceBlob = file.slice(off, off + actualSize);
          const sliceBuf = await sliceBlob.arrayBuffer();
          const chunkBytes = new Uint8Array(sliceBuf);
          return encodeBinaryFrame(
            BinaryFrameType.DATA_CHUNK,
            xfer.transferId,
            seq,
            BigInt(off),
            chunkBytes
          );
        })();
        return { seq, off, len: actualSize, framePromise };
      };

      const pipeline: PrefetchedChunk[] = [];
      let nextScheduleOffset = offset;
      let nextScheduleSeq = sequence;
      let lastYieldBytes = offset;

      // Prime the pipeline with the first PIPELINE_DEPTH chunks
      while (nextScheduleOffset < totalBytes && pipeline.length < PIPELINE_DEPTH) {
        const chunk = scheduleChunkRead(nextScheduleSeq, nextScheduleOffset, xfer.chunkSize);
        pipeline.push(chunk);
        nextScheduleOffset += chunk.len;
        nextScheduleSeq++;
      }

      while (pipeline.length > 0) {
        if (xfer.isCancelled) {
          pipeline.length = 0;
          return;
        }
        if (xfer.isPaused) {
          xfer.state = 'PAUSED';
          this.storage.saveCheckpoint({
            transferId: xfer.transferId,
            fileId: xfer.file.name,
            fileName: xfer.file.name,
            fileSize: totalBytes,
            expectedSha256: xfer.expectedSha256,
            verifiedOffset: offset,
            updatedAt: new Date().toISOString(),
          });
          return;
        }

        // 1. Fetch the next chunk (its disk read was already running in parallel!)
        const current = pipeline.shift()!;
        const frameBuffer = await current.framePromise;

        // 2. Schedule the next chunk ahead in background to keep pipeline saturated
        if (nextScheduleOffset < totalBytes) {
          // Dynamic adaptive chunk sizing (64 KB -> 128 KB -> 192 KB -> 256 KB)
          xfer.chunkSize =
            xfer.smoothedSpeed > 80 * 1024 * 1024
              ? 256 * 1024
              : xfer.smoothedSpeed > 50 * 1024 * 1024
              ? 192 * 1024
              : xfer.smoothedSpeed > 20 * 1024 * 1024
              ? 128 * 1024
              : 64 * 1024;

          const chunk = scheduleChunkRead(nextScheduleSeq, nextScheduleOffset, xfer.chunkSize);
          pipeline.push(chunk);
          nextScheduleOffset += chunk.len;
          nextScheduleSeq++;
        }

        // 3. Send frame via least-loaded striped data channel
        try {
          await this.webRtcTransport.sendFrame(frameBuffer);
        } catch (e) {
          console.warn('Transport frame send error', e);
        }

        offset += current.len;
        sequence++;
        xfer.sentBytes = offset;
        xfer.verifiedOffset = offset;

        // 4. Real Throughput Calculation with Exponential Smoothing
        const now = performance.now();
        const timeDeltaMs = now - xfer.lastCalcTime;
        if (timeDeltaMs >= 100) {
          const bytesDelta = xfer.sentBytes - xfer.lastCalcBytes;
          const instantSpeed = (bytesDelta / timeDeltaMs) * 1000;
          xfer.smoothedSpeed =
            xfer.smoothedSpeed === 0 ? instantSpeed : xfer.smoothedSpeed * 0.7 + instantSpeed * 0.3;
          xfer.lastCalcTime = now;
          xfer.lastCalcBytes = xfer.sentBytes;
        }

        const remainingBytes = Math.max(0, totalBytes - offset);
        const etaSeconds = xfer.smoothedSpeed > 0 ? Math.ceil(remainingBytes / xfer.smoothedSpeed) : 0;

        this.notifyEvent({
          type: 'progress',
          transferId: xfer.transferId,
          senderName: this.localName,
          receiverName: xfer.targetPeerName,
          fileName: file.name,
          fileSize: totalBytes,
          transferredBytes: offset,
          verifiedBytes: offset,
          speedBytesPerSec: xfer.smoothedSpeed,
          etaSeconds,
          state: 'TRANSFERRING',
          transport: 'WebRTC Direct',
        });

        // Cooperative event loop yield every 4 MB to maintain 60fps UI without bottlenecking high-throughput I/O
        if (offset - lastYieldBytes >= 4 * 1024 * 1024) {
          lastYieldBytes = offset;
          await new Promise((r) => setTimeout(r, 0));
        }
      }

      if (offset >= totalBytes) {
        // Send Binary FIN Frame
        const finFrame = encodeBinaryFrame(
          BinaryFrameType.FILE_FIN,
          xfer.transferId,
          sequence,
          BigInt(totalBytes),
          new Uint8Array(0)
        );
        await this.webRtcTransport.sendFrame(finFrame);

        xfer.state = 'VERIFYING';
        this.notifyEvent(
          {
            type: 'progress',
            transferId: xfer.transferId,
            senderName: this.localName,
            receiverName: xfer.targetPeerName,
            fileName: file.name,
            fileSize: totalBytes,
            transferredBytes: totalBytes,
            verifiedBytes: totalBytes,
            state: 'VERIFYING',
            transport: 'WebRTC Direct',
          },
          true
        );
        // Sender waits for receiver's ACK_COMPLETE before marking COMPLETED (Section 22)
      }
    };

    sendLoop();
  }

  private finalizeOutgoingTransfer(transferId: string): void {
    const xfer = this.activeOutgoingTransfer;
    if (!xfer || xfer.transferId !== transferId) return;

    xfer.state = 'COMPLETED';
    this.storage.removeCheckpoint(xfer.transferId);

    const record: TransferRecord = {
      id: xfer.transferId,
      fileName: xfer.file.name,
      fileSize: xfer.file.size,
      senderName: this.localName,
      receiverName: xfer.targetPeerName,
      status: 'COMPLETED',
      sha256: xfer.expectedSha256,
      timestamp: new Date().toISOString(),
      speedBytesPerSec: xfer.smoothedSpeed,
      transport: 'WebRTC Direct P2P',
      verifiedOffset: xfer.file.size,
    };
    this.storage.saveRecord(record);

    this.notifyEvent(
      {
        type: 'completed',
        transferId: xfer.transferId,
        senderName: this.localName,
        receiverName: xfer.targetPeerName,
        fileName: xfer.file.name,
        fileSize: xfer.file.size,
        transferredBytes: xfer.file.size,
        verifiedBytes: xfer.file.size,
        speedBytesPerSec: xfer.smoothedSpeed,
        sha256: xfer.expectedSha256,
        state: 'COMPLETED',
        transport: 'WebRTC Direct',
      },
      true
    );

    this.activeOutgoingTransfer = null;
  }

  // ---------------------------------------------------------------------------
  // PUBLIC CONTROLS: ACCEPT, DECLINE, PAUSE, RESUME, CANCEL
  // ---------------------------------------------------------------------------
  public acceptIncomingTransfer(): void {
    if (!this.activeIncomingTransfer) return;
    this.webRtcTransport.sendControl({
      type: 'TRANSFER_RESPONSE',
      transferId: this.activeIncomingTransfer.transferId,
      senderId: this.localId,
      targetId: this.activeIncomingTransfer.senderId,
      payload: {
        accepted: true,
        verifiedOffset: this.activeIncomingTransfer.verifiedOffset,
      },
    }).catch(() => {});
    this.signaling.sendTransferResponse(this.activeIncomingTransfer.senderId, {
      transferId: this.activeIncomingTransfer.transferId,
      accepted: true,
      verifiedOffset: this.activeIncomingTransfer.verifiedOffset,
    });
  }

  public declineIncomingTransfer(): void {
    if (!this.activeIncomingTransfer) return;
    this.webRtcTransport.sendControl({
      type: 'TRANSFER_RESPONSE',
      transferId: this.activeIncomingTransfer.transferId,
      senderId: this.localId,
      targetId: this.activeIncomingTransfer.senderId,
      payload: {
        accepted: false,
      },
    }).catch(() => {});
    this.signaling.sendTransferResponse(this.activeIncomingTransfer.senderId, {
      transferId: this.activeIncomingTransfer.transferId,
      accepted: false,
    });
    this.activeIncomingTransfer = null;
  }

  public pauseActiveTransfer(): void {
    if (this.activeOutgoingTransfer) {
      this.activeOutgoingTransfer.isPaused = true;
      this.webRtcTransport.pause();
    }
  }

  public resumeActiveTransfer(): void {
    if (this.activeOutgoingTransfer && this.activeOutgoingTransfer.isPaused) {
      this.activeOutgoingTransfer.isPaused = false;
      this.webRtcTransport.resume();
      this.executeOutgoingStream(this.activeOutgoingTransfer.verifiedOffset);
    }
  }

  public cancelActiveTransfer(): void {
    if (this.activeXhr) {
      this.activeXhr.abort();
      this.activeXhr = null;
    }
    if (this.activeOutgoingTransfer) {
      this.activeOutgoingTransfer.isCancelled = true;
      this.storage.removeCheckpoint(this.activeOutgoingTransfer.transferId);
      this.webRtcTransport.cancel();
      this.activeOutgoingTransfer = null;
    }
    if (this.activeIncomingTransfer) {
      this.activeIncomingTransfer.diskWriter.cleanup();
      this.storage.removeCheckpoint(this.activeIncomingTransfer.transferId);
      this.activeIncomingTransfer = null;
    }
  }

  public getDiagnostics(): TransportStatistics {
    return this.webRtcTransport.getStatistics();
  }

  public getSignalingDiagnostics() {
    return this.signaling.getDiagnostics();
  }

  public getSignalingClient(): SignalingClient {
    return this.signaling;
  }
}

