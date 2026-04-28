
import React from 'react';
import { DetailStoryboard, AuthState } from '../types';

interface DetailAssistantProps {
  detailStep: number;
  detailLoading: boolean;
  productImages: string[];
  removeProductImage: (idx: number) => void;
  handleMultipleFilesChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  detailProductAnalysis: string;
  setDetailProductAnalysis: (val: string) => void;
  runDetailStep1: () => void;
  detailDesignGuide: string;
  setDetailDesignGuide: (val: string) => void;
  runDetailStep2: () => void;
  detailStoryboards: DetailStoryboard[];
  setDetailStoryboards: React.Dispatch<React.SetStateAction<DetailStoryboard[]>>;
  runDetailStep3: () => void;
  runDetailGenImage: (id: string) => void;
  runDetailBulkGen: () => void;
  runDetailBulkDownload: () => void;
  handleDetailRefImageChange: (id: string, e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const DetailAssistant: React.FC<DetailAssistantProps> = ({
  detailStep,
  detailLoading,
  productImages,
  removeProductImage,
  handleMultipleFilesChange,
  detailProductAnalysis,
  setDetailProductAnalysis,
  runDetailStep1,
  detailDesignGuide,
  setDetailDesignGuide,
  runDetailStep2,
  detailStoryboards,
  setDetailStoryboards,
  runDetailStep3,
  runDetailGenImage,
  runDetailBulkGen,
  runDetailBulkDownload,
  handleDetailRefImageChange,
}) => {
  return (
    <div className="animate-slide-up">
      <div className="flex items-end justify-between mb-10">
        <div>
          <div className="section-label mb-3 text-[#FF7F00]">Detail Assistant</div>
          <h1 className="text-4xl font-black tracking-tighter text-black">详情助手</h1>
          <p className="text-[#86868b] text-sm mt-2">基于产品特性，自动生成详情页设计规范与分镜架构</p>
        </div>
      </div>

      <div className="space-y-8">
        {/* Top Row: Recognition & Specification */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Step 1: Product Recognition */}
          <div className="apple-card p-8 bg-white border-black/10 shadow-xl flex flex-col min-h-[500px]">
            <div className="flex items-center justify-between mb-6">
              <div className="section-label text-[#FF7F00]">Node 01 / Recognition</div>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${detailProductAnalysis ? 'bg-orange-100 text-[#FF7F00]' : 'bg-gray-100 text-gray-400'}`}>
                {detailProductAnalysis ? '已完成' : '进行中'}
              </span>
            </div>
            <h2 className="text-xl font-black mb-4 tracking-tight">产品特性识别 <span className="text-[#86868b]">深度解析核心卖点</span></h2>
            
            <div className="bg-[#F5F5F7] p-4 rounded-2xl border border-black/5 mb-6">
              <label className="section-label text-[9px] mb-3 block text-black font-black uppercase tracking-widest">上传产品白底图 (最多6张)</label>
              <div className="grid grid-cols-3 gap-2">
                {productImages.map((img, idx) => (
                  <div key={idx} className="aspect-square rounded-lg bg-white border border-black/10 relative group overflow-hidden shadow-sm">
                    <img src={img} className="w-full h-full object-contain p-1" />
                    <button onClick={() => removeProductImage(idx)} className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/70 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 scale-75 hover:bg-black transition-all"><i className="fas fa-times text-[8px]"></i></button>
                  </div>
                ))}
                {productImages.length < 6 && (
                  <div className="aspect-square rounded-lg border-2 border-dashed border-black/15 hover:border-[#FF7F00]/30 flex flex-col items-center justify-center cursor-pointer bg-white transition-all group" onClick={() => document.getElementById('detail-prod-upload')?.click()}>
                    <i className="fas fa-plus opacity-20 group-hover:opacity-100 mb-0.5 text-xs"></i>
                    <span className="text-[8px] font-bold opacity-30 group-hover:opacity-100 uppercase">添加</span>
                  </div>
                )}
                <input id="detail-prod-upload" type="file" multiple className="hidden" onChange={handleMultipleFilesChange} />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto max-h-[250px] mb-6 prose-orange border-t border-black/5 pt-4 no-scrollbar">
              {detailProductAnalysis ? (
                <textarea 
                  className="w-full h-full bg-transparent text-[13px] font-medium text-black leading-relaxed border-none focus:ring-0 p-0 outline-none resize-none no-scrollbar"
                  value={detailProductAnalysis}
                  onChange={(e) => setDetailProductAnalysis(e.target.value)}
                  placeholder="产品识别结果..."
                />
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-[#86868b] opacity-40 italic py-10">
                  <i className="fas fa-microchip text-4xl mb-4"></i>
                  <p>等待识别产品...</p>
                </div>
              )}
            </div>
            <button 
              onClick={runDetailStep1} 
              disabled={detailLoading}
              className={`btn-primary w-full py-4 text-white text-[13px] font-black shadow-lg hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 border-none ${productImages.length === 0 ? 'bg-gray-300 cursor-not-allowed' : 'bg-[#FF7F00]'}`}
            >
              {detailLoading && detailStep === 1 ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-microchip"></i>}
              开始识别产品
            </button>
          </div>

          {/* Step 2: Design Specification */}
          <div className="apple-card p-8 bg-white border-black/10 shadow-xl flex flex-col min-h-[500px]">
            <div className="flex items-center justify-between mb-6">
              <div className="section-label text-[#FF7F00]">Node 02 / Specification</div>
              <span className={`px-3 py-1 rounded-full text-[11px] font-black ${detailDesignGuide ? 'bg-orange-100 text-[#FF7F00]' : 'bg-gray-100 text-gray-400'}`}>
                {detailDesignGuide ? '已完成' : '未开始'}
              </span>
            </div>
            <h2 className="text-xl font-black mb-4 tracking-tight">详情设计规范 <span className="text-[#86868b]">大师级视觉基调</span></h2>
            
            <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar pb-2 border-b border-black/5">
              {productImages.map((img, idx) => (
                <div key={idx} className="w-10 h-10 rounded-lg bg-[#F5F5F7] border border-black/5 flex-shrink-0 overflow-hidden">
                  <img src={img} className="w-full h-full object-contain p-1" />
                </div>
              ))}
              {productImages.length === 0 && <div className="text-[10px] text-gray-400 italic">未上传产品图</div>}
            </div>

            <div className="flex-1 overflow-y-auto max-h-[250px] mb-6 prose-orange no-scrollbar">
              {detailDesignGuide ? (
                <textarea 
                  className="w-full h-full bg-transparent text-[13px] font-medium text-black leading-relaxed border-none focus:ring-0 p-0 outline-none resize-none no-scrollbar"
                  value={detailDesignGuide}
                  onChange={(e) => setDetailDesignGuide(e.target.value)}
                  placeholder="设计规范结果..."
                />
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-[#86868b] opacity-40 italic py-10">
                  <i className="fas fa-drafting-compass text-4xl mb-4"></i>
                  <p>等待生成规范...</p>
                </div>
              )}
            </div>
            <button 
              onClick={runDetailStep2} 
              disabled={detailLoading || !detailProductAnalysis}
              className={`btn-primary w-full py-4 text-white text-[13px] font-black shadow-lg hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 border-none ${!detailProductAnalysis ? 'bg-gray-300 cursor-not-allowed' : 'bg-[#FF7F00]'}`}
            >
              {detailLoading && detailStep === 2 ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-drafting-compass"></i>}
              生成设计规范
            </button>
          </div>
        </div>

        {/* Step 3: Storyboard Generation */}
        <div className="apple-card p-8 bg-white border-black/10 shadow-xl">
          <div className="flex items-center justify-between mb-8">
            <div>
              <div className="section-label text-[#FF7F00] mb-2">Node 03 / Storyboards</div>
              <h2 className="text-2xl font-black tracking-tight">分镜架构生成 <span className="text-[#86868b]">全链路视觉蓝图</span></h2>
            </div>
            <div className="flex gap-3">
              <button 
                onClick={runDetailStep3} 
                disabled={detailLoading || !detailDesignGuide}
                className={`px-6 py-2 rounded-xl text-white text-[12px] font-black shadow-lg hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-2 border-none ${!detailDesignGuide ? 'bg-gray-300 cursor-not-allowed' : 'bg-[#FF7F00]'}`}
              >
                {detailLoading && detailStep === 3 ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-magic"></i>}
                生成分镜架构
              </button>
              {detailStoryboards.length > 0 && (
                <>
                  <button 
                    onClick={runDetailBulkGen}
                    className="px-6 py-2 bg-black text-white rounded-xl text-[12px] font-black shadow-lg hover:scale-[1.02] transition-all flex items-center gap-2"
                  >
                    <i className="fas fa-play"></i> 全部生成
                  </button>
                  <button 
                    onClick={runDetailBulkDownload}
                    className="px-6 py-2 bg-[#F5F5F7] text-black border border-black/10 rounded-xl text-[12px] font-black hover:bg-black hover:text-white transition-all flex items-center gap-2"
                  >
                    <i className="fas fa-download"></i> 批量下载
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {detailStoryboards.map((sb, idx) => (
              <div key={sb.id} className="apple-card p-6 bg-[#F5F5F7]/50 border-black/5 hover:bg-white hover:shadow-2xl transition-all duration-500 group">
                <div className="flex items-center justify-between mb-4">
                  <span className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center text-[12px] font-black">{idx + 1}</span>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => runDetailGenImage(sb.id)}
                      disabled={sb.status === 'loading'}
                      className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${sb.status === 'loading' ? 'bg-gray-200 text-gray-400' : 'bg-[#FF7F00] text-white hover:scale-110 shadow-md'}`}
                    >
                      {sb.status === 'loading' ? <i className="fas fa-circle-notch fa-spin text-[10px]"></i> : <i className="fas fa-play text-[10px]"></i>}
                    </button>
                  </div>
                </div>
                <h3 className="text-lg font-black text-black mb-2">{sb.title}</h3>
                <p className="text-[11px] font-bold text-[#86868b] mb-4 leading-relaxed">{sb.concept}</p>
                
                <div className="aspect-square rounded-2xl bg-white border border-black/5 mb-4 overflow-hidden relative shadow-inner">
                  {sb.generatedImage ? (
                    <img src={sb.generatedImage} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-[#86868b] opacity-20">
                      <i className="fas fa-image text-4xl mb-2"></i>
                      <span className="text-[10px] font-black uppercase tracking-widest">Wait for Gen</span>
                    </div>
                  )}
                  {sb.status === 'loading' && (
                    <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center">
                      <div className="w-12 h-1 bg-gray-100 rounded-full overflow-hidden mb-2">
                        <div className="h-full bg-[#FF7F00] animate-progress"></div>
                      </div>
                      <span className="text-[9px] font-black text-[#FF7F00] uppercase tracking-widest">Rendering...</span>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="bg-white p-3 rounded-xl border border-black/5">
                    <label className="text-[9px] font-black text-[#86868b] uppercase tracking-widest mb-1 block">生图指令 / Prompt</label>
                    <textarea 
                      className="w-full bg-transparent border-none p-0 text-[11px] font-medium text-black leading-relaxed focus:ring-0 resize-none h-16 no-scrollbar"
                      value={sb.prompt}
                      onChange={(e) => {
                        const newVal = e.target.value;
                        setDetailStoryboards((prev: DetailStoryboard[]) => prev.map(s => s.id === sb.id ? { ...s, prompt: newVal } : s));
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-white p-3 rounded-xl border border-black/5 relative overflow-hidden">
                      <label className="text-[9px] font-black text-[#86868b] uppercase tracking-widest mb-1 block">参考图 / Ref</label>
                      <div className="flex items-center gap-2">
                        {sb.refImage ? (
                          <div className="w-8 h-8 rounded bg-[#F5F5F7] border border-black/5 overflow-hidden">
                            <img src={sb.refImage} className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className="w-8 h-8 rounded bg-[#F5F5F7] border border-dashed border-black/10 flex items-center justify-center">
                            <i className="fas fa-plus text-[8px] opacity-30"></i>
                          </div>
                        )}
                        <button 
                          onClick={() => document.getElementById(`ref-upload-${sb.id}`)?.click()}
                          className="text-[10px] font-bold text-[#FF7F00] hover:underline"
                        >
                          {sb.refImage ? '更换' : '上传'}
                        </button>
                        <input id={`ref-upload-${sb.id}`} type="file" className="hidden" onChange={(e) => handleDetailRefImageChange(sb.id, e)} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {detailStoryboards.length === 0 && (
              <div className="col-span-full h-[300px] flex flex-col items-center justify-center text-[#86868b] opacity-20 italic">
                <i className="fas fa-magic text-6xl mb-4"></i>
                <p className="text-xl font-black">等待生成分镜...</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
