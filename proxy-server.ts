/**
 * proxy-server.ts  (hoặc proxy-server.js nếu không dùng TypeScript)
 * ─────────────────────────────────────────────────────────────────────────────
 * Express proxy server đơn giản chạy trên VPS/local.
 * Nhận request từ trình duyệt → forward đến AI Studio với Cookie.
 *
 * CÀI ĐẶT:
 *   npm install express http-proxy-middleware cors
 *   npx ts-node proxy-server.ts        # chạy thủ công
 *   npx pm2 start proxy-server.ts      # chạy nền với PM2
 *
 * VPS KHUYÊN DÙNG:
 *   - DigitalOcean Droplet $6/tháng (1 vCPU, 1GB RAM) – đủ dùng
 *   - Hetzner CX11 €3.79/tháng – rẻ nhất châu Âu
 *   - Vultr $2.5/tháng (IPv6 only) – dùng khi tiết kiệm
 *
 * CLOUDFLARE WORKER (miễn phí, không cần VPS):
 *   Xem file cloudflare-worker.js bên dưới.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import express from 'express';
import cors from 'cors';
import https from 'https';
import { URL } from 'url';

const app = express();
const PORT = process.env.PORT || 3001;

// ── Cấu hình CORS (cho phép domain frontend của bạn) ─────────────────────────
const ALLOWED_ORIGINS = [
  'http://localhost:5173',      // Vite dev server
  'http://localhost:4173',      // Vite preview
  'https://your-domain.com',    // ← Thay bằng domain thật của bạn
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS: origin không được phép'));
    }
  },
  credentials: true,
}));

app.use(express.json({ limit: '50mb' }));

// ── Target AI Studio ──────────────────────────────────────────────────────────
const AISTUDIO_HOST = 'generativelanguage.googleapis.com';

// ── Proxy chính: /api/aistudio-proxy/* → googleapis.com/* ────────────────────
app.all('/api/aistudio-proxy/*', (req, res) => {
  // Tách path sau prefix
  const targetPath = req.path.replace('/api/aistudio-proxy', '');

  const options = {
    hostname: AISTUDIO_HOST,
    path: targetPath + (req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : ''),
    method: req.method,
    headers: {
      ...req.headers,
      host: AISTUDIO_HOST,
    } as Record<string, string | string[]>,
  };

  // Xoá headers không cần
  delete (options.headers as any)['content-length']; // sẽ được tính lại
  (options.headers as any)['content-length'] = Buffer.byteLength(JSON.stringify(req.body || {})).toString();

  const proxyReq = https.request(options, (proxyRes) => {
    res.status(proxyRes.statusCode || 502);
    Object.entries(proxyRes.headers).forEach(([k, v]) => {
      if (v !== undefined) res.setHeader(k, v);
    });
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('[Proxy] Error:', err.message);
    res.status(502).json({ error: 'Proxy error', detail: err.message });
  });

  if (req.body && Object.keys(req.body).length > 0) {
    proxyReq.write(JSON.stringify(req.body));
  }

  proxyReq.end();
});

// ── Proxy tải video: /api/aistudio-proxy/video-fetch?uri=... ─────────────────
// Endpoint này tải video từ URI của Google và trả về dưới dạng blob
// để tránh lỗi CORS khi trình duyệt truy cập trực tiếp
app.get('/api/aistudio-proxy/video-fetch', (req, res) => {
  const uri = req.query.uri as string;
  const cookie = req.headers['cookie'] || '';

  if (!uri) {
    res.status(400).json({ error: 'Missing uri parameter' });
    return;
  }

  try {
    const url = new URL(uri);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'Cookie': cookie,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    };

    const fetchReq = https.request(options, (fetchRes) => {
      res.status(fetchRes.statusCode || 200);
      res.setHeader('Content-Type', fetchRes.headers['content-type'] || 'video/mp4');
      res.setHeader('Content-Disposition', 'attachment; filename="video.mp4"');
      fetchRes.pipe(res);
    });

    fetchReq.on('error', (err) => {
      res.status(502).json({ error: err.message });
    });

    fetchReq.end();
  } catch (err: any) {
    res.status(400).json({ error: 'Invalid URI', detail: err.message });
  }
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`[Proxy] Đang chạy tại http://localhost:${PORT}`);
  console.log(`[Proxy] Health check: http://localhost:${PORT}/health`);
});

export default app;


/*
 * ═══════════════════════════════════════════════════════════════════════════
 * CLOUDFLARE WORKER (thay thế miễn phí cho VPS)
 * ─────────────────────────────────────────────────────────────────────────
 * Dán code dưới vào https://workers.cloudflare.com → tạo Worker mới
 * Sau đó thay AISTUDIO_BASE trong geminiCookie.ts bằng URL Worker của bạn.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * // cloudflare-worker.js
 * addEventListener('fetch', event => {
 *   event.respondWith(handleRequest(event.request));
 * });
 *
 * const ALLOWED_ORIGINS = ['https://your-domain.com'];
 *
 * async function handleRequest(request) {
 *   const url = new URL(request.url);
 *   const origin = request.headers.get('Origin') || '';
 *
 *   // CORS preflight
 *   if (request.method === 'OPTIONS') {
 *     return new Response(null, {
 *       headers: {
 *         'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : '',
 *         'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
 *         'Access-Control-Allow-Headers': 'Content-Type, Cookie, x-requested-with',
 *         'Access-Control-Max-Age': '86400',
 *       },
 *     });
 *   }
 *
 *   // Proxy path: /v1/models/... hoặc /v1/operations/...
 *   const targetPath = url.pathname + url.search;
 *   const targetUrl = `https://generativelanguage.googleapis.com${targetPath}`;
 *
 *   const newHeaders = new Headers(request.headers);
 *   newHeaders.set('Host', 'generativelanguage.googleapis.com');
 *   newHeaders.set('Origin', 'https://aistudio.google.com');
 *   newHeaders.set('Referer', 'https://aistudio.google.com/');
 *
 *   const proxied = new Request(targetUrl, {
 *     method: request.method,
 *     headers: newHeaders,
 *     body: request.method !== 'GET' ? request.body : null,
 *   });
 *
 *   const response = await fetch(proxied);
 *   const respHeaders = new Headers(response.headers);
 *   respHeaders.set('Access-Control-Allow-Origin', ALLOWED_ORIGINS.includes(origin) ? origin : '');
 *
 *   return new Response(response.body, {
 *     status: response.status,
 *     headers: respHeaders,
 *   });
 * }
 */
