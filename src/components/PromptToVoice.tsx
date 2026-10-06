import React, { useState } from 'react';
import { Plus, Trash2, Play, Download, Copy, RotateCcw, CheckSquare, Square, Settings2, Loader2, Volume2, Pencil, Save, X, Mic } from 'lucide-react';
import { translate } from '../i18n';
import { UserProfile } from '../types';
import { supabase, isSupabaseDisabled } from '../supabaseClient';
import { generateGeminiText, generateGeminiVoice } from '../services/gemini';
import { playSilenceWarning, formatVoiceTranscript } from '../utils/voiceFeedback';

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

// ================================================================
// SUB-COMPONENT 1: PromptBlockItem (Tách biệt để tăng tốc độ gõ phím)
// ================================================================
interface PromptBlockItemProps {
  prompt: PromptBlock;
  totalPrompts: number;
  outputLanguage: 'EN' | 'VN';
  recordingPromptId: string | null;
  setIsInputFocused: (focused: boolean) => void;
  updatePrompt: (id: string, text: string) => void;
  removePrompt: (id: string) => void;
  toggleSpeechToText: (id: string) => void;
}

const PromptBlockItem: React.FC<PromptBlockItemProps> = React.memo(({
  prompt,
  totalPrompts,
  outputLanguage,
  recordingPromptId,
  setIsInputFocused,
  updatePrompt,
  removePrompt,
  toggleSpeechToText
}) => {
  const wordCount = prompt.text.split(/\s+/).filter(Boolean).length;
  
  return (
    <div className="relative group">
      <textarea
        onFocus={() => setIsInputFocused(true)}
        onBlur={() => setIsInputFocused(false)}
        value={prompt.text}
        onChange={(e) => updatePrompt(prompt.id, e.target.value)}
        placeholder={translate('WAITING_COMMAND', outputLanguage)}
        className="w-full h-64 bg-white border border-slate-200 rounded-2xl p-4 pr-14 text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none transition shadow-sm resize-none"
      />
      <div className="absolute top-4 right-4 flex flex-col gap-2">
        <button
          onClick={() => toggleSpeechToText(prompt.id)}
          className={`p-2.5 rounded-xl border transition shadow-sm active:scale-95 flex items-center justify-center ${
            recordingPromptId === prompt.id
              ? 'bg-red-50 border-red-200 text-red-600 animate-pulse'
              : 'bg-slate-50 border-slate-100 text-slate-500 hover:bg-blue-50 hover:text-blue-600'
          }`}
          title={outputLanguage === 'VN' ? 'Nhận diện giọng nói (Micro)' : 'Voice Dictation (Microphone)'}
        >
          {recordingPromptId === prompt.id ? (
            <div className="relative flex items-center justify-center">
              <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-red-400 opacity-75"></span>
              <Mic size={16} className="relative text-red-600" />
            </div>
          ) : (
            <Mic size={16} />
          )}
        </button>
      </div>
      <div className="absolute bottom-4 right-4 flex items-center gap-3">
        <span className={`text-[10px] font-black uppercase ${wordCount > 5000 ? 'text-red-500' : 'text-slate-400'}`}>
          {translate('WORD_COUNT', outputLanguage, { count: wordCount })} / 5000
        </span>
        {totalPrompts > 1 && (
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
  );
});

// ================================================================
// SUB-COMPONENT 2: TextBlockItem (Tách biệt để tăng tốc độ soạn thảo kịch bản)
// ================================================================
interface TextBlockItemProps {
  block: TextBlock;
  outputLanguage: 'EN' | 'VN';
  targetLang: 'VN' | 'EN';
  editingBlockId: string | null;
  editingText: string;
  setEditingText: (text: string) => void;
  recordingEditingId: string | null;
  toggleSelectBlock: (id: string) => void;
  toggleSpeechToTextEditing: (id: string) => void;
  saveEditBlock: (id: string) => void;
  cancelEditBlock: () => void;
  startEditingBlock: (block: TextBlock) => void;
  removeGeneratedBlock: (id: string) => void;
}

const TextBlockItem: React.FC<TextBlockItemProps> = React.memo(({
  block,
  outputLanguage,
  targetLang,
  editingBlockId,
  editingText,
  setEditingText,
  recordingEditingId,
  toggleSelectBlock,
  toggleSpeechToTextEditing,
  saveEditBlock,
  cancelEditBlock,
  startEditingBlock,
  removeGeneratedBlock
}) => {
  const isEditing = editingBlockId === block.id;
  const wordCount = block.text.replace(/\([^)]*\)/g, '').trim().split(/\s+/).filter(Boolean).length;
  const min = targetLang === 'VN' ? 31 : (targetLang === 'EN' ? 21 : 24);
  const max = targetLang === 'VN' ? 31 : (targetLang === 'EN' ? 21 : 24);
  const isExactLength = wordCount >= min && wordCount <= max;

  return (
    <div 
      className={`p-4 rounded-2xl border transition-all relative group cursor-pointer ${block.selected ? 'bg-indigo-50/50 border-indigo-200 shadow-sm' : 'bg-white border-slate-100 opacity-60'}`}
      onClick={() => !isEditing && toggleSelectBlock(block.id)}
    >
      {!isEditing && (
        <div className="absolute top-2.5 right-2.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button 
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              startEditingBlock(block);
            }}
            className="p-1.5 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
            title="Chỉnh sửa văn bản"
          >
            <Pencil size={14} />
          </button>
          <button 
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              removeGeneratedBlock(block.id);
            }}
            className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
            title="Xóa đoạn này"
          >
            <Trash2 size={14} />
          </button>
        </div>
      )}
      <div className="flex items-start gap-3">
        <div className="mt-1">
          {block.selected ? <CheckSquare size={16} className="text-indigo-600" /> : <Square size={16} className="text-slate-300" />}
        </div>
        {isEditing ? (
          <div className="flex-1 space-y-2">
            <div className="relative">
              <textarea
                value={editingText}
                onChange={(e) => setEditingText(e.target.value)}
                className="w-full bg-white border-2 border-indigo-300 focus:border-indigo-500 rounded-xl p-3 pr-11 text-sm font-medium focus:ring-2 focus:ring-indigo-200 outline-none min-h-[96px] resize-y shadow-inner leading-relaxed"
                autoFocus
                placeholder="Nhập nội dung chỉnh sửa..."
                onClick={(e) => e.stopPropagation()}
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleSpeechToTextEditing(block.id);
                }}
                className={`absolute top-2.5 right-2.5 p-1.5 rounded-lg border transition shadow-sm active:scale-95 flex items-center justify-center ${
                  recordingEditingId === block.id
                    ? 'bg-red-50 border-red-300 text-red-600 animate-pulse ring-2 ring-red-200'
                    : 'bg-slate-50 border-slate-200 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50'
                }`}
                title="Đọc văn bản chỉnh sửa (Micro)"
              >
                {recordingEditingId === block.id ? (
                  <div className="relative flex items-center justify-center">
                    <span className="animate-ping absolute inline-flex h-2.5 w-2.5 rounded-full bg-red-400 opacity-75"></span>
                    <Mic size={14} className="relative text-red-600" />
                  </div>
                ) : (
                  <Mic size={14} />
                )}
              </button>
            </div>

            {/* Thanh công cụ Lưu và Hủy đặt riêng biệt, tuyệt đối không bị Micro che khuất */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-slate-400 font-medium">
                {recordingEditingId === block.id ? (
                  <span className="text-red-500 font-bold animate-pulse flex items-center gap-1">
                    ● Micro đang lắng nghe giọng đọc...
                  </span>
                ) : (
                  <span>Có thể bấm Micro để nói thêm hoặc sửa tay</span>
                )}
              </span>
              <div className="flex items-center gap-2">
                <button 
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    cancelEditBlock();
                  }}
                  className="px-3 py-1.5 text-xs font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-lg transition flex items-center gap-1"
                >
                  <X size={13} />
                  <span>Hủy</span>
                </button>
                <button 
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    saveEditBlock(block.id);
                  }}
                  className="px-3.5 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 shadow-sm rounded-lg transition flex items-center gap-1.5"
                >
                  <Save size={13} />
                  <span>Lưu</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm font-medium text-slate-700 leading-relaxed whitespace-pre-wrap">{block.text}</p>
        )}
      </div>
      <div className="mt-2 flex justify-end">
        <span className={`text-[10px] font-serif font-black uppercase ${isExactLength ? 'text-emerald-500 font-bold' : 'text-slate-400'}`}>
          {translate('WORD_COUNT', outputLanguage, { count: wordCount })}
        </span>
      </div>
    </div>
  );
});

