
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { 
  CONSISTENCY_IMAGE_GEN_INSTRUCTION,
  DIRECTOR_MODE_INSTRUCTION, 
  IMAGE_GEN_INSTRUCTION,
  SEAMLESS_FLOW_INSTRUCTION,
  STORY_DNA_INSTRUCTION
} from '../constants';
import { generateGeminiText, generateGeminiImage, generateImageFree, processKeys } from '../services/gemini';
import { generateVideoByEngine, VideoEngine, VIDEO_ENGINES } from '../services/videoEngines';
import { generateVeoVideoByCookie } from '../services/geminiCookie';
import { CookieToggle } from './CookieToggle';
import { EngineSelector } from './EngineSelector';
import { AspectRatio, BatchResult, GenerationHistory, Resolution, UserProfile, VideoMode } from '../types';
import { translate } from '../i18n';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { googleSheetService } from '../services/googleSheetService';
import { isTruthy } from '../services/utils';

interface VideoGeneratorProps {
  onGenerated: (item: GenerationHistory) => void;
  history: GenerationHistory[];
  onOpenPricing: () => void;
  profile: UserProfile;
  onKeyError: () => void;
  activeTasks: GenerationHistory[];
  setActiveTasks: React.Dispatch<React.SetStateAction<GenerationHistory[]>>;
  analyzedScript: string;
  setAnalyzedScript: (s: string) => void;
  directorScript: string;
  setDirectorScript: (s: string) => void;
  seamlessScript: string;
  setSeamlessScript: (s: string) => void;
  targetLink: string;
  setTargetLink: (l: string) => void;
  batchResults: BatchResult[];
  setBatchResults: React.Dispatch<React.SetStateAction<BatchResult[]>>;
  outputLanguage: 'EN' | 'VN';
  setOutputLanguage: (lang: 'EN' | 'VN') => void;
  userPlan: 'free' | 'pro' | 'enterprise';
  credit: number;
  setCredit: (c: number) => void;
  email: string;
  phone: string;
  projectName: string;
  apiKeys: string[];
  adminFreeKeys?: string[];
  adminPaidKeys?: string[];
  hasApiKey: boolean;
  onOpenKeyPicker: () => void;
  deductCredit: (amount: number, action?: any) => Promise<boolean>;
  useProjectKey: boolean;
}

enum ToolMode {
  NONE = 'NONE',
  STORY_DNA = 'STORY_DNA',
  DIRECTOR = 'DIRECTOR',
  SEAMLESS_FLOW = 'SEAMLESS_FLOW',
  IMAGE_GEN = 'IMAGE_GEN',
  BATCH_IMAGE_GEN = 'BATCH_IMAGE_GEN'
}

const FILM_STYLES = [
  { id: 'hollywood', name: { VN: '🎬 Hollywood (Mặc định)', EN: '🎬 Hollywood (Default)' }, prompt: 'Cinematic Hollywood movie style, high budget production, detailed textures, professional color grading' },
  { id: 'action', name: { VN: '💥 Hành động (Action)', EN: '💥 Action' }, prompt: 'High-octane action movie style, dynamic camera angles, intense lighting, gritty textures' },
  { id: 'horror', name: { VN: '👻 Kinh dị (Horror)', EN: '👻 Horror' }, prompt: 'Dark horror movie aesthetic, eerie atmosphere, high contrast shadows, suspenseful lighting, desaturated colors' },
  { id: 'scifi', name: { VN: '🚀 Viễn tưởng (Sci-Fi)', EN: '🚀 Sci-Fi' }, prompt: 'Futuristic science fiction style, advanced technology, neon accents, sleek surfaces, cosmic lighting' },
  { id: 'romance', name: { VN: '💖 Lãng mạn (Romance)', EN: '💖 Romance' }, prompt: 'Soft romantic film aesthetic, warm golden hour lighting, shallow depth of field, dreamy atmosphere' },
  { id: 'fantasy', name: { VN: '🧙 Phép thuật (Fantasy)', EN: '🧙 Fantasy' }, prompt: 'Epic fantasy movie style, magical atmosphere, ethereal lighting, mythical creatures, rich textures' },
  { id: 'mystery', name: { VN: '🔍 Bí ẩn (Mystery)', EN: '🔍 Mystery' }, prompt: 'Suspenseful mystery film noir style, low-key lighting, foggy atmosphere, sharp focus on details' },
  { id: 'war', name: { VN: '🎖️ Chiến tranh (War)', EN: '🎖️ War' }, prompt: 'Gritty war movie aesthetic, desaturated colors, handheld camera feel, smoke and debris, intense realism' },
  { id: 'western', name: { VN: '🤠 Miền Tây (Western)', EN: '🤠 Western' }, prompt: 'Classic Western film style, dusty atmosphere, warm sepia tones, wide landscape shots, high noon lighting' },
  { id: 'musical', name: { VN: '🎶 Nhạc kịch (Musical)', EN: '🎶 Musical' }, prompt: 'Vibrant musical film style, theatrical lighting, colorful costumes, dynamic stage-like compositions' },
  { id: 'documentary', name: { VN: '📹 Tài liệu (Documentary)', EN: '📹 Documentary' }, prompt: 'Realistic documentary style, natural lighting, handheld camera, authentic textures, raw feel' },
  { id: 'anime', name: { VN: '🇯🇵 Anime Studio Ghibli', EN: '🇯🇵 Anime Ghibli' }, prompt: 'Studio Ghibli anime style, hand-drawn aesthetic, soft natural lighting, vibrant colors' },
  { id: 'disney', name: { VN: '🏰 Disney/Pixar 3D', EN: '🏰 Disney/Pixar 3D' }, prompt: 'Disney Pixar 3D animation style, expressive characters, smooth surfaces, whimsical lighting' },
  { id: 'vintage', name: { VN: '🎞️ Vintage 1970s', EN: '🎞️ Vintage 1970s' }, prompt: 'Vintage 1970s film style, grainy texture, warm retro colors, slight lens flare' },
  { id: 'noir', name: { VN: '🌑 Film Noir (B&W)', EN: '🌑 Film Noir (B&W)' }, prompt: 'Classic Film Noir style, black and white, high contrast, dramatic shadows, moody atmosphere' },
  { id: 'cyberpunk', name: { VN: '🌃 Cyberpunk Neon', EN: '🌃 Cyberpunk Neon' }, prompt: 'Cyberpunk cinematic style, neon lighting, futuristic atmosphere, high tech detail' },
  { id: 'k-drama', name: { VN: '🇰🇷 K-Drama Aesthetic', EN: '🇰🇷 K-Drama Aesthetic' }, prompt: 'Korean Drama aesthetic, clean soft lighting, pastel color palette, romantic atmosphere' }
];

const FILM_GENRES = [
  { id: 'review', name: { VN: '🎬 Review: Phim, Sản phẩm, Dịch vụ, So sánh, Unboxing', EN: '🎬 Review: Movie, Product, Service, Comparison, Unboxing' } },
  { id: 'vlog', name: { VN: '📹 Vlog: Daily, Travel, Behind scenes, Một ngày làm việc', EN: '📹 Vlog: Daily, Travel, Behind scenes, A working day' } },
  { id: 'livestream', name: { VN: '📡 Livestream: Q&A, Talkshow, Bán hàng, Gaming', EN: '📡 Livestream: Q&A, Talkshow, Sales, Gaming' } },
  { id: 'love_story', name: { VN: '💖 Kể chuyện – Chủ đề Tình Yêu', EN: '💖 Storytelling – Love Theme' } },
  { id: 'action', name: { VN: '💥 Hành động', EN: '💥 Action' } },
  { id: 'comedy', name: { VN: '😂 Hài hước', EN: '😂 Comedy' } },
  { id: 'drama', name: { VN: '🎭 Tâm lý', EN: '🎭 Drama' } },
  { id: 'horror', name: { VN: '👻 Kinh dị', EN: '👻 Horror' } },
  { id: 'sci-fi', name: { VN: '🚀 Viễn tưởng', EN: '🚀 Sci-Fi' } },
  { id: 'romance', name: { VN: '💖 Lãng mạn', EN: '💖 Romance' } },
  { id: 'thriller', name: { VN: '🔪 Giật gân', EN: '🔪 Thriller' } },
  { id: 'fantasy', name: { VN: '🧙 Phép thuật', EN: '🧙 Fantasy' } },
  { id: 'animation', name: { VN: '🎨 Hoạt hình', EN: '🎨 Animation' } },
  { id: 'documentary', name: { VN: '🎥 Tài liệu', EN: '🎥 Documentary' } },
];

const getYohuIntro = (lang: 'EN' | 'VN') => translate('YOHU_INTRO', lang);

