import React, { useState, useRef, useEffect } from 'react';
import { BatchResult } from '@/types';
import { VideoMode } from '@/enums';
import { ToolMode, FILM_GENRES, FILM_STYLES } from './types.video';
import { translate } from '../../i18n';
import { EngineSelector } from '../EngineSelector';
import { Mic } from 'lucide-react';
import { playSilenceWarning, formatVoiceTranscript } from '../../utils/voiceFeedback';

interface ScenePanelProps {
  mode: VideoMode;
  setMode: (mode: VideoMode) => void;
  toolMode: ToolMode;
  setToolMode: (mode: ToolMode) => void;
  outputLanguage: 'VN' | 'EN';
  currentPromptText: string;
  updatePromptForMode: (text: string) => void;
  selectedPrompts: Set<number>;
  toggleSelectPrompt: (index: number) => void;
  handleSelectAllPrompts: () => void;
  handleDeleteSelectedPrompts: () => void;
  handleCopySelectedPrompts: () => void;
  batchResults: BatchResult[];
  setBatchResults: React.Dispatch<React.SetStateAction<BatchResult[]>>;
  handleRegenerateSelectedBatchImages: () => void;
  handleDownloadBatchZip: () => void;
  isGenerating: boolean;
  onOpenKeyPicker: () => void;
  characterPrompts: string;
  setCharacterPrompts: (text: string) => void;
  scenePrompts: string;
  setScenePrompts: (text: string) => void;
  refImage: string | null;
  setRefImage: (url: string | null) => void;
  handleRefImageChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  selectedStyle: any;
  setSelectedStyle: (style: any) => void;
  editingBatchIdx: number | null;
  setEditingBatchIdx: (idx: number | null) => void;
  editingBatchPrompt: string;
  setEditingBatchPrompt: (text: string) => void;
  handleBatchImageGen: () => void;
  generatingTool: ToolMode | 'BATCH' | null;
  storyCount: number;
  setStoryCount: (count: number) => void;
  linkTopic: string;
  setLinkTopic: (topic: string) => void;
  maleCount: number;
  setMaleCount: (count: number) => void;
  femaleCount: number;
  setFemaleCount: (count: number) => void;
  selectedGenre: any;
  setSelectedGenre: (genre: any) => void;
  directorForm: any;
  setDirectorForm: (form: any) => void;
  seamlessForm: any;
  setSeamlessForm: (form: any) => void;
  directorScript: string;
  analyzedScript: string;
  seamlessScript: string;
  setDirectorScript: (script: string) => void;
  setAnalyzedScript: (script: string) => void;
  setSeamlessScript: (script: string) => void;
  handleToolGenerate: (tMode: ToolMode) => void;
  concurrentRenderCount: number;
  setConcurrentRenderCount: (count: number) => void;
  concurrentPrompts: string[];
  setConcurrentPrompts: (prompts: string[]) => void;
  currentImages: { url: string; name: string }[];
  setModeImages: React.Dispatch<React.SetStateAction<Record<VideoMode, { url: string; name: string }[]>>>;
  specificSlotRef: React.MutableRefObject<{ index: number; subIndex?: number } | null>;
  fileInputRef: React.RefObject<HTMLInputElement>;
  refImageInputRef: React.RefObject<HTMLInputElement>;
  downloadImageFile: (url: string, name: string) => void;
  setOutputLanguage: (lang: 'VN' | 'EN') => void;
  toolPromptCount: string;
  setToolPromptCount: (count: string) => void;
  selectedEngine: string;
  setSelectedEngine: (engine: string) => void;
  wavespeedApiKey: string;
  setWavespeedApiKey: (key: string) => void;
}

