// api/pixazo.ts — Vercel Serverless Function
// Browser gọi /api/pixazo → server này gọi Pixazo → trả ảnh về
// Giải quyết CORS hoàn toàn

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Chỉ cho phép POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.VITE_PIXAZO_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Pixazo API key not configured' });
  }

  try {
    const { prompt, size = '1024x1024' } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt required' });

    const response = await fetch('https://api.pixazo.ai/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'flux-schnell',
        prompt,
        n: 1,
        size,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }

    const data = await response.json();
    const imageUrl = data?.data?.[0]?.url || data?.images?.[0]?.url;
    if (!imageUrl) return res.status(500).json({ error: 'No image URL returned' });

    return res.status(200).json({ url: imageUrl });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
