
import React from 'react';
import { DeconstructionResult, SegmentedObject } from '../types';

interface SingleToolPanelProps {
  toolMode: 'deconstruction' | 'segmentation' | 'replacement';
  setToolMode: (mode: 'deconstruction' | 'segmentation' | 'replacement') => void;
  singleRefImage: string | null;
  handleSingleRefImageChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isDeconstructing: boolean;
  runSingleDeconstruction: (base64: string) => void;
  deconstructionResult: DeconstructionResult | null;
  editablePrompt: string;
  setEditablePrompt: (val: string) => void;
  singleProductImage: string | null;
  handleSingleProductImageChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  refStrength: number;
  setRefStrength: (val: number) => void;
  useRefImage: boolean;
  setUseRefImage: (val: boolean) => void;
  isGeneratingSingle: boolean;
  runSingleGeneration: () => void;
  singleGeneratedImage: string | null;
  isSegmenting: boolean;
  runSegmentation: (base64: string) => void;
  segmentedObjects: SegmentedObject[];
  setSegmentedObjects: React.Dispatch<React.SetStateAction<SegmentedObject[]>>;
  backgroundFidelity: number;
  setBackgroundFidelity: (val: number) => void;
  runReplacementGeneration: () => void;
  replacementBaseImage: string | null;
  handleReplacementBaseImageChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  DECONSTRUCTION_FIELDS: { key: string; label: string; icon: string }[];
}

