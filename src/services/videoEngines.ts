import { generateVeoVideo } from './gemini';
import { WAVESPEED_ENDPOINTS } from '../constants';

export type VideoEngine = 'veo' | 'seedance' | 'kling';

export interface EngineConfig {
  id: VideoEngine;
  name: string;
  pricePerSec: number;      // USD
  quality: string;
  badge: string;
  color: string;
}

export const VIDEO_ENGINES: EngineConfig[] = [
  {
    id: 'veo',
    name: 'Veo 3.1 Fast',
    pricePerSec: 0.09,
    quality: 'Cinematic • Audio native',
    badge: 'GOOGLE',
    color: '#4285F4'
  },
  {
    id: 'seedance', 
    name: 'Seedance Fast',
    pricePerSec: 0.022,
    quality: 'Nhanh • Rẻ nhất • Audio có',
    badge: 'BYTEDANCE',
    color: '#00C4CC'
  },
  {
    id: 'kling',
    name: 'Kling 3.0',
    pricePerSec: 0.095,
    quality: 'Nhân vật người • #1 Benchmark',
    badge: 'KUAISHOU', 
    color: '#FF6B35'
  }
];

export async function generateVideoByEngine(
  engine: VideoEngine,
  params: {
    prompt: string;
    aspectRatio: '16:9' | '9:16' | '1:1';
    duration?: number;         // giây, default 8
    apiKey: string;            // WaveSpeed API key or Gemini key context
    onProgress?: (msg: string) => void;
    geminiParams?: any;        // Parameters for existing generateVeoVideo
  }
): Promise<{ finalUrl: string; engine: VideoEngine }> {
  if (engine === 'veo') {
    const result = await generateVeoVideo({
      ...params.geminiParams,
      prompt: params.prompt,
      aspectRatio: params.aspectRatio,
      onProgress: params.onProgress
    });
    return { finalUrl: result.finalUrl, engine: 'veo' };
  }

  // WaveSpeed logic for Seedance and Kling
  const endpoint = engine === 'seedance' ? WAVESPEED_ENDPOINTS.seedance : WAVESPEED_ENDPOINTS.kling;
  
  if (!params.apiKey) {
    throw new Error('WaveSpeed API Key is required for this engine.');
  }

  params.onProgress?.(`Initializing ${engine === 'seedance' ? 'Seedance' : 'Kling'}...`);

  // Step 1: Submit Job
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      prompt: params.prompt,
      aspect_ratio: params.aspectRatio,
      duration: params.duration || 8,
      enable_safety_checker: true
    })
  });

  const data = await response.json();
  if (!response.ok || !data.data?.id) {
    throw new Error(data.message || data.error?.message || `Failed to submit ${engine} job.`);
  }

  const jobId = data.data.id;
  params.onProgress?.(`Job submitted: ${jobId}. Rendering...`);

  // Step 2: Poll for results
  const maxAttempts = 36; // 36 * 5s = 180s
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    try {
      const pollResponse = await fetch(WAVESPEED_ENDPOINTS.pollResult(jobId), {
        headers: { 'Authorization': `Bearer ${params.apiKey}` }
      });
      const pollData = await pollResponse.json();

      if (pollResponse.ok && pollData.data?.outputs && pollData.data.outputs.length > 0) {
        return { finalUrl: pollData.data.outputs[0], engine };
      }

      if (pollData.data?.status === 'failed') {
        throw new Error(pollData.data.error || 'Job failed on server side.');
      }

      params.onProgress?.(`Rendering ${engine}... ${Math.min(99, Math.round((attempt / maxAttempts) * 100))}%`);
    } catch (e: any) {
      if (e.message.includes('failed')) throw e;
      // Continue polling on transient errors
    }
  }

  throw new Error(`${engine} generation timed out after 3 minutes.`);
}
