
import React from 'react';
import { ImageHistoryItem } from '../types';

interface HistoryPanelProps {
  imageHistory: ImageHistoryItem[];
  historyLoading: boolean;
  selectedHistoryIds: Set<string>;
  toggleHistorySelection: (id: string) => void;
  deleteHistoryItem: (id: string) => void;
  deleteSelectedHistory: () => void;
  downloadSelectedHistory: () => void;
  setZoomedImageUrl: (url: string | null) => void;
}

export const HistoryPanel: React.FC<HistoryPanelProps> = ({
  imageHistory,
  historyLoading,
  selectedHistoryIds,
  toggleHistorySelection,
  deleteHistoryItem,
  deleteSelectedHistory,
  downloadSelectedHistory,
  setZoomedImageUrl
}) => {
  return (
    <div className="animate-slide-up">
      <div className="flex items-end justify-between mb-10">
        <div>
          <div className="section-label mb-3 text-[#0071e3]">Generation History</div>
          <h1 className="text-4xl font-black tracking-tighter text-black">生图历史</h1>
          <p className="text-[#86868b] text-sm mt-2">查看并管理您过往生成的商业视觉作品</p>
        </div>
        <div className="flex gap-2">
          {selectedHistoryIds.size > 0 && (
            <>
              <button 
                onClick={downloadSelectedHistory}
                className="px-4 py-2 bg-black text-white rounded-lg text-[11px] font-bold shadow-lg hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-2"
              >
                <i className="fas fa-download"></i> 下载选中 ({selectedHistoryIds.size})
              </button>
              <button 
                onClick={deleteSelectedHistory}
                className="px-4 py-2 bg-red-500 text-white rounded-lg text-[11px] font-bold shadow-lg hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-2"
              >
                <i className="fas fa-trash"></i> 删除选中
              </button>
            </>
          )}
        </div>
      </div>

      {historyLoading ? (
        <div className="h-[400px] flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0071e3]"></div>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {imageHistory.map(h => (
            <div key={h.id} className={`apple-card p-0 bg-white border-black/10 shadow-xl overflow-hidden group relative transition-all duration-500 ${selectedHistoryIds.has(h.id) ? 'ring-4 ring-[#0071e3] scale-[0.98]' : 'hover:scale-[1.02]'}`}>
              <div className="aspect-square bg-[#F5F5F7] relative overflow-hidden">
                <img 
                  src={h.imageUrl} 
                  className="w-full h-full object-cover cursor-pointer" 
                  onClick={() => setZoomedImageUrl(h.imageUrl)}
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-3">
                  <button 
                    onClick={() => setZoomedImageUrl(h.imageUrl)}
                    className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md text-white flex items-center justify-center hover:bg-white/40 transition-all"
                  >
                    <i className="fas fa-search-plus"></i>
                  </button>
                  <button 
                    onClick={() => deleteHistoryItem(h.id)}
                    className="w-10 h-10 rounded-full bg-red-500/80 backdrop-blur-md text-white flex items-center justify-center hover:bg-red-500 transition-all"
                  >
                    <i className="fas fa-trash"></i>
                  </button>
                </div>
                <div className="absolute top-2 left-2">
                  <input 
                    type="checkbox" 
                    checked={selectedHistoryIds.has(h.id)}
                    onChange={() => toggleHistorySelection(h.id)}
                    className="w-5 h-5 rounded-md border-white/20 bg-black/20 backdrop-blur-md cursor-pointer"
                  />
                </div>
              </div>
              <div className="p-4">
                <p className="text-[10px] font-bold text-[#86868b] mb-1">{new Date(h.timestamp).toLocaleString()}</p>
                <p className="text-[11px] font-medium text-black line-clamp-2 leading-relaxed opacity-60 group-hover:opacity-100 transition-opacity">{h.prompt}</p>
              </div>
            </div>
          ))}
          {imageHistory.length === 0 && (
            <div className="col-span-full h-[400px] flex flex-col items-center justify-center text-[#86868b] opacity-40 italic">
              <i className="fas fa-images text-6xl mb-6"></i>
              <p className="text-xl font-black">暂无生成历史</p>
              <p className="text-sm mt-2">开始您的第一个商业视觉策划吧</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
