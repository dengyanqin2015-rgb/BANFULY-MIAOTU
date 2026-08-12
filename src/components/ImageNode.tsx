import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, NodeProps, type Node } from '@xyflow/react';
import { Download, Trash2, Loader2, Search, RefreshCw, Settings2, FileImage, X, Copy, Check, Sparkles, Scissors, Brush } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { AspectRatio, ImageSize, ImageModel } from '../lib/gemini';
import { ImageSliceEditor } from './ImageSliceEditor';
import type { SelectedCategoryBase } from './GenerationBar';

export interface ImageNodeData extends Record<string, unknown> {
  imageUrl?: string;
  analysisImageUrl?: string;
  uploadOriginalBytes?: number;
  uploadAnalysisBytes?: number;
  prompt: string;
  isLoading?: boolean;
  generationStatus?: string;
  generationDetail?: string;
  error?: string;
  onDelete?: () => void;
  onCancel?: () => void;
  onRegenerate?: () => void;
  onAdjust?: (mode?: 'reference' | 'text') => void;
  onAnalyze?: () => void;
  onCrop?: (images: string[]) => void;
  onCreateMask?: () => void;
  onSendToAssistant?: () => void;
  refImages?: string[]; // Base64 or URLs of reference images used
  originalImages?: { data: string; mimeType: string; sourceNodeId?: string }[];
  resolution?: string;
  type?: 'source' | 'generated';
  layoutMode?: 'grid' | 'reference';
  layoutSlot?: { x: number; y: number };
  sourceNodeId?: string;
  // Context for regeneration
  aspectRatio?: AspectRatio;
  imageSize?: ImageSize;
  model?: ImageModel;
  categoryBase?: SelectedCategoryBase;
  analysisPrompt?: string;
  analysisTemplateName?: string;
  isAnalyzing?: boolean;
  analysisError?: string;
}

