
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    console.log('Vite Config Environment Check:', {
      mode,
      hasEnvGemini: !!env.GEMINI_API_KEY,
      hasProcessGemini: !!process.env.GEMINI_API_KEY,
      hasProcessApiKey: !!process.env.API_KEY,
    });
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/api/aistudio-proxy': {
            target: 'https://generativelanguage.googleapis.com',
            changeOrigin: true,
            secure: true,
            rewrite: (path) => path.replace(/^\/api\/aistudio-proxy/, ''),
            configure: (proxy) => {
              proxy.on('proxyReq', (proxyReq, req) => {
                // Forward Cookie from headers
                const cookie = req.headers['cookie'];
                if (cookie) {
                  proxyReq.setHeader('Cookie', cookie);
                }
                // AI Studio specifically checks these
                proxyReq.setHeader('Origin', 'https://aistudio.google.com');
                proxyReq.setHeader('Referer', 'https://aistudio.google.com/');
                proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36');
                proxyReq.setHeader('X-Requested-With', 'XMLHttpRequest');
              });
              proxy.on('proxyRes', () => {
                 // Ensure CORS headers are correct if needed, but changeOrigin handles most
              });
            },
          },
        },
      },
      plugins: [react(), tailwindcss()],
      build: {
        rollupOptions: {
          input: {
            main: path.resolve('.', 'index.html'),
            popup: path.resolve('.', 'popup.html'),
          },
        },
      },
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY || env.API_KEY || process.env.GEMINI_API_KEY || process.env.API_KEY || ''),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || env.API_KEY || process.env.GEMINI_API_KEY || process.env.API_KEY || ''),
        'process.env.GOOGLE_KEY_PRO1': JSON.stringify(env.GOOGLE_KEY_PRO1 || process.env.GOOGLE_KEY_PRO1 || ''),
        'process.env.GOOGLE_KEY_PRO9': JSON.stringify(env.GOOGLE_KEY_PRO9 || process.env.GOOGLE_KEY_PRO9 || ''),
        'process.env.TTS_API_KEY': JSON.stringify(env.TTS_API_KEY || env.GEMINI_API_KEY || env.API_KEY || process.env.TTS_API_KEY || '')
      },
      resolve: {
        alias: {
          // Fixed: use path.resolve() which defaults to the current working directory, avoiding potential type issues with process.cwd()
          '@': path.resolve('.'),
        }
      }
    };
});
