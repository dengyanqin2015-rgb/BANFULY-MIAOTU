import React, { useRef, useState } from 'react';
import { Check, Plus, Redo2, Sparkles, Trash2, Type, Undo2, X } from 'lucide-react';
import { generateImage, type AspectRatio, type ImageModel } from '../lib/gemini';

type Box = { x: number; y: number; width: number; height: number };
type EditMode = 'replace' | 'add';
type EditRegion = { id: string; box: Box; mode: EditMode; text: string; style: string };

interface ImageTextEditorProps {
  imageUrl: string;
  onClose: () => void;
  onConfirm: (imageUrl: string) => void;
}

const AI_TEXT_MODELS: { id: ImageModel; label: string; price: number }[] = [
  { id: 'gpt-image-2', label: 'GPT Image 2（快速）', price: 0.04 },
  { id: 'gemini-2.5-flash-image', label: 'Google Flash 2.5', price: 0.30 },
  { id: 'gemini-3.1-flash-image-preview', label: 'Google Flash 3.1', price: 0.50 },
  { id: 'gemini-3-pro-image-preview', label: 'Google Pro 3.0', price: 1.00 },
];

const loadImage = (url: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('图片加载失败'));
  image.src = url;
});

const closestAspect = (width: number, height: number, model: ImageModel) => {
  const ratios: { id: AspectRatio; value: number }[] = [
    { id: '1:1', value: 1 }, { id: '4:3', value: 4 / 3 }, { id: '3:4', value: 3 / 4 },
    { id: '16:9', value: 16 / 9 }, { id: '9:16', value: 9 / 16 },
    model === 'gpt-image-2' ? { id: '5:2', value: 2.5 } : { id: '21:9', value: 21 / 9 },
  ];
  const target = width / Math.max(1, height);
  return ratios.reduce((best, item) => Math.abs(Math.log(target / item.value)) < Math.abs(Math.log(target / best.value)) ? item : best, ratios[0]);
};

