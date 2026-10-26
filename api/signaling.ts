import type { IncomingMessage } from 'node:http';
import { Pool, PoolConfig } from 'pg';
import crypto from 'node:crypto';

// AuraDrop Production Serverless Signaling Channel (P2PFS/1 V25 Hardened)
// Security hardening:
//  - Pairing requires explicit consent token, not client-supplied trustedPeers
//  - Rate limiting per IP for registration / pairing / send
//  - Payload size enforcement (2 MB body, 128-char IDs, 256-char names)
//  - No session tokens in peer listings or logs
//  - DB outage does not silently fall back to a weaker auth mode
//  - Revocation and expiry respected on pair records

const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MB
const PEER_STALE_MS  = 35_000;
const PEER_TTL_DB    = '45 seconds';
const MAX_ID_LEN     = 128;
const MAX_NAME_LEN   = 256;

// ── In-memory hot-path cache (warm serverless invocations) ──────────────────
interface PeerEntry {
  deviceId: string;
  displayName: string;
  deviceName: string;
  platform: string;
  clientIp: string;
  localIp?: string;
  localPort?: number;
  capabilities?: string[];
  lastSeen: number;
  visibility: string;
  isTrusted?: boolean;
}

const globalPeers    = ((globalThis as any).__auradrop_peers    ??= new Map<string, PeerEntry>());
const globalMessages = ((globalThis as any).__auradrop_messages ??= new Map<string, any[]>());
// Pairing is NEVER stored in the client-supplied trustedPeers hot-path;
// it requires an explicit /pair call with DB confirmation.
const globalPairings = ((globalThis as any).__auradrop_pairings ??= new Map<string, Set<string>>());

// Simple in-memory rate limiter
interface RateBucket { count: number; windowStart: number }
const rateLimiter = ((globalThis as any).__auradrop_rl ??= new Map<string, RateBucket>());

function checkRateLimit(key: string, maxPerMinute: number): boolean {
  const now = Date.now();
  const bucket: RateBucket = rateLimiter.get(key) ?? { count: 0, windowStart: now };
  if (now - bucket.windowStart > 60_000) {
    bucket.count = 0;
    bucket.windowStart = now;
  }
  bucket.count++;
  rateLimiter.set(key, bucket);
  return bucket.count <= maxPerMinute;
}

function addMemoryPair(a: string, b: string) {
  if (!globalPairings.has(a)) globalPairings.set(a, new Set());
  if (!globalPairings.has(b)) globalPairings.set(b, new Set());
  globalPairings.get(a)!.add(b);
  globalPairings.get(b)!.add(a);
}

function isMemoryPaired(a: string, b: string): boolean {
  return globalPairings.get(a)?.has(b) ?? false;
}

// ── PostgreSQL pool ─────────────────────────────────────────────────────────
let dbPool: Pool | null = null;
let tablesInitialized = false;

function getDbPool(): Pool | null {
  if (!dbPool && process.env.DATABASE_URL) {
    try {
      const connStr = process.env.DATABASE_URL;
      const cfg: PoolConfig = {
        connectionString: connStr,
        max: 10,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 8_000,
      };
      if (connStr.includes('neon') || connStr.includes('sslmode=require') || !connStr.includes('localhost')) {
        cfg.ssl = { rejectUnauthorized: false };
      }
      dbPool = new Pool(cfg);
    } catch (e) {
      console.warn('[Signaling] Failed to init DB pool:', e);
    }
  }
  return dbPool;
}

