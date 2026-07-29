import React, { useEffect, useRef, useState } from 'react';
import { Check, Minimize2, Paintbrush, Redo2, Sparkles, Square, Trash2, Type, Undo2 } from 'lucide-react';
import { generateImage, type AspectRatio, type ImageModel } from '../lib/gemini';

type Box = { x: number; y: number; width: number; height: number };
export type EditMode = 'text' | 'content';
export type MaskTool = 'rect' | 'brush';
export type Point = { x: number; y: number };
export type EditRegion = { id: string; box: Box; mode: EditMode; text: string; style: string; tool: MaskTool; points?: Point[]; brushSize?: number };
export interface MaskEditorDraft { regions: EditRegion[]; maskTool: MaskTool; brushSize: number; model: ImageModel; gptGlobalInstruction: string }

interface ImageTextEditorProps {
  imageUrl: string;
  onClose: () => void;
  onConfirm: (imageUrl: string) => void;
  onBackgroundTask?: (task: Promise<string>) => void;
  backgroundActive?: boolean;
  initialDraft?: MaskEditorDraft;
  onDraftChange?: (draft: MaskEditorDraft) => void;
  title?: string;
}

const AI_TEXT_MODELS: { id: ImageModel; label: string; price: number }[] = [
  { id: 'gpt-image-2', label: 'GPT Image 2（快速）', price: 0.04 },
  { id: 'gemini-2.5-flash-image', label: 'Google Flash 2.5', price: 0.30 },
  { id: 'gemini-3.1-flash-image-preview', label: 'Google Flash 3.1', price: 0.50 },
  { id: 'gemini-3-pro-image-preview', label: 'Google Pro 3.0', price: 1.00 },
];

const DEFAULT_GPT_GLOBAL_INSTRUCTION = '只修改用户遮罩标记区域内的指定文字或画面内容。整张图片的构图、尺寸、商品、人物、背景、光影、色彩、纹理、装饰、图标及所有未遮罩内容必须保持与原图完全一致；不得重绘、移动、缩放或美化遮罩区域以外的任何内容。文字任务必须逐字准确并继承原位置的字体风格、字号、颜色、材质、描边、阴影和排版；内容任务只执行对应编号中明确描述的变化。';

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

const compositeMaskedResult = (
  outputContext: CanvasRenderingContext2D,
  source: HTMLImageElement,
  edited: HTMLImageElement,
  padded: Box,
  preserveMask: HTMLCanvasElement,
) => {
  const width = preserveMask.width; const height = preserveMask.height;
  const originalCanvas = document.createElement('canvas'); originalCanvas.width = width; originalCanvas.height = height;
  const generatedCanvas = document.createElement('canvas'); generatedCanvas.width = width; generatedCanvas.height = height;
  const originalContext = originalCanvas.getContext('2d', { willReadFrequently: true });
  const generatedContext = generatedCanvas.getContext('2d', { willReadFrequently: true });
  const maskContext = preserveMask.getContext('2d', { willReadFrequently: true });
  if (!originalContext || !generatedContext || !maskContext) throw new Error('无法合成 AI 遮罩结果');
  originalContext.drawImage(source, padded.x, padded.y, padded.width, padded.height, 0, 0, width, height);
  generatedContext.drawImage(edited, 0, 0, width, height);
  const original = originalContext.getImageData(0, 0, width, height);
  const generated = generatedContext.getImageData(0, 0, width, height);
  const maskPixels = maskContext.getImageData(0, 0, width, height);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const offset = pixel * 4; const editAlpha = 1 - maskPixels.data[offset + 3] / 255;
    for (let channel = 0; channel < 3; channel += 1) generated.data[offset + channel] = Math.round(original.data[offset + channel] * (1 - editAlpha) + generated.data[offset + channel] * editAlpha);
    generated.data[offset + 3] = 255;
  }
  generatedContext.putImageData(generated, 0, 0);
  outputContext.drawImage(generatedCanvas, padded.x, padded.y, padded.width, padded.height);
};

