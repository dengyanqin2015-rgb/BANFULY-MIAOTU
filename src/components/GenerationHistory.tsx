import React from 'react';
import { ImageHistory } from '../types/index';

interface GenerationHistoryProps {
  history: ImageHistory[];
  setHoveredPreviewImage: (img: { url: string, title: string } | null) => void;
  handleDownload: (url: string, title: string) => void;
}

export const GenerationHistory: React.FC<GenerationHistoryProps> = ({
  history,
  setHoveredPreviewImage,
  handleDownload
}) => {
  return (
    <div className="animate-slide-up max-w-6xl mx-auto w-full">
      <div className="flex items-end justify-between mb-10">
        <div>
          <div className="section-label mb-3 text-[#0071e3]">Generation History</div>
          <h1 className="text-4xl font-black tracking-tighter text-black">生图历史记录</h1>
        </div>
        <div className="text-[10px] font-black uppercase tracking-widest text-[#86868b] bg-[#F5F5F7] px-4 py-2 rounded-full border border-black/5">
          共 {history.length} 张生成图
        </div>
      </div>

      {history.length === 0 ? (
        <div className="apple-card bg-white border-black/10 p-20 flex flex-col items-center justify-center text-center shadow-2xl">
          <div className="w-20 h-20 rounded-full bg-[#F5F5F7] flex items-center justify-center text-black/10 mb-6">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-xl font-black text-black mb-2">暂无生成记录</h3>
          <p className="text-sm font-bold text-[#86868b]">开始您的第一次创作吧</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {history.map((item, idx) => (
            <div 
              key={idx} 
              className="apple-card bg-white border-black/10 overflow-hidden group shadow-xl hover:shadow-2xl transition-all"
              onMouseEnter={() => setHoveredPreviewImage({ url: item.url, title: item.prompt })}
              onMouseLeave={() => setHoveredPreviewImage(null)}
            >
              <div className="aspect-square bg-[#F5F5F7] relative overflow-hidden">
                <img 
                  src={item.url} 
                  alt={item.prompt} 
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                  <button 
                    onClick={() => handleDownload(item.url, `gen-${idx}`)}
                    className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center shadow-xl hover:scale-110 transition-all"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="p-4 border-t border-black/5">
                <div className="flex justify-between items-start gap-2">
                  <p className="text-[11px] font-bold text-black line-clamp-2 flex-1 leading-relaxed">
                    {item.prompt}
                  </p>
                  <span className="text-[9px] font-black uppercase tracking-widest text-[#86868b] bg-[#F5F5F7] px-2 py-1 rounded">
                    {item.model}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-[9px] font-black text-[#86868b] uppercase tracking-widest">
                    {new Date(item.timestamp).toLocaleDateString()}
                  </span>
                  <span className="text-[9px] font-black text-[#0071e3] uppercase tracking-widest">
                    {item.cost} CREDITS
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
