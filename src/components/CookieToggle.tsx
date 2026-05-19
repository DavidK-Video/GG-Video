import React, { useState } from 'react';

interface CookieToggleProps {
  useCookieMode: boolean;
  onToggle: (val: boolean) => void;
  cookieString: string;
  onCookieChange: (s: string) => void;
  outputLanguage?: 'EN' | 'VN';
}

export const CookieToggle: React.FC<CookieToggleProps> = ({
  useCookieMode,
  onToggle,
  cookieString,
  onCookieChange,
  outputLanguage = 'VN',
}) => {
  const [showInput, setShowInput] = useState(false);

  const cookieCount = cookieString.trim()
    ? cookieString.split(';').filter(c => c.trim()).length
    : 0;

  return (
    <div className="mt-3 mb-2 rounded-2xl bg-slate-800 px-3 py-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-300">
            🍪 {outputLanguage === 'VN' ? 'Cookie Mode' : 'Cookie Mode'}
          </span>
          {cookieCount > 0 && (
            <span className="bg-emerald-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full">
              {cookieCount} {outputLanguage === 'VN' ? 'CÒN COOKIE' : 'COOKIES'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowInput(v => !v)}
            className="text-slate-400 hover:text-white text-[12px] transition-colors"
            title={outputLanguage === 'VN' ? 'Nhập / Cập nhật Cookie' : 'Enter / Update Cookie'}
          >
            ⚙️
          </button>
          <button
            onClick={() => onToggle(!useCookieMode)}
            className={`w-10 h-5 rounded-full transition-colors relative ${useCookieMode ? 'bg-blue-500' : 'bg-slate-600'}`}
          >
            <span
              className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${useCookieMode ? 'left-5' : 'left-0.5'}`}
            />
          </button>
        </div>
      </div>
      {showInput && (
        <div className="mt-2">
          <textarea
            value={cookieString}
            onChange={e => onCookieChange(e.target.value)}
            placeholder={outputLanguage === 'VN' ? '↓ NHẬP / CẬP NHẬT COOKIE' : '↓ ENTER / UPDATE COOKIE'}
            className="w-full h-20 p-2 bg-slate-700 text-slate-200 text-[8px] rounded-xl border border-slate-600 outline-none resize-none placeholder-slate-500 font-mono"
          />
        </div>
      )}
    </div>
  );
};
