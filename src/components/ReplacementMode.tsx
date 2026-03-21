import React from 'react';
import { MODEL_COSTS } from '../types';
import { Upload, Zap, Download, Share2, Box } from 'lucide-react';

interface SegmentedObject {
  id: string;
  label: string;
  bbox: [number, number, number, number];
  replacementImage?: string;
}

interface ReplacementModeProps {
  replacementBaseImage: string | null;
  setReplacementBaseImage: (url: string | null) => void;
  isSegmenting: boolean;
  segmentedObjects: SegmentedObject[];
  runSegmentation: (base64: string) => void;
  singleProductImage: string | null;
  setSingleProductImage: (url: string | null) => void;
  genModel: string;
  setGenModel: (model: string) => void;
  genResolution: string;
  setGenResolution: (res: string) => void;
  genAspectRatio: string;
  setGenAspectRatio: (ratio: string) => void;
  isGeneratingSingle: boolean;
  runSingleGeneration: () => void;
  singleGeneratedImage: string | null;
  downloadImage: (url: string, name: string) => void;
  BBOX_COLORS: string[];
  LABEL_COLORS: string[];
  backgroundFidelity: number;
  setBackgroundFidelity: (fidelity: number) => void;
}

export const ReplacementMode = ({
  replacementBaseImage,
  setReplacementBaseImage,
  isSegmenting,
  segmentedObjects,
  runSegmentation,
  singleProductImage,
  setSingleProductImage,
  genModel,
  setGenModel,
  genResolution,
  setGenResolution,
  genAspectRatio,
  setGenAspectRatio,
  isGeneratingSingle,
  runSingleGeneration,
  singleGeneratedImage,
  downloadImage,
  BBOX_COLORS,
  LABEL_COLORS,
  backgroundFidelity,
  setBackgroundFidelity
}: ReplacementModeProps) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      {/* 左侧：基准图与解构画布 */}
      <div className="lg:col-span-5 space-y-8">
        <div className="apple-card p-8 bg-white border-black/10 shadow-xl">
          <div className="section-label mb-6 text-[#0071e3]">Step 01 / Base Image</div>
          <h2 className="text-2xl font-black mb-6 tracking-tight">上传基准图 <span className="text-[#86868b]">定义场景结构</span></h2>
          
          <div 
            className={`aspect-square rounded-[32px] border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all duration-700 overflow-hidden relative group shadow-inner ${replacementBaseImage ? 'border-transparent' : 'border-black/15 bg-[#fbfbfd] hover:bg-white hover:border-[#0071e3]/30'}`}
            onClick={() => document.getElementById('base-image-upload')?.click()}
          >
            {replacementBaseImage ? (
              <div className="relative w-full h-full">
                <img src={replacementBaseImage} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                {segmentedObjects.map((obj, idx) => (
                  <div 
                    key={obj.id}
                    className={`absolute border-2 flex items-center justify-center group/bbox ${BBOX_COLORS[idx % BBOX_COLORS.length]}`}
                    style={{
                      left: `${obj.bbox[0] / 10}%`,
                      top: `${obj.bbox[1] / 10}%`,
                      width: `${obj.bbox[2] / 10}%`,
                      height: `${obj.bbox[3] / 10}%`
                    }}
                  >
                    <span className={`text-white text-[10px] font-black px-1 rounded absolute -top-4 left-0 ${LABEL_COLORS[idx % LABEL_COLORS.length]}`}>#{obj.id} {obj.label}</span>
                  </div>
                ))}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                  <div className="bg-white/20 p-4 rounded-full backdrop-blur-md border border-white/30">
                    <Upload className="w-8 h-8 text-white" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center p-8">
                <div className="w-20 h-20 bg-white rounded-[24px] shadow-lg flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform duration-500 border border-black/5">
                  <Upload className="w-10 h-10 text-[#0071e3]" />
                </div>
                <p className="text-lg font-bold mb-2">点击上传基准图</p>
                <p className="text-[#86868b] text-sm">支持 JPG, PNG (AI 将自动识别可替换区域)</p>
              </div>
            )}
          </div>
          
          <input 
            type="file" 
            id="base-image-upload"
            className="hidden" 
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                  const b64 = event.target?.result as string;
                  setReplacementBaseImage(b64);
                  runSegmentation(b64);
                };
                reader.readAsDataURL(file);
              }
            }}
          />

          {isSegmenting && (
            <div className="mt-8 p-6 bg-[#f5f5f7] rounded-2xl border border-black/5 animate-pulse">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-[#0071e3]/30 border-t-[#0071e3] rounded-full animate-spin" />
                </div>
                <p className="text-sm font-black text-black">AI 正在进行像素级语义分割...</p>
              </div>
              <div className="space-y-2">
                <div className="h-2 bg-black/5 rounded-full w-full" />
                <div className="h-2 bg-black/5 rounded-full w-3/4" />
              </div>
            </div>
          )}

          {segmentedObjects.length > 0 && (
            <div className="mt-8 space-y-4 animate-in fade-in slide-in-from-top-4 duration-700">
              <p className="text-[10px] font-bold text-[#86868b] uppercase tracking-widest">识别到 {segmentedObjects.length} 个可替换区域</p>
              <div className="flex flex-wrap gap-2">
                {segmentedObjects.map((obj, idx) => (
                  <div key={obj.id} className={`px-3 py-1.5 rounded-full text-[11px] font-black flex items-center gap-2 ${BBOX_COLORS[idx % BBOX_COLORS.length]}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${LABEL_COLORS[idx % LABEL_COLORS.length]}`} />
                    {obj.label}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="apple-card p-8 bg-white border-black/10 shadow-xl">
          <div className="section-label mb-6 text-[#0071e3]">Step 02 / Product Placement</div>
          <h2 className="text-2xl font-black mb-6 tracking-tight">上传产品图 <span className="text-[#86868b]">注入核心主体</span></h2>
          
          <div 
            className={`aspect-square rounded-[32px] border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all duration-700 overflow-hidden relative group shadow-inner ${singleProductImage ? 'border-transparent' : 'border-black/15 bg-[#fbfbfd] hover:bg-white hover:border-[#0071e3]/30'}`}
            onClick={() => document.getElementById('replacement-product-upload')?.click()}
          >
            {singleProductImage ? (
              <div className="w-full h-full relative group">
                <img 
                  src={singleProductImage} 
                  alt="Product" 
                  className="w-full h-full object-contain p-8 transition-transform duration-700 group-hover:scale-105" 
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                  <div className="bg-white/20 p-4 rounded-full backdrop-blur-md border border-white/30">
                    <Upload className="w-8 h-8 text-white" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center p-8">
                <div className="w-20 h-20 bg-white rounded-[24px] shadow-lg flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform duration-500 border border-black/5">
                  <Box className="w-10 h-10 text-[#0071e3]" />
                </div>
                <p className="text-lg font-bold mb-2">点击上传产品图</p>
                <p className="text-[#86868b] text-sm">支持 JPG, PNG (建议白底或透明图)</p>
              </div>
            )}
          </div>
          
          <input 
            type="file" 
            id="replacement-product-upload"
            className="hidden" 
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                const reader = new FileReader();
                reader.onload = (event) => setSingleProductImage(event.target?.result as string);
                reader.readAsDataURL(file);
              }
            }}
          />
        </div>
      </div>

      {/* 右侧：AI 渲染配置 */}
      <div className="lg:col-span-7 space-y-8">
        <div className="apple-card p-8 bg-white border-black/10 shadow-xl">
          <div className="section-label mb-6 text-[#0071e3]">Step 03 / AI Render Settings</div>
          <h2 className="text-2xl font-black mb-6 tracking-tight">AI 渲染配置 <span className="text-[#86868b]">视觉重塑</span></h2>
          
          <div className="space-y-8">
            {/* 渲染引擎 */}
            <div>
              <label className="block text-sm font-bold mb-4 text-[#1d1d1f]">渲染引擎</label>
              <div className="grid grid-cols-2 gap-4">
                {Object.entries(MODEL_COSTS).map(([id, config]) => (
                  <button
                    key={id}
                    onClick={() => setGenModel(id)}
                    className={`p-5 rounded-2xl border-2 transition-all duration-300 text-left group ${genModel === id ? 'border-[#0071e3] bg-[#0071e3]/5 shadow-md' : 'border-black/5 bg-[#fbfbfd] hover:border-black/10 hover:bg-white'}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className={`font-black ${genModel === id ? 'text-[#0071e3]' : 'text-black'}`}>{config.name}</span>
                      {genModel === id && <div className="w-2 h-2 bg-[#0071e3] rounded-full" />}
                    </div>
                    <p className="text-[11px] text-[#86868b] leading-tight">{config.description}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* 分辨率 */}
            <div>
              <label className="block text-sm font-bold mb-4 text-[#1d1d1f]">输出分辨率</label>
              <div className="flex flex-wrap gap-3">
                {Object.keys(MODEL_COSTS[genModel].resolutions).map((res) => (
                  <button
                    key={res}
                    onClick={() => setGenResolution(res)}
                    className={`px-6 py-3 rounded-xl border-2 font-bold transition-all duration-300 ${genResolution === res ? 'border-[#0071e3] bg-[#0071e3] text-white shadow-lg scale-105' : 'border-black/5 bg-[#fbfbfd] text-[#1d1d1f] hover:border-black/10'}`}
                  >
                    {res}
                  </button>
                ))}
              </div>
            </div>

            {/* 比例 */}
            <div>
              <label className="block text-sm font-bold mb-4 text-[#1d1d1f]">画面比例</label>
              <div className="flex gap-3">
                {['1:1', '4:3', '16:9', '3:4', '9:16'].map((ratio) => (
                  <button
                    key={ratio}
                    onClick={() => setGenAspectRatio(ratio)}
                    className={`px-6 py-3 rounded-xl border-2 font-bold transition-all duration-300 ${genAspectRatio === ratio ? 'border-[#0071e3] bg-[#0071e3] text-white shadow-lg scale-105' : 'border-black/5 bg-[#fbfbfd] text-[#1d1d1f] hover:border-black/10'}`}
                  >
                    {ratio}
                  </button>
                ))}
              </div>
            </div>

            {/* 背景保持强度 */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <label className="text-sm font-bold text-[#1d1d1f]">背景保持强度</label>
                <span className="text-[12px] font-black text-[#0071e3] bg-[#0071e3]/5 px-2 py-1 rounded-lg">{(backgroundFidelity * 100).toFixed(0)}%</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.01" 
                value={backgroundFidelity}
                onChange={(e) => setBackgroundFidelity(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-[#f5f5f7] rounded-lg appearance-none cursor-pointer accent-[#0071e3]"
              />
              <div className="flex justify-between mt-2 text-[10px] text-[#86868b] font-bold uppercase tracking-widest">
                <span>更随 AI</span>
                <span>更随原图</span>
              </div>
            </div>

            {/* 费用预估 */}
            <div className="p-6 bg-[#f5f5f7] rounded-3xl border border-black/5 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white rounded-2xl shadow-sm flex items-center justify-center">
                  <Zap className="w-6 h-6 text-[#0071e3]" />
                </div>
                <div>
                  <p className="text-[11px] font-bold text-[#86868b] uppercase tracking-widest">Estimated Cost</p>
                  <p className="text-xl font-black text-black">{MODEL_COSTS[genModel].resolutions[genResolution].credits} <span className="text-sm font-bold text-[#86868b]">Credits</span></p>
                </div>
              </div>
              <button
                onClick={runSingleGeneration}
                disabled={isGeneratingSingle || !singleProductImage || !replacementBaseImage}
                className={`px-10 py-4 rounded-2xl font-black text-lg transition-all duration-500 shadow-xl ${isGeneratingSingle || !singleProductImage || !replacementBaseImage ? 'bg-[#e8e8ed] text-[#86868b] cursor-not-allowed' : 'bg-black text-white hover:bg-[#1d1d1f] hover:shadow-2xl hover:-translate-y-1 active:scale-95'}`}
              >
                {isGeneratingSingle ? '正在渲染...' : '开始 AI 渲染'}
              </button>
            </div>
          </div>
        </div>

        {/* 生成结果 */}
        {singleGeneratedImage && (
          <div className="apple-card p-8 bg-white border-black/10 shadow-xl animate-in fade-in slide-in-from-bottom-8 duration-1000">
            <div className="section-label mb-6 text-[#34c759]">Final Result / AI Generated</div>
            <h2 className="text-2xl font-black mb-6 tracking-tight text-black">生成结果 <span className="text-[#86868b]">视觉一致性</span></h2>
            
            <div className="rounded-[32px] overflow-hidden border border-black/5 shadow-2xl group relative">
              <img 
                src={singleGeneratedImage} 
                alt="Generated Result" 
                className="w-full h-auto transition-transform duration-1000 group-hover:scale-105" 
                referrerPolicy="no-referrer"
              />
              <div className="absolute top-6 right-6 flex gap-3 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                <button 
                  onClick={() => downloadImage(singleGeneratedImage, 'replacement-view-result.png')}
                  className="p-4 bg-white/90 backdrop-blur-md rounded-2xl shadow-xl hover:bg-white transition-all hover:scale-110 border border-black/5"
                >
                  <Download className="w-6 h-6 text-black" />
                </button>
                <button 
                  onClick={() => downloadImage(singleGeneratedImage, 'replacement-view-result.png')}
                  className="p-4 bg-black/90 backdrop-blur-md rounded-2xl shadow-xl hover:bg-black transition-all hover:scale-110 border border-white/10"
                >
                  <Share2 className="w-6 h-6 text-white" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
