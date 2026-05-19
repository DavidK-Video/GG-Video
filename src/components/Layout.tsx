
import React from 'react';
import { UserProfile } from '../types';
import { translate } from '../i18n';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: 'generate' | 'promptToVoice' | 'pricing';
  setActiveTab: (tab: 'generate' | 'promptToVoice' | 'pricing') => void;
  profile: UserProfile;
  onProfileUpdate: (newProfile: UserProfile) => void;
  usageCount: number;
  outputLanguage: 'EN' | 'VN';
  setOutputLanguage: (lang: 'EN' | 'VN') => void;
  email: string;
  setEmail: (email: string) => void;
  phone: string;
  setPhone: (phone: string) => void;
  userPlan: string;
  expiresAt: string | null;
  customApiKey: string;
  setCustomApiKey: (key: string) => void;
  onActivate: () => void;
  referredBy: string;
  setReferredBy: (email: string) => void;
  credit: number;
  projectName: string;
  apiKeys: string[];
  onUpdateProjectConfig: (name: string, keys: string[], email?: string) => void;
  onAdminActivateAffiliate: (email: string, days: number, planType: string, phone: string, refBy: string) => Promise<void>;
  onAdminActivateUser: (email: string, days: number, planType: 'pro1' | 'pro9' | 'free', phone?: string) => Promise<void>;
  onAdminFetchUser: (email: string) => Promise<any>;
  onOpenPricing: () => void;
  useProjectKey: boolean;
  onToggleProjectKey: (val: boolean) => void;
  onToggleFreeImage: (val: boolean) => void;
  isLoading?: boolean;
  isSheetConnected?: boolean | null;
}