export const ImageTextEditor: React.FC<ImageTextEditorProps> = ({ imageUrl, onClose, onConfirm }) => {
  const [currentImage, setCurrentImage] = useState(imageUrl);
  const [regions, setRegions] = useState<EditRegion[]>([]);
  const [draftBox, setDraftBox] = useState<Box | null>(null);
  const [selectingMode, setSelectingMode] = useState<EditMode | null>(null);
  const [model, setModel] = useState<ImageModel>(() => {
    const saved = localStorage.getItem('image_text_ai_model') as ImageModel | null;
    return AI_TEXT_MODELS.some(item => item.id === saved) ? saved! : 'gpt-image-2';
  });
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('可连续框选多个区域，并分别输入需要生成的文字');
  const [historyIndex, setHistoryIndex] = useState(0);
  const historyRef = useRef<string[]>([imageUrl]);
  const stageRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const modelOption = AI_TEXT_MODELS.find(item => item.id === model) || AI_TEXT_MODELS[0];
  const readyRegions = regions.filter(item => item.text.trim());
  const estimatedTotal = readyRegions.length * modelOption.price;

  const updateDraft = (clientX: number, clientY: number) => {
    const stage = stageRef.current?.getBoundingClientRect(); const start = startRef.current;
    if (!stage || !start) return;
    const x = Math.max(0, Math.min(1, (clientX - stage.left) / stage.width));
    const y = Math.max(0, Math.min(1, (clientY - stage.top) / stage.height));
    setDraftBox({ x: Math.min(start.x, x), y: Math.min(start.y, y), width: Math.abs(x - start.x), height: Math.abs(y - start.y) });
  };

  const beginRegion = (event: React.PointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current?.getBoundingClientRect();
    if (!stage) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    const x = Math.max(0, Math.min(1, (event.clientX - stage.left) / stage.width));
    const y = Math.max(0, Math.min(1, (event.clientY - stage.top) / stage.height));
    startRef.current = { x, y }; setDraftBox({ x, y, width: 0, height: 0 });
  };

  const finishRegion = () => {
    startRef.current = null;
    if (draftBox && draftBox.width >= 0.01 && draftBox.height >= 0.01 && selectingMode) {
      setRegions(current => [...current, { id: `region-${Date.now()}`, box: draftBox, mode: selectingMode, text: '', style: '' }]);
      setMessage(`已添加区域 ${regions.length + 1}，可以继续框选或填写文字`);
    }
    setDraftBox(null); setSelectingMode(null);
  };

  const updateItem = (id: string, patch: Partial<EditRegion>) => setRegions(current => current.map(item => item.id === id ? { ...item, ...patch } : item));
  const removeItem = (id: string) => setRegions(current => current.filter(item => item.id !== id));

  const pushHistory = (url: string) => {
    const next = [...historyRef.current.slice(0, historyIndex + 1), url].slice(-10);
    historyRef.current = next; setHistoryIndex(next.length - 1); setCurrentImage(url);
  };
  const undo = () => { if (historyIndex > 0) { const next = historyIndex - 1; setHistoryIndex(next); setCurrentImage(historyRef.current[next]); } };
  const redo = () => { if (historyIndex < historyRef.current.length - 1) { const next = historyIndex + 1; setHistoryIndex(next); setCurrentImage(historyRef.current[next]); } };

  const editOneRegion = async (sourceUrl: string, item: EditRegion) => {
    const source = await loadImage(sourceUrl);
    const selected = {
      x: item.box.x * source.naturalWidth, y: item.box.y * source.naturalHeight,
      width: item.box.width * source.naturalWidth, height: item.box.height * source.naturalHeight,
    };
    const padded = {
      x: Math.max(0, selected.x - selected.width * 0.18), y: Math.max(0, selected.y - selected.height * 0.35),
      width: Math.min(source.naturalWidth, selected.width * 1.36), height: Math.min(source.naturalHeight, selected.height * 1.7),
    };
    padded.x = Math.min(padded.x, source.naturalWidth - padded.width); padded.y = Math.min(padded.y, source.naturalHeight - padded.height);
    const aspect = closestAspect(padded.width, padded.height, model);
    const centerX = padded.x + padded.width / 2; const centerY = padded.y + padded.height / 2;
    if (padded.width / padded.height < aspect.value) padded.width = Math.min(source.naturalWidth, padded.height * aspect.value);
    else padded.height = Math.min(source.naturalHeight, padded.width / aspect.value);
    padded.x = Math.max(0, Math.min(source.naturalWidth - padded.width, centerX - padded.width / 2));
    padded.y = Math.max(0, Math.min(source.naturalHeight - padded.height, centerY - padded.height / 2));

    const crop = document.createElement('canvas'); crop.width = Math.max(1, Math.round(padded.width)); crop.height = Math.max(1, Math.round(padded.height));
    const cropContext = crop.getContext('2d'); if (!cropContext) throw new Error('无法创建文字修改区域');
    cropContext.drawImage(source, padded.x, padded.y, padded.width, padded.height, 0, 0, crop.width, crop.height);
    const mask = document.createElement('canvas'); mask.width = crop.width; mask.height = crop.height;
    const maskContext = mask.getContext('2d'); if (!maskContext) throw new Error('无法创建文字修改遮罩');
    maskContext.fillStyle = '#ffffff'; maskContext.fillRect(0, 0, mask.width, mask.height);
    const scaleX = mask.width / padded.width; const scaleY = mask.height / padded.height;
    const padX = Math.max(3, selected.width * 0.06); const padY = Math.max(3, selected.height * 0.16);
    maskContext.clearRect((selected.x - padded.x - padX) * scaleX, (selected.y - padded.y - padY) * scaleY, (selected.width + padX * 2) * scaleX, (selected.height + padY * 2) * scaleY);

    const exactText = item.text.trim();
    const operation = item.mode === 'replace'
      ? `只修改遮罩区域，将其中原有文字替换为“${exactText}”。先自然清除旧文字，再在相同位置生成新文字。`
      : `只在遮罩标出的空白区域新增文字“${exactText}”，不要删除或覆盖区域外原有内容。`;
    const styleRule = item.style.trim()
      ? `严格遵循以下样式要求：${item.style.trim()}`
      : '未指定样式时，请自动分析整张海报和附近文字，合理匹配字体风格、字号、字重、颜色、间距、对齐、材质、描边、阴影和广告特效。';
    const prompt = [
      operation,
      `最终画面必须逐字准确显示“${exactText}”，不得增字、漏字、错字或重复文字。`,
      styleRule,
      '保持人物、商品、背景、图标以及遮罩外所有内容完全不变。不要新增其他文字、标志或水印。',
    ].join('\n');
    const cropUrl = crop.toDataURL('image/png'); const maskUrl = mask.toDataURL('image/png');
    const [editedUrl] = await generateImage({
      prompt, model, imageSize: '1K', aspectRatio: aspect.id, quality: 'low',
      images: [{ data: cropUrl.split(',')[1], mimeType: 'image/png' }],
      mask: model === 'gpt-image-2' ? { data: maskUrl.split(',')[1], mimeType: 'image/png' } : undefined,
    });
    const edited = await loadImage(editedUrl);
    const output = document.createElement('canvas'); output.width = source.naturalWidth; output.height = source.naturalHeight;
    const outputContext = output.getContext('2d'); if (!outputContext) throw new Error('无法合成文字修改结果');
    outputContext.drawImage(source, 0, 0); outputContext.drawImage(edited, padded.x, padded.y, padded.width, padded.height);
    return output.toDataURL('image/png');
  };

  const runBatch = async () => {
    if (!readyRegions.length) { setMessage('请至少框选一个区域并填写文字'); return; }
    setWorking(true); localStorage.setItem('image_text_ai_model', model);
    let result = currentImage; let completed = 0;
    try {
      for (let index = 0; index < readyRegions.length; index += 1) {
        setMessage(`正在处理区域 ${regions.indexOf(readyRegions[index]) + 1}（${index + 1}/${readyRegions.length}）…`);
        result = await editOneRegion(result, readyRegions[index]); completed += 1; pushHistory(result);
        const token = localStorage.getItem('auth_token');
        await fetch('/api/user/deduct-credit', {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ amount: modelOption.price }),
        }).catch(() => undefined);
      }
      setMessage(`已完成 ${completed} 个区域，可以保存为新图`);
    } catch (error) {
      setMessage(`已完成 ${completed} 个区域；区域 ${completed + 1} 失败：${error instanceof Error ? error.message : '未知错误'}`);
    } finally { setWorking(false); }
  };

  return <div className="fixed inset-0 z-[10020] flex bg-black/90 backdrop-blur-sm">
    <div className="flex min-w-0 flex-1 flex-col p-4">
      <div className="mb-3 flex items-center justify-between text-white"><div><h3 className="text-base font-bold">AI 批量修改图片文字</h3><p className="text-xs text-gray-500">支持多区域改字，也可以在空白区域新增文字。</p></div><button onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-white/10"><X size={20}/></button></div>
      <div className="mb-2 flex items-center gap-2 text-xs text-gray-400"><button onClick={undo} disabled={historyIndex <= 0 || working} className="rounded-lg bg-[#252525] p-2 disabled:opacity-30"><Undo2 size={14}/></button><button onClick={redo} disabled={historyIndex >= historyRef.current.length - 1 || working} className="rounded-lg bg-[#252525] p-2 disabled:opacity-30"><Redo2 size={14}/></button></div>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl border border-[#333] bg-[#0b0b0b] p-3">
        <div ref={stageRef} className="relative inline-flex max-h-full max-w-full select-none">
          <img src={currentImage} crossOrigin="anonymous" className="max-h-[78vh] max-w-full object-contain" alt="AI 文字编辑"/>
          {regions.map((item, index) => <div key={item.id} className={`pointer-events-none absolute z-40 border-2 ${item.mode === 'add' ? 'border-emerald-300 bg-emerald-400/10' : 'border-cyan-300 bg-cyan-400/10'}`} style={{ left: `${item.box.x * 100}%`, top: `${item.box.y * 100}%`, width: `${item.box.width * 100}%`, height: `${item.box.height * 100}%` }}><span className={`absolute -left-2 -top-3 flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-black text-black ${item.mode === 'add' ? 'bg-emerald-300' : 'bg-cyan-300'}`}>{index + 1}</span></div>)}
          {draftBox && <div
            className={`pointer-events-none absolute z-50 border-2 border-dashed ${selectingMode === 'add' ? 'border-emerald-300 bg-emerald-400/10' : 'border-cyan-300 bg-cyan-400/10'}`}
            style={{ left: `${draftBox.x * 100}%`, top: `${draftBox.y * 100}%`, width: `${draftBox.width * 100}%`, height: `${draftBox.height * 100}%` }}
          />}
          {selectingMode && <div
            className="absolute inset-0 z-[60] cursor-crosshair"
            onPointerDown={beginRegion}
            onPointerMove={event => updateDraft(event.clientX, event.clientY)}
            onPointerUp={finishRegion}
          />}
        </div>
      </div>
    </div>
    <aside className="w-[380px] shrink-0 overflow-y-auto border-l border-[#333] bg-[#171717] p-4 text-white">
      <div className="grid grid-cols-2 gap-2"><button onClick={() => { setSelectingMode('replace'); setMessage('请框选需要替换的原文字'); }} disabled={working} className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-bold ${selectingMode === 'replace' ? 'border-cyan-300 bg-cyan-500/20 text-cyan-200' : 'border-[#444] bg-[#222]'}`}><Type size={15}/>框选改字</button><button onClick={() => { setSelectingMode('add'); setMessage('请框选要新增文字的空白区域'); }} disabled={working} className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-bold ${selectingMode === 'add' ? 'border-emerald-300 bg-emerald-500/20 text-emerald-200' : 'border-[#444] bg-[#222]'}`}><Plus size={15}/>框选新增</button></div>
      <div className="mt-3 max-h-[52vh] space-y-3 overflow-y-auto pr-1">
        {regions.map((item, index) => <div key={item.id} className={`rounded-xl border p-3 ${item.mode === 'add' ? 'border-emerald-800/70 bg-emerald-500/5' : 'border-cyan-800/70 bg-cyan-500/5'}`}>
          <div className="mb-2 flex items-center justify-between"><div className="flex items-center gap-2"><span className={`flex h-6 min-w-6 items-center justify-center rounded-full text-xs font-black text-black ${item.mode === 'add' ? 'bg-emerald-300' : 'bg-cyan-300'}`}>{index + 1}</span><select value={item.mode} onChange={event => updateItem(item.id, { mode: event.target.value as EditMode })} disabled={working} className="rounded border border-[#444] bg-[#202020] px-2 py-1 text-xs"><option value="replace">替换原文字</option><option value="add">空白处新增</option></select></div><button onClick={() => removeItem(item.id)} disabled={working} className="rounded p-1.5 text-red-400 hover:bg-red-500/10"><Trash2 size={15}/></button></div>
          <textarea value={item.text} onChange={event => updateItem(item.id, { text: event.target.value })} rows={2} placeholder={item.mode === 'add' ? '输入要新增的准确文字' : '输入替换后的准确文字'} className="w-full resize-none rounded-lg border border-[#444] bg-[#202020] p-2 text-sm outline-none focus:border-violet-500"/>
          <textarea value={item.style} onChange={event => updateItem(item.id, { style: event.target.value })} rows={2} placeholder="可选：描述字体、颜色、大小、排版或特效；留空则由 AI 自动匹配页面" className="mt-2 w-full resize-none rounded-lg border border-[#383838] bg-[#191919] p-2 text-xs text-gray-300 outline-none focus:border-violet-500"/>
        </div>)}
        {!regions.length && <div className="rounded-xl border border-dashed border-[#444] px-4 py-8 text-center text-xs text-gray-500">点击上方按钮，在图片内连续框选区域</div>}
      </div>
      <div className="mt-4 space-y-3 rounded-xl border border-[#303030] bg-[#111] p-3"><label className="block text-xs font-bold">AI 模型<select value={model} onChange={event => setModel(event.target.value as ImageModel)} disabled={working} className="mt-2 w-full rounded-lg border border-[#444] bg-[#202020] px-3 py-2 text-xs outline-none">{AI_TEXT_MODELS.map(item => <option key={item.id} value={item.id}>{item.label} · 单区域约 ¥{item.price.toFixed(2)}</option>)}</select></label><button onClick={() => void runBatch()} disabled={working || !readyRegions.length} className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-3 py-3 text-sm font-bold disabled:opacity-40"><Sparkles size={16}/>{working ? 'AI 批量处理中…' : `批量修改 ${readyRegions.length} 个区域 · 约 ¥${estimatedTotal.toFixed(2)}`}</button><p className="text-xs leading-relaxed text-gray-400">{message}</p><p className="text-[10px] leading-relaxed text-gray-600">系统按编号依次处理，避免文字对应错位。仅成功区域计费；失败时保留已完成结果。</p></div>
      <div className="mt-4 grid grid-cols-2 gap-2"><button onClick={onClose} disabled={working} className="rounded-lg border border-[#444] px-3 py-2 text-xs font-bold">取消</button><button onClick={() => onConfirm(currentImage)} disabled={working || currentImage === imageUrl} className="flex items-center justify-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-xs font-bold disabled:opacity-40"><Check size={15}/>保存为新图</button></div>
    </aside>
  </div>;
};
