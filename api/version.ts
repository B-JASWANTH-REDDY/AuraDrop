import type { IncomingMessage, ServerResponse } from 'node:http';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=120, stale-while-revalidate=300');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  res.statusCode = 200;
  res.end(
    JSON.stringify({
      version: '2.0.1',
      version_code: 4,
      status: 'healthy',
      live_control_plane: 'online',
      published_at: '2026-10-09T00:00:00Z',
      release_notes: 'AuraDrop v2.0.1: Ultra-fast 100+ MB/s transfers, pure black minimal UI, 24/7 real peer proximity detection, zero QR dependencies, cross-platform P2P Chat Hub, and live serverless control plane.',
      downloads: {
        windows: {
          setup: '/downloads/AuraDrop-Setup.exe',
          msi: '/downloads/AuraDrop-Windows.msi',
          zip: '/downloads/AuraDrop-Windows.zip',
          version: '2.0.1',
          size: '5.96 MB',
        },
        android: {
          apk: '/downloads/AuraDrop-Android.apk',
          version: '2.0.1',
          version_code: 4,
          size: '49.5 MB',
        },
        macos: {
          zip: '/downloads/AuraDrop-macOS.zip',
          version: '2.0.1',
          size: '197 KB',
        },
        linux: {
          zip: '/downloads/AuraDrop-Linux.zip',
          version: '2.0.1',
          size: '197 KB',
        },
      },
    }, null, 2)
  );
}