export const Layout: React.FC<LayoutProps> = ({ 
  children, 
  activeTab, 
  setActiveTab, 
  profile,
  outputLanguage,
  setOutputLanguage,
  email,
  setEmail,
  phone,
  setPhone,
  userPlan,
  expiresAt,
  onActivate,
  referredBy,
  setReferredBy,
  credit,
  projectName,
  apiKeys,
  onUpdateProjectConfig,
  onAdminActivateAffiliate,
  onAdminActivateUser,
  onAdminFetchUser,
  onOpenPricing,
  useProjectKey,
  onToggleProjectKey,
  onToggleFreeImage,
  isLoading = false,
  isSheetConnected = null
}) => {
  const [showConfigModal, setShowConfigModal] = React.useState(false);
  const [tempProjectName, setTempProjectName] = React.useState(projectName);
  const [tempApiKeys, setTempApiKeys] = React.useState(apiKeys.join('\n'));
  const [adminUserEmail, setAdminUserEmail] = React.useState('');
  const [adminUserPhone, setAdminUserPhone] = React.useState('');
  const [adminDays, setAdminDays] = React.useState(30);
  const [adminRefBy, setAdminRefBy] = React.useState('');
  const [isAdminPanelOpen, setIsAdminPanelOpen] = React.useState(false);
  const [targetUserStatus, setTargetUserStatus] = React.useState<{
    pro1_enabled: boolean, 
    pro9_enabled: boolean,
    plan?: string,
    expires_at?: string | null,
    is_active?: boolean
  } | null>(null);

  React.useEffect(() => {
    if (!showConfigModal) {
      setTempProjectName(projectName);
      setTempApiKeys(apiKeys.join('\n'));
    }
  }, [projectName, apiKeys, showConfigModal]);

   const handleSaveConfig = () => {
    const trimmedInput = tempApiKeys.trim();
    // Relaxed regex for Gemini API Keys (usually 39-40 chars starting with AIzaSy)
    const keyRegex = /AIzaSy[A-Za-z0-9_-]{30,45}/g;
    
    let keys = trimmedInput.match(keyRegex) || [];
    
    console.log('[Layout] Raw input:', trimmedInput);
    console.log('[Layout] Keys found via regex:', keys);
    
    if (keys.length === 0 && trimmedInput.length > 20 && !trimmedInput.startsWith('[') && !trimmedInput.startsWith('{')) {
      keys = trimmedInput.split(/[\n,]/).map(k => k.trim()).filter(k => k.length > 10);
      console.log('[Layout] Fallback split used. Keys:', keys);
    }
    
    keys = Array.from(new Set(keys)).filter(Boolean);
    
    if (profile.role !== 'admin' && userPlan.toLowerCase() === 'free' && keys.length === 0) {
      console.warn('[Layout] Free user attempted to save empty keys');
      alert(translate('PAID_PLAN_REQUIRED', outputLanguage));
      onOpenPricing();
      return;
    }
    
    console.log('[Layout] Final keys to save:', keys);
    onUpdateProjectConfig(tempProjectName, keys, email);
    setShowConfigModal(false);
  };

  React.useEffect(() => {
    const fetchTargetUser = async () => {
      if (adminUserEmail && adminUserEmail.includes('@')) {
        const userData = await onAdminFetchUser(adminUserEmail);
        if (userData) {
          setTargetUserStatus({
            pro1_enabled: userData.pro1_enabled || false,
            pro9_enabled: userData.pro9_enabled || false,
            plan: userData.plan,
            expires_at: userData.expires_at,
            is_active: userData.is_active
          });
        } else {
          setTargetUserStatus(null);
        }
      } else {
        setTargetUserStatus(null);
      }
    };
    fetchTargetUser();
  }, [adminUserEmail, onAdminFetchUser]);

  const handleAdminActivate = async (planType: 'pro1' | 'pro9' | 'free') => {
    if (!adminUserEmail) return;
    
    // Nếu có email giới thiệu, dùng hàm activateAffiliate
    if (adminRefBy.trim()) {
      await onAdminActivateAffiliate(adminUserEmail, adminDays, planType, adminUserPhone, adminRefBy);
    } else {
      await onAdminActivateUser(adminUserEmail, adminDays, planType, adminUserPhone);
    }

    const userData = await onAdminFetchUser(adminUserEmail);
    if (userData) {
      setTargetUserStatus({
        pro1_enabled: userData.pro1_enabled || false,
        pro9_enabled: userData.pro9_enabled || false
      });
    }
  };

  const lp = userPlan.toLowerCase();
  const emailLower = (profile.email || '').toLowerCase();
  const isSystemAdmin = emailLower === 'yohu.vn@gmail.com';
  const isAdmin = profile.role === 'admin' || lp === 'pro9' || isSystemAdmin;
  const notExpired = expiresAt ? new Date(expiresAt) > new Date() : true;
  const isActiveUser = profile.is_active === true || isAdmin || profile.plan_status === 'active'; 
  const isPro9 = (lp === 'pro9' || isAdmin);
  const isPro1 = (lp === 'pro1' || lp === 'pro' || isPro9) && (isActiveUser || notExpired);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    // Handle YYYY-MM-DD or YYYY-MM-DD HH:mm:ss
    const cleanDate = dateStr.split(' ')[0];
    const d = new Date(cleanDate);
    if (isNaN(d.getTime())) return dateStr;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  // ✅ FIX: Hiển thị đúng nhãn gói theo yêu cầu: FREE, PRO1, PRO9, PRO9 / ADMIN
  const getPlanLabel = () => {
    if (profile.isSuspended) return 'SUSPENDED';
    
    const emailLower = (profile.email || '').toLowerCase();
    const isSystemAdmin = emailLower === 'yohu.vn@gmail.com';
    
    if (isSystemAdmin) {
      return 'SYSTEM ADMIN / PRO9';
    }
    
    // Nếu role là admin nhưng không phải email gốc (admin phụ hoặc Pro9 VIP)
    if (profile.role === 'admin' || lp === 'pro9') {
      return 'VIP PRO9 / ADMIN';
    }

    const p = lp.toUpperCase();
    if (p.includes('PRO9')) return 'PRO9';
    if (p.includes('PRO1') || p === 'PRO') return 'PRO1';
    if (p.includes('VIP')) return 'VIP';
    
    return 'FREE';
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#f1f5f9] text-slate-800">
      <header className="bg-slate-900 text-white border-b border-slate-800 px-4 py-1 flex flex-wrap items-center justify-between shadow-2xl z-50 gap-2">
        <div className="flex items-center space-x-4 max-sm:w-full max-sm:justify-between">
          <div className="flex flex-col">
            <h1 className="text-lg font-black text-blue-400 tracking-tighter uppercase italic leading-none">Veo3 YOHU-pro</h1>
            <span className="text-[7px] font-bold text-slate-500 uppercase tracking-widest">Cinema Pro Continuity Engine</span>
          </div>
          <nav className="flex space-x-1">
            <button 
              onClick={() => setActiveTab('promptToVoice')}
              className={`px-3 sm:px-6 py-2 rounded-full text-[9px] sm:text-[10px] leading-tight font-black uppercase tracking-widest transition-all active:scale-95 whitespace-pre-line text-center border-2 ${activeTab === 'promptToVoice' ? 'bg-orange-500 text-white border-orange-600 shadow-lg font-bold' : 'text-orange-500 border-transparent hover:bg-orange-500/10'}`}
            >
              {translate('PROMPT_TO_VOICE', outputLanguage)}
            </button>
            <button 
              onClick={() => setActiveTab('generate')}
              className={`px-3 sm:px-6 py-2 rounded-full text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 border-2 ${activeTab === 'generate' ? 'bg-blue-600 text-white border-red-500 shadow-lg' : 'text-slate-400 border-transparent hover:bg-white/5'}`}
            >
              {translate('CREATE_VIDEO', outputLanguage)}
            </button>
          </nav>
        </div>

        <div className="flex items-center space-x-3 sm:space-x-6 flex-wrap justify-end gap-y-2">
          {/* Activation Section */}
          <div className="flex items-center space-x-2">
            <div className="flex flex-col gap-0.5 sm:gap-1">
              <div className="flex items-end space-x-1 sm:space-x-2">
                <div className="flex flex-col gap-0.5">
                  <label className="text-[8px] font-black text-slate-500 uppercase px-1 leading-none">Email Profile</label>
                  <input
                    id="email-input"
                    type="email"
                    placeholder={translate('EMAIL_PLACEHOLDER', outputLanguage)}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="border border-slate-700/50 px-2 py-1.5 rounded-md text-[9px] sm:text-[10px] w-24 sm:w-32 focus:ring-1 focus:ring-blue-500 outline-none bg-white text-slate-900 font-bold placeholder:text-slate-400 shadow-inner"
                  />
                </div>
                <div className="flex flex-col gap-0.5">
                  <label className="text-[8px] font-black text-slate-500 uppercase px-1 leading-none">{translate('PHONE_LBL', outputLanguage)}</label>
                  <input
                    id="phone-input"
                    type="text"
                    placeholder={translate('PHONE_PLACEHOLDER', outputLanguage)}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="border border-slate-700/50 px-2 py-1.5 rounded-md text-[9px] sm:text-[10px] w-20 sm:w-24 focus:ring-1 focus:ring-blue-500 outline-none bg-white text-slate-900 font-bold placeholder:text-slate-400 shadow-inner"
                  />
                </div>
                <div className="flex flex-col gap-0.5 text-amber-500/80">
                  <label className="text-[8px] font-black uppercase px-1 leading-none">Giới thiệu</label>
                  <input
                    id="referred-input"
                    type="email"
                    placeholder="Email giới thiệu"
                    value={referredBy}
                    onChange={(e) => setReferredBy(e.target.value)}
                    className="border border-amber-500/30 px-2 py-1.5 rounded-md text-[9px] sm:text-[10px] w-24 sm:w-32 focus:ring-1 focus:ring-amber-500 outline-none bg-white text-slate-900 font-bold placeholder:text-amber-900/30 shadow-inner"
                  />
                </div>
                <button
                  onClick={onActivate}
                  disabled={!email || !phone || isLoading}
                  className={`px-3 py-1.5 h-[29.5px] sm:h-[32px] rounded-md text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all shadow-sm active:scale-95 ${(!email || !phone || isLoading) ? 'bg-slate-300 cursor-not-allowed text-slate-500' : (profile.isSuspended ? 'bg-black text-white' : 'bg-red-600 hover:bg-red-700 text-white')}`}
                >
                  {isLoading ? '...' : (profile.isSuspended ? 'BLOCKED' : ((isAdmin || isPro1 || isPro9) ? translate('DONE', outputLanguage) : translate('ACTIVATE_BTN', outputLanguage)))}
                </button>
              </div>
              {email && (
                <div className="flex items-center space-x-2 sm:space-x-3 px-1 flex-wrap">
                  {/* ✅ FIX: dùng getPlanLabel() thay vì logic inline dễ sai */}
                  <span className={`px-2 py-0.5 rounded text-[7px] sm:text-[8px] font-black uppercase tracking-tighter shadow-sm ${profile.isSuspended ? 'bg-black text-white' : (isPro1 || isPro9 || isAdmin) ? 'bg-amber-600 text-white' : 'bg-gradient-to-r from-indigo-400 to-indigo-600 text-white'}`}>
                    {translate('PLAN_LABEL', outputLanguage)}: <span className="text-white">
                      {getPlanLabel()}
                    </span>
                  </span>
                  <span className="px-2 py-0.5 rounded bg-gradient-to-r from-indigo-400 to-indigo-600 text-white text-[7px] sm:text-[8px] font-black uppercase tracking-tighter shadow-sm">
                    {translate('CREDITS_LABEL', outputLanguage)}: <span className="text-white">
                      {credit}
                    </span>
                  </span>
                  {expiresAt && (
                    <span className="text-[7px] sm:text-[8px] font-black text-slate-400 uppercase tracking-tighter">
                      {translate('EXPIRES_LABEL', outputLanguage)}: <span className="text-slate-600">{formatDate(expiresAt)}</span>
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

            <div className="flex flex-col items-center gap-1">
            <div className="flex gap-1 sm:gap-2">
              <button 
                onClick={() => {
                  setShowConfigModal(true);
                }}
                className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all shadow-lg active:scale-95 border-2 ${isPro1 ? 'bg-slate-800 border-orange-200 text-white' : 'bg-slate-800/10 text-slate-400 border-slate-700 hover:bg-slate-800/20'}`}
              >
                {translate('PROFESSIONAL_PACKAGE_1', outputLanguage)}
              </button>
              <button 
                onClick={() => {
                  if (isAdmin || isPro9) {
                    setShowConfigModal(true);
                  } else {
                    onOpenPricing();
                  }
                }}
                className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all shadow-lg active:scale-95 border-2 ${(isPro9 || isAdmin) ? 'bg-slate-800 border-orange-500 text-white' : 'bg-slate-800/10 text-slate-400 border-slate-700 hover:bg-slate-800/20'}`}
              >
                {translate('PROFESSIONAL_PACKAGE_9', outputLanguage)}
              </button>
            </div>
            {!(isPro1 || isPro9 || isAdmin) && (
              <span className="text-[7px] sm:text-[8px] font-black text-green-500 uppercase tracking-tighter">
                {translate('CREDIT_INFO', outputLanguage)}
              </span>
            )}
          </div>
          
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-2">
              <div className="flex bg-slate-100 p-0.5 sm:p-1 rounded-full border border-slate-200 shadow-inner">
                <button 
                  onClick={() => setOutputLanguage('VN')} 
                  className={`px-2 sm:px-3 py-1 rounded-full text-[7px] sm:text-[8px] font-black transition-all ${outputLanguage === 'VN' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  VN
                </button>
                <button 
                  onClick={() => setOutputLanguage('EN')} 
                  className={`px-2 sm:px-3 py-1 rounded-full text-[7px] sm:text-[8px] font-black transition-all ${outputLanguage === 'EN' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  EN
                </button>
              </div>

              <button 
                onClick={() => setIsAdminPanelOpen(!isAdminPanelOpen)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all shadow-md active:scale-95 ${isAdminPanelOpen ? 'bg-amber-500 border-amber-600 text-white' : 'bg-indigo-600 border-indigo-700 text-white hover:bg-indigo-500 animate-pulse'}`}
              >
                <div className={`w-1.5 h-1.5 rounded-full ${isAdminPanelOpen ? 'bg-white' : 'bg-emerald-400'}`} />
                <div className="flex flex-col items-start">
                  <span className="text-[8px] font-black uppercase leading-none">{translate('AFFILIATE_PROGRAM', outputLanguage)}</span>
                  <span className="text-[6px] font-medium opacity-80 leading-none mt-0.5">{translate('AFFILIATE_COMMISSION', outputLanguage)}</span>
                </div>
              </button>
            </div>

            <div className="flex items-center gap-2">
              {isSystemAdmin && (
                <div className="flex items-center space-x-1.5 bg-slate-100 px-2 py-1 rounded-full border border-slate-200 shadow-inner">
                  <span className="text-[7px] sm:text-[8px] font-black text-slate-500 uppercase tracking-tighter">{translate('USE_PROJECT_KEY', outputLanguage)}</span>
                  <button 
                    onClick={() => onToggleProjectKey(!useProjectKey)}
                    className={`w-7 h-3.5 rounded-full transition-all relative ${useProjectKey ? 'bg-emerald-500' : 'bg-slate-300'}`}
                  >
                    <div className={`absolute top-0.5 w-2.5 h-2.5 bg-white rounded-full transition-all ${useProjectKey ? 'left-4' : 'left-0.5'}`} />
                  </button>
                  <span className="text-[7px] sm:text-[8px] font-black text-slate-700 uppercase">{useProjectKey ? 'ON' : 'OFF'}</span>
                </div>
              )}
              <div className="flex items-center space-x-1.5 bg-slate-100 px-2 py-1 rounded-full border border-slate-200 shadow-inner">
                <span className="text-[7px] sm:text-[8px] font-black text-slate-500 uppercase tracking-tighter">FREE IMG</span>
                <button 
                  onClick={() => onToggleFreeImage(!profile.use_free_image_gen)}
                  className={`w-7 h-3.5 rounded-full transition-all relative ${profile.use_free_image_gen ? 'bg-amber-500' : 'bg-slate-300'}`}
                >
                  <div className={`absolute top-0.5 w-2.5 h-2.5 bg-white rounded-full transition-all ${profile.use_free_image_gen ? 'left-4' : 'left-0.5'}`} />
                </button>
                <span className="text-[7px] sm:text-[8px] font-black text-slate-700 uppercase">{profile.use_free_image_gen ? 'ON' : 'OFF'}</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {profile.role !== 'admin' && (
                <>
                  <div className="text-[8px] sm:text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">ID: {profile.machineId}</div>
                  <div className="flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${isSheetConnected === true ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : isSheetConnected === false ? 'bg-red-500' : 'bg-slate-500 animate-pulse'}`} />
                    <span className={`text-[8px] sm:text-[9px] font-bold uppercase tracking-widest ${isSheetConnected === true ? 'text-emerald-500' : isSheetConnected === false ? 'text-red-500' : 'text-slate-400'}`}>
                      {isSheetConnected === true ? 'DATABASE CONNECTED' : isSheetConnected === false ? 'DATABASE DISCONNECTED' : 'CONNECTING...'}
                    </span>
                  </div>
                  <div className="text-[8px] sm:text-[9px] font-bold text-green-500 uppercase tracking-widest animate-pulse whitespace-nowrap">{translate('SYSTEM_ONLINE', outputLanguage)}</div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {isAdminPanelOpen && (
        <div className="bg-gradient-to-r from-indigo-950 to-slate-900 text-white px-4 py-3 flex flex-col md:flex-row items-center justify-between border-b border-indigo-800/50 shadow-2xl animate-in slide-in-from-top duration-300 gap-4 relative">
            <div className="flex flex-col items-start min-w-[150px]">
              <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-amber-400">Tiếp Thị Liên Kết</h2>
              <span className="text-[8px] font-medium text-indigo-300/80 italic tracking-tighter -mt-1">Hưởng Hoa hồng tới 40%</span>
            </div>
            
            <div className="flex flex-wrap items-center gap-3 bg-white/5 p-2 rounded-2xl border border-white/10 flex-1 justify-center">
              <div className="flex flex-col">
                <label className="text-[7px] font-bold text-white/40 uppercase mb-0.5 ml-1 leading-none">Email người dùng/Số điện thoại</label>
                <input 
                  type="email" 
                  value={adminUserEmail}
                  onChange={(e) => setAdminUserEmail(e.target.value)}
                  className="bg-indigo-900/50 border border-indigo-700/50 rounded-xl px-3 py-1.5 text-[9px] outline-none focus:border-amber-500 w-44 font-bold transition-all h-8"
                  placeholder="Email..."
                />
              </div>
              <div className="flex flex-col">
                <label className="text-[7px] font-bold text-white/40 uppercase mb-0.5 ml-1 leading-none">Số điện thoại phụ (nếu có)</label>
                <input 
                  type="text" 
                  value={adminUserPhone}
                  onChange={(e) => setAdminUserPhone(e.target.value)}
                  className="bg-indigo-900/50 border border-indigo-700/50 rounded-xl px-3 py-1.5 text-[9px] outline-none focus:border-amber-500 w-32 font-bold transition-all h-8"
                  placeholder="Số điện thoại..."
                />
              </div>
              <div className="flex flex-col">
                <label className="text-[7px] font-bold text-white/40 uppercase mb-0.5 ml-1">Số ngày</label>
                <input 
                  type="number" 
                  value={adminDays}
                  onChange={(e) => setAdminDays(parseInt(e.target.value) || 0)}
                  className="bg-indigo-900/50 border border-indigo-700/50 rounded-xl px-3 py-1.5 text-[9px] outline-none focus:border-amber-500 w-14 text-center font-bold"
                />
              </div>
              <div className="flex flex-col">
                <label className="text-[7px] font-bold text-white/40 uppercase mb-0.5 ml-1 leading-none">Email Giới Thiệu (Affiliate)</label>
                <input 
                  type="text" 
                  value={adminRefBy}
                  onChange={(e) => setAdminRefBy(e.target.value)}
                  className="bg-indigo-900/50 border border-indigo-700/50 rounded-xl px-3 py-1.5 text-[9px] outline-none focus:border-amber-500 w-32 font-bold transition-all h-8"
                  placeholder="Người giới thiệu..."
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex flex-col items-center gap-1 group">
                <span className="text-[7px] font-black text-slate-400 group-hover:text-amber-500 transition-colors uppercase whitespace-nowrap">Gói Free (có nút kích hoạt)</span>
                <button 
                  onClick={() => handleAdminActivate('free')}
                  className="bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest border border-slate-600 transition-all active:scale-95 whitespace-nowrap"
                >
                  KÍCH HOẠT
                </button>
              </div>

              <div className="flex flex-col items-center gap-1 group">
                <span className="text-[7px] font-black text-emerald-400 group-hover:text-emerald-300 transition-colors">{translate('PROFESSIONAL_PACKAGE_1', outputLanguage)}</span>
                <button 
                  onClick={() => handleAdminActivate('pro1')}
                  className="bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest border border-emerald-500 transition-all active:scale-95 whitespace-nowrap"
                >
                  KÍCH HOẠT
                </button>
              </div>

              <div className="flex flex-col items-center gap-1 group">
                <span className="text-[7px] font-black text-amber-500 group-hover:text-amber-400 transition-colors uppercase">{translate('PROFESSIONAL_PACKAGE_9', outputLanguage)}</span>
                <button 
                  onClick={() => handleAdminActivate('pro9')}
                  className="bg-amber-600 hover:bg-amber-500 px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest border border-amber-500 transition-all active:scale-95 shadow-lg shadow-amber-900/20 whitespace-nowrap"
                >
                  KÍCH HOẠT
                </button>
              </div>
            </div>

            <div className="hidden lg:flex flex-col items-end border-l border-white/10 pl-4">
              {targetUserStatus ? (
                <>
                  <span className="text-[7px] font-bold text-white/30 uppercase tracking-tighter">Status: {targetUserStatus.plan}</span>
                  <span className={`text-[8px] font-black uppercase ${targetUserStatus.is_active ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {targetUserStatus.is_active ? '● ONLINE' : '○ OFFLINE'}
                  </span>
                </>
              ) : (
                <span className="text-[7px] font-medium text-white/20 italic tracking-tighter">Sẵn sàng...</span>
              )}
            </div>

            <button onClick={() => setIsAdminPanelOpen(false)} className="text-white/30 hover:text-white transition-colors ml-2">✕</button>
        </div>
      )}

      <div className="flex-1 overflow-auto flex flex-col min-h-0">
        {children}
      </div>
      
      <footer className="bg-white border-t border-slate-200 px-4 py-1.5 text-[8px] text-slate-500 font-medium flex justify-between items-center shadow-inner flex-shrink-0">
        <div className="flex items-center space-x-2">
          <span className="text-indigo-600 font-black italic uppercase tracking-widest">{translate('STUDIO_STATUS', outputLanguage)}</span>
          <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-black text-[8px] uppercase tracking-tighter shadow-sm">{translate('READY', outputLanguage)}</span>
          <span className="text-slate-300">|</span>
          <div className="flex items-center gap-1">
             <span className="px-2 py-1 rounded-full text-[8px] font-black uppercase shadow-sm border transition-colors cursor-default bg-indigo-50 text-indigo-600 border-indigo-100">{translate('TRIAL_INFO', outputLanguage)}</span>
             {/* ✅ FIX: so sánh lowercase để khớp với plan đã normalize */}
             {(profile.plan_name === 'pro1' || profile.plan_name === 'Pro 1') && <span className="bg-emerald-50 text-emerald-600 px-2 py-1 rounded-full text-[8px] font-black uppercase shadow-sm border border-emerald-100 hover:bg-emerald-100 transition-colors cursor-default">{translate('LICENSE_ACTIVE', outputLanguage)}</span>}
             {(profile.plan_name === 'pro9' || profile.plan_name === 'Pro 9' || isAdmin) && <span className="bg-indigo-50 text-indigo-600 px-2 py-1 rounded-full text-[8px] font-black uppercase shadow-sm border border-indigo-100 hover:bg-indigo-100 transition-colors cursor-default">{translate('LICENSE_PREMIUM', outputLanguage)}</span>}
          </div>
        </div>
        <div className="opacity-40 font-black text-[9px] tracking-[0.4em]">V3.1.0-CINEMA-PRO-STATION</div>
      </footer>

      {/* Project Config Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-[#1a1a1a] w-full max-w-md rounded-2xl shadow-2xl border border-white/10 overflow-hidden text-white">
            <div className="p-6 space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-black uppercase tracking-widest italic">
                  {isAdmin ? translate('PROFESSIONAL_PACKAGE_9', outputLanguage) : translate('PROFESSIONAL_PACKAGE_1', outputLanguage)}
                </h2>
                <button onClick={() => setShowConfigModal(false)} className="text-white/40 hover:text-white transition">✕</button>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">{translate('USER_EMAIL_LBL', outputLanguage)}</label>
                  <input 
                    type="email" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={translate('EMAIL_PLACEHOLDER', outputLanguage)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[12px] font-bold outline-none focus:border-blue-500 transition"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">{translate('PHONE_LBL', outputLanguage)}</label>
                  <input 
                    type="tel" 
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder={translate('PHONE_PLACEHOLDER', outputLanguage)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[12px] font-bold outline-none focus:border-blue-500 transition"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">{translate('CHOOSE_PAID_PROJECT_LABEL', outputLanguage)}</label>
                  <input 
                    type="text" 
                    value={tempProjectName}
                    onChange={(e) => setTempProjectName(e.target.value)}
                    placeholder={translate('PROJECT_NAME_LABEL', outputLanguage)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[12px] font-bold outline-none focus:border-blue-500 transition"
                  />
                </div>

                {(isPro1 || isPro9 || isAdmin || userPlan === 'free') && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">{translate('KEY_LIST_LABEL', outputLanguage)}</label>
                    <textarea 
                      autoFocus
                      value={tempApiKeys}
                      onChange={(e) => {
                        console.log('Key input change:', e.target.value);
                        setTempApiKeys(e.target.value);
                      }}
                      onPaste={() => {
                        console.log('Key input paste detected');
                      }}
                      placeholder={translate('KEY_PLACEHOLDER', outputLanguage)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[12px] font-mono outline-none focus:border-blue-500 transition h-32 resize-none text-white selection:bg-blue-500/30"
                    />
                    <p className="text-[8px] text-white/30 italic">{translate('KEY_HINT', outputLanguage)}</p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-white/10">
                <div className="flex flex-col items-start gap-2">
                  <button 
                    onClick={() => {
                      if (confirm(translate('CLEAR_CACHE_CONFIRM', outputLanguage))) {
                        localStorage.clear();
                        window.location.reload();
                      }
                    }}
                    className="text-[9px] font-black text-red-500 uppercase tracking-widest hover:text-red-400 transition"
                  >
                    {translate('CLEAR_CACHE', outputLanguage)}
                  </button>
                  <button 
                    onClick={() => { setTempProjectName(''); setTempApiKeys(''); }}
                    className="px-4 py-1.5 rounded-lg bg-white/5 text-white/40 text-[9px] font-black uppercase tracking-widest hover:bg-white/10 transition"
                  >
                    {translate('RESET', outputLanguage)}
                  </button>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setShowConfigModal(false)}
                    className="px-6 py-2 rounded-xl text-white/60 text-[10px] font-black uppercase tracking-widest hover:text-white transition"
                  >
                    {translate('CANCEL', outputLanguage)}
                  </button>
                  {(isPro1 || isPro9 || isAdmin || userPlan === 'free') && (
                    <button 
                      onClick={handleSaveConfig}
                      className="px-8 py-2 rounded-xl bg-white text-black text-[10px] font-black uppercase tracking-widest hover:bg-blue-500 hover:text-white transition shadow-lg"
                    >
                      {translate('DONE', outputLanguage)}
                    </button>
                  )}
                </div>
              </div>
            </div>
            {isSystemAdmin && (
              <div className="bg-white/5 p-4 text-center">
                <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="text-[9px] font-black text-blue-400 uppercase tracking-widest hover:underline">
                  {translate('BILLING_DOCS', outputLanguage)}
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