// ================================================================
// MAIN COMPONENT: PromptToVoice
// ================================================================
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
  const [showVoiceGuide, setShowVoiceGuide] = useState(false);
  const [showErrorHint, setShowErrorHint] = useState(false);

  const [recordingPromptId, setRecordingPromptId] = useState<string | null>(null);
  const recognitionRef = React.useRef<any>(null);
  const silenceTimeoutRef = React.useRef<any>(null);

  // Clean up recording listeners on unmount
  React.useEffect(() => {
    return () => {
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          console.warn("Unmount cleanup failed:", e);
        }
      }
    };
  }, []);

  const stopRecording = (speakWarning: boolean = false) => {
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
    
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        console.warn(e);
      }
      recognitionRef.current = null;
    }
    
    setRecordingPromptId(null);

    if (speakWarning) {
      playSilenceWarning(outputLanguage);
    }
  };

  const toggleSpeechToText = (promptId: string) => {
    if (recordingPromptId === promptId) {
      stopRecording(false);
      return;
    }

    if (recordingPromptId) {
      stopRecording(false);
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert(outputLanguage === 'VN' 
        ? "Trình duyệt của bạn không hỗ trợ nhận diện giọng nói. Hãy dùng Chrome hoặc Safari." 
        : "Your browser does not support Speech Recognition. Please use Chrome or Safari.");
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = voiceLang;
      recognition.continuous = true;
      recognition.interimResults = false;

      recognition.onstart = () => {
        setRecordingPromptId(promptId);
        
        if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = setTimeout(() => {
          stopRecording(true);
        }, 7000); // 7 seconds of absolute silence timeout
      };

      recognition.onresult = (event: any) => {
        if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = setTimeout(() => {
          stopRecording(true);
        }, 7000);

        const lastResultIndex = event.results.length - 1;
        const transcript = event.results[lastResultIndex][0].transcript || '';
        
        if (transcript.trim()) {
          const formattedText = formatVoiceTranscript(transcript);

          setPrompts(prevPrompts => 
            prevPrompts.map(p => {
              if (p.id === promptId) {
                const currentText = p.text.trim();
                const separator = currentText ? '\n' : '';
                return { ...p, text: currentText + separator + formattedText };
              }
              return p;
            })
          );
        }
      };

      recognition.onerror = (event: any) => {
        console.error("Speech recognition error:", event.error);
        if (event.error === 'no-speech') {
          stopRecording(true);
        } else {
          stopRecording(false);
        }
      };

      recognition.onend = () => {
        setRecordingPromptId(null);
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current);
          silenceTimeoutRef.current = null;
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error("Failed to start Speech Recognition:", err);
      setRecordingPromptId(null);
    }
  };

  const [recordingEditingId, setRecordingEditingId] = useState<string | null>(null);

  const stopRecordingEditing = (speakWarning: boolean = false) => {
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
    
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        console.warn(e);
      }
      recognitionRef.current = null;
    }
    
    setRecordingEditingId(null);

    if (speakWarning) {
      playSilenceWarning(outputLanguage);
    }
  };

  const toggleSpeechToTextEditing = (blockId: string) => {
    if (recordingEditingId === blockId) {
      stopRecordingEditing(false);
      return;
    }

    if (recordingEditingId) {
      stopRecordingEditing(false);
    }
    if (recordingPromptId) {
      stopRecording(false);
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert(outputLanguage === 'VN' 
        ? "Trình duyệt của bạn không hỗ trợ nhận diện giọng nói. Hãy dùng Chrome hoặc Safari." 
        : "Your browser does not support Speech Recognition. Please use Chrome or Safari.");
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = voiceLang;
      recognition.continuous = true;
      recognition.interimResults = false;

      recognition.onstart = () => {
        setRecordingEditingId(blockId);
        
        if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = setTimeout(() => {
          stopRecordingEditing(true);
        }, 7000); // 7 seconds timeout
      };

      recognition.onresult = (event: any) => {
        if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = setTimeout(() => {
          stopRecordingEditing(true);
        }, 7000);

        const lastResultIndex = event.results.length - 1;
        const transcript = event.results[lastResultIndex][0].transcript || '';
        
        if (transcript.trim()) {
          const formattedText = formatVoiceTranscript(transcript);

          setEditingText(prev => {
            const currentText = prev.trim();
            const separator = currentText ? ' ' : '';
            return currentText + separator + formattedText;
          });
        }
      };

      recognition.onerror = (event: any) => {
        console.error("Speech recognition error:", event.error);
        if (event.error === 'no-speech') {
          stopRecordingEditing(true);
        } else {
          stopRecordingEditing(false);
        }
      };

      recognition.onend = () => {
        setRecordingEditingId(null);
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current);
          silenceTimeoutRef.current = null;
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error("Failed to start Speech Recognition:", err);
      setRecordingEditingId(null);
    }
  };

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
    const allLines = prompts
      .map(p => p.text.trim())
      .filter(Boolean)
      .join('\n')
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);

    if (allLines.length === 0) return;
    
    // Giới hạn dùng thử
    const cleanEmail = profile.email?.trim().toLowerCase();
    if (userPlan === 'free' && !profile.isAdmin) {
      const usageKey = `veopro_usage_${cleanEmail}_${new Date().toISOString().split('T')[0]}`;
      const dailyUsage = Number(localStorage.getItem(usageKey) || 0);
      if (dailyUsage >= 10) {
        alert(`Giới hạn dùng thử hàng ngày đã hết. Vui lòng nâng cấp gói Pro để tiếp tục.\n\nDaily limit reached. Please upgrade to Pro.`);
        return;
      }
      localStorage.setItem(usageKey, (dailyUsage + 1).toString());
    }

    // Kiểm tra xu trước khi sinh văn bản
    const isPro = (userPlan === 'pro' || userPlan === 'pro1' || profile.isAdmin);
    if (!isPro && credit < 1 && !profile.isAdmin) {
      alert(translate('UPGRADE_PRO_MESSAGE', outputLanguage));
      return;
    }

    setIsGeneratingText(true);
    setStatusMessage(translate('STATUS_GENERATING_TEXT', outputLanguage));
    setGeneratedTextBlocks([]);
    
    try {
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
      const targetMax = targetLang === 'VN' ? 31 : (targetLang === 'EN' ? 21 : 24);
      const targetLangName = targetLang === 'VN' ? 'Tiếng Việt' : 'English';
      
      const systemInstruction = targetLang === 'VN' ? 
        `Bạn là một chuyên gia biên tập kịch bản video ngắn (8 giây).
        Nhiệm vụ: Chuyển đổi lời nhắc (prompt) thành văn bản đọc thoại (voiceover) hấp dẫn bằng ${targetLangName}.
        
        QUY TẮC BẮT BUỘC TUYỆT ĐỐI:
        1. Mỗi câu thoại bạn tạo ra phải có độ dài CHÍNH XÁC ĐÚNG 31 từ (không ít hơn, không nhiều hơn). Bạn BẮT BUỘC phải tự đếm thật kỹ số từ để đúng 31 từ trước khi trả về kết quả.
        2. Mỗi câu thoại phải được diễn đạt súc tích, nhịp điệu vừa phải để khi đọc thoại chuẩn đạt thời lượng tối thiểu 7.0 đến 8.0 giây.
        3. Nếu trong lời nhắc có văn bản nằm trong ngoặc kép "", hãy sử dụng nội dung đó làm trung tâm và mở rộng thêm mô tả bối cảnh hoặc cảm xúc để đạt đúng 31 từ yêu cầu.
        4. Văn phong: Điện ảnh, giàu cảm xúc, tự nhiên cho giọng đọc AI.
        5. Loại bỏ hoàn toàn các thuật ngữ kỹ thuật quay phim (góc máy, cú cắt...).
        6. Thêm hướng dẫn nhạc nền/không khí trong ngoặc đơn ( ) ở ĐẦU đoạn văn (Ví dụ: (Nhạc nền kịch tính khởi đầu)). Ký tự trong ngoặc đơn này không tính vào giới hạn 31 từ thoại.
        7. Chỉ trả về duy nhất đoạn văn bản thoại kịch bản, không kèm lời dẫn hay giải thích.` :
        
        `You are a professional short-video script editor (8 seconds).
        Task: Convert the prompt into a compelling voiceover text.
        
        STRICT MANDATORY RULES:
        1. Each segment must have a duration of 7.0 to 8.0 seconds of natural speech.
        2. Mandatory Length: EXACTLY ${targetMax} words (no more, no less). You must count the words carefully to ensure it is exactly ${targetMax} words.
        3. If the prompt contains text in double quotes "", use that content as the core and expand with descriptive atmosphere or emotion to reach the exact word count of ${targetMax} words.
        4. Style: Cinematic, emotional, and natural for AI voices.
        5. Remove all filmmaking technical terms (camera angles, cuts, etc.).
        6. Add background music/atmosphere instructions in parentheses ( ) at the START of the paragraph (e.g., (Mysterious ambient music begins)). Parentheses contents are not counted in the word limit.
        7. Return ONLY the script content, no introductions or explanations.`;

      // Tạo kịch bản cho từng dòng nhập vào
      for (let i = 0; i < allLines.length; i++) {
        const line = allLines[i];
        const successLine = await deductCredit(1);
        if (!successLine) break;

        const text = await generateGeminiText(line, systemInstruction, finalApiKeys, targetLang, finalUseProjectKey);
        newBlocks.push({
          id: `gen-${i}-${Date.now()}`,
          text: text,
          selected: true
        });
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

    // Giới hạn dùng thử thoại cho free user
    const cleanEmail = profile.email?.trim().toLowerCase();
    if (userPlan === 'free' && !profile.isAdmin) {
      const usageKey = `veopro_usage_${cleanEmail}_${new Date().toISOString().split('T')[0]}_voice`;
      const dailyUsage = Number(localStorage.getItem(usageKey) || 0);
      if (dailyUsage >= 5) {
        alert(`Giới hạn dùng thử giọng đọc đã hết. Vui lòng nâng cấp gói Pro.\n\nDaily voice limit reached.`);
        return;
      }
      localStorage.setItem(usageKey, (dailyUsage + 1).toString());
    }

    // Kiểm tra xu
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
      const success = await deductCredit(1, 'VOICE');
      if (!success) {
        setIsGeneratingVoice(false);
        return;
      }

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

      const selectedBlocks = generatedTextBlocks.filter(b => b.selected);
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

      const binaryString = atob(base64Audio);
      const mergedPcm = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        mergedPcm[i] = binaryString.charCodeAt(i);
      }

      const wavData = addWavHeader(mergedPcm, 24000);
      const combinedBlob = new Blob([wavData], { type: 'audio/wav' });
      const url = URL.createObjectURL(combinedBlob);
      setAudioUrl(url);
      
      if (!isSupabaseDisabled) {
        await supabase.from('voice_generations').insert([{
          user_email: profile.email,
          text: combinedText.substring(0, 1000),
          audio_url: url,
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

    view.setUint32(0, 0x52494646, false); // "RIFF"
    view.setUint32(4, 36 + pcmData.length, true);
    view.setUint32(8, 0x57415645, false); // "WAVE"
    view.setUint32(12, 0x666d7420, false); // "fmt "
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    view.setUint32(36, 0x64617461, false); // "data"
    view.setUint32(40, pcmData.length, true);

    const wav = new Uint8Array(header.byteLength + pcmData.length);
    wav.set(new Uint8Array(header), 0);
    wav.set(pcmData, header.byteLength);
    return wav;
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden relative">
       {/* Hướng xoay màn hình điện thoại */}
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

      {/* Header */}
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
        {/* Cột trái: Soạn Lời Nhắc / Prompts */}
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

          {/* Hướng dẫn khẩu lệnh & Thẻ chuyển giọng: Gọn 1 dòng tinh tế, bấm mở/đóng, tự động ẩn khi văn bản kịch bản đã tạo để tránh rối giao diện */}
          {generatedTextBlocks.length === 0 && (
            <div className={`border border-blue-100 rounded-2xl bg-gradient-to-r from-blue-50/70 to-indigo-50/70 overflow-hidden transition-all shadow-xs ${isInputFocused ? 'hidden md:block' : 'block'}`}>
              <button
                type="button"
                onClick={() => setShowVoiceGuide(!showVoiceGuide)}
                className="w-full px-3.5 py-2 flex items-center justify-between text-left text-blue-900 hover:bg-blue-100/40 transition cursor-pointer"
              >
                <div className="flex items-center gap-2 text-[11px] font-bold">
                  <span className="text-sm">💡</span>
                  <span className="truncate">
                    {outputLanguage === 'VN' 
                      ? 'Mẹo Micro: Nói "đây là giọng nam/nữ" tự điền thẻ [Giọng Nam]/[Giọng Nữ] (đầu hoặc cuối câu)' 
                      : 'Mic Tip: Say "voice male/female" to insert tags [Giọng Nam]/[Giọng Nữ]'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[9.5px] font-bold text-blue-700 bg-white/90 px-2 py-0.5 rounded-lg border border-blue-200/80 shrink-0">
                  <span>{showVoiceGuide ? (outputLanguage === 'VN' ? 'Đóng lại' : 'Hide') : (outputLanguage === 'VN' ? 'Xem chi tiết' : 'View tips')}</span>
                  <span className="text-[8px]">{showVoiceGuide ? '▲' : '▼'}</span>
                </div>
              </button>

              {showVoiceGuide && (
                <div className="p-3.5 border-t border-blue-100/70 text-[11px] text-slate-700 space-y-2.5 bg-white/70 animate-in slide-in-from-top-1 duration-150">
                  <div className="space-y-1">
                    <p className="font-bold text-blue-950 text-[10px] uppercase tracking-wider flex items-center gap-1.5">
                      🎙️ CÁC CÂU LỆNH NÓI VÀO MICRO TỰ ĐỘNG CHUYỂN THÀNH THẺ:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
                      <div className="bg-white p-2.5 rounded-xl border border-slate-100 shadow-2xs space-y-1">
                        <span className="text-slate-500 font-medium">Khi bạn nói một trong các câu:</span>
                        <p className="font-mono text-blue-700 font-bold bg-blue-50/60 p-1 rounded">"đây là giọng nam" / "thêm giọng nam" / "đóng vai giọng nam" / "giọng nam"</p>
                        <p className="text-emerald-700 font-bold text-[9.5px]">➔ Tự động chèn thẻ: <span className="bg-blue-100 text-blue-800 px-1 py-0.5 rounded">[Giọng Nam]</span></p>
                      </div>
                      <div className="bg-white p-2.5 rounded-xl border border-slate-100 shadow-2xs space-y-1">
                        <span className="text-slate-500 font-medium">Khi bạn nói một trong các câu:</span>
                        <p className="font-mono text-pink-700 font-bold bg-pink-50/60 p-1 rounded">"đây là giọng nữ" / "thêm giọng nữ" / "đóng vai giọng nữ" / "giọng nữ"</p>
                        <p className="text-emerald-700 font-bold text-[9.5px]">➔ Tự động chèn thẻ: <span className="bg-pink-100 text-pink-800 px-1 py-0.5 rounded">[Giọng Nữ]</span></p>
                      </div>
                    </div>
                  </div>

                  <div className="pt-1.5 border-t border-blue-100/60 space-y-1">
                    <p className="text-[10px] text-slate-600">
                      <span className="font-bold text-slate-800">Hỗ trợ linh hoạt CẢ 2 CÁCH ĐẶT THẺ:</span>
                    </p>
                    <p className="text-[9.5px] text-slate-600 font-mono bg-white p-1.5 rounded border border-slate-200">
                      • Đặt cuối câu: <span className="text-indigo-600">Câu thoại 1 [giọng nam]. Câu thoại 2 [giọng nữ].</span><br />
                      • Đặt đầu câu: <span className="text-indigo-600">[Giọng Nam] Câu thoại 1... [Giọng Nữ] Câu thoại 2...</span>
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {prompts.map((prompt) => (
            <PromptBlockItem
              key={prompt.id}
              prompt={prompt}
              totalPrompts={prompts.length}
              outputLanguage={outputLanguage}
              recordingPromptId={recordingPromptId}
              setIsInputFocused={setIsInputFocused}
              updatePrompt={updatePrompt}
              removePrompt={removePrompt}
              toggleSpeechToText={toggleSpeechToText}
            />
          ))}
        </div>

        {/* Cột phải: Kịch bản Đọc thoại & Cài đặt Giọng đọc */}
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
                <TextBlockItem
                  key={block.id}
                  block={block}
                  outputLanguage={outputLanguage}
                  targetLang={targetLang}
                  editingBlockId={editingBlockId}
                  editingText={editingText}
                  setEditingText={setEditingText}
                  recordingEditingId={recordingEditingId}
                  toggleSelectBlock={toggleSelectBlock}
                  toggleSpeechToTextEditing={toggleSpeechToTextEditing}
                  saveEditBlock={saveEditBlock}
                  cancelEditBlock={cancelEditBlock}
                  startEditingBlock={startEditingBlock}
                  removeGeneratedBlock={removeGeneratedBlock}
                />
              ))}
            </div>
          </div>

          {/* Cài đặt Giọng đọc & Trình phát */}
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
                <div className="col-span-2 space-y-1">
                  <label className="text-[10px] font-serif font-black text-slate-400 uppercase">Nhân vật & Giới tính Giọng đọc chính</label>
                  <select 
                    value={`${voiceGender}:${voiceQuality}`}
                    onChange={(e) => {
                      const [gender, quality] = e.target.value.split(':');
                      setVoiceGender(gender as any);
                      setVoiceQuality(quality);
                    }}
                    className="w-full bg-slate-50 border border-slate-100 rounded-lg px-2 py-1 text-[10px] font-bold outline-none"
                  >
                    <optgroup label="GIỌNG NỮ (FEMALE PERSONAS)">
                      <option value="FEMALE:QUALITY_YOUTHFUL">Nữ A: Trong trẻo, Điện ảnh (Gió nhẹ / Zephyr)</option>
                      <option value="FEMALE:QUALITY_POWERFUL">Nữ B: Sang trọng, Cuốn hút (Aoede)</option>
                      <option value="FEMALE:QUALITY_GENTLE">Nữ C: Dịu dàng, Tâm sự (Kore)</option>
                    </optgroup>
                    <optgroup label="GIỌNG NAM (MALE PERSONAS)">
                      <option value="MALE:QUALITY_POWERFUL">Nam A: Chuẩn Miền Bắc, Trầm ấm uy quyền (Charon)</option>
                      <option value="MALE:QUALITY_YOUTHFUL">Nam B: Trẻ trung, Năng nổ (Puck)</option>
                      <option value="MALE:QUALITY_GENTLE">Nam C: Điềm đạm, Thuyết minh (Orus)</option>
                    </optgroup>
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
