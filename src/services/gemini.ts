import { GoogleGenAI, Modality } from "@google/genai";
import { Resolution, AspectRatio, VideoMode, UserProfile } from "../types";
 
import { translate } from "../i18n";
 
export interface VeoRequest {
  mode: VideoMode;
  prompt: string;
  resolution: Resolution;
  aspectRatio: AspectRatio;
  images?: string[]; 
  previousVideo?: any; 
  negativePrompt?: string;
  onProgress?: (msg: string) => void;
  customApiKey?: string;
  profile?: UserProfile;
  lang?: 'EN' | 'VN';
  apiKeys?: string[];
  useProjectKey?: boolean;
}
 
const getRawBase64 = (base64String: string) => {
  if (!base64String) return "";
  const parts = base64String.split(',');
  return parts.length > 1 ? parts[1] : parts[0];
};
 
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
 
export const processKeys = (keys: string[]): string[] => {
  const allFoundKeys: string[] = [];
  const keyRegex = /AIzaSy[A-Za-z0-9_-]{33}/g;
 
  for (const k of keys) {
    if (!k || typeof k !== 'string') continue;
    
    const matches = k.match(keyRegex);
    if (matches) {
      allFoundKeys.push(...matches);
    } else {
      const parts = k.split(/[\s,;"']+/);
      for (const p of parts) {
        const trimmed = p.trim();
        if (trimmed.length >= 30 && trimmed.length <= 60 && /^[A-Za-z0-9_-]+$/.test(trimmed)) {
          allFoundKeys.push(trimmed);
        }
      }
    }
  }
  
  return Array.from(new Set(allFoundKeys)).filter(k => k && k.length > 20 && !k.toLowerCase().includes('placeholder'));
};
 
// ── resolveImageKeys: Dùng riêng cho tạo ảnh (FREE IMG = OFF) ──
// Thứ tự: freeKeys trước → paidKeys sau → không trộn lẫn
// Chuyển key ngay khi lỗi 429, không chờ retry
export const resolveImageKeys = (
  userApiKeys: string[],
  adminFreeKeys: string[],
  adminPaidKeys: string[]
): { freeKeys: string[]; paidKeys: string[] } => {
  const userKeys = processKeys(userApiKeys);
 
  // Env free keys
  const envFree = [
    import.meta.env.VITE_GEMINI_FREE_KEYS,
  ].flatMap(v => v ? v.split(',').map((k: string) => k.trim()).filter(Boolean) : []);
 
  // Env paid keys
  const envPaid = [
    import.meta.env.VITE_GEMINI_PAID_KEYS,
  ].flatMap(v => v ? v.split(',').map((k: string) => k.trim()).filter(Boolean) : []);
 
  const allFree = Array.from(new Set([...processKeys(envFree), ...adminFreeKeys]));
  const allPaid = Array.from(new Set([...userKeys, ...processKeys(envPaid), ...adminPaidKeys]));
 
  return { freeKeys: allFree, paidKeys: allPaid };
};
 
const resolveKeys = (apiKeys: string[], useProjectKey: boolean): string[] => {
  const envValues = [
    import.meta.env.VITE_GEMINI_API_KEY,
    import.meta.env.VITE_GEMINI_API_KEYS,
    import.meta.env.VITE_GEMINI_FREE_KEYS,
    import.meta.env.VITE_GEMINI_PAID_KEYS,
  ];
 
  if (typeof process !== 'undefined') {
    envValues.push(
      process.env.GEMINI_API_KEY,
      process.env.API_KEY,
      process.env.VITE_GEMINI_API_KEYS,
      process.env.VITE_GEMINI_FREE_KEYS,
      process.env.VITE_GEMINI_PAID_KEYS,
      process.env.GOOGLE_KEYS_PRO1,
      process.env.GOOGLE_KEY_PRO1,
      process.env.GOOGLE_KEYS_PRO9,
      process.env.GOOGLE_KEY_PRO9
    );
  }
 
  // Cookie / sessionStorage custom key (người dùng nhập vào UI)
  const customKey = typeof sessionStorage !== 'undefined'
    ? (sessionStorage.getItem('veopro_custom_key') || '')
    : '';
 
  const userKeys = processKeys(apiKeys);
 
  // Khi useProjectKey=false: ưu tiên customKey từ sessionStorage
  if (!useProjectKey && customKey && !customKey.startsWith('GOOGLE_KEY_')) {
    const parsed = processKeys([customKey]);
    for (const k of parsed) {
      if (!userKeys.includes(k)) userKeys.unshift(k);
    }
  }
 
  const sysKeys: string[] = [];
 
  if (useProjectKey || userKeys.length === 0) {
    for (const val of envValues) {
      if (val && typeof val === 'string') {
        const parts = val.split(',').map(k => k.trim()).filter(Boolean);
        sysKeys.push(...parts);
      }
    }
  }
 
  const finalUserKeys = Array.from(new Set(userKeys));
  const finalSysKeys = Array.from(new Set(processKeys(sysKeys))).filter(k => !finalUserKeys.includes(k));
 
  return [...finalUserKeys, ...finalSysKeys];
};
 
const parseErrorMessage = (err: any): string => {
  let msg = err.message || "";
  try {
    const parsed = JSON.parse(msg);
    if (parsed.error?.message) {
      msg = parsed.error.message;
      if (parsed.error.status) msg += ` (${parsed.error.status})`;
    }
  } catch { /* ignore */ }
  return msg;
};
 
const fetchVideoAsBlobUrl = async (uri: string, apiKey: string): Promise<string> => {
  try {
    const response = await fetch(uri, {
      method: 'GET',
      headers: {
        'x-goog-api-key': apiKey,
      },
    });
    if (!response.ok) throw new Error("Network error.");
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } catch (err) {
    console.error("Fetch blob failed:", err);
    // Fallback to query param for direct video tag usage if fetch fails
    const separator = uri.includes('?') ? '&' : '?';
    return `${uri}${separator}key=${apiKey}`; 
  }
};
 
export const generateVeoVideo = async ({
  mode,
  prompt,
  resolution,
  aspectRatio,
  images = [],
  previousVideo,
  onProgress,
  lang = 'EN',
  apiKeys = [],
  useProjectKey = true
}: VeoRequest): Promise<any> => {
  const uniqueKeys = resolveKeys(apiKeys, useProjectKey);
  
  if (uniqueKeys.length === 0) {
    const error = new Error("API Key missing. Please select an API key to continue.");
    (error as any).isKeyError = true;
    throw error;
  }
  
  let lastError: any = null;
  const userKeyCount = Array.from(new Set(processKeys(apiKeys))).length;
  const startIdx = userKeyCount > 0 ? 0 : Math.floor(Math.random() * uniqueKeys.length);
 
  for (let count = 0; count < uniqueKeys.length; count++) {
    const i = (startIdx + count) % uniqueKeys.length;
    const apiKey = uniqueKeys[i];
    const ai = new GoogleGenAI({ apiKey });
    
    const isConsistency = (mode === VideoMode.CONSISTENCY || previousVideo);
    
    // Video models 5/2026: lite (rẻ nhất) → fast → full (đắt nhất)
    // ⚠️ TẤT CẢ Veo đều TRẢ PHÍ - chỉ gọi khi có paid key
    const targetModels = isConsistency 
      ? ['veo-3.1-generate', 'veo-3-fast', 'veo-3.1-lite-generate-preview'] 
      : ['veo-3.1-lite-generate-preview', 'veo-3-fast', 'veo-3.1-generate'];
    
    onProgress?.(`${translate('PROGRESS_INIT', lang)} (Key ${i + 1}/${uniqueKeys.length})`);
 
    let apiAspectRatio: "16:9" | "9:16" | "1:1" = "16:9";
    if (aspectRatio === AspectRatio.PORTRAIT || aspectRatio === AspectRatio.SUPER_TALL) {
      apiAspectRatio = "9:16";
    } else if (aspectRatio === AspectRatio.SQUARE) {
      apiAspectRatio = "1:1";
    }
 
    let modelIdx = 0;
    let operation = null;
    let success = false;
 
    while (modelIdx < targetModels.length && !success) {
      const modelName = targetModels[modelIdx];
      try {
        const maxRetries = uniqueKeys.length > 1 ? 1 : 2;
        let retryCount = 0;
 
        const executeWithRetry = async (fn: () => Promise<any>): Promise<any> => {
          try {
            return await fn();
          } catch (error: any) {
            const errorMsg = parseErrorMessage(error);
 
            const isQuota = errorMsg.includes("429") || errorMsg.includes("RESOURCE_EXHAUSTED") || errorMsg.includes("quota") || errorMsg.includes("credits are depleted");
            const isUnavailable = errorMsg.includes("503") || errorMsg.includes("UNAVAILABLE") || errorMsg.includes("high demand");
            const isNotFound = errorMsg.includes("404") || errorMsg.includes("NOT_FOUND");
 
            if (isNotFound) {
               // Skip model and try next
               throw error;
            }
            
            if ((isQuota || isUnavailable) && retryCount < maxRetries) {
              retryCount++;
              const delay = isQuota 
                ? (Math.pow(2, retryCount) * 5000 + Math.random() * 2000)
                : (Math.pow(2, retryCount) * 3000);
              onProgress?.(`${translate('PROGRESS_RENDERING', lang)} (${isUnavailable ? 'Service Busy' : 'Quota'} - Retry ${retryCount}/${maxRetries}...)`);
              await sleep(delay);
              return await executeWithRetry(fn);
            }
            throw error;
          }
        };
 
        if (previousVideo) {
          onProgress?.(translate('PROGRESS_STITCH', lang));
          operation = await executeWithRetry(() => ai.models.generateVideos({
            model: modelName,
            prompt: prompt,
            video: { videoBytes: getRawBase64(previousVideo), mimeType: 'video/mp4' },
            config: { 
              numberOfVideos: 1, resolution, aspectRatio: apiAspectRatio,
              safetySettings: [
                { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
                { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
                { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
                { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
              ]
            }
          }));
        } else if (mode === VideoMode.CONSISTENCY && images.length > 0) {
          const referenceImages = images.slice(0, 3).map(img => ({
            image: { imageBytes: getRawBase64(img), mimeType: 'image/png' },
            referenceType: 'ASSET'
          }));
          onProgress?.(translate('PROGRESS_CONSISTENCY', lang));
          operation = await executeWithRetry(() => ai.models.generateVideos({
            model: modelName,
            prompt: prompt,
            config: { 
              numberOfVideos: 1, referenceImages, resolution, aspectRatio: apiAspectRatio,
              safetySettings: [
                { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
                { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
                { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
                { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
              ]
            }
          }));
        } else if (mode === VideoMode.IMAGE_TO_VIDEO && images.length > 0) {
          onProgress?.(translate('PROGRESS_RENDERING', lang));
          operation = await executeWithRetry(() => ai.models.generateVideos({
            model: modelName,
            prompt: prompt,
            image: { imageBytes: getRawBase64(images[0]), mimeType: 'image/png' },
            config: { 
              numberOfVideos: 1, resolution, aspectRatio: apiAspectRatio,
              safetySettings: [
                { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
                { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
                { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
                { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
              ]
            }
          }));
        } else if (mode === VideoMode.INTERPOLATION && images.length >= 2) {
          onProgress?.(translate('PROGRESS_RENDERING', lang));
          operation = await executeWithRetry(() => ai.models.generateVideos({
            model: modelName,
            prompt: prompt,
            image: { imageBytes: getRawBase64(images[0]), mimeType: 'image/png' },
            config: { 
              numberOfVideos: 1, resolution, aspectRatio: apiAspectRatio,
              lastFrame: { imageBytes: getRawBase64(images[1]), mimeType: 'image/png' },
              safetySettings: [
                { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
                { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
                { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
                { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
              ]
            }
          }));
        } else {
          onProgress?.(translate('PROGRESS_RENDERING', lang));
          operation = await executeWithRetry(() => ai.models.generateVideos({
            model: modelName,
            prompt: prompt,
            config: { 
              numberOfVideos: 1, 
              resolution, 
              aspectRatio: apiAspectRatio,
              safetySettings: [
                { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
                { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
                { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
                { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
              ]
            }
          }));
        }
        success = true;
      } catch (err: any) {
        if (err.message?.includes("404") || err.message?.includes("NOT_FOUND")) {
          modelIdx++;
          continue;
        }
        throw err;
      }
    }
 
    if (!success || !operation) {
       throw new Error("No compatible video model found or all attempts failed.");
    }
 
    try {
      while (!operation.done) {
        await sleep(10000);
        operation = await ai.operations.getVideosOperation({ name: operation.name });
        onProgress?.(translate('PROGRESS_RENDERING', lang));
      }
 
      if (operation.error) {
        throw new Error(operation.error.message || "Video generation failed");
      }
 
      const videoRef = operation.response?.generatedVideos?.[0]?.video;
      if (!videoRef) {
        throw new Error("No video was generated in the response.");
      }
      const blobUrl = await fetchVideoAsBlobUrl(videoRef.uri, apiKey);
      
      return { finalUrl: blobUrl, videoRef: videoRef };
    } catch (error: any) {
      lastError = error;
      const errorMsg = parseErrorMessage(error);
 
      const isQuota = errorMsg.includes("429") || errorMsg.includes("RESOURCE_EXHAUSTED") || errorMsg.includes("quota") || errorMsg.includes("credits are depleted");
      const isAuth = errorMsg.includes("API key not valid") || 
                     errorMsg.includes("API key expired") ||
                     errorMsg.includes("401") || 
                     errorMsg.includes("403") || 
                     errorMsg.includes("PERMISSION_DENIED") ||
                     errorMsg.includes("INVALID_ARGUMENT") ||
                     (errorMsg.includes("400") && errorMsg.includes("API_KEY_INVALID"));
      
      if (isQuota || isAuth) {
        if (i === uniqueKeys.length - 1) {
          console.error(`[API] Key ${i + 1}/${uniqueKeys.length} failed:`, errorMsg);
        } else {
          console.warn(`[API] Key ${i + 1} exhausted (${isQuota ? 'Quota' : 'Auth'}), trying next...`);
        }
 
        const failType = isQuota ? translate('QUOTA_EXHAUSTED', lang) : translate('AUTH_ERROR', lang);
        onProgress?.(`${failType} (Key ${i + 1}/${uniqueKeys.length}). ${uniqueKeys.length > 1 ? translate('TRYING_NEXT_KEY', lang) : ''}`);
        
        if (i < uniqueKeys.length - 1) {
          await sleep(1000);
        }
        continue; // Try next key
      }
      
      console.error(`API Error with key ${i + 1}:`, error);
      throw new Error(errorMsg, { cause: error });
    }
  }
  
  const finalErrorMessage = lastError?.message || translate('ALL_KEYS_FAILED', lang);
  const isQuota = finalErrorMessage.includes("429") || finalErrorMessage.includes("RESOURCE_EXHAUSTED") || finalErrorMessage.includes("quota");
  
  let userMessage = (isQuota || finalErrorMessage.includes("API key not valid")) 
    ? translate('ALL_KEYS_FAILED', lang)
    : finalErrorMessage;
 
  if (isQuota) {
    userMessage += `\n\n${translate('QUOTA_HINT', lang)}`;
  }
    
  throw new Error(userMessage, { cause: lastError });
};
 
// ================================================================
// GEMINI TEXT (TẠO KỊCH BẢN) — Tháng 10/2026
// Chiến lược (giống khâu Voice):
//   1. Tách key: FREE (xáo trộn) → PAID (xáo trộn) → key chưa rõ loại
//   2. Key FREE : chỉ chạy model free (3.8-flash ưu tiên; đời cũ chỉ dùng khi 404)
//      Key PAID : chạy gemini-2.5-pro (hàng rào cuối cùng)
//   3. Lỗi 429 trên key → KHÔNG sleep, KHÔNG thử model khác cùng key → đổi key ngay
//   4. Chống treo: mỗi lần gọi có timeout cứng, 503/empty → model kế, không chờ
//
// Dán đè lên hàm generateGeminiText cũ. Hai tham số cuối là MỚI và có giá trị
// mặc định → các chỗ gọi cũ không cần sửa. Cần các helper đã có trong file:
//   resolveKeys, resolveImageKeys, processKeys, parseErrorMessage, sleep, translate
// ================================================================

const TEXT_FREE_MODELS = [
  'gemini-3.8-flash',       // ✅ FREE — thông minh nhất, ưu tiên số 1
  'gemini-3.5-flash',       // ✅ FREE — chỉ dùng nếu 3.8 trả 404 / chưa có
  'gemini-2.5-flash',       // ✅ FREE — dự phòng cuối cho key free
];

const TEXT_PAID_MODELS = [
  'gemini-2.5-pro',         // ❌ PAID — hàng rào cuối cùng
  'gemini-3.1-pro-preview', // ❌ PAID — chỉ dùng nếu 2.5-pro 404/503
];

const TEXT_CALL_TIMEOUT_MS = 90000; // chống treo: 1 lần gọi tối đa 90s

const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('TIMEOUT: 503 UNAVAILABLE (client timeout)')), ms);
    p.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });

export const generateGeminiText = async (
  prompt: string,
  systemInstruction: string,
  apiKeys: string[],
  lang: 'EN' | 'VN' = 'EN',
  useProjectKey: boolean = true,
  adminFreeKeys: string[] = [],   // MỚI: key free từ sheet/admin
  adminPaidKeys: string[] = []    // MỚI: key trả phí từ sheet/admin
): Promise<string> => {
  // ── 1. Tách key FREE / PAID ─────────────────────────────────
  // useProjectKey=false (người dùng dùng key riêng) → giữ logic cũ qua resolveKeys
  const { freeKeys, paidKeys } = resolveImageKeys(apiKeys, adminFreeKeys, adminPaidKeys);
  const tiered = useProjectKey && (freeKeys.length > 0 || paidKeys.length > 0);
  const freeKeySet = new Set(freeKeys);
  const paidKeySet = new Set(paidKeys);

  const finalKeys: string[] = tiered
    ? Array.from(new Set([
        ...shuffleArray(freeKeys),
        ...shuffleArray(paidKeys),
        ...resolveKeys(apiKeys, useProjectKey).filter(k => !freeKeySet.has(k) && !paidKeySet.has(k)),
      ])).filter(Boolean)
    : resolveKeys(apiKeys, useProjectKey);

  if (finalKeys.length === 0) {
    const error = new Error("API Key missing. Please select an API key to continue.");
    (error as any).isKeyError = true;
    throw error;
  }

  // Có phân tầng → bắt đầu từ 0 (free trước, paid sau); không thì chọn ngẫu nhiên như cũ
  const userKeyCount = Array.from(new Set(processKeys(apiKeys))).length;
  const startIdx = tiered ? 0 : (userKeyCount > 0 ? 0 : Math.floor(Math.random() * finalKeys.length));

  let lastError: any = null;
  let sawQuota = false;
  let sawAuth = false;

  // ── helper phân loại lỗi ────────────────────────────────────
  const classify = (error: any) => {
    const msg = parseErrorMessage(error);
    return {
      msg,
      isQuota: msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("quota") || msg.includes("credits are depleted"),
      isAuth: msg.includes("API key not valid") || msg.includes("API key expired") || msg.includes("401") || msg.includes("403") || msg.includes("PERMISSION_DENIED"),
      isUnavailable: msg.includes("503") || msg.includes("UNAVAILABLE") || msg.includes("high demand"),
      isNotFound: msg.includes("404") || msg.includes("NOT_FOUND"),
      isEmpty: msg.includes("EMPTY_RESPONSE"),
    };
  };

  for (let count = 0; count < finalKeys.length; count++) {
    const i = (startIdx + count) % finalKeys.length;
    const apiKey = finalKeys[i];
    const ai = new GoogleGenAI({ apiKey });

    // ── 2. Chọn model theo loại key ───────────────────────────
    // free  → chỉ model free (không bao giờ chạm model trả phí)
    // paid  → 2.5-pro làm hàng rào cuối
    // chưa rõ loại / không phân tầng → free trước rồi paid (giống logic cũ)
    const isFreeKey = freeKeySet.has(apiKey);
    const isPaidKey = tiered && paidKeySet.has(apiKey);
    const models = isFreeKey
      ? TEXT_FREE_MODELS
      : isPaidKey
        ? TEXT_PAID_MODELS
        : [...TEXT_FREE_MODELS, ...TEXT_PAID_MODELS];

    let switchKey = false; // true = bỏ key này ngay, sang key kế

    for (const modelName of models) {
      if (switchKey) break;

      // Chỉ khi chỉ có 1 key duy nhất mới retry-chờ (không còn key nào để đổi)
      let retryCount = 0;
      const maxRetries = finalKeys.length <= 1 ? 1 : 0;

      while (true) {
        try {
          const response: any = await withTimeout(
            ai.models.generateContent({
              model: modelName,
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              config: {
                systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
                maxOutputTokens: 8192, // SDK @google/genai: nằm trực tiếp trong config
              },
            }),
            TEXT_CALL_TIMEOUT_MS
          );

          let textResult: string = response.text || "";
          if (!textResult && response.candidates?.length > 0) {
            const parts = response.candidates[0]?.content?.parts;
            if (parts) textResult = parts.map((p: any) => p.text || "").join("");
          }

          if (textResult.trim()) return textResult;
          throw new Error("EMPTY_RESPONSE: model returned no text");
        } catch (error: any) {
          lastError = error;
          const { msg, isQuota, isAuth, isUnavailable, isNotFound, isEmpty } = classify(error);

          // ── 3. BẺ LUỒNG: 429 / auth → đổi key NGAY, không sleep ──
          if (isQuota || isAuth) {
            if (isQuota) sawQuota = true;
            if (isAuth) sawAuth = true;

            if (finalKeys.length <= 1 && isQuota && retryCount < maxRetries) {
              // chỉ có đúng 1 key → bắt buộc chờ rồi thử lại
              retryCount++;
              await sleep(3000);
              continue;
            }
            console.warn(`[Text] Key ${i + 1}/${finalKeys.length} (${isFreeKey ? 'FREE' : isPaidKey ? 'PAID' : '?'}) ${isQuota ? '429' : 'auth'} → đổi key ngay`);
            switchKey = true;
            break;
          }

          // 404 / 503 / timeout / rỗng → model kế trên cùng key (không sleep)
          if (isNotFound || isUnavailable || isEmpty) {
            if (isUnavailable && retryCount < maxRetries) {
              retryCount++;
              await sleep(1000);
              continue;
            }
            break;
          }

          // Lỗi lạ (400 safety, v.v.) → thử model kế; nếu hết model sẽ ném lastError
          console.warn(`[Text] ${modelName} lỗi khác:`, msg);
          break;
        }
      }
    }
  }

  // ── Hết sạch key/model ──────────────────────────────────────
  if (sawQuota) {
    throw new Error(`${translate('ALL_KEYS_FAILED', lang)}\n\n${translate('QUOTA_HINT', lang)}`, { cause: lastError });
  }
  if (sawAuth && !lastError?.message?.includes("EMPTY_RESPONSE")) {
    throw new Error(translate('AUTH_ERROR', lang), { cause: lastError });
  }
  throw lastError || new Error(translate('ALL_KEYS_FAILED', lang));
};
 
export const generateGeminiImage = async (
  prompt: string, 
  systemInstruction: string, 
  apiKeys: string[], 
  aspectRatio: "16:9" | "9:16" | "1:1",
  refImage?: string,
  lang: 'EN' | 'VN' = 'EN',
  useProjectKey: boolean = true,
  adminFreeKeys: string[] = [],
  adminPaidKeys: string[] = []
): Promise<string> => {
  // ── Tách rõ free keys và paid keys ──────────────────────────
  const { freeKeys, paidKeys } = resolveImageKeys(apiKeys, adminFreeKeys, adminPaidKeys);
 
  // Thứ tự: free trước → paid sau → không trộn lẫn
  // Nếu không có free/paid từ sheet → fallback dùng resolveKeys cũ
  const orderedKeys = freeKeys.length > 0 || paidKeys.length > 0
    ? [...freeKeys, ...paidKeys]
    : resolveKeys(apiKeys, useProjectKey);
 
  const uniqueKeys = Array.from(new Set(orderedKeys)).filter(Boolean);
  const freeKeySet = new Set(freeKeys);
  
  if (uniqueKeys.length === 0) {
    const error = new Error("API Key missing. Please select an API key to continue.");
    (error as any).isKeyError = true;
    throw error;
  }
 
  let lastError: any = null;
  const userKeyCount = Array.from(new Set(processKeys(apiKeys))).length;
  const startIdx = userKeyCount > 0 ? 0 : Math.floor(Math.random() * uniqueKeys.length);
 
  for (let count = 0; count < uniqueKeys.length; count++) {
    const i = (startIdx + count) % uniqueKeys.length;
    const apiKey = uniqueKeys[i];
    const ai = new GoogleGenAI({ apiKey });
    
    // ✅ Image models 5/2026 — CHỈ FREE, không gọi paid
    // gemini-3.1-flash-image-preview: ✅ FREE - Nano Banana 2, mới nhất
    // gemini-2.5-flash-image:         ✅ FREE - ổn định
    const models = [
      'gemini-3.1-flash-image-preview',
      'gemini-2.5-flash-image',
    ];
    
    for (const modelName of models) {
      try {
        let retryCount = 0;
        const maxRetries = 1;
 
        const executeWithRetry = async (): Promise<string> => {
          try {
            const finalPrompt = `${prompt}\n\nIMPORTANT: Do not include any Vietnamese text in the image. If there is text on signs, labels, or backgrounds, it MUST be in English.`;
            
            const parts: any[] = [];
            if (refImage) {
              const rawB64 = refImage.includes(',') ? refImage.split(',')[1] : refImage;
              parts.push({ 
                inlineData: { 
                  data: rawB64, 
                  mimeType: refImage.includes('png') ? 'image/png' : 'image/jpeg' 
                } 
              });
            }
            parts.push({ text: finalPrompt });
 
            // gemini-3.1-flash-image-preview / gemini-2.5-flash-image: dùng responseModalities TEXT+IMAGE
            // imagen-4.0-fast-generate-001: dùng imageConfig với aspectRatio
            const isGeminiNative = modelName.startsWith('gemini');
            
            const response = await ai.models.generateContent({
              model: modelName,
              contents: [{ role: 'user', parts: parts }],
              config: isGeminiNative ? {
                // ✅ Gemini native image models cần TEXT+IMAGE (chỉ IMAGE sẽ bị lỗi)
                responseModalities: [Modality.TEXT, Modality.IMAGE],
                safetySettings: [
                  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
                  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
                  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
                  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
                ]
              } : {
                // ✅ Imagen 4 models dùng imageConfig
                systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
                imageConfig: { aspectRatio: aspectRatio === "16:9" ? "16:9" : "9:16" },
                safetySettings: [
                  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
                  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
                  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
                  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
                ]
              }
            });
            
            // Extract image correctly from standard response structure
            if (response.candidates?.[0]?.content?.parts) {
              for (const part of response.candidates[0].content.parts) {
                if (part.inlineData?.data) {
                  return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
                }
              }
            }
            
            if (response.generatedImage?.imageBytes) {
                return `data:image/png;base64,${response.generatedImage.imageBytes}`;
            }
 
            const noImgErr = new Error("No image generated.");
            (noImgErr as any).isNoImage = true;
            throw noImgErr;
          } catch (error: any) {
            const errorMsg = parseErrorMessage(error);
 
            const isQuota = errorMsg.includes("429") || errorMsg.includes("RESOURCE_EXHAUSTED") || errorMsg.includes("quota") || errorMsg.includes("credits are depleted");
            const isUnavailable = errorMsg.includes("503") || errorMsg.includes("UNAVAILABLE") || errorMsg.includes("high demand");
            
            const isFreeKey = freeKeySet.has(apiKey);
            if (!isFreeKey && (isQuota || isUnavailable) && retryCount < maxRetries) {
              retryCount++;
              await sleep(isQuota ? 3000 : 1000);
              return await executeWithRetry();
            }
            throw error;
          }
        };
 
        return await executeWithRetry();
      } catch (error: any) {
        lastError = error;
        const errorMsg = parseErrorMessage(error);
 
        const isQuota = errorMsg.includes("429") || errorMsg.includes("RESOURCE_EXHAUSTED") || errorMsg.includes("quota") || errorMsg.includes("credits are depleted");
        const isAuth = errorMsg.includes("API key not valid") || errorMsg.includes("401") || errorMsg.includes("403") || errorMsg.includes("PERMISSION_DENIED");
        const isUnavailable = errorMsg.includes("503") || errorMsg.includes("UNAVAILABLE") || errorMsg.includes("high demand");
        const isNotFound = errorMsg.includes("404") || errorMsg.includes("NOT_FOUND");
        const isNoImage = (error as any).isNoImage || errorMsg.includes("No image generated");
        
        if (isUnavailable || isNotFound || isNoImage) continue;
        if (isQuota || isAuth) {
          if (count < uniqueKeys.length - 1) {
            await sleep(200);
            break;
          }
          let userMsg = errorMsg;
          if (isQuota) userMsg = `${translate('ALL_KEYS_FAILED', lang)}\n\n${translate('QUOTA_HINT', lang)}`;
          else if (isAuth) userMsg = translate('AUTH_ERROR', lang);
          lastError = new Error(userMsg);
          break;
        }
      }
    }
  }
  // ── FREE IMG TẠM DỪNG ── (chất lượng kém, bật lại khi cần bỏ comment bên dưới)
  // console.warn('[GeminiImage] Tất cả key hết quota, fallback generateImageFree (full chain)...');
  // const freeRes = await generateImageFree(prompt, refImage, undefined, undefined, [], aspectRatio as '16:9' | '9:16', false);
  // return freeRes.url;
  const imgErr = lastError || new Error('Tất cả API key hết quota. Vui lòng thử lại sau hoặc thêm key mới.');
  throw imgErr;
};
 
// ================================================================
// FREE IMAGE GENERATION — Tháng 5/2026
// Ưu tiên 1: Pixazo FLUX Schnell (free tier → $0.0012/ảnh, KHÔNG ref image)
// Ưu tiên 2: SiliconFlow FLUX.1 Kontext Dev ($0.015/ảnh, CÓ ref image)
// Fallback:  Pollinations flux-realism (miễn phí, không cần key)
//            → CHỈ TRẢ URL, không fetch/download → không bao giờ timeout trên Vercel
// Người dùng nhập key vào tool → tự động dùng đúng API
// ================================================================
export const generateImageFree = async (
  prompt: string,
  refImageBase64?: string,
  _pixazoApiKey?: string,      // giữ tham số để không lỗi chỗ gọi
  _siliconflowApiKey?: string, // giữ tham số để không lỗi chỗ gọi
  _userApiKeys: string[] = [],
  aspectRatio: '16:9' | '9:16' | '1:1' = '16:9',
  pollinationsOnly: boolean = false  // true = FREE IMG bật → Pollinations ngay, false = chuỗi đầy đủ
): Promise<{ url: string; directUrl?: boolean }> => {
  void _userApiKeys;
  const seed = Math.floor(Math.random() * 9999999);
 
  // Tính kích thước ảnh theo aspectRatio
  const sizeMap: Record<string, string> = {
    '16:9': '1280x720',
    '9:16': '720x1280',
    '1:1':  '1024x1024',
  };
  const size = sizeMap[aspectRatio] || '1280x720';
  const [w, h] = size.split('x');
  const encodedPrompt = encodeURIComponent(prompt);
  const buildPollinationsUrl = () =>
    `https://image.pollinations.ai/prompt/${encodedPrompt}?model=flux-realism&width=${w}&height=${h}&nologo=true&seed=${seed}&enhance=true&quality=high`;
 
  // ── FREE IMG BẬT: Pollinations ngay lập tức (nhanh, trả URL thẳng, không chờ API) ──
  if (pollinationsOnly) {
    return { url: buildPollinationsUrl(), directUrl: true };
  }
 
  // ── FREE IMG TẮT: chuỗi chất lượng cao ──
  // Thứ tự: Pixazo → SiliconFlow (có ref) → SiliconFlow (không ref) → Pollinations
 
  // 1. Pixazo FLUX Schnell (nhanh, rẻ, không cần ref)
  try {
    const pixRes = await fetch('/api/pixazo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, size }),
      signal: AbortSignal.timeout(30000),
    });
    if (pixRes.ok) {
      const pixData = await pixRes.json();
      if (pixData?.url) return { url: pixData.url, directUrl: true };
    } else {
      console.warn('[FreeImg] Pixazo proxy lỗi:', pixRes.status);
    }
  } catch (err) {
    console.warn('[FreeImg] Pixazo proxy thất bại:', err);
  }
 
  // 2. SiliconFlow FLUX Kontext Dev — CÓ ảnh tham chiếu (giữ khuôn mặt nhân vật)
  if (refImageBase64) {
    try {
      const sfRes = await fetch('/api/siliconflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          image: refImageBase64.startsWith('data:')
            ? refImageBase64
            : `data:image/png;base64,${refImageBase64}`,
          size,
        }),
        signal: AbortSignal.timeout(60000),
      });
      if (sfRes.ok) {
        const sfData = await sfRes.json();
        if (sfData?.url) return { url: sfData.url, directUrl: true };
      } else {
        console.warn('[FreeImg] SiliconFlow (ref) proxy lỗi:', sfRes.status);
      }
    } catch (err) {
      console.warn('[FreeImg] SiliconFlow (ref) proxy thất bại:', err);
    }
  }
 
  // 3. SiliconFlow FLUX Kontext Dev — KHÔNG có ảnh tham chiếu
  try {
    const sfRes2 = await fetch('/api/siliconflow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, size }),
      signal: AbortSignal.timeout(60000),
    });
    if (sfRes2.ok) {
      const sfData2 = await sfRes2.json();
      if (sfData2?.url) return { url: sfData2.url, directUrl: true };
    } else {
      console.warn('[FreeImg] SiliconFlow (no ref) proxy lỗi:', sfRes2.status);
    }
  } catch (err) {
    console.warn('[FreeImg] SiliconFlow (no ref) proxy thất bại, chuyển Pollinations:', err);
  }
 
  // 4. Pollinations — fallback cuối cùng
  return { url: buildPollinationsUrl(), directUrl: true };
};
 
// ================================================================
// GEMINI TTS — Tháng 10/2026
// Chuỗi model (đều có FREE TIER, trừ 2.5-pro chỉ trả phí):
//   gemini-3.8-flash-lite-tts   ✅ FREE | rẻ nhất, thay thế 3.1 (paid $6/1M audio, KM đến 31/12/2026)
//   gemini-3.8-flash-tts        ✅ FREE | chất lượng cao nhất, mạnh phương ngữ vùng miền (paid $9/1M audio)
//   gemini-3.1-flash-tts-preview✅ FREE | fallback đời cũ ($20/1M audio)
//   gemini-2.5-flash-preview-tts       | fallback đời cũ
//   gemini-2.5-pro-preview-tts  ❌ PAID | không có free tier — chỉ gọi cuối cùng với key trả phí
// Gemini 3.8 dùng Interactions API (cần @google/genai >= 2.24.0):
//   - `text` là bản ghi NGUYÊN VĂN → chỉ dẫn giọng đọc phải nằm trong speech_metadata.style
//   - Không đổi accent trong style → chọn giọng vùng miền (Voice Library / Voice design)
// Model đời cũ (3.1 / 2.5) vẫn dùng generateContent + Audio Prompting nhúng trong prompt (getPrompt).
// ================================================================
export type VoiceRegion = 'NORTH' | 'SOUTH';

const TTS_LITE = 'gemini-3.8-flash-lite-tts';
const TTS_FLASH = 'gemini-3.8-flash-tts';
const TTS_31 = 'gemini-3.1-flash-tts-preview';
const TTS_25_FLASH = 'gemini-2.5-flash-preview-tts';
const TTS_25_PRO = 'gemini-2.5-pro-preview-tts'; // PAID ONLY

const isTts38 = (model: string) => model.startsWith('gemini-3.8-');

// Model trả 404/NOT_FOUND thì bỏ qua cho các lần gọi sau (trong phiên chạy)
const deadTtsModels = new Set<string>();

// Cache giọng vùng miền đã tra cứu (region:gender → voice id | null)
const regionalVoiceCache = new Map<string, string | null>();

const shuffleArray = <T>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Áp dụng thuật toán xử lý âm thanh số DSP (Digital Signal Processing):
// 1. Cắt bỏ khoảng nhiễu tĩnh nhiễu sóng (trailing static/noise 50-150ms) ở cuối file âm thanh của Gemini 3.8.
// 2. Áp dụng hiệu ứng Fade-in (15ms) và Fade-out (50ms) mượt mà để triệt tiêu hoàn toàn tiếng nổ bụp/click chuyển tiếp.
const trimAndFadeOutPcm = (audioBytes: Uint8Array): Uint8Array => {
  // Đảm bảo độ dài chẵn cho mẫu âm thanh 16-bit (2 byte mỗi mẫu)
  if (audioBytes.length % 2 !== 0) {
    audioBytes = audioBytes.subarray(0, audioBytes.length - 1);
  }

  // --- Xử lý loại bỏ tiếng dè tĩnh ở cuối (trailing static/noise của Gemini TTS) ---
  // Tần số lấy mẫu: 24000 Hz, 16-bit Mono (2 byte mỗi mẫu) -> 1 giây = 48000 byte.
  // Cắt bỏ khoảng 150ms ở cuối file (7200 byte) để loại bỏ hoàn toàn tiếng dè/xẹt nhiễu tĩnh.
  // Điều chỉnh tỷ lệ cắt theo độ dài của file để đảm bảo không bị cắt mất chữ của câu nói ngắn.
  let pcmData = audioBytes;
  const trimBytes = 48 * 150; // 150ms = 7200 byte
  if (pcmData.length > 48000) {
    pcmData = pcmData.subarray(0, pcmData.length - trimBytes);
  } else if (pcmData.length > 15000) {
    // Với file ngắn từ 300ms - 1s, cắt 100ms
    const shortTrim = 48 * 100;
    pcmData = pcmData.subarray(0, pcmData.length - shortTrim);
  } else if (pcmData.length > 5000) {
    // Với file cực ngắn, cắt 60ms
    const microTrim = 48 * 60;
    pcmData = pcmData.subarray(0, pcmData.length - microTrim);
  }

  // Để an toàn, chỉ xử lý fade nếu còn đủ dữ liệu
  if (pcmData.length < 200) {
    return pcmData;
  }

  // Tạo một ArrayBuffer mới và sao chép dữ liệu để đảm bảo buffer có thể ghi được (ghi trực tiếp vào subarray có thể gây lỗi Read-Only)
  const buffer = new ArrayBuffer(pcmData.length);
  const resultBytes = new Uint8Array(buffer);
  resultBytes.set(pcmData);

  const dataView = new DataView(buffer);
  const totalSamples = pcmData.length / 2;

  // 1. Áp dụng Fade-in mượt mà ở đầu (15ms = 48 * 15 = 720 byte = 360 mẫu)
  const fadeInSamples = Math.min(360, totalSamples);
  for (let i = 0; i < fadeInSamples; i++) {
    const byteOffset = i * 2;
    const sample = dataView.getInt16(byteOffset, true);
    const volumeFactor = i / fadeInSamples; // Tăng dần từ 0.0 -> 1.0
    const fadedSample = Math.round(sample * volumeFactor);
    dataView.setInt16(byteOffset, fadedSample, true);
  }

  // 2. Áp dụng Fade-out mượt mà ở cuối (50ms = 48 * 50 = 2400 byte = 1200 mẫu)
  const fadeOutSamples = Math.min(1200, totalSamples);
  const startFadeOutIdx = totalSamples - fadeOutSamples;
  for (let i = 0; i < fadeOutSamples; i++) {
    const sampleIdx = startFadeOutIdx + i;
    const byteOffset = sampleIdx * 2;
    const sample = dataView.getInt16(byteOffset, true);
    const volumeFactor = 1.0 - (i / fadeOutSamples); // Giảm dần từ 1.0 -> 0.0
    const fadedSample = Math.round(sample * volumeFactor);
    dataView.setInt16(byteOffset, fadedSample, true);
  }

  return resultBytes;
};

// Phân tích và trích xuất đúng phân đoạn dữ liệu âm thanh "data" trong file WAV của Gemini
// Giúp loại bỏ hoàn toàn các phần thừa hoặc siêu dữ liệu (metadata như LIST, INFO) ở cuối file gây tiếng xẹt rè/nổ loa cuối file
const extractPcmFromWav = (bytes: Uint8Array): Uint8Array => {
  // Kiểm tra cấu trúc RIFF WAVE chuẩn
  if (bytes.length < 12 || 
      bytes[0] !== 0x52 || bytes[1] !== 0x49 || bytes[2] !== 0x46 || bytes[3] !== 0x46 || // "RIFF"
      bytes[8] !== 0x57 || bytes[9] !== 0x41 || bytes[10] !== 0x56 || bytes[11] !== 0x45) { // "WAVE"
    // Nếu không phải file WAV, xử lý trực tiếp và trả về PCM đã được làm sạch
    return trimAndFadeOutPcm(bytes);
  }

  let offset = 12;
  while (offset + 8 <= bytes.length) {
    // Đọc tên phân đoạn (Chunk ID - 4 ký tự)
    const chunkId = String.fromCharCode(bytes[offset], bytes[offset+1], bytes[offset+2], bytes[offset+3]);
    // Đọc độ dài phân đoạn (Chunk Size - 32-bit little-endian)
    const chunkSize = bytes[offset+4] | (bytes[offset+5] << 8) | (bytes[offset+6] << 16) | (bytes[offset+7] << 24);
    
    if (chunkId === 'data') {
      const dataStart = offset + 8;
      let dataEnd = dataStart + chunkSize;
      if (dataEnd > bytes.length) {
        dataEnd = bytes.length;
      }
      const audioBytes = bytes.subarray(dataStart, dataEnd);
      return trimAndFadeOutPcm(audioBytes);
    }
    
    // Chuyển sang phân đoạn tiếp theo (cộng 8 byte tiêu đề chunk + kích thước dữ liệu chunk)
    offset += 8 + chunkSize;
  }

  // Phương án dự phòng nếu không tìm thấy phân đoạn 'data': cắt bỏ 44 byte tiêu đề WAV chuẩn
  const fallback = bytes.length > 44 ? bytes.subarray(44) : bytes;
  return trimAndFadeOutPcm(fallback);
};

// Tìm giọng tiếng Việt theo vùng miền.
// Ưu tiên 1: biến môi trường (có thể là voice_... từ Voice design)
//   VITE_GEMINI_VOICE_VI_NORTH_MALE / _NORTH_FEMALE / _SOUTH_MALE / _SOUTH_FEMALE
// Ưu tiên 2: Extended Voice Library (ai.voices.list) lọc vi-VN + từ khóa vùng miền
// Không thấy → null (dùng giọng prebuilt mặc định)
const resolveRegionalVoice = async (
  ai: GoogleGenAI,
  region: VoiceRegion,
  gender: 'MALE' | 'FEMALE'
): Promise<string | null> => {
  const cacheKey = `${region}:${gender}`;
  if (regionalVoiceCache.has(cacheKey)) return regionalVoiceCache.get(cacheKey) ?? null;

  const envVoice = (import.meta.env as any)?.[`VITE_GEMINI_VOICE_VI_${region}_${gender}`];
  if (typeof envVoice === 'string' && envVoice.trim()) {
    regionalVoiceCache.set(cacheKey, envVoice.trim());
    return envVoice.trim();
  }

  let found: string | null = null;
  try {
    const res: any = await (ai as any).voices?.list?.({
      language_code: ['vi-VN'],
      gender: [gender.toLowerCase()],
      page_size: 100,
    });
    const voices: any[] = res?.voices || [];
    const re = region === 'NORTH'
      ? /\bnorth(ern)?\b|\bhanoi\b|ha noi|miền bắc|hà nội/i
      : /\bsouth(ern)?\b|\bsaigon\b|sai gon|ho chi minh|miền nam|sài gòn|hồ chí minh/i;
    const hit = voices.find(v => re.test(`${v.accent || ''} ${v.display_name || ''} ${v.description || ''}`));
    found = hit?.id || null;
  } catch (err) {
    console.warn('[TTS] Không tra được Voice Library, dùng giọng prebuilt:', err);
  }
  // Đảm bảo chuẩn xác: Miền Bắc giọng Nam ưu tiên chuẩn Nam A (Charon) phát thanh viên trầm ấm
  if (!found && region === 'NORTH' && gender === 'MALE') {
    found = 'Charon';
  }
  regionalVoiceCache.set(cacheKey, found);
  return found;
};

const detectSemanticStyle = (text: string, currentGender: 'MALE' | 'FEMALE'): string => {
  const isMale = currentGender === 'MALE';
  const txt = text.toLowerCase();
  
  // Sales / Promotional / High Energy
  if (txt.includes('khuyến mãi') || txt.includes('ưu đãi') || txt.includes('quà tặng') || txt.includes('nhanh tay') || txt.includes('giá rẻ') || txt.includes('sales') || txt.includes('bán lẻ') || txt.includes('mua ngay') || txt.includes('cơ hội')) {
    return isMale 
      ? 'Bright, enthusiastic, high energy masculine marketing voice, fast pace, highly persuasive, confident advertising style'
      : 'Cheerful, enthusiastic, high energy feminine marketing voice, bright and friendly, highly persuasive, confident advertising style';
  }
  
  // Dramatic / Suspense / Film Review / Storytelling
  if (txt.includes('bí ẩn') || txt.includes('rùng rợn') || txt.includes('kịch tính') || txt.includes('bất ngờ') || txt.includes('kinh hoàng') || txt.includes('sát thủ') || txt.includes('chết') || txt.includes('hồi hộp') || txt.includes('cuộc chiến') || txt.includes('truy tìm') || txt.includes('phá án')) {
    return 'Suspenseful, dramatic, low pitch, slow pace with tense dramatic pauses, mysterious cinematic storytelling tone';
  }
  
  // Warm / Emotional / Soft / Storytelling
  if (txt.includes('nhẹ nhàng') || txt.includes('sâu lắng') || txt.includes('tâm sự') || txt.includes('gia đình') || txt.includes('kỷ niệm') || txt.includes('tình yêu') || txt.includes('chia sẻ') || txt.includes('buồn') || txt.includes('tiếc nuối') || txt.includes('hạnh phúc') || txt.includes('yên bình') || txt.includes('bình yên')) {
    return isMale
      ? 'Warm, gentle, soft baritone Vietnamese voice, slow tempo, highly emotional and intimate tone, natural breathing'
      : 'Melodious, warm, gentle feminine Vietnamese voice, slow tempo, soft and intimate storytelling tone, natural breathing';
  }
  
  // Formal / News / Report
  if (txt.includes('bản tin') || txt.includes('thời sự') || txt.includes('kính thưa') || txt.includes('báo cáo') || txt.includes('chính trị') || txt.includes('kinh tế') || txt.includes('thông báo') || txt.includes('quốc tế') || txt.includes('thị trường')) {
    return 'Professional, formal, objective news anchor tone, medium pace, crisp pronunciation, steady breathing, authoritative news broadcast';
  }
  
  // Majestic / Architectural / Luxury / High-end (Biệt thự, Công trình, Phong thủy)
  if (txt.includes('biệt thự') || txt.includes('kiến trúc') || txt.includes('thiết kế') || txt.includes('phong thủy') || txt.includes('sang trọng') || txt.includes('đẳng cấp') || txt.includes('thượng lưu') || txt.includes('hoàn mỹ') || txt.includes('gia chủ') || txt.includes('vượng khí')) {
    return isMale
      ? 'Deep, majestic, authoritative Vietnamese studio narrator, warm baritone timbre, prestigious and elite, steady cadence, natural studio audio'
      : 'Warm, elegant, clear feminine Vietnamese studio narrator, prestigious and refined tone, elite real estate marketing style, steady cadence';
  }

  return '';
};

export const generateGeminiVoice = async (
  text: string,
  voiceLang: string,
  voiceGender: 'MALE' | 'FEMALE',
  voiceStyle: string,
  apiKeys: string[],
  outputLanguage: 'EN' | 'VN',
  useProjectKey: boolean = true,
  voiceQuality?: string,
  voiceRegion?: VoiceRegion,        // MỚI: 'NORTH' (Bắc) | 'SOUTH' (Nam) — chỉ có tác dụng với tiếng Việt
  adminFreeKeys: string[] = [],     // MỚI: key free từ sheet/admin (ưu tiên trước)
  adminPaidKeys: string[] = []      // MỚI: key trả phí từ sheet/admin (dùng sau cùng)
): Promise<string> => {
  // ── Thứ tự key: FREE → PAID → key chưa rõ loại ──────────────────────────
  // useProjectKey=false (người dùng dùng key riêng) → giữ nguyên logic cũ qua resolveKeys
  const { freeKeys, paidKeys } = resolveImageKeys(apiKeys, adminFreeKeys, adminPaidKeys);
  const tiered = useProjectKey && (freeKeys.length > 0 || paidKeys.length > 0);
  const freeKeySet = new Set(freeKeys);
  const paidKeySet = new Set(paidKeys);

  const finalKeys = tiered
    ? Array.from(new Set([
        ...shuffleArray(freeKeys),
        ...shuffleArray(paidKeys),
        ...resolveKeys(apiKeys, useProjectKey).filter(k => !freeKeySet.has(k) && !paidKeySet.has(k)),
      ])).filter(Boolean)
    : resolveKeys(apiKeys, useProjectKey);
  
  if (finalKeys.length === 0) {
    const error = new Error("API Key missing. Please select an API key to continue.");
    (error as any).isKeyError = true;
    throw error;
  }

  const isVi = typeof voiceLang === 'string' && voiceLang.startsWith('vi');
  const langName = isVi ? 'Vietnamese' : 
                   voiceLang === 'en-US' ? 'English' :
                   voiceLang === 'fr-FR' ? 'French' :
                   voiceLang === 'ru-RU' ? 'Russian' :
                   voiceLang === 'de-DE' ? 'German' :
                   voiceLang === 'zh-CN' ? 'Chinese' :
                   voiceLang === 'id-ID' ? 'Indonesian' :
                   voiceLang === 'hi-IN' ? 'Hindi' :
                   voiceLang === 'th-TH' ? 'Thai' : 'English';

  const styleText = translate(voiceStyle as any, outputLanguage);
  const qualityText = voiceQuality ? translate(voiceQuality as any, outputLanguage) : '';
  const region: VoiceRegion | undefined = isVi ? voiceRegion : undefined;

  // Thứ tự model theo từng key. Có chọn vùng miền → ưu tiên 3.8 Flash (mạnh phương ngữ)
  const buildModels = (isFreeKey: boolean | null): string[] => {
    const base = region
      ? [TTS_FLASH, TTS_LITE, TTS_31, TTS_25_FLASH]
      : [TTS_LITE, TTS_FLASH, TTS_31, TTS_25_FLASH];
    return isFreeKey === true ? base : [...base, TTS_25_PRO];
  };

  // Phân tích và nhận diện các thẻ chuyển giọng [Giọng Nam], [Giọng Nữ] và cảm xúc
  const isMaleTag = (tag: string) => /nam|male/i.test(tag);
  const isFemaleTag = (tag: string) => /nữ|nu|female/i.test(tag);

  const detectEmotionStyle = (tag: string): string | undefined => {
    if (/hào hứng|hao hung|năng động|nang dong|vui vẻ|vui ve|quảng cáo|marketing|excited|enthusiastic|energetic/i.test(tag)) {
      return 'Enthusiastic, cheerful, high energy bright marketing voice, fast pace';
    }
    if (/sâu lắng|sau lang|nhẹ nhàng|nhe nhang|tâm sự|tam su|trầm lắng|tram lang|buồn|sad|gentle|nostalgic/i.test(tag)) {
      return 'Warm, gentle, soft storytelling tone, nostalgic, slow tempo';
    }
    if (/kịch tính|kich tinh|hồi hộp|hoi hop|bí ẩn|bi an|kinh dị|kinh di|rùng rợn|suspense|dramatic|mysterious/i.test(tag)) {
      return 'Suspenseful, dramatic, low pitch, slow tempo with tense dramatic pauses, mysterious narrative tone';
    }
    if (/trang trọng|trang trong|tin tức|tin tuc|thời sự|thoi su|formal|news|anchor/i.test(tag)) {
      return 'Professional, formal, objective news anchor tone, medium pace, crisp studio pronunciation';
    }
    if (/uy quyền|uy quyen|mạnh mẽ|manh me|quyền lực|quyen luc|authoritative|powerful|confident/i.test(tag)) {
      return 'Deep, majestic, authoritative Vietnamese studio voice, powerful and confident tone, steady cadence';
    }
    return undefined;
  };

  // Tìm tất cả các thẻ đổi giọng giới tính [Giọng Nam], [Giọng Nữ]
  const tagRegex = /\[([^\]]+)\]/g;
  const genderMatches: { tag: string; gender: 'MALE' | 'FEMALE'; start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = tagRegex.exec(text)) !== null) {
    const rawTag = m[0];
    if (isMaleTag(rawTag)) {
      genderMatches.push({ tag: rawTag, gender: 'MALE', start: m.index, end: m.index + rawTag.length });
    } else if (isFemaleTag(rawTag)) {
      genderMatches.push({ tag: rawTag, gender: 'FEMALE', start: m.index, end: m.index + rawTag.length });
    }
  }

  const segments: { text: string; gender: 'MALE' | 'FEMALE'; styleOverride?: string }[] = [];

  if (genderMatches.length === 0) {
    // Không có thẻ giới tính -> áp dụng giọng đọc chính đã chọn
    const styleOverride = text.match(/\[[^\]]+\]/g)?.map(detectEmotionStyle).find(Boolean);
    const cleaned = text.replace(/\[[^\]]+\]/g, '').replace(/^\s*TEXT:\s*/i, '').replace(/^[\s\-–—:]+/, '').trim();
    if (cleaned) {
      const finalStyle = styleOverride || detectSemanticStyle(cleaned, voiceGender);
      segments.push({ text: cleaned, gender: voiceGender, styleOverride: finalStyle || undefined });
    }
  } else {
    // Phân tích linh hoạt CẢ 2 CÁCH ĐẶT THẺ:
    // 1. Thẻ đặt ở CUỐI câu/dòng (Suffix): "Chatbot AI... [giọng nam]. Ngành thời trang... [giọng nữ]."
    // 2. Thẻ đặt ở ĐẦU câu/dòng (Prefix): "[giọng nam] Chatbot AI... [giọng nữ] Ngành thời trang..."
    const firstTag = genderMatches[0];
    const textBeforeFirstTag = text.substring(0, firstTag.start).replace(/\[[^\]]+\]/g, '').trim();
    const isSuffixFormat = textBeforeFirstTag.length > 0;

    if (isSuffixFormat) {
      // Định dạng thẻ ở CUỐI câu: mỗi đoạn lời thoại nằm trước thẻ tương ứng
      let lastBoundary = 0;
      for (let i = 0; i < genderMatches.length; i++) {
        const gTag = genderMatches[i];
        const rawChunk = text.substring(lastBoundary, gTag.start);
        const styleOverride = (rawChunk.match(/\[[^\]]+\]/g) || []).map(detectEmotionStyle).find(Boolean);

        let nextPos = gTag.end;
        while (nextPos < text.length && /[.?!,;\s\n\r]/.test(text[nextPos])) {
          nextPos++;
        }
        lastBoundary = nextPos;

        const cleaned = rawChunk.replace(/\[[^\]]+\]/g, '').replace(/^\s*TEXT:\s*/i, '').replace(/^[\s\-–—:]+/, '').trim();
        if (cleaned) {
          const finalStyle = styleOverride || detectSemanticStyle(cleaned, gTag.gender);
          segments.push({ text: cleaned, gender: gTag.gender, styleOverride: finalStyle || undefined });
        }
      }
      const remaining = text.substring(lastBoundary).replace(/\[[^\]]+\]/g, '').replace(/^\s*TEXT:\s*/i, '').replace(/^[\s\-–—:]+/, '').trim();
      if (remaining) {
        const finalStyle = detectSemanticStyle(remaining, voiceGender);
        segments.push({ text: remaining, gender: voiceGender, styleOverride: finalStyle || undefined });
      }
    } else {
      // Định dạng thẻ ở ĐẦU câu: mỗi đoạn lời thoại nằm ngay sau thẻ
      for (let i = 0; i < genderMatches.length; i++) {
        const gTag = genderMatches[i];
        const nextTag = genderMatches[i + 1];
        const endPos = nextTag ? nextTag.start : text.length;
        const rawChunk = text.substring(gTag.end, endPos);
        const styleOverride = (rawChunk.match(/\[[^\]]+\]/g) || []).map(detectEmotionStyle).find(Boolean);
        const cleaned = rawChunk.replace(/\[[^\]]+\]/g, '').replace(/^\s*TEXT:\s*/i, '').replace(/^[\s\-–—:]+/, '').trim();
        if (cleaned) {
          const finalStyle = styleOverride || detectSemanticStyle(cleaned, gTag.gender);
          segments.push({ text: cleaned, gender: gTag.gender, styleOverride: finalStyle || undefined });
        }
      }
    }
  }

  if (segments.length === 0) return "";

  const generateChunk = async (
    chunk: { text: string; gender: 'MALE' | 'FEMALE'; styleOverride?: string },
    apiKey: string,
    isFreeKey: boolean | null
  ): Promise<Uint8Array> => {
    const ai = new GoogleGenAI({ apiKey });
    let retryCount = 0;
    const maxRetries = 5;
    const models = buildModels(isFreeKey);

    // 100% consistent dynamic voice profile mapping to preserve persona consistency
    const getPrebuiltVoice = (
      gender: 'MALE' | 'FEMALE',
      primaryGender: 'MALE' | 'FEMALE',
      quality?: string
    ): string => {
      const q = quality || '';
      if (gender === 'MALE') {
        if (primaryGender === 'MALE') {
          if (q.includes('YOUTHFUL') || q.includes('ENERGETIC')) {
            return 'Puck'; // Nam B - Trẻ trung, năng nổ
          }
          if (q.includes('GENTLE') || q.includes('WARM')) {
            return 'Orus'; // Nam C - Điềm đạm, truyền cảm
          }
        }
        return 'Charon'; // Nam A - Mặc định trầm ấm, uy lực dải tần Baritone
      } else {
        if (primaryGender === 'FEMALE') {
          if (q.includes('GENTLE') || q.includes('WARM') || q.includes('MIDDLE_AGED')) {
            return 'Kore'; // Nữ C - Dịu dàng, tâm tình
          }
          if (q.includes('POWERFUL') || q.includes('CHARMING')) {
            return 'Aoede'; // Nữ B - Sang trọng, cuốn hút
          }
        }
        return 'Zephyr'; // Nữ A - Mặc định trong trẻo, sắc nét, đầy năng lượng điện ảnh
      }
    };

    // Đạo diễn âm thanh AI thông minh: Tự động phân tích thể loại nội dung của kịch bản để ghép cặp giọng Nam/Nữ tối ưu nhất
    const detectOptimalVoice = (
      fullText: string,
      segmentGender: 'MALE' | 'FEMALE',
      primaryGender: 'MALE' | 'FEMALE',
      userSelectedQuality?: string
    ): string => {
      const txt = fullText.toLowerCase();
      // Nếu là kịch bản đơn giọng (không chứa thẻ Nam/Nữ đối thoại), tôn trọng 100% lựa chọn chỉnh tay của người dùng trên giao diện
      const isMultiSpeaker = /giọng|nam|nữ|nu/i.test(fullText);
      if (!isMultiSpeaker) {
        return getPrebuiltVoice(segmentGender, primaryGender, userSelectedQuality);
      }

      // Kịch bản đối thoại đa giọng: Tự động ghép cặp đôi giọng chuẩn chuyên nghiệp nhất theo từng ngữ cảnh
      
      // Thể loại 1: Sâu lắng, Nhẹ nhàng, Gia đình, Tâm sự -> Cặp đôi Nam C (Orus) & Nữ C (Kore)
      if (txt.includes('nhẹ nhàng') || txt.includes('sâu lắng') || txt.includes('tâm sự') || txt.includes('gia đình') || txt.includes('kỷ niệm') || txt.includes('tình yêu') || txt.includes('chia sẻ') || txt.includes('buồn') || txt.includes('yên bình') || txt.includes('bình yên') || txt.includes('truyện cổ')) {
        return segmentGender === 'MALE' ? 'Orus' : 'Kore';
      }

      // Thể loại 2: Hào hứng, Quảng cáo, Bán hàng, Review phim, TikTok kịch tính -> Cặp đôi Nam B (Puck) & Nữ A (Zephyr)
      if (txt.includes('khuyến mãi') || txt.includes('ưu đãi') || txt.includes('quà tặng') || txt.includes('nhanh tay') || txt.includes('giá rẻ') || txt.includes('sales') || txt.includes('mua ngay') || txt.includes('kịch tính') || txt.includes('bí ẩn') || txt.includes('rùng rợn') || txt.includes('hồi hộp') || txt.includes('sát thủ') || txt.includes('review') || txt.includes('phim') || txt.includes('cơ hội')) {
        return segmentGender === 'MALE' ? 'Puck' : 'Zephyr';
      }

      // Thể loại 3: Kiến trúc, Biệt thự, Dự án đẳng cấp, Sang trọng, Phong thủy -> Cặp đôi Nam A (Charon) & Nữ B (Aoede)
      if (txt.includes('biệt thự') || txt.includes('kiến trúc') || txt.includes('thiết kế') || txt.includes('phong thủy') || txt.includes('sang trọng') || txt.includes('đẳng cấp') || txt.includes('thượng lưu') || txt.includes('hoàn mỹ') || txt.includes('gia chủ') || txt.includes('vượng khí') || txt.includes('nhà truyền thống')) {
        return segmentGender === 'MALE' ? 'Charon' : 'Aoede';
      }

      // Mặc định vàng cho các thể loại hỗn hợp: Nam A (Charon) và Nữ A (Zephyr)
      return segmentGender === 'MALE' ? 'Charon' : 'Zephyr';
    };

    const defaultVoice = detectOptimalVoice(text, chunk.gender, voiceGender, voiceQuality);
    let regionalVoice: string | null = region ? await resolveRegionalVoice(ai, region, chunk.gender) : null;

    const toBytes = (base64Audio: string): Uint8Array => {
      const binaryString = atob(base64Audio);
      let len = binaryString.length;
      if (len % 2 !== 0) {
        len--; // Align to even byte boundary for 16-bit PCM samples to prevent static crackle
      }
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return extractPcmFromWav(bytes);
    };

    const callModel = async (modelName: string): Promise<Uint8Array> => {
      const voiceName = regionalVoice || defaultVoice;
      const isMale = chunk.gender === 'MALE';

      // Style prompt for speechMetadata / Gemini 3.8: explicit tone, cadence and native pronunciation
      const masculineStyle = `Deep, resonant, masculine ${langName} male studio narrator, warm baritone timbre, authoritative, steady cadence, crisp clear studio voice, native pronunciation without gasping or trailing breath`;
      const feminineStyle = `Warm, clear, elegant feminine ${langName} female studio narrator, melodious and expressive, steady cadence, crisp clear studio voice, native pronunciation without gasping or trailing breath`;
      const activeStyle = isMale ? masculineStyle : feminineStyle;
      
      const selectedStyle = chunk.styleOverride || `${activeStyle}${styleText ? `, ${styleText}` : ''}${qualityText ? `, ${qualityText}` : ''}`;

      // ── Standard generateContent with speechConfig ──
      const response = await ai.models.generateContent({
        model: modelName,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: chunk.text,
                ...(isTts38(modelName) ? {
                  speechMetadata: {
                    speaker: isMale ? 'Male Narrator' : 'Female Narrator',
                    style: selectedStyle
                  }
                } : {})
              }
            ]
          }
        ],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voiceName },
            },
          },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
          ]
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) return toBytes(base64Audio);
      throw new Error("No audio data returned");
    };

    // Thử lần lượt các model trên CÙNG một key (mỗi model có quota free riêng) trước khi đổi key
    const runModels = async (): Promise<Uint8Array> => {
      let lastModelError: any = null;
      for (const modelName of models) {
        if (deadTtsModels.has(modelName)) continue;
        let voiceRetried = false;
        while (true) {
          try {
            return await callModel(modelName);
          } catch (error: any) {
            lastModelError = error;
            const msg = parseErrorMessage(error);
            const isNotFound = msg.includes("404") || msg.includes("NOT_FOUND");
            const isQuota = msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("quota") || msg.includes("credits are depleted");
            const isUnavailable = msg.includes("503") || msg.includes("UNAVAILABLE") || msg.includes("high demand");
            const isNoAudio = msg.includes("No audio data returned");
            const isKeyProblem = msg.includes("API key") || msg.includes("401") || msg.includes("403") || msg.includes("PERMISSION_DENIED");
            const isBadVoice = !isKeyProblem && regionalVoice && !voiceRetried &&
              (msg.includes("INVALID_ARGUMENT") || msg.toLowerCase().includes("voice"));

            if (isBadVoice) {
              // Voice vùng miền không dùng được → quay về giọng prebuilt, thử lại model này
              console.warn(`[TTS] Voice "${regionalVoice}" lỗi, dùng giọng mặc định.`);
              regionalVoice = null;
              voiceRetried = true;
              continue;
            }
            if (isNotFound) {
              deadTtsModels.add(modelName);
              break; // sang model kế tiếp
            }
            if (isQuota || isUnavailable || isNoAudio) {
              break; // sang model kế tiếp (cùng key)
            }
            throw error; // lỗi key/auth/khác → để vòng ngoài đổi key
          }
        }
      }
      throw lastModelError || new Error("No TTS model available");
    };

    const execute = async (): Promise<Uint8Array> => {
      try {
        return await runModels();
      } catch (error: any) {
        const errorMsg = parseErrorMessage(error);

        const isQuota = errorMsg.includes("429") || errorMsg.includes("RESOURCE_EXHAUSTED") || errorMsg.includes("quota") || errorMsg.includes("credits are depleted");
        const isUnavailable = errorMsg.includes("503") || errorMsg.includes("UNAVAILABLE") || errorMsg.includes("high demand");
        
        if (isQuota || isUnavailable) {
          // If it's a quota issue, we should probably just fail this key fast so the outer loop moves to the next key
          // ONLY retry if we have NO other keys to try
          if (finalKeys.length <= 1 && retryCount < maxRetries) {
            retryCount++;
            const delay = isQuota 
              ? (Math.pow(2, retryCount) * 8000 + Math.random() * 3000)
              : (Math.pow(2, retryCount) * 2000 + Math.random() * 1000);
            console.log(`TTS Retry ${retryCount}/${maxRetries} after delay...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return await execute();
          }
          console.warn(`Key (ending ${apiKey.slice(-4)}) hit quota/unavailable on all TTS models. Switching key...`);
        }
        throw error;
      }
    };
    return await execute();
  };

  let lastError: any = null;
  // Có phân tầng free→paid thì bắt đầu từ 0 (đã xáo trộn trong từng nhóm); ngược lại chọn ngẫu nhiên như cũ
  const startIdx = tiered ? 0 : Math.floor(Math.random() * finalKeys.length);

  for (let count = 0; count < finalKeys.length; count++) {
    const i = (startIdx + count) % finalKeys.length;
    const apiKey = finalKeys[i];
    const isFreeKey: boolean | null = freeKeySet.has(apiKey) ? true : (tiered && paidKeySet.has(apiKey) ? false : null);
    try {
      const pcmChunks: Uint8Array[] = [];
      for (let idx = 0; idx < segments.length; idx++) {
        const segment = segments[idx];
        const pcm = await generateChunk(segment, apiKey, isFreeKey);
        pcmChunks.push(pcm);
        
        // Chèn thêm 0.2 giây im lặng (bằng 0) để tạo khoảng lặng lấy hơi tự nhiên và triệt tiêu tiếng dè/bụp loa khi chuyển giọng
        if (idx < segments.length - 1) {
          const pauseSamples = Math.floor(24000 * 0.20); // 0.20 giây ở tần số mẫu 24kHz
          const pauseBytes = new Uint8Array(pauseSamples * 2); // 16-bit PCM (2 byte mỗi mẫu), tự động điền đầy 0
          pcmChunks.push(pauseBytes);
        }
      }
      const totalLength = pcmChunks.reduce((acc, curr) => acc + curr.length, 0);
      const mergedPcm = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of pcmChunks) {
        mergedPcm.set(chunk, offset);
        offset += chunk.length;
      }
      let binary = '';
      const len = mergedPcm.byteLength;
      for (let j = 0; j < len; j++) {
        binary += String.fromCharCode(mergedPcm[j]);
      }
      return btoa(binary);
    } catch (error: any) {
      lastError = error;
      const errorMsg = parseErrorMessage(error);

      const isQuota = errorMsg.includes("429") || errorMsg.includes("RESOURCE_EXHAUSTED") || errorMsg.includes("quota") || errorMsg.includes("credits are depleted");
      const isAuth = errorMsg.includes("API key not valid") || errorMsg.includes("401") || errorMsg.includes("403") || errorMsg.includes("PERMISSION_DENIED");
      
      if (isQuota || isAuth) {
        if (count < finalKeys.length - 1) {
          await sleep(500);
          continue;
        }
        let userMsg = errorMsg;
        if (isQuota) userMsg = `${translate('ALL_KEYS_FAILED', outputLanguage)}\n\n${translate('QUOTA_HINT', outputLanguage)}`;
        else if (isAuth) userMsg = translate('AUTH_ERROR', outputLanguage);
        throw new Error(userMsg, { cause: error });
      }
      throw error;
    }
  }
  throw lastError;
};
