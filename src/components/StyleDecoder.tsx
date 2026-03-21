import React from 'react';
import { VisualConstitution } from '../types/index';

interface StyleDecoderProps {
  styleImage: string | null;
  setStyleImage: (img: string | null) => void;
  visualConstitution: VisualConstitution | null;
  isAnalyzingStyle: boolean;
  handleStyleAnalysis: () => void;
}

export const StyleDecoder: React.FC<StyleDecoderProps> = ({
  styleImage,
  setStyleImage,
  visualConstitution,
  isAnalyzingStyle,
  handleStyleAnalysis
}) => {
  return (
    <div className="animate-slide-up max-w-4xl mx-auto w-full">
      <div className="section-label mb-3 text-[#0071e3]">Style Decoder</div>
      <h1 className="text-4xl font-black tracking-tighter text-black mb-10">视觉宪法解码</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
        <div className="apple-card bg-white border-black/10 p-10 shadow-2xl">
          <label className="section-label mb-6 block text-black/40">上传参考风格图</label>
          <div 
            className={`aspect-square rounded-3xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden bg-[#F5F5F7] ${styleImage ? 'border-[#0071e3]' : 'border-black/10 hover:border-black/20'}`}
            onClick={() => document.getElementById('style-upload')?.click()}
          >
            {styleImage ? (
              <img src={styleImage} alt="Style" className="w-full h-full object-cover" />
            ) : (
              <>
                <div className="w-16 h-16 rounded-full bg-white shadow-md flex items-center justify-center text-black/20 mb-4">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <p className="text-sm font-black text-black/40 uppercase tracking-widest">点击上传图片</p>
              </>
            )}
            <input 
              id="style-upload" 
              type="file" 
              className="hidden" 
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = (ev) => setStyleImage(ev.target?.result as string);
                  reader.readAsDataURL(file);
                }
              }}
            />
          </div>
          <button 
            onClick={handleStyleAnalysis}
            disabled={!styleImage || isAnalyzingStyle}
            className={`w-full mt-8 btn-primary py-5 text-[13px] ${!styleImage || isAnalyzingStyle ? 'bg-black/10 text-black/20 cursor-not-allowed' : 'bg-black text-white hover:bg-black/90'}`}
          >
            {isAnalyzingStyle ? (
              <div className="flex items-center justify-center gap-3">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>正在解码视觉宪法...</span>
              </div>
            ) : '开始解码风格'}
          </button>
        </div>

        <div className="apple-card bg-white border-black/10 p-10 shadow-2xl">
          <label className="section-label mb-6 block text-black/40">视觉宪法解码结果</label>
          {visualConstitution ? (
            <div className="space-y-8 animate-fade-in">
              <div>
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#0071e3] mb-3">构图构成</h3>
                <p className="text-sm font-bold text-black leading-relaxed">{visualConstitution.composition}</p>
              </div>
              <div>
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#0071e3] mb-3">光影构成</h3>
                <p className="text-sm font-bold text-black leading-relaxed">{visualConstitution.lighting}</p>
              </div>
              <div>
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#0071e3] mb-3">色彩构成</h3>
                <p className="text-sm font-bold text-black leading-relaxed">{visualConstitution.color}</p>
              </div>
              <div>
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#0071e3] mb-3">材质构成</h3>
                <p className="text-sm font-bold text-black leading-relaxed">{visualConstitution.texture}</p>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center py-20">
              <div className="w-12 h-12 rounded-full bg-[#F5F5F7] flex items-center justify-center text-black/10 mb-4">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-sm font-bold text-black/20">等待解码分析结果</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
