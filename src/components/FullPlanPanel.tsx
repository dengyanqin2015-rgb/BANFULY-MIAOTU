
import React from 'react';
import { StrategyType, Constitution, Analysis, FinalPrompt } from '../types';

interface FullPlanPanelProps {
  strategyType: StrategyType;
  setStrategyType: (type: StrategyType) => void;
  productImages: string[];
  removeProductImage: (idx: number) => void;
  handleMultipleFilesChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  sellingPoints: string;
  setSellingPoints: (val: string) => void;
  allowedElements: string;
  setAllowedElements: (val: string) => void;
  prohibitedElements: string;
  setProhibitedElements: (val: string) => void;
  constitution: Constitution | null;
  setConstitution: (c: Constitution | null) => void;
  compositionRefImage: string | null;
  handleCompositionRefImageChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  loading: boolean;
  runStep2: () => void;
  analysis: Analysis | null;
  finalPrompts: FinalPrompt[];
  setFinalPrompts: (prompts: FinalPrompt[]) => void;
  genAspectRatio: string;
  generateSingleImage: (cardId: string, overrideRefImage?: string) => void;
  cardGenStatus: Record<string, 'idle' | 'loading' | 'done' | 'error'>;
  cardGeneratedImages: Record<string, string>;
  cardRefImages: Record<string, string>;
  handleCardRefImageChange: (cardId: string, e: React.ChangeEvent<HTMLInputElement>) => void;
  executeBulkGen: () => void;
  isBulkLoading: boolean;
  setZoomedImageUrl: (url: string | null) => void;
  downloadImage: (url: string, name: string) => void;
}

