
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { refinePrompt, generateEcomImage } from '../../geminiService';
import { AuthState } from '../../types';

interface CreativeWorkflowProps {
  userApiKey: string;
  auth: AuthState;
  deductCredit: (amount?: number) => Promise<boolean>;
  genModel: string;
  genAspectRatio: string;
  genResolution: string;
}

interface WorkflowStep {
  id: string;
  type: 'concept' | 'prompt' | 'image';
  content: string;
  status: 'idle' | 'loading' | 'done' | 'error';
  result?: string;
}

export const CreativeWorkflow: React.FC<CreativeWorkflowProps> = ({
  userApiKey,
  deductCredit,
  genModel,
  genAspectRatio,
  genResolution
}) => {
  const [concept, setConcept] = useState('');
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const startWorkflow = async () => {
    if (!concept.trim()) return;
    if (!userApiKey) {
      alert("请先配置 API Key");
      return;
    }

    setIsProcessing(true);
    const newSteps: WorkflowStep[] = [
      { id: '1', type: 'concept', content: concept, status: 'done', result: concept },
      { id: '2', type: 'prompt', content: '正在优化提示词...', status: 'loading' }
    ];
    setSteps(newSteps);

    try {
      // Step 1: Refine Prompt
      const refined = await refinePrompt(concept, 'gemini-3-flash-preview', userApiKey);
      
      setSteps(prev => prev.map(s => s.id === '2' ? { ...s, status: 'done', result: refined } : s));
      
      // Step 2: Generate Image
      const imageStep: WorkflowStep = { id: '3', type: 'image', content: '正在生成图像...', status: 'loading' };
      setSteps(prev => [...prev, imageStep]);

      const imageUrl = await generateEcomImage({
        prompt: refined,
        model: genModel,
        aspectRatio: genAspectRatio,
        imageSize: genResolution,
        apiKey: userApiKey
      });

      if (imageUrl) {
        await deductCredit(1); // Assume 1 credit for now
        setSteps(prev => prev.map(s => s.id === '3' ? { ...s, status: 'done', result: imageUrl } : s));
      } else {
        setSteps(prev => prev.map(s => s.id === '3' ? { ...s, status: 'error', content: '生成失败' } : s));
      }

    } catch (err: unknown) {
      const error = err as Error;
      console.error(error);
      alert("工作流执行失败: " + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-12 pb-20">
      <div className="text-center space-y-4">
        <h1 className="text-5xl font-black tracking-tighter">AI 创意工作流</h1>
        <p className="text-[#86868b] text-lg max-w-2xl mx-auto">从灵感到成片，全自动化的视觉创作链路。</p>
      </div>

      <div className="apple-card p-10 bg-white border-black/10 shadow-2xl">
        <div className="space-y-6">
          <div className="section-label text-[#0071e3]">Input Concept</div>
          <textarea
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            placeholder="输入你的创意灵感，例如：'一个在赛博朋克城市中的复古相机，霓虹灯倒影，电影感光影'..."
            className="w-full h-32 bg-[#F5F5F7] border-none rounded-[32px] p-8 text-lg font-bold outline-none focus:ring-2 focus:ring-[#0071e3]/20 transition-all resize-none"
          />
          <button
            onClick={startWorkflow}
            disabled={isProcessing || !concept.trim()}
            className={`w-full py-6 rounded-[32px] text-lg font-black flex items-center justify-center gap-3 transition-all ${isProcessing ? 'bg-orange-500 text-white animate-pulse' : 'bg-black text-white hover:scale-[1.02] active:scale-95 disabled:opacity-30'}`}
          >
            {isProcessing ? (
              <>
                <i className="fas fa-circle-notch fa-spin"></i>
                <span>工作流执行中...</span>
              </>
            ) : (
              <>
                <i className="fas fa-play"></i>
                <span>启动创意工作流</span>
              </>
            )}
          </button>
        </div>
      </div>

      <div className="space-y-8">
        <AnimatePresence>
          {steps.map((step, index) => (
            <motion.div
              key={step.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.2 }}
              className="relative"
            >
              {index < steps.length - 1 && (
                <div className="absolute left-10 top-20 bottom-0 w-1 bg-[#F5F5F7] -z-10" />
              )}
              
              <div className="flex gap-8">
                <div className={`w-20 h-20 rounded-[24px] flex items-center justify-center flex-shrink-0 shadow-lg ${
                  step.status === 'loading' ? 'bg-orange-500 text-white animate-spin' : 
                  step.status === 'done' ? 'bg-[#0071e3] text-white' : 'bg-[#F5F5F7] text-black/20'
                }`}>
                  {step.type === 'concept' && <i className="fas fa-lightbulb text-2xl"></i>}
                  {step.type === 'prompt' && <i className="fas fa-magic text-2xl"></i>}
                  {step.type === 'image' && <i className="fas fa-image text-2xl"></i>}
                </div>

                <div className="flex-1 apple-card p-8 bg-white border-black/10 shadow-xl">
                  <div className="flex justify-between items-center mb-4">
                    <span className="section-label opacity-60">Step 0{index + 1} / {step.type.toUpperCase()}</span>
                    {step.status === 'done' && <i className="fas fa-check-circle text-[#0071e3]"></i>}
                  </div>

                  {step.type === 'concept' && (
                    <p className="text-xl font-bold text-black">{step.result}</p>
                  )}

                  {step.type === 'prompt' && (
                    <div className="space-y-4">
                      <p className="text-sm font-bold text-[#86868b] leading-relaxed italic">
                        {step.status === 'loading' ? '正在通过 Gemini 优化视觉指令...' : step.result}
                      </p>
                      {step.status === 'done' && (
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText(step.result || '');
                            alert("提示词已复制");
                          }}
                          className="text-[10px] font-black uppercase tracking-widest text-[#0071e3] hover:underline"
                        >
                          复制提示词
                        </button>
                      )}
                    </div>
                  )}

                  {step.type === 'image' && (
                    <div className="space-y-6">
                      {step.status === 'loading' ? (
                        <div className="aspect-video bg-[#F5F5F7] rounded-[32px] flex flex-col items-center justify-center space-y-4">
                          <div className="w-12 h-12 border-4 border-black/5 border-t-[#0071e3] rounded-full animate-spin"></div>
                          <p className="text-[10px] font-black text-[#86868b] uppercase tracking-widest">正在渲染高保真图像...</p>
                        </div>
                      ) : step.result ? (
                        <div className="group relative aspect-video rounded-[32px] overflow-hidden shadow-2xl">
                          <img src={step.result} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                            <button 
                              onClick={() => {
                                const link = document.createElement('a');
                                link.href = step.result!;
                                link.download = `workflow-${Date.now()}.png`;
                                link.click();
                              }}
                              className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center hover:scale-110 active:scale-90 transition-all"
                            >
                              <i className="fas fa-download"></i>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="p-8 text-center text-red-500 font-bold">生成失败，请重试。</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};
