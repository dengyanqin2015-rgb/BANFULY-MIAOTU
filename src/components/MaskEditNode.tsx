import React, { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { Brush, Loader2, Maximize2, RotateCcw, Trash2 } from 'lucide-react';
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
  const preserveDraft = useCallback((next: MaskEditorDraft) => { setDraft(next); data.onDraftChange?.(next); }, [data]);

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
    <div className={`w-[320px] overflow-hidden rounded-2xl border bg-[#171717] text-white shadow-2xl ${selected ? 'border-cyan-400' : 'border-[#343434]'}`}>
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-0 !bg-cyan-400" />
      <div className="flex items-center justify-between border-b border-[#303030] px-4 py-3">
        <div className="flex items-center gap-2"><span className="rounded-lg bg-cyan-400/15 p-2 text-cyan-300"><Brush size={16}/></span><div><div className="text-sm font-bold">遮罩编辑层</div><div className="text-[10px] text-gray-500">框选或涂抹 · 文字与内容</div></div></div>
        <button disabled={working} className="rounded-lg p-2 text-gray-500 hover:bg-white/10 hover:text-red-400 disabled:opacity-30" onClick={() => data.onDelete?.()} title="删除遮罩层"><Trash2 size={15}/></button>
      </div>
      <button disabled={working} onClick={() => setOpen(true)} className="group relative block h-44 w-full overflow-hidden bg-black disabled:cursor-wait">
        <img src={data.imageUrl} crossOrigin="anonymous" alt="遮罩编辑源图" className="h-full w-full object-contain opacity-70 transition group-hover:opacity-90"/>
        <span className="absolute inset-0 flex items-center justify-center"><span className="flex items-center gap-2 rounded-xl border border-cyan-400/40 bg-black/75 px-4 py-2 text-xs font-bold text-cyan-200">{working ? <><Loader2 size={14} className="animate-spin"/>后台处理中…</> : <><Maximize2 size={14}/>{error ? '重新打开修改' : '打开遮罩编辑'}</>}</span></span>
      </button>
      <div className={`px-4 py-3 text-[11px] leading-relaxed ${error ? 'text-red-400' : working ? 'text-cyan-300' : 'text-gray-400'}`}>{error ? <span className="flex items-start gap-2"><RotateCcw size={13} className="mt-0.5 shrink-0"/>{error}</span> : working ? '任务已在后台运行，你可以继续操作画布；完成后会自动生成结果节点。' : '最多 5 个编号区域合并为一次提交、一次计费；开始后编辑器会自动缩小。'}</div>
      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-0 !bg-cyan-400" />
    </div>
    {open && createPortal(<ImageTextEditor imageUrl={data.imageUrl} title="遮罩定点修改" onClose={() => setOpen(false)} onConfirm={(imageUrl) => { data.onApply?.(imageUrl); setOpen(false); }} onBackgroundTask={runInBackground} initialDraft={draft} onDraftChange={preserveDraft}/>, document.body)}
  </>;
};
