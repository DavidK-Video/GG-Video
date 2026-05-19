// api/siliconflow.ts — Vercel Serverless Function
// Browser gọi /api/siliconflow → server này gọi SiliconFlow → trả ảnh về
// Giải quyết CORS hoàn toàn

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.SILICONFLOW_API_KEY || process.env.VITE_SILICONFLOW_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'SiliconFlow API key not configured' });
  }

  try {
    const { prompt, image, size = '1024x1024' } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt required' });

    const body: any = {
      model: 'black-forest-labs/FLUX.1-Kontext-dev',
      prompt,
      image_size: size,
      num_inference_steps: 28,
    };

    // Nếu có ảnh tham chiếu → truyền vào
    if (image) body.image = image;

    const response = await fetch('https://api.siliconflow.cn/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }

    const data = await response.json();
    const imageUrl = data?.images?.[0]?.url || data?.data?.[0]?.url;
    if (!imageUrl) return res.status(500).json({ error: 'No image URL returned' });

    return res.status(200).json({ url: imageUrl });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