export const FullPlanPanel: React.FC<FullPlanPanelProps> = ({
  strategyType,
  setStrategyType,
  productImages,
  removeProductImage,
  handleMultipleFilesChange,
  sellingPoints,
  setSellingPoints,
  allowedElements,
  setAllowedElements,
  prohibitedElements,
  setProhibitedElements,
  constitution,
  setConstitution,
  compositionRefImage,
  handleCompositionRefImageChange,
  loading,
  runStep2,
  analysis,
  finalPrompts,
  setFinalPrompts,
  genAspectRatio,
  generateSingleImage,
  cardGenStatus,
  cardGeneratedImages,
  cardRefImages,
  handleCardRefImageChange,
  executeBulkGen,
  isBulkLoading,
  setZoomedImageUrl,
  downloadImage,
}) => {
  return (
    <div className="animate-slide-up">
      {analysis ? (
        <div className="space-y-12">
          {/* Analysis Result & Prompts */}
          <div className="flex items-end justify-between mb-10">
            <div>
              <div className="section-label mb-3 text-[#0071e3]">Full Plan Strategy</div>
              <h1 className="text-4xl font-black tracking-tighter text-black">全案策划方案</h1>
              <p className="text-[#86868b] text-sm mt-2">基于视觉协议与产品特性生成的全链路视觉资产</p>
            </div>
            <div className="flex gap-3">
              <button 
                onClick={executeBulkGen}
                disabled={isBulkLoading}
                className="px-8 py-3 bg-black text-white rounded-2xl text-[14px] font-black shadow-2xl hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-3"
              >
                {isBulkLoading ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-magic"></i>}
                批量渲染全案视觉
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-10">
            {finalPrompts.map((p, idx) => (
              <div key={p.id} className="apple-card p-8 bg-white border-black/10 shadow-xl flex flex-col lg:flex-row gap-10 group">
                <div className="flex-1 space-y-6">
                  <div className="flex items-center gap-4">
                    <span className="w-10 h-10 rounded-2xl bg-[#F5F5F7] flex items-center justify-center text-black font-black text-sm border border-black/5">{idx + 1}</span>
                    <h3 className="text-2xl font-black tracking-tight">{p.title}</h3>
                  </div>
                  <p className="text-[13px] font-bold text-[#86868b] leading-relaxed">{p.concept}</p>
                  
                  <div className="bg-[#F5F5F7] p-6 rounded-[32px] border border-black/5 space-y-4">
                    <label className="section-label text-[10px] opacity-60">AI 视觉脚本 / Visual Script</label>
                    <textarea 
                      className="w-full bg-transparent border-none p-0 text-[13px] font-bold text-black leading-relaxed focus:ring-0 resize-none h-24 no-scrollbar"
                      value={p.prompt}
                      onChange={(e) => {
                        const newVal = e.target.value;
                        setFinalPrompts(finalPrompts.map(item => item.id === p.id ? { ...item, prompt: newVal } : item));
                      }}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-[#F5F5F7] p-4 rounded-2xl border border-black/5">
                      <label className="section-label text-[9px] mb-2 block opacity-60">核心文案 / Copy</label>
                      <input 
                        className="w-full bg-transparent border-none p-0 text-[12px] font-black text-black outline-none"
                        value={p.copy}
                        onChange={(e) => {
                          const newVal = e.target.value;
                          setFinalPrompts(finalPrompts.map(item => item.id === p.id ? { ...item, copy: newVal } : item));
                        }}
                      />
                    </div>
                    <div className="bg-[#F5F5F7] p-4 rounded-2xl border border-black/5">
                      <label className="section-label text-[9px] mb-2 block opacity-60">排版区域 / Placement</label>
                      <p className="text-[12px] font-black text-black">{p.placement}</p>
                    </div>
                  </div>
                </div>

                <div className="w-full lg:w-[400px] space-y-4">
                  <div 
                    className="aspect-square rounded-[40px] bg-[#F5F5F7] border border-black/5 relative overflow-hidden shadow-inner group/img"
                    style={{ aspectRatio: genAspectRatio.replace(':', '/') }}
                  >
                    {cardGeneratedImages[p.id] ? (
                      <>
                        <img 
                          src={cardGeneratedImages[p.id]} 
                          className="w-full h-full object-cover cursor-zoom-in transition-transform duration-700 group-hover/img:scale-105" 
                          onClick={() => setZoomedImageUrl(cardGeneratedImages[p.id])}
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center gap-4">
                          <button 
                            onClick={() => downloadImage(cardGeneratedImages[p.id], `${p.title}-${idx+1}`)}
                            className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center hover:scale-110 transition-all shadow-xl"
                          >
                            <i className="fas fa-download"></i>
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-[#86868b] opacity-20">
                        {cardGenStatus[p.id] === 'loading' ? (
                          <div className="text-center">
                            <i className="fas fa-circle-notch fa-spin text-4xl mb-4"></i>
                            <p className="text-[11px] font-black uppercase tracking-widest">正在渲染视觉资产...</p>
                          </div>
                        ) : (
                          <>
                            <i className="fas fa-image text-6xl mb-4"></i>
                            <p className="text-[11px] font-black uppercase tracking-widest">等待执行渲染</p>
                          </>
                        )}
                      </div>
                    )}
                    
                    {cardRefImages[p.id] && (
                      <div className="absolute top-4 left-4 w-16 h-16 rounded-2xl border-2 border-white shadow-2xl overflow-hidden">
                        <img src={cardRefImages[p.id]} className="w-full h-full object-cover" />
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button 
                      onClick={() => generateSingleImage(p.id)}
                      disabled={cardGenStatus[p.id] === 'loading'}
                      className={`py-4 rounded-2xl text-[13px] font-black flex items-center justify-center gap-2 transition-all shadow-lg ${cardGenStatus[p.id] === 'loading' ? 'bg-[#F5F5F7] text-[#86868b]' : 'bg-black text-white hover:scale-[1.02]'}`}
                    >
                      {cardGenStatus[p.id] === 'loading' ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-bolt"></i>}
                      {cardGeneratedImages[p.id] ? '重新渲染' : '开始渲染'}
                    </button>
                    <button 
                      onClick={() => document.getElementById(`card-ref-${p.id}`)?.click()}
                      className="py-4 bg-white border border-black/10 rounded-2xl text-[13px] font-black hover:bg-gray-50 transition-all flex items-center justify-center gap-2 shadow-sm"
                    >
                      <i className="fas fa-image"></i> 指定参考图
                    </button>
                    <input id={`card-ref-${p.id}`} type="file" className="hidden" onChange={(e) => handleCardRefImageChange(p.id, e)} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          {/* Left Column: Product Info */}
          <div className="lg:col-span-5 space-y-10">
            <div className="apple-card p-8 bg-white border-black/10 shadow-xl">
              <div className="section-label mb-6 text-[#0071e3]">Step 01 / Product Context</div>
              <h2 className="text-3xl font-black mb-8 tracking-tight">产品核心信息 <span className="text-[#86868b]">定义品牌基因</span></h2>
              
              <div className="space-y-8">
                <div>
                  <label className="section-label text-[10px] mb-3 block opacity-60">上传产品白底图 (最多6张)</label>
                  <div className="grid grid-cols-3 gap-4">
                    {productImages.map((img, idx) => (
                      <div key={idx} className="aspect-square rounded-2xl bg-[#F5F5F7] border border-black/5 relative group overflow-hidden shadow-inner">
                        <img src={img} className="w-full h-full object-contain p-2" />
                        <button onClick={() => removeProductImage(idx)} className="absolute top-2 right-2 w-6 h-6 bg-black/70 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 scale-75 hover:bg-black transition-all"><i className="fas fa-times text-xs"></i></button>
                      </div>
                    ))}
                    {productImages.length < 6 && (
                      <div className="aspect-square rounded-2xl border-2 border-dashed border-black/15 hover:border-[#0071e3]/30 flex flex-col items-center justify-center cursor-pointer bg-[#fbfbfd] transition-all group" onClick={() => document.getElementById('prod-upload')?.click()}>
                        <i className="fas fa-plus opacity-20 group-hover:opacity-100 mb-2"></i>
                        <span className="text-[10px] font-black opacity-30 group-hover:opacity-100 uppercase tracking-widest">添加图片</span>
                      </div>
                    )}
                    <input id="prod-upload" type="file" multiple className="hidden" onChange={handleMultipleFilesChange} />
                  </div>
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="section-label text-[10px] mb-3 block opacity-60">核心卖点 / Selling Points</label>
                    <textarea 
                      className="w-full bg-[#F5F5F7] border border-black/5 rounded-2xl p-4 text-[13px] font-bold outline-none focus:ring-2 focus:ring-[#0071e3]/20 transition-all min-h-[80px]"
                      placeholder="例如：极简设计, 航空级铝材, 100小时续航"
                      value={sellingPoints}
                      onChange={(e) => setSellingPoints(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="section-label text-[10px] mb-3 block opacity-60">允许元素 / Allowed</label>
                      <input 
                        type="text" 
                        className="w-full bg-[#F5F5F7] border border-black/5 rounded-2xl p-4 text-[13px] font-bold outline-none focus:ring-2 focus:ring-[#0071e3]/20 transition-all"
                        placeholder="如：水滴, 绿植"
                        value={allowedElements}
                        onChange={(e) => setAllowedElements(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="section-label text-[10px] mb-3 block opacity-60">禁止元素 / Prohibited</label>
                      <input 
                        type="text" 
                        className="w-full bg-[#F5F5F7] border border-black/5 rounded-2xl p-4 text-[13px] font-bold outline-none focus:ring-2 focus:ring-[#0071e3]/20 transition-all"
                        placeholder="如：人物, 杂乱背景"
                        value={prohibitedElements}
                        onChange={(e) => setProhibitedElements(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Visual Protocol */}
          <div className="lg:col-span-7 space-y-10">
            <div className="apple-card p-8 bg-white border-black/10 shadow-xl">
              <div className="section-label mb-6 text-[#0071e3]">Step 02 / Visual Protocol</div>
              <h2 className="text-3xl font-black mb-8 tracking-tight">视觉协议与构图 <span className="text-[#86868b]">确立审美标准</span></h2>
              
              <div className="space-y-10">
                <div className="bg-[#F5F5F7] p-8 rounded-[40px] border border-black/5 relative overflow-hidden group">
                  {constitution ? (
                    <div className="space-y-6 animate-slide-up">
                      <div className="flex items-center justify-between">
                        <h3 className="text-2xl font-black tracking-tight text-[#0071e3]">{constitution.title}</h3>
                        <button onClick={() => setConstitution(null)} className="text-[11px] font-black text-[#86868b] hover:text-black uppercase tracking-widest">更换协议</button>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                        {[
                          { label: '视觉风格', val: constitution.style },
                          { label: '光影协议', val: constitution.lighting },
                          { label: '色彩方案', val: constitution.color },
                          { label: '构图逻辑', val: constitution.composition },
                          { label: '背景环境', val: constitution.background },
                          { label: '镜头语言', val: constitution.camera }
                        ].map((item, i) => (
                          <div key={i}>
                            <p className="text-[9px] font-black text-black/30 uppercase tracking-widest mb-1">{item.label}</p>
                            <p className="text-[12px] font-bold text-black">{item.val}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-10">
                      <i className="fas fa-scroll text-4xl text-black/10 mb-4"></i>
                      <p className="text-sm font-black text-black/40 uppercase tracking-widest">请先在创意工作流中选择视觉协议</p>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <label className="section-label text-[10px] mb-4 block opacity-60">全案构图参考图 (可选)</label>
                    <div 
                      className={`aspect-video rounded-[32px] border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all duration-700 overflow-hidden relative group shadow-inner ${compositionRefImage ? 'border-transparent' : 'border-black/15 bg-[#fbfbfd] hover:bg-white hover:border-[#0071e3]/30'}`}
                      onClick={() => document.getElementById('comp-ref-upload')?.click()}
                    >
                      {compositionRefImage ? (
                        <div className="relative w-full h-full">
                          <img src={compositionRefImage} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <p className="text-white font-black text-sm uppercase tracking-widest">更换参考图</p>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center">
                          <i className="fas fa-th-large opacity-20 group-hover:opacity-100 mb-2"></i>
                          <p className="text-[10px] font-black text-black/30 uppercase tracking-widest">上传构图参考</p>
                        </div>
                      )}
                      <input id="comp-ref-upload" type="file" className="hidden" onChange={handleCompositionRefImageChange} />
                    </div>
                  </div>
                  <div className="flex flex-col justify-center space-y-6">
                    <div>
                      <label className="section-label text-[10px] mb-4 block opacity-60">策划策略 / Strategy</label>
                      <div className="flex gap-2 bg-[#F5F5F7] p-1.5 rounded-2xl border border-black/5">
                        <button onClick={() => setStrategyType(StrategyType.MAIN)} className={`flex-1 py-3 rounded-xl text-[12px] font-black transition-all ${strategyType === StrategyType.MAIN ? 'bg-white shadow-md text-black' : 'text-[#86868b] hover:text-black'}`}>主图策划</button>
                        <button onClick={() => setStrategyType(StrategyType.DETAIL)} className={`flex-1 py-3 rounded-xl text-[12px] font-black transition-all ${strategyType === StrategyType.DETAIL ? 'bg-white shadow-md text-black' : 'text-[#86868b] hover:text-black'}`}>详情策划</button>
                      </div>
                    </div>
                    <button 
                      onClick={runStep2}
                      disabled={loading || productImages.length === 0 || !constitution}
                      className={`w-full py-6 rounded-[32px] text-[16px] font-black shadow-2xl hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 border-none ${loading || productImages.length === 0 || !constitution ? 'bg-gray-300 cursor-not-allowed' : 'bg-black text-white'}`}
                    >
                      {loading ? (
                        <>
                          <i className="fas fa-circle-notch fa-spin"></i>
                          <span>正在构建视觉策划全案...</span>
                        </>
                      ) : (
                        <>
                          <i className="fas fa-rocket"></i>
                          <span>生成视觉全案策划</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
