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

const DEFAULT_GPT_GLOBAL_INSTRUCTION = '只修改用户框选区域内的指定文案。整张图片的构图、尺寸、商品、人物、背景、光影、色彩、纹理、装饰、图标及所有未框选文字必须保持与原图完全一致；不得重绘、移动、缩放或美化框选区域以外的任何内容。新文案必须逐字准确，并尽量继承原位置的字体风格、字号、颜色、材质、描边、阴影和排版。';

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

const compositeFeatheredRegions = (
  outputContext: CanvasRenderingContext2D,
  source: HTMLImageElement,
  edited: HTMLImageElement,
  padded: Box,
  selectedRegions: Array<{ x: number; y: number; width: number; height: number }>,
) => {
  selectedRegions.forEach(selected => {
    const width = Math.max(1, Math.round(selected.width)); const height = Math.max(1, Math.round(selected.height));
    const originalCanvas = document.createElement('canvas'); originalCanvas.width = width; originalCanvas.height = height;
    const generatedCanvas = document.createElement('canvas'); generatedCanvas.width = width; generatedCanvas.height = height;
    const originalContext = originalCanvas.getContext('2d', { willReadFrequently: true });
    const generatedContext = generatedCanvas.getContext('2d', { willReadFrequently: true });
    if (!originalContext || !generatedContext) throw new Error('无法对齐 AI 改字结果');
    originalContext.drawImage(source, selected.x, selected.y, selected.width, selected.height, 0, 0, width, height);
    const sourceX = (selected.x - padded.x) / padded.width * edited.naturalWidth;
    const sourceY = (selected.y - padded.y) / padded.height * edited.naturalHeight;
    const sourceWidth = selected.width / padded.width * edited.naturalWidth;
    const sourceHeight = selected.height / padded.height * edited.naturalHeight;
    generatedContext.drawImage(edited, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);
    const original = originalContext.getImageData(0, 0, width, height);
    const generated = generatedContext.getImageData(0, 0, width, height);
    const band = Math.max(2, Math.min(10, Math.round(Math.min(width, height) * 0.08)));
    const differences: number[][] = [[], [], []];
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
      if (Math.min(x, width - 1 - x, y, height - 1 - y) >= band) continue;
      const offset = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) differences[channel].push(original.data[offset + channel] - generated.data[offset + channel]);
    }
    const corrections = differences.map(values => {
      values.sort((a, b) => a - b); const median = values[Math.floor(values.length / 2)] || 0;
      return Math.max(-48, Math.min(48, median));
    });
    const feather = Math.max(4, Math.min(18, Math.round(Math.min(width, height) * 0.12)));
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const distance = Math.min(x, width - 1 - x, y, height - 1 - y);
      const progress = Math.max(0, Math.min(1, distance / feather));
      const alpha = progress * progress * (3 - 2 * progress);
      for (let channel = 0; channel < 3; channel += 1) {
        const corrected = Math.max(0, Math.min(255, generated.data[offset + channel] + corrections[channel]));
        generated.data[offset + channel] = Math.round(original.data[offset + channel] * (1 - alpha) + corrected * alpha);
      }
      generated.data[offset + 3] = 255;
    }
    generatedContext.putImageData(generated, 0, 0);
    outputContext.drawImage(generatedCanvas, selected.x, selected.y, selected.width, selected.height);
  });
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
  const [gptGlobalInstruction, setGptGlobalInstruction] = useState(() => localStorage.getItem('gpt_text_edit_global_instruction') || DEFAULT_GPT_GLOBAL_INSTRUCTION);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('可连续框选多个区域，并分别输入需要生成的文字');
  const [historyIndex, setHistoryIndex] = useState(0);
  const historyRef = useRef<string[]>([imageUrl]);
  const stageRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const modelOption = AI_TEXT_MODELS.find(item => item.id === model) || AI_TEXT_MODELS[0];
  const readyRegions = regions.filter(item => item.text.trim());
  const estimatedTotal = readyRegions.length ? modelOption.price : 0;

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
      if (regions.length >= 5) setMessage('单次任务最多支持 5 个区域');
      else {
        setRegions(current => [...current, { id: `region-${Date.now()}`, box: draftBox, mode: selectingMode, text: '', style: '' }]);
        setMessage(`已添加区域 ${regions.length + 1}，可以继续框选或填写文字`);
      }
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

  const editRegions = async (sourceUrl: string, items: EditRegion[]) => {
    const source = await loadImage(sourceUrl);
    const selectedRegions = items.map(item => ({
      item,
      x: item.box.x * source.naturalWidth, y: item.box.y * source.naturalHeight,
      width: item.box.width * source.naturalWidth, height: item.box.height * source.naturalHeight,
    }));
    const left = Math.min(...selectedRegions.map(item => item.x));
    const top = Math.min(...selectedRegions.map(item => item.y));
    const right = Math.max(...selectedRegions.map(item => item.x + item.width));
    const bottom = Math.max(...selectedRegions.map(item => item.y + item.height));
    const unionWidth = right - left; const unionHeight = bottom - top;
    const padded = {
      x: Math.max(0, left - unionWidth * 0.1), y: Math.max(0, top - unionHeight * 0.14),
      width: Math.min(source.naturalWidth, unionWidth * 1.2), height: Math.min(source.naturalHeight, unionHeight * 1.28),
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
    selectedRegions.forEach(selected => {
      const padX = Math.max(3, selected.width * 0.06); const padY = Math.max(3, selected.height * 0.16);
      maskContext.clearRect((selected.x - padded.x - padX) * scaleX, (selected.y - padded.y - padY) * scaleY, (selected.width + padX * 2) * scaleX, (selected.height + padY * 2) * scaleY);
    });

    const regionRules = selectedRegions.map((selected, index) => {
      const exactText = selected.item.text.trim();
      const position = `区域${index + 1}位于输入图的左侧${Math.round((selected.x - padded.x) / padded.width * 100)}%、顶部${Math.round((selected.y - padded.y) / padded.height * 100)}%，宽${Math.round(selected.width / padded.width * 100)}%、高${Math.round(selected.height / padded.height * 100)}%`;
      const operation = selected.item.mode === 'replace'
        ? `替换其中原有文字为“${exactText}”，自然清除旧字后在相同位置生成新字`
        : `在该空白区域新增文字“${exactText}”，不要覆盖区域外内容`;
      const style = selected.item.style.trim()
        ? `样式要求：${selected.item.style.trim()}`
        : '样式要求：自动匹配整张海报及附近文字的字体、颜色、字号、间距、材质和广告特效';
      return `${position}；${operation}；${style}。必须逐字准确显示“${exactText}”。`;
    });
    const prompt = [
      ...(model === 'gpt-image-2' ? [`全局强制指令：${gptGlobalInstruction.trim() || DEFAULT_GPT_GLOBAL_INSTRUCTION}`] : []),
      `这是一次包含 ${items.length} 个独立区域的批量文字编辑任务。只允许修改遮罩中的这些区域。`,
      ...regionRules,
      '严格按照上述区域编号和坐标对应文字，不得交换、合并、增字、漏字、错字或重复文字。',
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
    outputContext.drawImage(source, 0, 0);
    if (model === 'gpt-image-2') {
      // GPT Image often repaints the masked background. Composite each user
      // region independently, color-match its perimeter, and feather inward.
      compositeFeatheredRegions(outputContext, source, edited, padded, selectedRegions);
    } else {
      // Gemini preserves local image coherence better. Keep its exact selected
      // areas, while still discarding every pixel outside the user's boxes.
      selectedRegions.forEach(selected => {
        const sourceX = (selected.x - padded.x) / padded.width * edited.naturalWidth;
        const sourceY = (selected.y - padded.y) / padded.height * edited.naturalHeight;
        const sourceWidth = selected.width / padded.width * edited.naturalWidth;
        const sourceHeight = selected.height / padded.height * edited.naturalHeight;
        outputContext.drawImage(edited, sourceX, sourceY, sourceWidth, sourceHeight, selected.x, selected.y, selected.width, selected.height);
      });
    }
    return output.toDataURL('image/png');
  };

  const runBatch = async () => {
    if (!readyRegions.length) { setMessage('请至少框选一个区域并填写文字'); return; }
    setWorking(true); localStorage.setItem('image_text_ai_model', model);
    if (model === 'gpt-image-2') localStorage.setItem('gpt_text_edit_global_instruction', gptGlobalInstruction.trim() || DEFAULT_GPT_GLOBAL_INSTRUCTION);
    try {
      setMessage(`正在一次性处理 ${readyRegions.length} 个区域…`);
      const result = await editRegions(currentImage, readyRegions); pushHistory(result);
      const token = localStorage.getItem('auth_token');
      await fetch('/api/user/deduct-credit', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ amount: modelOption.price }),
      }).catch(() => undefined);
      setMessage(`已通过一个任务完成 ${readyRegions.length} 个区域，只计费一次，可以保存为新图`);
    } catch (error) {
      setMessage(`批量修改失败：${error instanceof Error ? error.message : '未知错误'}；本次不扣网站额度`);
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
      <div className="grid grid-cols-2 gap-2"><button onClick={() => { setSelectingMode('replace'); setMessage('请框选需要替换的原文字'); }} disabled={working || regions.length >= 5} className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-bold disabled:opacity-40 ${selectingMode === 'replace' ? 'border-cyan-300 bg-cyan-500/20 text-cyan-200' : 'border-[#444] bg-[#222]'}`}><Type size={15}/>框选改字</button><button onClick={() => { setSelectingMode('add'); setMessage('请框选要新增文字的空白区域'); }} disabled={working || regions.length >= 5} className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-bold disabled:opacity-40 ${selectingMode === 'add' ? 'border-emerald-300 bg-emerald-500/20 text-emerald-200' : 'border-[#444] bg-[#222]'}`}><Plus size={15}/>框选新增</button></div>
      <div className="mt-3 max-h-[52vh] space-y-3 overflow-y-auto pr-1">
        {regions.map((item, index) => <div key={item.id} className={`rounded-xl border p-3 ${item.mode === 'add' ? 'border-emerald-800/70 bg-emerald-500/5' : 'border-cyan-800/70 bg-cyan-500/5'}`}>
          <div className="mb-2 flex items-center justify-between"><div className="flex items-center gap-2"><span className={`flex h-6 min-w-6 items-center justify-center rounded-full text-xs font-black text-black ${item.mode === 'add' ? 'bg-emerald-300' : 'bg-cyan-300'}`}>{index + 1}</span><select value={item.mode} onChange={event => updateItem(item.id, { mode: event.target.value as EditMode })} disabled={working} className="rounded border border-[#444] bg-[#202020] px-2 py-1 text-xs"><option value="replace">替换原文字</option><option value="add">空白处新增</option></select></div><button onClick={() => removeItem(item.id)} disabled={working} className="rounded p-1.5 text-red-400 hover:bg-red-500/10"><Trash2 size={15}/></button></div>
          <textarea value={item.text} onChange={event => updateItem(item.id, { text: event.target.value })} rows={2} placeholder={item.mode === 'add' ? '输入要新增的准确文字' : '输入替换后的准确文字'} className="w-full resize-none rounded-lg border border-[#444] bg-[#202020] p-2 text-sm outline-none focus:border-violet-500"/>
          <textarea value={item.style} onChange={event => updateItem(item.id, { style: event.target.value })} rows={2} placeholder="可选：描述字体、颜色、大小、排版或特效；留空则由 AI 自动匹配页面" className="mt-2 w-full resize-none rounded-lg border border-[#383838] bg-[#191919] p-2 text-xs text-gray-300 outline-none focus:border-violet-500"/>
        </div>)}
        {!regions.length && <div className="rounded-xl border border-dashed border-[#444] px-4 py-8 text-center text-xs text-gray-500">点击上方按钮，在图片内连续框选区域</div>}
      </div>
      <div className="mt-4 space-y-3 rounded-xl border border-[#303030] bg-[#111] p-3"><label className="block text-xs font-bold">AI 模型<select value={model} onChange={event => setModel(event.target.value as ImageModel)} disabled={working} className="mt-2 w-full rounded-lg border border-[#444] bg-[#202020] px-3 py-2 text-xs outline-none">{AI_TEXT_MODELS.map(item => <option key={item.id} value={item.id}>{item.label} · 整个任务约 ¥{item.price.toFixed(2)}</option>)}</select></label>{model === 'gpt-image-2' && <label className="block text-xs font-bold text-violet-200">GPT 全局改字指令<textarea value={gptGlobalInstruction} onChange={event => setGptGlobalInstruction(event.target.value)} disabled={working} rows={5} className="mt-2 w-full resize-y rounded-lg border border-violet-700/60 bg-[#191522] p-2 text-xs font-normal leading-relaxed text-gray-200 outline-none focus:border-violet-400"/><span className="mt-1 block text-[10px] font-normal text-gray-500">默认约束整张图片只变框选文案；可按本次任务自行编辑。</span></label>}<button onClick={() => void runBatch()} disabled={working || !readyRegions.length} className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-3 py-3 text-sm font-bold disabled:opacity-40"><Sparkles size={16}/>{working ? 'AI 一次性处理中…' : `一次修改 ${readyRegions.length} 个区域 · 约 ¥${estimatedTotal.toFixed(2)}`}</button><p className="text-xs leading-relaxed text-gray-400">{message}</p><p className="text-[10px] leading-relaxed text-gray-600">最多 5 个区域会合并为一个遮罩，只发送一个生图任务并计费一次；任务失败不扣网站额度。</p></div>
      <div className="mt-4 grid grid-cols-2 gap-2"><button onClick={onClose} disabled={working} className="rounded-lg border border-[#444] px-3 py-2 text-xs font-bold">取消</button><button onClick={() => onConfirm(currentImage)} disabled={working || currentImage === imageUrl} className="flex items-center justify-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-xs font-bold disabled:opacity-40"><Check size={15}/>保存为新图</button></div>
    </aside>
  </div>;
};