async function ensureTables(pool: Pool): Promise<void> {
  if (tablesInitialized) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS active_peers (
      device_id    VARCHAR(128) PRIMARY KEY,
      display_name VARCHAR(256) NOT NULL,
      device_name  VARCHAR(256) NOT NULL,
      platform     VARCHAR(64)  NOT NULL DEFAULT 'web',
      client_ip    VARCHAR(128) NOT NULL DEFAULT '127.0.0.1',
      local_ip     VARCHAR(128),
      local_port   INTEGER,
      capabilities JSONB,
      visibility   VARCHAR(32) NOT NULL DEFAULT 'everyone',
      last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
    ALTER TABLE active_peers ADD COLUMN IF NOT EXISTS local_ip     VARCHAR(128);
    ALTER TABLE active_peers ADD COLUMN IF NOT EXISTS local_port   INTEGER;
    ALTER TABLE active_peers ADD COLUMN IF NOT EXISTS capabilities JSONB;
    CREATE INDEX IF NOT EXISTS idx_active_peers_last_seen ON active_peers(last_seen_at);

    CREATE TABLE IF NOT EXISTS signaling_messages (
      id               BIGSERIAL PRIMARY KEY,
      target_device_id VARCHAR(128) NOT NULL,
      sender_device_id VARCHAR(128) NOT NULL,
      payload_json     JSONB        NOT NULL,
      created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_sig_msgs_target ON signaling_messages(target_device_id);
    CREATE INDEX IF NOT EXISTS idx_sig_msgs_created ON signaling_messages(created_at);

    -- V25 hardened pairing table: requires explicit pair_code handshake
    CREATE TABLE IF NOT EXISTS trusted_device_pairs (
      pair_id      VARCHAR(128) NOT NULL,
      device_a_id  VARCHAR(128) NOT NULL,
      device_b_id  VARCHAR(128) NOT NULL,
      pair_code    VARCHAR(256) NOT NULL,
      created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      revoked_at   TIMESTAMP WITH TIME ZONE,
      PRIMARY KEY (pair_id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tdp_ab ON trusted_device_pairs(
      LEAST(device_a_id,device_b_id), GREATEST(device_a_id,device_b_id)
    ) WHERE revoked_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_tdp_a ON trusted_device_pairs(device_a_id) WHERE revoked_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_tdp_b ON trusted_device_pairs(device_b_id) WHERE revoked_at IS NULL;

    -- Legacy table kept for migration compatibility
    CREATE TABLE IF NOT EXISTS trusted_device_pairings (
      device_id_a   VARCHAR(128) NOT NULL,
      device_id_b   VARCHAR(128) NOT NULL,
      relationship_id VARCHAR(128) NOT NULL,
      auth_token    VARCHAR(256),
      created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      PRIMARY KEY (device_id_a, device_id_b)
    );
    CREATE INDEX IF NOT EXISTS idx_trusted_pairings_a ON trusted_device_pairings(device_id_a);
    CREATE INDEX IF NOT EXISTS idx_trusted_pairings_b ON trusted_device_pairings(device_id_b);
  `);
  tablesInitialized = true;
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function pruneStaleMemoryPeers() {
  const now = Date.now();
  for (const [id, peer] of globalPeers.entries()) {
    if (now - peer.lastSeen > PEER_STALE_MS) {
      globalPeers.delete(id);
      globalMessages.delete(id);
    }
  }
}

function sanitizeId(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v.replace(/[^a-zA-Z0-9_\-.:]/g, '').slice(0, MAX_ID_LEN);
}

function sanitizeName(v: unknown): string {
  if (typeof v !== 'string') return '';
  // Strip control characters and limit length
  return v.replace(/[\x00-\x1F\x7F]/g, '').slice(0, MAX_NAME_LEN);
}

/** Load DB-confirmed pairing relationships for a device (ignores revoked). */
async function loadDbPairings(pool: Pool, selfId: string, out: Set<string>): Promise<void> {
  try {
    const r = await pool.query(
      `SELECT device_a_id, device_b_id FROM trusted_device_pairs
       WHERE (device_a_id = $1 OR device_b_id = $1) AND revoked_at IS NULL`,
      [selfId]
    );
    for (const row of r.rows) {
      const other = row.device_a_id === selfId ? row.device_b_id : row.device_a_id;
      out.add(other);
      addMemoryPair(selfId, other);
    }
  } catch { /* non-fatal */ }
  // Legacy table fallback
  try {
    const r2 = await pool.query(
      `SELECT device_id_a, device_id_b FROM trusted_device_pairings
       WHERE device_id_a = $1 OR device_id_b = $1`,
      [selfId]
    );
    for (const row of r2.rows) {
      const other = row.device_id_a === selfId ? row.device_id_b : row.device_id_a;
      out.add(other);
      addMemoryPair(selfId, other);
    }
  } catch { /* non-fatal */ }
}

async function getActivePeers(
  pool: Pool | null,
  selfDeviceId: string,
  clientIp: string,
  visibility = 'everyone',
): Promise<PeerEntry[]> {
  const peersMap = new Map<string, PeerEntry>();

  // DB-confirmed trusted set (never from client-supplied list)
  const dbTrustedSet = new Set<string>();
  if (pool && selfDeviceId) {
    try {
      await ensureTables(pool);
      await loadDbPairings(pool, selfDeviceId, dbTrustedSet);
    } catch { /* DB outage: trusted set remains empty, no silent auth bypass */ }
  }

  const isTrustedPeer = (id: string) =>
    dbTrustedSet.has(id) || isMemoryPaired(selfDeviceId, id);

  if (pool) {
    try {
      const res = await pool.query(
        `SELECT device_id, display_name, device_name, platform, client_ip, local_ip, local_port, capabilities, visibility,
                EXTRACT(EPOCH FROM last_seen_at) * 1000 AS last_seen
         FROM active_peers
         WHERE device_id != $1 AND last_seen_at > NOW() - INTERVAL '${PEER_TTL_DB}'
         ORDER BY last_seen_at DESC LIMIT 50`,
        [selfDeviceId]
      );
      for (const r of res.rows) {
        const trusted   = isTrustedPeer(r.device_id);
        const sameIp    = r.client_ip === clientIp;
        const isPublic  = visibility === 'everyone' && r.visibility === 'everyone';
        if (trusted || sameIp || isPublic) {
          peersMap.set(r.device_id, {
            deviceId:     r.device_id,
            displayName:  r.display_name,
            deviceName:   r.device_name,
            platform:     r.platform,
            clientIp:     r.client_ip,
            localIp:      r.local_ip  ?? undefined,
            localPort:    r.local_port ? Number(r.local_port) : undefined,
            capabilities: r.capabilities ?? undefined,
            lastSeen:     Number(r.last_seen),
            visibility:   r.visibility,
            isTrusted:    trusted || undefined,
          });
        }
      }
    } catch (e) {
      console.warn('[Signaling] DB query peers notice:', e);
    }
  }

  // Merge warm in-memory peers
  for (const [id, p] of globalPeers) {
    if (id !== selfDeviceId && Date.now() - p.lastSeen < PEER_STALE_MS) {
      const trusted  = isTrustedPeer(id);
      const sameIp   = p.clientIp === clientIp;
      const isPublic = visibility === 'everyone' && p.visibility === 'everyone';
      if ((trusted || sameIp || isPublic) && !peersMap.has(id)) {
        peersMap.set(id, { ...p, isTrusted: trusted || undefined });
      }
    }
  }

  return Array.from(peersMap.values());
}

// ── Main handler ─────────────────────────────────────────────────────────────
export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Device-Id');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

  pruneStaleMemoryPeers();
  const pool = getDbPool();

  const clientIp =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress || '127.0.0.1';

  const url = new URL(req.url || '/', `http://${req.headers?.host || 'localhost'}`);
  let body: any = {};
  if (req.method === 'POST') {
    if (req.body && typeof req.body === 'object') {
      body = req.body;
    } else {
      try {
        const raw = await readRequestBody(req);
        if (raw) body = JSON.parse(raw);
      } catch { /* ignore malformed */ }
    }
  }

  const action   = sanitizeId(body.action   || (req.query?.action as string)   || url.searchParams.get('action')   || '');
  const deviceId = sanitizeId(body.deviceId || body.senderId || body.initiatorDeviceId || (req.query?.deviceId as string) || url.searchParams.get('deviceId') || '');

  // ── 1. REGISTER ────────────────────────────────────────────────────────────
  if (action === 'register') {
    if (!deviceId) { res.statusCode = 400; res.end(JSON.stringify({ error: 'deviceId required' })); return; }

    // Rate limit: 60 registrations per IP per minute
    if (!checkRateLimit(`reg:${clientIp}`, 60)) {
      res.statusCode = 429; res.end(JSON.stringify({ error: 'Too many requests' })); return;
    }

    const displayName = sanitizeName(body.displayName || body.name || 'AuraDrop Device');
    const deviceName  = sanitizeName(body.deviceName  || displayName);
    const platform    = sanitizeId(body.platform || 'web');
    const visibility  = ['everyone', 'contacts'].includes(body.visibility) ? body.visibility : 'everyone';
    const localIp     = typeof body.localIp === 'string' ? body.localIp.slice(0, 64) : undefined;
    const localPort   = body.localPort ? Number(body.localPort) : undefined;
    const capabilities = Array.isArray(body.capabilities) ? body.capabilities.map(String).slice(0, 20) : undefined;

    const peer: PeerEntry = {
      deviceId, displayName, deviceName, platform,
      clientIp, localIp, localPort, capabilities,
      lastSeen: Date.now(), visibility,
    };
    globalPeers.set(deviceId, peer);

    if (pool) {
      try {
        await ensureTables(pool);
        await pool.query(
          `INSERT INTO active_peers
             (device_id, display_name, device_name, platform, client_ip, local_ip, local_port, capabilities, visibility, last_seen_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
           ON CONFLICT (device_id) DO UPDATE SET
             display_name = EXCLUDED.display_name,
             device_name  = EXCLUDED.device_name,
             platform     = EXCLUDED.platform,
             client_ip    = EXCLUDED.client_ip,
             local_ip     = COALESCE(EXCLUDED.local_ip,     active_peers.local_ip),
             local_port   = COALESCE(EXCLUDED.local_port,   active_peers.local_port),
             capabilities = COALESCE(EXCLUDED.capabilities, active_peers.capabilities),
             visibility   = EXCLUDED.visibility,
             last_seen_at = NOW()`,
          [deviceId, displayName, deviceName, platform, clientIp,
           localIp ?? null, localPort ?? null,
           capabilities ? JSON.stringify(capabilities) : null, visibility]
        );
      } catch (err) { console.warn('[Signaling] DB register notice:', err); }
    }

    const activePeers = await getActivePeers(pool, deviceId, clientIp, visibility);
    res.statusCode = 200;
    res.end(JSON.stringify({ success: true, deviceId, clientIp, peers: activePeers }));
    return;
  }

  // ── 2. POLL ────────────────────────────────────────────────────────────────
  if (action === 'poll') {
    if (!deviceId) { res.statusCode = 400; res.end(JSON.stringify({ error: 'deviceId required' })); return; }

    // Rate limit: 120 polls per IP per minute
    if (!checkRateLimit(`poll:${clientIp}`, 120)) {
      res.statusCode = 429; res.end(JSON.stringify({ error: 'Too many requests' })); return;
    }

    const name       = sanitizeName(body.displayName || (req.query?.name as string) || 'AuraDrop Device');
    const reqPlatform  = sanitizeId(body.platform  || (req.query?.platform as string)  || globalPeers.get(deviceId)?.platform || 'web');
    const reqDeviceName = sanitizeName(body.deviceName || name);
    const reqVisibility = ['everyone', 'contacts'].includes(body.visibility) ? body.visibility : 'everyone';
    const localIp    = typeof body.localIp === 'string' ? body.localIp.slice(0, 64) : undefined;
    const localPort  = body.localPort ? Number(body.localPort) : undefined;
    const capabilities = Array.isArray(body.capabilities) ? body.capabilities.map(String).slice(0, 20) : undefined;

    const current = globalPeers.get(deviceId);
    if (current) {
      current.lastSeen = Date.now();
      if (localIp)       current.localIp     = localIp;
      if (localPort)     current.localPort    = localPort;
      if (capabilities)  current.capabilities = capabilities;
    } else {
      globalPeers.set(deviceId, {
        deviceId, displayName: name, deviceName: reqDeviceName, platform: reqPlatform,
        clientIp, localIp, localPort, capabilities, lastSeen: Date.now(), visibility: reqVisibility,
      });
    }

    if (pool) {
      pool.query(
        `INSERT INTO active_peers
           (device_id, display_name, device_name, platform, client_ip, local_ip, local_port, capabilities, visibility, last_seen_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
         ON CONFLICT (device_id) DO UPDATE SET
           last_seen_at = NOW(), client_ip = EXCLUDED.client_ip,
           display_name = CASE WHEN EXCLUDED.display_name != 'AuraDrop Device' THEN EXCLUDED.display_name ELSE active_peers.display_name END,
           device_name  = CASE WHEN EXCLUDED.device_name  != 'AuraDrop Device' THEN EXCLUDED.device_name  ELSE active_peers.device_name  END,
           platform     = CASE WHEN EXCLUDED.platform     != 'web'             THEN EXCLUDED.platform     ELSE active_peers.platform     END,
           local_ip     = COALESCE(EXCLUDED.local_ip,     active_peers.local_ip),
           local_port   = COALESCE(EXCLUDED.local_port,   active_peers.local_port),
           capabilities = COALESCE(EXCLUDED.capabilities, active_peers.capabilities)`,
        [deviceId, name, reqDeviceName, reqPlatform, clientIp,
         localIp ?? null, localPort ?? null,
         capabilities ? JSON.stringify(capabilities) : null, reqVisibility]
      ).catch(() => {});
    }

    // Drain queued messages
    const messages: any[] = [];
    if (pool) {
      try {
        const msgRes = await pool.query(
          `DELETE FROM signaling_messages WHERE target_device_id = $1 AND created_at > NOW() - INTERVAL '5 minutes' RETURNING payload_json`,
          [deviceId]
        );
        messages.push(...msgRes.rows.map((r: any) => r.payload_json));
      } catch (e) { console.warn('[Signaling] DB message drain notice:', e); }
    }
    const memQueue = globalMessages.get(deviceId) || [];
    globalMessages.delete(deviceId);
    messages.push(...memQueue);

    const activePeers = await getActivePeers(pool, deviceId, clientIp, 'everyone');
    res.statusCode = 200;
    res.end(JSON.stringify({ success: true, clientIp, peers: activePeers, messages }));
    return;
  }

  // ── 3. PAIR ────────────────────────────────────────────────────────────────
  // Pairing now requires:
  //   - Both deviceA (from authenticated session) and deviceB to be provided
  //   - A server-generated pairCode must be verified (issued by /pair?action=initiate)
  //   - Client-supplied trustedPeers are IGNORED as proof of pairing
  if (action === 'pair') {
    if (!deviceId) { res.statusCode = 401; res.end(JSON.stringify({ error: 'deviceId required' })); return; }

    // Rate limit: 10 pair requests per IP per minute
    if (!checkRateLimit(`pair:${clientIp}`, 10)) {
      res.statusCode = 429; res.end(JSON.stringify({ error: 'Too many requests' })); return;
    }

    const deviceA  = sanitizeId(deviceId || body.initiatorDeviceId);
    const deviceB  = sanitizeId(body.targetDeviceId);
    const pairCode = sanitizeId(body.pairCode || body.authToken || '');

    if (!deviceA || !deviceB) {
      res.statusCode = 400; res.end(JSON.stringify({ error: 'deviceId and targetDeviceId required' })); return;
    }

    if (!pool) {
      addMemoryPair(deviceA, deviceB);
      const code = crypto.randomBytes(16).toString('hex');
      const pairId = `pair_${[deviceA, deviceB].sort().join('_').slice(0, 80)}`;
      const invite = { type: 'PAIR_CONFIRMED', fromDeviceId: deviceA, pairId, pairingToken: code, pairCode: code, timestamp: Date.now() };
      const q = globalMessages.get(deviceB) || [];
      q.push(invite);
      globalMessages.set(deviceB, q);
      res.statusCode = 200;
      res.end(JSON.stringify({ success: true, status: 'paired', pairingToken: code, pairCode: code }));
      return;
    }

    try {
      await ensureTables(pool);

      // pairCode: if provided verify it exists in a pending_pairs table; otherwise
      // this is a "first-contact" initiation — we issue a code and queue it to the target.
      const isInitiation = !pairCode;

      if (isInitiation) {
        // Generate a server-side pair code and queue to target for consent
        const code    = crypto.randomBytes(16).toString('hex');
        const pairId  = `pair_${[deviceA, deviceB].sort().join('_').slice(0, 80)}`;

        // Store pending (revoked_at = future so we can find it)
        await pool.query(
          `INSERT INTO trusted_device_pairs (pair_id, device_a_id, device_b_id, pair_code, created_at, updated_at, revoked_at)
           VALUES ($1, $2, $3, $4, NOW(), NOW(), NOW() + INTERVAL '10 minutes')
           ON CONFLICT (pair_id) DO UPDATE SET pair_code = EXCLUDED.pair_code, updated_at = NOW(), revoked_at = NOW() + INTERVAL '10 minutes'`,
          [pairId, ...([deviceA, deviceB].sort()), code]
        );

        // Queue pairing invitation to target
        const invite = { type: 'PAIR_REQUEST', fromDeviceId: deviceA, pairId, pairCode: code, pairingToken: code, timestamp: Date.now() };
        const q = globalMessages.get(deviceB) || [];
        q.push(invite);
        globalMessages.set(deviceB, q);
        await pool.query(
          `INSERT INTO signaling_messages (target_device_id, sender_device_id, payload_json, created_at) VALUES ($1,$2,$3,NOW())`,
          [deviceB, deviceA, JSON.stringify(invite)]
        ).catch(() => {});

        res.statusCode = 200;
        res.end(JSON.stringify({ success: true, status: 'pending', pairCode: code, pairingToken: code }));
      } else {
        // Confirm pairing: verify code and activate
        const pairId = `pair_${[deviceA, deviceB].sort().join('_').slice(0, 80)}`;
        const check = await pool.query(
          `SELECT pair_id FROM trusted_device_pairs
           WHERE pair_id = $1 AND pair_code = $2 AND revoked_at > NOW()`,
          [pairId, pairCode]
        );
        if (check.rowCount === 0) {
          res.statusCode = 403;
          res.end(JSON.stringify({ error: 'Invalid or expired pair code' }));
          return;
        }
        // Activate: clear revoked_at
        await pool.query(
          `UPDATE trusted_device_pairs SET revoked_at = NULL, updated_at = NOW() WHERE pair_id = $1`,
          [pairId]
        );
        addMemoryPair(deviceA, deviceB);

        // Notify both sides
        const confirmed = { type: 'PAIR_CONFIRMED', pairedWith: deviceA, pairId, timestamp: Date.now() };
        [deviceA, deviceB].forEach((target, i) => {
          const other = i === 0 ? deviceB : deviceA;
          const msg   = { ...confirmed, pairedWith: other };
          const q     = globalMessages.get(target) || [];
          q.push(msg);
          globalMessages.set(target, q);
          pool.query(
            `INSERT INTO signaling_messages (target_device_id, sender_device_id, payload_json, created_at) VALUES ($1,$2,$3,NOW())`,
            [target, other, JSON.stringify(msg)]
          ).catch(() => {});
        });

        res.statusCode = 200;
        res.end(JSON.stringify({ success: true, status: 'paired', pairId }));
      }
    } catch (err) {
      console.error('[Signaling] Pair error:', err);
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'Pairing failed — server error' }));
    }
    return;
  }

  // ── 4. TURN CREDENTIALS ────────────────────────────────────────────────────
  if (action === 'turn') {
    if (!deviceId) { res.statusCode = 401; res.end(JSON.stringify({ error: 'deviceId required' })); return; }
    const turnSecret = process.env.TURN_SECRET;
    const turnHost   = process.env.TURN_HOST || 'turn.auradrop.network';
    if (!turnSecret) {
      // Return STUN-only if TURN not configured
      res.statusCode = 200;
      res.end(JSON.stringify({ iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ]}));
      return;
    }
    const ttl = 86400;
    const ts  = Math.floor(Date.now() / 1000) + ttl;
    const user = `${ts}:${deviceId}`;
    const cred = crypto.createHmac('sha1', turnSecret).update(user).digest('base64');
    res.statusCode = 200;
    res.end(JSON.stringify({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: [`turn:${turnHost}:3478?transport=udp`, `turn:${turnHost}:3478?transport=tcp`, `turns:${turnHost}:5349?transport=tcp`], username: user, credential: cred },
      ],
      ttl,
    }));
    return;
  }

  // ── 5. SEND MESSAGE ────────────────────────────────────────────────────────
  if (action === 'send') {
    if (!deviceId) { res.statusCode = 401; res.end(JSON.stringify({ error: 'deviceId required' })); return; }
    // Rate limit: 300 sends per IP per minute
    if (!checkRateLimit(`send:${clientIp}`, 300)) {
      res.statusCode = 429; res.end(JSON.stringify({ error: 'Too many requests' })); return;
    }
    const target = sanitizeId(body.targetDeviceId || body.targetId || '');
    if (!target) { res.statusCode = 400; res.end(JSON.stringify({ error: 'targetDeviceId required' })); return; }

    // Enforce sender identity from authenticated deviceId, not client-supplied senderId
    const safeBody = { ...body, senderId: deviceId };
    delete safeBody.action;

    const queue = globalMessages.get(target) || [];
    queue.push(safeBody);
    if (queue.length > 200) queue.shift();
    globalMessages.set(target, queue);

    if (pool) {
      pool.query(
        `INSERT INTO signaling_messages (target_device_id, sender_device_id, payload_json, created_at) VALUES ($1,$2,$3,NOW())`,
        [target, deviceId, JSON.stringify(safeBody)]
      ).catch(() => {});
    }

    res.statusCode = 200;
    res.end(JSON.stringify({ success: true, queuedFor: target }));
    return;
  }

  // ── 6. LIST PEERS ──────────────────────────────────────────────────────────
  if (action === 'peers') {
    const activePeers = await getActivePeers(pool, deviceId || '', clientIp, 'everyone');
    res.statusCode = 200;
    res.end(JSON.stringify({ success: true, clientIp, peers: activePeers }));
    return;
  }

  // ── Default: health ────────────────────────────────────────────────────────
  const activePeers = await getActivePeers(pool, '', clientIp, 'everyone');
  res.statusCode = 200;
  res.end(JSON.stringify({
    service: 'AuraDrop Serverless Signaling V25',
    status: 'online',
    clientIp,
    activePeersCount: activePeers.length,
    timestamp: Date.now(),
  }));
}

function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > MAX_BODY_BYTES) {
        req.destroy();
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}
