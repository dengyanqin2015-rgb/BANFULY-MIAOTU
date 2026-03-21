import React from 'react';
import { MODEL_COSTS, CameraParams } from '../types';
import { Zap, Download, Share2, Box, Rotate3D } from 'lucide-react';
import { ModelViewer } from './ModelViewer';

interface View3DModeProps {
  threeDProductImage: string | null;
  setThreeDProductImage: (url: string | null) => void;
  isGenerating3D: boolean;
  threeDModelUrl: string | null;
  run3DModelGeneration: (base64: string) => void;
  threeDCameraParams: CameraParams | null;
  setThreeDCameraParams: (params: CameraParams) => void;
  genModel: string;
  setGenModel: (model: string) => void;
  genResolution: string;
  setGenResolution: (res: string) => void;
  genAspectRatio: string;
  setGenAspectRatio: (ratio: string) => void;
  isGeneratingSingle: boolean;
  run3DViewGeneration: () => void;
  singleGeneratedImage: string | null;
  downloadImage: (url: string, name: string) => void;
}

export const View3DMode = ({
  threeDProductImage,
  setThreeDProductImage,
  threeDModelUrl,
  run3DModelGeneration,
  threeDCameraParams,
  setThreeDCameraParams,
  genModel,
  setGenModel,
  genResolution,
  setGenResolution,
  genAspectRatio,
  setGenAspectRatio,
  isGeneratingSingle,
  run3DViewGeneration,
  singleGeneratedImage,
  downloadImage
}: View3DModeProps) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      {/* 左侧：3D 交互视图 */}
      <div className="lg:col-span-5 space-y-8">
        <div className="apple-card p-8 bg-white border-black/10 shadow-xl">
          <div className="section-label mb-6 text-[#0071e3]">Step 01 / 2D to 3D Reconstruction</div>
          <h2 className="text-2xl font-black mb-6 tracking-tight">上传产品图 <span className="text-[#86868b]">生成 3D 预览</span></h2>
          
          <div 
            className={`aspect-square rounded-[32px] border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all duration-700 overflow-hidden relative group shadow-inner ${threeDProductImage ? 'border-transparent' : 'border-black/15 bg-[#fbfbfd] hover:bg-white hover:border-[#0071e3]/30'}`}
            onClick={() => !threeDModelUrl && document.getElementById('three-d-product-upload')?.click()}
          >
            {threeDModelUrl ? (
              <ModelViewer imageUrl={threeDModelUrl} onCameraChange={setThreeDCameraParams} />
            ) : threeDProductImage ? (
              <div className="w-full h-full relative group">
                <img 
                  src={threeDProductImage} 
                  alt="Product" 
                  className="w-full h-full object-contain p-8 opacity-50 grayscale" 
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="bg-white/80 backdrop-blur-md px-6 py-3 rounded-2xl border border-black/5 shadow-xl flex items-center gap-3">
                    <div className="w-5 h-5 border-2 border-[#0071e3]/30 border-t-[#0071e3] rounded-full animate-spin" />
                    <span className="text-sm font-black text-black">正在构建 3D 模型...</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center p-8">
                <div className="w-20 h-20 bg-white rounded-[24px] shadow-lg flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform duration-500 border border-black/5">
                  <Box className="w-10 h-10 text-[#0071e3]" />
                </div>
                <p className="text-lg font-bold mb-2">点击上传产品平面图</p>
                <p className="text-[#86868b] text-sm">AI 将自动生成可交互的 3D 预览</p>
              </div>
            )}
          </div>
          
          <input 
            type="file" 
            id="three-d-product-upload"
            className="hidden" 
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                  const b64 = event.target?.result as string;
                  setThreeDProductImage(b64);
                  run3DModelGeneration(b64);
                };
                reader.readAsDataURL(file);
              }
            }}
          />

          {threeDModelUrl && (
            <div className="mt-8 p-6 bg-[#f5f5f7] rounded-2xl border border-black/5">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center">
                  <Rotate3D className="w-5 h-5 text-[#0071e3]" />
                </div>
                <div>
                  <p className="text-sm font-black text-black">3D 构图同步已激活</p>
                  <p className="text-[11px] text-[#86868b]">当前视角将作为 AI 绘画的构图基准</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 bg-white rounded-xl border border-black/5">
                  <p className="text-[9px] font-bold text-[#86868b] uppercase tracking-widest mb-1">Camera Pos</p>
                  <p className="text-[10px] font-mono text-black truncate">
                    {threeDCameraParams?.position?.map((v: number) => v.toFixed(2)).join(', ') || '0.00, 0.00, 5.00'}
                  </p>
                </div>
                <div className="p-3 bg-white rounded-xl border border-black/5">
                  <p className="text-[9px] font-bold text-[#86868b] uppercase tracking-widest mb-1">Camera Rot</p>
                  <p className="text-[10px] font-mono text-black truncate">
                    {threeDCameraParams?.rotation?.map((v: number) => v.toFixed(2)).join(', ') || '0.00, 0.00, 0.00'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 右侧：AI 渲染配置 */}
      <div className="lg:col-span-7 space-y-8">
        <div className="apple-card p-8 bg-white border-black/10 shadow-xl">
          <div className="section-label mb-6 text-[#0071e3]">Step 02 / AI Multi-View Render</div>
          <h2 className="text-2xl font-black mb-6 tracking-tight">AI 视角生图 <span className="text-[#86868b]">构图重塑</span></h2>
          
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
                onClick={run3DViewGeneration}
                disabled={isGeneratingSingle || !threeDModelUrl}
                className={`px-10 py-4 rounded-2xl font-black text-lg transition-all duration-500 shadow-xl ${isGeneratingSingle || !threeDModelUrl ? 'bg-[#e8e8ed] text-[#86868b] cursor-not-allowed' : 'bg-black text-white hover:bg-[#1d1d1f] hover:shadow-2xl hover:-translate-y-1 active:scale-95'}`}
              >
                {isGeneratingSingle ? '正在渲染...' : '捕获视角并渲染'}
              </button>
            </div>
          </div>
        </div>

        {/* 生成结果 */}
        {singleGeneratedImage && (
          <div className="apple-card p-8 bg-white border-black/10 shadow-xl animate-in fade-in slide-in-from-bottom-8 duration-1000">
            <div className="section-label mb-6 text-[#34c759]">Final Result / AI Multi-View Generated</div>
            <h2 className="text-2xl font-black mb-6 tracking-tight text-black">生成结果 <span className="text-[#86868b]">新视角呈现</span></h2>
            
            <div className="rounded-[32px] overflow-hidden border border-black/5 shadow-2xl group relative">
              <img 
                src={singleGeneratedImage} 
                alt="Generated Result" 
                className="w-full h-auto transition-transform duration-1000 group-hover:scale-105" 
                referrerPolicy="no-referrer"
              />
              <div className="absolute top-6 right-6 flex gap-3 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                <button 
                  onClick={() => downloadImage(singleGeneratedImage, 'view3d-result.png')}
                  className="p-4 bg-white/90 backdrop-blur-md rounded-2xl shadow-xl hover:bg-white transition-all hover:scale-110 border border-black/5"
                >
                  <Download className="w-6 h-6 text-black" />
                </button>
                <button 
                  onClick={() => downloadImage(singleGeneratedImage, 'view3d-result.png')}
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
