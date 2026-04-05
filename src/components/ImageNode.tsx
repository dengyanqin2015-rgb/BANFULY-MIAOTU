import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, NodeProps, type Node } from '@xyflow/react';
import { Download, Trash2, Loader2, Search, RefreshCw, Settings2, FileImage, X, Copy, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { AspectRatio, ImageSize, ImageModel } from '../lib/gemini';

export interface ImageNodeData extends Record<string, unknown> {
  imageUrl?: string;
  prompt: string;
  isLoading?: boolean;
  error?: string;
  onDelete?: () => void;
  onRegenerate?: () => void;
  onAdjust?: () => void;
  refImages?: string[]; // Base64 or URLs of reference images used
  resolution?: string;
  type?: 'source' | 'generated';
  sourceNodeId?: string;
  // Context for regeneration
  aspectRatio?: AspectRatio;
  imageSize?: ImageSize;
  model?: ImageModel;
}

export const ImageNode = ({ data, selected, id }: NodeProps<Node<ImageNodeData>>) => {
  const [isZoomed, setIsZoomed] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [isHoveringPrompt, setIsHoveringPrompt] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(data.prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
    <div className="flex flex-col gap-1.5" onContextMenu={handleContextMenu}>
      <div className="flex items-center justify-between px-1">
        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
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
          "bg-[#1a1a1a] rounded-lg overflow-hidden shadow-2xl transition-all duration-200",
          selected ? "ring-2 ring-red-600 ring-offset-2 ring-offset-[#0a0a0a]" : "border border-[#333]"
        )}
      >
        <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-red-600 !border-none -left-1" />
        
        <div className="relative min-w-[200px] max-w-[320px] bg-[#0a0a0a] flex items-center justify-center group cursor-pointer">
          {data.isLoading ? (
            <div className="flex flex-col items-center gap-3 py-20">
              <Loader2 className="animate-spin text-red-600" size={32} />
              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Generating</span>
            </div>
          ) : data.error ? (
            <div className="p-8 text-center">
              <span className="text-xs text-red-400 font-medium">{data.error}</span>
            </div>
          ) : data.imageUrl ? (
            <>
              <img 
                src={data.imageUrl} 
                alt={data.prompt} 
                className="w-full h-auto object-contain"
                referrerPolicy="no-referrer"
              />
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
            </>
          ) : null}
        </div>

        <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-red-600 !border-none -right-1" />
      </motion.div>

      {data.type === 'generated' && (
        <div className="flex flex-col gap-1 px-1">
          {!data.isLoading && (
            <div className="text-[9px] text-gray-500 font-bold uppercase">
              {data.resolution || '1024 x 1024'}
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
              className="text-[10px] text-gray-400 line-clamp-2 leading-relaxed flex-1 cursor-help"
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
              onClick={() => { data.onAdjust?.(); setShowMenu(false); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-[#333] hover:text-white transition-colors"
            >
              <Settings2 size={16} className="text-blue-400" />
              <span>调整图片重新生成</span>
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
    </div>
  );
};
