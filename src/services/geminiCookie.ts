/**
 * geminiCookie.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Tạo video Veo qua Google AI Studio Cookie (thay vì API key).
 *
 * ĐẶT FILE NÀY VÀO: src/services/geminiCookie.ts
 *
 * CÁCH DÙNG:
 *   import { generateVeoVideoByCookie, parseCookieString } from './geminiCookie';
 *
 * LƯU Ý AN TOÀN:
 *   - Cookie chỉ lưu trong state/localStorage của trình duyệt người dùng.
 *   - KHÔNG bao giờ gửi cookie lên server của bạn.
 *   - Mỗi request đi thẳng từ trình duyệt → Google (CORS proxy hoặc
 *     extension nếu chạy local, hoặc Cloudflare Worker nếu deploy).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Resolution, AspectRatio, VideoMode } from '../types';
import { translate } from '../i18n';

// ── Kiểu dữ liệu ──────────────────────────────────────────────────────────────

export interface CookieVideoRequest {
  mode: VideoMode;
  prompt: string;
  resolution: Resolution;
  aspectRatio: AspectRatio;
  images?: string[];            // base64
  previousVideo?: any;          // videoRef từ video trước (dùng cho nối video)
  negativePrompt?: string;
  onProgress?: (msg: string) => void;
  lang?: 'EN' | 'VN';
  cookieString: string;         // Cookie thô dán vào UI
  proxyUrl?: string;            // URL proxy nếu cần (xem hướng dẫn bên dưới)
}

export interface CookieVideoResult {
  finalUrl: string;
  videoRef?: any;
}

// ── Endpoint của AI Studio (đi qua proxy để tránh CORS) ───────────────────────
// Khi chạy local (Vite dev): cấu hình Vite proxy hoặc dùng Chrome Extension
// Khi deploy (Vercel/VPS): dùng Cloudflare Worker hoặc Express proxy server
const AISTUDIO_BASE = 'https://gentle-credit-a948.yohu-vn.workers.dev'; // ← thay thành URL proxy của bạn

// Model mặc định (ưu tiên lite để tiết kiệm quota)
const VEO_MODELS = ['veo-3.1-lite-generate-preview', 'veo-3.1-generate-preview'];

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ── Tiện ích ──────────────────────────────────────────────────────────────────

/**
 * Chuyển chuỗi cookie thô thành object header.
 * Người dùng mở DevTools → Application → Cookies → copy tất cả rồi paste vào ô.
 */
export const parseCookieString = (raw: string): string => {
  if (!raw || typeof raw !== 'string') return '';
  // Loại bỏ ký tự thừa, giữ định dạng "key=value; key2=value2"
  return raw.trim().replace(/\n/g, '; ').replace(/\s{2,}/g, ' ');
};

/** Lấy base64 thuần (bỏ header data:...) */
const getRawBase64 = (b64: string): string => {
  if (!b64) return '';
  const parts = b64.split(',');
  return parts.length > 1 ? parts[1] : parts[0];
};

/** Headers chung cho mọi request tới AI Studio */
const buildHeaders = (cookie: string): HeadersInit => ({
  'Content-Type': 'application/json',
  'Cookie': cookie,
  'Origin': 'https://aistudio.google.com',
  'Referer': 'https://aistudio.google.com/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36',
  'X-Requested-With': 'XMLHttpRequest',
});

// ── Hàm submit job ─────────────────────────────────────────────────────────────

const submitVeoJob = async (
  req: CookieVideoRequest,
  modelName: string,
): Promise<string> => {
  const cookie = parseCookieString(req.cookieString);
  const proxyBase = req.proxyUrl || AISTUDIO_BASE;

  let apiAspectRatio: '16:9' | '9:16' | '1:1' = '16:9';
  if (req.aspectRatio === AspectRatio.PORTRAIT || req.aspectRatio === AspectRatio.SUPER_TALL) {
    apiAspectRatio = '9:16';
  } else if (req.aspectRatio === AspectRatio.SQUARE) {
    apiAspectRatio = '1:1';
  }

  const body: any = {
    prompt: req.prompt,
    model: modelName,
    config: {
      numberOfVideos: 1,
      resolution: req.resolution,
      aspectRatio: apiAspectRatio,
      ...(req.negativePrompt ? { negativePrompt: req.negativePrompt } : {}),
    },
  };

  // Nối video (seamless flow) – giữ nguyên logic của API key
  if (req.previousVideo) {
    body.video = {
      videoBytes: getRawBase64(req.previousVideo),
      mimeType: 'video/mp4',
    };
  } else if (req.mode === VideoMode.IMAGE_TO_VIDEO && req.images?.[0]) {
    body.image = { imageBytes: getRawBase64(req.images[0]), mimeType: 'image/png' };
  } else if (req.mode === VideoMode.INTERPOLATION && req.images?.[1]) {
    body.image = { imageBytes: getRawBase64(req.images[0]), mimeType: 'image/png' };
    body.config.lastFrame = { imageBytes: getRawBase64(req.images[1]), mimeType: 'image/png' };
  } else if (req.mode === VideoMode.CONSISTENCY && req.images?.length) {
    body.config.referenceImages = req.images.slice(0, 3).map(img => ({
      image: { imageBytes: getRawBase64(img), mimeType: 'image/png' },
      referenceType: 'ASSET',
    }));
  }

  const res = await fetch(`${proxyBase}/v1/models/${modelName}:generateVideos`, {
    method: 'POST',
    headers: buildHeaders(cookie),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`[Cookie] Submit failed ${res.status}: ${text}`);
  }

  const data = await res.json();
  // Trả về operation name để poll
  if (!data.name) throw new Error('[Cookie] No operation name returned');
  return data.name as string;
};

