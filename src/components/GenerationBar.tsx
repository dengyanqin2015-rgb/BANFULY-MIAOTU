import React, { useState, useEffect, useRef, useLayoutEffect, useImperativeHandle, forwardRef } from 'react';
import { Send, ChevronDown, Key, Image as ImageIcon, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AspectRatio, ImageSize, ImageModel } from '../lib/gemini';
import { cn } from '../lib/utils';

export interface GenerationBarRef {
  addImage: (data: string, mimeType: string, preview: string, sourceNodeId?: string) => void;
  setParams: (prompt: string, aspectRatio: AspectRatio, imageSize: ImageSize, model: ImageModel, images?: { data: string; mimeType: string; preview: string; sourceNodeId?: string }[]) => void;
}

interface GenerationBarProps {
  onGenerate: (prompt: string, aspectRatio: AspectRatio, imageSize: ImageSize, model: ImageModel, images?: { data: string; mimeType: string; sourceNodeId?: string }[]) => void;
  hasApiKey: boolean;
  onOpenApiKey: () => void;
}

const ASPECT_RATIOS: AspectRatio[] = ["AUTO", "1:1", "16:9", "9:16", "4:3", "3:4"];

interface ModelCost {
  name: string;
  label: string;
  resolutions: {
    [key: string]: { cost: number; rmb: number };
  };
}

const MODEL_COSTS: Record<ImageModel, ModelCost> = {
  'gemini-2.5-flash-image': { 
    name: 'FLASH 2.5', 
    label: 'BALANCED',
    resolutions: {
      '1K': { cost: 0.039, rmb: 0.3 }
    }
  },
  'gemini-3.1-flash-image-preview': { 
    name: 'FLASH 3.1', 
    label: 'HIGH FIDELITY',
    resolutions: {
      '0.5K': { cost: 0.045, rmb: 0.3 },
      '1K': { cost: 0.067, rmb: 0.5 },
      '2K': { cost: 0.101, rmb: 0.7 },
      '4K': { cost: 0.151, rmb: 1.1 }
    }
  },
  'gemini-3-pro-image-preview': { 
    name: 'PRO 3.0', 
    label: 'CINEMA GRADE',
    resolutions: {
      '1K': { cost: 0.134, rmb: 1.0 },
      '2K': { cost: 0.134, rmb: 1.0 },
      '4K': { cost: 0.24, rmb: 1.7 }
    }
  },
  'doubao-pro-v1': {
    name: 'Doubao-Seedream-5.0-lite',
    label: 'BYTEDANCE',
    resolutions: {
      '2K': { cost: 0.067, rmb: 0.3 },
      '4K': { cost: 0.067, rmb: 0.3 }
    }
  }
};

const IMAGE_SIZES: { id: ImageSize; label: string }[] = [
  { id: "512px", label: "0.5K" },
  { id: "1K", label: "1K" },
  { id: "2K", label: "2K" },
  { id: "4K", label: "4K" },
];

const MODELS: { id: ImageModel; name: string; version: string; desc: string }[] = [
  { id: "gemini-2.5-flash-image", name: "FLASH", version: "2.5", desc: "BALANCED" },
  { id: "gemini-3.1-flash-image-preview", name: "FLASH", version: "3.1", desc: "HIGH FIDELITY" },
  { id: "gemini-3-pro-image-preview", name: "PRO", version: "3.0", desc: "CINEMA GRADE" },
  { id: "doubao-pro-v1", name: "DOUBAO", version: "5.0", desc: "BYTEDANCE" },
];