export const SingleToolPanel: React.FC<SingleToolPanelProps> = ({
  toolMode,
  setToolMode,
  singleRefImage,
  handleSingleRefImageChange,
  isDeconstructing,
  runSingleDeconstruction,
  deconstructionResult,
  editablePrompt,
  setEditablePrompt,
  singleProductImage,
  handleSingleProductImageChange,
  refStrength,
  setRefStrength,
  useRefImage,
  setUseRefImage,
  isGeneratingSingle,
  runSingleGeneration,
  singleGeneratedImage,
  isSegmenting,
  runSegmentation,
  segmentedObjects,
  setSegmentedObjects,
  backgroundFidelity,
  setBackgroundFidelity,
  runReplacementGeneration,
  replacementBaseImage,
  handleReplacementBaseImageChange,
  DECONSTRUCTION_FIELDS,
}) => {
  return (
    <div className="animate-slide-up">
      <div className="flex items-end justify-between mb-10">
        <div>
          <div className="section-label mb-3 text-[#0071e3]">Single Tool Mode</div>
          <h1 className="text-4xl font-black tracking-tighter text-black">单图灵活工具</h1>
          <p className="text-[#86868b] text-sm mt-2">快速解析、分割或替换单张图片的视觉元素</p>
        </div>
        <div className="flex gap-2 bg-[#F5F5F7] p-1 rounded-xl border border-black/5">
          {[
            { id: 'deconstruction', label: '图片解构', icon: 'fa-shapes' },
            { id: 'segmentation', label: '局部解构', icon: 'fa-cut' },
            { id: 'replacement', label: '局部替换', icon: 'fa-sync' }
          ].map(mode => (
            <button
              key={mode.id}
              onClick={() => setToolMode(mode.id as 'deconstruction' | 'segmentation' | 'replacement')}
              className={`px-6 py-2 rounded-lg text-[11px] font-bold transition-all flex items-center gap-2 ${toolMode === mode.id ? 'bg-white shadow-md text-black' : 'text-[#86868b] hover:text-black'}`}
            >
              <i className={`fas ${mode.icon}`}></i>
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column: Input & Analysis */}
        <div className="space-y-8">
          {toolMode === 'deconstruction' && (
            <div className="apple-card p-8 bg-white border-black/10 shadow-xl">
              <h2 className="text-xl font-black mb-6 tracking-tight">视觉解构分析 <span className="text-[#86868b]">提取大师级 Prompt</span></h2>
              
              <div className="bg-[#F5F5F7] p-6 rounded-2xl border border-black/5 mb-8 text-center">
                {singleRefImage ? (
                  <div className="relative group aspect-video rounded-xl overflow-hidden shadow-lg bg-white border border-black/5">
                    <img src={singleRefImage} className="w-full h-full object-contain" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                      <button onClick={() => document.getElementById('single-ref-upload')?.click()} className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md text-white flex items-center justify-center hover:bg-white/40 transition-all"><i className="fas fa-sync"></i></button>
                      <button onClick={() => runSingleDeconstruction(singleRefImage)} className="w-10 h-10 rounded-full bg-[#0071e3] text-white flex items-center justify-center hover:scale-110 transition-all shadow-lg"><i className="fas fa-magic"></i></button>
                    </div>
                  </div>
                ) : (
                  <div className="aspect-video rounded-xl border-2 border-dashed border-black/15 flex flex-col items-center justify-center cursor-pointer hover:border-[#0071e3]/30 bg-white transition-all group" onClick={() => document.getElementById('single-ref-upload')?.click()}>
                    <i className="fas fa-cloud-upload-alt text-4xl opacity-10 group-hover:opacity-100 mb-4 transition-all"></i>
                    <p className="text-sm font-bold opacity-30 group-hover:opacity-100 transition-all">上传参考图进行解构</p>
                  </div>
                )}
                <input id="single-ref-upload" type="file" className="hidden" onChange={handleSingleRefImageChange} />
              </div>

              {isDeconstructing && (
                <div className="py-10 text-center animate-pulse">
                  <div className="w-12 h-1 bg-gray-100 rounded-full overflow-hidden mx-auto mb-4">
                    <div className="h-full bg-[#0071e3] animate-progress"></div>
                  </div>
                  <p className="text-[11px] font-black text-[#0071e3] uppercase tracking-widest">正在深度解析视觉特征...</p>
                </div>
              )}

              {deconstructionResult && (
                <div className="grid grid-cols-2 gap-4 animate-slide-up">
                  {DECONSTRUCTION_FIELDS.map(field => (
                    <div key={field.key} className="bg-[#F5F5F7] p-4 rounded-xl border border-black/5 hover:bg-white hover:shadow-md transition-all group">
                      <div className="flex items-center gap-2 mb-2">
                        <i className={`fas ${field.icon} text-[10px] text-[#0071e3] opacity-40 group-hover:opacity-100 transition-opacity`}></i>
                        <span className="text-[9px] font-black text-[#86868b] uppercase tracking-widest">{field.label}</span>
                      </div>
                      <p className="text-[11px] font-bold text-black leading-relaxed">{deconstructionResult[field.key] || '未提取'}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {(toolMode === 'segmentation' || toolMode === 'replacement') && (
            <div className="apple-card p-8 bg-white border-black/10 shadow-xl">
              <h2 className="text-xl font-black mb-6 tracking-tight">{toolMode === 'segmentation' ? '局部元素分割' : '局部元素替换'} <span className="text-[#86868b]">精准控制画面细节</span></h2>
              
              <div className="bg-[#F5F5F7] p-6 rounded-2xl border border-black/5 mb-8 text-center">
                {replacementBaseImage ? (
                  <div className="relative group aspect-video rounded-xl overflow-hidden shadow-lg bg-white border border-black/5">
                    <img src={replacementBaseImage} className="w-full h-full object-contain" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                      <button onClick={() => document.getElementById('replacement-base-upload')?.click()} className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md text-white flex items-center justify-center hover:bg-white/40 transition-all"><i className="fas fa-sync"></i></button>
                      <button onClick={() => runSegmentation(replacementBaseImage)} className="w-10 h-10 rounded-full bg-[#0071e3] text-white flex items-center justify-center hover:scale-110 transition-all shadow-lg"><i className="fas fa-cut"></i></button>
                    </div>
                  </div>
                ) : (
                  <div className="aspect-video rounded-xl border-2 border-dashed border-black/15 flex flex-col items-center justify-center cursor-pointer hover:border-[#0071e3]/30 bg-white transition-all group" onClick={() => document.getElementById('replacement-base-upload')?.click()}>
                    <i className="fas fa-image text-4xl opacity-10 group-hover:opacity-100 mb-4 transition-all"></i>
                    <p className="text-sm font-bold opacity-30 group-hover:opacity-100 transition-all">上传基准图进行分割</p>
                  </div>
                )}
                <input id="replacement-base-upload" type="file" className="hidden" onChange={handleReplacementBaseImageChange} />
              </div>

              {isSegmenting && (
                <div className="py-10 text-center animate-pulse">
                  <div className="w-12 h-1 bg-gray-100 rounded-full overflow-hidden mx-auto mb-4">
                    <div className="h-full bg-[#0071e3] animate-progress"></div>
                  </div>
                  <p className="text-[11px] font-black text-[#0071e3] uppercase tracking-widest">正在识别并分割物体...</p>
                </div>
              )}

              {segmentedObjects.length > 0 && (
                <div className="space-y-4 animate-slide-up">
                  <div className="section-label text-[#0071e3]">识别出的物体 ({segmentedObjects.length})</div>
                  <div className="grid grid-cols-2 gap-4">
                    {segmentedObjects.map(obj => (
                      <div key={obj.id} className="bg-[#F5F5F7] p-4 rounded-xl border border-black/5 hover:bg-white hover:shadow-md transition-all group">
                        <div className="flex items-center justify-between mb-3">
                          <span className="px-2 py-0.5 bg-black text-white text-[9px] font-black rounded uppercase tracking-widest">{obj.label}</span>
                          <span className="text-[9px] font-bold text-[#86868b]">ID: #{obj.id}</span>
                        </div>
                        <div className="aspect-square rounded-lg bg-white border border-black/5 mb-4 overflow-hidden shadow-inner">
                          {obj.replacementImage ? (
                            <img src={obj.replacementImage} className="w-full h-full object-contain" />
                          ) : (
                            <img src={obj.original_crop_path} className="w-full h-full object-contain opacity-60" />
                          )}
                        </div>
                        {toolMode === 'replacement' && (
                          <div className="space-y-3">
                            <button 
                              onClick={() => document.getElementById(`replace-upload-${obj.id}`)?.click()}
                              className="w-full py-2 bg-white border border-black/10 rounded-lg text-[10px] font-black hover:bg-black hover:text-white transition-all shadow-sm"
                            >
                              {obj.replacementImage ? '更换替换图' : '上传替换图'}
                            </button>
                            <input 
                              id={`replace-upload-${obj.id}`} 
                              type="file" 
                              className="hidden" 
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                const reader = new FileReader();
                                reader.onload = (event) => {
                                  const b64 = event.target?.result as string;
                                  setSegmentedObjects((prev: SegmentedObject[]) => prev.map(o => o.id === obj.id ? { ...o, replacementImage: b64 } : o));
                                };
                                reader.readAsDataURL(file);
                              }} 
                            />
                            <div className="flex items-center justify-between">
                              <span className="text-[9px] font-black text-[#86868b] uppercase tracking-widest">缩放比例</span>
                              <div className="flex items-center gap-2">
                                <input 
                                  type="range" min="0.5" max="2.0" step="0.1" 
                                  value={obj.scaleAdjustment} 
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value);
                                    setSegmentedObjects((prev: SegmentedObject[]) => prev.map(o => o.id === obj.id ? { ...o, scaleAdjustment: val } : o));
                                  }}
                                  className="w-20"
                                />
                                <span className="text-[10px] font-bold text-black">{obj.scaleAdjustment}x</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Prompt & Generation */}
        <div className="space-y-8">
          <div className="apple-card p-8 bg-white border-black/10 shadow-xl">
            <h2 className="text-xl font-black mb-6 tracking-tight">生图指令与配置 <span className="text-[#86868b]">最终视觉呈现</span></h2>
            
            <div className="space-y-6">
              {/* Prompt Editor */}
              <div className="bg-[#F5F5F7] p-6 rounded-2xl border border-black/5">
                <label className="section-label text-[10px] mb-3 block text-black font-black uppercase tracking-widest">最终生图指令 / Final Prompt</label>
                <textarea 
                  className="w-full bg-transparent border-none p-0 text-[14px] font-bold text-black leading-relaxed focus:ring-0 resize-none h-32 no-scrollbar"
                  value={editablePrompt}
                  onChange={(e) => setEditablePrompt(e.target.value)}
                  placeholder="解构后将在此生成指令，您也可以手动输入..."
                />
              </div>

              {/* Product Upload for Single Gen */}
              {toolMode === 'deconstruction' && (
                <div className="bg-[#F5F5F7] p-6 rounded-2xl border border-black/5">
                  <label className="section-label text-[10px] mb-3 block text-black font-black uppercase tracking-widest">上传产品图 / Product Image</label>
                  <div className="flex gap-4 items-center">
                    <div className="w-20 h-20 rounded-xl bg-white border border-black/10 flex items-center justify-center overflow-hidden shadow-inner">
                      {singleProductImage ? (
                        <img src={singleProductImage} className="w-full h-full object-contain p-1" />
                      ) : (
                        <i className="fas fa-plus opacity-20"></i>
                      )}
                    </div>
                    <div className="flex-1 space-y-2">
                      <button 
                        onClick={() => document.getElementById('single-prod-upload')?.click()}
                        className="px-4 py-2 bg-white border border-black/10 rounded-lg text-[11px] font-bold hover:bg-black hover:text-white transition-all shadow-sm"
                      >
                        选择产品图
                      </button>
                      <input id="single-prod-upload" type="file" className="hidden" onChange={handleSingleProductImageChange} />
                      <p className="text-[10px] text-[#86868b] font-medium">建议使用白底或透明背景的产品图</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Advanced Settings */}
              <div className="grid grid-cols-2 gap-6">
                {toolMode === 'deconstruction' ? (
                  <>
                    <div className="bg-[#F5F5F7] p-4 rounded-xl border border-black/5">
                      <label className="section-label text-[9px] mb-2 block opacity-60">参考强度 / Strength</label>
                      <div className="flex items-center gap-3">
                        <input 
                          type="range" min="0" max="1" step="0.1" 
                          value={refStrength} 
                          onChange={(e) => setRefStrength(parseFloat(e.target.value))}
                          className="flex-1"
                        />
                        <span className="text-[11px] font-black text-black">{refStrength}</span>
                      </div>
                    </div>
                    <div className="bg-[#F5F5F7] p-4 rounded-xl border border-black/5 flex items-center justify-between">
                      <span className="text-[10px] font-black text-black uppercase tracking-widest">使用参考图</span>
                      <button 
                        onClick={() => setUseRefImage(!useRefImage)}
                        className={`w-10 h-5 rounded-full transition-all relative ${useRefImage ? 'bg-[#0071e3]' : 'bg-gray-300'}`}
                      >
                        <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${useRefImage ? 'left-6' : 'left-1'}`}></div>
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="col-span-2 bg-[#F5F5F7] p-4 rounded-xl border border-black/5">
                    <label className="section-label text-[9px] mb-2 block opacity-60">背景保留强度 / Fidelity</label>
                    <div className="flex items-center gap-3">
                      <input 
                        type="range" min="0" max="1" step="0.1" 
                        value={backgroundFidelity} 
                        onChange={(e) => setBackgroundFidelity(parseFloat(e.target.value))}
                        className="flex-1"
                      />
                      <span className="text-[11px] font-black text-black">{backgroundFidelity}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Generation Button */}
              <button 
                onClick={toolMode === 'deconstruction' ? runSingleGeneration : runReplacementGeneration}
                disabled={isGeneratingSingle}
                className="w-full py-5 bg-black text-white rounded-2xl text-[15px] font-black shadow-2xl hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3"
              >
                {isGeneratingSingle ? (
                  <>
                    <i className="fas fa-circle-notch fa-spin"></i>
                    正在生成商业大片...
                  </>
                ) : (
                  <>
                    <i className="fas fa-rocket"></i>
                    立即生成商业大片
                  </>
                )}
              </button>

              {/* Result Preview */}
              {singleGeneratedImage && (
                <div className="animate-slide-up">
                  <div className="section-label text-[#0071e3] mb-4">生成结果 / Result</div>
                  <div className="relative group aspect-square rounded-2xl overflow-hidden shadow-2xl bg-[#F5F5F7] border border-black/5">
                    <img src={singleGeneratedImage} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                      <button onClick={() => window.open(singleGeneratedImage)} className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md text-white flex items-center justify-center hover:bg-white/40 transition-all"><i className="fas fa-expand"></i></button>
                      <button onClick={() => {
                        const link = document.createElement('a');
                        link.href = singleGeneratedImage;
                        link.download = `generated-${Date.now()}.png`;
                        link.click();
                      }} className="w-12 h-12 rounded-full bg-[#0071e3] text-white flex items-center justify-center hover:scale-110 transition-all shadow-lg"><i className="fas fa-download"></i></button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
