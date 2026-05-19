import React from 'react';
import { VideoEngine, VIDEO_ENGINES } from '../services/videoEngines';
import { motion } from 'motion/react';
import { CheckCircle2 } from 'lucide-react';

interface EngineSelectorProps {
  selected: VideoEngine;
  onChange: (engine: VideoEngine) => void;
  disabled?: boolean;
}

export const EngineSelector: React.FC<EngineSelectorProps> = ({ selected, onChange, disabled }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
      {VIDEO_ENGINES.map((engine) => (
        <motion.button
          key={engine.id}
          whileHover={!disabled ? { scale: 1.02 } : {}}
          whileTap={!disabled ? { scale: 0.98 } : {}}
          onClick={() => !disabled && onChange(engine.id)}
          disabled={disabled}
          className={`relative p-3 rounded-xl border-2 text-left transition-all duration-300 ${
            selected === engine.id
              ? 'bg-slate-800/80 border-[#4285F4] shadow-[0_0_15px_rgba(66,133,244,0.3)]'
              : 'bg-slate-900/50 border-slate-700/50 opacity-70 hover:opacity-100'
          } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
          style={selected === engine.id ? { borderColor: engine.color } : {}}
        >
          <div className="flex justify-between items-start mb-2">
            <span 
              className="text-[10px] font-bold px-1.5 py-0.5 rounded text-white" 
              style={{ backgroundColor: engine.color }}
            >
              {engine.badge}
            </span>
            {selected === engine.id && (
              <CheckCircle2 size={16} className="text-[#4285F4]" style={{ color: engine.color }} />
            )}
          </div>
          
          <h3 className="font-bold text-sm text-white mb-1">{engine.name}</h3>
          <p className="text-[10px] text-slate-400 leading-tight">
            {engine.quality}
          </p>

          {selected === engine.id && (
             <motion.div 
               layoutId="engine-glow"
               className="absolute inset-0 rounded-xl pointer-events-none"
               style={{ boxShadow: `inset 0 0 10px ${engine.color}22` }}
             />
          )}
        </motion.button>
      ))}
    </div>
  );
};
