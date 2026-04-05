import React, { useState } from 'react';
import { NodeProps, type Node } from '@xyflow/react';
import { Trash2, FileText, Download, Edit2, Check, X } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

export interface NoteNodeData extends Record<string, unknown> {
  title: string;
  content: string;
  onDelete?: () => void;
  onChange?: (title: string, content: string) => void;
}

export const NoteNode = ({ data, selected }: NodeProps<Node<NoteNodeData>>) => {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(data.title || '操作说明');
  const [content, setContent] = useState(data.content || '');

  const handleSave = () => {
    data.onChange?.(title, content);
    setIsEditing(false);
  };

  const handleExport = () => {
    const blob = new Blob([`${title}\n\n${content}`], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-1.5 w-[320px]">
      <div className="flex items-center justify-between px-1">
        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
          <FileText size={10} className="text-blue-500" />
          工作流说明
        </div>
        <div className="flex items-center gap-1">
          <button 
            onClick={handleExport}
            className="p-1 hover:bg-[#333] rounded transition-all text-gray-500 hover:text-white"
            title="导出为文本"
          >
            <Download size={10} />
          </button>
          <button 
            onClick={() => data.onDelete?.()}
            className="p-1 hover:bg-[#333] rounded transition-all text-gray-500 hover:text-red-500"
            title="删除"
          >
            <Trash2 size={10} />
          </button>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={cn(
          "bg-[#1a1a1a] rounded-lg overflow-hidden shadow-2xl transition-all duration-200 w-full border border-[#333]",
          selected ? "ring-2 ring-blue-600 ring-offset-2 ring-offset-[#0a0a0a]" : ""
        )}
      >
        <div className="p-4 flex flex-col gap-3">
          {isEditing ? (
            <div className="flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="bg-[#0a0a0a] border border-[#333] rounded px-2 py-1 text-sm font-bold text-white outline-none focus:border-blue-500"
                placeholder="标题..."
                autoFocus
              />
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="bg-[#0a0a0a] border border-[#333] rounded px-2 py-1 text-xs text-gray-300 outline-none focus:border-blue-500 min-h-[120px] resize-none"
                placeholder="输入说明内容..."
              />
              <div className="flex justify-end gap-2">
                <button 
                  onClick={() => { setTitle(data.title); setContent(data.content); setIsEditing(false); }}
                  className="p-1.5 bg-[#333] text-gray-400 rounded-lg hover:text-white transition-all"
                >
                  <X size={14} />
                </button>
                <button 
                  onClick={handleSave}
                  className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-all"
                >
                  <Check size={14} />
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between group/title">
                <h3 className="text-sm font-bold text-white truncate pr-4">{title}</h3>
                <button 
                  onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
                  className="opacity-0 group-hover/title:opacity-100 p-1 hover:bg-[#333] rounded transition-all text-gray-500 hover:text-white"
                >
                  <Edit2 size={12} />
                </button>
              </div>
              <div className="text-xs text-gray-400 leading-relaxed whitespace-pre-wrap break-words min-h-[40px]">
                {content || <span className="italic opacity-50">点击右侧编辑按钮添加说明...</span>}
              </div>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
};
