
import React from 'react';
import { GenerationHistory } from '../types';
import { translate } from '../i18n';

interface HistoryProps {
  history: GenerationHistory[];
  outputLanguage: 'EN' | 'VN';
}

export const History: React.FC<HistoryProps> = ({ history, outputLanguage }) => {
  if (history.length === 0) {
    return (
      <div className="text-center py-20 bg-slate-800/30 rounded-3xl border border-dashed border-slate-700">
        <svg className="w-16 h-16 mx-auto mb-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        <p className="text-slate-400">{translate('NO_VIDEOS', outputLanguage)}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {history.map((item) => (
        <div key={item.id} className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden hover:shadow-xl hover:shadow-indigo-900/10 transition-all group">
          <div className="aspect-video bg-black relative flex items-center justify-center">
            <video src={item.url} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition" />
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition bg-black/40">
              <a 
                href={item.url} 
                target="_blank" 
                rel="noreferrer"
                className="bg-white text-slate-900 px-4 py-2 rounded-lg font-bold text-sm"
              >
                {translate('VIEW_DETAILS', outputLanguage)}
              </a>
            </div>
          </div>
          <div className="p-4">
            <div className="flex justify-between items-start mb-2">
              <span className="text-[7px] uppercase font-bold text-indigo-400 bg-indigo-900/30 px-2 py-0.5 rounded">
                {translate(item.mode as any, outputLanguage)}
              </span>
              <span className="text-[9px] text-slate-500">
                {new Date(item.timestamp).toLocaleDateString()}
              </span>
            </div>
            <p className="text-[11px] text-slate-300 line-clamp-2 italic">"{item.prompt}"</p>
          </div>
        </div>
      ))}
    </div>
  );
};
