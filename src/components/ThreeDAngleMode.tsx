import React from 'react';
import PerspectiveWarpTool from './PerspectiveWarpTool';

interface ThreeDAngleModeProps {
  threeDAngleImage: string | null;
  setThreeDAngleImage: (img: string | null) => void;
  depthMap: string | null;
  isGeneratingDepth: boolean;
  runDepthGeneration: (img: string) => void;
  isGeneratingThreeD: boolean;
  runThreeDGeneration: (warpedB64: string) => void;
  threeDGeneratedImage: string | null;
}

export const ThreeDAngleMode: React.FC<ThreeDAngleModeProps> = ({
  threeDAngleImage,
  setThreeDAngleImage,
  depthMap,
  isGeneratingDepth,
  runDepthGeneration,
  isGeneratingThreeD,
  runThreeDGeneration,
  threeDGeneratedImage
}) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
      {/* Left: Input & Warp */}
      <div className="space-y-8">
        <div className="bg-white rounded-[40px] p-10 border border-black/5 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-black tracking-tight text-black">1. 上传产品图</h3>
            {threeDAngleImage && (
              <button 
                onClick={() => {
                  setThreeDAngleImage(null);
                  // Reset depth map too
                }}
                className="text-[12px] font-bold text-[#FF3B30] hover:underline"
              >
                重置图片
              </button>
            )}
          </div>

          {!threeDAngleImage ? (
            <div className="relative group">
              <input 
                type="file" 
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      const b64 = ev.target?.result as string;
                      setThreeDAngleImage(b64);
                      runDepthGeneration(b64);
                    };
                    reader.readAsDataURL(file);
                  }
                }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
              <div className="aspect-square rounded-[32px] border-2 border-dashed border-black/10 flex flex-col items-center justify-center gap-4 bg-[#F5F5F7] group-hover:bg-[#E8E8ED] transition-all group-hover:border-[#0071e3]/30">
                <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
                  <i className="fas fa-cloud-upload-alt text-2xl text-[#0071e3]"></i>
                </div>
                <div className="text-center">
                  <div className="text-[14px] font-black text-black">点击或拖拽上传产品图</div>
                  <div className="text-[12px] font-medium text-[#86868b] mt-1">支持 PNG, JPG, WEBP</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              <div className="aspect-square rounded-[32px] overflow-hidden bg-[#F5F5F7] border border-black/5 shadow-inner">
                <img src={threeDAngleImage} alt="Product" className="w-full h-full object-contain" />
              </div>

              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-black tracking-tight text-black">2. 调整 3D 视角</h3>
                  {isGeneratingDepth && (
                    <div className="flex items-center gap-2 text-[12px] font-bold text-[#0071e3]">
                      <i className="fas fa-circle-notch fa-spin"></i>
                      正在生成深度图...
                    </div>
                  )}
                </div>
                
                {depthMap ? (
                  <PerspectiveWarpTool 
                    image={depthMap} 
                    onWarpComplete={runThreeDGeneration}
                  />
                ) : (
                  <div className="aspect-square rounded-[32px] bg-[#F5F5F7] flex items-center justify-center border border-black/5">
                    <div className="text-center p-8">
                      <i className="fas fa-cube text-4xl text-black/10 mb-4"></i>
                      <div className="text-[14px] font-bold text-[#86868b]">
                        {isGeneratingDepth ? '深度图生成中...' : '等待深度图生成...'}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right: Output */}
      <div className="space-y-8">
        <div className="bg-white rounded-[40px] p-10 border border-black/5 shadow-sm min-h-[600px] flex flex-col">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-black tracking-tight text-black">3. 生成结果</h3>
            {threeDGeneratedImage && (
              <a 
                href={threeDGeneratedImage} 
                download="3d_angle_result.png"
                className="text-[12px] font-bold text-[#0071e3] hover:underline flex items-center gap-1"
              >
                <i className="fas fa-download"></i> 下载图片
              </a>
            )}
          </div>

          <div className="flex-1 flex flex-col items-center justify-center">
            {isGeneratingThreeD ? (
              <div className="text-center space-y-6">
                <div className="relative">
                  <div className="w-24 h-24 rounded-full border-4 border-[#0071e3]/10 border-t-[#0071e3] animate-spin mx-auto"></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <i className="fas fa-bolt text-[#0071e3] animate-pulse"></i>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-2xl font-black tracking-tighter text-black">正在重绘 3D 视角...</div>
                  <div className="text-[14px] font-medium text-[#86868b]">这可能需要 10-20 秒，请稍候</div>
                </div>
              </div>
            ) : threeDGeneratedImage ? (
              <div className="w-full space-y-6 animate-scale-in">
                <div className="aspect-square rounded-[32px] overflow-hidden bg-[#F5F5F7] border border-black/5 shadow-2xl">
                  <img src={threeDGeneratedImage} alt="Generated 3D" className="w-full h-full object-cover" />
                </div>
                <div className="p-6 bg-[#F5F5F7] rounded-2xl border border-black/5">
                  <div className="flex items-center gap-3 text-[#0071e3] mb-2">
                    <i className="fas fa-check-circle"></i>
                    <span className="text-[14px] font-black">生成成功</span>
                  </div>
                  <p className="text-[12px] text-[#86868b] leading-relaxed">
                    已根据您调整的透视角度重新绘制产品。您可以点击上方下载按钮保存结果，或在左侧重新调整视角再次生成。
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center max-w-[280px]">
                <div className="w-20 h-20 rounded-full bg-[#F5F5F7] flex items-center justify-center mx-auto mb-6">
                  <i className="fas fa-image text-2xl text-black/10"></i>
                </div>
                <div className="text-[16px] font-black text-black mb-2">准备就绪</div>
                <div className="text-[13px] font-medium text-[#86868b] leading-relaxed">
                  上传产品图并调整 3D 视角后，点击“确认视角并重绘”即可看到结果。
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
