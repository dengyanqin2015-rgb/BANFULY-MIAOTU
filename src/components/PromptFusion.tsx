import React from 'react';
import { FinalPrompt, ProductAnalysis, StrategyType, AppStep } from '../types';

interface PromptFusionProps {
  analysis: ProductAnalysis | null;
  strategyType: StrategyType;
  finalPrompts: FinalPrompt[];
  globalSelectedFont: string;
  setGlobalSelectedFont: (font: string) => void;
  cardRefImages: Record<string, string>;
  handleCardRefImage: (e: React.ChangeEvent<HTMLInputElement>, id: string) => void;
  cardGenStatus: Record<string, 'idle' | 'loading' | 'success' | 'error'>;
  cardGeneratedImages: Record<string, string>;
  setActiveGenCardId: (id: string | null) => void;
  updatePromptCopy: (id: string, copy: string) => void;
  updatePromptPlacement: (id: string, placement: string) => void;
  downloadImage: (url: string, name: string) => void;
  setHoveredPreviewImage: (img: { url: string; title: string } | null) => void;
  setStep: (step: AppStep) => void;
  PLACEMENT_OPTIONS: string[];
}

export const PromptFusion: React.FC<PromptFusionProps> = ({
  analysis,
  strategyType,
  finalPrompts,
  globalSelectedFont,
  setGlobalSelectedFont,
  cardRefImages,
  handleCardRefImage,
  cardGenStatus,
  cardGeneratedImages,
  setActiveGenCardId,
  updatePromptCopy,
  updatePromptPlacement,
  downloadImage,
  setHoveredPreviewImage,
  setStep,
  PLACEMENT_OPTIONS
}) => {
  return (
    <div className="animate-slide-up">
      <div className="flex items-end justify-between mb-12">
        <div>
          <div className="section-label mb-3 text-[#0071e3]">Step 03 / Fusion & Render</div>
          <h1 className="text-4xl font-black tracking-tighter text-black uppercase leading-none">生成方案渲染</h1>
          <p className="text-[12px] text-[#86868b] font-bold mt-3 uppercase tracking-widest">
            基于视觉宪法与营销策略，融合生成最终的提示词方案并执行渲染。
          </p>
        </div>
      </div>

      <div className="apple-card p-10 mb-12 border-black/10 bg-white shadow-xl">
        <div className="flex items-center gap-6 mb-8">
          <div className="w-14 h-14 rounded-2xl bg-[#F5F5F7] flex items-center justify-center text-[#0071e3] shadow-inner">
            <i className="fas fa-font text-xl"></i>
          </div>
          <div>
            <h3 className="text-xl font-black text-black tracking-tight">项目全局字体方案</h3>
            <p className="text-[13px] text-[#6e6e73] font-medium">模型将以此为基准进行视觉排版模拟</p>
          </div>
        </div>
        <div className="relative group">
          <select value={globalSelectedFont} onChange={(e) => setGlobalSelectedFont(e.target.value)} className="w-full bg-[#F5F5F7] border border-black/10 rounded-[18px] p-4 text-[15px] font-black text-black appearance-none shadow-sm transition-all hover:border-[#0071e3]/30">
            {analysis?.global_font_options.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none opacity-40"><i className="fas fa-chevron-down text-xs"></i></div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
        {finalPrompts.length === 0 ? (
          <div className="col-span-full h-[400px] flex flex-col items-center justify-center bg-[#F5F5F7] rounded-[40px] border border-dashed border-black/10 opacity-50">
            <i className="fas fa-layer-group text-4xl mb-4"></i>
            <p className="text-sm font-bold">暂无生成方案，请返回上一步重新执行建模</p>
            <button onClick={() => setStep(AppStep.PRODUCT_STRATEGY)} className="mt-4 text-[#0071e3] font-bold border-b border-[#0071e3]">返回营销策划</button>
          </div>
        ) : finalPrompts.map((p, idx) => (
          <div key={p.id} className="apple-card p-8 flex flex-col group h-full border-black/10 bg-white shadow-md hover:shadow-xl transition-all duration-700">
            <div className="flex justify-between items-center mb-8">
              <span className="bg-[#F5F5F7] px-4 py-1.5 rounded-full text-[10px] font-black text-black border border-black/5 tracking-widest uppercase">
                {p.id === 'preview_grid' ? 'GLOBAL PREVIEW' : `${strategyType === StrategyType.DETAIL ? 'STORYBOARD' : 'SCHEME'} ${idx}`}
              </span>
              <div className="flex gap-2">
                <div 
                  className="w-10 h-10 rounded-full bg-[#F5F5F7] border border-black/10 flex items-center justify-center cursor-pointer hover:bg-white transition-all shadow-sm group/ref relative overflow-hidden"
                  onClick={() => document.getElementById(`ref-${p.id}`)?.click()}
                  title="上传参考图"
                >
                  {cardRefImages[p.id] ? <img src={cardRefImages[p.id]} className="w-full h-full object-cover rounded-full" /> : <i className="fas fa-image text-[#6e6e73] opacity-40 text-[12px]"></i>}
                  <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-black text-white rounded-full flex items-center justify-center text-[7px] opacity-0 group-hover/ref:opacity-100 transition-opacity"><i className="fas fa-plus"></i></div>
                </div>
                <input id={`ref-${p.id}`} type="file" className="hidden" onChange={(e) => handleCardRefImage(e, p.id)} />
                <button 
                  onClick={() => setActiveGenCardId(p.id)} 
                  disabled={cardGenStatus[p.id] === 'loading'}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-md hover:scale-110 active:scale-90 ${cardGenStatus[p.id] === 'loading' ? 'bg-orange-500 text-white animate-breathe-orange' : 'bg-black text-white'}`}
                >
                  {cardGenStatus[p.id] === 'loading' ? <i className="fas fa-circle-notch fa-spin text-[12px]"></i> : <i className="fas fa-wand-magic-sparkles text-[12px]"></i>}
                </button>
              </div>
            </div>
            
            <h3 className="text-xl font-black mb-6 text-black tracking-tight">{p.title}</h3>

            <div 
              className="aspect-[4/3] rounded-[24px] overflow-hidden bg-[#F5F5F7] mb-8 border border-black/10 relative group/img shadow-inner cursor-zoom-in"
              onMouseEnter={() => cardGeneratedImages[p.id] && setHoveredPreviewImage({ url: cardGeneratedImages[p.id], title: p.title })}
              onMouseLeave={() => setHoveredPreviewImage(null)}
            >
              {cardGeneratedImages[p.id] ? (
                <>
                  <img 
                    src={cardGeneratedImages[p.id]} 
                    className="w-full h-full object-cover transition-all duration-700 hover:opacity-80" 
                    alt={p.title}
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/10 transition-all flex items-center justify-center pointer-events-none">
                     <i className="fas fa-expand text-white opacity-0 group-hover/img:opacity-100 transition-opacity text-xl drop-shadow-lg scale-125"></i>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); downloadImage(cardGeneratedImages[p.id], p.title); }} className="absolute bottom-4 right-4 w-11 h-11 bg-white/95 backdrop-blur-xl rounded-full shadow-lg flex items-center justify-center hover:scale-110 transition-all text-black z-20"><i className="fas fa-download text-sm"></i></button>
                </>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center opacity-40 italic text-[10px] gap-2">
                  <i className="fas fa-palette text-3xl opacity-10 mb-1"></i>
                  <p className="font-black uppercase tracking-[0.2em]">{cardGenStatus[p.id] === 'loading' ? '正在渲染细节...' : '等待任务触发'}</p>
                </div>
              )}
            </div>

            <div className="space-y-6 flex-1 flex flex-col">
              <div className="bg-[#F5F5F7] p-5 rounded-[20px] border border-black/5 shadow-inner">
                <div className="section-label text-[8px] mb-2 opacity-60 font-black flex justify-between tracking-widest uppercase">
                   <span>核心营销文案</span>
                   <span className="text-[#0071e3] opacity-60 text-[7px] cursor-pointer">修改</span>
                </div>
                <textarea className="w-full bg-transparent border-none text-[15px] font-black text-black leading-snug focus:ring-0 p-0 resize-none min-h-[40px] tracking-tight no-scrollbar" value={p.copy} rows={2} onChange={(e) => updatePromptCopy(p.id, e.target.value)} />
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                 <div className="p-4 bg-white border border-black/10 rounded-xl shadow-sm">
                   <span className="section-label text-[7px] opacity-40 block mb-1">排版位置</span>
                   <select 
                     className="w-full bg-transparent border-none text-[10px] font-black text-black focus:ring-0 p-0 appearance-none"
                     value={p.placement}
                     onChange={(e) => updatePromptPlacement(p.id, e.target.value)}
                   >
                     {PLACEMENT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                     <option value={p.placement}>{p.placement}</option>
                   </select>
                 </div>
                 <div className="p-4 bg-white border border-black/10 rounded-xl shadow-sm"><span className="section-label text-[7px] opacity-40 block mb-1 truncate">选定字体</span><span className="text-[10px] font-black text-black truncate">{globalSelectedFont}</span></div>
              </div>

              <div className="bg-black text-white p-6 rounded-[28px] relative overflow-hidden group/p shadow-lg border border-white/5 flex items-center justify-between">
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Ready to Render</span>
                  </div>
                  <h4 className="text-[16px] font-black tracking-tight">立即执行视觉渲染任务</h4>
                </div>
                <button 
                  onClick={() => setActiveGenCardId(p.id)} 
                  disabled={cardGenStatus[p.id] === 'loading'}
                  className={`relative z-10 w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-xl hover:scale-110 active:scale-90 ${cardGenStatus[p.id] === 'loading' ? 'bg-orange-500 text-white animate-breathe-orange' : 'bg-white text-black'}`}
                >
                  {cardGenStatus[p.id] === 'loading' ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-bolt"></i>}
                </button>
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 blur-2xl group-hover/p:bg-white/10 transition-all duration-700"></div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
