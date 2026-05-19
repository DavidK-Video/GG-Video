
import React, { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseDisabled } from './supabaseClient';
import { Layout } from './components/Layout';
import { VideoGenerator } from './components/VideoGenerator';
import { PromptToVoice } from './components/PromptToVoice';
import { Pricing } from './components/Pricing';
import { GenerationHistory, UserProfile } from './types';
import { DEFAULT_PROFILE } from './constants';
import { translate } from './i18n';

import { googleSheetService } from './services/googleSheetService';
import { isTruthy } from './services/utils';

const App: React.FC = () => {
  // ... existing effects for logging
  
  const [outputLanguage, setOutputLanguage] = useState<'EN' | 'VN'>(() => {
    return (localStorage.getItem('veopro_lang') as 'EN' | 'VN') || 'EN';
  });

  const [history, setHistory] = useState<GenerationHistory[]>([]);
  const [profile, setProfile] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('veopro_profile');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return DEFAULT_PROFILE;
      }
    }
    return DEFAULT_PROFILE;
  });
  
  const addToHistory = (item: GenerationHistory) => {
    setHistory(prev => [item, ...prev]);
  };
  
  const [activeTasks, setActiveTasks] = useState<GenerationHistory[]>([]);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [activeTab, setActiveTab] = useState<'generate' | 'promptToVoice' | 'pricing'>('generate');
  const [isLoading, setIsLoading] = useState(false);

  const [analyzedScript, setAnalyzedScript] = useState(() => localStorage.getItem('veopro_analyzed_script') || '');
  const [directorScript, setDirectorScript] = useState(() => localStorage.getItem('veopro_director_script') || '');
  const [seamlessScript, setSeamlessScript] = useState(() => localStorage.getItem('veopro_seamless_script') || '');
  const [targetLink, setTargetLink] = useState(() => localStorage.getItem('veopro_target_link') || '');
  const [batchResults, setBatchResults] = useState<any[]>([]);

  const [email, setEmail] = useState(() => localStorage.getItem('currentUserEmail') || '');
  const [phone, setPhone] = useState(() => localStorage.getItem('currentUserPhone') || '');
  const [referredBy, setReferredBy] = useState(() => localStorage.getItem('referredByEmail') || '');
  
  const [userPlan, setUserPlan] = useState<string>('free');
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [customApiKey, setCustomApiKey] = useState('');
  const [isActivated, setIsActivated] = useState(false);
  const [useProjectKey, setUseProjectKey] = useState(true);
  
  // Use a ref to track if we've successfully synced from sheet
  const hasSyncedRef = React.useRef(false);
  const [credit, setCredit] = useState<number>(0);

  const [isSheetConnected, setIsSheetConnected] = useState<boolean | null>(null);
  const [projectName, setProjectName] = useState(() => localStorage.getItem('veopro_project_name') || '');
  const [adminAllKeys, setAdminAllKeys] = useState<string[]>([]);

  useEffect(() => {
    const ping = async () => {
      try {
        const connected = await googleSheetService.pingSheet();
        setIsSheetConnected(connected);
      } catch {
        setIsSheetConnected(false);
      }
    };
    ping();
    const interval = setInterval(ping, 60000); // Re-ping every minute
    return () => clearInterval(interval);
  }, []);

  const [apiKeys, setApiKeys] = useState<string[]>(() => {
    const saved = localStorage.getItem('veopro_api_keys');
    return saved ? JSON.parse(saved) : [];
  });

  const fetchUserData = useCallback(async (targetEmail: string) => {
    if (!targetEmail || targetEmail.length < 5) return;

    const cleanEmail = targetEmail.trim().toLowerCase();
    const isSystemAdmin = cleanEmail === 'yohu.vn@gmail.com';
    
    console.log(`[Sync] Fetching user data for: ${cleanEmail} (isSystemAdmin: ${isSystemAdmin})`);
    const result = await googleSheetService.fetchUser(cleanEmail);

    if (result && result.email) {
      console.log(`[Sync] Dữ liệu hợp lệ cho ${cleanEmail}:`, result);
      hasSyncedRef.current = true;
      const data = result;
      const now = new Date();
      
      const expiryStr = data.expiry || "";
      const expiry = expiryStr ? new Date(expiryStr) : null;
      const isExpired = expiry && now > expiry;
      
      const status = String(data.userStatus || "ACTIVE").toUpperCase();
      const role = (data.role || 'user').trim().toLowerCase();
      
      const rawPlan = String(data.plan || (isSystemAdmin ? 'PRO9' : 'FREE')).trim().toUpperCase();
      const isPro9Plan = rawPlan === 'PRO9' || rawPlan.includes("GÓI CHUYÊN NGHIỆP 9") || rawPlan.includes("PROFESSIONAL 9") || rawPlan.includes("VIP");
      const isPro1Plan = rawPlan === 'PRO1' || rawPlan.includes("GÓI CHUYÊN NGHIỆP 1") || rawPlan.includes("PROFESSIONAL 1");

      // Admin nếu role=admin HOẶC plan=PRO9 HOẶC isSystemAdmin
      const isAdmin = role === 'admin' || isPro9Plan || isSystemAdmin;
      
      const isActive = (status === 'ACTIVE') || isAdmin;
      const isSuspended = status === 'SUSPENDED';
      
      const planUpper = (isExpired && !isAdmin && status !== 'ACTIVE') ? 'FREE' : rawPlan;
      const plan = planUpper.toLowerCase(); 

      setUserPlan(plan);
      setExpiresAt(data.expiry || null);
      
      const currentCredits = Number(data.credits ?? (isSystemAdmin ? 999 : 0));
      console.log(`[Sync] Updating UI -> Plan: ${plan}, Credits: ${currentCredits}, Status: ${status}`);
      setCredit(currentCredits);
      
      setIsActivated(isActive && !isSuspended);
      
      let parsedKeys: string[] = [];
      if (typeof data.api_keys === 'string') {
        try {
          parsedKeys = JSON.parse(data.api_keys);
        } catch {
          if (data.api_keys.trim()) {
            parsedKeys = data.api_keys.split(/[,;\n\s]+/).map((s: string) => s.trim()).filter((s: string) => s);
          }
        }
      } else if (Array.isArray(data.api_keys)) {
        parsedKeys = data.api_keys;
      }
      setApiKeys(parsedKeys);
      
      setProjectName(data.project_name || projectName);
      
      if (isAdmin) {
        const adminKeysResult = await googleSheetService.getAdminKeys();
        if (adminKeysResult.keys && Array.isArray(adminKeysResult.keys)) {
          setAdminAllKeys(adminKeysResult.keys);
        }
      }

      const isFreeImgEnabled = (localStorage.getItem('veopro_use_free_img') === 'true') || isTruthy(data.use_free_image_gen);

      setProfile(prev => ({
        ...prev,
        userId: data.userId || prev.userId,
        email: data.email || cleanEmail,
        phone: data.phone || prev.phone,
        fullName: data.fullName || prev.fullName,
        role: isAdmin ? 'admin' : role,
        plan_name: plan,
        plan_status: (isActive || isAdmin) ? 'active' : 'expired',
        remaining_days: (expiry ? Math.max(0, Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))) : 999),
        project_name: data.project_name || projectName,
        api_keys: parsedKeys,
        useProjectKey: true,
        accountType: plan,
        expiryDate: data.expiry || translate('PERMANENT', outputLanguage),
        is_active: isActive || isAdmin, 
        isSuspended: isSuspended,
        isAdmin: isAdmin, 
        credits: currentCredits,
        pro1_enabled: isPro1Plan || isPro9Plan || isAdmin,
        pro9_enabled: isPro9Plan || isAdmin,
        use_free_image_gen: isFreeImgEnabled,
        machineId: data.userId ? data.userId : (prev.machineId || 'YOHU-STUDIO')
      }));
    } else {
      // TRÁNH RESET VỀ FREE NẾU LỖI LOOKUP TẠM THỜI (ví dụ mạng lag)
      if (result && (result as any).notFound) {
        console.warn(`[Sync] Không tìm thấy email ${cleanEmail} trong Sheet. Mặc định FREE.`);
        setIsActivated(false);
        setUserPlan('free');
        const defaultCredits = isSystemAdmin ? 999 : 0;
        setCredit(defaultCredits);
        setProfile(prev => ({
          ...DEFAULT_PROFILE,
          email: cleanEmail,
          role: isSystemAdmin ? 'admin' : 'user',
          plan_name: isSystemAdmin ? 'pro9' : 'free',
          credits: defaultCredits,
          is_active: isSystemAdmin,
          isAdmin: isSystemAdmin,
          accountType: isSystemAdmin ? 'pro9' : 'free',
          machineId: prev.machineId
        }));
      } else {
        console.warn("[Sync] Không lấy được dữ liệu từ Sheet (có thể do sai Email hoặc Script đang bận).");
        // Chỉ đặt mặc định nếu chưa từng đồng bộ thành công trong phiên này
        if (!hasSyncedRef.current && !isSystemAdmin) {
           setUserPlan('free');
           setCredit(0);
        }
      }
    }
  }, [projectName, outputLanguage]);

  const handleActivate = async () => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.trim().replace(/\s/g, '');
    const cleanRef = referredBy.trim().toLowerCase();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      alert("Vui lòng nhập Email hợp lệ (ví dụ: name@gmail.com)");
      return;
    }
    if (!cleanPhone || cleanPhone.length < 10) {
      alert("Vui lòng nhập Số điện thoại hợp lệ (ít nhất 10 số)");
      return;
    }
    
    setIsLoading(true);
    try {
      console.log("[Sync] Gửi dữ liệu tới Google Sheet...", { email: cleanEmail, phone: cleanPhone, ref_by: cleanRef });
      
      const syncResult = await googleSheetService.upsertUser({
        email: cleanEmail,
        phone: cleanPhone,
        machineId: profile.machineId || 'YOHU-STUDIO',
        project_name: projectName,
        ref_by: cleanRef
      });

      if (syncResult.success || syncResult.message === "Updated") {
        console.log("[Sync] Kết quả thành công:", syncResult);
        
        localStorage.setItem('currentUserEmail', cleanEmail);
        localStorage.setItem('currentUserPhone', cleanPhone);
        if (cleanRef) localStorage.setItem('referredByEmail', cleanRef);

        // Đã đăng ký thành công, gọi fetchUser ngay lập tức để lấy dữ liệu thực tế từ Sheet
        await fetchUserData(cleanEmail);
        alert("Đồng bộ thành công! Dữ liệu của bạn đã được cập nhật.");
      } else {
        throw new Error(syncResult.error || "Giao tiếp với máy chủ Google thất bại");
      }
    } catch (err: any) {
      console.error("[Sync] Error:", err);
      alert("Lỗi đồng bộ (Sync Error): " + (err.message || "Không thể kết nối với Google Sheet. Vui lòng kiểm tra lại Script URL."));
    } finally {
      setIsLoading(false);
    }
  };

  const updateProfile = (newProfile: UserProfile) => {
    setProfile(newProfile);
    try {
      localStorage.setItem('veopro_profile', JSON.stringify(newProfile));
    } catch (e) {
      console.warn('Failed to save profile to localStorage', e);
    }
  };

  const deductCredit = async (amount: number, action: any = "VIDEO") => {
    // Luôn cố gắng trừ xu để đồng bộ với Sheet, ngay cả với Admin nếu họ muốn theo dõi hạn mức
    const isPro = profile.accountType?.includes('pro') || profile.plan_name?.includes('pro');
    if (credit < amount && !profile.isAdmin && !isPro) {
      alert(translate('INSUFFICIENT_CREDITS', outputLanguage));
      return false;
    }

    const result = await googleSheetService.deductCredits(email, amount, action);
    if (result.success) {
      // Nếu là Admin, có thể Sheet không trừ thật nhưng vẫn trả về success
      setCredit(result.credits !== undefined ? result.credits : credit - amount);
      return true;
    } else {
      if (profile.isAdmin || isPro) return true; // Cứu cánh cho admin/pro nếu lệnh trừ thất bại
      alert(`Lỗi trừ xu: ${result.error || 'Unknown error'}`);
      return false;
    }
  };

  const handleUpdateProjectConfig = async (name: string, keys: string[], targetEmail?: string) => {
    const cleanEmail = (targetEmail || email).trim().toLowerCase();
    const result = await googleSheetService.updateConfig(cleanEmail, name, keys);
    if (result.success) {
      setProjectName(name);
      setApiKeys(keys);
      alert(translate('BYOK_SUCCESS_MSG', outputLanguage));
      await fetchUserData(cleanEmail);
    } else {
      alert("Error saving config: " + result.error);
    }
  };

  const onAdminFetchUser = async (targetEmail: string) => {
    const result = await googleSheetService.fetchUser(targetEmail);
    return result;
  };

  const handleAdminActivateUser = async (targetEmail: string, days: number, planType: 'pro1' | 'pro9' | 'free', targetPhone: string = "") => {
    const isSystemAdmin = (email || '').trim().toLowerCase() === 'yohu.vn@gmail.com';
    
    // Thực hiện kích hoạt
    const result = await googleSheetService.activateUser(targetEmail.trim(), days, planType, targetPhone.trim());
    
    if (result.success) {
      // Nếu là VIP Pro9 (không phải System Admin), dữ liệu chuyển về phải ở trạng thái INACTIVE
      if (!isSystemAdmin) {
        await googleSheetService.toggleActive(targetEmail.trim(), false, planType);
      }
      alert(translate('ACTIVATION_SUCCESS_MSG', outputLanguage));
      await fetchUserData(targetEmail.trim());
    } else {
      alert("Error: " + result.error);
    }
  };

  const handleAdminActivateAffiliate = async (targetEmail: string, days: number, planType: string, phone: string, refBy: string) => {
    const result = await googleSheetService.activateAffiliate(targetEmail, days, planType, phone, refBy);
    if (result.success) {
      alert(translate('AFFILIATE_SUCCESS_MSG', outputLanguage));
      await fetchUserData(targetEmail.trim());
    } else {
      alert("Lỗi: " + result.error);
    }
  };

  const handleAdminTogglePro = async (targetEmail: string, field: 'pro1_enabled' | 'pro9_enabled' | 'is_active', value: boolean, currentPlan?: string) => {
    let result;
    if (field === 'is_active') {
      result = await googleSheetService.toggleActive(targetEmail, value, currentPlan || 'free');
    } else {
      const planType = field === 'pro1_enabled' ? 'pro1' : 'pro9';
      result = await googleSheetService.togglePro(targetEmail, field, value, planType);
    }

    if (result.success) {
      console.log(`[Admin] Successfully toggled ${field} for ${targetEmail}`);
      if (targetEmail.trim().toLowerCase() === email.trim().toLowerCase()) {
        await fetchUserData(targetEmail);
      }
    } else {
      alert("Lỗi (Error): " + (result.error || "Sync error"));
    }
  };

  const handleToggleProjectKey = (val: boolean) => {
    setUseProjectKey(val);
  };

  const handleToggleFreeImage = async (val: boolean) => {
    localStorage.setItem('veopro_use_free_img', val.toString());
    setProfile(prev => ({ ...prev, use_free_image_gen: val }));
    
    // Chỉ đồng bộ lên Sheet nếu là Admin/VIP Pro9 để lưu cấu hình hệ thống hoặc cá nhân
    const planName = profile.plan_name || userPlan || 'free';
    const isAdmin = profile.role === 'admin' || planName.toLowerCase() === 'pro9';
    if (isAdmin) {
      const result = await googleSheetService.togglePro(email, 'use_free_image_gen', val, planName);
      if (!result.success) {
        console.warn("Could not persist free image toggle to sheet:", result.error);
      }
    }
  };

  const handleOpenKeyPicker = async () => {
    if (window.aistudio?.openSelectKey) {
      await window.aistudio.openSelectKey();
      setHasApiKey(true);
    }
  };

  useEffect(() => {
    if (isSupabaseDisabled) return;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        if (!isActivated || email !== session.user.email) {
          await fetchUserData(session.user.email!);
        }
      } else if (event === 'SIGNED_OUT') {
        setIsActivated(false);
        setProfile(DEFAULT_PROFILE);
        localStorage.removeItem('yohu_user_email');
      }
    });

    return () => subscription.unsubscribe();
  }, [outputLanguage, fetchUserData, isActivated, email]);

  useEffect(() => {
    if (!email || email.length < 5 || !email.includes('@')) return;
    
    const timer = setTimeout(() => {
      fetchUserData(email);
    }, 100);

    const interval = setInterval(() => {
      fetchUserData(email);
    }, 10000); // 10s cập nhật 1 lần

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [email, fetchUserData]);

  useEffect(() => {
    localStorage.setItem('veopro_analyzed_script', analyzedScript);
  }, [analyzedScript]);

  useEffect(() => {
    localStorage.setItem('veopro_director_script', directorScript);
  }, [directorScript]);

  useEffect(() => {
    localStorage.setItem('veopro_seamless_script', seamlessScript);
  }, [seamlessScript]);

  useEffect(() => {
    localStorage.setItem('veopro_target_link', targetLink);
  }, [targetLink]);

  useEffect(() => {
    localStorage.setItem('veopro_project_name', projectName);
  }, [projectName]);

  useEffect(() => {
    localStorage.setItem('veopro_lang', outputLanguage);
  }, [outputLanguage]);

  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio?.hasSelectedApiKey) {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(selected);
      }
    };
    checkKey();
  }, [setHasApiKey]);

  return (
    <Layout 
      activeTab={activeTab} 
      setActiveTab={setActiveTab} 
      profile={profile}
      onProfileUpdate={updateProfile}
      usageCount={history.length}
      outputLanguage={outputLanguage}
      setOutputLanguage={setOutputLanguage}
      email={email}
      setEmail={setEmail}
      phone={phone}
      setPhone={setPhone}
      referredBy={referredBy}
      setReferredBy={setReferredBy}
      userPlan={userPlan as any}
      expiresAt={expiresAt}
      customApiKey={customApiKey}
      setCustomApiKey={setCustomApiKey}
      onActivate={handleActivate}
      credit={credit}
      projectName={projectName}
      apiKeys={apiKeys}
      onUpdateProjectConfig={handleUpdateProjectConfig}
      onAdminActivateUser={handleAdminActivateUser}
      onAdminActivateAffiliate={handleAdminActivateAffiliate}
      onAdminTogglePro={handleAdminTogglePro}
      onAdminFetchUser={onAdminFetchUser}
      useProjectKey={useProjectKey}
      onToggleProjectKey={handleToggleProjectKey}
      onToggleFreeImage={handleToggleFreeImage}
      isLoading={isLoading}
      isSheetConnected={isSheetConnected}
      onOpenPricing={() => setActiveTab('pricing')}
    >
      <div className={activeTab === 'generate' ? 'contents' : 'hidden'}>
        <VideoGenerator 
          onGenerated={addToHistory} 
          history={history} 
          onOpenPricing={() => setActiveTab('pricing')}
          profile={profile}
          onKeyError={() => setHasApiKey(false)}
          activeTasks={activeTasks}
          setActiveTasks={setActiveTasks}
          analyzedScript={analyzedScript}
          setAnalyzedScript={setAnalyzedScript}
          directorScript={directorScript}
          setDirectorScript={setDirectorScript}
          seamlessScript={seamlessScript}
          setSeamlessScript={setSeamlessScript}
          targetLink={targetLink}
          setTargetLink={setTargetLink}
          batchResults={batchResults}
          setBatchResults={setBatchResults}
          outputLanguage={outputLanguage}
          setOutputLanguage={setOutputLanguage}
          userPlan={userPlan as any}
          credit={credit}
          setCredit={setCredit}
          email={email}
          phone={phone}
          projectName={projectName}
          apiKeys={profile.role === 'admin' ? [...apiKeys, ...adminAllKeys] : apiKeys}
          hasApiKey={hasApiKey}
          onOpenKeyPicker={handleOpenKeyPicker}
          deductCredit={deductCredit}
          useProjectKey={useProjectKey}
        />
      </div>

      <div className={activeTab === 'promptToVoice' ? 'contents' : 'hidden'}>
        <PromptToVoice 
          outputLanguage={outputLanguage}
          profile={profile}
          useProjectKey={useProjectKey}
          deductCredit={deductCredit}
          credit={credit}
          userPlan={userPlan as any}
          apiKeys={profile.role === 'admin' ? [...apiKeys, ...adminAllKeys] : apiKeys}
        />
      </div>

      {activeTab === 'pricing' && (
        <Pricing 
          onClose={() => setActiveTab('generate')} 
          onUpdateProfile={updateProfile}
          currentProfile={profile}
          outputLanguage={outputLanguage}
        />
      )}
    </Layout>
  );
};

export default App;