export const VideoGenerator: React.FC<VideoGeneratorProps> = ({ 
  onGenerated, history = [], onOpenPricing, profile, onKeyError, activeTasks, setActiveTasks,
  analyzedScript, setAnalyzedScript, directorScript, setDirectorScript,
  seamlessScript, setSeamlessScript,
  batchResults, setBatchResults,
  outputLanguage, setOutputLanguage, userPlan, credit,
  email,
  apiKeys, adminFreeKeys = [], adminPaidKeys = [], hasApiKey, onOpenKeyPicker, useProjectKey, deductCredit
}) => {
  /**
   * Production-ready validation and credit/limit check.
   * Queries the Google Sheet service for verification.
   */
  const validateAndPrepareGeneration = async (cost: number, modeType?: 'video' | 'image' | 'text' | 'voice') => {
    if (!email) {
      alert(translate('ACTIVATE_FIRST', outputLanguage));
      return null;
    }

    const isFluxGen = modeType === 'image' && profile.use_free_image_gen;
    const finalCost = isFluxGen ? 0 : cost;

    try {
      const cleanEmail = email.trim().toLowerCase();
      const result = await googleSheetService.fetchUser(cleanEmail);

      const isSystemAdmin = cleanEmail === 'yohu.vn@gmail.com';

      if (!result || !result.email) {
        if (isSystemAdmin) {
          // Fallback for system admin if sheet lookup fails
          return {
            role: 'admin',
            credits: 999999,
            isAdmin: true,
            plan: 'pro9',
            effectiveApiKeys: apiKeys,
            effectiveUseProjectKey: true
          };
        }
        alert(translate('ACCOUNT_NOT_ACTIVATED', outputLanguage));
        return null;
      }

      const user = result;
      const role = (user.role || '').trim().toLowerCase();
      const planUpper = String(user.plan || "").toUpperCase();
      
      const isPro9 = planUpper === 'PRO9' || planUpper.includes("GÓI CHUYÊN NGHIỆP 9") || planUpper.includes("PROFESSIONAL 9") || planUpper.includes("VIP") || role === 'admin' || isSystemAdmin;
      const isProPlan = isPro9 || planUpper.includes('PRO') || planUpper.includes('VIP') || planUpper.includes('CHUYÊN NGHIỆP');
      
      const isAdmin = isPro9;
      const expiry = user.expiry ? new Date(user.expiry) : null;
      const now = new Date();
      const isExpired = expiry && now > expiry;
      const isActive = (isTruthy(user.active) && !isExpired && user.userStatus === 'ACTIVE') || isAdmin;
      
      // Basic activity check
      if (!isActive) {
        alert(translate('ACCOUNT_INACTIVE_MSG', outputLanguage));
        return null;
      }
      const isFree = !isProPlan && !isAdmin;

      // SPECIFIC PLAN RESTRICTIONS FOR VIDEO AND GEMINI IMAGE
      const isGeminiImage = modeType === 'image' && !isFluxGen;
      if ((modeType === 'video' || isGeminiImage) && !isPro9 && !isAdmin) {
        // Extract user keys early to check if they have personal keys
        let tempRawKeys: string[] = [];
        if (typeof user.api_keys === 'string') {
          try { tempRawKeys = JSON.parse(user.api_keys); } catch {
            if (user.api_keys && user.api_keys.trim()) {
              tempRawKeys = user.api_keys.split(/[,;\n\s]+/).map((s: string) => s.trim()).filter((s: string) => s && s.length > 5);
            }
          }
        } else if (Array.isArray(user.api_keys)) {
          tempRawKeys = user.api_keys;
        }

        const hasValidPersonalKeys = processKeys(tempRawKeys).length > 0;
        
        // If FREE or PRO1 and NOT using personal keys for video or Gemini image -> Block
        if (!hasValidPersonalKeys) {
          if (modeType === 'video') {
            alert(translate('UPGRADE_TO_PRO9', outputLanguage));
          } else {
            alert("Gói FREE và PRO1 cần nhập API Key cá nhân để tạo ảnh Gemini. Vui lòng nâng cấp Pro9 hoặc tự nhập Key.\n\nFREE and PRO1 plans require a personal API Key for Gemini images. Please upgrade to Pro9 or enter your own key.");
          }
          return null;
        }
      }

      // Experience Limits check (mainly for true free users or to prevent spam)
      if (isFree && !isFluxGen) {
        const usageKey = `veopro_usage_${cleanEmail}_${new Date().toISOString().split('T')[0]}`;
        const dailyUsage = Number(localStorage.getItem(usageKey) || 0);
        
        // Define hard limits for Free plan only
        const limits = { video: 2, image: 5, text: 10, voice: 5 };
        if (modeType && dailyUsage >= (limits[modeType] || 5)) {
          alert(`Giới hạn dùng thử hàng ngày đã hết. Vui lòng nâng cấp gói Pro để tiếp tục tạo ${modeType}.\n\nDaily limit reached. Please upgrade to Pro to continue.`);
          return null;
        }
        localStorage.setItem(usageKey, (dailyUsage + 1).toString());
      }

      const hasUnlimited = (isAdmin || isProPlan) && !isExpired;
      const credits = Number(user.credits || 0);

      // Extract user keys early
      let userKeysRaw: string[] = [];
      if (typeof user.api_keys === 'string') {
        try {
          userKeysRaw = JSON.parse(user.api_keys);
        } catch {
          if (user.api_keys && typeof user.api_keys === 'string' && user.api_keys.trim()) {
            userKeysRaw = user.api_keys.split(/[,;\n\s]+/).map((s: string) => s.trim()).filter((s: string) => s && s.length > 5);
          }
        }
      } else if (Array.isArray(user.api_keys)) {
        userKeysRaw = user.api_keys;
      }
      const userKeys = processKeys(userKeysRaw);
      
      // Credit check logic
      // Luôn gọi trừ xu để đồng bộ với Sheet. 
      // Phân quyền (Admin/Gói) đã được xử lý trong hàm deductCredit ở App.tsx
      const actionMap: Record<string, any> = { video: 'VIDEO', image: 'IMAGE', text: 'TEXT', voice: 'VOICE' };
      const action = actionMap[modeType || 'video'] || 'VIDEO';
      
      const success = await deductCredit(finalCost, action);
      if (!success) return null;

      // Determine API Key usage logic
      let finalApiKeys = apiKeys;
      let finalUseProjectKey = useProjectKey;
      const hasPersonalKeys = userKeys.length > 0;

      if (hasPersonalKeys) {
        // ALWAYS prioritize personal keys if present
        finalApiKeys = userKeys;
        
        // Restriction: PRO1 and FREE cannot use project keys for Gemini image generation or video
        if (modeType === 'image' && !isFluxGen && !isPro9) {
          finalUseProjectKey = false;
        } else if (modeType === 'video' && !isPro9) {
          finalUseProjectKey = false;
        } else {
          // Others follow the toggle preference (Pro9 or non-image actions like text/voice)
          finalUseProjectKey = useProjectKey;
        }
      } else {
        // If NO personal keys:
        finalApiKeys = apiKeys;
        
        if ((modeType === 'image' && !isFluxGen) || modeType === 'video') {
          // Strictly PRO9/Admin can use project keys for Gemini images or video
          finalUseProjectKey = isPro9;
        } else {
          // Text, Voice or Flux: Always allow project keys fallback for all plans
          finalUseProjectKey = true;
        }
      }

      return {
        ...user,
        role: isAdmin ? 'admin' : role,
        isAdmin,
        credits: hasUnlimited ? 999999 : credits - cost,
        effectiveApiKeys: finalApiKeys,
        effectiveUseProjectKey: finalUseProjectKey
      };
    } catch (err: any) {
      console.error("Validation error:", err);
      // Fallback in case of network issues (Offline experience mode)
      return {
        role: 'user',
        credits: 1,
        effectiveApiKeys: apiKeys,
        effectiveUseProjectKey: true
      };
    }
  };

  const finalizeGeneration = async () => {
    // We don't need to do anything here anymore as credits are deducted upfront
  };

  const [mode, setMode] = useState<VideoMode>(VideoMode.TEXT_TO_VIDEO);
  const [toolMode, setToolMode] = useState<ToolMode>(ToolMode.NONE);
  const [concurrentRenderCount, setConcurrentRenderCount] = useState<0 | 3 | 5>(0);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(AspectRatio.LANDSCAPE);
  const [resolution, setResolution] = useState<Resolution>(Resolution.R720P);
  const [selectedStyle, setSelectedStyle] = useState(FILM_STYLES[0]);
  const [selectedGenre, setSelectedGenre] = useState(FILM_GENRES[0]);

  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editPromptValue, setEditPromptValue] = useState("");
  const [linkTopic, setLinkTopic] = useState("");
  const [storyCount, setStoryCount] = useState<number>(1);
  const [maleCount, setMaleCount] = useState<number>(1);
  const [femaleCount, setFemaleCount] = useState<number>(1);
  const [countdown, setCountdown] = useState(20);
  const countdownIntervalRef = useRef<any>(null);

  const [selectedEngine, setSelectedEngine] = useState<VideoEngine>('veo');

  // ── Cookie Mode ─────────────────────────────────────────────────────────
  const [useCookieMode, setUseCookieMode] = useState<boolean>(() =>
    localStorage.getItem('veopro_use_cookie') === 'true'
  );
  const [cookieString, setCookieString] = useState<string>(() =>
    localStorage.getItem('veopro_cookie') || ''
  );
  // ────────────────────────────────────────────────────────────────────────
  const [wavespeedApiKey, setWavespeedApiKey] = useState(() => localStorage.getItem('wavespeed_api_key') || '');

  // Logic for WaveSpeed effective key
  const effectiveWavespeedKey = useMemo(() => {
    // Priority: User manually entered key
    if (wavespeedApiKey.trim()) return wavespeedApiKey.trim();
    // Fallback for PRO9: System key from env
    if (userPlan === 'pro' && (profile.plan_type === 'pro9' || (profile as any).plan === 'pro9')) {
      return import.meta.env.VITE_WAVESPEED_API_KEY || '';
    }
    return '';
  }, [wavespeedApiKey, userPlan, profile]);

  useEffect(() => {
    if (wavespeedApiKey) {
      localStorage.setItem('wavespeed_api_key', wavespeedApiKey);
    }
  }, [wavespeedApiKey]);

  useEffect(() => { localStorage.setItem("veopro_use_cookie", useCookieMode.toString()); }, [useCookieMode]);
  useEffect(() => { if (cookieString) localStorage.setItem("veopro_cookie", cookieString); else localStorage.removeItem("veopro_cookie"); }, [cookieString]);

  const [characterPrompts, setCharacterPrompts] = useState("");
  const [scenePrompts, setScenePrompts] = useState("");
  const [generatingTool, setGeneratingTool] = useState<ToolMode | VideoMode | 'BATCH' | null>(null);
  const [refImage, setRefImage] = useState<string | null>(() => localStorage.getItem('veopro_ref_image'));
  const [editingBatchIdx, setEditingBatchIdx] = useState<number | null>(null);
  const [editingBatchPrompt, setEditingBatchPrompt] = useState("");

  const [directorForm, setDirectorForm] = useState({ genre: translate('ACTION_GENRE', outputLanguage), plot: '', dna: '', environment: '' });
  const [seamlessForm, setSeamlessForm] = useState({ plot: '', dna: '', environment: '' });
  const [toolPromptCount, setToolPromptCount] = useState('20');

  useEffect(() => {
    try {
      if (refImage) safeSave('veopro_ref_image', refImage);
      else localStorage.removeItem('veopro_ref_image');
    } catch (e) {
      console.error(e);
    }
  }, [refImage]);

  const [modePrompts, setModePrompts] = useState<Record<VideoMode, string>>(() => {
    try {
      const saved = localStorage.getItem('veopro_mode_prompts');
      return saved ? JSON.parse(saved) : {
        [VideoMode.TEXT_TO_VIDEO]: '', [VideoMode.IMAGE_TO_VIDEO]: '', [VideoMode.INTERPOLATION]: '', [VideoMode.CONSISTENCY]: ''
      };
    } catch { return { [VideoMode.TEXT_TO_VIDEO]: '', [VideoMode.IMAGE_TO_VIDEO]: '', [VideoMode.INTERPOLATION]: '', [VideoMode.CONSISTENCY]: '' }; }
  });

  const [modeImages, setModeImages] = useState<Record<VideoMode, {url: string, name: string}[]>>(() => {
    try {
      const saved = localStorage.getItem('veopro_mode_images');
      const parsed = saved ? JSON.parse(saved) : {};
      return {
        [VideoMode.TEXT_TO_VIDEO]: parsed[VideoMode.TEXT_TO_VIDEO] || [],
        [VideoMode.IMAGE_TO_VIDEO]: parsed[VideoMode.IMAGE_TO_VIDEO] || [],
        [VideoMode.INTERPOLATION]: parsed[VideoMode.INTERPOLATION] || [],
        [VideoMode.CONSISTENCY]: parsed[VideoMode.CONSISTENCY] || [],
      };
    } catch {
      return { [VideoMode.TEXT_TO_VIDEO]: [], [VideoMode.IMAGE_TO_VIDEO]: [], [VideoMode.INTERPOLATION]: [], [VideoMode.CONSISTENCY]: [] };
    }
  });

  const safeSave = (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
        console.warn('LocalStorage full, clearing non-essential data...');
        // Clear non-essential items
        const nonEssential = [
          'veopro_history', 
          'veopro_batch_results', 
          'veopro_analyzed_script',
          'veopro_director_script',
          'veopro_seamless_script'
        ];
        nonEssential.forEach(k => localStorage.removeItem(k));
        
        // If still failing, clear mode images which are usually the largest
        try {
          localStorage.setItem(key, value);
        } catch {
          console.warn('Still exceeding quota, clearing mode images...');
          localStorage.removeItem('veopro_mode_images');
          try {
            localStorage.setItem(key, value);
          } catch (finalError) {
            console.error('Critical: Storage quota exceeded even after aggressive clearing', finalError);
          }
        }
      } else {
        console.error('Error saving to localStorage', e);
      }
    }
  };

  useEffect(() => { 
    safeSave('veopro_mode_prompts', JSON.stringify(modePrompts));
  }, [modePrompts]);
  
  useEffect(() => { 
    safeSave('veopro_mode_images', JSON.stringify(modeImages));
  }, [modeImages]);

  const [concurrentPrompts, setConcurrentPrompts] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('veopro_concurrent_prompts');
      return saved ? JSON.parse(saved) : ['', '', '', '', ''];
    } catch { return ['', '', '', '', '']; }
  });

  useEffect(() => {
    safeSave('veopro_concurrent_prompts', JSON.stringify(concurrentPrompts));
  }, [concurrentPrompts]);

  const [selectedPrompts, setSelectedPrompts] = useState<Set<number>>(new Set());
  useEffect(() => { setSelectedPrompts(new Set()); }, [mode]);

  const toggleSelectPrompt = (idx: number) => {
    setSelectedPrompts(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleSelectAllPrompts = () => {
    const prompts = currentPromptText.split('\n').filter(p => p.trim() !== '');
    if (selectedPrompts.size < prompts.length) {
      const next = new Set<number>();
      prompts.forEach((_, i) => next.add(i));
      setSelectedPrompts(next);
    } else {
      setSelectedPrompts(new Set());
    }
  };

  const handleDeleteSelectedPrompts = () => {
    const prompts = currentPromptText.split('\n');
    const remaining = prompts.filter((_, i) => !selectedPrompts.has(i));
    updatePromptForMode(remaining.join('\n'));
    setSelectedPrompts(new Set());
  };

  const [isGenerating, setIsGenerating] = useState(false);
  const [isFullVideoRendering, setIsFullVideoRendering] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isPortrait, setIsPortrait] = useState(window.innerHeight > window.innerWidth);

  useEffect(() => {
    const handleResize = () => setIsPortrait(window.innerHeight > window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const isStoppingRef = useRef(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const refImageInputRef = useRef<HTMLInputElement>(null);
  const specificSlotRef = useRef<{ index: number; subIndex?: number } | null>(null);
  const [showZaloQR, setShowZaloQR] = useState(false);
  const [showZaloGroupQR, setShowZaloGroupQR] = useState(false);

  const currentImages = modeImages[mode] || [];
  const currentPromptText = modePrompts[mode] || '';
  const updatePromptForMode = (newText: string) => setModePrompts(prev => ({ ...prev, [mode]: newText }));

  const startCountdown = () => {
    setCountdown(20);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    countdownIntervalRef.current = setInterval(() => {
      setCountdown(prev => (prev <= 1 ? 20 : prev - 1));
    }, 1000);
  };

  const stopCountdown = () => {
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    setCountdown(20);
  };

  const toggleSelectTask = (taskId: string) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const startEditTask = (task: GenerationHistory) => {
    setEditingTaskId(task.id);
    setEditPromptValue(task.prompt);
  };

  const saveEditTask = (taskId: string) => {
    setActiveTasks(prev => prev.map(t => t.id === taskId ? { ...t, prompt: editPromptValue } : t));
    setEditingTaskId(null);
  };

  const deleteTask = (taskId: string) => {
    setActiveTasks(prev => prev.filter(t => t.id !== taskId));
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      next.delete(taskId);
      return next;
    });
  };

  const downloadVideoFile = async (url: string, filename: string) => {
    if (!url) return;
    try {
      // Try fetching as blob for a clean download experience
      const response = await fetch(url);
      if (!response.ok) throw new Error("Fetch failed");
      const blob = await response.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${filename}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error("Download failed, falling back to direct link:", err);
      // Fallback to direct link if CORS prevents fetching
      const a = document.createElement('a');
      a.href = url;
      a.target = "_blank";
      a.download = `${filename}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  // Tải ảnh Pollinations về base64 ngay lúc render — để ZIP không bị trắng
  const fetchToBase64 = async (url: string): Promise<string> => {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(40000) });
      if (!response.ok) throw new Error('Fetch failed');
      const blob = await response.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (err) {
      console.warn('[fetchToBase64] Không tải được ảnh, giữ URL gốc:', err);
      return url; // fallback giữ URL gốc
    }
  };

  const downloadImageFile = (url: string, filename: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDownloadBatchZip = async (specificResults?: BatchResult[]) => {
    const targetResults = (specificResults || batchResults).filter(res => res.url);
    if (targetResults.length === 0) return;
    const zip = new JSZip();
    const folderName = `YOHU_PRO_BATCH_${Date.now()}`;
    const folder = zip.folder(folderName);
    if (!folder) return;
    for (let i = 0; i < targetResults.length; i++) {
      let imgUrl = targetResults[i].url;
      // Nếu vẫn là URL thẳng (Pollinations chưa fetch) → tải về base64 trước khi ZIP
      if (imgUrl.startsWith('http')) {
        imgUrl = await fetchToBase64(imgUrl);
      }
      const imgData = imgUrl.split(',')[1];
      if (imgData) {
        folder.file(`Scene_${i+1}.png`, imgData, {base64: true});
      }
    }
    const content = await zip.generateAsync({type: "blob"});
    saveAs(content, `${folderName}.zip`);
  };

  const runGenerationTask = async (prompt: string, index: number, total: number, laneId: string = '', prevVideoRef?: any, imagesSnapshot?: {url: string, name: string}[], modeSnapshot?: VideoMode) => {
    if (isStoppingRef.current) return null;
    
    // Credit check - Production ready
    const validationResult = await validateAndPrepareGeneration(3, 'video'); // Video cost: 3
    if (!validationResult) return null;

    const activeMode = modeSnapshot || mode;
    const activeImages = imagesSnapshot || currentImages;
    const taskId = `vpro-${Date.now()}-${laneId}-${index}`;
    const task: GenerationHistory = { 
      id: taskId, 
      url: '', 
      prompt, 
      timestamp: Date.now(), 
      mode: activeMode, 
      progress: 5, 
      status: `${laneId ? `${translate('THREAD_STATUS', outputLanguage)} ${laneId}: ` : ''}${translate('GENERATING_STATUS', outputLanguage)}`,
      laneId
    };
    setActiveTasks(prev => [task, ...prev]);
    try {
      let reqImages: string[] = [];
      if (!prevVideoRef) {
        if (activeMode === VideoMode.IMAGE_TO_VIDEO) reqImages = [activeImages[index]?.url].filter(url => !!url);
        else if (activeMode === VideoMode.INTERPOLATION) reqImages = [activeImages[index*2]?.url, activeImages[index*2+1]?.url].filter(url => !!url);
        else if (activeMode === VideoMode.CONSISTENCY) reqImages = activeImages.map(img => img.url).filter(url => !!url);
      }
      
      // ── Cookie Mode hoặc API Key Mode ───────────────────────────────────
      const progressCb = (msg: string) => {
        if (isStoppingRef.current) return;
        setActiveTasks(cur => cur.map(t => t.id === taskId ? {
          ...t,
          status: `${laneId ? `${translate('THREAD_STATUS', outputLanguage)} ${laneId}: ` : ''}${msg}`,
          progress: t.progress ? Math.min(t.progress + (100 - t.progress) * 0.1, 95) : 10
        } : t));
      };

      const shouldUseCookie = useCookieMode && selectedEngine === 'veo' && cookieString.trim().length > 50;
      let result: Awaited<ReturnType<typeof generateVideoByEngine>>;

      if (shouldUseCookie) {
        // 🍪 Cookie Mode — tiết kiệm API, giữ nguyên logic nối video
        const cookieResult = await generateVeoVideoByCookie({
          mode: activeMode,
          prompt,
          resolution,
          aspectRatio,
          images: reqImages,
          previousVideo: prevVideoRef,
          lang: outputLanguage,
          cookieString,
          onProgress: (msg) => progressCb(`🍪 ${msg}`),
        });
        result = { finalUrl: cookieResult.finalUrl, engine: 'veo' as const };
      } else {
        // 🔑 API Key Mode — giữ nguyên 100% logic cũ
        result = await generateVideoByEngine(selectedEngine, {
          prompt: prompt,
          aspectRatio: aspectRatio === AspectRatio.LANDSCAPE ? '16:9' : aspectRatio === AspectRatio.PORTRAIT ? '9:16' : '1:1',
          duration: 8,
          apiKey: selectedEngine === 'veo' ? '' : effectiveWavespeedKey,
          onProgress: progressCb,
          geminiParams: {
            mode: activeMode,
            resolution,
            images: reqImages,
            previousVideo: prevVideoRef,
            profile: validationResult as any,
            lang: outputLanguage,
            apiKeys: validationResult.effectiveApiKeys,
            useProjectKey: validationResult.effectiveUseProjectKey,
          }
        });
      }
      // ────────────────────────────────────────────────────────────────────
      if (isStoppingRef.current) return null;
      const completed = { ...task, url: result.finalUrl, status: translate('COMPLETED_STATUS', outputLanguage), progress: 100 };
      
      // Increment generation count on success
      await finalizeGeneration();

      onGenerated(completed);
      setActiveTasks(cur => cur.map(t => t.id === taskId ? completed : t));
      return result.videoRef; 
    } catch (err: any) {
      // 🍪 Cookie hết hạn hoặc sai
      if ((err as any).isCookieError) {
        setActiveTasks(cur => cur.map(t =>
          t.id === taskId ? { ...t, status: '🍪 Cookie hết hạn/sai — vui lòng cập nhật Cookie mới', progress: 0 } : t
        ));
        return null;
      }
      const isQuota = err.message?.includes("429") || err.message?.includes("RESOURCE_EXHAUSTED") || err.message?.includes("quota");
      const isAuth = err.message?.includes("API key not valid") || err.message?.includes("API key expired") || err.message?.includes("401") || err.message?.includes("403") || err.message?.includes("PERMISSION_DENIED");
      
      setActiveTasks(cur => cur.map(t => t.id === taskId ? { ...t, status: isQuota ? translate('QUOTA_EXHAUSTED', outputLanguage) : (isAuth ? "API Key Error (Permission Denied)" : `${translate('ERROR_STATUS', outputLanguage)}: ${err.message}`), progress: 0 } : t));
      if (err.message?.includes("Requested entity") || err.message?.includes("API Key") || err.message?.includes("PERMISSION_DENIED") || isQuota || isAuth || err.isKeyError) { 
        onKeyError(); 
        if (window.aistudio?.openSelectKey) await window.aistudio.openSelectKey(); 
      }
      return null;
    }
  };

  const cleanExtractedText = (text: string) => {
    if (!text) return "";
    // Remove common AI fluff and markers
    let cleaned = text.replace(/###? \d+\..*?\n/g, ""); // Remove subheaders
    cleaned = cleaned.replace(/Bước \d+:.*?\n/gi, ""); // Remove "Step X" markers
    cleaned = cleaned.replace(/Step \d+:.*?\n/gi, ""); 
    cleaned = cleaned.replace(/\*\*.*?\*\*/g, (m) => m.replace(/\*\*/g, "")); // Unbold
    cleaned = cleaned.replace(/^- /gm, "• "); // Standardize bullets
    cleaned = cleaned.replace(/Dưới đây là.*?\n/gi, "");
    cleaned = cleaned.replace(/Here is.*?\n/gi, "");
    cleaned = cleaned.replace(/Phân tích và chọn ra.*?\n/gi, "");
    cleaned = cleaned.replace(/Analysis and selection.*?\n/gi, "");
    cleaned = cleaned.replace(/\[TIÊU ĐỀ\]/gi, "");
    cleaned = cleaned.replace(/\[TITLE\]/gi, "");
    cleaned = cleaned.replace(/\[Tóm tắt ngắn\]/gi, "");
    cleaned = cleaned.replace(/\[Short summary\]/gi, "");
    return cleaned.trim();
  };

  const extractPlotSummary = (script: string) => {
    const marker = "### 1.";
    const markerAlt = "## 1.";
    const nextMarker = "### 2.";
    const nextMarkerAlt = "## 2.";
    
    let start = script.indexOf(marker);
    if (start === -1) start = script.indexOf(markerAlt);
    if (start === -1) return "";
    
    let end = script.indexOf(nextMarker, start);
    if (end === -1) end = script.indexOf(nextMarkerAlt, start);
    
    const section = script.substring(start + (marker.length), end === -1 ? undefined : end).trim();
    
    // Return the whole section for STORY_DNA so user sees all generated variations and the chosen one
    return cleanExtractedText(section);
  };

  const extractCharacterDNA = (script: string) => {
    const markers = [
      "### 2.", "## 2.",
      "DANH SÁCH NHÂN VẬT DNA (GLOBAL CHARACTER CONTROL)",
      "DANH SÁCH NHÂN VẬT DNA (CHARACTER DNA)", 
      "DANH SÁCH NHÂN VẬT DNA", 
      "CHARACTER DNA",
      "CHARACTER DNA LIST",
      "GLOBAL CHARACTER CONTROL"
    ];
    for (const m of markers) {
      const startIdx = script.toLowerCase().indexOf(m.toLowerCase());
      if (startIdx !== -1) {
        let nextMarkerIdx = script.toLowerCase().indexOf("### 3.", startIdx + m.length);
        if (nextMarkerIdx === -1) nextMarkerIdx = script.toLowerCase().indexOf("## 3.", startIdx + m.length);
        if (nextMarkerIdx === -1) nextMarkerIdx = script.toLowerCase().indexOf("3. ", startIdx + m.length);
        const raw = script.substring(startIdx + m.length, nextMarkerIdx !== -1 ? nextMarkerIdx : undefined).trim();
        return cleanExtractedText(raw);
      }
    }
    return "";
  };

  const extractEnvironmentDNA = (script: string) => {
    const markers = [
      "### 3.", "## 3.",
      "BỐI CẢNH & TRANG PHỤC (WARDROBE CONTROL)",
      "BỐI CẢNH CHÍNH & KIỂM SOÁT TRANG PHỤC (WARDROBE)",
      "BỐI CẢNH CHÍNH (ENVIRONMENT DNA)", 
      "BỐI CẢNH CHÍNH", 
      "ENVIRONMENT DNA",
      "WARDROBE CONTROL",
      "MAIN ENVIRONMENT"
    ];
    for (const m of markers) {
      const startIdx = script.toLowerCase().indexOf(m.toLowerCase());
      if (startIdx !== -1) {
        let nextMarkerIdx = script.toLowerCase().indexOf("### 4.", startIdx + m.length);
        if (nextMarkerIdx === -1) nextMarkerIdx = script.toLowerCase().indexOf("## 4.", startIdx + m.length);
        if (nextMarkerIdx === -1) nextMarkerIdx = script.toLowerCase().indexOf("4. ", startIdx + m.length);
        const raw = script.substring(startIdx + m.length, nextMarkerIdx !== -1 ? nextMarkerIdx : undefined).trim();
        return cleanExtractedText(raw);
      }
    }
    return "";
  };

  const extractCharactersOnly = (script: string) => {
    const section = extractCharacterDNA(script);
    if (!section) return "";
    
    // Split by character numbering or bullets to keep each character block together
    let blocks = section.split(/\n(?=\d+[\s.·•)*-]*|[·•*-])/).filter(b => b.trim().length > 10);
    
    // Fallback: if no numbered blocks found, try splitting by double newlines
    if (blocks.length <= 1) {
      blocks = section.split(/\n\n+/).filter(b => b.trim().length > 10);
    }
    
    return blocks
      .map((block, idx) => {
        let cleanBlock = block.trim();
        
        // Skip preamble
        if (cleanBlock.toLowerCase().includes("dưới đây là") || cleanBlock.toLowerCase().includes("danh sách") || cleanBlock.toLowerCase().includes("here are") || cleanBlock.toLowerCase().includes("list of")) return null;

        // Truncate before explanation
        cleanBlock = cleanBlock.split(/Giải thích:|Explanation:|Lý do:|Note:/i)[0].trim();

        // Remove existing numbering or bullets at the start of the block
        cleanBlock = cleanBlock.replace(/^(\d+[\s.·•)*-]*|[·•*-])\s*/, '');
        
        // Flatten to one line: remove all newlines and extra spaces
        let flat = cleanBlock.replace(/\r?\n|\r/g, ' ');
        // Aggressively remove asterisks, underscores and excessive symbols
        flat = flat.replace(/[*_]/g, ''); 
        
        // Remove _ref_01.jpg etc.
        flat = flat.replace(/_ref_\d+\.jpg/gi, '');
        // Remove trailing dots that look like bullets
        flat = flat.replace(/\.\s+/g, ' ');
        flat = flat.replace(/\s+/g, ' ').trim();
        
        if (flat.length < 5) return null;
        return `${idx + 1}. ${flat}`;
      })
      .filter(line => line !== null)
      .join('\n'); 
  };

  const extractFullSection4 = (script: string) => {
    const markers = [
      "### 4. KỊCH BẢN & CÂU LỆNH (PROMPTS)",
      "### 4. HỘI THOẠI CHO TẬP PHIM",
      "### 4. DANH SÁCH CÂU LỆNH (SCENE PROMPTS)", 
      "### 4. DANH SÁCH CÂU LỆNH", 
      "### 4. SCENE PROMPTS",
      "### 4. PROMPTS",
      "### 4. SCRIPT & PROMPTS",
      "### 4. CINEMATIC PROMPTS",
      "### 4. MASTER CINEMATIC PROMPT"
    ];
    for (const m of markers) {
      const idx = script.toLowerCase().indexOf(m.toLowerCase());
      if (idx !== -1) {
        return script.substring(idx + m.length).trim();
      }
    }
    return script;
  };

  const extractScenePrompts = (script: string, numbered: boolean = false, includeIntro: boolean = true) => {
    const markers = [
      "### 4.", "## 4.",
      "KỊCH BẢN & CÂU LỆNH (MASTER CINEMATIC PROMPTS)",
      "KỊCH BẢN & CÂU LỆNH (PROMPTS)",
      "HỘI THOẠI CHO TẬP PHIM",
      "DANH SÁCH CÂU LỆNH (SCENE PROMPTS)", 
      "DANH SÁCH CÂU LỆNH", 
      "SCENE PROMPTS",
      "PROMPTS",
      "SCRIPT & PROMPTS",
      "CINEMATIC PROMPTS",
      "MASTER CINEMATIC PROMPT"
    ];
    let section = "";
    for (const m of markers) {
      const idx = script.toLowerCase().indexOf(m.toLowerCase());
      if (idx !== -1) {
        section = script.substring(idx + m.length).trim();
        break;
      }
    }
    if (!section) section = script;
    
    // Check if it's the new multi-line SCENE format or [MODE: A/B/C] format
    const isModeFormat = section.includes("[MODE:");
    const isNumberModeFormat = /#\d+\s+\[MODE:/i.test(section);
    const isSceneFormat = section.toLowerCase().includes("scene 1") || section.toLowerCase().includes("scene 01");

    if (isNumberModeFormat || isModeFormat || isSceneFormat) {
      let sceneBlocks: string[];
      if (isNumberModeFormat) {
        sceneBlocks = section.split(/#\d+\s+\[MODE:/i).filter(b => b.trim().length > 20);
      } else if (isModeFormat) {
        sceneBlocks = section.split(/\[MODE:/i).filter(b => b.trim().length > 20);
      } else {
        sceneBlocks = section.split(/SCENE\s+\d+/i).filter(b => b.trim().length > 20);
      }

      const scenes = sceneBlocks.map((block) => {
        let cleaned = block.trim();
        
        // Filter out headers that might have been caught in the split
        const lower = cleaned.toLowerCase();
        if (lower.includes("kịch bản") || lower.includes("prompts") || lower.includes("master cinematic") || lower.includes("script & prompts") || lower.includes("hội thoại")) {
          return null;
        }

        if (isNumberModeFormat) cleaned = `[MODE: ${cleaned}`;
        else if (isModeFormat) cleaned = `[MODE: ${cleaned}`;
        
        // Remove Character: and Rendering Notes: sections for a cleaner prompt list
        cleaned = cleaned.split(/Character:|Rendering Notes:|Dialogue:|Notes:|Ref:|Reference:/i)[0].trim();
        
        // Remove leading dash/separator if it was SCENE format
        if (!isNumberModeFormat && !isModeFormat) cleaned = cleaned.replace(/^[–-]\s*/, '');
        // Flatten to one line for the prompt list
        return cleaned.replace(/\r?\n|\r/g, ' ').replace(/\s+/g, ' ').trim();
      }).filter(s => s !== null) as string[];
      
      const finalScenes = includeIntro ? [getYohuIntro(outputLanguage), ...scenes] : scenes;
      if (numbered) return finalScenes.map((s, i) => `${i + 1}. ${s}`).join('\n');
      return finalScenes.map((s, i) => `#${i + 1}. ${s}`).join('\n');
    }

    const rawLines = section.split('\n').map(l => l.trim());
    const scenes: string[] = [];

    rawLines.forEach(line => {
      if (!line || line.length < 10) return;
      
      // Skip preamble lines
      const skipKeywords = [
        "dưới đây là", "danh sách", "thiết kế chi tiết", "bám sát dna", 
        "lưu ý kỹ thuật", "technical note", "mỗi prompt dưới đây", 
        "chất lượng điện ảnh", "cinematic quality", "giải thích", "explanation",
        "tóm tắt", "summary", "kịch bản", "script", "here are", "list of",
        "detailed design", "technical notes", "each prompt", "cinematic style",
        "cấu hình đầu ra", "total scenes", "genre:", "tone:", "visual style:", 
        "act 1", "act 2", "act 3", "act 4", "act 5", "setup", "rising conflict", 
        "midpoint", "escalation", "resolution", "văn bản", "text",
        "[mode: kịch bản & câu lệnh", "[mode: script & prompts",
        "master cinematic prompts", "hội thoại cho tập phim"
      ];
      
      const isPromptLike = line.includes('[') && line.includes(']') || /^\d+[.)]/.test(line) || /^#\d+/.test(line) || /^([Cc]ảnh|[Ss]cene)\s*\d+/i.test(line);
      
      const isModeHeader = line.toLowerCase().includes("[mode:") && (line.toLowerCase().includes("kịch bản") || line.toLowerCase().includes("prompts"));

      if ((!isPromptLike || isModeHeader) && skipKeywords.some(k => line.toLowerCase().includes(k))) return;

      // Find prompt blocks in brackets
      const matches = line.match(/\[.*?\]/g);
      if (matches && matches.length > 1) {
        // If there are multiple brackets, it's likely the Hollywood Director format, keep the whole line
        let cleaned = line.replace(/^(#?\d+[.\s)]+|([Cc]ảnh|[Ss]cene)\s*\d+[:\s]*)/i, '').trim();
        cleaned = cleaned.replace(/_ref_\d+\.jpg/gi, '').trim();
        cleaned = cleaned.split(/Giải thích:|Explanation:|Lý do:|Note:/i)[0].trim();
        if (cleaned.length > 20) {
          scenes.push(cleaned);
        }
      } else if (matches && matches.length === 1) {
        matches.forEach(m => {
          let cleaned = m.slice(1, -1).trim();
          // Strip existing numbering: #1. , 1. , Scene 1:
          cleaned = cleaned.replace(/^(#?\d+[.\s)]+|([Cc]ảnh|[Ss]cene)\s*\d+[:\s]*)/i, '').trim();
          // Remove _ref_01.jpg etc.
          cleaned = cleaned.replace(/_ref_\d+\.jpg/gi, '').trim();
          // Truncate before explanation
          cleaned = cleaned.split(/Giải thích:|Explanation:|Lý do:|Note:/i)[0].trim();
          
          // Filter out titles and short lines
          const lower = cleaned.toLowerCase();
          if (cleaned.length > 20 && !lower.startsWith("title:") && !lower.startsWith("tiêu đề:") && !lower.startsWith("tên tập phim:")) {
            scenes.push(cleaned);
          }
        });
      } else if (isPromptLike) {
        let cleaned = line.replace(/^(#?\d+[.\s)]+|([Cc]ảnh|[Ss]cene)\s*\d+[:\s]*)/i, '').trim();
        // Remove _ref_01.jpg etc.
        cleaned = cleaned.replace(/_ref_\d+\.jpg/gi, '').trim();
        // Truncate before explanation
        cleaned = cleaned.split(/Giải thích:|Explanation:|Lý do:|Note:/i)[0].trim();
        
        const lower = cleaned.toLowerCase();
        if (cleaned.length > 20 && !lower.startsWith("title:") && !lower.startsWith("tiêu đề:") && !lower.startsWith("tên tập phim:")) {
          scenes.push(cleaned);
        }
      }
    });

    const finalScenes = includeIntro ? [getYohuIntro(outputLanguage), ...scenes] : scenes;

    if (numbered) {
      return finalScenes.map((s, i) => `${i + 1}. ${s}`).join('\n');
    }
    return finalScenes.map((s, i) => `#${i + 1}. ${s}`).join('\n');
  };

  const getActivePromptsFromSource = (sourceText?: string) => {
    let rawSource = sourceText || "";
    if (!sourceText) {
      if (toolMode === ToolMode.STORY_DNA) {
        const sectionMarker = "### 4. KỊCH BẢN & CÂU LỆNH (MASTER CINEMATIC PROMPTS)";
        const markerIdx = analyzedScript.indexOf(sectionMarker);
        const fallbackMarker = "### 4. HỘI THOẠI CHO TẬP PHIM";
        const fallbackIdx = analyzedScript.indexOf(fallbackMarker);
        
        if (markerIdx !== -1) rawSource = analyzedScript.substring(markerIdx);
        else if (fallbackIdx !== -1) rawSource = analyzedScript.substring(fallbackIdx);
        else rawSource = analyzedScript;
      } else if (toolMode === ToolMode.DIRECTOR) rawSource = directorScript;
      else if (toolMode === ToolMode.SEAMLESS_FLOW) rawSource = seamlessScript;
      else if (toolMode === ToolMode.BATCH_IMAGE_GEN || toolMode === ToolMode.IMAGE_GEN) rawSource = toolMode === ToolMode.IMAGE_GEN ? characterPrompts : scenePrompts;
      else return currentPromptText.split('\n').map(p => p.trim()).filter(p => p !== '');
    }
    
    // Sử dụng bộ bóc tách chung để đảm bảo định dạng 1 dòng/1 prompt
    const extractedText = extractScenePrompts(rawSource);
    return extractedText.split('\n').map(p => p.trim()).filter(p => p !== '');
  };

  const handleCopySelectedPrompts = () => {
    const prompts = currentPromptText.split('\n');
    const selectedText = Array.from(selectedPrompts)
      .sort((a, b) => a - b)
      .map(idx => prompts[idx])
      .join('\n');
    if (selectedText) {
      navigator.clipboard.writeText(selectedText);
      alert(translate('COPIED', outputLanguage));
    }
  };

  const handleSelectAllTasks = () => {
    if (selectedTaskIds.size === activeTasks.length && activeTasks.length > 0) {
      setSelectedTaskIds(new Set());
    } else {
      setSelectedTaskIds(new Set(activeTasks.map(t => t.id)));
    }
  };

  const handleRepairVideos = async () => {
    const selectedTasks = activeTasks.filter(t => selectedTaskIds.has(t.id));
    if (selectedTasks.length === 0) {
      alert(translate('SELECT_REGEN_ERROR', outputLanguage));
      return;
    }
    setIsGenerating(true);
    isStoppingRef.current = false;
    startCountdown();
    const imagesSnapshot = JSON.parse(JSON.stringify(currentImages));
    const modeSnapshot = mode;
    
    for (const task of selectedTasks) {
      if (isStoppingRef.current) break;
      // Remove old task and run again
      setActiveTasks(prev => prev.filter(t => t.id !== task.id));
      await runGenerationTask(task.prompt, 0, 1, 'Repair', undefined, imagesSnapshot, modeSnapshot);
    }
    setIsGenerating(false);
    stopCountdown();
  };

  const handleJoinVideos = async () => {
    const selectedTasks = activeTasks
      .filter(t => selectedTaskIds.has(t.id) && t.url)
      .sort((a, b) => {
        // Sort by index if available in ID or timestamp
        return a.timestamp - b.timestamp;
      });

    if (selectedTasks.length === 0) {
      alert(translate('SELECT_VIDEO_TO_JOIN', outputLanguage));
      return;
    }
    
    if (selectedTasks.length === 1) {
      downloadVideoFile(selectedTasks[0].url, `yohu_video_${selectedTasks[0].id}`);
      return;
    }

    // Clear previous joined video if any
    setActiveTasks(prev => prev.filter(t => t.laneId !== 'Joined'));

    alert(translate('JOIN_VIDEO_HINT', outputLanguage));
    
    try {
      const zip = new JSZip();
      const folderName = `YOHU_JOINED_VIDEOS_${Date.now()}`;
      const folder = zip.folder(folderName);
      if (!folder) return;

      // Add a manifest file for the Python script
      let manifest = "Video Join Order:\n";
      for (let i = 0; i < selectedTasks.length; i++) {
        const task = selectedTasks[i];
        const response = await fetch(task.url);
        const blob = await response.blob();
        const fileName = `video_${(i + 1).toString().padStart(3, '0')}_${task.id}.mp4`;
        folder.file(fileName, blob);
        manifest += `${i + 1}. ${fileName} - Prompt: ${task.prompt}\n`;
      }
      folder.file("manifest.txt", manifest);

      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, `${folderName}.zip`);
    } catch (err) {
      console.error("Zip error:", err);
      alert(translate('VIDEO_PROCESS_ERROR', outputLanguage));
    }
  };

  const handleRunFullVideo = async () => {
    let prompts = getActivePromptsFromSource();
    if (prompts.length === 0 && concurrentRenderCount === 0) { alert(translate('ENTER_PROMPTS_ERROR', outputLanguage)); return; }

    // Clear previous seamless join tasks
    setActiveTasks(prev => prev.filter(t => t.laneId !== 'CinemaFlow' && !t.laneId.startsWith('CinemaFlow-Lane')));

    // Free plan video limit: only 1 prompt (Admins are exempt)
    const isAdmin = profile.role === 'admin' || profile.accountType === 'admin';
    
    // WaveSpeed permission check
    if (selectedEngine !== 'veo') {
      if (userPlan === 'free' && !isAdmin) {
        alert("Gói FREE không dùng được Seedance/Kling. Vui lòng Nâng cấp PRO1.");
        return;
      }
      if (!effectiveWavespeedKey) {
        alert("Vui lòng nhập WaveSpeed API Key.");
        return;
      }
    }
    
    setIsFullVideoRendering(true); setIsGenerating(true); isStoppingRef.current = false;
    startCountdown();
    const imagesSnapshot = JSON.parse(JSON.stringify(currentImages));
    const modeSnapshot = mode;

    try {
      if (concurrentRenderCount > 0) {
        const lanes = concurrentPrompts.slice(0, concurrentRenderCount).filter(p => p.trim() !== '');
        if (lanes.length === 0) {
          alert(translate('ENTER_THREADS_ERROR', outputLanguage));
          setIsFullVideoRendering(false); setIsGenerating(false); stopCountdown();
          return;
        }

        await Promise.all(lanes.map(async (laneText, laneIdx) => {
          const lanePrompts = laneText.split('\n').map(p => p.trim()).filter(p => p !== '');
          let laneLastVideoRef = null;
          for (let i = 0; i < lanePrompts.length; i++) {
            if (isStoppingRef.current) break;
            laneLastVideoRef = await runGenerationTask(
              lanePrompts[i], 
              i, 
              lanePrompts.length, 
              `CinemaFlow-Lane-${laneIdx + 1}`, 
              laneLastVideoRef, 
              imagesSnapshot, 
              modeSnapshot
            );
          }
        }));
      } else {
        if (userPlan === 'free' && prompts.length > 1 && !isAdmin) {
          alert(translate('FREE_VIDEO_LIMIT', outputLanguage));
          prompts = [prompts[0]];
        }
        let lastVideoRef = null;
        for (let i = 0; i < prompts.length; i++) {
          if (isStoppingRef.current) break;
          lastVideoRef = await runGenerationTask(prompts[i], i, prompts.length, 'CinemaFlow', lastVideoRef, imagesSnapshot, modeSnapshot);
        }
      }
    } catch (err) {
      console.error("Full video render error:", err);
    } finally {
      setIsFullVideoRendering(false); setIsGenerating(false); stopCountdown();
    }
  };

  const handleGenerate = async () => {
    let prompts = getActivePromptsFromSource();
    if (prompts.length === 0) { alert(translate('ENTER_PROMPTS_ERROR', outputLanguage)); return; }

    const isAdmin = profile.role === 'admin' || profile.accountType === 'admin';

    // WaveSpeed permission check
    if (selectedEngine !== 'veo') {
      if (userPlan === 'free' && !isAdmin) {
        alert("Gói FREE không dùng được Seedance/Kling. Vui lòng Nâng cấp PRO1.");
        return;
      }
      if (!effectiveWavespeedKey) {
        alert("Vui lòng nhập WaveSpeed API Key.");
        return;
      }
    }
    
    // Free plan video limit: only 1 prompt (Admins are exempt)
    if (userPlan === 'free' && prompts.length > 1 && !isAdmin) {
      alert(translate('FREE_VIDEO_LIMIT', outputLanguage));
      prompts = [prompts[0]];
    }

    setIsGenerating(true); isStoppingRef.current = false;
    startCountdown();

    if (userPlan === 'free' && !isAdmin) {
      const videoHistory = history.filter(h => h.mode !== 'image');
      if (videoHistory.length >= 1) {
        alert("Gói Free chỉ được tạo 1 video bằng API dự án. Vui lòng dán API cá nhân vào Gói Chuyên Nghiệp 1 để tiếp tục.\n\nFree plan only allows 1 video using project API. Please use your own API key.");
        setIsGenerating(false); stopCountdown();
        return;
      }
    }

    const imagesSnapshot = JSON.parse(JSON.stringify(currentImages));
    const modeSnapshot = mode;
    try {
      if (concurrentRenderCount > 0) {
        let activePrompts = concurrentPrompts.slice(0, concurrentRenderCount).filter(p => p.trim() !== '');
        
        const isAdmin = profile.role === 'admin' || profile.accountType === 'admin';
        if (userPlan === 'free' && activePrompts.length > 1 && !isAdmin) {
          alert(translate('FREE_VIDEO_LIMIT', outputLanguage));
          activePrompts = [activePrompts[0]];
        }

        if (activePrompts.length === 0) { alert(translate('ENTER_THREADS_ERROR', outputLanguage)); setIsGenerating(false); return; }
        await Promise.all(activePrompts.map((p, i) => runGenerationTask(p, i, activePrompts.length, `#${i + 1}`, undefined, imagesSnapshot, modeSnapshot)));
      } else {
        for (let i = 0; i < prompts.length; i++) {
          if (isStoppingRef.current) break;
          await runGenerationTask(prompts[i], i, prompts.length, '', undefined, imagesSnapshot, modeSnapshot);
        }
      }
    } catch (err) { console.error(translate('RENDER_ERROR', outputLanguage), err); } finally { setIsGenerating(false); stopCountdown(); }
  };

  const handleStop = () => { isStoppingRef.current = true; setIsGenerating(false); setIsFullVideoRendering(false); stopCountdown(); alert(translate('SYSTEM_STOPPED', outputLanguage)); };

  const resizeImage = (base64Str: string, maxWidth = 800, maxHeight = 800): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7)); // Use JPEG with 0.7 quality to save space
      };
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;
    const activeMode = mode;
    const slot = specificSlotRef.current;
    files.forEach((file, fIdx) => {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target?.result as string;
        if (base64) {
          const resizedBase64 = await resizeImage(base64);
          setModeImages(prev => {
            const currentList = [...(prev[activeMode] || [])];
            if (slot) {
              let targetIdx = slot.index;
              if (activeMode === VideoMode.INTERPOLATION && slot.subIndex !== undefined) targetIdx = slot.index * 2 + slot.subIndex;
              const finalIdx = targetIdx + fIdx;
              while (currentList.length <= finalIdx) currentList.push({ url: '', name: '' });
              currentList[finalIdx] = { url: resizedBase64, name: file.name.split('.')[0] };
            } else {
              currentList.push({ url: resizedBase64, name: file.name.split('.')[0] });
            }
            
            // Limit to last 5 images per mode to save space (reduced from 10)
            const limitedList = currentList.slice(-5);
            return { ...prev, [activeMode]: limitedList };
          });
        }
      };
      reader.readAsDataURL(file);
    });
    specificSlotRef.current = null;
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRefImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target?.result as string;
        if (base64) {
          const resized = await resizeImage(base64);
          setRefImage(resized);
        }
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const handleBatchImageGen = async () => {
    const currentPrompts = toolMode === ToolMode.IMAGE_GEN ? characterPrompts : scenePrompts;
    if (!currentPrompts.trim()) { alert(translate('PASTE_PROMPTS_ERROR', outputLanguage)); return; }
    
    const lines = currentPrompts.split('\n').map(l => l.trim()).filter(l => l !== '').map(l => l.replace(/^\d+[.)]\s*/, ''));
    
    // Credit check for all images - Production ready
    // Instead of failing the whole batch, we generate as many as possible
    const costPerImage = profile.use_free_image_gen ? 0 : 2;
    const maxPossible = profile.use_free_image_gen ? 999 : Math.floor(credit / costPerImage);
    
    if (maxPossible <= 0 && profile.role !== 'admin' && !profile.use_free_image_gen) {
      alert(translate('UPGRADE_PRO_MESSAGE', outputLanguage));
      return;
    }

    const linesToGenerate = profile.role === 'admin' ? lines : lines.slice(0, maxPossible);
    const totalCost = linesToGenerate.length * costPerImage;

    const validationResult = await validateAndPrepareGeneration(totalCost, 'image');
    if (!validationResult) return;

    if (userPlan === 'free' && !validationResult.isAdmin && validationResult.effectiveUseProjectKey && !profile.use_free_image_gen) {
      // Check if they already have one video in history (ignoring images)
      const videoHistory = history.filter(h => h.mode !== 'image');
      if (videoHistory.length >= 1) {
        alert("Gói Free chỉ được tạo 1 video bằng API dự án. Vui lòng dán API cá nhân vào Gói Chuyên Nghiệp 1 để tiếp tục.\n\nFree plan only allows 1 video using project API. Please use your own API key.");
        return;
      }
    }

    setBatchResults([]); // Xóa kết quả cũ trước khi chạy mới
    setGeneratingTool('BATCH'); setIsGenerating(true); isStoppingRef.current = false; startCountdown();
    try {
        const styleStr = `${(selectedStyle.name as any)[outputLanguage]} (${selectedStyle.prompt})`;
        
        // Optimize: Use Promise.all with a small delay between requests for faster generation
        // while avoiding hitting global rate limits too hard.
        const tasks = linesToGenerate.map(async (line, i) => {
          if (isStoppingRef.current) return null;
          
          // Add a staggered delay (e.g., 3000ms per item) to avoid overwhelming the API
          await new Promise(resolve => setTimeout(resolve, i * 3000));
          if (isStoppingRef.current) return null;

          let finalPrompt: string;
          let sysInst: string;
          
          if (toolMode === ToolMode.IMAGE_GEN) {
            finalPrompt = `Cinematic Character Portrait: ${styleStr}. Character Description: ${line}. Requirements: ONLY ONE CHARACTER in the center, 2/3 full body shot, FRONT-FACING FACE, HIGH RESOLUTION, PURE WHITE BACKGROUND, high-end movie lighting, 8k resolution, highly detailed, NO TEXT, NO LETTERS, NO WORDS, NO WATERMARK.`;
            if (!refImage) sysInst = IMAGE_GEN_INSTRUCTION;
          } else {
            finalPrompt = `Cinematic Film Scene: ${styleStr}. Scene Description: ${line}. Requirements: Full cinematic background, realistic environment, high-end movie lighting, 8k resolution, highly detailed, professional cinematography. NO WHITE BACKGROUND, NO TEXT, NO LETTERS, NO WORDS, NO WATERMARK.`;
          }
          
          try {
            let imageUrl: string;
          if (profile.use_free_image_gen) {
            try {
              // Show Rendering status
        
              const freeRes = await generateImageFree(finalPrompt);
              imageUrl = freeRes.url.startsWith("http") ? await fetchToBase64(freeRes.url) : freeRes.url;
              if (!imageUrl) throw new Error("Empty URL from free gen");
            } catch (freeErr) {
              console.warn("[Batch] Free image gen failed/returned empty, falling back:", freeErr);
              // Fallback to Gemini only if NOT Free plan (Free plan can only use personal keys for Gemini)
              const isPro = profile.accountType?.includes('pro') || profile.role === 'admin';
              if (isPro || validationResult.effectiveApiKeys.length > 0) {
                imageUrl = await generateGeminiImage(
                  finalPrompt,
                  sysInst,
                  validationResult.effectiveApiKeys,
                  aspectRatio === AspectRatio.LANDSCAPE ? "16:9" : "9:16",
                  refImage || undefined,
                  outputLanguage,
                  validationResult.effectiveUseProjectKey,
                  adminFreeKeys,
                  adminPaidKeys
                );
              } else {
                throw new Error("Free image generation failed and no personal API key provided.", { cause: freeErr });
              }
            }
          } else {
            // If Free plan and NO personal keys, block image gen via project keys
            if (userPlan === 'free' && !validationResult.isAdmin && validationResult.effectiveUseProjectKey) {
                 throw new Error("Gói Free không hỗ trợ tạo ảnh bằng API dự án. Vui lòng bật nút FREE IMG (FLUX) hoặc dán API cá nhân.\n\nFree plan doesn't support images via project API. Use Flux or personal key.");
            }
            imageUrl = await generateGeminiImage(
                finalPrompt,
                sysInst,
                validationResult.effectiveApiKeys,
                aspectRatio === AspectRatio.LANDSCAPE ? "16:9" : "9:16",
                refImage || undefined,
                outputLanguage,
                validationResult.effectiveUseProjectKey,
                adminFreeKeys,
                adminPaidKeys
              );
            }

            if (isStoppingRef.current) return null;
            
            // Update state safely
            setBatchResults((prev: BatchResult[]) => {
              const next = [...prev];
              next[i] = { prompt: line, url: imageUrl, selected: false };
              return next;
            });
            
            await finalizeGeneration();
            return imageUrl;
          } catch (itemErr: any) {
            console.error(`Batch Image Gen Error for item ${i + 1}:`, itemErr);
            setBatchResults((prev: BatchResult[]) => {
              const next = [...prev];
              next[i] = { 
                prompt: line, 
                url: "", 
                selected: false,
                error: itemErr.message || "Generation failed"
              };
              return next;
            });
            const isQuota = itemErr.message?.includes("429") || itemErr.message?.includes("RESOURCE_EXHAUSTED") || itemErr.message?.includes("quota");
            const isAuth = itemErr.message?.includes("API key not valid") || itemErr.message?.includes("API key expired") || itemErr.message?.includes("401") || itemErr.message?.includes("403") || itemErr.message?.includes("PERMISSION_DENIED");
            if (itemErr.message?.includes("Requested entity") || itemErr.message?.includes("API Key") || itemErr.message?.includes("PERMISSION_DENIED") || isQuota || isAuth) { 
              onKeyError(); 
              if (window.aistudio?.openSelectKey) await window.aistudio.openSelectKey(); 
            }
            return null;
          }
        });

        // Pre-fill batch results with loading state
        setBatchResults(linesToGenerate.map(line => ({ prompt: line, url: "", selected: false })));
        
        await Promise.all(tasks);
    } catch (err: any) { 
      console.error("Batch Image Gen Error:", err);
      alert(`${translate('RENDER_ERROR', outputLanguage)}: ${err.message || err}`); 
    } finally { setIsGenerating(false); stopCountdown(); }
  };

  const handleRegenerateBatchImage = async (idx: number, newPrompt: string) => {
    const validationResult = await validateAndPrepareGeneration(2, 'image');
    if (!validationResult) return;

    setIsGenerating(true); startCountdown();
    try {
      const styleStr = `${(selectedStyle.name as any)[outputLanguage]} (${selectedStyle.prompt})`;
      let finalPrompt = "";
      let sysInst = refImage ? CONSISTENCY_IMAGE_GEN_INSTRUCTION : translate('DIRECTOR_INSTRUCTION', outputLanguage);
      
      if (toolMode === ToolMode.IMAGE_GEN) {
        finalPrompt = `Cinematic Character Portrait: ${styleStr}. Character Description: ${newPrompt}. Requirements: ONLY ONE CHARACTER in the center, 2/3 full body shot, FRONT-FACING FACE, HIGH RESOLUTION, PURE WHITE BACKGROUND, 8k resolution, NO TEXT, NO LETTERS, NO WORDS, NO WATERMARK.`;
        if (!refImage) sysInst = IMAGE_GEN_INSTRUCTION;
      } else {
        finalPrompt = `Cinematic Film Scene: ${styleStr}. Scene Description: ${newPrompt}. Requirements: Full cinematic background, realistic environment, 8k resolution, NO WHITE BACKGROUND, NO TEXT, NO LETTERS, NO WORDS, NO WATERMARK.`;
      }
      
      let imageUrl: string;
      if (profile.use_free_image_gen) {
        try {
          const freeRes = await generateImageFree(finalPrompt);
          imageUrl = freeRes.url.startsWith("http") ? await fetchToBase64(freeRes.url) : freeRes.url;
          if (!imageUrl) throw new Error("Empty URL from free gen");
        } catch (freeErr) {
          console.warn("[Regen] Free image gen failed, falling back to Gemini:", freeErr);
          imageUrl = await generateGeminiImage(
            finalPrompt,
            sysInst,
            validationResult.effectiveApiKeys,
            aspectRatio === AspectRatio.LANDSCAPE ? "16:9" : "9:16",
            refImage || undefined,
            outputLanguage,
            validationResult.effectiveUseProjectKey,
            adminFreeKeys,
            adminPaidKeys
          );
        }
      } else {
        imageUrl = await generateGeminiImage(
          finalPrompt,
          sysInst,
          validationResult.effectiveApiKeys,
          aspectRatio === AspectRatio.LANDSCAPE ? "16:9" : "9:16",
          refImage || undefined,
          outputLanguage,
          validationResult.effectiveUseProjectKey,
          adminFreeKeys,
          adminPaidKeys
        );
      }

      const updated = [...batchResults];
      updated[idx] = { ...updated[idx], prompt: newPrompt, url: imageUrl, selected: false };
      setBatchResults(updated);
      
      await finalizeGeneration();
    } catch (err: any) { 
      console.error("Regen Image Error:", err);
      alert(`${translate('REGEN_IMAGE_ERROR', outputLanguage)}: ${err.message || err}`); 
      const isQuota = err.message?.includes("429") || err.message?.includes("RESOURCE_EXHAUSTED") || err.message?.includes("quota");
      const isAuth = err.message?.includes("API key not valid") || err.message?.includes("API key expired") || err.message?.includes("401") || err.message?.includes("403") || err.message?.includes("PERMISSION_DENIED");
      if (err.message?.includes("Requested entity") || err.message?.includes("API Key") || err.message?.includes("PERMISSION_DENIED") || isQuota || isAuth) { 
        onKeyError(); 
        if (window.aistudio?.openSelectKey) await window.aistudio.openSelectKey(); 
      }
    } finally { setIsGenerating(false); stopCountdown(); setEditingBatchIdx(null); }
  };

  const handleRegenerateSelectedBatchImages = async () => {
    const selectedIndices = batchResults.map((res, i) => res.selected ? i : -1).filter(i => i !== -1);
    if (selectedIndices.length === 0) { alert(translate('SELECT_REGEN_ERROR', outputLanguage)); return; }

    const validationResult = await validateAndPrepareGeneration(selectedIndices.length * 2, 'image');
    if (!validationResult) return;

    setIsGenerating(true); isStoppingRef.current = false; startCountdown();
    try {
      const styleStr = `${(selectedStyle.name as any)[outputLanguage]} (${selectedStyle.prompt})`;
      
      const tasks = selectedIndices.map(async (idx, i) => {
        if (isStoppingRef.current) return null;
        
        // Staggered delay for parallel requests
        await new Promise(resolve => setTimeout(resolve, i * 3000));
        if (isStoppingRef.current) return null;

        const line = batchResults[idx].prompt;
        let finalPrompt: string;
        let sysInst: string;
        
        if (toolMode === ToolMode.IMAGE_GEN) {
          finalPrompt = `Cinematic Character Portrait: ${styleStr}. Character Description: ${line}. Requirements: ONLY ONE CHARACTER in the center, 2/3 full body shot, FRONT-FACING FACE, HIGH RESOLUTION, PURE WHITE BACKGROUND, 8k resolution.`;
          if (!refImage) sysInst = IMAGE_GEN_INSTRUCTION;
        } else {
          finalPrompt = `Cinematic Film Scene: ${styleStr}. Scene Description: ${line}. Full background, 8k. NO WHITE BACKGROUND.`;
        }
        
        try {
          let imageUrl: string;
          if (profile.use_free_image_gen) {
            try {
              const freeRes = await generateImageFree(finalPrompt);
              imageUrl = freeRes.url.startsWith("http") ? await fetchToBase64(freeRes.url) : freeRes.url;
              if (!imageUrl) throw new Error("Empty URL from free gen");
            } catch (freeErr) {
              console.warn("[Regen Selected] Free image gen failed, falling back to Gemini:", freeErr);
              imageUrl = await generateGeminiImage(
                finalPrompt,
                sysInst,
                validationResult.effectiveApiKeys,
                aspectRatio === AspectRatio.LANDSCAPE ? "16:9" : "9:16",
                refImage || undefined,
                outputLanguage,
                validationResult.effectiveUseProjectKey,
                adminFreeKeys,
                adminPaidKeys
              );
            }
          } else {
            imageUrl = await generateGeminiImage(
              finalPrompt,
              sysInst,
              validationResult.effectiveApiKeys,
              aspectRatio === AspectRatio.LANDSCAPE ? "16:9" : "9:16",
              refImage || undefined,
              outputLanguage,
              validationResult.effectiveUseProjectKey
            );
          }

          if (isStoppingRef.current) return null;
          
          setBatchResults((prev: BatchResult[]) => {
            const next = [...prev];
            next[idx] = { ...next[idx], url: imageUrl, selected: false, error: undefined };
            return next;
          });
          
          await finalizeGeneration();
          return imageUrl;
        } catch (itemErr: any) {
          console.error(`Regen Batch Item Error for index ${idx}:`, itemErr);
          setBatchResults((prev: BatchResult[]) => {
            const next = [...prev];
            next[idx] = { ...next[idx], url: "", selected: false, error: itemErr.message || "Regeneration failed" };
            return next;
          });
          return null;
        }
      });

      await Promise.all(tasks);
    } catch (err: any) { 
      console.error("Regen Batch Selected Error:", err);
      alert(`${translate('BATCH_REGEN_ERROR', outputLanguage)}: ${err.message || err}`); 
      const isQuota = err.message?.includes("429") || err.message?.includes("RESOURCE_EXHAUSTED") || err.message?.includes("quota");
      const isAuth = err.message?.includes("API key not valid") || err.message?.includes("API key expired") || err.message?.includes("401") || err.message?.includes("403") || err.message?.includes("PERMISSION_DENIED");
      if (err.message?.includes("Requested entity") || err.message?.includes("API Key") || err.message?.includes("PERMISSION_DENIED") || isQuota || isAuth) { 
        onKeyError(); 
        if (window.aistudio?.openSelectKey) await window.aistudio.openSelectKey(); 
      }
    } finally { setIsGenerating(false); stopCountdown(); }
  };

  const handleToolGenerate = async (tMode: ToolMode) => {
    const validationResult = await validateAndPrepareGeneration(1, 'text'); // Text cost: 1
    if (!validationResult) return;

    setGeneratingTool(tMode); setIsGenerating(true); isStoppingRef.current = false; startCountdown();
    try {
      const langText = translate('LANG_TEXT', outputLanguage);
      let instruction = '', content = '';
      const styleStr = `${(selectedStyle.name as any)[outputLanguage]} (${selectedStyle.prompt})`;
      if (tMode === ToolMode.DIRECTOR) { 
        instruction = DIRECTOR_MODE_INSTRUCTION; 
        content = `Genre: ${directorForm.genre}. Plot: ${directorForm.plot}. DNA: ${directorForm.dna}. Environment: ${directorForm.environment}. Count: ${toolPromptCount}. Lang: ${langText}. Style: ${styleStr}`; 
      } else if (tMode === ToolMode.STORY_DNA) { 
        instruction = STORY_DNA_INSTRUCTION; 
        const genreStr = (selectedGenre.name as any)[outputLanguage];
        content = `THỂ LOẠI (GENRE): ${genreStr}. TIÊU ĐỀ: ${linkTopic}. SỐ CỐT TRUYỆN: ${storyCount}. NAM: ${maleCount}. NỮ: ${femaleCount}. TỔNG CẢNH (count): ${toolPromptCount}. Lang: ${langText}. Style: ${styleStr}`; 
      } else if (tMode === ToolMode.SEAMLESS_FLOW) { 
        instruction = SEAMLESS_FLOW_INSTRUCTION; 
        content = `Plot: ${seamlessForm.plot}. DNA: ${seamlessForm.dna}. Environment: ${seamlessForm.environment}. Count: ${toolPromptCount}. Lang: ${langText}. Style: ${styleStr}`; 
      }
      
      console.log(`[Tool] Generating ${tMode} text with instruction length: ${instruction.length}`);
      const text = await generateGeminiText(content, instruction, validationResult.effectiveApiKeys, outputLanguage, validationResult.effectiveUseProjectKey);
      console.log(`[Tool] Received text length: ${text?.length || 0}`);
      
      if (!text || text.length < 10) {
        throw new Error("API trả về kết quả trống hoặc quá ngắn. Vui lòng thử lại.\n\nAPI returned empty or invalid text.");
      }
      
      if (isStoppingRef.current) return;
      
      await finalizeGeneration();

      if (tMode === ToolMode.DIRECTOR) {
        setDirectorScript(text);
        const sceneScript = extractScenePrompts(text);
        if (sceneScript) {
          setModePrompts(prev => ({ 
            ...prev, 
            [VideoMode.TEXT_TO_VIDEO]: sceneScript,
            [VideoMode.CONSISTENCY]: sceneScript 
          }));
        }
      } else if (tMode === ToolMode.STORY_DNA) {
        const sceneScript = extractScenePrompts(text, false, false);
        setAnalyzedScript(sceneScript);
        if (sceneScript) {
          setModePrompts(prev => ({ ...prev, [VideoMode.TEXT_TO_VIDEO]: sceneScript }));
        }
        
        const plot = extractPlotSummary(text);
        const dna = extractCharacterDNA(text);
        const env = extractEnvironmentDNA(text);
        const fullSection4 = extractFullSection4(text);
        setDirectorForm(prev => ({ ...prev, plot, dna, environment: env }));
        setSeamlessForm(prev => ({ ...prev, plot: fullSection4, dna, environment: env }));
        setCharacterPrompts(extractCharactersOnly(text));
        setScenePrompts(extractScenePrompts(text, true, false));
      } else if (tMode === ToolMode.SEAMLESS_FLOW) {
        setSeamlessScript(text);
        // For SEAMLESS_FLOW, we want a clean list of prompts without the intro, 
        // and we want to preserve the suffixes generated by Gemini.
        const extracted = extractScenePrompts(text, false, false);
        if (extracted) {
          setModePrompts(prev => ({ 
            ...prev, 
            [VideoMode.INTERPOLATION]: extracted,
            [VideoMode.IMAGE_TO_VIDEO]: extracted,
            [VideoMode.CONSISTENCY]: extracted
          }));
        }
        setScenePrompts(extractScenePrompts(text, true, false));
      }
    } catch (err: any) { 
      console.error("Tool Generation Error:", err);
      alert(`${translate('AI_ERROR', outputLanguage)}: ${err.message || err}`); 
      const isQuota = err.message?.includes("429") || err.message?.includes("RESOURCE_EXHAUSTED") || err.message?.includes("quota");
      const isAuth = err.message?.includes("API key not valid") || err.message?.includes("API key expired") || err.message?.includes("401") || err.message?.includes("403") || err.message?.includes("PERMISSION_DENIED");
      if (err.message?.includes("Requested entity") || err.message?.includes("API Key") || err.message?.includes("PERMISSION_DENIED") || isQuota || isAuth) { 
        onKeyError(); 
        if (window.aistudio?.openSelectKey) await window.aistudio.openSelectKey(); 
      }
    } finally { setGeneratingTool(null); setIsGenerating(false); stopCountdown(); }
  };

  const renderScriptView = (text: string, title: string, onDelete: () => void, isStoryDna: boolean = false) => (
    <div className="flex-1 bg-white p-2 sm:p-4 font-serif leading-relaxed text-slate-900 overflow-y-auto custom-scrollbar shadow-inner min-h-0 relative">
      <div className="sticky top-0 z-30 flex justify-between items-center mb-1 gap-1 bg-white/80 backdrop-blur-sm pb-1">
        <div className="flex gap-1">
          {isStoryDna ? (
            <select 
              value={selectedGenre.id} 
              onChange={(e) => setSelectedGenre(FILM_GENRES.find(g => g.id === e.target.value) || FILM_GENRES[0])} 
              className="bg-white border border-indigo-100 rounded-md px-1.5 py-0.5 text-[8px] sm:text-[10px] font-serif font-black uppercase outline-none focus:border-indigo-500 shadow-sm cursor-pointer"
            >
              {FILM_GENRES.map(genre => (<option key={genre.id} value={genre.id}>{(genre.name as any)[outputLanguage]}</option>))}
            </select>
          ) : (
            <select 
              value={selectedStyle.id} 
              onChange={(e) => setSelectedStyle(FILM_STYLES.find(s => s.id === e.target.value) || FILM_STYLES[0])} 
              className="bg-white border border-indigo-100 rounded-md px-1.5 py-0.5 text-[8px] sm:text-[10px] font-serif font-black uppercase outline-none focus:border-indigo-500 shadow-sm cursor-pointer"
            >
              {FILM_STYLES.map(style => (<option key={style.id} value={style.id}>{(style.name as any)[outputLanguage]}</option>))}
            </select>
          )}
        </div>
        <div className="flex gap-1">
          <button onClick={() => { navigator.clipboard.writeText(text); alert(translate('COPIED', outputLanguage)); }} className="bg-indigo-600 text-white px-1.5 py-0.5 rounded text-[8px] sm:text-[10px] font-black uppercase shadow-sm active:scale-95">{translate('COPY', outputLanguage)}</button>
          <button 
            onClick={() => {
              const blob = new Blob([text], { type: 'text/plain' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `${title.replace(/\s+/g, '_')}.txt`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }} 
            className="bg-indigo-600 text-white px-1.5 py-0.5 rounded text-[8px] sm:text-[10px] font-black shadow-sm active:scale-95"
          >
            📥
          </button>
          <button onClick={onDelete} className="bg-red-500 text-white px-1.5 py-0.5 rounded text-[8px] sm:text-[10px] font-black uppercase shadow-sm active:scale-95">{translate('DELETE', outputLanguage)}</button>
        </div>
      </div>
      <h3 className="text-[9px] sm:text-[10px] font-serif font-black text-center mb-2 uppercase underline decoration-2 underline-offset-4 decoration-indigo-500 italic">{title}</h3>
      <div className={`space-y-2 ${outputLanguage === 'VN' ? 'script-font-vn' : ''}`}>
        {text ? (
          text.split('\n').map((line, idx) => (
            <p key={idx} className={line.startsWith('[') || line.startsWith('•') || line.startsWith('#') ? 'bg-indigo-50 p-2 rounded-xl border border-indigo-100 italic text-[10px] font-serif' : 'text-slate-700 text-[10px] font-serif'}>{line}</p>
          ))
        ) : isStoryDna ? (
          <div className={`h-full flex flex-col items-center justify-center text-slate-600 font-black text-[10px] font-serif opacity-70 space-y-5 text-center py-10 px-6 uppercase tracking-widest ${outputLanguage === 'VN' ? 'script-font-vn' : ''}`}>
            <p>A: {translate('DIRECTOR', outputLanguage)}: 1.{translate('PLOT_SUMMARY_LABEL', outputLanguage).replace('### 1. ', '')} - 2.{translate('CHARACTER_DNA_LABEL', outputLanguage).replace('### 2. ', '')} - 3.{translate('ENVIRONMENT_DNA_LABEL', outputLanguage).replace('### 3. ', '')}.</p>
            <p>B: {translate('SEAMLESS_FLOW', outputLanguage)}: 1. {translate('SEAMLESS_DIALOG_LABEL', outputLanguage)} ({translate('ORIGINAL_PROMPT_GEN', outputLanguage)} - 2&3 {translate('SUPPORT', outputLanguage).toLowerCase()}.</p>
            <p>C: {translate('IMAGE_GEN', outputLanguage)}: {translate('DNA_CHARACTER_TITLE', outputLanguage)}.</p>
            <p className="italic font-black text-indigo-700">* {translate('ORIGINAL_PROMPT_GEN', outputLanguage)}.</p>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-slate-300 italic text-[12px] font-serif opacity-30">{translate('WAITING_COMMAND', outputLanguage)}</div>
        )}
      </div>
    </div>
  );

  const tabs = [
    { label: 'TEXT_TO_VIDEO', mode: VideoMode.TEXT_TO_VIDEO },
    { label: 'CONSISTENCY', mode: VideoMode.CONSISTENCY },
    { label: 'INTERPOLATION', mode: VideoMode.INTERPOLATION },
    { label: 'IMAGE_TO_VIDEO', mode: VideoMode.IMAGE_TO_VIDEO },
  ];

  return (
    <div className={`flex flex-col flex-1 bg-[#f8fafc] p-2 overflow-hidden font-sans text-slate-800 h-full max-h-full ${outputLanguage === 'VN' ? 'script-font-vn' : ''}`}>
      {/* Orientation Suggestion for Mobile */}
      {isPortrait && typeof window !== 'undefined' && window.innerWidth < 768 && (
        <div className="fixed inset-0 bg-indigo-900/90 z-[1000] flex flex-col items-center justify-center p-6 text-center text-white pointer-events-none md:hidden">
          <div className="w-16 h-12 border-2 border-white rounded-lg mb-4 animate-bounce flex items-center justify-center">
             <div className="w-10 h-6 border border-white/50 rounded flex items-center justify-center transform rotate-90">↔️</div>
          </div>
          <h3 className="text-lg font-black uppercase italic mb-2">{translate('ROTATE_DEVICE_TITLE', outputLanguage) || (outputLanguage === 'VN' ? 'XOAY NGANG ĐIỆN THOẠI' : 'ROTATE YOUR DEVICE')}</h3>
          <p className="text-[10px] font-medium opacity-80 uppercase tracking-widest">{translate('ROTATE_DEVICE_DESC', outputLanguage) || (outputLanguage === 'VN' ? 'Để có trải nghiệm chuyên nghiệp như máy tính' : 'For a professional desktop experience')}</p>
          <div className="mt-8 pointer-events-auto">
            <button onClick={() => setIsPortrait(false)} className="px-6 py-2 bg-white text-indigo-900 rounded-full text-[10px] font-black uppercase">{translate('CONTINUE_ANYWAY', outputLanguage) || (outputLanguage === 'VN' ? 'TIẾP TỤC BỎ QUA' : 'CONTINUE ANYWAY')}</button>
          </div>
        </div>
      )}

      <div className={`flex flex-col md:flex-row justify-between items-center mb-1 sm:mb-2 px-2 sm:px-4 bg-white py-1.5 sm:py-2 rounded-2xl sm:rounded-[2rem] border border-slate-200 shadow-xl flex-shrink-0 gap-2 ${isInputFocused ? 'hidden md:flex' : 'flex'}`}>
        <div className={`flex flex-wrap items-center justify-center gap-1 sm:gap-2 ${isInputFocused ? 'hidden md:flex' : 'flex'}`}>
          <button onClick={() => { setToolMode(ToolMode.STORY_DNA); setConcurrentRenderCount(0); }} className={`px-2 sm:px-4 py-1.5 sm:py-2 rounded-full text-[8px] sm:text-[10px] font-serif font-black uppercase border-2 transition active:scale-95 ${toolMode === ToolMode.STORY_DNA ? 'bg-slate-900 text-white border-slate-950 shadow-sm' : 'bg-white text-slate-800 border-slate-100'}`}>{translate('STORY_DNA', outputLanguage)}</button>
          <button onClick={() => { setToolMode(ToolMode.DIRECTOR); setConcurrentRenderCount(0); }} className={`px-2 sm:px-4 py-1.5 sm:py-2 rounded-full text-[8px] sm:text-[9px] font-serif font-black uppercase border-2 transition active:scale-95 ${toolMode === ToolMode.DIRECTOR ? 'bg-slate-800 text-white border-slate-900 shadow-sm' : 'bg-white text-slate-800 border-slate-100'}`}>{translate('DIRECTOR', outputLanguage)}</button>
          <button onClick={() => { setToolMode(ToolMode.SEAMLESS_FLOW); setConcurrentRenderCount(0); }} className={`px-2 sm:px-4 py-1.5 sm:py-2 rounded-full text-[8px] sm:text-[9px] font-serif font-black uppercase border-2 transition active:scale-95 ${toolMode === ToolMode.SEAMLESS_FLOW ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm' : 'bg-white text-emerald-600 border-slate-100'}`}>{translate('SEAMLESS_FLOW', outputLanguage)}</button>
          <button onClick={() => { setToolMode(ToolMode.BATCH_IMAGE_GEN); if (seamlessScript && !scenePrompts) setScenePrompts(extractScenePrompts(seamlessScript, true, false)); }} className={`px-2 sm:px-4 py-1.5 sm:py-2 rounded-full text-[8px] sm:text-[9px] font-serif font-black uppercase border-2 transition active:scale-95 ${toolMode === ToolMode.BATCH_IMAGE_GEN ? 'bg-blue-600 text-white border-blue-700 shadow-sm' : 'bg-white text-blue-600 border-slate-100'}`}>{translate('BATCH_IMAGE_GEN', outputLanguage)}</button>
          <button onClick={() => { setToolMode(ToolMode.IMAGE_GEN); if (analyzedScript && !characterPrompts) setCharacterPrompts(extractCharactersOnly(analyzedScript)); }} className={`px-2 sm:px-4 py-1.5 sm:py-2 rounded-full text-[8px] sm:text-[9px] font-serif font-black uppercase border-2 transition active:scale-95 ${toolMode === ToolMode.IMAGE_GEN ? 'bg-slate-700 text-white border-slate-800 shadow-sm' : 'bg-white text-slate-700 border-slate-100'}`}>{translate('IMAGE_GEN', outputLanguage)}</button>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
          {((profile.role === 'admin' || (profile.plan_name || '').toLowerCase() === 'pro9') && email.toLowerCase() === 'yohu.vn@gmail.com') && (
            <div className="flex flex-col items-center">
              <button 
                onClick={onOpenKeyPicker}
                className={`px-2 py-1 rounded-full text-[7px] sm:text-[8px] font-serif font-black uppercase tracking-tighter transition-all shadow-sm border ${hasApiKey || apiKeys.length > 0 ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-indigo-600 text-white border-indigo-700 animate-pulse'}`}
              >
                {hasApiKey || apiKeys.length > 0 ? translate('API_KEY_SELECTED', outputLanguage) : translate('SELECT_API_KEY', outputLanguage)}
              </button>
            </div>
          )}
          <button onClick={() => setShowZaloGroupQR(true)} className="text-[7px] sm:text-[8px] font-serif text-emerald-600 font-black bg-white px-3 py-1 rounded-full border border-emerald-100 shadow-sm transition hover:border-emerald-200 uppercase flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
            {translate('ZALO_GROUP', outputLanguage)}
          </button>
          <div className="px-3 py-1 rounded-full bg-slate-900 text-white shadow-sm flex items-center gap-1.5">
            <span className="text-[7px] sm:text-[8px] font-serif font-black italic uppercase tracking-wider">
              {translate('CREDITS_LABEL', outputLanguage)}: { credit }
            </span>
          </div>
          <button onClick={() => setShowZaloQR(true)} className="text-[7px] sm:text-[8px] font-serif text-blue-600 font-black bg-white px-3 py-1 rounded-full border border-blue-100 shadow-sm transition hover:border-blue-200 uppercase">{translate('SUPPORT', outputLanguage)}</button>
        </div>
      </div>

      <div className="flex-1 lg:flex-row flex gap-2 min-h-0 overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
          <div className="bg-white border-2 border-slate-200 rounded-[2rem] shadow-2xl flex flex-col flex-1 overflow-hidden relative border-t-[6px] border-t-slate-900 min-h-0">
            <div className="flex bg-slate-100 border-b border-slate-200 flex-shrink-0 p-1 gap-1">
              {tabs.map((tab, idx) => (
                <button key={idx} onClick={() => { setMode(tab.mode); setToolMode(ToolMode.NONE); setConcurrentRenderCount(0); }} className={`px-3 py-2 text-[8px] font-serif font-black rounded-t-2xl uppercase transition flex-1 ${mode === tab.mode && toolMode === ToolMode.NONE ? 'bg-white text-slate-900 shadow-sm border-t-4 border-slate-900' : 'text-slate-400 hover:bg-white/50'}`}>{translate(tab.label as any, outputLanguage)}</button>
              ))}
            </div>
            {toolMode === ToolMode.NONE && (
              <div className="flex items-center gap-4 px-4 py-2 bg-white border-b border-slate-100 flex-shrink-0">
                <div className="flex items-center gap-2 cursor-pointer group" onClick={handleSelectAllPrompts}>
                  <input 
                    type="checkbox" 
                    checked={currentPromptText.split('\n').filter(p => p.trim()).length > 0 && selectedPrompts.size === currentPromptText.split('\n').filter(p => p.trim()).length} 
                    onChange={() => {}} 
                    className="w-4 h-4 rounded border-slate-300 accent-indigo-600 cursor-pointer" 
                  />
                  <span className="text-[8px] font-serif font-black text-slate-500 uppercase italic group-hover:text-indigo-600 transition">{translate('SELECT_ALL', outputLanguage)}</span>
                </div>
                <button 
                  onClick={handleDeleteSelectedPrompts} 
                  disabled={selectedPrompts.size === 0}
                  className={`text-[8px] font-serif font-black px-4 py-1.5 rounded-xl uppercase transition flex items-center gap-2 ${selectedPrompts.size > 0 ? 'bg-red-500 text-white shadow-lg active:scale-95' : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}
                >
                  <span>🗑️ {translate('DELETE_SELECTED', outputLanguage)}</span>
                  {selectedPrompts.size > 0 && <span className="bg-white/20 px-1.5 py-0.5 rounded text-[8px] font-serif">{selectedPrompts.size}</span>}
                </button>
                <button 
                  onClick={handleCopySelectedPrompts}
                  disabled={selectedPrompts.size === 0}
                  className={`text-[8px] font-serif font-black px-4 py-1.5 rounded-xl uppercase transition flex items-center gap-2 ${selectedPrompts.size > 0 ? 'bg-indigo-500 text-white shadow-lg active:scale-95' : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}
                >
                  <span>{translate('COPY', outputLanguage)}</span>
                </button>
              </div>
            )}
            <div className="flex-1 flex flex-col min-h-0 bg-slate-50/20">
              {(toolMode === ToolMode.BATCH_IMAGE_GEN || toolMode === ToolMode.IMAGE_GEN) ? (
                <div className="p-4 space-y-4 h-full flex flex-col overflow-hidden bg-slate-50/50">
                  <div className="flex justify-between items-center px-2">
                    <h4 className="text-[8px] font-serif font-black text-indigo-700 uppercase italic">{toolMode === ToolMode.IMAGE_GEN ? translate('GENERATE_CHARACTER_DNA', outputLanguage) : translate('GENERATE_SCENE_BATCH', outputLanguage)}</h4>
                    <div className="flex gap-2">
                      <button onClick={handleRegenerateSelectedBatchImages} disabled={batchResults.filter(r => r.selected).length === 0 || isGenerating} className={`text-[8px] font-serif font-black px-3 py-1 rounded-md uppercase shadow-lg transition ${batchResults.filter(r => r.selected).length > 0 ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}>{translate('REGEN_SELECTED', outputLanguage)}</button>
                      <button onClick={() => handleDownloadBatchZip()} disabled={batchResults.length === 0} className="text-[8px] font-serif font-black bg-indigo-600 text-white px-3 py-1 rounded-md uppercase shadow-lg">📥 ZIP</button>
                      <button onClick={() => setBatchResults([])} className="text-[8px] font-serif font-black bg-red-500 text-white px-3 py-1 rounded-md uppercase shadow-lg">{translate('DELETE_ALL', outputLanguage)}</button>
                    </div>
                  </div>
                  {batchResults.some(r => r.error?.toLowerCase().includes('quota')) && (
                    <div className="mx-2 p-2 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between gap-2 animate-pulse">
                      <span className="text-[10px] text-amber-700 font-bold uppercase">
                        ⚠️ {translate('SYSTEM_OVERLOADED', outputLanguage)}
                      </span>
                      <button onClick={onOpenKeyPicker} className="text-[8px] font-black bg-amber-500 text-white px-3 py-1 rounded uppercase shadow-sm whitespace-nowrap">
                        {translate('SETUP_API', outputLanguage)}
                      </button>
                    </div>
                  )}
                  <div className="flex flex-col sm:flex-row flex-1 overflow-hidden gap-2 sm:gap-4 min-h-0">
                    <div className="flex-1 flex flex-col gap-2 min-h-[200px] sm:min-h-0">
                       <label className="text-[8px] font-serif font-black text-slate-400 uppercase ml-2 italic">{toolMode === ToolMode.IMAGE_GEN ? translate('DNA_LIST_LABEL', outputLanguage) : translate('SCENE_LIST_LABEL', outputLanguage)}</label>
                       <textarea value={toolMode === ToolMode.IMAGE_GEN ? characterPrompts : scenePrompts} onChange={e => toolMode === ToolMode.IMAGE_GEN ? setCharacterPrompts(e.target.value) : setScenePrompts(e.target.value)} className="flex-1 bg-white border-2 border-slate-200 rounded-2xl p-4 text-[12px] font-bold outline-none focus:border-indigo-400 resize-none shadow-inner" placeholder={translate('DATA_EXTRACT_PLACEHOLDER', outputLanguage)} />
                    </div>
                    <div className="w-full sm:w-80 flex flex-col gap-2 flex-shrink-0">
                       <label className="text-[8px] font-serif font-black text-slate-400 uppercase text-center italic">{translate('ORIGINAL_DNA_IMAGE', outputLanguage)}</label>
                       <div onClick={() => refImageInputRef.current?.click()} className="flex-1 min-h-[150px] bg-white border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center cursor-pointer overflow-hidden shadow-inner group relative">
                         <div className="absolute top-4 left-4 z-30" onClick={(e) => e.stopPropagation()}>
                           <select value={selectedStyle.id} onChange={(e) => setSelectedStyle(FILM_STYLES.find(s => s.id === e.target.value) || FILM_STYLES[0])} className="bg-white/90 backdrop-blur-sm border-2 border-indigo-200 rounded-lg px-3 py-2 text-[10px] font-serif font-black uppercase outline-none focus:border-indigo-500 shadow-xl cursor-pointer">
                             {FILM_STYLES.map(style => (<option key={style.id} value={style.id}>{(style.name as any)[outputLanguage]}</option>))}
                           </select>
                         </div>
                         {refImage ? (
                           <>
                             <img src={refImage} className="w-full h-full object-cover" />
                             <button 
                               onClick={(e) => { e.stopPropagation(); setRefImage(null); }}
                               className="absolute top-4 right-4 bg-red-500 text-white w-8 h-8 rounded-full flex items-center justify-center shadow-lg hover:bg-red-600 transition-colors z-30"
                             >
                               ✕
                             </button>
                           </>
                         ) : (
                           <div onClick={() => refImageInputRef.current?.click()} className="w-full h-full flex items-center justify-center">
                             <span className="text-[12px] font-serif font-black text-slate-300 uppercase px-6 text-center italic">{translate('LOAD_DNA', outputLanguage)}</span>
                           </div>
                         )}
                       </div>
                       <input type="file" ref={refImageInputRef} onChange={handleRefImageChange} hidden accept="image/*" />
                    </div>
                  </div>
                  <div className="bg-white border-2 border-slate-100 rounded-2xl p-3 shadow-inner max-h-[400px] overflow-y-auto">
                    <div className="grid grid-cols-3 gap-3">
                      {batchResults.map((res, idx) => (
                        <div key={idx} className="relative group cursor-pointer" onClick={() => { if(res.url) window.open(res.url, '_blank'); }}>
                          {res.url ? (
                            <img src={res.url} className="w-full aspect-square object-contain bg-slate-50 rounded-xl border-2 border-slate-100" />
                          ) : (
                            <div className="w-full h-full bg-slate-100 rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center p-2 text-center overflow-hidden">
                              <span className={`text-[9px] ${res.error ? 'text-red-500' : 'text-slate-400'} font-black uppercase leading-tight cursor-help`} title={res.error}>
                                {res.error ? (res.error?.toLowerCase().includes('quota') ? translate('QUOTA_FULL', outputLanguage) : res.error) : (isGenerating ? "RENDERING..." : "")}
                              </span>
                            </div>
                          )}
                          <div className="absolute top-1 left-1 z-10">
                            <input type="checkbox" checked={res.selected || false} onChange={(e) => { const updated = [...batchResults]; updated[idx].selected = e.target.checked; setBatchResults(updated); }} className="w-4 h-4 rounded-md shadow-lg cursor-pointer accent-indigo-600 bg-white/80" />
                          </div>
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-2 transition-all rounded-xl">
                            <button onClick={() => { setEditingBatchIdx(idx); setEditingBatchPrompt(res.prompt); }} className="bg-white text-indigo-600 w-24 py-1.5 rounded-lg text-[8px] font-serif font-black uppercase shadow-xl active:scale-95">{translate('REGEN_BTN', outputLanguage)}</button>
                            {res.url && <button onClick={() => downloadImageFile(res.url, `Visual_${idx+1}`)} className="bg-emerald-600 text-white w-24 py-1.5 rounded-lg text-[8px] font-serif font-black uppercase shadow-xl active:scale-95">{translate('SAVE_IMG_BTN', outputLanguage)}</button>}
                            <button onClick={() => setBatchResults(prev => prev.filter((_, i) => i !== idx))} className="bg-red-500 text-white w-24 py-1.5 rounded-lg text-[8px] font-serif font-black uppercase shadow-xl active:scale-95">{translate('DELETE_BTN', outputLanguage)}</button>
                          </div>
                        </div>
                      ))}
                      {batchResults.length === 0 && <div className="flex-1 flex items-center justify-center text-slate-300 italic text-[8px] font-serif uppercase font-black opacity-30">{translate('STUDIO_READY_BATCH', outputLanguage)}</div>}
                    </div>
                  </div>
                  <div className="flex gap-2 w-full">
                    <button onClick={handleBatchImageGen} disabled={isGenerating} className={`flex-1 py-4 ${toolMode === ToolMode.IMAGE_GEN ? 'bg-slate-700' : 'bg-indigo-600'} text-white rounded-2xl font-black text-[8px] font-serif uppercase italic tracking-widest`}>
                      {generatingTool === 'BATCH' ? translate('STUDIO_RENDERING', outputLanguage) : (toolMode === ToolMode.IMAGE_GEN ? translate('GENERATE_CHARACTER_DNA', outputLanguage) : translate('GENERATE_SCENE_BATCH', outputLanguage))}
                    </button>
                  </div>
                </div>
              ) : toolMode !== ToolMode.NONE ? (
                <div className="p-4 space-y-3 h-full flex flex-col overflow-hidden min-h-0 bg-slate-50/30">
                  <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-3 overflow-y-auto lg:overflow-visible">
                    <div className="flex-1 flex flex-col space-y-2 overflow-y-auto lg:overflow-y-auto custom-scrollbar pr-1 min-h-[300px] lg:min-h-0">
                      {toolMode === ToolMode.STORY_DNA && (
                        <>
                          <div className="flex flex-col gap-1">
                            <div className="flex justify-between items-center px-2">
                              <label className="text-[8px] font-serif font-black text-indigo-700 uppercase italic">{translate('STORY_TITLE_LABEL', outputLanguage)}</label>
                              <div className="flex items-center gap-2 bg-indigo-50 px-3 py-1 rounded-lg border border-indigo-100">
                                <span className="text-[8px] font-serif font-black text-indigo-600 uppercase">{translate('STORY_COUNT_LABEL', outputLanguage)}</span>
                                <input type="number" min="1" max="50" value={storyCount} onChange={e => setStoryCount(parseInt(e.target.value) || 1)} className="text-[8px] font-black w-8 text-center outline-none bg-transparent text-indigo-700" />
                              </div>
                            </div>
                            <textarea 
                              onFocus={() => setIsInputFocused(true)}
                              onBlur={() => setIsInputFocused(false)}
                              value={linkTopic} onChange={e => setLinkTopic(e.target.value)} className="bg-white border-2 border-slate-200 rounded-xl px-4 py-3 text-[12px] font-bold focus:border-indigo-400 outline-none h-32 resize-none" placeholder={translate('STORY_DESC_PLACEHOLDER', outputLanguage)} />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-[8px] font-serif font-black text-indigo-700 uppercase ml-2 italic">{translate('CHARACTERS_LABEL', outputLanguage)}</label>
                            <div className="flex gap-4">
                              <div className="flex-1 bg-white border-2 border-slate-200 rounded-xl px-4 py-2 flex items-center justify-between"><span className="text-[8px] font-serif font-black text-slate-400">{translate('MALE', outputLanguage)}</span><input type="number" min="0" max="50" value={maleCount} onChange={e => setMaleCount(parseInt(e.target.value) || 0)} className="text-[8px] font-black w-12 text-center outline-none bg-transparent" /></div>
                              <div className="flex-1 bg-white border-2 border-slate-200 rounded-xl px-4 py-2 flex items-center justify-between"><span className="text-[8px] font-serif font-black text-slate-400">{translate('FEMALE', outputLanguage)}</span><input type="number" min="0" max="50" value={femaleCount} onChange={e => setFemaleCount(parseInt(e.target.value) || 0)} className="text-[8px] font-black w-12 text-center outline-none bg-transparent" /></div>
                            </div>
                          </div>
                        </>
                      )}
                      {(toolMode === ToolMode.DIRECTOR || toolMode === ToolMode.SEAMLESS_FLOW || toolMode === ToolMode.STORY_DNA) && (
                        <>
                          <div className="flex flex-col gap-1 flex-1">
                            <label className="text-[8px] font-serif font-black text-indigo-700 uppercase italic leading-none">{translate('PLOT_SUMMARY_LABEL', outputLanguage)}</label>
                            <textarea onFocus={() => setIsInputFocused(true)} onBlur={() => setIsInputFocused(false)} value={toolMode === ToolMode.DIRECTOR ? directorForm.plot : seamlessForm.plot} onChange={e => toolMode === ToolMode.DIRECTOR ? setDirectorForm({...directorForm, plot: e.target.value}) : setSeamlessForm({...seamlessForm, plot: e.target.value})} className="flex-1 bg-white border border-slate-200 rounded-lg p-2 text-[10px] font-medium focus:border-indigo-400 outline-none shadow-inner resize-none" placeholder={translate('PLOT_SUMMARY_PLACEHOLDER', outputLanguage)} />
                          </div>
                          <div className="flex flex-col gap-1 flex-1">
                            <label className="text-[8px] font-serif font-black text-indigo-700 uppercase italic leading-none">{translate('CHARACTER_DNA_LABEL', outputLanguage)}</label>
                            <textarea onFocus={() => setIsInputFocused(true)} onBlur={() => setIsInputFocused(false)} value={toolMode === ToolMode.DIRECTOR ? directorForm.dna : seamlessForm.dna} onChange={e => toolMode === ToolMode.DIRECTOR ? setDirectorForm({...directorForm, dna: e.target.value}) : setSeamlessForm({...seamlessForm, dna: e.target.value})} className="flex-1 bg-white border border-slate-200 rounded-lg p-2 text-[10px] font-medium focus:border-indigo-400 outline-none shadow-inner resize-none" placeholder={translate('CHARACTER_DNA_PLACEHOLDER', outputLanguage)} />
                          </div>
                          <div className="flex flex-col gap-1 flex-1">
                            <label className="text-[8px] font-serif font-black text-indigo-700 uppercase italic leading-none">{translate('ENVIRONMENT_DNA_LABEL', outputLanguage)}</label>
                            <textarea onFocus={() => setIsInputFocused(true)} onBlur={() => setIsInputFocused(false)} value={toolMode === ToolMode.DIRECTOR ? directorForm.environment : seamlessForm.environment} onChange={e => toolMode === ToolMode.DIRECTOR ? setDirectorForm({...directorForm, environment: e.target.value}) : setSeamlessForm({...seamlessForm, environment: e.target.value})} className="flex-1 bg-white border border-slate-200 rounded-lg p-2 text-[10px] font-medium focus:border-indigo-400 outline-none shadow-inner resize-none" placeholder={translate('ENVIRONMENT_DNA_PLACEHOLDER', outputLanguage)} />
                          </div>
                        </>
                      )}
                    </div>
                    <div className="flex-[1.2] min-h-[300px] lg:min-h-0 flex flex-col border border-slate-100 rounded-2xl overflow-hidden shadow-inner bg-white">
                      {renderScriptView(
                        toolMode === ToolMode.DIRECTOR ? directorScript : toolMode === ToolMode.STORY_DNA ? analyzedScript : toolMode === ToolMode.SEAMLESS_FLOW ? seamlessScript : translate('RENDER_RESULTS', outputLanguage), 
                        toolMode === ToolMode.STORY_DNA ? translate('ORIGINAL_PROMPT_GEN', outputLanguage) : translate('HOLLYWOOD_STUDIO', outputLanguage), 
                        () => { if (toolMode === ToolMode.DIRECTOR) setDirectorScript(""); else if (toolMode === ToolMode.STORY_DNA) setAnalyzedScript(""); else if (toolMode === ToolMode.SEAMLESS_FLOW) setSeamlessScript(""); },
                        toolMode === ToolMode.STORY_DNA
                      )}
                    </div>
                  </div>
                  <div className={`flex items-center gap-2 flex-shrink-0 bg-white/50 p-1 rounded-xl ${isInputFocused ? 'hidden md:flex' : 'flex'}`}>
                    <button onClick={() => setOutputLanguage('EN')} className={`flex-1 py-2 sm:py-3 rounded-lg text-[8px] font-serif font-black transition ${outputLanguage === 'EN' ? 'bg-indigo-600 text-white' : 'bg-white text-indigo-600 border'}`}>{translate('US_ENGLISH', outputLanguage)}</button>
                    <button onClick={() => setOutputLanguage('VN')} className={`flex-1 py-2 sm:py-3 rounded-lg text-[8px] font-serif font-black transition ${outputLanguage === 'VN' ? 'bg-indigo-600 text-white' : 'bg-white text-indigo-600 border'}`}>{translate('VIETNAMESE', outputLanguage)}</button>
                    <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 h-[34px] sm:h-[42px] font-black text-[8px] shadow-sm"><span>{translate('PROMPT_COUNT', outputLanguage)}</span><input type="number" value={toolPromptCount} onChange={e => setToolPromptCount(e.target.value)} className="w-8 text-center outline-none bg-white text-[8px] font-black" /></div>
                    <button onClick={() => handleToolGenerate(toolMode)} disabled={isGenerating} className="flex-[3] py-2 sm:py-3 rounded-lg bg-indigo-500 text-white font-black text-[8px] font-serif uppercase italic">{generatingTool === toolMode ? translate('GENERATING_SCRIPT', outputLanguage) : translate('EXPORT_PROMPTS', outputLanguage)}</button>
                  </div>
                </div>
              ) : (
                <div className="flex-1 p-2 overflow-y-auto custom-scrollbar bg-slate-50/10">
                  {concurrentRenderCount > 0 ? (
                    <div className="space-y-3 p-2"><h4 className="text-[8px] font-serif font-black text-indigo-600 uppercase italic mb-2 tracking-widest">{translate('RENDER_THREADS', outputLanguage).replace('{count}', concurrentRenderCount.toString())}</h4>{concurrentPrompts.slice(0, concurrentRenderCount).map((p, idx) => (<div key={idx} className="bg-white border-2 border-indigo-100 p-3 rounded-2xl shadow-sm"><span className="text-[8px] font-serif font-black text-indigo-500 uppercase italic">{translate('THREAD_STATUS', outputLanguage).toUpperCase()} #{idx+1}</span><textarea value={p} onChange={e => { const n = [...concurrentPrompts]; n[idx] = e.target.value; setConcurrentPrompts(n); }} className="w-full mt-2 bg-slate-50 p-3 rounded-xl text-[12px] font-bold outline-none h-16 resize-none border focus:border-indigo-400" /></div>))}</div>
                  ) : (
                      <div className="space-y-4 p-4">
                        {currentPromptText.split('\n').map((line, i) => {
                          // Filter out DNA header for IMAGE_GEN tool mode
                          const lowerLine = line.toLowerCase();
                          if (toolMode === ToolMode.IMAGE_GEN && (
                            lowerLine.includes("global character dna control") || 
                            lowerLine.includes("danh sách nhân vật dna") ||
                            lowerLine.includes("character dna list") ||
                            lowerLine.includes("global character control")
                          )) {
                            return null;
                          }
                          return (
                            <div key={i} className={`flex items-start gap-4 p-6 bg-white border-2 rounded-[2.5rem] shadow-sm relative hover:border-indigo-200 transition ${line ? 'border-indigo-100' : 'border-slate-100'}`}>
                              <div className="flex items-center gap-3 mt-2 shrink-0">
                                <input type="checkbox" checked={selectedPrompts.has(i)} onChange={() => toggleSelectPrompt(i)} className="w-5 h-5 rounded-md border-slate-300 accent-indigo-600 cursor-pointer shadow-sm" />
                                <span className="text-[12px] font-serif font-black text-indigo-600 italic">#{i+1}</span>
                              </div>
                              
                              {mode === VideoMode.IMAGE_TO_VIDEO && (
                                <div className="w-16 h-16 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center cursor-pointer relative group shrink-0" onClick={() => { specificSlotRef.current = { index: i }; fileInputRef.current?.click(); }}>
                                  {currentImages[i]?.url ? (
                                    <>
                                      <img src={currentImages[i].url} className="w-full h-full object-cover rounded-xl" />
                                      <button 
                                        onClick={(e) => { 
                                          e.stopPropagation(); 
                                          const next = [...currentImages]; 
                                          next[i] = { url: '', name: '' }; 
                                          setModeImages(prev => ({ ...prev, [mode]: next })); 
                                        }}
                                        className="absolute -top-1 -right-1 bg-red-500 text-white w-5 h-5 rounded-full text-[12px] font-serif font-black flex items-center justify-center transition-opacity"
                                      >
                                        ✕
                                      </button>
                                    </>
                                  ) : (
                                    <span className="text-[12px] font-serif font-black text-slate-300 italic uppercase">{translate('IMAGE_LABEL', outputLanguage)}</span>
                                  )}
                                </div>
                              )}
                              
                              {mode === VideoMode.INTERPOLATION && (
                                <div className="flex gap-2 shrink-0">
                                  <div className="w-16 h-16 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center cursor-pointer relative group" onClick={() => { specificSlotRef.current = { index: i, subIndex: 0 }; fileInputRef.current?.click(); }}>
                                    {currentImages[i*2]?.url ? (
                                      <>
                                        <img src={currentImages[i*2].url} className="w-full h-full object-cover rounded-xl" />
                                        <button 
                                          onClick={(e) => { 
                                            e.stopPropagation(); 
                                            const next = [...currentImages]; 
                                            next[i*2] = { url: '', name: '' }; 
                                            setModeImages(prev => ({ ...prev, [mode]: next })); 
                                          }}
                                          className="absolute -top-1 -right-1 bg-red-500 text-white w-5 h-5 rounded-full text-[12px] font-serif font-black flex items-center justify-center transition-opacity"
                                        >
                                          ✕
                                        </button>
                                      </>
                                    ) : (
                                      <span className="text-[12px] font-serif font-black text-slate-300 italic uppercase">{translate('START_LABEL', outputLanguage)}</span>
                                    )}
                                  </div>
                                  <div className="w-16 h-16 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center cursor-pointer relative group" onClick={() => { specificSlotRef.current = { index: i, subIndex: 1 }; fileInputRef.current?.click(); }}>
                                    {currentImages[i*2+1]?.url ? (
                                      <>
                                        <img src={currentImages[i*2+1].url} className="w-full h-full object-cover rounded-xl" />
                                        <button 
                                          onClick={(e) => { 
                                            e.stopPropagation(); 
                                            const next = [...currentImages]; 
                                            next[i*2+1] = { url: '', name: '' }; 
                                            setModeImages(prev => ({ ...prev, [mode]: next })); 
                                          }}
                                          className="absolute -top-1 -right-1 bg-red-500 text-white w-5 h-5 rounded-full text-[12px] font-serif font-black flex items-center justify-center transition-opacity"
                                        >
                                          ✕
                                        </button>
                                      </>
                                    ) : (
                                      <span className="text-[12px] font-serif font-black text-slate-300 italic uppercase">{translate('END_LABEL', outputLanguage)}</span>
                                    )}
                                  </div>
                                </div>
                              )}
                              
                              <textarea 
                                onFocus={() => setIsInputFocused(true)}
                                onBlur={() => setIsInputFocused(false)}
                                value={line} 
                                onChange={e => { const n = currentPromptText.split('\n'); n[i] = e.target.value; updatePromptForMode(n.join('\n')); }} 
                                className="flex-1 bg-transparent outline-none text-[13px] font-bold h-20 resize-none mt-1" 
                                placeholder={translate('PROMPT_SCENE_PLACEHOLDER', outputLanguage, { count: i + 1 })} 
                              />
                              
                              <button 
                                onClick={() => { const n = currentPromptText.split('\n'); n.splice(i, 1); updatePromptForMode(n.join('\n')); }} 
                                className="absolute right-6 top-6 bg-slate-100 text-slate-400 w-8 h-8 rounded-full text-[12px] flex items-center justify-center hover:bg-red-500 hover:text-white transition-all shadow-sm z-20"
                              >
                                ✕
                              </button>
                            </div>
                          );
                        })}
                        <button 
                          onClick={() => updatePromptForMode(currentPromptText + '\n')} 
                          className="mt-2 py-3 px-10 border-2 border-dashed border-slate-200 rounded-full text-[10px] font-black text-slate-400 hover:text-indigo-600 hover:border-indigo-300 transition-all uppercase tracking-widest italic"
                        >
                          + {translate('ADD_SCENE', outputLanguage)}
                        </button>
                      </div>
                  )}
                  {mode === VideoMode.CONSISTENCY && (
                    <div className="mt-6 p-8 bg-slate-50/50 rounded-[3rem] border-2 border-slate-100 shadow-inner">
                      <div className="flex justify-between items-center mb-6">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">🍫</span>
                          <span className="text-[10px] font-black uppercase text-slate-700 italic">{translate('DNA_VAULT', outputLanguage)} ({currentImages.length})</span>
                        </div>
                        <button 
                          onClick={() => { specificSlotRef.current = null; fileInputRef.current?.click(); }} 
                          className="bg-indigo-600 hover:bg-indigo-700 text-white px-10 py-3 rounded-full text-[10px] font-black shadow-lg transition-all active:scale-95 uppercase italic tracking-widest"
                        >
                          {translate('UPLOAD_DNA', outputLanguage)}
                        </button>
                      </div>
                      <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
                        {currentImages.map((img, idx) => (
                          <div key={idx} className="relative flex-shrink-0 w-32 bg-white p-3 rounded-2xl border-2 border-indigo-50 shadow-xl overflow-hidden flex flex-col gap-2">
                            <img src={img.url} className="w-full aspect-square object-cover rounded-xl" />
                            <input type="text" value={img.name} onChange={(e) => { const nextImages = [...currentImages]; nextImages[idx] = { ...nextImages[idx], name: e.target.value }; setModeImages(prev => ({ ...prev, [mode]: nextImages })); }} className="w-full text-[10px] font-black text-indigo-700 bg-slate-50 border-none rounded p-1.5 outline-none text-center focus:bg-white" placeholder={translate('NAME_PLACEHOLDER', outputLanguage)} />
                            <button onClick={() => setModeImages(prev => ({ ...prev, [mode]: prev[mode].filter((_, i) => i !== idx) }))} className="absolute -top-1 -right-1 bg-red-500 text-white w-6 h-6 rounded-full text-[10px] flex items-center justify-center font-black shadow-md">✕</button>
                          </div>
                        ))}
                        {currentImages.length === 0 && (
                          <div className="flex-1 h-32 flex items-center justify-center text-slate-300 italic text-[10px] uppercase font-black opacity-30">
                            {translate('STUDIO_READY_BATCH', outputLanguage)}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="px-6 py-4 bg-white border-t border-slate-100 flex-shrink-0">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
                <div className="w-full sm:flex-[1.2] flex flex-col gap-1">
                  <button 
                    onClick={handleGenerate} 
                    disabled={isGenerating || (userPlan === 'pro' && profile.is_active && apiKeys.length === 0) || (selectedEngine !== 'veo' && !wavespeedApiKey)} 
                    className={`relative flex items-center justify-center gap-2 px-6 py-4 rounded-xl font-black text-[10px] tracking-widest uppercase transition-all duration-300 shadow-xl border-2 ${(userPlan === 'pro' && profile.is_active && apiKeys.length === 0) || (selectedEngine !== 'veo' && !wavespeedApiKey) ? 'bg-slate-200 text-slate-500 border-slate-300 cursor-not-allowed' : 'bg-red-600 text-white border-red-500 hover:bg-red-700 active:scale-95'} w-full italic`}
                  >
                    <span className="flex items-center gap-2">
                       {isGenerating ? '' : '🚀'}
                       {isGenerating 
                         ? `${translate('STUDIO_RENDERING', outputLanguage)} (${countdown}s)` 
                         : (userPlan === 'pro' && profile.is_active && apiKeys.length === 0) 
                           ? translate('PLEASE_ENTER_PRO1_KEY', outputLanguage)
                           : (selectedEngine !== 'veo' && !wavespeedApiKey)
                             ? 'VUI LÒNG NHẬP WAVESPEED KEY'
                             : translate('GENERATE', outputLanguage)}
                    </span>
                  </button>
                  <p className="text-[9px] font-bold text-slate-400 text-center uppercase italic">
                    Ước tính: {getActivePromptsFromSource().length} cảnh × 8 giây × ${VIDEO_ENGINES.find(e => e.id === selectedEngine)?.pricePerSec} = ~${(getActivePromptsFromSource().length * 8 * (VIDEO_ENGINES.find(e => e.id === selectedEngine)?.pricePerSec || 0)).toFixed(2)}
                  </p>
                </div>
                <div className="w-full sm:flex-1 bg-slate-50 border-2 border-slate-100 rounded-xl p-1 flex gap-1 shadow-inner h-fit">{[AspectRatio.LANDSCAPE, AspectRatio.PORTRAIT, AspectRatio.SQUARE].map((ratio) => (<button key={ratio} onClick={() => setAspectRatio(ratio)} className={`flex-1 py-1 rounded-lg text-[8px] font-black transition ${aspectRatio === ratio ? 'bg-white text-indigo-600 shadow-md border border-indigo-100' : 'text-slate-400 hover:text-slate-600 uppercase italic'}`}>{ratio === AspectRatio.LANDSCAPE ? '16:9' : ratio === AspectRatio.PORTRAIT ? '9:16' : '1:1'}</button>))}</div>
                <div className="flex-[0.5] bg-white border-2 border-slate-100 rounded-xl px-2 py-1 flex items-center gap-1 shadow-sm h-fit"><select value={resolution} onChange={e => setResolution(e.target.value as Resolution)} className="bg-transparent text-[8px] font-black outline-none text-indigo-600 uppercase w-full text-center"><option value={Resolution.R720P}>720P</option><option value={Resolution.R1080P}>1080P</option></select></div>
                {isGenerating ? <button onClick={handleStop} className="bg-red-500 text-white px-4 py-4 rounded-xl font-black text-[8px] uppercase animate-pulse shadow-lg w-full sm:flex-1 italic h-fit">{translate('STOP', outputLanguage)}</button> : <button onClick={onOpenPricing} className="bg-white text-black border-2 border-slate-200 px-4 py-4 rounded-xl font-black text-[8px] uppercase shadow-lg active:scale-95 w-full sm:flex-1 italic h-fit">{translate('PRICING', outputLanguage)}</button>}
              </div>
            </div>
          </div>
        </div>
        <div className="flex-1 lg:flex-[0.75] flex flex-col min-w-0 h-full overflow-hidden">
          <div className="bg-white border-2 border-slate-200 rounded-[2rem] shadow-2xl flex flex-col flex-1 border-t-[6px] border-t-blue-600 overflow-hidden relative min-h-0">
            <div className="bg-slate-900 text-white p-3 border-b border-white/5 flex flex-col gap-3 flex-shrink-0 shadow-lg">
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-2">
                  <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse shadow-[0_0_8px_#3b82f6]"></span>
                  <span className="text-[8px] font-serif font-black uppercase italic tracking-widest">{translate('CINEMA_SUPERVISION', outputLanguage)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <button onClick={handleSelectAllTasks} className="bg-white/10 hover:bg-white/20 border border-white/10 rounded-lg px-2 py-1.5 text-[8px] font-serif font-black uppercase transition italic">{translate('SELECT_ALL_VIDEOS', outputLanguage)}</button>
                    <button onClick={handleJoinVideos} disabled={selectedTaskIds.size < 2} className={`rounded-lg px-2 py-1.5 text-[8px] font-serif font-black uppercase transition italic ${selectedTaskIds.size >= 2 ? 'bg-blue-600 text-white shadow-lg' : 'bg-white/5 text-white/20 cursor-not-allowed'}`}>{translate('JOIN_VIDEOS', outputLanguage)}</button>
                    <button onClick={handleRepairVideos} disabled={selectedTaskIds.size === 0} className={`rounded-lg px-2 py-1.5 text-[8px] font-serif font-black uppercase transition italic ${selectedTaskIds.size > 0 ? 'bg-amber-500 text-white shadow-lg' : 'bg-white/5 text-white/20 cursor-not-allowed'}`}>{translate('REPAIR_VIDEOS', outputLanguage)}</button>
                  </div>
                  <div className="flex gap-1 ml-2">
                    {concurrentRenderCount > 0 && (
                      <button 
                        onClick={handleGenerate} 
                        disabled={isGenerating}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-[8px] font-serif font-black px-3 py-1.5 rounded-lg shadow-lg transition active:scale-95 flex items-center gap-1"
                      >
                        🚀 {translate('GENERATE_VIDEO', outputLanguage)}
                      </button>
                    )}
                    <button onClick={() => setConcurrentRenderCount(3)} className={`text-[8px] font-serif font-black px-3 py-1.5 rounded-lg border transition ${concurrentRenderCount === 3 ? 'bg-blue-500 text-white shadow-lg' : 'bg-white/5 text-white/30 border-white/10 hover:bg-white/10'}`}>3 {translate('THREADS_UNIT', outputLanguage)}</button>
                    <button onClick={() => setConcurrentRenderCount(5)} className={`text-[8px] font-serif font-black px-3 py-1.5 rounded-lg border transition ${concurrentRenderCount === 5 ? 'bg-blue-500 text-white shadow-lg' : 'bg-white/5 text-white/30 border-white/10 hover:bg-white/10'}`}>5 {translate('THREADS_UNIT', outputLanguage)}</button>
                    {concurrentRenderCount > 0 && <button onClick={() => setConcurrentRenderCount(0)} className="text-[8px] font-serif font-black px-3 py-1.5 rounded-lg bg-slate-600 text-white shadow-lg italic">{translate('OFF_LABEL', outputLanguage)}</button>}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50/50 p-2 space-y-3 min-h-0">
              <div className="flex justify-between items-center px-2">
                <span className="text-[8px] font-black text-slate-400 uppercase italic tracking-widest">{translate('RENDER_RESULTS', outputLanguage)} ({activeTasks.length})</span>
                {activeTasks.length > 0 && <button onClick={() => setActiveTasks([])} className="text-[8px] font-black bg-slate-200 text-slate-500 px-3 py-1 rounded-md uppercase">{translate('DELETE_ALL', outputLanguage)}</button>}
              </div>

              {!(isGenerating || isFullVideoRendering) && (
                <div className="px-2 pt-2">
                  <EngineSelector 
                    selected={selectedEngine} 
                    onChange={(eng) => {
                      setSelectedEngine(eng);
                      // Tự tắt Cookie Mode nếu chọn Seedance/Kling
                      if (eng !== 'veo') setUseCookieMode(false);
                    }} 
                    disabled={isGenerating} 
                  />
                  {/* 🍪 Cookie Mode — chỉ hiện khi chọn Veo */}
                  {selectedEngine === 'veo' && (
                    <CookieToggle
                      useCookieMode={useCookieMode}
                      onToggle={setUseCookieMode}
                      cookieString={cookieString}
                      onCookieChange={setCookieString}
                      outputLanguage={outputLanguage}
                    />
                  )}
                  
                  {selectedEngine !== 'veo' && (
                    <div className="mb-4 transition-all">
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider italic">
                          {userPlan === 'pro' && (profile.plan_type === 'pro9' || (profile as any).plan === 'pro9') 
                            ? 'WaveSpeed API Key (Tùy chọn)' 
                            : 'WaveSpeed API Key (Bắt buộc)'}
                        </label>
                        <a 
                          href="https://wavespeed.ai" 
                          target="_blank" 
                          rel="noreferrer"
                          className="text-[10px] text-indigo-500 hover:underline font-bold italic"
                        >
                          Lấy key miễn phí tại wavespeed.ai
                        </a>
                      </div>
                      <input 
                        type="password"
                        value={wavespeedApiKey}
                        onChange={(e) => setWavespeedApiKey(e.target.value)}
                        placeholder={(userPlan === 'pro' && (profile.plan_type === 'pro9' || (profile as any).plan === 'pro9'))
                          ? "Dùng key hệ thống (hoặc dán key riêng vào đây)..."
                          : "Dán WaveSpeed API Key cá nhân vào đây..."}
                        className="w-full bg-white border-2 border-slate-200 rounded-xl px-4 py-3 text-xs font-mono outline-none focus:border-indigo-400 shadow-sm"
                      />
                    </div>
                  )}
                </div>
              )}

              {activeTasks.map((task, idx) => (
                <div key={task.id} className="p-4 border-2 rounded-[2rem] bg-white shadow-xl relative overflow-hidden border-slate-100 group hover:border-blue-300 transition-all flex flex-col gap-2">
                  <div className="flex justify-between items-center px-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[8px] font-black text-slate-400 italic">
                        {task.laneId ? `${translate('THREAD_STATUS', outputLanguage).toUpperCase()} ${task.laneId}` : `#${activeTasks.length - idx}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-[8px] font-black text-indigo-400 italic">{task.progress}%</div>
                      <input type="checkbox" checked={selectedTaskIds.has(task.id)} onChange={() => toggleSelectTask(task.id)} className="w-4 h-4 rounded accent-indigo-600 cursor-pointer shadow-md" />
                    </div>
                  </div>

                  {task.status && (
                    <div className={`px-1 text-[7px] font-black uppercase italic ${task.status.includes('Lỗi') || task.status.includes('Error') || task.status.includes('fail') ? 'text-red-500' : 'text-slate-400'}`}>
                      {task.status}
                    </div>
                  )}

                  <div className="px-1">
                    {editingTaskId === task.id ? (
                      <textarea 
                        onFocus={() => setIsInputFocused(true)}
                        onBlur={() => setIsInputFocused(false)}
                        value={editPromptValue} 
                        onChange={(e) => setEditPromptValue(e.target.value)}
                        className="w-full p-3 text-[8px] font-bold border-2 border-indigo-200 rounded-2xl outline-none focus:border-indigo-500 h-24 resize-none bg-indigo-50/30"
                        autoFocus
                      />
                    ) : (
                      <p className="text-[8px] font-black text-slate-800 italic uppercase tracking-tighter leading-tight line-clamp-3">
                        {task.prompt}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 px-1 mt-1">
                    {editingTaskId === task.id ? (
                      <button onClick={() => saveEditTask(task.id)} className="bg-emerald-600 text-white px-4 py-1.5 rounded-xl text-[9px] font-black uppercase shadow-lg active:scale-95 flex items-center gap-1">
                        💾 {translate('SAVE_IMG_BTN', outputLanguage)}
                      </button>
                    ) : (
                      <button 
                        onClick={() => startEditTask(task)} 
                        disabled={!selectedTaskIds.has(task.id)}
                        className={`px-4 py-1.5 rounded-xl text-[9px] font-black uppercase shadow-lg active:scale-95 flex items-center gap-1 ${selectedTaskIds.has(task.id) ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-400'}`}
                      >
                        ✏️ {translate('EDIT', outputLanguage)}
                      </button>
                    )}
                    <button 
                      onClick={() => downloadVideoFile(task.url, task.id)} 
                      className={`px-4 py-1.5 rounded-xl text-[9px] font-black uppercase shadow-lg active:scale-95 flex items-center gap-1 ${task.url ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}
                      disabled={!task.url}
                    >
                      📥 {translate('SAVE_IMAGE', outputLanguage)}
                    </button>
                    <button onClick={() => deleteTask(task.id)} className="bg-red-500 text-white px-4 py-1.5 rounded-xl text-[9px] font-black uppercase shadow-lg active:scale-95 flex items-center gap-1">
                      🗑️ {translate('DELETE', outputLanguage)}
                    </button>
                  </div>

                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-indigo-600 to-indigo-800 transition-all duration-1000" style={{ width: `${task.progress}%` }}></div>
                  </div>

                  {task.url && (
                    <div className="mt-1 rounded-2xl overflow-hidden border-2 border-slate-50 shadow-inner bg-black aspect-video">
                      <video src={task.url} controls playsInline className="w-full h-full" />
                    </div>
                  )}
                </div>
              ))}
              {activeTasks.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-slate-300 opacity-30 italic text-[10px] uppercase font-black tracking-widest">
                  {(isGenerating || isFullVideoRendering) && (
                    <div className="mb-8 w-full max-w-sm px-4">
                      {/* GOOGLE - VEO 3.1 Above */}
                      <div className="flex flex-col items-center mb-6 scale-110">
                        <span className="bg-indigo-600 text-white text-[7px] font-black px-1.5 py-0.5 rounded mb-1">GOOGLE</span>
                        <span className="text-[12px] font-black text-slate-800">Veo 3.1 Fast</span>
                      </div>
                      
                      {/* BYTEDANCE and KUAISHOU balanced around the text */}
                      <div className="flex items-center justify-between w-full">
                        <div className="flex flex-col items-center">
                          <span className="bg-[#2AF5FF] text-white text-[7px] font-black px-1.5 py-0.5 rounded mb-1">BYTEDANCE</span>
                          <span className="text-[10px] font-black text-slate-800">Seedance Fast</span>
                        </div>
                        
                        <div className="mx-4 text-center">
                          {translate('WAITING_COMMAND', outputLanguage)}
                        </div>

                        <div className="flex flex-col items-center">
                          <span className="bg-[#FF7752] text-white text-[7px] font-black px-1.5 py-0.5 rounded mb-1">KUAISHOU</span>
                          <span className="text-[10px] font-black text-slate-800">Kling 3.0</span>
                        </div>
                      </div>
                    </div>
                  )}
                  {!(isGenerating || isFullVideoRendering) && translate('WAITING_COMMAND', outputLanguage)}
                </div>
              )}
            </div>
            <div className="p-3 bg-slate-900 border-t-[4px] border-t-indigo-500 shadow-2xl flex-shrink-0 flex gap-2">
              <button onClick={handleRunFullVideo} disabled={isGenerating} className="flex-1 py-4 rounded-xl bg-indigo-400 text-white font-black text-[8px] uppercase shadow-xl active:scale-95 italic">{isFullVideoRendering ? `${translate('STUDIO_RENDERING', outputLanguage)} (${countdown}s)` : translate('CREATE_SEAMLESS', outputLanguage)}</button>
              <button 
                onClick={() => { 
                  const s = activeTasks.filter(t => selectedTaskIds.has(t.id) && t.url); 
                  if (s.length === 0) {
                    alert(translate('SELECT_VIDEO_TO_SAVE', outputLanguage));
                    return;
                  }
                  s.forEach((t, i) => setTimeout(() => downloadVideoFile(t.url, `cinema_${t.id}`), i*1000)); 
                }} 
                className="flex-1 py-4 rounded-xl bg-indigo-700 text-white font-black text-[8px] uppercase shadow-xl active:scale-95 italic flex items-center justify-center gap-2"
              >
                <span>{translate('SAVE_TO_DEVICE', outputLanguage)}</span>
                {selectedTaskIds.size > 0 && <span className="bg-white text-indigo-700 px-1.5 py-0.5 rounded-md text-[8px]">{selectedTaskIds.size}</span>}
              </button>
            </div>
          </div>
        </div>
      </div>
      {showZaloGroupQR && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xl flex items-center justify-center p-4 z-[500] animate-in fade-in duration-300">
          <div className="bg-white rounded-[3rem] p-10 max-w-sm w-full text-center relative shadow-2xl border-4 border-emerald-50">
            <button onClick={() => setShowZaloGroupQR(false)} className="absolute top-6 right-6 font-black text-2xl text-slate-300 hover:text-red-500 transition-all">✕</button>
            <h3 className="text-xl font-black mb-6 italic uppercase tracking-tighter text-slate-800">{translate('ZALO_GROUP_TITLE', outputLanguage)}</h3>
            <div className="bg-slate-50 p-6 rounded-3xl mb-6 shadow-inner">
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=https://zalo.me/g/wwymih732`} className="mx-auto rounded-[2rem] shadow-xl border-4 border-white" alt="QR Zalo Group" />
            </div>
            <p className="text-[10px] font-black text-slate-400 mt-4 uppercase tracking-[0.4em] italic">{translate('LAB_AI_STUDIO', outputLanguage)}</p>
          </div>
        </div>
      )}
      {showZaloQR && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xl flex items-center justify-center p-4 z-[500] animate-in fade-in duration-300">
          <div className="bg-white rounded-[3rem] p-10 max-w-sm w-full text-center relative shadow-2xl border-4 border-indigo-50"><button onClick={() => setShowZaloQR(false)} className="absolute top-6 right-6 font-black text-2xl text-slate-300 hover:text-red-500 transition-all">✕</button><h3 className="text-xl font-black mb-6 italic uppercase tracking-tighter text-slate-800">{translate('TECH_SUPPORT_TITLE', outputLanguage)}</h3><div className="bg-slate-50 p-6 rounded-3xl mb-6 shadow-inner"><img src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=https://zalo.me/0973480488`} className="mx-auto rounded-[2rem] shadow-xl border-4 border-white" alt="QR Zalo" /></div><p className="text-xl font-black text-indigo-600 italic tracking-tighter">0973.480.488</p><p className="text-[10px] font-black text-slate-400 mt-4 uppercase tracking-[0.4em] italic">{translate('LAB_AI_STUDIO', outputLanguage)}</p></div>
        </div>
      )}
      {editingBatchIdx !== null && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[1000] flex items-center justify-center p-4">
          <div className="bg-white p-6 rounded-3xl shadow-2xl w-full max-w-lg border-2 border-indigo-100">
            <h3 className="text-sm font-black text-indigo-700 uppercase mb-4 italic">{translate('EDIT_PROMPT_TITLE', outputLanguage)}</h3>
            <textarea value={editingBatchPrompt} onChange={(e) => setEditingBatchPrompt(e.target.value)} className="w-full h-32 p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-[8px] font-bold outline-none mb-6" />
            <div className="flex gap-2">
              <button onClick={() => handleRegenerateBatchImage(editingBatchIdx, editingBatchPrompt)} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-black text-[8px] uppercase shadow-lg italic">{translate('UPDATE_IMAGE', outputLanguage)}</button>
              <button onClick={() => setEditingBatchIdx(null)} className="flex-1 py-3 bg-slate-200 text-slate-500 rounded-xl font-black text-[8px] uppercase italic">{translate('CANCEL', outputLanguage)}</button>
            </div>
          </div>
        </div>
      )}
      <input type="file" ref={fileInputRef} onChange={handleFileChange} multiple hidden accept="image/*" />
      <input type="file" ref={refImageInputRef} onChange={handleRefImageChange} hidden accept="image/*" />
    </div>
  );
};
