
import { GoogleGenAI } from "@google/genai";

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { mode, prompt, resolution, aspectRatio, images, previousVideo, customApiKey } = req.body;

  // LOGIC XOAY VÒNG API KEY (BACKEND ONLY)
  // Chủ dự án có thể để danh sách key cách nhau bởi dấu phẩy trong biến API_KEY
  const ownerKeys = (process.env.API_KEY || "").split(',').map(k => k.trim()).filter(Boolean);
  
  const tryKeys = customApiKey ? [customApiKey, ...ownerKeys] : ownerKeys;
  if (tryKeys.length === 0) return res.status(401).json({ error: 'Không có API Key khả dụng. Vui lòng liên hệ Admin.' });

  let lastError: any = null;
  for (const apiKey of tryKeys) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      // Nếu có previousVideo, bắt buộc dùng model generate (không dùng fast) để có continuity
      const modelName = (mode === 'CONSISTENCY' || previousVideo) 
        ? 'veo-3.1-generate-preview' 
        : 'veo-3.1-fast-generate-preview';

      const config = {
        numberOfVideos: 1,
        resolution: resolution || '720p',
        aspectRatio: aspectRatio || "16:9"
      };

      let operation;
      
      // LOGIC NỐI CẢNH (CINEMA CONTINUITY)
      if (previousVideo) {
        operation = await ai.models.generateVideos({
          model: 'veo-3.1-generate-preview',
          prompt: prompt,
          video: previousVideo, // Kế thừa từ video trước
          config
        });
      } else if (mode === 'TEXT_TO_VIDEO') {
        operation = await ai.models.generateVideos({ model: modelName, prompt, config });
      } else if (mode === 'IMAGE_TO_VIDEO' && images?.length > 0) {
        operation = await ai.models.generateVideos({
          model: modelName,
          prompt,
          image: { imageBytes: images[0].split(',')[1], mimeType: 'image/png' },
          config
        });
      } else if (mode === 'INTERPOLATION' && images?.length >= 2) {
        operation = await ai.models.generateVideos({
          model: modelName,
          prompt,
          image: { imageBytes: images[0].split(',')[1], mimeType: 'image/png' },
          config: { ...config, lastFrame: { imageBytes: images[1].split(',')[1], mimeType: 'image/png' } }
        });
      } else if (mode === 'CONSISTENCY' && images?.length > 0) {
        const referenceImages = images.slice(0, 3).map((img: string) => ({
          image: { imageBytes: img.split(',')[1], mimeType: 'image/png' },
          referenceType: 'ASSET'
        }));
        operation = await ai.models.generateVideos({ model: modelName, prompt, config: { ...config, referenceImages } });
      }

      return res.status(200).json({ operationName: operation.name, apiKeyUsed: apiKey });
    } catch (error: any) {
      lastError = error;
      const errorMsg = error.message || "";
      const isQuota = errorMsg.includes("429") || errorMsg.includes("RESOURCE_EXHAUSTED") || errorMsg.includes("quota");
      const isAuth = errorMsg.includes("API key not valid") || errorMsg.includes("401") || errorMsg.includes("403");
      
      if (isQuota || isAuth) {
        console.warn(`Backend Key failed (${isQuota ? 'Quota' : 'Auth'}), trying next...`);
        continue;
      }
      break; // Other errors stop the loop
    }
  }

  return res.status(500).json({ error: lastError?.message || "All API keys failed." });
}
