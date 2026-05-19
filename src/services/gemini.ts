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
    
    // First, try to find keys using regex (handles mixed text, JSON, etc.)
    const matches = k.match(keyRegex);
    if (matches) {
      allFoundKeys.push(...matches);
    } else {
      // Fallback for keys that might be pasted without the AIzaSy prefix (unlikely for Gemini)
      // or keys separated by various delimiters
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

const resolveKeys = (apiKeys: string[], useProjectKey: boolean): string[] => {
  const defaultKey = import.meta.env.VITE_GEMINI_API_KEY || (typeof process !== 'undefined' ? (process.env.GEMINI_API_KEY || process.env.API_KEY) : undefined);
  const envKeysString = import.meta.env.VITE_GEMINI_API_KEYS || '';
  const envKeys = envKeysString.split(',').map((k: string) => k.trim()).filter((k: string) => k !== '');

  const userKeys = processKeys(apiKeys);
  const sysKeys: string[] = [];

  if (useProjectKey) {
    if (defaultKey) sysKeys.push(defaultKey);
    if (envKeys.length > 0) sysKeys.push(...envKeys);

    const pro1 = typeof process !== 'undefined' ? (process.env.GOOGLE_KEYS_PRO1 || process.env.GOOGLE_KEY_PRO1) : undefined;
    const pro9 = typeof process !== 'undefined' ? (process.env.GOOGLE_KEYS_PRO9 || process.env.GOOGLE_KEY_PRO9) : undefined;

    if (pro1) sysKeys.push(...pro1.split(/[\n,]/));
    if (pro9) sysKeys.push(...pro9.split(/[\n,]/));
  } else {
    if (userKeys.length === 0) {
      if (defaultKey) sysKeys.push(defaultKey);
      if (envKeys.length > 0) sysKeys.push(...envKeys);
    }
  }

  const finalUserKeys = Array.from(new Set(userKeys));
  const finalSysKeys = Array.from(new Set(processKeys(sysKeys))).filter(k => !finalUserKeys.includes(k));

  return [...finalUserKeys, ...finalSysKeys];
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
    
    // Video models from skill: veo-3.1-generate-preview (4K/Pro), veo-3.1-lite-generate-preview (Standard)
    const targetModels = isConsistency 
      ? ['veo-3.1-generate-preview', 'veo-3.1-lite-generate-preview'] 
      : ['veo-3.1-lite-generate-preview', 'veo-3.1-generate-preview'];
    
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
            let errorMsg = error.message || "";
            try {
              const parsed = JSON.parse(errorMsg);
              if (parsed.error?.message) errorMsg = parsed.error.message;
            } catch { /* ignore */ }

            const isQuota = errorMsg.includes("429") || errorMsg.includes("RESOURCE_EXHAUSTED") || errorMsg.includes("quota");
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
      
      let errorMsg = error.message || "";
      try {
        const parsed = JSON.parse(errorMsg);
        if (parsed.error?.message) errorMsg = parsed.error.message;
        if (parsed.error?.status) errorMsg += ` (${parsed.error.status})`;
      } catch { /* ignore */ }

      const isQuota = errorMsg.includes("429") || errorMsg.includes("RESOURCE_EXHAUSTED") || errorMsg.includes("quota");
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

export const generateGeminiText = async (
  prompt: string, 
  systemInstruction: string, 
  apiKeys: string[],
  lang: 'EN' | 'VN' = 'EN',
  useProjectKey: boolean = true
): Promise<string> => {
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
    
    const models = ['gemini-3-flash-preview', 'gemini-3.1-pro-preview', 'gemini-flash-latest'];
    
    for (const modelName of models) {
      try {
        let retryCount = 0;
        const maxRetries = 1;
        
        const executeWithRetry = async (): Promise<string> => {
          try {
            const response = await ai.models.generateContent({
              model: modelName,
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              config: { 
                systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
                generationConfig: { maxOutputTokens: 8192 }
              }
            });
            
            const textResult = response.text || "";
            if (!textResult && response.candidates && response.candidates.length > 0) {
              const firstCandidate = response.candidates[0];
              if (firstCandidate.content && firstCandidate.content.parts) {
                return firstCandidate.content.parts.map(p => p.text || "").join("") || "";
              }
            }
            return textResult;
          } catch (error: any) {
            let errorMsg = error.message || "";
            try {
              const parsed = JSON.parse(errorMsg);
              if (parsed.error?.message) errorMsg = parsed.error.message;
            } catch { /* ignore */ }

            const isQuota = errorMsg.includes("429") || errorMsg.includes("RESOURCE_EXHAUSTED") || errorMsg.includes("quota");
            const isUnavailable = errorMsg.includes("503") || errorMsg.includes("UNAVAILABLE") || errorMsg.includes("high demand");
            
            if ((isQuota || isUnavailable) && retryCount < maxRetries) {
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
        let errorMsg = error.message || "";
        try {
          const parsed = JSON.parse(errorMsg);
          if (parsed.error?.message) errorMsg = parsed.error.message;
        } catch { /* ignore */ }

        const isQuota = errorMsg.includes("429") || errorMsg.includes("RESOURCE_EXHAUSTED") || errorMsg.includes("quota");
        const isAuth = errorMsg.includes("API key not valid") || errorMsg.includes("401") || errorMsg.includes("403") || errorMsg.includes("PERMISSION_DENIED");
        const isUnavailable = errorMsg.includes("503") || errorMsg.includes("UNAVAILABLE") || errorMsg.includes("high demand");
        const isNotFound = errorMsg.includes("404") || errorMsg.includes("NOT_FOUND");
        
        if (isUnavailable || isNotFound) continue;
        
        if (isQuota || isAuth) {
          if (count < uniqueKeys.length - 1) {
            await sleep(200);
            break; // Try next key
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
  throw lastError;
};

export const generateGeminiImage = async (
  prompt: string, 
  systemInstruction: string, 
  apiKeys: string[], 
  aspectRatio: "16:9" | "9:16",
  refImage?: string,
  lang: 'EN' | 'VN' = 'EN',
  useProjectKey: boolean = true
): Promise<string> => {
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
    
    // Recommended models for image generation from skill
    const models = [
      'gemini-3.1-flash-image-preview',
      'gemini-3-pro-image-preview',
      'gemini-2.5-flash-image'
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

            // For Gemini models, we might need different modalities if they support generation
            const isGemini = modelName.includes('gemini');
            
            const response = await ai.models.generateContent({
              model: modelName,
              contents: [{ role: 'user', parts: parts }],
              config: isGemini ? {
                // gemini-2.0-flash can sometimes generate images if properly prompted and supported
                responseModalities: [Modality.IMAGE],
                safetySettings: [
                  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
                  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
                  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
                  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
                ]
              } : { 
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
            let errorMsg = error.message || "";
            try {
              const parsed = JSON.parse(errorMsg);
              if (parsed.error?.message) errorMsg = parsed.error.message;
            } catch { /* ignore */ }

            const isQuota = errorMsg.includes("429") || errorMsg.includes("RESOURCE_EXHAUSTED") || errorMsg.includes("quota");
            const isUnavailable = errorMsg.includes("503") || errorMsg.includes("UNAVAILABLE") || errorMsg.includes("high demand");
            
            if ((isQuota || isUnavailable) && retryCount < maxRetries) {
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
        let errorMsg = error.message || "";
        try {
          const parsed = JSON.parse(errorMsg);
          if (parsed.error?.message) errorMsg = parsed.error.message;
        } catch { /* ignore */ }

        const isQuota = errorMsg.includes("429") || errorMsg.includes("RESOURCE_EXHAUSTED") || errorMsg.includes("quota");
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
  throw lastError;
};

export const generateImageFree = async (prompt: string) => {
  const encodedPrompt = encodeURIComponent(prompt);
  const seed = Math.floor(Math.random() * 1000000);
  const imageUrl = `https://pollinations.ai/p/${encodedPrompt}?width=1024&height=1024&seed=${seed}&model=flux`;
  
  // Synthetic delay to allow Flux model to "render" on their end and show feedback in UI
  await sleep(12000); 
  
  // Trigger generation by pinging the URL (pollinations generates on GET)
  try {
     await fetch(imageUrl);
  } catch (e) {
     console.warn("Free image generation probe failed, proceeding with URL:", e);
  }
  
  return { url: imageUrl };
};

export const generateGeminiVoice = async (
  text: string,
  voiceLang: string,
  voiceGender: 'MALE' | 'FEMALE',
  voiceStyle: string,
  apiKeys: string[],
  outputLanguage: 'EN' | 'VN',
  useProjectKey: boolean = true,
  voiceQuality?: string
): Promise<string> => {
  const customKey = sessionStorage.getItem('veopro_custom_key');
  const defaultKey = import.meta.env.VITE_GEMINI_API_KEY || (typeof process !== 'undefined' ? (process.env.GEMINI_API_KEY || process.env.API_KEY) : undefined);
  const envKeysString = import.meta.env.VITE_GEMINI_API_KEYS || '';
  const envKeys = envKeysString.split(',').map((k: string) => k.trim()).filter((k: string) => k !== '');
  
  let allKeys: string[] = [];
  
  if (useProjectKey) {
    if (defaultKey) allKeys.push(defaultKey);
    allKeys = [...allKeys, ...envKeys];
    
    // Support plural and multiple keys in environment variables
    const pro1 = typeof process !== 'undefined' ? (process.env.GOOGLE_KEYS_PRO1 || process.env.GOOGLE_KEY_PRO1) : undefined;
    const pro9 = typeof process !== 'undefined' ? (process.env.GOOGLE_KEYS_PRO9 || process.env.GOOGLE_KEY_PRO9) : undefined;
    
    if (pro1) allKeys.push(...pro1.split(/[\n,]/));
    if (pro9) allKeys.push(...pro9.split(/[\n,]/));
    
    if (apiKeys.length > 0) allKeys = [...allKeys, ...apiKeys];
  } else {
    if (customKey && !customKey.startsWith('GOOGLE_KEY_')) allKeys.push(customKey);
    allKeys = [...allKeys, ...apiKeys];
    if (allKeys.length === 0) {
      if (defaultKey) allKeys.push(defaultKey);
      allKeys = [...allKeys, ...envKeys];
    }
  }
  
  const finalKeys = Array.from(new Set(processKeys(allKeys)));
  
  if (finalKeys.length === 0) {
    const error = new Error("API Key missing. Please select an API key to continue.");
    (error as any).isKeyError = true;
    throw error;
  }

  const langName = voiceLang === 'vi-VN' ? 'Vietnamese' : 
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

  const getPrompt = (segmentText: string, gender: string) => {
    const deepMaleExtra = gender === 'MALE' ? ' (giọng nam trầm, mạnh mẽ, uy quyền)' : '';
    
    return `Say this text in ${langName} with a ${gender.toLowerCase()} voice${deepMaleExtra}. 
Style: ${styleText}, Quality: ${qualityText}.
TEXT: ${segmentText}`;
  };

  const rawSegments = text.split(/(\[Giọng Nam\]|\[Giọng Nữ\])/g);
  const segments: { text: string; gender: 'MALE' | 'FEMALE' }[] = [];
  
  // Find the first tag in the whole text to serve as the default for text appearing BEFORE any tag.
  // If no tag is found at all, we use the global voiceGender setting.
  let firstTagInBox: 'MALE' | 'FEMALE' | null = null;
  for (const part of rawSegments) {
    if (part === '[Giọng Nam]') {
      firstTagInBox = 'MALE';
      break;
    } else if (part === '[Giọng Nữ]') {
      firstTagInBox = 'FEMALE';
      break;
    }
  }

  let currentActiveGender: 'MALE' | 'FEMALE' = firstTagInBox || voiceGender;

  for (let i = 0; i < rawSegments.length; i++) {
    const part = rawSegments[i];
    if (part === '[Giọng Nam]') {
      currentActiveGender = 'MALE';
      continue;
    } else if (part === '[Giọng Nữ]') {
      currentActiveGender = 'FEMALE';
      continue;
    }
    
    const trimmed = part.trim();
    if (trimmed) {
      segments.push({ text: trimmed, gender: currentActiveGender });
    }
  }

  if (segments.length === 0) return "";

  const generateChunk = async (chunk: { text: string; gender: 'MALE' | 'FEMALE' }, apiKey: string): Promise<Uint8Array> => {
    const ai = new GoogleGenAI({ apiKey });
    let retryCount = 0;
    const maxRetries = 5;

    const execute = async (): Promise<Uint8Array> => {
      try {
        const promptText = getPrompt(chunk.text, chunk.gender);
        // Using consistent models and voice names for stability
        const voiceName = chunk.gender === 'MALE' ? 'Fenrir' : 'Kore'; // Fenrir is deeper and stronger
        
        const response = await ai.models.generateContent({
          model: "gemini-3.1-flash-tts-preview",
          contents: [{ role: 'user', parts: [{ text: promptText }] }],
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
        if (base64Audio) {
          const binaryString = atob(base64Audio);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          return bytes;
        }
        throw new Error("No audio data returned");
      } catch (error: any) {
        let errorMsg = error.message || "";
        try {
          const parsed = JSON.parse(errorMsg);
          if (parsed.error?.message) errorMsg = parsed.error.message;
        } catch { /* ignore */ }

        const isQuota = errorMsg.includes("429") || errorMsg.includes("RESOURCE_EXHAUSTED") || errorMsg.includes("quota");
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
          console.warn(`Key (ending ${apiKey.slice(-4)}) hit quota/unavailable. Switching key...`);
        }
        throw error;
      }
    };
    return await execute();
  };

  let lastError: any = null;
  const startIdx = Math.floor(Math.random() * finalKeys.length);

  for (let count = 0; count < finalKeys.length; count++) {
    const i = (startIdx + count) % finalKeys.length;
    const apiKey = finalKeys[i];
    try {
      const pcmChunks: Uint8Array[] = [];
      for (const segment of segments) {
        const pcm = await generateChunk(segment, apiKey);
        pcmChunks.push(pcm);
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
      let errorMsg = error.message || "";
      try {
        const parsed = JSON.parse(errorMsg);
        if (parsed.error?.message) errorMsg = parsed.error.message;
      } catch { /* ignore */ }

      const isQuota = errorMsg.includes("429") || errorMsg.includes("RESOURCE_EXHAUSTED") || errorMsg.includes("quota");
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
