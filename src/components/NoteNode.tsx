import React, { useState } from 'react';
import { NodeProps, type Node } from '@xyflow/react';
import { Trash2, FileText, Download, Edit2, Clipboard, CheckCircle2, Lock, Unlock, Palette } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

export interface NoteNodeData extends Record<string, unknown> {
  title: string;
  content: string;
  fontSize?: number;
  color?: string;
  isLocked?: boolean;
  onDelete?: () => void;
  onChange?: (title: string, content: string, fontSize: number, color: string, isLocked: boolean) => void;
}

const PRESET_COLORS = [
  { name: '蓝色', value: '#2563eb' },
  { name: '红色', value: '#dc2626' },
  { name: '绿色', value: '#16a34a' },
  { name: '黄色', value: '#ca8a04' },
  { name: '紫色', value: '#9333ea' },
  { name: '灰色', value: '#4b5563' },
];

export const NoteNode = ({ data, selected }: NodeProps<Node<NoteNodeData>>) => {
  const [isEditing, setIsEditing] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [title, setTitle] = useState(data.title || '操作说明');
  const [content, setContent] = useState(data.content || '');
  const [fontSize, setFontSize] = useState(data.fontSize || 12);
  const [color, setColor] = useState(data.color || '#2563eb');
  const [isLocked, setIsLocked] = useState(data.isLocked || false);
  const [copied, setCopied] = useState(false);

  const handleSave = () => {
    data.onChange?.(title, content, fontSize, color, isLocked);
    setIsEditing(false);
  };

  const handleToggleLock = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newLocked = !isLocked;
    setIsLocked(newLocked);
    data.onChange?.(title, content, fontSize, color, newLocked);
  };

  const handleColorSelect = (newColor: string) => {
    setColor(newColor);
    data.onChange?.(title, content, fontSize, newColor, isLocked);
    setShowColorPicker(false);
  };

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const handleExport = (e: React.MouseEvent) => {
    e.stopPropagation();
    const blob = new Blob([`${title}\n\n${content}`], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-4 w-[520px]">
      {/* Taskbar - 32px icons and text, forced to one line */}
      <div className="flex items-center justify-between px-1 gap-4">
        <div 
          className="flex items-center gap-3 font-bold uppercase tracking-wider whitespace-nowrap shrink-0"
          style={{ color: color, fontSize: '32px' }}
        >
          <FileText size={32} style={{ color: color }} className="shrink-0" />
          工作流说明
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="relative">
            <button 
              onClick={(e) => { e.stopPropagation(); setShowColorPicker(!showColorPicker); }}
              className="p-2 hover:bg-[#333] rounded-xl transition-all text-gray-400 hover:text-white"
              title="设置颜色"
            >
              <Palette size={24} />
            </button>
            <AnimatePresence>
              {showColorPicker && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 10 }}
                  className="absolute bottom-full right-0 mb-2 p-2 bg-[#1a1a1a] border border-[#333] rounded-2xl shadow-2xl flex gap-2 z-[100]"
                >
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c.value}
                      onClick={() => handleColorSelect(c.value)}
                      className="w-8 h-8 rounded-full border-2 border-transparent hover:scale-110 transition-transform"
                      style={{ backgroundColor: c.value, borderColor: color === c.value ? 'white' : 'transparent' }}
                      title={c.name}
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <button 
            onClick={handleToggleLock}
            className={cn(
              "p-2 rounded-xl transition-all",
              isLocked ? "text-red-500 bg-red-500/10" : "text-gray-400 hover:bg-[#333] hover:text-white"
            )}
            title={isLocked ? "解锁编辑" : "锁定编辑"}
          >
            {isLocked ? <Lock size={24} /> : <Unlock size={24} />}
          </button>
          <button 
            onClick={handleCopy}
            disabled={!content}
            className={cn(
              "p-2 rounded-xl transition-all",
              copied ? "text-green-500 bg-green-500/10" : "text-gray-400 hover:bg-[#333] hover:text-white disabled:opacity-30"
            )}
            title="仅复制说明内容"
          >
            {copied ? <CheckCircle2 size={24} /> : <Clipboard size={24} />}
          </button>
          <button 
            onClick={handleExport}
            className="p-2 hover:bg-[#333] rounded-xl transition-all text-gray-400 hover:text-white"
            title="导出为文本"
          >
            <Download size={24} />
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); data.onDelete?.(); }}
            className="p-2 hover:bg-[#333] rounded-xl transition-all text-gray-400 hover:text-red-500"
            title="删除"
          >
            <Trash2 size={24} />
          </button>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={cn(
          "bg-[#1a1a1a] rounded-2xl overflow-hidden shadow-2xl transition-all duration-200 w-full border-2",
          selected ? "ring-4 ring-offset-4 ring-offset-[#0a0a0a]" : ""
        )}
        style={{ 
          borderColor: selected ? color : '#333',
          boxShadow: selected ? `0 0 30px ${color}40` : 'none',
          ringColor: color
        }}
      >
        <div className="p-6 flex flex-col gap-4">
          {isEditing && !isLocked ? (
            <div className="flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="bg-[#0a0a0a] border border-[#333] rounded-xl px-4 py-2 text-[32px] font-bold text-white outline-none focus:border-blue-500 w-full"
                placeholder="标题..."
                autoFocus
              />
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500 font-bold uppercase tracking-widest">内容字号:</span>
                <input 
                  type="range" 
                  min="12" 
                  max="48" 
                  step="2"
                  value={fontSize}
                  onChange={(e) => setFontSize(parseInt(e.target.value))}
                  className="flex-1 h-1.5 bg-[#333] rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
                <span className="text-xs text-blue-500 font-bold w-6">{fontSize}</span>
              </div>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="bg-[#0a0a0a] border border-[#333] rounded-xl px-4 py-3 text-gray-300 outline-none focus:border-blue-500 min-h-[160px] resize-none"
                style={{ fontSize: `${fontSize}px` }}
                placeholder="输入说明内容..."
              />
              <div className="flex justify-end gap-3">
                <button 
                  onClick={() => { setTitle(data.title); setContent(data.content); setFontSize(data.fontSize || 12); setIsEditing(false); }}
                  className="px-4 py-2 bg-[#333] text-gray-400 rounded-xl hover:text-white transition-all text-sm font-bold"
                >
                  取消
                </button>
                <button 
                  onClick={handleSave}
                  className="px-6 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-500 transition-all text-sm font-bold"
                >
                  保存
                </button>
              </div>
            </div>
          ) : (
            <div 
              className={cn("cursor-pointer group/content", isLocked && "cursor-default")}
              onClick={() => !isLocked && setIsEditing(true)}
            >
              <div className="flex items-start justify-between group/title mb-2">
                <h3 className="text-[32px] font-bold text-white leading-tight break-words pr-4 flex-1">{title}</h3>
                {!isLocked && (
                  <div className="opacity-0 group-hover/title:opacity-100 p-2 text-gray-500 hover:text-white transition-all">
                    <Edit2 size={16} />
                  </div>
                )}
              </div>
              <div 
                className="text-gray-400 leading-relaxed whitespace-pre-wrap break-words min-h-[40px]"
                style={{ fontSize: `${fontSize}px` }}
              >
                {content || <span className="italic opacity-50 text-xs">点击此处添加说明内容...</span>}
              </div>
              {isLocked && (
                <div className="mt-4 pt-4 border-t border-[#333] flex items-center gap-2 text-[10px] text-gray-600 font-bold uppercase tracking-widest">
                  <Lock size={10} />
                  内容已锁定，解锁后可编辑
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
