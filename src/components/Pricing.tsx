
import React, { useState } from 'react';
import { SUBSCRIPTION_PLANS, BANK_INFO, SYSTEM_PRO_KEYS } from '../constants';
import { SubscriptionPlan, UserProfile } from '../types';

import { translate } from '../i18n';

interface PricingProps {
  onClose?: () => void;
  onUpdateProfile: (profile: UserProfile) => void;
  currentProfile: UserProfile;
  outputLanguage: 'EN' | 'VN';
}

export const Pricing: React.FC<PricingProps> = ({ onClose, onUpdateProfile, currentProfile, outputLanguage }) => {
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [showPaymentWindow, setShowPaymentWindow] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const handleSelectPlan = (plan: SubscriptionPlan) => {
    setSelectedPlan(plan);
    if (plan.id === 'free_unlimited') {
      if (window.aistudio?.openSelectKey) {
        window.aistudio.openSelectKey().then(() => {
          handleConfirmActivation(plan);
        });
      } else {
        alert(translate('API_KEY_REQUIRED_ALERT', outputLanguage));
      }
    } else {
      setShowPaymentWindow(true);
    }
  };

  const handleConfirmActivation = (planOverride?: SubscriptionPlan) => {
    const plan = planOverride || selectedPlan;
    if (!plan) return;

    setIsVerifying(true);
    setTimeout(() => {
      if (plan.id === 'pro_1') {
        sessionStorage.setItem('veopro_custom_key', SYSTEM_PRO_KEYS.PRO1);
      } else if (plan.id === 'pro_9') {
        sessionStorage.setItem('veopro_custom_key', SYSTEM_PRO_KEYS.PRO9);
      }

      const newProfile: UserProfile = {
        ...currentProfile,
        accountType: translate(plan.name as any, outputLanguage),
        expiryDate: plan.duration === 'FREE_DURATION' ? translate('FREE_DURATION', outputLanguage) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString(outputLanguage === 'VN' ? 'vi-VN' : 'en-US'),
        limitText: translate(plan.videoLimitText as any, outputLanguage),
        licenseInfo: `Bản quyền: YOHU-PRO Studio. Gói: ${translate(plan.name as any, outputLanguage)}`
      };

      onUpdateProfile(newProfile);
      setIsVerifying(false);
      setShowPaymentWindow(false);
      alert(translate('ACTIVATION_SUCCESS', outputLanguage, { name: translate(plan.name as any, outputLanguage), id: currentProfile.machineId }));
      if (onClose) onClose();
    }, 2000);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-2xl flex items-center justify-center z-[100] p-2 animate-in fade-in duration-500">
      <div className="bg-white rounded-[2rem] shadow-[0_0_100px_rgba(0,0,0,0.6)] w-full max-w-6xl overflow-hidden flex flex-col border-4 border-slate-100 max-h-[95vh]">
        
        {/* Header - Font nhỏ hơn */}
        <div className="bg-[#0f172a] text-white px-8 py-4 flex items-center justify-between border-b border-white/5 flex-shrink-0">
          <div className="flex items-center space-x-4">
            <div className="w-4 h-4 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_15px_rgba(52,211,153,0.8)]"></div>
            <div className="flex flex-col">
              <span className="text-[8px] font-black uppercase tracking-[0.3em] text-emerald-400 italic">{translate('COPYRIGHT_CENTER', outputLanguage)}</span>
              <span className="text-[9px] text-white/40 font-bold uppercase tracking-[0.4em] italic">{translate('AI_CINEMA_SYSTEM', outputLanguage)} • ID: {currentProfile.machineId}</span>
            </div>
          </div>
          <button onClick={onClose} className="hover:bg-red-600 hover:text-white text-slate-400 w-10 h-10 rounded-full flex items-center justify-center transition-all font-black text-xl shadow-inner active:scale-90">✕</button>
        </div>

        <div className="p-8 overflow-y-auto flex flex-col items-center flex-1 bg-slate-50/30 custom-scrollbar">
          <h2 className="text-2xl font-black text-slate-900 mb-2 tracking-tighter uppercase italic text-center">{translate('PRICING_TITLE', outputLanguage)}</h2>
          <p className="text-slate-400 font-bold text-[7px] mb-8 uppercase tracking-[0.6em] text-center italic">{translate('PRICING_SUBTITLE', outputLanguage)}</p>

          {/* Grid các gói - Chữ nhỏ hơn, hiển thị toàn bộ */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl mb-6">
            {SUBSCRIPTION_PLANS.map((plan) => (
              <div 
                key={plan.id} 
                className={`bg-white rounded-[2rem] border-2 flex flex-col items-center p-6 transition-all duration-500 group cursor-pointer relative ${selectedPlan?.id === plan.id ? 'border-emerald-500 shadow-2xl scale-105' : 'border-slate-100 hover:border-indigo-200'}`}
                onClick={() => setSelectedPlan(plan)}
              >
                {currentProfile.accountType === translate(plan.name as any, outputLanguage) && (
                   <div className="absolute -top-3 bg-indigo-600 text-white px-4 py-1 rounded-full text-[8px] font-black uppercase shadow-lg z-10 tracking-[0.2em] italic">{translate('CURRENT_PLAN', outputLanguage)}</div>
                )}
                
                <h3 className="text-sm font-black text-slate-800 mb-6 uppercase tracking-tight text-center italic">{translate(plan.name as any, outputLanguage)}</h3>
                
                <div className="w-full space-y-2 mb-8">
                  <div className="bg-emerald-50 py-2 px-4 rounded-xl text-center border border-emerald-100">
                    <span className="text-[7px] font-black text-emerald-800 uppercase italic">{translate('DURATION_LABEL', outputLanguage)} {translate(plan.duration as any, outputLanguage)}</span>
                  </div>
                  <div className="bg-slate-900 py-3 px-4 rounded-xl text-center shadow-lg">
                    <span className="text-[8px] font-black text-emerald-400 uppercase italic tracking-tighter">{translate(plan.videoLimitText as any, outputLanguage)}</span>
                  </div>
                  <div className="bg-slate-50 py-2 px-4 rounded-xl text-center border border-slate-100">
                    <span className="text-[8px] font-black text-slate-600 uppercase italic">⚡ {plan.concurrentLimit} {translate('RENDER_THREADS_LABEL', outputLanguage)}</span>
                  </div>
                  <div className="bg-indigo-50 py-2 px-4 rounded-xl text-center border border-indigo-100">
                    <span className="text-[8px] font-black text-indigo-800 uppercase italic">{translate(plan.stitchTime as any, outputLanguage)}</span>
                  </div>
                </div>

                <div className="text-2xl font-black text-slate-900 mb-1 italic">
                  {outputLanguage === 'VN' ? translate(plan.price as any, outputLanguage) : (
                    plan.id === 'free_unlimited' ? translate('FREE_PLAN_PRICE_USD', outputLanguage) : (
                      plan.id === 'pro_1' ? translate('PRO1_PLAN_PRICE_USD', outputLanguage) : translate('PRO9_PLAN_PRICE_USD', outputLanguage)
                    )
                  )}
                </div>
                <div className="text-[8px] text-slate-400 font-black mb-8 uppercase tracking-widest italic">{translate(plan.subtitle as any, outputLanguage)}</div>

                <button 
                  onClick={(e) => { e.stopPropagation(); handleSelectPlan(plan); }}
                  className={`w-full py-4 rounded-xl font-black text-[9px] uppercase tracking-widest italic transition active:scale-95 ${currentProfile.accountType === translate(plan.name as any, outputLanguage) ? 'bg-slate-100 text-slate-400 cursor-default' : (plan.id === 'free_unlimited' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-[#0f172a] text-white hover:bg-slate-800 shadow-xl')}`}
                >
                  {currentProfile.accountType === translate(plan.name as any, outputLanguage) ? translate('ACTIVATED', outputLanguage) : (plan.id === 'free_unlimited' ? translate('SETUP_API_KEY', outputLanguage) : translate('ACTIVATE_PLAN', outputLanguage))}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Cửa sổ thanh toán - VietQR */}
        {showPaymentWindow && selectedPlan && (
          <div className="fixed inset-0 bg-[#0f172a]/95 backdrop-blur-xl z-[150] flex items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-300">
            <div className="bg-white rounded-[3rem] w-full max-w-4xl shadow-2xl border-[8px] border-indigo-50 flex flex-col md:flex-row overflow-hidden relative">
              <button onClick={() => setShowPaymentWindow(false)} className="absolute top-6 right-6 bg-slate-100 w-10 h-10 rounded-full flex items-center justify-center font-black z-20 shadow-md">✕</button>
              
              <div className="flex-1 p-10 flex flex-col justify-center border-r border-slate-100">
                <div className="bg-indigo-50 text-indigo-700 px-4 py-2 rounded-full w-fit mb-6 border border-indigo-100">
                  <span className="text-[8px] font-black uppercase italic">{translate('PAYMENT_TITLE', outputLanguage)}: {translate(selectedPlan.name as any, outputLanguage)}</span>
                </div>

                <div className="space-y-4">
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest italic mb-1">{translate('BENEFICIARY_BANK', outputLanguage)}</p>
                    <p className="text-xl font-black text-slate-900 italic">{BANK_INFO.bank}</p>
                  </div>
                  <div className="p-6 bg-indigo-50 rounded-[2rem] border-2 border-indigo-100 shadow-inner">
                    <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-1 italic">{translate('ACCOUNT_NUMBER', outputLanguage)}</p>
                    <p className="text-4xl font-black text-indigo-700 select-all italic">{BANK_INFO.account}</p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1 italic">{translate('ACCOUNT_HOLDER', outputLanguage)}</p>
                    <p className="text-lg font-black text-slate-800 uppercase italic">{BANK_INFO.name}</p>
                  </div>
                  <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200">
                    <p className="text-[11px] font-bold text-amber-900 italic">
                      {translate('PAYMENT_CONTENT', outputLanguage)} <span className="text-red-600 font-black uppercase underline underline-offset-4 decoration-4">{currentProfile.machineId} + {translate(selectedPlan.name as any, outputLanguage)}</span>
                    </p>
                  </div>
                  <button onClick={() => handleConfirmActivation()} disabled={isVerifying} className="w-full py-6 rounded-2xl bg-[#0f172a] text-white font-black text-lg uppercase tracking-widest italic shadow-xl active:scale-95">
                    {isVerifying ? translate('VERIFYING', outputLanguage) : translate('CONFIRM_TRANSFER', outputLanguage)}
                  </button>
                </div>
              </div>

              <div className="flex-1 bg-slate-50 p-10 flex flex-col items-center justify-center">
                <div className="bg-white p-6 rounded-[2.5rem] shadow-xl border-4 border-white mb-6 transform hover:scale-105 transition-all">
                  <img src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=MB|${BANK_INFO.account}|KhaiPham|${selectedPlan.price.replace(/,/g, '').replace(' VNĐ', '')}|${currentProfile.machineId}+${translate(selectedPlan.name as any, outputLanguage)}`} className="w-64 h-64 rounded-xl" alt="VietQR" />
                </div>
                <div className="text-center bg-white px-8 py-4 rounded-[2rem] border-2 border-indigo-100 shadow-lg">
                  <p className="text-[8px] font-black text-slate-400 uppercase italic mb-1">{translate('TRANSACTION_VALUE', outputLanguage)}</p>
                  <p className="text-3xl font-black text-indigo-600 italic">
                    {outputLanguage === 'VN' ? translate(selectedPlan.price as any, outputLanguage) : (
                      selectedPlan.id === 'free_unlimited' ? translate('FREE_PLAN_PRICE_USD', outputLanguage) : (
                        selectedPlan.id === 'pro_1' ? translate('PRO1_PLAN_PRICE_USD', outputLanguage) : translate('PRO9_PLAN_PRICE_USD', outputLanguage)
                      )
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="bg-slate-100 px-8 py-3 flex justify-between items-center text-[9px] font-black text-slate-400 uppercase tracking-widest flex-shrink-0 border-t border-slate-200 italic">
           <span>YOHU-PRO v3.7 • VEO 3.1 PRO SYSTEM</span>
           <span className="text-emerald-600">{translate('AUTO_ACTIVATION', outputLanguage)}</span>
        </div>
      </div>
    </div>
  );
};
