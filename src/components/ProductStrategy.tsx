import React from 'react';
import { ProductAnalysis, StrategyType } from '../types';

interface ProductStrategyProps {
  productImages: string[];
  removeProductImage: (idx: number) => void;
  compositionRefImage: string | null;
  setCompositionRefImage: (val: string | null) => void;
  strategyType: StrategyType;
  setStrategyType: (val: StrategyType) => void;
  sellingPoints: string;
  setSellingPoints: (val: string) => void;
  allowedElements: string;
  setAllowedElements: (val: string) => void;
  prohibitedElements: string;
  setProhibitedElements: (val: string) => void;
  analysis: ProductAnalysis | null;
  setAnalysis: (val: ProductAnalysis | null) => void;
  updateStoryboard: (id: string, field: string, value: string) => void;
  loading: boolean;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>, setter: (val: string | null) => void) => void;
  onMultipleFilesUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const ProductStrategy: React.FC<ProductStrategyProps> = ({
  productImages,
  removeProductImage,
  compositionRefImage,
  setCompositionRefImage,
  strategyType,
  setStrategyType,
  sellingPoints,
  setSellingPoints,
  allowedElements,
  setAllowedElements,
  prohibitedElements,
  setProhibitedElements,
  analysis,
  setAnalysis,
  updateStoryboard,
  loading,
  onFileUpload,
  onMultipleFilesUpload
}) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-slide-up">
      <div className="lg:col-span-6">
        <div className="apple-card p-8 border-black/10">
          <div className="section-label mb-6 text-[#0071e3]">Step 02 / Strategy</div>
          <h1 className="text-3xl font-extrabold mb-8 tracking-tight leading-tight">解析物理特征，<br/><span className="text-[#86868b]">执行场景化策划建模。</span></h1>
          <div className="flex bg-[#F5F5F7] p-1 rounded-xl mb-8 shadow-inner">
            <button onClick={() => setStrategyType(StrategyType.DETAIL)} className={`flex-1 py-3 rounded-lg text-[12px] font-black transition-all duration-500 ${strategyType === StrategyType.DETAIL ? 'bg-white shadow-md text-black scale-105' : 'text-[#86868b] hover:text-black'}`}>详情页分镜</button>
            <button onClick={() => setStrategyType(StrategyType.MAIN_IMAGE)} className={`flex-1 py-3 rounded-lg text-[12px] font-black transition-all duration-500 ${strategyType === StrategyType.MAIN_IMAGE ? 'bg-white shadow-md text-black scale-105' : 'text-[#86868b] hover:text-black'}`}>营销主图方案</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="bg-[#F5F5F7] p-4 rounded-[24px] border border-black/5 shadow-inner">
              <label className="section-label text-[9px] mb-3 block text-black font-black uppercase tracking-widest">1. 上传产品白底图</label>
              <div className="grid grid-cols-3 gap-3">
                {productImages.map((img, idx) => (
                  <div key={idx} className="aspect-square rounded-xl bg-white border border-black/10 relative group overflow-hidden shadow-sm">
                    <img src={img} className="w-full h-full object-contain p-1" />
                    <button onClick={() => removeProductImage(idx)} className="absolute top-1 right-1 w-5 h-5 bg-black/70 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 scale-75 hover:bg-black transition-all"><i className="fas fa-times text-[9px]"></i></button>
                  </div>
                ))}
                {productImages.length < 6 && (
                  <div className="aspect-square rounded-xl border-2 border-dashed border-black/15 hover:border-[#0071e3]/30 flex flex-col items-center justify-center cursor-pointer bg-white transition-all group" onClick={() => document.getElementById('prod-multi')?.click()}>
                    <i className="fas fa-plus opacity-20 group-hover:opacity-100 mb-1 text-sm"></i>
                    <span className="text-[9px] font-bold opacity-30 group-hover:opacity-100 uppercase">添加</span>
                  </div>
                )}
                <input id="prod-multi" type="file" multiple className="hidden" onChange={onMultipleFilesUpload} />
              </div>
            </div>
            
            {strategyType === StrategyType.MAIN_IMAGE && (
              <div className="bg-[#F5F5F7] p-4 rounded-[24px] border border-black/5 shadow-inner">
                 <label className="section-label text-[9px] mb-3 block text-black font-black uppercase tracking-widest">2. 上传构图参考 (可选)</label>
                 <div 
                   className={`aspect-square w-1/3 rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all duration-700 overflow-hidden relative group shadow-inner ${compositionRefImage ? 'border-transparent' : 'border-black/15 bg-white hover:bg-gray-50 hover:border-[#0071e3]/30'}`}
                   onClick={() => document.getElementById('comp-upload')?.click()}
                 >
                   {compositionRefImage ? (
                     <>
                       <img src={compositionRefImage} className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" />
                       <button onClick={(e) => { e.stopPropagation(); setCompositionRefImage(null); }} className="absolute top-1 right-1 w-5 h-5 bg-black/70 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 scale-75 hover:bg-black transition-all"><i className="fas fa-times text-[9px]"></i></button>
                     </>
                   ) : (
                     <div className="text-center">
                       <i className="fas fa-drafting-compass opacity-20 group-hover:opacity-100 mb-1 text-lg"></i>
                       <p className="text-[9px] font-bold opacity-30 group-hover:opacity-100 uppercase">上传</p>
                     </div>
                   )}
                   <input id="comp-upload" type="file" className="hidden" onChange={(e) => onFileUpload(e, setCompositionRefImage)} />
                 </div>
              </div>
            )}
          </div>
          
          <div className="space-y-6">
            <div className="bg-[#F5F5F7] p-6 rounded-[24px] border border-black/5 shadow-inner">
              <label className="section-label text-[9px] mb-3 block text-black font-black uppercase tracking-widest">核心卖点注入</label>
              <textarea className="w-full bg-white border border-black/10 rounded-xl p-4 text-[13px] font-bold text-black focus:ring-2 focus:ring-[#0071e3]/20 outline-none transition-all min-h-[100px] shadow-sm no-scrollbar" placeholder="描述核心卖点，用于 AI 画面转化..." value={sellingPoints} onChange={(e) => setSellingPoints(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[#f0f9ff] p-6 rounded-[24px] border border-blue-100/50">
                <label className="section-label text-[9px] text-blue-700 mb-3 block font-black">视觉加分项</label>
                <textarea className="w-full bg-transparent border-none text-[12px] font-bold text-blue-900 focus:ring-0 p-0 min-h-[80px] placeholder:text-blue-200 no-scrollbar" placeholder="允许出现的元素..." value={allowedElements} onChange={(e) => setAllowedElements(e.target.value)} />
              </div>
              <div className="bg-[#fef2f2] p-6 rounded-[24px] border border-red-100/50">
                <label className="section-label text-[9px] text-red-700 mb-3 block font-black">视觉禁忌项</label>
                <textarea className="w-full bg-transparent border-none text-[12px] font-bold text-red-900 focus:ring-0 p-0 min-h-[80px] placeholder:text-red-200 no-scrollbar" placeholder="严禁出现的元素..." value={prohibitedElements} onChange={(e) => setProhibitedElements(e.target.value)} />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="lg:col-span-6">
        <div className="apple-card p-8 h-full bg-[#F5F5F7] overflow-y-auto max-h-[800px] no-scrollbar border-black/5">
          <div className="flex items-center justify-between mb-8 sticky top-0 bg-[#F5F5F7]/90 backdrop-blur-md z-10 pb-4 border-b border-black/5">
            <div className="section-label text-black/40">{strategyType === StrategyType.DETAIL ? 'Storyboard' : 'Marketing Schemes'} Preview</div>
          </div>
          {!analysis ? (
            <div className="h-[400px] flex flex-col items-center justify-center opacity-30 italic text-xs text-black">
              {loading ? (
                <div className="flex flex-col items-center gap-4">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0071e3]"></div>
                  <p>正在执行策划建模...</p>
                </div>
              ) : <p>等待模型输出创意架构...</p>}
            </div>
          ) : (
            <div className="space-y-6 animate-slide-up">
              <div className="bg-black text-white p-8 rounded-[32px] shadow-xl relative overflow-hidden group">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                  <span className="section-label text-white/50 tracking-widest text-[9px]">视觉物理基因模型</span>
                </div>
                <textarea 
                  className="w-full bg-transparent border-none text-white text-[15px] font-bold leading-relaxed opacity-90 focus:ring-0 p-0 resize-none no-scrollbar"
                  value={analysis.physical_features}
                  onChange={(e) => setAnalysis(prev => prev ? { ...prev, physical_features: e.target.value } : null)}
                  rows={4}
                />
              </div>
              {analysis.storyboards.map((s, i) => (
                <div key={s.id} className="bg-white p-6 rounded-[24px] border border-black/5 shadow-sm group hover:shadow-md transition-all">
                  <div className="flex justify-between items-center mb-4">
                    <span className="bg-[#F5F5F7] text-black px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest border border-black/5 uppercase">{strategyType === StrategyType.DETAIL ? '分镜' : '主图方案'} 0{i+1} / {s.title}</span>
                    <span className="text-[9px] font-black opacity-30 uppercase">{s.prominence}</span>
                  </div>
                  <div className="space-y-3">
                    <div className="bg-[#fbfbfd] p-4 rounded-xl border border-black/5 shadow-inner">
                      <span className="text-[8px] font-black opacity-30 block mb-1 uppercase tracking-widest">营销文案内容</span>
                      <textarea 
                        className="w-full bg-transparent border-none text-[15px] font-black text-black leading-tight focus:ring-0 p-0 resize-none no-scrollbar"
                        value={s.copy}
                        onChange={(e) => updateStoryboard(s.id, 'copy', e.target.value)}
                        rows={2}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                       <div className="p-3 bg-[#F5F5F7] rounded-xl border border-black/5"><span className="text-[7px] font-black opacity-30 block mb-1 uppercase">建议占位</span><input 
                         className="w-full bg-transparent border-none text-[10px] font-black text-black focus:ring-0 p-0 text-right"
                         value={s.placement}
                         onChange={(e) => updateStoryboard(s.id, 'placement', e.target.value)}
                       /></div>
                       <div className="p-3 bg-[#F5F5F7] rounded-xl border border-black/5"><span className="text-[7px] font-black opacity-30 block mb-1 uppercase">建议字号</span><input 
                         className="w-full bg-transparent border-none text-[10px] font-black text-black focus:ring-0 p-0 text-right"
                         value={s.font_size}
                         onChange={(e) => updateStoryboard(s.id, 'font_size', e.target.value)}
                       /></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