export const ScenePanel: React.FC<ScenePanelProps> = (props) => {
  const {
    mode, setMode, toolMode, setToolMode, outputLanguage, currentPromptText,
    updatePromptForMode, selectedPrompts, toggleSelectPrompt, handleSelectAllPrompts,
    handleDeleteSelectedPrompts, handleCopySelectedPrompts, batchResults, setBatchResults,
    handleRegenerateSelectedBatchImages, handleDownloadBatchZip, isGenerating, onOpenKeyPicker,
    characterPrompts, setCharacterPrompts, scenePrompts, setScenePrompts,
    refImage, setRefImage, handleRefImageChange, selectedStyle, setSelectedStyle,
    setEditingBatchIdx, setEditingBatchPrompt,
    handleBatchImageGen, generatingTool, storyCount, setStoryCount, linkTopic, setLinkTopic,
    maleCount, setMaleCount, femaleCount, setFemaleCount, selectedGenre, setSelectedGenre,
    directorForm, setDirectorForm, seamlessForm, setSeamlessForm, directorScript,
    analyzedScript, seamlessScript, setDirectorScript, setAnalyzedScript, setSeamlessScript,
    handleToolGenerate, concurrentRenderCount, setConcurrentRenderCount,
    concurrentPrompts, setConcurrentPrompts, currentImages, setModeImages,
    specificSlotRef, fileInputRef, refImageInputRef, downloadImageFile,
    setOutputLanguage, toolPromptCount, setToolPromptCount,
    selectedEngine, setSelectedEngine, wavespeedApiKey, setWavespeedApiKey
  } = props;

  const [isRecordingLinkTopic, setIsRecordingLinkTopic] = useState(false);
  const linkTopicRecognitionRef = useRef<any>(null);
  const linkTopicSilenceTimeoutRef = useRef<any>(null);

  const stopLinkTopicRecording = (speakWarning: boolean = false) => {
    if (linkTopicSilenceTimeoutRef.current) {
      clearTimeout(linkTopicSilenceTimeoutRef.current);
      linkTopicSilenceTimeoutRef.current = null;
    }
    if (linkTopicRecognitionRef.current) {
      try { linkTopicRecognitionRef.current.stop(); } catch (err) { console.warn(err); }
      linkTopicRecognitionRef.current = null;
    }
    setIsRecordingLinkTopic(false);
    if (speakWarning) {
      playSilenceWarning(outputLanguage);
    }
  };

  const toggleLinkTopicSpeechToText = () => {
    if (isRecordingLinkTopic) {
      stopLinkTopicRecording(false);
      return;
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
      recognition.lang = outputLanguage === 'VN' ? 'vi-VN' : 'en-US';
      recognition.continuous = true;
      recognition.interimResults = false;

      recognition.onstart = () => {
        setIsRecordingLinkTopic(true);
        if (linkTopicSilenceTimeoutRef.current) clearTimeout(linkTopicSilenceTimeoutRef.current);
        linkTopicSilenceTimeoutRef.current = setTimeout(() => {
          stopLinkTopicRecording(true);
        }, 7000);
      };

      recognition.onresult = (event: any) => {
        if (linkTopicSilenceTimeoutRef.current) clearTimeout(linkTopicSilenceTimeoutRef.current);
        linkTopicSilenceTimeoutRef.current = setTimeout(() => {
          stopLinkTopicRecording(true);
        }, 7000);

        const lastResultIndex = event.results.length - 1;
        const transcript = event.results[lastResultIndex][0].transcript || '';
        if (transcript.trim()) {
          const formatted = formatVoiceTranscript(transcript);
          const current = (linkTopic || '').trim();
          const sep = current ? ' ' : '';
          setLinkTopic(current + sep + formatted);
        }
      };

      recognition.onerror = (event: any) => {
        if (event.error === 'no-speech') {
          stopLinkTopicRecording(true);
        } else {
          stopLinkTopicRecording(false);
        }
      };

      recognition.onend = () => {
        setIsRecordingLinkTopic(false);
        if (linkTopicSilenceTimeoutRef.current) {
          clearTimeout(linkTopicSilenceTimeoutRef.current);
          linkTopicSilenceTimeoutRef.current = null;
        }
      };

      linkTopicRecognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error("Failed to start Speech Recognition:", err);
      setIsRecordingLinkTopic(false);
    }
  };

  useEffect(() => {
    return () => {
      if (linkTopicSilenceTimeoutRef.current) clearTimeout(linkTopicSilenceTimeoutRef.current);
      if (linkTopicRecognitionRef.current) {
        try { linkTopicRecognitionRef.current.stop(); } catch (err) { console.warn(err); }
      }
    };
  }, []);

  const tabs = [
    { label: 'TEXT_TO_VIDEO', mode: 'TEXT_TO_VIDEO' as VideoMode },
    { label: 'CONSISTENCY', mode: 'CONSISTENCY' as VideoMode },
    { label: 'INTERPOLATION', mode: 'INTERPOLATION' as VideoMode },
    { label: 'IMAGE_TO_VIDEO', mode: 'IMAGE_TO_VIDEO' as VideoMode },
  ];

  const renderScriptView = (text: string, title: string, onDelete: () => void, isStoryDna: boolean = false) => (
    <div className="flex-1 bg-white p-2 sm:p-4 font-serif leading-relaxed text-slate-900 overflow-y-auto custom-scrollbar shadow-inner min-h-0 relative">
      <div className="sticky top-0 z-30 flex justify-between items-center mb-1 gap-1 bg-white/80 backdrop-blur-sm pb-1">
        <div className="flex gap-1">
          {isStoryDna ? (
            <select 
              value={selectedGenre.id} 
              onChange={(e) => setSelectedGenre(FILM_GENRES.find(g => g.id === e.target.value) || FILM_GENRES[0])} 
              className="bg-white border border-blue-100 rounded-md px-1.5 py-0.5 text-[8px] sm:text-[10px] font-serif font-black uppercase outline-none focus:border-blue-500 shadow-sm cursor-pointer"
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
            className="bg-blue-600 text-white px-1.5 py-0.5 rounded text-[8px] sm:text-[10px] font-black shadow-sm active:scale-95"
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

  return (
    <div className="bg-white border-2 border-slate-200 rounded-[2rem] shadow-2xl flex flex-col flex-1 overflow-hidden relative border-t-[6px] border-t-indigo-600 min-h-0">
      <div className="flex bg-slate-100 border-b border-slate-200 flex-shrink-0 p-1 gap-1">
        {tabs.map((tab, idx) => (
          <button key={idx} onClick={() => { setMode(tab.mode); setToolMode(ToolMode.NONE); setConcurrentRenderCount(0); }} className={`px-3 py-2 text-[8px] font-serif font-black rounded-t-2xl uppercase transition flex-1 ${mode === tab.mode && toolMode === ToolMode.NONE ? 'bg-white text-indigo-600 shadow-sm border-t-4 border-indigo-600' : 'text-slate-400 hover:bg-white/50'}`}>{translate(tab.label as any, outputLanguage)}</button>
        ))}
      </div>
      
      {/* Engine & Key Control Section */}
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-col gap-2">
        <div className="flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-1 w-full">
            <label className="text-[7px] font-black text-slate-400 uppercase mb-1 block ml-1">Chọn Engine Video</label>
            <EngineSelector 
              selected={selectedEngine as any} 
              onChange={(e) => setSelectedEngine(e)} 
            />
          </div>
          <div className="flex-1 w-full flex flex-col gap-1">
            <label className="text-[7px] font-black text-slate-400 uppercase mb-1 block ml-1">Personal Key (Kling/Seedance)</label>
            <input 
              type="password" 
              placeholder="WAVESPEED API KEY PRIVATE..." 
              value={wavespeedApiKey}
              onChange={(e) => setWavespeedApiKey(e.target.value)}
              className="w-full bg-white border-2 border-slate-200 px-3 py-2 rounded-xl text-[10px] font-mono outline-none focus:border-blue-500 shadow-sm transition-all"
            />
            <p className="text-[6px] text-slate-400 font-bold uppercase italic ml-1">* Gói PRO1/PRO9: Ưu tiên dùng key riêng nếu có</p>
          </div>
        </div>
      </div>
      {toolMode === ToolMode.NONE && (
        <div className="flex items-center gap-4 px-4 py-2 bg-white border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2 cursor-pointer group" onClick={handleSelectAllPrompts}>
            <input 
              type="checkbox" 
              checked={currentPromptText.split('\n').filter(p => p.trim()).length > 0 && selectedPrompts.size === currentPromptText.split('\n').filter(p => p.trim()).length} 
              readOnly
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
                <button onClick={() => handleDownloadBatchZip()} disabled={batchResults.length === 0} className="text-[8px] font-serif font-black bg-blue-600 text-white px-3 py-1 rounded-md uppercase shadow-lg">📥 ZIP</button>
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
            <div className="h-40 bg-white border-2 border-slate-100 rounded-2xl p-3 shadow-inner">
              <div className="h-full overflow-x-auto flex gap-3 pb-1">
                {batchResults.map((res, idx) => (
                  <div key={idx} className="flex-shrink-0 w-32 relative group">
                    {res.url ? (
                      <img src={res.url} className="w-full h-full object-cover rounded-xl border-2 border-slate-100" />
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
                        <label className="text-[8px] font-serif font-black text-blue-700 uppercase italic">{translate('STORY_TITLE_LABEL', outputLanguage)}</label>
                        <div className="flex items-center gap-2 bg-blue-50 px-3 py-1 rounded-lg border border-blue-100">
                          <span className="text-[8px] font-serif font-black text-blue-600 uppercase">{translate('STORY_COUNT_LABEL', outputLanguage)}</span>
                          <input type="number" min="1" max="50" value={storyCount} onChange={e => setStoryCount(parseInt(e.target.value) || 1)} className="text-[8px] font-black w-8 text-center outline-none bg-transparent text-blue-700" />
                        </div>
                      </div>
                      <div className="relative group">
                        <textarea value={linkTopic} onChange={e => setLinkTopic(e.target.value)} className="w-full bg-white border-2 border-slate-200 rounded-xl px-4 py-3 pr-12 text-[12px] font-bold focus:border-blue-400 outline-none h-32 resize-none" placeholder={translate('STORY_DESC_PLACEHOLDER', outputLanguage)} />
                        <button
                          type="button"
                          onClick={toggleLinkTopicSpeechToText}
                          className={`absolute top-3 right-3 p-2 rounded-xl border transition shadow-sm active:scale-95 flex items-center justify-center ${
                            isRecordingLinkTopic
                              ? 'bg-red-50 border-red-200 text-red-600 animate-pulse'
                              : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-blue-50 hover:text-blue-600'
                          }`}
                          title={outputLanguage === 'VN' ? 'Nhận diện giọng nói (Micro)' : 'Voice Dictation (Microphone)'}
                        >
                          {isRecordingLinkTopic ? (
                            <div className="relative flex items-center justify-center">
                              <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-red-400 opacity-75"></span>
                              <Mic size={14} className="relative text-red-600" />
                            </div>
                          ) : (
                            <Mic size={14} />
                          )}
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[8px] font-serif font-black text-blue-700 uppercase ml-2 italic">{translate('CHARACTERS_LABEL', outputLanguage)}</label>
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
                      <textarea value={toolMode === ToolMode.DIRECTOR ? directorForm.plot : seamlessForm.plot} onChange={e => toolMode === ToolMode.DIRECTOR ? setDirectorForm({...directorForm, plot: e.target.value}) : setSeamlessForm({...seamlessForm, plot: e.target.value})} className="flex-1 bg-white border border-slate-200 rounded-lg p-2 text-[10px] font-medium focus:border-indigo-400 outline-none shadow-inner resize-none" placeholder={translate('PLOT_SUMMARY_PLACEHOLDER', outputLanguage)} />
                    </div>
                    <div className="flex flex-col gap-1 flex-1">
                      <label className="text-[8px] font-serif font-black text-indigo-700 uppercase italic leading-none">{translate('CHARACTER_DNA_LABEL', outputLanguage)}</label>
                      <textarea value={toolMode === ToolMode.DIRECTOR ? directorForm.dna : seamlessForm.dna} onChange={e => toolMode === ToolMode.DIRECTOR ? setDirectorForm({...directorForm, dna: e.target.value}) : setSeamlessForm({...seamlessForm, dna: e.target.value})} className="flex-1 bg-white border border-slate-200 rounded-lg p-2 text-[10px] font-medium focus:border-indigo-400 outline-none shadow-inner resize-none" placeholder={translate('CHARACTER_DNA_PLACEHOLDER', outputLanguage)} />
                    </div>
                    <div className="flex flex-col gap-1 flex-1">
                      <label className="text-[8px] font-serif font-black text-indigo-700 uppercase italic leading-none">{translate('ENVIRONMENT_DNA_LABEL', outputLanguage)}</label>
                      <textarea value={toolMode === ToolMode.DIRECTOR ? directorForm.environment : seamlessForm.environment} onChange={e => toolMode === ToolMode.DIRECTOR ? setDirectorForm({...directorForm, environment: e.target.value}) : setSeamlessForm({...seamlessForm, environment: e.target.value})} className="flex-1 bg-white border border-slate-200 rounded-lg p-2 text-[10px] font-medium focus:border-indigo-400 outline-none shadow-inner resize-none" placeholder={translate('ENVIRONMENT_DNA_PLACEHOLDER', outputLanguage)} />
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
            <div className="flex items-center gap-2 flex-shrink-0 bg-white/50 p-1 rounded-xl">
              <button onClick={() => setOutputLanguage('EN')} className={`flex-1 py-2 sm:py-3 rounded-lg text-[8px] font-serif font-black transition ${outputLanguage === 'EN' ? 'bg-indigo-600 text-white' : 'bg-white text-indigo-600 border'}`}>{translate('US_ENGLISH', outputLanguage)}</button>
              <button onClick={() => setOutputLanguage('VN')} className={`flex-1 py-2 sm:py-3 rounded-lg text-[8px] font-serif font-black transition ${outputLanguage === 'VN' ? 'bg-blue-600 text-white' : 'bg-white text-blue-600 border'}`}>{translate('VIETNAMESE', outputLanguage)}</button>
              <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 h-[34px] sm:h-[42px] font-black text-[8px] shadow-sm"><span>{translate('PROMPT_COUNT', outputLanguage)}</span><input type="number" value={toolPromptCount} onChange={e => setToolPromptCount(e.target.value)} className="w-8 text-center outline-none bg-white text-[8px] font-black" /></div>
              <button onClick={() => handleToolGenerate(toolMode)} disabled={isGenerating} className="flex-[3] py-2 sm:py-3 rounded-lg bg-indigo-400 text-white font-black text-[8px] font-serif uppercase italic">{generatingTool === toolMode ? translate('GENERATING_SCRIPT', outputLanguage) : translate('EXPORT_PROMPTS', outputLanguage)}</button>
            </div>
          </div>
        ) : (
          <div className="flex-1 p-2 overflow-y-auto custom-scrollbar bg-slate-50/10">
            {concurrentRenderCount > 0 ? (
              <div className="space-y-3 p-2"><h4 className="text-[8px] font-serif font-black text-indigo-600 uppercase italic mb-2 tracking-widest">{translate('RENDER_THREADS', outputLanguage).replace('{count}', concurrentRenderCount.toString())}</h4>{concurrentPrompts.slice(0, concurrentRenderCount).map((p, idx) => (<div key={idx} className="bg-white border-2 border-indigo-100 p-3 rounded-2xl shadow-sm"><span className="text-[8px] font-serif font-black text-indigo-500 uppercase italic">{translate('THREAD_STATUS', outputLanguage).toUpperCase()} #{idx+1}</span><textarea value={p} onChange={e => { const n = [...concurrentPrompts]; n[idx] = e.target.value; setConcurrentPrompts(n); }} className="w-full mt-2 bg-slate-50 p-3 rounded-xl text-[12px] font-bold outline-none h-16 resize-none border focus:border-indigo-400" /></div>))}</div>
            ) : (
                <div className="space-y-4 p-4">
                  {currentPromptText.split('\n').map((line, i) => {
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
    </div>
  );
};
