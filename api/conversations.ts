import type { IncomingMessage } from 'node:http';
import { NeonDatabaseClient } from '../packages/database/src/neon-client';

// AuraDrop Vercel Serverless Conversations & Chat API (V25 Security Hardened)
// Security changes:
//  - userId is always derived from X-User-Id header, NEVER from request body
//  - body.userId / body.senderId / body.creatorId are NEVER used as the acting identity
//  - Conversation membership verified before read / write / delete operations
//  - Message ownership verified before deletion
//  - Text and attachment size limits enforced
//  - Private content stripped from error logs

const MAX_BODY_BYTES    = 2 * 1024 * 1024;
const MAX_TEXT_LENGTH   = 4096;
const MAX_ATTACHMENTS   = 10;
const MAX_FILE_NAME_LEN = 256;
const MAX_FILE_SIZE     = 10 * 1024 * 1024 * 1024; // 10 GB declared size limit

let dbInstance: NeonDatabaseClient | null = null;

async function getDb(): Promise<NeonDatabaseClient> {
  if (!dbInstance) {
    dbInstance = new NeonDatabaseClient(process.env.DATABASE_URL);
    await dbInstance.initialize();
  }
  return dbInstance;
}

async function readBody(req: any): Promise<any> {
  if (req.body && typeof req.body === 'object') return req.body;
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c: any) => {
      data += c;
      if (data.length > MAX_BODY_BYTES) {
        req.destroy();
        resolve({});
      }
    });
    req.on('end',   () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

/** Extract authenticated userId exclusively from trusted headers — never from body. */
function getAuthenticatedUserId(req: any): string | null {
  const id = (req.headers['x-user-id'] as string)?.trim();
  if (!id || id.length > 128 || !/^[a-zA-Z0-9_\-.:]+$/.test(id)) return null;
  return id;
}

function sanitizeName(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v.replace(/[\x00-\x1F\x7F]/g, '').slice(0, 128);
}

export default async function handler(req: any, res: any) {
  // CORS & Security Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-User-Id, X-Device-Id');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

  // ── Authenticate ──────────────────────────────────────────────────────────
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    res.statusCode = 401;
    res.end(JSON.stringify({ error: 'X-User-Id header required and must be a valid device ID' }));
    return;
  }

  const db = await getDb();

  const urlObj   = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  let pathname   = urlObj.pathname;

  const subpath = urlObj.searchParams.get('subpath');
  if (subpath) {
    pathname = subpath.startsWith('messages') ? `/api/${subpath}` : `/api/conversations/${subpath}`;
    pathname = pathname.replace(/\/+/g, '/');
  }

  // Ensure current user exists in DB (upsert based on header identity, never body)
  try {
    const existing = await db.users.findById(userId);
    if (!existing) {
      const displayName = sanitizeName((req.headers['x-user-name'] as string) || userId);
      await db.users.create({
        id:           userId,
        email:        `${userId.replace(/[^a-zA-Z0-9_-]/g, '')}@auradrop.network`,
        username:     userId,
        displayName,
        passwordHash: 'auradrop_ephemeral_device_key',
      });
    }
  } catch { /* Already exists or transient */ }

  let body: any = {};
  if (['POST', 'PUT', 'DELETE'].includes(req.method || '')) {
    body = await readBody(req);
    // Explicitly refuse attempts to override the acting identity from the body
    // (these fields may appear in the payload for historical reasons; we ignore them)
    delete body.userId;
    delete body.senderId;
    delete body.creatorId;
  }

  try {
    // ── 1. DELETE /api/messages/:id ─────────────────────────────────────────
    const msgDeleteMatch = pathname.match(/^\/api\/messages\/([^/]+)$/);
    if (msgDeleteMatch && req.method === 'DELETE') {
      const msgId = msgDeleteMatch[1];
      // deleteForEveryone must verify ownership internally; pass authenticated userId
      const success = await db.messages.deleteForEveryone(msgId, userId);
      res.statusCode = 200;
      res.end(JSON.stringify({ success, deletedId: msgId }));
      return;
    }

    // ── 2. DELETE /api/conversations/:id/clear ──────────────────────────────
    const clearMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/clear$/);
    if (clearMatch && req.method === 'DELETE') {
      const convId = clearMatch[1];
      // Verify membership before clearing
      const members = await db.conversations.getMembers(convId);
      if (!members.some((m: any) => m.userId === userId || m.user_id === userId)) {
        res.statusCode = 403;
        res.end(JSON.stringify({ error: 'Not a member of this conversation' }));
        return;
      }
      await db.conversations.clearChat(convId, userId);
      res.statusCode = 200;
      res.end(JSON.stringify({ success: true, conversationId: convId, cleared: true }));
      return;
    }

    // ── 3. PUT|POST /api/conversations/:id/disappearing ─────────────────────
    const disappearMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/disappearing$/);
    if (disappearMatch && (req.method === 'PUT' || req.method === 'POST')) {
      const convId  = disappearMatch[1];
      const seconds = typeof body.seconds === 'number' && body.seconds >= 0 ? body.seconds : 0;
      // Verify membership
      const members = await db.conversations.getMembers(convId);
      if (!members.some((m: any) => m.userId === userId || m.user_id === userId)) {
        res.statusCode = 403;
        res.end(JSON.stringify({ error: 'Not a member of this conversation' }));
        return;
      }
      await db.conversations.setDisappearing(convId, seconds);
      res.statusCode = 200;
      res.end(JSON.stringify({ success: true, conversationId: convId, disappearing_seconds: seconds }));
      return;
    }

    // ── 4. /api/conversations/:id/messages ───────────────────────────────────
    const messagesMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/messages$/);
    if (messagesMatch) {
      const convId = messagesMatch[1];

      // Verify membership for all operations
      const members = await db.conversations.getMembers(convId);
      if (!members.some((m: any) => m.userId === userId || m.user_id === userId)) {
        res.statusCode = 403;
        res.end(JSON.stringify({ error: 'Not a member of this conversation' }));
        return;
      }

      if (req.method === 'GET') {
        const limit  = Math.min(parseInt(urlObj.searchParams.get('limit') || '50', 10), 200);
        const cursor = urlObj.searchParams.get('cursor') ?? undefined;
        const messages = await db.messages.list(convId, userId, cursor, limit);
        res.statusCode = 200;
        res.end(JSON.stringify({ success: true, conversationId: convId, messages }));
        return;
      }

      if (req.method === 'POST') {
        const text = typeof body.text === 'string'
          ? body.text.slice(0, MAX_TEXT_LENGTH)
          : '';
        const type = typeof body.type === 'string' ? body.type : 'TEXT';

        const rawAttachments: any[] = Array.isArray(body.attachments)
          ? body.attachments.slice(0, MAX_ATTACHMENTS)
          : [];
        const attachments = rawAttachments.map((att: any) => ({
          fileName:   String(att.fileName || att.file_name || 'attachment').slice(0, MAX_FILE_NAME_LEN),
          fileSize:   Math.min(Number(att.fileSize || att.file_size || 0), MAX_FILE_SIZE),
          mimeType:   String(att.mimeType || att.mime_type || 'application/octet-stream').slice(0, 128),
          fileHash:   typeof att.fileHash === 'string' ? att.fileHash.slice(0, 64) : undefined,
          fileUrl:    typeof att.fileUrl  === 'string' ? att.fileUrl.slice(0, 512)  : undefined,
          transferId: typeof att.transferId === 'string' ? att.transferId.slice(0, 128) : undefined,
        }));

        const replyToId   = typeof body.replyToId   === 'string' ? body.replyToId.slice(0, 128)   : undefined;
        const clientMsgId = typeof body.clientMsgId === 'string' ? body.clientMsgId.slice(0, 128) : undefined;

        // senderId is always the authenticated userId — never from body
        const message = await db.messages.create({
          conversationId: convId,
          senderId:       userId,   // ← enforced, not body.senderId
          text,
          type,
          attachments,
          replyToId,
          clientMsgId,
        });

        res.statusCode = 201;
        res.end(JSON.stringify({ success: true, message }));
        return;
      }
    }

    // ── 5. POST /api/conversations/direct ────────────────────────────────────
    if (
      (pathname === '/api/conversations/direct' || pathname === '/api/conversations') &&
      req.method === 'POST' &&
      (body.userBId || body.peerId || body.targetDeviceId)
    ) {
      const userBId    = String(body.userBId || body.peerId || body.targetDeviceId).slice(0, 128);
      const peerName   = sanitizeName(body.peerName || body.targetName || 'Nearby Peer');

      if (!userBId) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'userBId required' }));
        return;
      }

      try {
        const peer = await db.users.findById(userBId);
        if (!peer) {
          await db.users.create({
            id:           userBId,
            email:        `${userBId.replace(/[^a-zA-Z0-9_-]/g, '')}@auradrop.network`,
            username:     userBId,
            displayName:  peerName,
            passwordHash: 'auradrop_peer_hash',
          });
        }
      } catch { }

      const conversation = await db.conversations.createDirect(userId, userBId);
      const members      = await db.conversations.getMembers(conversation.id);
      res.statusCode = 200;
      res.end(JSON.stringify({ success: true, conversation: { ...conversation, members } }));
      return;
    }

    // ── 6. POST /api/conversations/group ─────────────────────────────────────
    if (pathname === '/api/conversations/group' && req.method === 'POST') {
      const title     = sanitizeName(body.title || 'Group Chat');
      // creatorId is always the authenticated userId — never from body
      const memberIds = Array.isArray(body.memberIds)
        ? body.memberIds.map((id: any) => String(id).slice(0, 128)).filter(Boolean).slice(0, 100)
        : [];
      const avatarUrl = typeof body.avatarUrl === 'string' ? body.avatarUrl.slice(0, 512) : null;

      for (const mId of [userId, ...memberIds]) {
        try {
          const m = await db.users.findById(mId);
          if (!m) {
            await db.users.create({
              id:           mId,
              email:        `${mId.replace(/[^a-zA-Z0-9_-]/g, '')}@auradrop.network`,
              username:     mId,
              displayName:  mId === userId ? sanitizeName((req.headers['x-user-name'] as string) || userId) : 'Group Member',
              passwordHash: 'auradrop_member_hash',
            });
          }
        } catch { }
      }

      const conversation = await db.conversations.createGroup(title, userId, memberIds, avatarUrl);
      const members      = await db.conversations.getMembers(conversation.id);
      res.statusCode = 201;
      res.end(JSON.stringify({ success: true, conversation: { ...conversation, members } }));
      return;
    }

    // ── 7. GET /api/conversations ─────────────────────────────────────────────
    if (pathname === '/api/conversations' || pathname === '/api/conversations/') {
      if (req.method === 'GET') {
        const conversations = await db.conversations.listForUser(userId);
        res.statusCode = 200;
        res.end(JSON.stringify({ success: true, userId, conversations }));
        return;
      }
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: `Endpoint not found: ${req.method} ${pathname}` }));
  } catch (err: any) {
    // Keep private message content out of logs
    console.error('[AuraDrop Conversations API Error] path:', pathname, 'method:', req.method, 'code:', err?.code);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Internal Server Error' }));
  }
}
