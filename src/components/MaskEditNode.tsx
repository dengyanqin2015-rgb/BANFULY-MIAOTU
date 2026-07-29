import React, { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { Loader2, Maximize2, RotateCcw, Trash2 } from 'lucide-react';
import { ImageTextEditor, type MaskEditorDraft } from './ImageTextEditor';

export interface MaskEditNodeData extends Record<string, unknown> {
  imageUrl: string;
  prompt?: string;
  sourceNodeId: string;
  draft?: MaskEditorDraft;
  onDelete?: () => void;
  onApply?: (imageUrl: string) => void;
  onDraftChange?: (draft: MaskEditorDraft) => void;
}

export const MaskEditNode = ({ data, selected }: NodeProps<Node<MaskEditNodeData>>) => {
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<MaskEditorDraft | undefined>(data.draft);
  const preserveDraft = useCallback((next: MaskEditorDraft) => { setDraft(next); data.onDraftChange?.(next); }, [data.onDraftChange]);

  const runInBackground = (task: Promise<string>) => {
    setWorking(true); setError('');
    void task.then(imageUrl => {
      setWorking(false);
      data.onApply?.(imageUrl);
    }).catch(reason => {
      setWorking(false);
      setError(reason instanceof Error ? reason.message : '后台修改失败');
    });
  };

  return <>
    <div className="flex w-[320px] flex-col gap-1.5 text-white">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-gray-400"><span className={`h-1.5 w-1.5 rounded-full ${working ? 'animate-pulse bg-cyan-300' : error ? 'bg-red-500' : 'bg-cyan-400'}`}/><span>遮罩编辑层</span></div>
        <button disabled={working} className="rounded p-1 text-gray-500 hover:bg-[#333] hover:text-red-400 disabled:opacity-30" onClick={() => data.onDelete?.()} title="删除遮罩层"><Trash2 size={12}/></button>
      </div>
      <div className={`relative w-full overflow-hidden rounded-lg bg-[#1a1a1a] shadow-2xl ${selected ? 'ring-2 ring-cyan-400 ring-offset-2 ring-offset-[#0a0a0a]' : 'border border-[#333]'}`}>
        <Handle type="target" position={Position.Left} className="!-left-1 !h-2 !w-2 !border-0 !bg-cyan-400" />
        <button disabled={working} onClick={() => setOpen(true)} className="group relative block w-full overflow-hidden bg-[#0a0a0a] disabled:cursor-wait">
          <img src={data.imageUrl} crossOrigin="anonymous" alt="遮罩编辑源图" className="h-auto w-full object-contain opacity-75 transition group-hover:opacity-95"/>
          <span className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-100 transition group-hover:bg-black/45"><span className="flex items-center gap-2 rounded-full border border-white/10 bg-black/70 px-3 py-1.5 text-[10px] font-bold text-cyan-200 backdrop-blur-md">{working ? <><Loader2 size={13} className="animate-spin"/>后台处理中…</> : <><Maximize2 size={13}/>{error ? '重新打开修改' : '打开遮罩编辑'}</>}</span></span>
        </button>
        <Handle type="source" position={Position.Right} className="!-right-1 !h-2 !w-2 !border-0 !bg-cyan-400" />
      </div>
      <div className={`px-1 text-[10px] leading-relaxed ${error ? 'text-red-400' : working ? 'text-cyan-300' : 'text-gray-500'}`}>{error ? <span className="flex items-start gap-1"><RotateCcw size={11} className="mt-0.5 shrink-0"/>{error}</span> : working ? '后台处理中，完成后自动在右侧生成结果图' : '框选或涂抹 · 修改文字或内容 · 一次提交'}</div>
    </div>
    {open && createPortal(<ImageTextEditor imageUrl={data.imageUrl} title="遮罩定点修改" onClose={() => setOpen(false)} onConfirm={(imageUrl) => { data.onApply?.(imageUrl); setOpen(false); }} onBackgroundTask={runInBackground} initialDraft={draft} onDraftChange={preserveDraft}/>, document.body)}
  </>;
};
