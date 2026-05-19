import React from 'react';

interface CookieToggleProps {
  enabled: boolean;
  onToggle: (val: boolean) => void;
  label?: string;
}

export const CookieToggle: React.FC<CookieToggleProps> = ({ enabled, onToggle, label }) => {
  return (
    <div className="flex items-center gap-2">
      {label && <span className="text-sm">{label}</span>}
      <button
        onClick={() => onToggle(!enabled)}
        className={`w-10 h-6 rounded-full transition-colors ${enabled ? 'bg-blue-500' : 'bg-gray-400'}`}
      >
        <span className={`block w-4 h-4 bg-white rounded-full mx-1 transition-transform ${enabled ? 'translate-x-4' : ''}`} />
      </button>
    </div>
  );
};