export const ImageNode = ({ data, selected, id }: NodeProps<Node<ImageNodeData>>) => {
  const [isZoomed, setIsZoomed] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [isHoveringPrompt, setIsHoveringPrompt] = useState(false);
  const [copied, setCopied] = useState(false);
  const [analysisCopied, setAnalysisCopied] = useState(false);
  const [showAdjustChoice, setShowAdjustChoice] = useState(false);
  const [showSliceEditor, setShowSliceEditor] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(data.prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyAnalysis = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!data.analysisPrompt) return;
    navigator.clipboard.writeText(data.analysisPrompt);
    setAnalysisCopied(true);
    setTimeout(() => setAnalysisCopied(false), 2000);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as HTMLElement)) {
        setShowMenu(false);
      }
    };
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  const handleDownload = (format: 'png' | 'jpg' = 'png') => {
    if (!data.imageUrl) return;
    
    try {
      if (format === 'png') {
        const link = document.createElement('a');
        link.href = data.imageUrl;
        link.download = `banfuly-ai-${id}-${Date.now()}.png`;
        link.click();
      } else {
        // Convert to JPG using canvas
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.fillStyle = 'white';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.drawImage(img, 0, 0);
              const jpgUrl = canvas.toDataURL('image/jpeg', 0.9);
              const link = document.createElement('a');
              link.href = jpgUrl;
              link.download = `banfuly-ai-${id}-${Date.now()}.jpg`;
              link.click();
            }
          } catch (e) {
            console.error('Failed to convert image to JPG', e);
          }
        };
        img.onerror = () => console.error('Failed to load image for JPG conversion');
        img.src = data.imageUrl;
      }
    } catch (e) {
      console.error('Failed to download image', e);
    }
    setShowMenu(false);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setMenuPos({ x: e.clientX, y: e.clientY });
    setShowMenu(true);
  };

  const headerText = data.type === 'generated' 
    ? `图片生成${data.sourceNodeId ? ` (由图片${data.sourceNodeId.split('-').pop()})` : ''}`
    : '图片';

  return (
    <div className="flex flex-col gap-1.5 w-[320px]" onContextMenu={handleContextMenu}>
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
          <span className="w-1.5 h-1.5 bg-green-500 rounded-full shadow-[0_0_5px_rgba(34,197,94,0.5)]" />
          {headerText}
        </div>
        {data.type === 'generated' && (
          <button 
            onClick={handleCopy}
            className="p-1 hover:bg-[#333] rounded transition-all text-gray-500 hover:text-white"
            title="复制关键词"
          >
            {copied ? <Check size={10} className="text-green-500" /> : <Copy size={10} />}
          </button>
        )}
      </div>
      
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={cn(
          "relative bg-[#1a1a1a] rounded-lg overflow-visible shadow-2xl transition-all duration-200 w-full",
          selected ? "ring-2 ring-red-600 ring-offset-2 ring-offset-[#0a0a0a]" : "border border-[#333]"
        )}
      >
        <Handle type="target" position={Position.Left} className="!z-20 !h-3 !w-3 !border-2 !border-[#0a0a0a] !bg-red-600" />
        
        <div className="overflow-hidden rounded-lg">
        <div className="relative w-full bg-[#0a0a0a] flex items-center justify-center group cursor-pointer">
          {data.isLoading && !data.imageUrl ? (
            <div className="flex flex-col items-center gap-3 py-20">
              <Loader2 className="animate-spin text-red-600" size={32} />
              <span className="text-[10px] text-gray-300 font-bold tracking-wider">{data.generationStatus || '正在生成'}</span>
              {data.generationDetail && <span className="max-w-[250px] text-center text-[9px] leading-relaxed text-gray-500">{data.generationDetail}</span>}
              {data.onCancel && (
                <button type="button" onClick={(event) => { event.stopPropagation(); data.onCancel?.(); }} className="nodrag rounded-md border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-[10px] font-bold text-red-300 hover:bg-red-500/20">
                  停止生成
                </button>
              )}
            </div>
          ) : data.imageUrl ? (
            <>
              <img 
                src={data.imageUrl} 
                alt={data.prompt} 
                className="w-full h-auto object-contain"
                referrerPolicy="no-referrer"
              />
              {data.isLoading ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/65 backdrop-blur-[1px]">
                  <Loader2 className="animate-spin text-red-500" size={32} />
                  <span className="text-[10px] font-bold tracking-wider text-white">{data.generationStatus || '正在重新生成'}</span>
                  {data.generationDetail && <span className="max-w-[250px] text-center text-[9px] leading-relaxed text-gray-300">{data.generationDetail}</span>}
                  {data.onCancel && (
                    <button type="button" onClick={(event) => { event.stopPropagation(); data.onCancel?.(); }} className="nodrag rounded-md border border-red-400/50 bg-black/40 px-3 py-1.5 text-[10px] font-bold text-red-200 hover:bg-black/60">
                      停止生成
                    </button>
                  )}
                </div>
              ) : (
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-4">
                <div className="flex items-center gap-3">
                  <button 
                    onClick={(e) => { e.stopPropagation(); setIsZoomed(true); }}
                    className="p-2 bg-white text-black rounded-full hover:scale-110 transition-transform"
                    title="放大查看"
                  >
                    <Search size={18} />
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDownload(); }}
                    className="p-2 bg-red-600 text-white rounded-full hover:scale-110 transition-transform"
                    title="下载 PNG"
                  >
                    <Download size={18} />
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); data.onDelete?.(); }}
                    className="p-2 bg-red-500 text-white rounded-full hover:scale-110 transition-transform"
                    title="删除节点"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
                <span className="text-[10px] text-gray-300 font-bold uppercase tracking-wider bg-black/40 px-3 py-1.5 rounded-full backdrop-blur-md border border-white/10">
                  Double click to reuse
                </span>
              </div>
              )}
              {data.error && !data.isLoading && (
                <div className="absolute inset-x-2 bottom-2 rounded-md border border-red-500/40 bg-black/85 px-3 py-2 text-center text-[10px] font-medium text-red-300">
                  {data.error}
                </div>
              )}
            </>
          ) : data.error ? (
            <div className="p-8 text-center">
              <span className="text-xs text-red-400 font-medium">{data.error}</span>
            </div>
          ) : null}
        </div>
        </div>

        <Handle type="source" position={Position.Right} className="!z-20 !h-3 !w-3 !border-2 !border-[#0a0a0a] !bg-red-600" />
      </motion.div>

      {data.type === 'generated' && (
        <div className="flex flex-col gap-1 px-1">
          {!data.isLoading && (
            <div className="flex items-center gap-1.5 text-[9px] text-gray-500 font-bold uppercase">
              <span>{data.resolution || '1024 x 1024'}</span>
              {data.categoryBase && (
                <span className="max-w-[170px] truncate rounded border border-orange-500/25 bg-orange-500/10 px-1.5 py-0.5 text-[8px] text-orange-300 normal-case">
                  基座 · {data.categoryBase.name} V{data.categoryBase.version}
                </span>
              )}
            </div>
          )}
          <div className="flex items-start gap-2 relative group/prompt">
            {data.refImages && data.refImages.length > 0 && (
              <div className="flex gap-1 mt-0.5">
                {data.refImages.map((ref, i) => (
                  <img key={i} src={ref} className="w-6 h-6 rounded border border-[#333] object-cover" alt="ref" />
                ))}
              </div>
            )}
            <div 
              className="text-[10px] text-gray-400 leading-relaxed flex-1 cursor-help break-words line-clamp-2"
              onMouseEnter={() => setIsHoveringPrompt(true)}
              onMouseLeave={() => setIsHoveringPrompt(false)}
            >
              {data.prompt}
            </div>
            
            <button 
              onClick={handleCopy}
              className="opacity-0 group-hover/prompt:opacity-100 p-1 hover:bg-[#333] rounded transition-all text-gray-400 hover:text-white shrink-0"
              title="复制关键词"
            >
              {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
            </button>

            {/* Hover Tooltip */}
            <AnimatePresence>
              {isHoveringPrompt && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 5 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 5 }}
                  className="absolute bottom-full left-0 mb-2 w-64 bg-[#1a1a1a] border border-[#333] p-3 rounded-lg shadow-2xl z-[100] pointer-events-none"
                >
                  <div className="text-[10px] font-bold text-gray-500 uppercase mb-1 tracking-widest">完整关键词 / FULL PROMPT</div>
                  <div className="text-[11px] text-gray-300 leading-relaxed break-words font-medium">
                    {data.prompt}
                  </div>
                  <div className="absolute -bottom-1.5 left-4 w-3 h-3 bg-[#1a1a1a] border-r border-b border-[#333] rotate-45" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="mt-1.5 rounded-lg border border-[#303030] bg-[#141414] p-2">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-[9px] font-bold text-blue-400">
                复刻关键词{data.analysisTemplateName ? ` · ${data.analysisTemplateName}` : ''}
              </span>
              <div className="flex items-center gap-1">
                {data.analysisPrompt && (
                  <button onClick={copyAnalysis} className="p-1 text-gray-500 hover:text-white" title="复制复刻关键词">
                    {analysisCopied ? <Check size={11} className="text-green-500" /> : <Copy size={11} />}
                  </button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); data.onAnalyze?.(); }}
                  disabled={data.isAnalyzing || !data.imageUrl}
                  className="nodrag rounded-md bg-blue-600/15 px-2 py-1 text-[9px] font-bold text-blue-400 hover:bg-blue-600/25 disabled:opacity-50"
                >
                  {data.isAnalyzing ? '解析中…' : data.analysisPrompt ? '重新解析' : '一键解析'}
                </button>
              </div>
            </div>
            {data.analysisPrompt ? (
              <div className="line-clamp-3 break-words text-[10px] leading-relaxed text-gray-400">{data.analysisPrompt}</div>
            ) : (
              <div className="text-[9px] text-gray-600">{data.analysisError || '解析图片后生成可直接复刻画面的文生图关键词'}</div>
            )}
          </div>
        </div>
      )}

      {/* Zoom Overlay - Portal to Body */}
      {isZoomed && data.imageUrl && createPortal(
        <AnimatePresence mode="wait">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsZoomed(false)}
            className="fixed inset-0 z-[9999] bg-black/95 flex items-center justify-center p-4 md:p-12 cursor-zoom-out backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-full max-h-full flex items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={data.imageUrl}
                alt="zoomed"
                className="max-w-full max-h-[90vh] object-contain shadow-[0_0_50px_rgba(0,0,0,0.5)] rounded-xl border border-white/10"
                referrerPolicy="no-referrer"
                onClick={() => setIsZoomed(false)}
              />
              <button 
                onClick={() => setIsZoomed(false)}
                className="absolute -top-12 right-0 p-2 text-white/50 hover:text-white transition-colors flex items-center gap-2 text-sm font-bold"
              >
                <X size={20} />
                关闭预览
              </button>
            </motion.div>
          </motion.div>
        </AnimatePresence>,
        document.body
      )}

      {/* Context Menu - Portal to Body */}
      {showMenu && createPortal(
        <AnimatePresence>
          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            style={{ 
              position: 'fixed', 
              left: menuPos.x, 
              top: menuPos.y,
              zIndex: 10000 
            }}
            className="w-56 bg-[#1a1a1a] border border-[#333] rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden py-1.5 backdrop-blur-2xl"
          >
            <button 
              onClick={() => { data.onRegenerate?.(); setShowMenu(false); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-[#333] hover:text-white transition-colors"
            >
              <RefreshCw size={16} className="text-red-600" />
              <span>重新生成</span>
            </button>
            <button 
              onClick={() => {
                setShowMenu(false);
                if (data.analysisPrompt) setShowAdjustChoice(true);
                else data.onAdjust?.('reference');
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-[#333] hover:text-white transition-colors"
            >
              <Settings2 size={16} className="text-blue-400" />
              <span>调整图片重新生成</span>
            </button>
            <button 
              onClick={() => { data.onSendToAssistant?.(); setShowMenu(false); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-[#333] hover:text-white transition-colors"
            >
              <Sparkles size={16} className="text-yellow-400" />
              <span>一键发送助理分析</span>
            </button>
            <button
              onClick={() => { setShowMenu(false); setShowSliceEditor(true); }}
              disabled={!data.imageUrl}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-[#333] hover:text-white transition-colors disabled:opacity-40"
            >
              <Scissors size={16} className="text-emerald-400" />
              <span>一键裁剪</span>
            </button>
            <button
              onClick={() => { setShowMenu(false); data.onCreateMask?.(); }}
              disabled={!data.imageUrl}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-[#333] hover:text-white transition-colors disabled:opacity-40"
            >
              <Brush size={16} className="text-cyan-400" />
              <span>插入遮罩编辑层</span>
            </button>
            <div className="h-px bg-[#333] my-1.5 mx-2" />
            <div className="px-4 py-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-widest">导出图片 / EXPORT</div>
            <button 
              onClick={() => handleDownload('png')}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-[#333] hover:text-white transition-colors"
            >
              <FileImage size={16} />
              <span>导出为 PNG</span>
            </button>
            <button 
              onClick={() => handleDownload('jpg')}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-[#333] hover:text-white transition-colors"
            >
              <FileImage size={16} />
              <span>导出为 JPG</span>
            </button>
            <div className="h-px bg-[#333] my-1.5 mx-2" />
            <button 
              onClick={() => { data.onDelete?.(); setShowMenu(false); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 size={16} />
              <span>删除节点</span>
            </button>
          </motion.div>
        </AnimatePresence>,
        document.body
      )}

      {showSliceEditor && data.imageUrl && createPortal(
        <ImageSliceEditor
          imageUrl={data.imageUrl}
          onClose={() => setShowSliceEditor(false)}
          onConfirm={(images) => {
            data.onCrop?.(images);
            setShowSliceEditor(false);
          }}
        />,
        document.body
      )}

      {showAdjustChoice && createPortal(
        <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/70 p-4" onClick={() => setShowAdjustChoice(false)}>
          <div className="w-full max-w-md rounded-2xl border border-[#333] bg-[#191919] p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-white">选择调整生成方式</h3>
            <p className="mt-1 text-xs text-gray-500">两种方式不会混用，避免参考关系和新关键词相互干扰。</p>
            <div className="mt-4 grid gap-3">
              <button onClick={() => { data.onAdjust?.('reference'); setShowAdjustChoice(false); }} className="rounded-xl border border-[#333] p-4 text-left hover:border-blue-500">
                <div className="text-sm font-bold text-white">沿用原参考图和原关键词</div>
                <div className="mt-1 text-xs text-gray-500">适合继续微调当前图片，保留之前的引用关系。</div>
              </button>
              <button onClick={() => { data.onAdjust?.('text'); setShowAdjustChoice(false); }} className="rounded-xl border border-[#333] p-4 text-left hover:border-red-500">
                <div className="text-sm font-bold text-white">采用新关键词文生图</div>
                <div className="mt-1 text-xs text-gray-500">不带参考图，直接使用解析出的复刻关键词重新创作。</div>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