// ── Hàm poll operation ────────────────────────────────────────────────────────

const pollOperation = async (
  operationName: string,
  cookie: string,
  onProgress: (msg: string) => void,
  lang: 'EN' | 'VN',
  proxyBase: string,
): Promise<any> => {
  const maxAttempts = 60; // 60 × 10s = 10 phút timeout
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(10_000);
    onProgress(translate('PROGRESS_RENDERING', lang));

    const res = await fetch(`${proxyBase}/v1/operations/${operationName}`, {
      method: 'GET',
      headers: buildHeaders(cookie),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`[Cookie] Poll failed ${res.status}: ${text}`);
    }

    const op = await res.json();
    if (op.done) {
      if (op.error) throw new Error(op.error.message || 'Video generation failed');
      return op;
    }
  }
  throw new Error('[Cookie] Timeout: video generation exceeded 10 minutes');
};

// ── Tải video về Blob URL ─────────────────────────────────────────────────────

const fetchVideoBlob = async (uri: string, cookie: string, proxyBase: string): Promise<string> => {
  try {
    const res = await fetch(`${proxyBase}/video-fetch?uri=${encodeURIComponent(uri)}`, {
      headers: buildHeaders(cookie),
    });
    if (!res.ok) throw new Error('Fetch blob failed');
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  } catch {
    // Fallback: trả URL trực tiếp (có thể bị CORS trên production)
    return uri;
  }
};

// ── HÀM CHÍNH: generateVeoVideoByCookie ──────────────────────────────────────

/**
 * Tương đương generateVeoVideo() nhưng dùng Cookie thay vì API key.
 * Giữ nguyên: retry model, poll loop, nối video liền mạch.
 */
export const generateVeoVideoByCookie = async (
  req: CookieVideoRequest,
): Promise<CookieVideoResult> => {
  const { onProgress, lang = 'VN', cookieString, proxyUrl } = req;
  const proxyBase = proxyUrl || AISTUDIO_BASE;

  if (!cookieString?.trim()) {
    throw Object.assign(new Error('Cookie chưa được nhập. Vui lòng paste Cookie vào ô Cookie Mode.'), { isCookieError: true });
  }

  const cookie = parseCookieString(cookieString);
  const isConsistency = req.mode === VideoMode.CONSISTENCY || !!req.previousVideo;

  // Ưu tiên model: nếu nối video dùng model pro trước
  const models = isConsistency
    ? [VEO_MODELS[1], VEO_MODELS[0]]
    : [VEO_MODELS[0], VEO_MODELS[1]];

  let lastError: Error | null = null;

  for (const modelName of models) {
    onProgress?.(`${translate('PROGRESS_INIT', lang)} (Cookie / ${modelName})`);

    try {
      // 1. Submit job
      const operationName = await submitVeoJob(req, modelName);

      // 2. Poll cho đến khi xong
      const op = await pollOperation(operationName, cookie, onProgress || (() => {}), lang, proxyBase);

      // 3. Lấy video
      const videoRef = op.response?.generatedVideos?.[0]?.video;
      if (!videoRef) throw new Error('[Cookie] No video in response');

      const finalUrl = await fetchVideoBlob(videoRef.uri, cookie, proxyBase);
      return { finalUrl, videoRef };

    } catch (err: any) {
      lastError = err;
      const msg = err.message || '';

      // Model không tồn tại → thử model tiếp theo
      if (msg.includes('404') || msg.includes('NOT_FOUND')) continue;

      // Cookie hết hạn / sai
      if (msg.includes('401') || msg.includes('403') || msg.includes('UNAUTHENTICATED')) {
        throw Object.assign(
          new Error('Cookie không hợp lệ hoặc đã hết hạn. Vui lòng lấy Cookie mới từ trình duyệt.'),
          { isCookieError: true }
        );
      }

      // Rate limit – thử lại sau
      if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
        onProgress?.('[Cookie] Rate limit – chờ 30 giây...');
        await sleep(30_000);
        continue;
      }

      throw err;
    }
  }

  throw lastError || new Error('[Cookie] All models failed');
};