export const ImageTextEditor: React.FC<ImageTextEditorProps> = ({ imageUrl, onClose, onConfirm, onBackgroundTask, backgroundActive = false, initialDraft, onDraftChange, title = 'AI 遮罩定点修改' }) => {
  const [currentImage, setCurrentImage] = useState(imageUrl);
  const [regions, setRegions] = useState<EditRegion[]>(initialDraft?.regions || []);
  const [draftBox, setDraftBox] = useState<Box | null>(null);
  const [selectingMode, setSelectingMode] = useState<EditMode | null>(null);
  const [maskTool, setMaskTool] = useState<MaskTool>(initialDraft?.maskTool || 'rect');
  const [brushSize, setBrushSize] = useState(initialDraft?.brushSize || 0.035);
  const [draftPoints, setDraftPoints] = useState<Point[]>([]);
  const [model, setModel] = useState<ImageModel>(() => {
    if (initialDraft?.model) return initialDraft.model;
    const saved = localStorage.getItem('image_text_ai_model') as ImageModel | null;
    return AI_TEXT_MODELS.some(item => item.id === saved) ? saved! : 'gpt-image-2';
  });
  const [gptGlobalInstruction, setGptGlobalInstruction] = useState(() => initialDraft?.gptGlobalInstruction || localStorage.getItem('gpt_text_edit_global_instruction') || DEFAULT_GPT_GLOBAL_INSTRUCTION);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('可连续框选多个区域，并分别输入需要生成的文字');
  const [historyIndex, setHistoryIndex] = useState(0);
  const historyRef = useRef<string[]>([imageUrl]);
  const stageRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const modelOption = AI_TEXT_MODELS.find(item => item.id === model) || AI_TEXT_MODELS[0];
  const readyRegions = regions.filter(item => item.text.trim());
  const estimatedTotal = readyRegions.length ? modelOption.price : 0;

  useEffect(() => {
    onDraftChange?.({ regions, maskTool, brushSize, model, gptGlobalInstruction });
  }, [brushSize, gptGlobalInstruction, maskTool, model, onDraftChange, regions]);

  useEffect(() => {
    setWorking(backgroundActive);
    if (backgroundActive) setMessage('任务正在后台处理中，可以收起后继续操作画布，也可以随时重新打开查看。');
  }, [backgroundActive]);

  const updateDraft = (clientX: number, clientY: number) => {
    const stage = stageRef.current?.getBoundingClientRect(); const start = startRef.current;
    if (!stage || !start) return;
    const x = Math.max(0, Math.min(1, (clientX - stage.left) / stage.width));
    const y = Math.max(0, Math.min(1, (clientY - stage.top) / stage.height));
    if (maskTool === 'brush') {
      setDraftPoints(current => {
        const points = [...current, { x, y }];
        const xs = points.map(point => point.x); const ys = points.map(point => point.y); const radius = brushSize / 2;
        setDraftBox({ x: Math.max(0, Math.min(...xs) - radius), y: Math.max(0, Math.min(...ys) - radius), width: Math.min(1, Math.max(...xs) + radius) - Math.max(0, Math.min(...xs) - radius), height: Math.min(1, Math.max(...ys) + radius) - Math.max(0, Math.min(...ys) - radius) });
        return points;
      });
    } else setDraftBox({ x: Math.min(start.x, x), y: Math.min(start.y, y), width: Math.abs(x - start.x), height: Math.abs(y - start.y) });
  };

  const beginRegion = (event: React.PointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current?.getBoundingClientRect();
    if (!stage) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    const x = Math.max(0, Math.min(1, (event.clientX - stage.left) / stage.width));
    const y = Math.max(0, Math.min(1, (event.clientY - stage.top) / stage.height));
    startRef.current = { x, y };
    if (maskTool === 'brush') { setDraftPoints([{ x, y }]); setDraftBox({ x: Math.max(0, x - brushSize / 2), y: Math.max(0, y - brushSize / 2), width: brushSize, height: brushSize }); }
    else setDraftBox({ x, y, width: 0, height: 0 });
  };

  const finishRegion = () => {
    startRef.current = null;
    if (draftBox && draftBox.width >= 0.01 && draftBox.height >= 0.01 && selectingMode) {
      if (regions.length >= 5) setMessage('单次任务最多支持 5 个区域');
      else {
        setRegions(current => [...current, { id: `region-${Date.now()}`, box: draftBox, mode: selectingMode, text: '', style: '', tool: maskTool, points: maskTool === 'brush' ? draftPoints : undefined, brushSize: maskTool === 'brush' ? brushSize : undefined }]);
        setMessage(`已添加区域 ${regions.length + 1}，可以继续框选或填写文字`);
      }
    }
    setDraftBox(null); setDraftPoints([]); setSelectingMode(null);
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
    let padded: Box;
    if (model === 'gpt-image-2') {
      // GPT needs the complete composition to understand what must remain
      // untouched. A full-size image and mask also keep mask coordinates exact.
      padded = { x: 0, y: 0, width: source.naturalWidth, height: source.naturalHeight };
    } else {
      const left = Math.min(...selectedRegions.map(item => item.x));
      const top = Math.min(...selectedRegions.map(item => item.y));
      const right = Math.max(...selectedRegions.map(item => item.x + item.width));
      const bottom = Math.max(...selectedRegions.map(item => item.y + item.height));
      const unionWidth = right - left; const unionHeight = bottom - top;
      padded = {
        x: Math.max(0, left - unionWidth * 0.1), y: Math.max(0, top - unionHeight * 0.14),
        width: Math.min(source.naturalWidth, unionWidth * 1.2), height: Math.min(source.naturalHeight, unionHeight * 1.28),
      };
      padded.x = Math.min(padded.x, source.naturalWidth - padded.width); padded.y = Math.min(padded.y, source.naturalHeight - padded.height);
      const cropAspect = closestAspect(padded.width, padded.height, model);
      const centerX = padded.x + padded.width / 2; const centerY = padded.y + padded.height / 2;
      if (padded.width / padded.height < cropAspect.value) padded.width = Math.min(source.naturalWidth, padded.height * cropAspect.value);
      else padded.height = Math.min(source.naturalHeight, padded.width / cropAspect.value);
      padded.x = Math.max(0, Math.min(source.naturalWidth - padded.width, centerX - padded.width / 2));
      padded.y = Math.max(0, Math.min(source.naturalHeight - padded.height, centerY - padded.height / 2));
    }
    const aspect = closestAspect(padded.width, padded.height, model);

    const crop = document.createElement('canvas'); crop.width = Math.max(1, Math.round(padded.width)); crop.height = Math.max(1, Math.round(padded.height));
    const cropContext = crop.getContext('2d'); if (!cropContext) throw new Error('无法创建文字修改区域');
    cropContext.drawImage(source, padded.x, padded.y, padded.width, padded.height, 0, 0, crop.width, crop.height);
    const mask = document.createElement('canvas'); mask.width = crop.width; mask.height = crop.height;
    const maskContext = mask.getContext('2d'); if (!maskContext) throw new Error('无法创建文字修改遮罩');
    maskContext.fillStyle = '#ffffff'; maskContext.fillRect(0, 0, mask.width, mask.height);
    const scaleX = mask.width / padded.width; const scaleY = mask.height / padded.height;
    selectedRegions.forEach(selected => {
      if (selected.item.tool === 'brush' && selected.item.points?.length) {
        maskContext.save(); maskContext.globalCompositeOperation = 'destination-out'; maskContext.lineCap = 'round'; maskContext.lineJoin = 'round';
        maskContext.lineWidth = Math.max(4, (selected.item.brushSize || 0.035) * source.naturalWidth * scaleX);
        maskContext.beginPath();
        selected.item.points.forEach((point, index) => {
          const x = (point.x * source.naturalWidth - padded.x) * scaleX; const y = (point.y * source.naturalHeight - padded.y) * scaleY;
          if (index === 0) maskContext.moveTo(x, y); else maskContext.lineTo(x, y);
        });
        if (selected.item.points.length === 1) { const point = selected.item.points[0]; maskContext.arc((point.x * source.naturalWidth - padded.x) * scaleX, (point.y * source.naturalHeight - padded.y) * scaleY, maskContext.lineWidth / 2, 0, Math.PI * 2); maskContext.fill(); }
        else maskContext.stroke();
        maskContext.restore();
      } else {
        const padX = Math.max(3, selected.width * 0.04); const padY = Math.max(3, selected.height * 0.1);
        maskContext.clearRect((selected.x - padded.x - padX) * scaleX, (selected.y - padded.y - padY) * scaleY, (selected.width + padX * 2) * scaleX, (selected.height + padY * 2) * scaleY);
      }
    });

    const regionRules = selectedRegions.map((selected, index) => {
      const exactText = selected.item.text.trim();
      const position = `区域${index + 1}位于输入图的左侧${Math.round((selected.x - padded.x) / padded.width * 100)}%、顶部${Math.round((selected.y - padded.y) / padded.height * 100)}%，宽${Math.round(selected.width / padded.width * 100)}%、高${Math.round(selected.height / padded.height * 100)}%`;
      const operation = selected.item.mode === 'text'
        ? `仅修改该遮罩区域内的文字，目标文案为“${exactText}”；自然清除旧字并在原位置生成准确新字`
        : `仅修改该遮罩区域内的画面内容，修改要求为“${exactText}”；不得改变区域外任何内容`;
      const style = selected.item.style.trim()
        ? `样式要求：${selected.item.style.trim()}`
        : '样式要求：自动匹配整张海报及附近文字的字体、颜色、字号、间距、材质和广告特效';
      return `${position}；${operation}；${style}。必须逐字准确显示“${exactText}”。`;
    });
    const prompt = [
      ...(model === 'gpt-image-2' ? [`全局强制指令：${gptGlobalInstruction.trim() || DEFAULT_GPT_GLOBAL_INSTRUCTION}`] : []),
      `这是一次包含 ${items.length} 个独立区域的遮罩定点编辑任务。只允许修改遮罩中的这些区域。`,
      ...regionRules,
      '严格按照上述区域编号和坐标执行对应要求，不得交换、合并或遗漏区域；文字任务不得增字、漏字、错字或重复文字。',
      '保持人物、商品、背景、图标以及遮罩外所有内容完全不变。不要新增其他文字、标志或水印。',
    ].join('\n');
    const cropUrl = crop.toDataURL('image/png'); const maskUrl = mask.toDataURL('image/png');
    const [editedUrl] = await generateImage({
      prompt, model, imageSize: '1K', aspectRatio: aspect.id, quality: model === 'gpt-image-2' ? 'medium' : 'low',
      images: [{ data: cropUrl.split(',')[1], mimeType: 'image/png' }],
      mask: model === 'gpt-image-2' ? { data: maskUrl.split(',')[1], mimeType: 'image/png' } : undefined,
    });
    const edited = await loadImage(editedUrl);
    const output = document.createElement('canvas'); output.width = source.naturalWidth; output.height = source.naturalHeight;
    const outputContext = output.getContext('2d'); if (!outputContext) throw new Error('无法合成文字修改结果');
    outputContext.drawImage(source, 0, 0);
    // The provider mask is guidance, not a pixel guarantee. Enforce the same
    // mask locally for both GPT and Gemini so every unmasked pixel stays exact.
    compositeMaskedResult(outputContext, source, edited, padded, mask);
    return output.toDataURL('image/png');
  };

  const runBatch = async () => {
    if (!readyRegions.length) { setMessage('请至少框选一个区域并填写文字'); return; }
    localStorage.setItem('image_text_ai_model', model);
    if (model === 'gpt-image-2') localStorage.setItem('gpt_text_edit_global_instruction', gptGlobalInstruction.trim() || DEFAULT_GPT_GLOBAL_INSTRUCTION);
    const task = (async () => {
      const result = await editRegions(currentImage, readyRegions);
      const token = localStorage.getItem('auth_token');
      await fetch('/api/user/deduct-credit', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ amount: modelOption.price }),
      }).catch(() => undefined);
      return result;
    })();
    if (onBackgroundTask) {
      setWorking(true);
      setMessage(`已提交 ${readyRegions.length} 个区域，正在后台处理；可手动收起或留在此处查看。`);
      onBackgroundTask(task);
      void task.then(result => {
        pushHistory(result);
        setMessage(`后台任务已完成 ${readyRegions.length} 个区域，结果图已自动生成到画布右侧。`);
      }).catch(error => {
        setMessage(`后台修改失败：${error instanceof Error ? error.message : '未知错误'}；可以调整后重试。`);
      }).finally(() => setWorking(false));
      return;
    }
    setWorking(true);
    try {
      setMessage(`正在一次性处理 ${readyRegions.length} 个区域…`);
      const result = await task; pushHistory(result);
      setMessage(`已通过一个任务完成 ${readyRegions.length} 个区域，只计费一次，可以保存为新图`);
    } catch (error) {
      setMessage(`批量修改失败：${error instanceof Error ? error.message : '未知错误'}；本次不扣网站额度`);
    } finally { setWorking(false); }
  };

  return <div className="fixed inset-0 z-[10020] flex bg-black/90 backdrop-blur-sm">
    <div className="flex min-w-0 flex-1 flex-col p-4">
      <div className="mb-3 flex items-center justify-between text-white"><div><h3 className="text-base font-bold">{title}</h3><p className="text-xs text-gray-500">框选或涂抹多个区域，分别修改文字或画面内容。</p></div><button onClick={onClose} className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-gray-300 hover:bg-white/10" title="收起到遮罩节点"><Minimize2 size={17}/>收起</button></div>
      <div className="mb-2 flex items-center gap-2 text-xs text-gray-400"><button onClick={undo} disabled={historyIndex <= 0 || working} className="rounded-lg bg-[#252525] p-2 disabled:opacity-30"><Undo2 size={14}/></button><button onClick={redo} disabled={historyIndex >= historyRef.current.length - 1 || working} className="rounded-lg bg-[#252525] p-2 disabled:opacity-30"><Redo2 size={14}/></button></div>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl border border-[#333] bg-[#0b0b0b] p-3">
        <div ref={stageRef} className="relative inline-flex max-h-full max-w-full select-none">
          <img src={currentImage} crossOrigin="anonymous" className="max-h-[78vh] max-w-full object-contain" alt="AI 文字编辑"/>
          <svg className="pointer-events-none absolute inset-0 z-40 h-full w-full" viewBox="0 0 1000 1000" preserveAspectRatio="none">{regions.map((item, index) => item.tool === 'brush' ? <g key={item.id}><polyline points={(item.points || []).map(point => `${point.x * 1000},${point.y * 1000}`).join(' ')} fill="none" stroke={item.mode === 'content' ? '#6ee7b7' : '#67e8f9'} strokeOpacity="0.42" strokeWidth={(item.brushSize || 0.035) * 1000} strokeLinecap="round" strokeLinejoin="round"/><text x={item.box.x * 1000} y={Math.max(22, item.box.y * 1000 - 8)} fill="#fff" fontSize="24" fontWeight="900">{index + 1}</text></g> : null)}{maskTool === 'brush' && draftPoints.length > 0 && <polyline points={draftPoints.map(point => `${point.x * 1000},${point.y * 1000}`).join(' ')} fill="none" stroke="#67e8f9" strokeOpacity="0.55" strokeWidth={brushSize * 1000} strokeLinecap="round" strokeLinejoin="round"/>}</svg>
          {regions.map((item, index) => item.tool === 'rect' && <div key={item.id} className={`pointer-events-none absolute z-40 border-2 ${item.mode === 'content' ? 'border-emerald-300 bg-emerald-400/10' : 'border-cyan-300 bg-cyan-400/10'}`} style={{ left: `${item.box.x * 100}%`, top: `${item.box.y * 100}%`, width: `${item.box.width * 100}%`, height: `${item.box.height * 100}%` }}><span className={`absolute -left-2 -top-3 flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-black text-black ${item.mode === 'content' ? 'bg-emerald-300' : 'bg-cyan-300'}`}>{index + 1}</span></div>)}
          {draftBox && maskTool === 'rect' && <div
            className={`pointer-events-none absolute z-50 border-2 border-dashed ${selectingMode === 'content' ? 'border-emerald-300 bg-emerald-400/10' : 'border-cyan-300 bg-cyan-400/10'}`}
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
      <div className="grid grid-cols-2 gap-2"><button onClick={() => { setMaskTool('rect'); setMessage('已选择框选工具'); }} disabled={working} className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold ${maskTool === 'rect' ? 'border-violet-400 bg-violet-500/20' : 'border-[#444] bg-[#222]'}`}><Square size={14}/>框选</button><button onClick={() => { setMaskTool('brush'); setMessage('已选择涂抹工具'); }} disabled={working} className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold ${maskTool === 'brush' ? 'border-violet-400 bg-violet-500/20' : 'border-[#444] bg-[#222]'}`}><Paintbrush size={14}/>涂抹</button></div>
      {maskTool === 'brush' && <label className="mt-2 flex items-center gap-3 text-[11px] text-gray-400">笔刷大小<input type="range" min="0.01" max="0.12" step="0.005" value={brushSize} onChange={event => setBrushSize(Number(event.target.value))} className="flex-1"/></label>}
      <div className="mt-2 grid grid-cols-2 gap-2"><button onClick={() => { setSelectingMode('text'); setMessage(`请用${maskTool === 'brush' ? '涂抹' : '框选'}标记要修改的文字区域`); }} disabled={working || regions.length >= 5} className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-bold disabled:opacity-40 ${selectingMode === 'text' ? 'border-cyan-300 bg-cyan-500/20 text-cyan-200' : 'border-[#444] bg-[#222]'}`}><Type size={15}/>修改文字</button><button onClick={() => { setSelectingMode('content'); setMessage(`请用${maskTool === 'brush' ? '涂抹' : '框选'}标记要修改的内容区域`); }} disabled={working || regions.length >= 5} className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-bold disabled:opacity-40 ${selectingMode === 'content' ? 'border-emerald-300 bg-emerald-500/20 text-emerald-200' : 'border-[#444] bg-[#222]'}`}><Sparkles size={15}/>修改内容</button></div>
      <div className="mt-3 max-h-[52vh] space-y-3 overflow-y-auto pr-1">
        {regions.map((item, index) => <div key={item.id} className={`rounded-xl border p-3 ${item.mode === 'content' ? 'border-emerald-800/70 bg-emerald-500/5' : 'border-cyan-800/70 bg-cyan-500/5'}`}>
          <div className="mb-2 flex items-center justify-between"><div className="flex items-center gap-2"><span className={`flex h-6 min-w-6 items-center justify-center rounded-full text-xs font-black text-black ${item.mode === 'content' ? 'bg-emerald-300' : 'bg-cyan-300'}`}>{index + 1}</span><select value={item.mode} onChange={event => updateItem(item.id, { mode: event.target.value as EditMode })} disabled={working} className="rounded border border-[#444] bg-[#202020] px-2 py-1 text-xs"><option value="text">修改文字</option><option value="content">修改内容</option></select><span className="text-[10px] text-gray-500">{item.tool === 'brush' ? '涂抹' : '框选'}</span></div><button onClick={() => removeItem(item.id)} disabled={working} className="rounded p-1.5 text-red-400 hover:bg-red-500/10"><Trash2 size={15}/></button></div>
          <textarea value={item.text} onChange={event => updateItem(item.id, { text: event.target.value })} rows={2} placeholder={item.mode === 'text' ? '输入要显示的准确文字' : '描述该区域要修改成什么内容'} className="w-full resize-none rounded-lg border border-[#444] bg-[#202020] p-2 text-sm outline-none focus:border-violet-500"/>
          <textarea value={item.style} onChange={event => updateItem(item.id, { style: event.target.value })} rows={2} placeholder="可选：描述字体、颜色、大小、排版或特效；留空则由 AI 自动匹配页面" className="mt-2 w-full resize-none rounded-lg border border-[#383838] bg-[#191919] p-2 text-xs text-gray-300 outline-none focus:border-violet-500"/>
        </div>)}
        {!regions.length && <div className="rounded-xl border border-dashed border-[#444] px-4 py-8 text-center text-xs text-gray-500">点击上方按钮，在图片内连续框选区域</div>}
      </div>
      <div className="mt-4 space-y-3 rounded-xl border border-[#303030] bg-[#111] p-3"><label className="block text-xs font-bold">AI 模型<select value={model} onChange={event => setModel(event.target.value as ImageModel)} disabled={working} className="mt-2 w-full rounded-lg border border-[#444] bg-[#202020] px-3 py-2 text-xs outline-none">{AI_TEXT_MODELS.map(item => <option key={item.id} value={item.id}>{item.label} · 整个任务约 ¥{item.price.toFixed(2)}</option>)}</select></label>{model === 'gpt-image-2' && <label className="block text-xs font-bold text-violet-200">GPT 全局遮罩指令<textarea value={gptGlobalInstruction} onChange={event => setGptGlobalInstruction(event.target.value)} disabled={working} rows={5} className="mt-2 w-full resize-y rounded-lg border border-violet-700/60 bg-[#191522] p-2 text-xs font-normal leading-relaxed text-gray-200 outline-none focus:border-violet-400"/><span className="mt-1 block text-[10px] font-normal text-gray-500">默认只改变遮罩内容，遮罩外强制保留原图；可按本次任务编辑。</span></label>}<button onClick={() => void runBatch()} disabled={working || !readyRegions.length} className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-3 py-3 text-sm font-bold disabled:opacity-40"><Sparkles size={16}/>{working ? 'AI 一次性处理中…' : `一次修改 ${readyRegions.length} 个区域 · 约 ¥${estimatedTotal.toFixed(2)}`}</button><p className="text-xs leading-relaxed text-gray-400">{message}</p><p className="text-[10px] leading-relaxed text-gray-600">最多 5 个区域会合并为一个遮罩，只发送一个生图任务并计费一次；任务失败不扣网站额度。</p></div>
      <div className="mt-4 grid grid-cols-2 gap-2"><button onClick={onClose} className="rounded-lg border border-[#444] px-3 py-2 text-xs font-bold">手动收起</button><button onClick={() => onConfirm(currentImage)} disabled={working || currentImage === imageUrl} className="flex items-center justify-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-xs font-bold disabled:opacity-40"><Check size={15}/>保存为新图</button></div>
    </aside>
  </div>;
};
