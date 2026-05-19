
import React, { useState } from 'react';
import { Plus, Trash2, Play, Download, Copy, RotateCcw, CheckSquare, Square, Settings2, Loader2, Volume2, Pencil, Save, X } from 'lucide-react';
import { translate } from '../i18n';
import { UserProfile } from '../types';
import { supabase, isSupabaseDisabled } from '../supabaseClient';
import { generateGeminiText, generateGeminiVoice } from '../services/gemini';

interface PromptToVoiceProps {
  outputLanguage: 'EN' | 'VN';
  profile: UserProfile;
  useProjectKey: boolean;
  deductCredit: (amount: number, action?: any) => Promise<boolean>;
  credit: number;
  userPlan: string;
  apiKeys: string[];
}

interface PromptBlock {
  id: string;
  text: string;
}

interface TextBlock {
  id: string;
  text: string;
  selected: boolean;
}

export const PromptToVoice: React.FC<PromptToVoiceProps> = ({ outputLanguage, profile, useProjectKey, deductCredit, credit, userPlan, apiKeys }) => {
  const [prompts, setPrompts] = useState<PromptBlock[]>([{ id: '1', text: '' }]);
  const [generatedTextBlocks, setGeneratedTextBlocks] = useState<TextBlock[]>([]);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isPortrait, setIsPortrait] = useState(window.innerHeight > window.innerWidth);

  React.useEffect(() => {
    const handleResize = () => setIsPortrait(window.innerHeight > window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [selectedTopic, setSelectedTopic] = useState('TOPIC_FILM_REVIEW');
  const [targetLang, setTargetLang] = useState<'VN' | 'EN'>(outputLanguage);
  const [isGeneratingText, setIsGeneratingText] = useState(false);
  const [isGeneratingVoice, setIsGeneratingVoice] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  const saveEditBlock = (id: string) => {
    setGeneratedTextBlocks(generatedTextBlocks.map(b => b.id === id ? { ...b, text: editingText } : b));
    setEditingBlockId(null);
  };

  const cancelEditBlock = () => {
    setEditingBlockId(null);
    setEditingText('');
  };

  const startEditingBlock = (block: TextBlock) => {
    setEditingBlockId(block.id);
    setEditingText(block.text);
  };
  
  // Auto-play audio when URL is set
  React.useEffect(() => {
    if (audioUrl && audioRef.current) {
      const playAudio = async () => {
        try {
          // Small delay to ensure browser is ready after blob URL creation
          await new Promise(resolve => setTimeout(resolve, 100));
          if (audioRef.current) {
            audioRef.current.load();
            await audioRef.current.play();
          }
        } catch (err) {
          console.error("Auto-play failed:", err);
        }
      };
      playAudio();
    }
  }, [audioUrl]);
  
  // Voice Settings
  const [voiceLang, setVoiceLang] = useState(outputLanguage === 'VN' ? 'vi-VN' : 'en-US');
  
  // Sync voice language with target language
  React.useEffect(() => {
    setVoiceLang(targetLang === 'VN' ? 'vi-VN' : 'en-US');
  }, [targetLang]);

  const [voiceGender, setVoiceGender] = useState<'MALE' | 'FEMALE'>('FEMALE');
  const [voiceStyle, setVoiceStyle] = useState('STYLE_NATURAL');
  const [voiceQuality, setVoiceQuality] = useState('QUALITY_YOUTHFUL');
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const [showErrorHint, setShowErrorHint] = useState(false);

  const addPrompt = () => {
    setPrompts([...prompts, { id: Date.now().toString(), text: '' }]);
  };

  const removePrompt = (id: string) => {
    if (prompts.length > 1) {
      setPrompts(prompts.filter(p => p.id !== id));
    }
  };

  const updatePrompt = (id: string, text: string) => {
    setPrompts(prompts.map(p => p.id === id ? { ...p, text } : p));
  };

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const toggleSelectAll = () => {
    const allSelected = generatedTextBlocks.every(b => b.selected);
    setGeneratedTextBlocks(generatedTextBlocks.map(b => ({ ...b, selected: !allSelected })));
  };

  const toggleSelectBlock = (id: string) => {
    setGeneratedTextBlocks(generatedTextBlocks.map(b => b.id === id ? { ...b, selected: !b.selected } : b));
  };

  const removeGeneratedBlock = (id: string) => {
    setGeneratedTextBlocks(generatedTextBlocks.filter(b => b.id !== id));
  };

  const addManualBlock = () => {
    const newBlock: TextBlock = {
      id: `manual-${Date.now()}`,
      text: '',
      selected: true
    };
    setGeneratedTextBlocks(prev => [...prev, newBlock]);
    setEditingBlockId(newBlock.id);
    setEditingText('');
  };

  const generateText = async () => {
    // Gather all text from prompts and split into lines
    const allLines = prompts
      .map(p => p.text.trim())
      .filter(Boolean)
      .join('\n')
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);

    if (allLines.length === 0) return;
    
    // Experience Limits for Free users
    const cleanEmail = profile.email?.trim().toLowerCase();
    if (userPlan === 'free' && !profile.isAdmin) {
      const usageKey = `veopro_usage_${cleanEmail}_${new Date().toISOString().split('T')[0]}`;
      const dailyUsage = Number(localStorage.getItem(usageKey) || 0);
      if (dailyUsage >= 10) { // Limit text to 10
        alert(`Giới hạn dùng thử hàng ngày đã hết. Vui lòng nâng cấp gói Pro để tiếp tục.\n\nDaily limit reached. Please upgrade to Pro.`);
        return;
      }
      localStorage.setItem(usageKey, (dailyUsage + 1).toString());
    }

    // Check credit before starting
    const isPro = (userPlan === 'pro' || userPlan === 'pro1' || profile.isAdmin);
    if (!isPro && credit < 1 && !profile.isAdmin) {
      alert(translate('UPGRADE_PRO_MESSAGE', outputLanguage));
      return;
    }

    setIsGeneratingText(true);
    setStatusMessage(translate('STATUS_GENERATING_TEXT', outputLanguage));
    setGeneratedTextBlocks([]);
    
    try {
      // Deduct credit for text
      const success = await deductCredit(1, 'TEXT');
      if (!success) {
        setIsGeneratingText(false);
        return;
      }

      const isAdminFlag = profile.isAdmin;
      
      let finalApiKeys = apiKeys;
      let finalUseProjectKey = useProjectKey;

      if (isPro && apiKeys.length > 0) {
        if (isAdminFlag && useProjectKey) {
          finalUseProjectKey = true;
          finalApiKeys = apiKeys; 
        } else {
          finalUseProjectKey = false;
          finalApiKeys = apiKeys;
        }
      } else {
        finalUseProjectKey = true;
        finalApiKeys = apiKeys;
      }

      const newBlocks: TextBlock[] = [];
      
      // Target length in words for ~8 seconds (7.8s aim)
      const targetMin = targetLang === 'VN' ? 27 : 32;
      const targetMax = targetLang === 'VN' ? 31 : 36;
      const targetLangName = targetLang === 'VN' ? 'Tiếng Việt' : 'English';
      
      const systemInstruction = targetLang === 'VN' ? 
        `Bạn là một chuyên gia biên tập kịch bản video ngắn (8 giây).
        Nhiệm vụ: Chuyển đổi lời nhắc (prompt) thành văn bản đọc thoại (voiceover) hấp dẫn bằng ${targetLangName}.
        
        QUY TẮC CỐ ĐỊNH:
        1. Mỗi văn bản bạn tạo ra phải khớp với thời lượng 7.8 - 8.0 giây.
        2. Độ dài bắt buộc: Từ ${targetMin} đến ${targetMax} từ (${targetLangName}). KHÔNG ĐƯỢC ÍT HƠN HOẶC NHIỀU HƠN.
        3. Nếu trong lời nhắc có văn bản nằm trong ngoặc kép "", hãy sử dụng nội dùng đó làm trung tâm và mở rộng thêm mô tả bối cảnh hoặc cảm xúc để đạt đủ số từ yêu cầu.
        4. Văn phong: Điện ảnh, giàu cảm xúc, tự nhiên cho giọng đọc AI.
        5. Loại bỏ các thuật ngữ kỹ thuật quay phim (góc máy, cú cắt...).
        6. Thêm hướng dẫn nhạc nền/không khí trong ngoặc đơn ( ) ở ĐẦU đoạn văn (Ví dụ: (Nhạc nền kịch tính khởi đầu)).
        7. Chỉ trả về duy nhất đoạn văn bản kịch bản, không kèm lời dẫn hay giải thích.
        8. Toàn bộ nội dung phải là ${targetLangName}.` :
        
        `You are a professional short-video script editor (8 seconds).
        Task: Convert the prompt into a compelling voiceover text in ${targetLangName}.
        
        STRICT RULES:
        1. Each segment must fit a duration of 7.8 - 8.0 seconds.
        2. Mandatory Length: Exactly ${targetMin} to ${targetMax} words. NO MORE, NO LESS.
        3. If the prompt contains text in double quotes "", use that content as the core and expand with descriptive atmosphere or emotion to reach the word count.
        4. Style: Cinematic, emotional, and natural for AI voices.
        5. Remove all filmmaking technical terms (camera angles, cuts, etc.).
        6. Add background music/atmosphere instructions in parentheses ( ) at the START of the paragraph (e.g., (Mysterious ambient music begins)).
        7. Return ONLY the script content, no introductions or explanations.
        8. The entire content must be in ${targetLangName}.`;

      // Process each line individually
      for (let i = 0; i < allLines.length; i++) {
        const line = allLines[i];
        
        const success = await deductCredit(1);
        if (!success) break;

        const text = await generateGeminiText(line, systemInstruction, finalApiKeys, targetLang, finalUseProjectKey);
        newBlocks.push({
          id: `gen-${i}-${Date.now()}`,
          text: text,
          selected: true
        });
        
        // Update progress
        setProgress((i + 1) / allLines.length * 100);
      }
      
      setGeneratedTextBlocks(newBlocks);
    } catch (error: any) {
      console.error("Text generation error:", error);
      const errorMsg = error.message || String(error);
      
      if (errorMsg.includes('401') || errorMsg.includes('403') || errorMsg.includes('PERMISSION_DENIED') || errorMsg.includes('API key not valid') || error.isKeyError) {
        alert(translate('API_AUTH_ERROR', outputLanguage));
        if (window.aistudio?.openSelectKey) {
          await window.aistudio.openSelectKey();
        }
      } else if (errorMsg.includes('429') || errorMsg.includes('quota')) {
        alert(translate('QUOTA_EXCEEDED', outputLanguage));
      } else {
        alert(`${translate('AI_ERROR', outputLanguage)}: ${errorMsg}`);
      }
    } finally {
      setIsGeneratingText(false);
      setStatusMessage('');
      setProgress(0);
    }
  };

  const generateVoice = async () => {
    const selectedText = generatedTextBlocks
      .filter(b => b.selected)
      .map(b => b.text)
      .join('\n\n');
    
    if (!selectedText) return;

    // Experience Limits for Free users
    const cleanEmail = profile.email?.trim().toLowerCase();
    if (userPlan === 'free' && !profile.isAdmin) {
      const usageKey = `veopro_usage_${cleanEmail}_${new Date().toISOString().split('T')[0]}_voice`;
      const dailyUsage = Number(localStorage.getItem(usageKey) || 0);
      if (dailyUsage >= 5) { // Limit voice to 5
        alert(`Giới hạn dùng thử giọng đọc đã hết. Vui lòng nâng cấp gói Pro.\n\nDaily voice limit reached.`);
        return;
      }
      localStorage.setItem(usageKey, (dailyUsage + 1).toString());
    }

    // Check credit before starting
    const isProPlan = (userPlan === 'pro' || userPlan === 'pro1' || profile.isAdmin);
    if (!isProPlan && credit < 1 && !profile.isAdmin) {
      alert(translate('UPGRADE_PRO_MESSAGE', outputLanguage) + "\n\n(Cần: 1 xu)");
      return;
    }

    setIsGeneratingVoice(true);
    setStatusMessage(translate('STATUS_GENERATING_VOICE', outputLanguage));
    setProgress(10);
    setShowErrorHint(false);

    try {
      // Deduct credit for voice (constant 1)
      const success = await deductCredit(1, 'VOICE');
      if (!success) {
        setIsGeneratingVoice(false);
        return;
      }

      // Plan check and logic for Pro users
      const isPro = (userPlan === 'pro' || userPlan === 'pro1' || profile.isAdmin);
      const isAdminFlagVoice = profile.isAdmin;
      
      let voiceApiKeys = apiKeys;
      let voiceUseProjectKey = useProjectKey;

      if (isPro && apiKeys.length > 0) {
        if (isAdminFlagVoice && useProjectKey) {
          voiceUseProjectKey = true;
          voiceApiKeys = apiKeys;
        } else {
          voiceUseProjectKey = false;
          voiceApiKeys = apiKeys;
        }
      } else {
        voiceUseProjectKey = true;
        voiceApiKeys = apiKeys;
      }

      // Combine all selected text blocks into one request for efficiency and better key rotation
      const selectedBlocks = generatedTextBlocks.filter(b => b.selected);
      
      // Clean text: remove cinematic cues in parentheses but KEEP square brackets for gender switching
      // Combine with double newlines for natural pauses between blocks
      const combinedText = selectedBlocks
        .map(b => b.text.replace(/\([^)]*\)/g, '').trim())
        .filter(Boolean)
        .join('\n\n');
      
      if (!combinedText) {
        setIsGeneratingVoice(false);
        setStatusMessage('');
        return;
      }

      setStatusMessage(translate('STATUS_GENERATING_VOICE', outputLanguage));
      setProgress(20);

      const base64Audio = await generateGeminiVoice(
        combinedText,
        voiceLang,
        voiceGender,
        voiceStyle,
        voiceApiKeys,
        outputLanguage,
        voiceUseProjectKey,
        voiceQuality
      );

      setStatusMessage(translate('STATUS_MERGING', outputLanguage));
      setProgress(90);

      // We have the combined audio as a single base64 string
      const binaryString = atob(base64Audio);
      const mergedPcm = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        mergedPcm[i] = binaryString.charCodeAt(i);
      }

      // Add WAV header (Gemini TTS returns 24kHz mono PCM)
      const wavData = addWavHeader(mergedPcm, 24000);
      const combinedBlob = new Blob([wavData], { type: 'audio/wav' });
      const url = URL.createObjectURL(combinedBlob);
      setAudioUrl(url);
      
      // Save to Supabase if not disabled
      if (!isSupabaseDisabled) {
        await supabase.from('voice_generations').insert([{
          user_email: profile.email,
          text: combinedText.substring(0, 1000), // Save snippet
          audio_url: url, // In production, this would be a permanent storage URL
          created_at: new Date().toISOString()
        }]);
      }

      setProgress(100);
    } catch (error: any) {
      console.error("Voice generation error:", error);
      setShowErrorHint(true);
      const errorMsg = error.message || String(error);
      
      if (errorMsg.includes('401') || errorMsg.includes('403') || errorMsg.includes('PERMISSION_DENIED') || errorMsg.includes('API key not valid') || error.isKeyError) {
        alert(translate('API_AUTH_ERROR', outputLanguage));
        if (window.aistudio?.openSelectKey) {
          await window.aistudio.openSelectKey();
        }
      } else if (errorMsg.includes('429') || errorMsg.includes('quota')) {
        alert(translate('QUOTA_EXCEEDED', outputLanguage));
      } else {
        alert(`${translate('AI_ERROR', outputLanguage)}: ${errorMsg}`);
      }
    } finally {
      setIsGeneratingVoice(false);
      setStatusMessage('');
      setTimeout(() => setProgress(0), 2000);
    }
  };

  const addWavHeader = (pcmData: Uint8Array, sampleRate: number) => {
    const header = new ArrayBuffer(44);
    const view = new DataView(header);

    // RIFF identifier
    view.setUint32(0, 0x52494646, false); // "RIFF"
    // file length
    view.setUint32(4, 36 + pcmData.length, true);
    // RIFF type
    view.setUint32(8, 0x57415645, false); // "WAVE"
    // format chunk identifier
    view.setUint32(12, 0x666d7420, false); // "fmt "
    // format chunk length
    view.setUint32(16, 16, true);
    // sample format (1 = PCM)
    view.setUint16(20, 1, true);
    // channel count (1 = mono)
    view.setUint16(22, 1, true);
    // sample rate
    view.setUint32(24, sampleRate, true);
    // byte rate (sample rate * block align)
    view.setUint32(28, sampleRate * 2, true);
    // block align (channel count * bytes per sample)
    view.setUint16(32, 2, true);
    // bits per sample
    view.setUint16(34, 16, true);
    // data chunk identifier
    view.setUint32(36, 0x64617461, false); // "data"
    // data chunk length
    view.setUint32(40, pcmData.length, true);

    const wav = new Uint8Array(header.byteLength + pcmData.length);
    wav.set(new Uint8Array(header), 0);
    wav.set(pcmData, header.byteLength);
    return wav;
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden relative">
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

      {/* Header with Plan Info */}
      <div className={`px-6 py-4 bg-white border-b border-slate-100 flex items-center justify-between ${isInputFocused ? 'hidden md:flex' : 'flex'}`}>

        <div className="flex flex-col">
          <h2 className="text-xl font-black text-slate-800 tracking-tighter uppercase leading-none">
            {translate('PROMPT_TO_VOICE', outputLanguage)}
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-4 py-2 rounded-xl bg-slate-900 text-white shadow-lg flex items-center gap-2">
            <span className="text-[10px] font-serif font-black italic tracking-wider uppercase">
              {translate('CREDITS_LABEL', outputLanguage)}: { credit }
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden p-6 gap-6">
        {/* Left Column: Prompts */}
        <div className="w-1/2 flex flex-col gap-4 overflow-y-auto pr-2 custom-scrollbar">
          <div className={`flex items-center justify-between mb-2 ${isInputFocused ? 'hidden md:flex' : 'flex'}`}>
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
              <Settings2 size={16} className="text-blue-600" />
              {translate('PROMPT_INPUT_LABEL', outputLanguage)}
            </h3>
            <button 
              onClick={addPrompt}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 transition shadow-lg active:scale-95"
            >
              <Plus size={14} />
              {translate('ADD_PROMPT', outputLanguage)}
            </button>
          </div>

          <p className={`text-[10px] text-slate-500 font-bold italic mb-2 px-1 ${isInputFocused ? 'hidden md:block' : 'block'}`}>
            {translate('PROMPT_HINT', outputLanguage)}
            <span className="ml-2 text-blue-600 block sm:inline mt-1 sm:mt-0">
              {outputLanguage === 'VN' ? 'Mẹo: Dùng [Giọng Nam] hoặc [Giọng Nữ] để chuyển đổi giọng đọc trong văn bản.' : 'Tip: Use [Giọng Nam] or [Giọng Nữ] to switch voices within the text.'}
            </span>
          </p>

          {prompts.map((prompt) => (
            <div key={prompt.id} className="relative group">
              <textarea
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
                value={prompt.text}
                onChange={(e) => updatePrompt(prompt.id, e.target.value)}
                placeholder={translate('WAITING_COMMAND', outputLanguage)}
                className="w-full h-64 bg-white border border-slate-200 rounded-2xl p-4 text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none transition shadow-sm resize-none"
              />
              <div className="absolute bottom-4 right-4 flex items-center gap-3">
                <span className={`text-[10px] font-black uppercase ${prompt.text.split(/\s+/).filter(Boolean).length > 5000 ? 'text-red-500' : 'text-slate-400'}`}>
                  {translate('WORD_COUNT', outputLanguage, { count: prompt.text.split(/\s+/).filter(Boolean).length })} / 5000
                </span>
                {prompts.length > 1 && (
                  <button 
                    onClick={() => removePrompt(prompt.id)}
                    className="p-2 text-slate-400 hover:text-red-500 transition"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
              {prompt.text.length > 4500 && (
                <p className="mt-1 text-[9px] text-red-500 font-bold uppercase tracking-tighter">
                  {translate('PROMPT_WARNING', outputLanguage)}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Right Column: Generated Text & Voice */}
        <div className="w-1/2 flex flex-col gap-4 overflow-hidden">
          <div className={`flex items-center justify-between mb-2 ${isInputFocused ? 'hidden md:flex' : 'flex'}`}>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{translate('TOPIC_LABEL', outputLanguage)}</span>
              <select 
                value={selectedTopic}
                onChange={(e) => setSelectedTopic(e.target.value)}
                className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold outline-none focus:ring-1 focus:ring-blue-500 shadow-sm"
              >
                <option value="TOPIC_FILM_REVIEW">{translate('TOPIC_FILM_REVIEW', outputLanguage)}</option>
                <option value="TOPIC_STORYTELLING">{translate('TOPIC_STORYTELLING', outputLanguage)}</option>
                <option value="TOPIC_DOCUMENTARY">{translate('TOPIC_DOCUMENTARY', outputLanguage)}</option>
                <option value="TOPIC_TIN_TUC">{translate('TOPIC_TIN_TUC', outputLanguage)}</option>
                <option value="TOPIC_DIEN_ANH">{translate('TOPIC_DIEN_ANH', outputLanguage)}</option>
                <option value="TOPIC_TIKTOK">{translate('TOPIC_TIKTOK', outputLanguage)}</option>
                <option value="TOPIC_LIVESTREAM">{translate('TOPIC_LIVESTREAM', outputLanguage)}</option>
                <option value="TOPIC_SALES_REVIEW">{translate('TOPIC_SALES_REVIEW', outputLanguage)}</option>
                <option value="TOPIC_EDUCATION">{translate('TOPIC_EDUCATION', outputLanguage)}</option>
                <option value="TOPIC_DIY">{translate('TOPIC_DIY', outputLanguage)}</option>
              </select>
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-4">{translate('OUTPUT_LANG_LABEL', outputLanguage)}</span>
              <select 
                value={targetLang}
                onChange={(e) => setTargetLang(e.target.value as 'VN' | 'EN')}
                className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold outline-none focus:ring-1 focus:ring-blue-500 shadow-sm"
              >
                <option value="VN">{translate('LANG_VIETNAMESE', outputLanguage)}</option>
                <option value="EN">{translate('LANG_ENGLISH_US', outputLanguage)}</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={generateText}
                disabled={isGeneratingText}
                className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition shadow-lg active:scale-95 disabled:opacity-50"
              >
                {isGeneratingText ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                {translate('GENERATE_TEXT', outputLanguage)}
              </button>
            </div>
          </div>

          <div className="flex-1 bg-white border border-slate-200 rounded-3xl overflow-hidden flex flex-col shadow-inner">
            <div className="bg-slate-50 px-4 py-2 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button 
                  onClick={toggleSelectAll}
                  className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase hover:text-blue-600 transition"
                >
                  {generatedTextBlocks.every(b => b.selected) ? <CheckSquare size={14} /> : <Square size={14} />}
                  {translate('SELECT_ALL_TEXT', outputLanguage)}
                </button>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => handleCopyText(generatedTextBlocks.map(b => b.text).join('\n\n'))}
                  className="p-1.5 text-slate-400 hover:text-blue-600 transition"
                >
                  <Copy size={16} />
                </button>
                <button 
                  onClick={() => setGeneratedTextBlocks([])}
                  className="p-1.5 text-slate-400 hover:text-red-500 transition mr-1"
                  title={translate('CLEAR_ALL', outputLanguage)}
                >
                  <RotateCcw size={16} />
                </button>
                <button 
                  onClick={addManualBlock}
                  className="p-1.5 text-slate-400 hover:text-emerald-500 transition"
                  title={translate('ADD_BLOCK', outputLanguage)}
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
              {generatedTextBlocks.length === 0 && !isGeneratingText && (
                <button 
                  onClick={addManualBlock}
                  className="h-full w-full flex flex-col items-center justify-center text-slate-300 gap-4 hover:bg-slate-50 transition group cursor-text"
                >
                  <Pencil size={48} className="opacity-20 group-hover:opacity-40 group-hover:scale-110 transition" />
                  <div className="text-center">
                    <p className="text-xs font-black uppercase tracking-[0.2em] group-hover:text-blue-500 transition mb-1">{translate('WAITING_COMMAND', outputLanguage)}</p>
                    <p className="text-[10px] font-bold text-slate-400 group-hover:text-blue-400 transition">{translate('MANUAL_EDIT_HINT', outputLanguage)}</p>
                  </div>
                </button>
              )}
              {isGeneratingText && (
                <div className="h-full flex flex-col items-center justify-center gap-4">
                  <Loader2 size={32} className="animate-spin text-blue-600" />
                  <p className="text-xs font-black text-slate-500 uppercase tracking-widest animate-pulse">{translate('STATUS_GENERATING_TEXT', outputLanguage)}</p>
                </div>
              )}
              {generatedTextBlocks.map((block) => (
                <div 
                  key={block.id} 
                  className={`p-4 rounded-2xl border transition-all relative group cursor-pointer ${block.selected ? 'bg-indigo-50/50 border-indigo-200 shadow-sm' : 'bg-white border-slate-100 opacity-60'}`}
                  onClick={() => (!editingBlockId || editingBlockId !== block.id) && toggleSelectBlock(block.id)}
                >
                  <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {editingBlockId === block.id ? (
                      <>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            saveEditBlock(block.id);
                          }}
                          className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                        >
                          <Save size={14} />
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            cancelEditBlock();
                          }}
                          className="p-1.5 text-slate-400 hover:bg-slate-50 rounded-lg transition"
                        >
                          <X size={14} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            startEditingBlock(block);
                          }}
                          className="p-1.5 text-indigo-400 hover:text-indigo-600 transition"
                        >
                          <Pencil size={14} />
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            removeGeneratedBlock(block.id);
                          }}
                          className="p-1.5 text-slate-300 hover:text-red-500 transition"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="mt-1">
                      {block.selected ? <CheckSquare size={16} className="text-indigo-600" /> : <Square size={16} className="text-slate-300" />}
                    </div>
                    {editingBlockId === block.id ? (
                      <textarea
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        className="flex-1 bg-white border border-blue-200 rounded-xl p-2 text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none min-h-[80px] resize-none"
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <p className="text-sm font-medium text-slate-700 leading-relaxed whitespace-pre-wrap">{block.text}</p>
                    )}
                  </div>
                  <div className="mt-2 flex justify-end">
                    <span className={`text-[10px] font-serif font-black uppercase ${
                      (() => {
                        const count = block.text.split(/\s+/).filter(Boolean).length;
                        const min = targetLang === 'VN' ? 27 : 32;
                        const max = targetLang === 'VN' ? 31 : 36;
                        return (count >= min && count <= max) ? 'text-emerald-500' : 'text-slate-400';
                      })()
                    }`}>
                      {translate('WORD_COUNT', outputLanguage, { count: block.text.split(/\s+/).filter(Boolean).length })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Voice Generation Controls */}
          <div className={`bg-white border border-slate-200 rounded-3xl p-4 shadow-lg space-y-4 ${isInputFocused ? 'hidden md:block' : 'block'}`}>
            <div className="flex items-center justify-between">
              <button 
                onClick={() => setShowVoiceSettings(!showVoiceSettings)}
                className="flex items-center gap-2 text-[10px] font-serif font-black text-slate-500 uppercase tracking-widest hover:text-blue-600 transition"
              >
                <Settings2 size={14} />
                {translate('VOICE_SETTINGS', outputLanguage)}
              </button>
              <button 
                onClick={generateVoice}
                disabled={isGeneratingVoice || generatedTextBlocks.filter(b => b.selected).length === 0}
                className="flex items-center gap-2 px-6 py-2.5 bg-red-600 text-white rounded-xl text-[10px] font-serif font-black uppercase tracking-widest hover:bg-red-700 transition shadow-lg active:scale-95 disabled:opacity-50"
              >
                {isGeneratingVoice ? <Loader2 size={14} className="animate-spin" /> : <Volume2 size={14} />}
                {translate('GENERATE_VOICE', outputLanguage)}
              </button>
            </div>

            {showVoiceSettings && (
              <div className="grid grid-cols-4 gap-4 pt-2 border-t border-slate-100 animate-in slide-in-from-top-2 duration-200">
                <div className="space-y-1">
                  <label className="text-[10px] font-serif font-black text-slate-400 uppercase">{translate('LANGUAGE_LABEL', outputLanguage)}</label>
                  <select 
                    value={voiceLang}
                    onChange={(e) => setVoiceLang(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-lg px-2 py-1 text-[10px] font-bold outline-none"
                  >
                    <option value="vi-VN">Tiếng Việt</option>
                    <option value="en-US">English</option>
                    <option value="fr-FR">{translate('LANG_FRENCH', outputLanguage)}</option>
                    <option value="ru-RU">{translate('LANG_RUSSIAN', outputLanguage)}</option>
                    <option value="de-DE">{translate('LANG_GERMAN', outputLanguage)}</option>
                    <option value="zh-CN">{translate('LANG_CHINESE', outputLanguage)}</option>
                    <option value="id-ID">{translate('LANG_INDONESIAN', outputLanguage)}</option>
                    <option value="hi-IN">{translate('LANG_HINDI', outputLanguage)}</option>
                    <option value="th-TH">{translate('LANG_THAI', outputLanguage)}</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-serif font-black text-slate-400 uppercase">{translate('GENDER_LABEL', outputLanguage)}</label>
                  <select 
                    value={voiceGender}
                    onChange={(e) => setVoiceGender(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-lg px-2 py-1 text-[10px] font-bold outline-none"
                  >
                    <option value="FEMALE">{translate('FEMALE_VOICE', outputLanguage)}</option>
                    <option value="MALE">{translate('MALE_VOICE', outputLanguage)}</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-serif font-black text-slate-400 uppercase">{translate('QUALITY_LABEL', outputLanguage)}</label>
                  <select 
                    value={voiceQuality}
                    onChange={(e) => setVoiceQuality(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-lg px-2 py-1 text-[10px] font-bold outline-none"
                  >
                    <option value="QUALITY_YOUTHFUL">{translate('QUALITY_YOUTHFUL', outputLanguage)}</option>
                    <option value="QUALITY_MIDDLE_AGED">{translate('QUALITY_MIDDLE_AGED', outputLanguage)}</option>
                    <option value="QUALITY_POWERFUL">{translate('QUALITY_POWERFUL', outputLanguage)}</option>
                    <option value="QUALITY_GENTLE">{translate('QUALITY_GENTLE', outputLanguage)}</option>
                    <option value="QUALITY_WARM">{translate('QUALITY_WARM', outputLanguage)}</option>
                    <option value="QUALITY_CHARMING">{translate('QUALITY_CHARMING', outputLanguage)}</option>
                    <option value="QUALITY_ENERGETIC">{translate('QUALITY_ENERGETIC', outputLanguage)}</option>
                    <option value="QUALITY_DEEP_WARM">{translate('QUALITY_DEEP_WARM', outputLanguage)}</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-serif font-black text-slate-400 uppercase">{translate('STYLE_LABEL', outputLanguage)}</label>
                  <select 
                    value={voiceStyle}
                    onChange={(e) => setVoiceStyle(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-lg px-2 py-1 text-[10px] font-bold outline-none"
                  >
                    <option value="STYLE_NATURAL">{translate('STYLE_NATURAL', outputLanguage)}</option>
                    <option value="STYLE_EMOTIONAL">{translate('STYLE_EMOTIONAL', outputLanguage)}</option>
                    <option value="STYLE_NARRATION">{translate('STYLE_NARRATION', outputLanguage)}</option>
                    <option value="STYLE_SALES">{translate('STYLE_SALES', outputLanguage)}</option>
                    <option value="STYLE_PODCAST">{translate('STYLE_PODCAST', outputLanguage)}</option>
                  </select>
                </div>
              </div>
            )}

            {(isGeneratingVoice || progress > 0) && (
                <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest animate-pulse">{statusMessage}</span>
                  <span className="text-[9px] font-black text-indigo-600">{Math.round(progress)}%</span>
                </div>
                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-indigo-600 transition-all duration-300" 
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {showErrorHint && (
              <div className="p-3 bg-red-50 border border-red-100 rounded-2xl">
                <p className="text-[10px] font-bold text-red-600 italic">
                  {translate('VOICE_GEN_ERROR_HINT', outputLanguage)}
                </p>
              </div>
            )}

            {audioUrl && (
              <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-2xl border border-slate-100 animate-in fade-in duration-500">
                <audio ref={audioRef} controls src={audioUrl} className="flex-1 h-8" />
                <a 
                  href={audioUrl} 
                  download="generated_voice.mp3"
                  className="p-2 bg-white text-indigo-600 rounded-xl border border-indigo-100 shadow-sm hover:bg-indigo-50 transition active:scale-95"
                >
                  <Download size={16} />
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
