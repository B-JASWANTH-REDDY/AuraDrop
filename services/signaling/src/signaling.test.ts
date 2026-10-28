import { describe, it, expect } from 'vitest';
import {
  AuthMessageSchema,
  HeartbeatMessageSchema,
  SignalMessageSchema,
  ChatMessageSchema,
  TransferRequestSchema,
  TransferResponseSchema,
  PairCreateRequestSchema,
  PairJoinRequestSchema,
  TurnCredentialsRequestSchema,
} from './schemas.js';

describe('Signaling Schemas Validation', () => {
  it('validates a valid Auth message', () => {
    const valid = {
      type: 'AUTH' as const,
      deviceId: 'dev_alice_123',
      displayName: 'Alice Phone',
      deviceName: 'Alice Pixel 8',
      platform: 'android' as const,
      appVersion: '2.0.1',
      visibility: 'everyone' as const,
      capabilities: ['lan_http_turbo', 'webrtc_direct'],
    };
    const parsed = AuthMessageSchema.parse(valid);
    expect(parsed.deviceId).toBe('dev_alice_123');
    expect(parsed.platform).toBe('android');
  });

  it('rejects an Auth message with short deviceId or invalid platform', () => {
    const invalidShortId = {
      type: 'AUTH',
      deviceId: 'ab',
    };
    expect(() => AuthMessageSchema.parse(invalidShortId)).toThrow();

    const invalidPlatform = {
      type: 'AUTH',
      deviceId: 'dev_valid_id',
      platform: 'smartwatch',
    };
    expect(() => AuthMessageSchema.parse(invalidPlatform)).toThrow();
  });

  it('validates and normalizes SignalMessageSchema aliases', () => {
    const signalWithAliases = {
      type: 'SIGNAL' as const,
      senderDeviceId: 'dev_sender_99',
      targetId: 'dev_target_88',
      payload: { sdp: 'v=0...' },
    };
    const normalized = SignalMessageSchema.parse(signalWithAliases);
    expect(normalized.senderId).toBe('dev_sender_99');
    expect(normalized.targetDeviceId).toBe('dev_target_88');
    expect(normalized.signal).toEqual({ sdp: 'v=0...' });
  });

  it('validates Heartbeat messages', () => {
    const hb = {
      type: 'HEARTBEAT' as const,
      deviceId: 'dev_node_42',
      visibility: 'contacts' as const,
      localIp: '192.168.1.50',
      localPort: 53317,
    };
    const parsed = HeartbeatMessageSchema.parse(hb);
    expect(parsed.localPort).toBe(53317);
  });

  it('validates Chat messages and enforces character limits', () => {
    const chat = {
      type: 'CHAT' as const,
      conversationId: 'conv_123',
      senderId: 'user_alice',
      text: 'Hello from peer!',
      messageType: 'text' as const,
    };
    const parsed = ChatMessageSchema.parse(chat);
    expect(parsed.text).toBe('Hello from peer!');

    const emptyText = {
      type: 'CHAT',
      conversationId: 'conv_123',
      senderId: 'user_alice',
      text: '',
    };
    expect(() => ChatMessageSchema.parse(emptyText)).toThrow();
  });

  it('validates TransferRequestSchema with file metadata', () => {
    const xferReq = {
      type: 'TRANSFER_REQUEST' as const,
      transferId: 'xfer_photo_101',
      senderId: 'user_bob',
      senderName: 'Bob Windows',
      targetDeviceId: 'user_alice',
      fileName: 'photo.jpg',
      totalBytes: 5242880,
      totalFiles: 1,
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    };
    const parsed = TransferRequestSchema.parse(xferReq);
    expect(parsed.fileName).toBe('photo.jpg');
    expect(parsed.totalBytes).toBe(5242880);
  });

  it('validates TransferResponseSchema acceptance and decline', () => {
    const accept = {
      type: 'TRANSFER_ACCEPT' as const,
      transferId: 'xfer_photo_101',
      senderId: 'user_alice',
      targetDeviceId: 'user_bob',
    };
    expect(TransferResponseSchema.parse(accept).type).toBe('TRANSFER_ACCEPT');

    const decline = {
      type: 'TRANSFER_DECLINE' as const,
      transferId: 'xfer_photo_101',
      senderId: 'user_alice',
      targetDeviceId: 'user_bob',
      reason: 'Storage full',
    };
    expect(TransferResponseSchema.parse(decline).reason).toBe('Storage full');
  });

  it('validates pairing code format', () => {
    const pairJoin = {
      joinerDeviceId: 'dev_joiner_1',
      joinerName: 'Peer 2',
      pairingCode: '123456',
    };
    expect(PairJoinRequestSchema.parse(pairJoin).pairingCode).toBe('123456');

    const badCode = {
      joinerDeviceId: 'dev_joiner_1',
      pairingCode: '12',
    };
    expect(() => PairJoinRequestSchema.parse(badCode)).toThrow();
  });

  it('validates turn credential request', () => {
    const turnReq = { deviceId: 'dev_client_1' };
    expect(TurnCredentialsRequestSchema.parse(turnReq).deviceId).toBe('dev_client_1');
  });
});