export const GenerationBar = forwardRef<GenerationBarRef, GenerationBarProps>(({ onGenerate, hasApiKey, onOpenApiKey }, ref) => {
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("1:1");
  const [imageSize, setImageSize] = useState<ImageSize>("1K");
  const [model, setModel] = useState<ImageModel>("gemini-3.1-flash-image-preview");
  const [showOptions, setShowOptions] = useState(false);
  const [images, setImages] = useState<{ data: string; mimeType: string; preview: string; width?: number; height?: number; sourceNodeId?: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [prompt]);

  useEffect(() => {
    const lookupId = imageSize === "512px" ? "0.5K" : imageSize;
    if (!MODEL_COSTS[model].resolutions[lookupId]) {
      const available = Object.keys(MODEL_COSTS[model].resolutions);
      if (available.length > 0) {
        const first = available[0];
        setImageSize(first === "0.5K" ? "512px" : first as ImageSize);
      }
    }
  }, [model]);

  useImperativeHandle(ref, () => ({
    addImage: (data, mimeType, preview, sourceNodeId) => {
      setImages(prev => {
        if (prev.some(img => img.data === data)) return prev;
        
        // Try to get dimensions
        const img = new Image();
        img.onload = () => {
          setImages(current => current.map(item => 
            item.data === data ? { ...item, width: img.width, height: img.height } : item
          ));
        };
        img.src = preview;
        
        return [...prev, { data, mimeType, preview, sourceNodeId }];
      });
    },
    setParams: (p, ar, is, m, imgs) => {
      setPrompt(p);
      setAspectRatio(ar);
      setImageSize(is);
      setModel(m);
      if (imgs) {
        setImages(imgs.map(img => ({ ...img })));
      }
      setShowOptions(true);
    }
  }));

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file: File) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = (reader.result as string).split(',')[1];
        const preview = reader.result as string;
        
        const img = new Image();
        img.onload = () => {
          setImages(prev => [...prev, {
            data: base64String,
            mimeType: file.type,
            preview,
            width: img.width,
            height: img.height
          }]);
          // Auto expand options when image is uploaded
          setShowOptions(true);
        };
        img.src = preview;
      };
      reader.readAsDataURL(file);
    });
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  /*
  const getClosestAspectRatio = (width: number, height: number): AspectRatio => {
    const ratio = width / height;
    const targets: { ratio: number; value: AspectRatio }[] = [
      { ratio: 1, value: "1:1" },
      { ratio: 3/4, value: "3:4" },
      { ratio: 4/3, value: "4:3" },
      { ratio: 9/16, value: "9:16" },
      { ratio: 16/9, value: "16:9" },
    ];
    
    return targets.reduce((prev, curr) => 
      Math.abs(curr.ratio - ratio) < Math.abs(prev.ratio - ratio) ? curr : prev
    ).value;
  };
  */

  const getClosestAspectRatio = (ratio: number): AspectRatio => {
    const targets: { ratio: number; value: AspectRatio }[] = [
      { ratio: 1, value: "1:1" },
      { ratio: 3/4, value: "3:4" },
      { ratio: 4/3, value: "4:3" },
      { ratio: 9/16, value: "9:16" },
      { ratio: 16/9, value: "16:9" },
    ];
    
    return targets.reduce((prev, curr) => 
      Math.abs(curr.ratio - ratio) < Math.abs(prev.ratio - ratio) ? curr : prev
    ).value;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    
    let finalAspectRatio = aspectRatio;
    let finalImageSize = imageSize;

    if (aspectRatio === "AUTO") {
      // 1. Check for explicit dimensions in prompt (e.g., "1024x1024", "1920*1080")
      const dimMatch = prompt.match(/(\d+)\s*[x*]\s*(\d+)/);
      if (dimMatch) {
        const w = parseInt(dimMatch[1]);
        const h = parseInt(dimMatch[2]);
        
        // Update size based on max dimension
        const maxDim = Math.max(w, h);
        if (maxDim <= 768) finalImageSize = "512px";
        else if (maxDim <= 1536) finalImageSize = "1K";
        else if (maxDim <= 3072) finalImageSize = "2K";
        else finalImageSize = "4K";

        finalAspectRatio = getClosestAspectRatio(w / h);
      } else {
        // 2. Check for explicit ratio in prompt (e.g., "16:9", "4:3")
        const ratioMatch = prompt.match(/(1:1|16:9|9:16|4:3|3:4)/);
        if (ratioMatch) {
          finalAspectRatio = ratioMatch[1] as AspectRatio;
        } else {
          // 3. Check for image references in prompt (e.g., "Image 1", "图1")
          const imageRefMatch = prompt.match(/(?:Image|图)\s*(\d+)/i);
          if (imageRefMatch) {
            const index = parseInt(imageRefMatch[1]) - 1;
            if (images[index] && images[index].width && images[index].height) {
              const ratio = images[index].width! / images[index].height!;
              finalAspectRatio = getClosestAspectRatio(ratio);
              
              // Also update size based on reference image
              const maxDim = Math.max(images[index].width!, images[index].height!);
              if (maxDim <= 768) finalImageSize = "512px";
              else if (maxDim <= 1536) finalImageSize = "1K";
              else if (maxDim <= 3072) finalImageSize = "2K";
              else finalImageSize = "4K";
            }
          } else if (images.length > 0) {
            // 4. Default to first image if no specific reference
            const firstImg = images[0];
            if (firstImg.width && firstImg.height) {
              const ratio = firstImg.width / firstImg.height;
              finalAspectRatio = getClosestAspectRatio(ratio);
            }
          }
        }
      }
    }
    
    onGenerate(prompt, finalAspectRatio, finalImageSize, model, images.map(img => ({ 
      data: img.data, 
      mimeType: img.mimeType,
      sourceNodeId: img.sourceNodeId
    })));
    setPrompt('');
    setImages([]);
    // Auto collapse options after sending
    setShowOptions(false);
  };

  const calculatePrice = (mId: ImageModel, sId: ImageSize) => {
    const modelCfg = MODEL_COSTS[mId];
    if (!modelCfg) return "¥0.00";
    
    // Map 512px to 0.5K for pricing lookup
    const lookupId = sId === "512px" ? "0.5K" : sId;
    
    const price = modelCfg.resolutions[lookupId]?.rmb;
    if (price !== undefined) return `¥${price.toFixed(2)}`;
    
    // Fallback if resolution not defined for this model
    const availableRes = Object.values(modelCfg.resolutions);
    if (availableRes.length > 0) return `¥${availableRes[0].rmb.toFixed(2)}`;
    
    return "¥0.00";
  };

  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-full max-w-3xl px-4 z-50">
      <AnimatePresence>
        {images.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="flex flex-wrap gap-2 mb-2 p-2 bg-[#1a1a1a]/90 backdrop-blur-xl border border-[#333] rounded-xl"
          >
            {images.map((img, index) => (
              <div key={index} className="relative group w-16 h-16 rounded-lg overflow-hidden border border-[#444]">
                <img src={img.preview} alt="preview" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeImage(index)}
                  className="absolute top-0.5 right-0.5 p-0.5 bg-black/60 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      
      <div className="bg-[#1a1a1a]/90 backdrop-blur-xl border border-[#333] rounded-2xl p-2 shadow-2xl">
        <form onSubmit={handleSubmit} className="flex flex-col">
          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              multiple
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-3 hover:bg-[#333] rounded-xl text-gray-400 transition-colors"
            >
              <ImageIcon size={20} />
            </button>

            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                if (e.target.value.trim() && !showOptions) {
                  setShowOptions(true);
                }
              }}
              onFocus={() => {
                if (!showOptions) setShowOptions(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (prompt.trim()) {
                    handleSubmit(e as unknown as React.FormEvent);
                  }
                }
              }}
              placeholder="请输入你想生成的画面描述..."
              className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-gray-200 placeholder-gray-500 py-3 resize-none max-h-[300px] min-h-[44px] overflow-y-auto"
              rows={1}
            />

            <div className="flex items-center gap-1 px-2 border-l border-[#333]">
              <button
                type="button"
                onClick={() => setShowOptions(!showOptions)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                  showOptions ? "bg-red-600 text-white" : "hover:bg-[#333] text-gray-400"
                )}
              >
                参数设置
                <ChevronDown size={12} className={cn("transition-transform", showOptions && "rotate-180")} />
              </button>

              {!hasApiKey ? (
                <button
                  type="button"
                  onClick={onOpenApiKey}
                  className="p-2 bg-yellow-500/20 text-yellow-500 rounded-xl hover:bg-yellow-500/30 transition-colors flex items-center gap-2 px-4"
                >
                  <Key size={18} />
                  <span className="text-xs font-bold whitespace-nowrap">API Key</span>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!prompt.trim()}
                  className={cn(
                    "p-2 rounded-xl transition-all flex items-center justify-center min-w-[44px]",
                    !prompt.trim()
                      ? "bg-[#333] text-gray-600 cursor-not-allowed" 
                      : "bg-red-600 text-white hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(220,38,38,0.3)]"
                  )}
                >
                  <Send size={20} />
                </button>
              )}
            </div>
          </div>

          <AnimatePresence>
            {showOptions && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="pt-4 pb-2 border-t border-[#333] mt-2 space-y-6">
                  {/* Engine Selection */}
                  <div>
                    <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3 px-1">渲染引擎 / ENGINE</div>
                    <div className="grid grid-cols-3 gap-3">
                      {MODELS.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setModel(m.id)}
                          className={cn(
                            "flex flex-col items-start p-4 rounded-2xl transition-all text-left relative overflow-hidden",
                            model === m.id 
                              ? "bg-white text-black shadow-[0_10px_30px_rgba(255,255,255,0.1)] scale-[1.02]" 
                              : "bg-[#222] text-gray-400 hover:bg-[#2a2a2a]"
                          )}
                        >
                          <div className="text-sm font-black tracking-tight">{m.name} {m.version}</div>
                          <div className="text-[9px] font-bold opacity-60 mb-3 uppercase tracking-wider">{m.desc}</div>
                          <div className={cn(
                            "text-[10px] font-bold",
                            model === m.id ? "text-red-600" : "text-red-500"
                          )}>{calculatePrice(m.id, imageSize)}/图</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Resolution Selection */}
                  <div>
                    <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3 px-1">渲染精度 / RESOLUTION</div>
                    <div className="flex flex-wrap gap-2">
                      {IMAGE_SIZES.filter(size => {
                        const lookupId = size.id === "512px" ? "0.5K" : size.id;
                        return !!MODEL_COSTS[model].resolutions[lookupId];
                      }).map((size) => (
                        <button
                          key={size.id}
                          type="button"
                          onClick={() => setImageSize(size.id)}
                          className={cn(
                            "flex items-baseline gap-1.5 px-5 py-3 rounded-2xl transition-all",
                            imageSize === size.id 
                              ? "bg-white text-black scale-105" 
                              : "bg-[#222] text-gray-400 hover:bg-[#2a2a2a]"
                          )}
                        >
                          <span className="text-sm font-black">{size.label}</span>
                          <span className="text-[9px] font-bold opacity-60">{calculatePrice(model, size.id)}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Aspect Ratio Selection */}
                  <div>
                    <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3 px-1">构图比例 / ASPECT RATIO</div>
                    <div className="flex flex-wrap gap-2">
                      {ASPECT_RATIOS.map((ratio) => (
                        <button
                          key={ratio}
                          type="button"
                          onClick={() => setAspectRatio(ratio)}
                          className={cn(
                            "px-6 py-3 rounded-2xl text-sm font-black transition-all",
                            aspectRatio === ratio 
                              ? "bg-white text-black scale-105" 
                              : "bg-[#222] text-gray-400 hover:bg-[#2a2a2a]"
                          )}
                        >
                          {ratio}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </form>
      </div>
    </div>
  );
});

GenerationBar.displayName = 'GenerationBar';
