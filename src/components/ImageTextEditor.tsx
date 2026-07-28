import React, { useRef, useState } from 'react';
import { Check, Redo2, Sparkles, Undo2, X } from 'lucide-react';
import { generateImage, type AspectRatio, type ImageModel } from '../lib/gemini';

type Box = { x: number; y: number; width: number; height: number };

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
  const [region, setRegion] = useState<Box | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [newText, setNewText] = useState('');
  const [model, setModel] = useState<ImageModel>(() => {
    const saved = localStorage.getItem('image_text_ai_model') as ImageModel | null;
    return AI_TEXT_MODELS.some(item => item.id === saved) ? saved! : 'gpt-image-2';
  });
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('先框选图片中需要替换的文字区域');
  const [historyIndex, setHistoryIndex] = useState(0);
  const historyRef = useRef<string[]>([imageUrl]);
  const stageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const modelOption = AI_TEXT_MODELS.find(item => item.id === model) || AI_TEXT_MODELS[0];

  const updateRegion = (clientX: number, clientY: number) => {
    const stage = stageRef.current?.getBoundingClientRect();
    const start = startRef.current;
    if (!stage || !start) return;
    const x = Math.max(0, Math.min(1, (clientX - stage.left) / stage.width));
    const y = Math.max(0, Math.min(1, (clientY - stage.top) / stage.height));
    setRegion({ x: Math.min(start.x, x), y: Math.min(start.y, y), width: Math.abs(x - start.x), height: Math.abs(y - start.y) });
  };

  const beginRegion = (event: React.PointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current?.getBoundingClientRect();
    if (!stage) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const x = Math.max(0, Math.min(1, (event.clientX - stage.left) / stage.width));
    const y = Math.max(0, Math.min(1, (event.clientY - stage.top) / stage.height));
    startRef.current = { x, y };
    setRegion({ x, y, width: 0, height: 0 });
  };

  const pushHistory = (url: string) => {
    const next = [...historyRef.current.slice(0, historyIndex + 1), url].slice(-10);
    historyRef.current = next;
    setHistoryIndex(next.length - 1);
    setCurrentImage(url);
  };

  const undo = () => {
    if (historyIndex <= 0) return;
    const next = historyIndex - 1;
    setHistoryIndex(next); setCurrentImage(historyRef.current[next]);
  };

  const redo = () => {
    if (historyIndex >= historyRef.current.length - 1) return;
    const next = historyIndex + 1;
    setHistoryIndex(next); setCurrentImage(historyRef.current[next]);
  };

  const replaceText = async () => {
    const imageElement = imageRef.current;
    if (!imageElement || !region || region.width < 0.01 || region.height < 0.01) {
      setMessage('请先在图片内框选需要修改的文字区域'); return;
    }
    if (!newText.trim()) { setMessage('请输入替换后的新文字'); return; }
    setWorking(true); setMessage('AI 正在保留原字体和特效并替换文字…');
    try {
      const source = await loadImage(currentImage);
      const selected = {
        x: region.x * source.naturalWidth, y: region.y * source.naturalHeight,
        width: region.width * source.naturalWidth, height: region.height * source.naturalHeight,
      };
      const padded = {
        x: Math.max(0, selected.x - selected.width * 0.18),
        y: Math.max(0, selected.y - selected.height * 0.35),
        width: Math.min(source.naturalWidth, selected.width * 1.36),
        height: Math.min(source.naturalHeight, selected.height * 1.7),
      };
      padded.x = Math.min(padded.x, source.naturalWidth - padded.width);
      padded.y = Math.min(padded.y, source.naturalHeight - padded.height);
      const aspect = closestAspect(padded.width, padded.height, model);
      const centerX = padded.x + padded.width / 2; const centerY = padded.y + padded.height / 2;
      if (padded.width / padded.height < aspect.value) padded.width = Math.min(source.naturalWidth, padded.height * aspect.value);
      else padded.height = Math.min(source.naturalHeight, padded.width / aspect.value);
      padded.x = Math.max(0, Math.min(source.naturalWidth - padded.width, centerX - padded.width / 2));
      padded.y = Math.max(0, Math.min(source.naturalHeight - padded.height, centerY - padded.height / 2));

      const crop = document.createElement('canvas');
      crop.width = Math.max(1, Math.round(padded.width)); crop.height = Math.max(1, Math.round(padded.height));
      const cropContext = crop.getContext('2d');
      if (!cropContext) throw new Error('无法创建文字修改区域');
      cropContext.drawImage(source, padded.x, padded.y, padded.width, padded.height, 0, 0, crop.width, crop.height);

      const mask = document.createElement('canvas'); mask.width = crop.width; mask.height = crop.height;
      const maskContext = mask.getContext('2d');
      if (!maskContext) throw new Error('无法创建文字修改遮罩');
      maskContext.fillStyle = '#ffffff'; maskContext.fillRect(0, 0, mask.width, mask.height);
      const scaleX = mask.width / padded.width; const scaleY = mask.height / padded.height;
      const padX = Math.max(3, selected.width * 0.06); const padY = Math.max(3, selected.height * 0.16);
      maskContext.clearRect(
        (selected.x - padded.x - padX) * scaleX, (selected.y - padded.y - padY) * scaleY,
        (selected.width + padX * 2) * scaleX, (selected.height + padY * 2) * scaleY,
      );

      const exactText = newText.trim();
      const prompt = [
        `只修改遮罩区域内原有文字，将它替换为：${exactText}`,
        `最终画面必须逐字准确显示“${exactText}”，不得增字、漏字、错字或重复文字。`,
        '自动分析并保持原文字的字体风格、字重、字号、间距、颜色、材质、描边、阴影、立体感、光影和广告特效。',
        '保持原文字的位置、方向和排版关系；保持人物、商品、背景、图标和遮罩外所有内容完全不变。',
        '不要添加任何其他文字、标志、水印或装饰元素。',
      ].join('\n');
      const cropUrl = crop.toDataURL('image/png');
      const maskUrl = mask.toDataURL('image/png');
      const [editedUrl] = await generateImage({
        prompt, model, imageSize: '1K', aspectRatio: aspect.id, quality: 'low',
        images: [{ data: cropUrl.split(',')[1], mimeType: 'image/png' }],
        mask: model === 'gpt-image-2' ? { data: maskUrl.split(',')[1], mimeType: 'image/png' } : undefined,
      });
      const edited = await loadImage(editedUrl);
      const output = document.createElement('canvas'); output.width = source.naturalWidth; output.height = source.naturalHeight;
      const outputContext = output.getContext('2d');
      if (!outputContext) throw new Error('无法合成文字修改结果');
      outputContext.drawImage(source, 0, 0);
      outputContext.drawImage(edited, padded.x, padded.y, padded.width, padded.height);
      pushHistory(output.toDataURL('image/png'));
      localStorage.setItem('image_text_ai_model', model);
      const token = localStorage.getItem('auth_token');
      await fetch('/api/user/deduct-credit', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ amount: modelOption.price }),
      }).catch(() => undefined);
      setMessage('修改完成；可以保存，也可以撤销后重新框选');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'AI 修改文字失败');
    } finally { setWorking(false); }
  };

  return <div className="fixed inset-0 z-[10020] flex bg-black/90 backdrop-blur-sm">
    <div className="flex min-w-0 flex-1 flex-col p-4">
      <div className="mb-3 flex items-center justify-between text-white">
        <div><h3 className="text-base font-bold">AI 修改图片文字</h3><p className="text-xs text-gray-500">框选原文字，输入新文字，AI 自动保持原字体和广告特效。</p></div>
        <button onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-white/10"><X size={20}/></button>
      </div>
      <div className="mb-2 flex items-center gap-2 text-xs text-gray-400">
        <button onClick={undo} disabled={historyIndex <= 0 || working} className="rounded-lg bg-[#252525] p-2 disabled:opacity-30"><Undo2 size={14}/></button>
        <button onClick={redo} disabled={historyIndex >= historyRef.current.length - 1 || working} className="rounded-lg bg-[#252525] p-2 disabled:opacity-30"><Redo2 size={14}/></button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl border border-[#333] bg-[#0b0b0b] p-3">
        <div ref={stageRef} className="relative inline-flex max-h-full max-w-full select-none">
          <img ref={imageRef} src={currentImage} crossOrigin="anonymous" className="max-h-[78vh] max-w-full object-contain" alt="AI 文字编辑"/>
          {region && <div
            className="pointer-events-none absolute z-40 border border-cyan-300 bg-cyan-400/10"
            style={{ left: `${region.x * 100}%`, top: `${region.y * 100}%`, width: `${region.width * 100}%`, height: `${region.height * 100}%` }}
          />}
          {selecting && <div
            className="absolute inset-0 z-50 cursor-crosshair"
            onPointerDown={beginRegion}
            onPointerMove={event => updateRegion(event.clientX, event.clientY)}
            onPointerUp={() => { startRef.current = null; setSelecting(false); setMessage('选区已确定，请输入替换后的新文字'); }}
          />}
        </div>
      </div>
    </div>
    <aside className="w-[340px] shrink-0 overflow-y-auto border-l border-[#333] bg-[#171717] p-4 text-white">
      <div className="space-y-4 rounded-xl border border-[#303030] bg-[#111] p-4">
        <div><div className="text-sm font-bold">1. 框选原文字</div><button onClick={() => { setSelecting(true); setMessage('请在图片内拖动框选需要替换的文字'); }} disabled={working} className={`mt-2 w-full rounded-lg border px-3 py-2 text-xs font-bold ${selecting ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200' : 'border-[#444] bg-[#222]'}`}>{region ? '重新框选区域' : '开始框选区域'}</button></div>
        <label className="block text-sm font-bold">2. 输入新文字<textarea value={newText} onChange={event => setNewText(event.target.value)} rows={3} placeholder="输入最终要显示的准确文字" className="mt-2 w-full resize-none rounded-lg border border-[#444] bg-[#202020] p-3 text-sm text-white outline-none focus:border-violet-500"/></label>
        <label className="block text-sm font-bold">3. 选择 AI 模型<select value={model} onChange={event => setModel(event.target.value as ImageModel)} disabled={working} className="mt-2 w-full rounded-lg border border-[#444] bg-[#202020] px-3 py-2 text-xs text-white outline-none">{AI_TEXT_MODELS.map(item => <option key={item.id} value={item.id}>{item.label} · 预计 ¥{item.price.toFixed(2)}</option>)}</select></label>
        <button onClick={() => void replaceText()} disabled={working || !region || !newText.trim()} className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-3 py-3 text-sm font-bold disabled:opacity-40"><Sparkles size={16}/>{working ? 'AI 正在修改…' : `开始修改 · 约 ¥${modelOption.price.toFixed(2)}`}</button>
        <p className={`text-xs leading-relaxed ${message.includes('失败') || message.includes('无法') ? 'text-red-400' : 'text-gray-400'}`}>{message}</p>
        <p className="text-[10px] leading-relaxed text-gray-600">每次只修改一个框选区域。生成成功后计费，失败不扣网站额度；AI 对复杂中文仍可能偶尔出现错字，可撤销后重试。</p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2"><button onClick={onClose} disabled={working} className="rounded-lg border border-[#444] px-3 py-2 text-xs font-bold">取消</button><button onClick={() => onConfirm(currentImage)} disabled={working || currentImage === imageUrl} className="flex items-center justify-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-xs font-bold disabled:opacity-40"><Check size={15}/>保存为新图</button></div>
    </aside>
  </div>;
};
