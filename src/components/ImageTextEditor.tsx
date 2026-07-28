import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Eraser, Plus, Redo2, RefreshCw, ScanText, Sparkles, Trash2, Type, Undo2, X } from 'lucide-react';
import '../alibaba-puhuiti.css';
import { recognizeTextLines, type LocalOcrLine } from '../lib/localOcr';
import { generateImage, type AspectRatio, type ImageModel } from '../lib/gemini';

type Box = { x: number; y: number; width: number; height: number };
type TextLayer = {
  id: string;
  text: string;
  originalText: string;
  source: 'ocr' | 'manual';
  box?: Box;
  x: number;
  y: number;
  fontSize: number;
  fontFamily: string;
  color: string;
  strokeColor: string;
  strokeWidth: number;
  bold: boolean;
  fillOpacity: number;
  strokeOpacity: number;
  modified: boolean;
};

interface ImageTextEditorProps {
  imageUrl: string;
  onClose: () => void;
  onConfirm: (imageUrl: string) => void;
}

const FONT_OPTIONS = [
  { label: '阿里巴巴普惠体 R', value: 'Alibaba PuHuiTi 3 Regular' },
  { label: '阿里巴巴普惠体 M', value: 'Alibaba PuHuiTi 3 Medium' },
  { label: '阿里巴巴普惠体 B', value: 'Alibaba PuHuiTi 3 Bold' },
  { label: '阿里巴巴普惠体 H', value: 'Alibaba PuHuiTi 3 Heavy' },
  { label: '汉仪中宋简', value: 'Hanyi ZhongSong Jian' },
  { label: '小标宋简体', value: 'XiaoBiaoSong Jian' },
  { label: 'Arial', value: 'Arial' },
  { label: 'Arial Black', value: 'Arial Black' },
  { label: 'Georgia', value: 'Georgia' },
  { label: 'Impact', value: 'Impact' },
];

const AI_TEXT_MODELS: { id: ImageModel; label: string; price: number }[] = [
  { id: 'gpt-image-2', label: 'GPT Image 2（快速）', price: 0.04 },
  { id: 'gemini-2.5-flash-image', label: 'Google Flash 2.5', price: 0.30 },
  { id: 'gemini-3.1-flash-image-preview', label: 'Google Flash 3.1', price: 0.50 },
  { id: 'gemini-3-pro-image-preview', label: 'Google Pro 3.0', price: 1.00 },
];

const OCR_CACHE_VERSION = 'v1';
const ocrMemoryCache = new Map<string, LocalOcrLine[]>();
const ocrCacheKey = (source: string) => {
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `banfuly-ocr-${OCR_CACHE_VERSION}-${(hash >>> 0).toString(36)}-${source.length}`;
};
const readOcrCache = (source: string) => {
  const key = ocrCacheKey(source);
  const memory = ocrMemoryCache.get(key);
  if (memory) return memory;
  try {
    const cached = JSON.parse(sessionStorage.getItem(key) || 'null') as { lines?: LocalOcrLine[] } | null;
    if (cached?.lines) { ocrMemoryCache.set(key, cached.lines); return cached.lines; }
  } catch { /* Ignore damaged browser cache. */ }
  return null;
};
const writeOcrCache = (source: string, lines: LocalOcrLine[]) => {
  const key = ocrCacheKey(source);
  ocrMemoryCache.set(key, lines);
  try { sessionStorage.setItem(key, JSON.stringify({ lines })); } catch { /* Memory cache remains available. */ }
};

const withAlpha = (hex: string, opacity: number) => {
  const clean = hex.replace('#', '');
  const value = clean.length === 3 ? clean.split('').map(char => char + char).join('') : clean;
  const number = Number.parseInt(value, 16);
  return `rgba(${(number >> 16) & 255}, ${(number >> 8) & 255}, ${number & 255}, ${Math.max(0, Math.min(1, opacity))})`;
};

const isAlibabaPuHuiTi = (fontFamily: string) => fontFamily.startsWith('Alibaba PuHuiTi 3');
const effectiveFontWeight = (layer: Pick<TextLayer, 'fontFamily' | 'bold'>) => isAlibabaPuHuiTi(layer.fontFamily) ? 400 : (layer.bold ? 700 : 400);

const newLayer = (): TextLayer => ({
  id: `text-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  text: '输入新文字', originalText: '', source: 'manual',
  x: 0.5, y: 0.5, fontSize: 54, fontFamily: 'Alibaba PuHuiTi 3 Regular',
  color: '#ffffff', strokeColor: '#000000', strokeWidth: 0,
  bold: false, fillOpacity: 1, strokeOpacity: 1, modified: true,
});

const loadImage = (url: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('图片加载失败'));
  image.src = url;
});

const rgbToHex = (red: number, green: number, blue: number) => `#${[red, green, blue].map(value => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0')).join('')}`;

const estimateRegionStyle = (image: HTMLImageElement, box: Box, preparedContext?: CanvasRenderingContext2D | null) => {
  const canvas = preparedContext?.canvas || document.createElement('canvas');
  if (!preparedContext) { canvas.width = image.naturalWidth; canvas.height = image.naturalHeight; }
  const context = preparedContext || canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return { color: '#ffffff', strokeColor: '#000000' };
  if (!preparedContext) context.drawImage(image, 0, 0);
  const left = Math.max(0, Math.floor(box.x)); const top = Math.max(0, Math.floor(box.y));
  const width = Math.max(1, Math.min(canvas.width - left, Math.ceil(box.width)));
  const height = Math.max(1, Math.min(canvas.height - top, Math.ceil(box.height)));
  const pixels = context.getImageData(left, top, width, height).data;
  const border: number[][] = []; const inside: number[][] = [];
  const step = Math.max(1, Math.floor(Math.min(width, height) / 28));
  for (let y = 0; y < height; y += step) for (let x = 0; x < width; x += step) {
    const index = (y * width + x) * 4; const rgb = [pixels[index], pixels[index + 1], pixels[index + 2]];
    if (x < step * 2 || y < step * 2 || x >= width - step * 2 || y >= height - step * 2) border.push(rgb); else inside.push(rgb);
  }
  const average = (values: number[][]) => [0, 1, 2].map(channel => values.reduce((sum, rgb) => sum + rgb[channel], 0) / Math.max(1, values.length));
  const background = average(border);
  const contrasted = inside.map(rgb => ({ rgb, distance: Math.hypot(rgb[0] - background[0], rgb[1] - background[1], rgb[2] - background[2]) })).sort((a, b) => b.distance - a.distance).slice(0, Math.max(4, Math.ceil(inside.length * 0.22))).map(item => item.rgb);
  const foreground = average(contrasted.length ? contrasted : inside);
  const backgroundLuminance = background[0] * 0.299 + background[1] * 0.587 + background[2] * 0.114;
  return { color: rgbToHex(foreground[0], foreground[1], foreground[2]), strokeColor: backgroundLuminance > 145 ? '#000000' : '#ffffff' };
};

const eraseBoxes = async (source: string, boxes: Box[]) => {
  if (!boxes.length) return source;
  const image = await loadImage(source);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('无法创建图片画布');
  context.drawImage(image, 0, 0);
  const original = context.getImageData(0, 0, canvas.width, canvas.height);
  const output = context.createImageData(original);
  output.data.set(original.data);
  const sample = (x: number, y: number, channel: number) => {
    const safeX = Math.max(0, Math.min(canvas.width - 1, x));
    const safeY = Math.max(0, Math.min(canvas.height - 1, y));
    return original.data[(safeY * canvas.width + safeX) * 4 + channel];
  };
  boxes.forEach(box => {
    const padding = Math.max(3, Math.round(box.height * 0.12));
    const left = Math.max(1, Math.floor(box.x - padding));
    const top = Math.max(1, Math.floor(box.y - padding));
    const right = Math.min(canvas.width - 2, Math.ceil(box.x + box.width + padding));
    const bottom = Math.min(canvas.height - 2, Math.ceil(box.y + box.height + padding));
    for (let y = top; y <= bottom; y += 1) {
      const vertical = (y - top) / Math.max(1, bottom - top);
      for (let x = left; x <= right; x += 1) {
        const horizontal = (x - left) / Math.max(1, right - left);
        const index = (y * canvas.width + x) * 4;
        for (let channel = 0; channel < 3; channel += 1) {
          const horizontalFill = sample(left - 1, y, channel) * (1 - horizontal) + sample(right + 1, y, channel) * horizontal;
          const verticalFill = sample(x, top - 1, channel) * (1 - vertical) + sample(x, bottom + 1, channel) * vertical;
          output.data[index + channel] = Math.round((horizontalFill + verticalFill) / 2);
        }
        output.data[index + 3] = 255;
      }
    }
  });
  context.putImageData(output, 0, 0);
  return canvas.toDataURL('image/png');
};

export const ImageTextEditor: React.FC<ImageTextEditorProps> = ({ imageUrl, onClose, onConfirm }) => {
  const [layers, setLayers] = useState<TextLayer[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [baseImage, setBaseImage] = useState(imageUrl);
  const [erasedIds, setErasedIds] = useState<Set<string>>(new Set());
  const [ocrState, setOcrState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrMessage, setOcrMessage] = useState('正在准备本地识别…');
  const [ocrRegion, setOcrRegion] = useState<Box | null>(null);
  const [selectingOcrRegion, setSelectingOcrRegion] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiModel, setAiModel] = useState<ImageModel>(() => {
    const saved = localStorage.getItem('image_text_ai_model') as ImageModel | null;
    return AI_TEXT_MODELS.some(model => model.id === saved) ? saved! : 'gpt-image-2';
  });
  const [aiEditing, setAiEditing] = useState(false);
  const [aiError, setAiError] = useState('');
  const [brushMode, setBrushMode] = useState(false);
  const [brushSize, setBrushSize] = useState(36);
  const [previewScale, setPreviewScale] = useState(1);
  const [historyIndex, setHistoryIndex] = useState(0);
  const historyRef = useRef<string[]>([imageUrl]);
  const stageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const brushCanvasRef = useRef<HTMLCanvasElement>(null);
  const brushDrawingRef = useRef(false);
  const dragRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const ocrRegionStartRef = useRef<{ x: number; y: number } | null>(null);
  const selected = useMemo(() => layers.find(layer => layer.id === selectedId), [layers, selectedId]);
  const changedLayers = useMemo(() => layers.filter(layer => layer.source === 'manual' || layer.text !== layer.originalText || layer.modified), [layers]);
  const aiModelOption = AI_TEXT_MODELS.find(model => model.id === aiModel) || AI_TEXT_MODELS[0];

  useEffect(() => { if (selected) setAiText(selected.text); }, [selectedId]);
  useEffect(() => { localStorage.setItem('image_text_ai_model', aiModel); }, [aiModel]);

  const pushHistory = (url: string) => {
    const next = historyRef.current.slice(0, historyIndex + 1);
    next.push(url);
    historyRef.current = next.slice(-12);
    setHistoryIndex(historyRef.current.length - 1);
    setBaseImage(url);
  };

  const runOcr = async (force = false) => {
    const image = imageRef.current;
    if (!image || ocrState === 'loading') return;
    if (!ocrRegion || ocrRegion.width < 0.01 || ocrRegion.height < 0.01) {
      setOcrMessage('请先点击“框选区域”，在图片内拖出识别范围');
      return;
    }
    const crop = {
      x: Math.max(0, Math.round(ocrRegion.x * image.naturalWidth)),
      y: Math.max(0, Math.round(ocrRegion.y * image.naturalHeight)),
      width: Math.max(1, Math.round(ocrRegion.width * image.naturalWidth)),
      height: Math.max(1, Math.round(ocrRegion.height * image.naturalHeight)),
    };
    const cacheSource = `${imageUrl}#${crop.x},${crop.y},${crop.width},${crop.height}`;
    const cachedLines = force ? null : readOcrCache(cacheSource);
    setOcrState('loading'); setOcrProgress(cachedLines ? 1 : 0); setOcrMessage(cachedLines ? '正在恢复上次识别结果…' : '正在加载中英文识别模型…');
    try {
      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = crop.width; cropCanvas.height = crop.height;
      cropCanvas.getContext('2d')?.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
      const cropImage = await loadImage(cropCanvas.toDataURL('image/jpeg', 0.94));
      const localFound = cachedLines || await recognizeTextLines(cropImage, (progress, status) => {
        setOcrProgress(progress); setOcrMessage(status.includes('recognizing') ? '正在识别图片文字…' : '正在准备本地识别…');
      });
      if (!cachedLines) writeOcrCache(cacheSource, localFound);
      const found = localFound.map(line => ({
        ...line,
        bbox: {
          x0: line.bbox.x0 + crop.x, y0: line.bbox.y0 + crop.y,
          x1: line.bbox.x1 + crop.x, y1: line.bbox.y1 + crop.y,
        },
      }));
      const width = image.naturalWidth; const height = image.naturalHeight;
      const styleCanvas = document.createElement('canvas'); styleCanvas.width = width; styleCanvas.height = height;
      const styleContext = styleCanvas.getContext('2d', { willReadFrequently: true }); styleContext?.drawImage(image, 0, 0);
      const next = found.map((line, index): TextLayer => {
        const box = { x: line.bbox.x0, y: line.bbox.y0, width: line.bbox.x1 - line.bbox.x0, height: line.bbox.y1 - line.bbox.y0 };
        const style = estimateRegionStyle(image, box, styleContext);
        return {
          ...newLayer(), id: `ocr-${Date.now()}-${index}`, source: 'ocr', text: line.text, originalText: line.text, box,
          x: (box.x + box.width / 2) / width, y: (box.y + box.height / 2) / height,
          fontSize: Math.max(12, Math.round(box.height * 0.82)), color: style.color, strokeColor: style.strokeColor,
          strokeWidth: 0, bold: false, modified: false,
        };
      });
      setLayers(next); setSelectedId(next[0]?.id || ''); setOcrState('done');
      setOcrMessage(next.length ? `${cachedLines ? '已从缓存恢复' : '识别到'} ${next.length} 行文字` : '未识别到文字，可手动添加文字');
    } catch (error) {
      setOcrState('error'); setOcrMessage(error instanceof Error ? error.message : '本地文字识别失败');
    }
  };

  useEffect(() => { setOcrMessage('不主动识别：请框选图片中的文字区域'); }, []);

  const updateSelected = (patch: Partial<TextLayer>) => setLayers(current => current.map(layer => layer.id === selectedId ? { ...layer, ...patch, modified: true } : layer));
  const addLayer = () => {
    const layer = newLayer();
    if (selected) {
      Object.assign(layer, {
        fontSize: selected.fontSize, fontFamily: selected.fontFamily, color: selected.color,
        strokeColor: selected.strokeColor, strokeWidth: 0, bold: selected.bold,
        fillOpacity: selected.fillOpacity, strokeOpacity: selected.strokeOpacity,
        x: selected.x, y: Math.min(0.92, selected.y + Math.max(0.08, (selected.box?.height || selected.fontSize) / (imageRef.current?.naturalHeight || 1000) * 1.5)),
      });
    } else if (imageRef.current?.naturalWidth) {
      const image = imageRef.current;
      const size = Math.round(Math.min(image.naturalWidth, image.naturalHeight) * 0.06);
      const style = estimateRegionStyle(image, { x: image.naturalWidth * 0.3, y: image.naturalHeight * 0.43, width: image.naturalWidth * 0.4, height: image.naturalHeight * 0.14 });
      Object.assign(layer, { fontSize: size, color: style.strokeColor, strokeColor: style.color, strokeWidth: 0 });
    }
    setLayers(current => [...current, layer]); setSelectedId(layer.id);
  };
  const removeSelected = () => setLayers(current => { const next = current.filter(layer => layer.id !== selectedId); setSelectedId(next[0]?.id || ''); return next; });

  const autoErase = async () => {
    const pending = changedLayers.filter(layer => layer.source === 'ocr' && layer.box && !erasedIds.has(layer.id));
    if (!pending.length) return;
    const result = await eraseBoxes(baseImage, pending.map(layer => layer.box!));
    pushHistory(result);
    setErasedIds(current => new Set([...current, ...pending.map(layer => layer.id)]));
  };

  const undo = () => { if (historyIndex <= 0) return; const index = historyIndex - 1; setHistoryIndex(index); setBaseImage(historyRef.current[index]); };
  const redo = () => { if (historyIndex >= historyRef.current.length - 1) return; const index = historyIndex + 1; setHistoryIndex(index); setBaseImage(historyRef.current[index]); };

  const beginDrag = (event: React.PointerEvent, layer: TextLayer) => {
    if (brushMode) return;
    event.preventDefault(); event.stopPropagation(); setSelectedId(layer.id);
    const stage = stageRef.current?.getBoundingClientRect(); if (!stage) return;
    dragRef.current = { id: layer.id, offsetX: event.clientX - (stage.left + layer.x * stage.width), offsetY: event.clientY - (stage.top + layer.y * stage.height) };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event: React.PointerEvent) => {
    if (ocrRegionStartRef.current) {
      const stage = stageRef.current?.getBoundingClientRect(); if (!stage) return;
      const currentX = Math.max(0, Math.min(1, (event.clientX - stage.left) / stage.width));
      const currentY = Math.max(0, Math.min(1, (event.clientY - stage.top) / stage.height));
      const start = ocrRegionStartRef.current;
      setOcrRegion({ x: Math.min(start.x, currentX), y: Math.min(start.y, currentY), width: Math.abs(currentX - start.x), height: Math.abs(currentY - start.y) });
      return;
    }
    const drag = dragRef.current; const stage = stageRef.current?.getBoundingClientRect(); if (!drag || !stage) return;
    const x = Math.max(0, Math.min(1, (event.clientX - stage.left - drag.offsetX) / stage.width));
    const y = Math.max(0, Math.min(1, (event.clientY - stage.top - drag.offsetY) / stage.height));
    setLayers(current => current.map(layer => layer.id === drag.id ? { ...layer, x, y } : layer));
  };
  const beginOcrRegion = (event: React.PointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current?.getBoundingClientRect(); if (!stage) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    const x = Math.max(0, Math.min(1, (event.clientX - stage.left) / stage.width));
    const y = Math.max(0, Math.min(1, (event.clientY - stage.top) / stage.height));
    ocrRegionStartRef.current = { x, y };
    setOcrRegion({ x, y, width: 0, height: 0 });
  };

  const brushAt = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!brushMode || !brushDrawingRef.current) return;
    const canvas = brushCanvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * canvas.width / rect.width; const y = (event.clientY - rect.top) * canvas.height / rect.height;
    const radius = brushSize * canvas.width / Math.max(1, rect.width) / 2;
    const context = canvas.getContext('2d', { willReadFrequently: true }); if (!context) return;
    const source = context.getImageData(0, 0, canvas.width, canvas.height);
    let red = 0, green = 0, blue = 0, count = 0;
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 12) {
      const sx = Math.max(0, Math.min(canvas.width - 1, Math.round(x + Math.cos(angle) * radius * 1.4)));
      const sy = Math.max(0, Math.min(canvas.height - 1, Math.round(y + Math.sin(angle) * radius * 1.4)));
      const index = (sy * canvas.width + sx) * 4; red += source.data[index]; green += source.data[index + 1]; blue += source.data[index + 2]; count += 1;
    }
    context.save(); context.fillStyle = `rgb(${red / count},${green / count},${blue / count})`; context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fill(); context.restore();
  };
  const syncBrushCanvas = () => {
    const canvas = brushCanvasRef.current; const image = imageRef.current; if (!canvas || !image || !image.naturalWidth) return;
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight; canvas.getContext('2d')?.drawImage(image, 0, 0);
    const renderedWidth = image.getBoundingClientRect().width;
    setPreviewScale(renderedWidth > 0 ? renderedWidth / image.naturalWidth : 1);
  };

  useEffect(() => {
    const image = imageRef.current;
    if (!image || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (!image.naturalWidth) return;
      const renderedWidth = image.getBoundingClientRect().width;
      if (renderedWidth > 0) setPreviewScale(renderedWidth / image.naturalWidth);
    });
    observer.observe(image);
    return () => observer.disconnect();
  }, [baseImage]);
  const finishBrush = () => {
    if (!brushDrawingRef.current) return; brushDrawingRef.current = false;
    const url = brushCanvasRef.current?.toDataURL('image/png'); if (url) pushHistory(url);
  };

  const aiReplaceText = async () => {
    if (!selected?.box || !aiText.trim() || aiEditing) return;
    setAiEditing(true); setAiError('');
    try {
      const source = await loadImage(baseImage);
      const box = selected.box;
      const padded = {
        x: Math.max(0, box.x - box.width * 0.12),
        y: Math.max(0, box.y - box.height * 0.22),
        width: Math.min(source.naturalWidth, box.width * 1.24),
        height: Math.min(source.naturalHeight, box.height * 1.44),
      };
      padded.x = Math.min(padded.x, source.naturalWidth - padded.width);
      padded.y = Math.min(padded.y, source.naturalHeight - padded.height);
      const ratios: { id: AspectRatio; value: number }[] = [
        { id: '1:1', value: 1 }, { id: '4:3', value: 4 / 3 }, { id: '3:4', value: 3 / 4 },
        { id: '16:9', value: 16 / 9 }, { id: '9:16', value: 9 / 16 },
        aiModel === 'gpt-image-2' ? { id: '5:2', value: 2.5 } : { id: '21:9', value: 21 / 9 },
      ];
      const aspect = ratios.reduce((best, item) => Math.abs(Math.log(padded.width / padded.height / item.value)) < Math.abs(Math.log(padded.width / padded.height / best.value)) ? item : best, ratios[0]);
      const centerX = padded.x + padded.width / 2; const centerY = padded.y + padded.height / 2;
      if (padded.width / padded.height < aspect.value) padded.width = Math.min(source.naturalWidth, padded.height * aspect.value);
      else padded.height = Math.min(source.naturalHeight, padded.width / aspect.value);
      padded.x = Math.max(0, Math.min(source.naturalWidth - padded.width, centerX - padded.width / 2));
      padded.y = Math.max(0, Math.min(source.naturalHeight - padded.height, centerY - padded.height / 2));
      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = Math.max(1, Math.round(padded.width)); cropCanvas.height = Math.max(1, Math.round(padded.height));
      const cropContext = cropCanvas.getContext('2d'); if (!cropContext) throw new Error('无法创建 AI 修改区域');
      cropContext.drawImage(source, padded.x, padded.y, padded.width, padded.height, 0, 0, cropCanvas.width, cropCanvas.height);
      const cropUrl = cropCanvas.toDataURL('image/png');
      const maskCanvas = document.createElement('canvas'); maskCanvas.width = cropCanvas.width; maskCanvas.height = cropCanvas.height;
      const maskContext = maskCanvas.getContext('2d'); if (!maskContext) throw new Error('无法创建文字编辑遮罩');
      maskContext.fillStyle = '#ffffff'; maskContext.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
      const scaleX = maskCanvas.width / padded.width; const scaleY = maskCanvas.height / padded.height;
      const maskPaddingX = Math.max(3, box.width * 0.06); const maskPaddingY = Math.max(3, box.height * 0.14);
      maskContext.clearRect((box.x - padded.x - maskPaddingX) * scaleX, (box.y - padded.y - maskPaddingY) * scaleY, (box.width + maskPaddingX * 2) * scaleX, (box.height + maskPaddingY * 2) * scaleY);
      const maskUrl = maskCanvas.toDataURL('image/png');
      const prompt = [
        `仅将遮罩区域内的原有文字替换为准确的中文文字“${aiText.trim()}”。`,
        '保持原文字所在位置、尺寸、排版、颜色、材质、立体感、光影、描边和广告特效风格一致。',
        '保持背景、人物、商品及其他所有区域不变，不添加其他文字、标识或水印。',
        `最终文字必须逐字准确显示为：${aiText.trim()}`,
      ].join('\n');
      const [editedUrl] = await generateImage({
        prompt, model: aiModel, imageSize: '1K', aspectRatio: aspect.id, quality: 'low',
        images: [{ data: cropUrl.split(',')[1], mimeType: 'image/png' }],
        mask: aiModel === 'gpt-image-2' ? { data: maskUrl.split(',')[1], mimeType: 'image/png' } : undefined,
      });
      const edited = await loadImage(editedUrl);
      const finalCanvas = document.createElement('canvas'); finalCanvas.width = source.naturalWidth; finalCanvas.height = source.naturalHeight;
      const finalContext = finalCanvas.getContext('2d'); if (!finalContext) throw new Error('无法合成 AI 修改结果');
      finalContext.drawImage(source, 0, 0);
      finalContext.drawImage(edited, padded.x, padded.y, padded.width, padded.height);
      const finalUrl = finalCanvas.toDataURL('image/png');
      const token = localStorage.getItem('auth_token');
      await fetch('/api/user/deduct-credit', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ amount: aiModelOption.price }),
      }).catch(() => undefined);
      onConfirm(finalUrl);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : 'AI 修改文字失败');
    } finally { setAiEditing(false); }
  };

  const renderFinal = async () => {
    setSaving(true);
    try {
      const notErased = changedLayers.filter(layer => layer.source === 'ocr' && layer.box && !erasedIds.has(layer.id));
      const prepared = await eraseBoxes(baseImage, notErased.map(layer => layer.box!));
      const image = await loadImage(prepared); await document.fonts.ready;
      await Promise.all(changedLayers.map(layer => document.fonts.load(`${effectiveFontWeight(layer)} ${layer.fontSize}px "${layer.fontFamily}"`, layer.text || '耀眼一夏 AURA')));
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d'); if (!context) throw new Error('无法创建图片画布');
      context.drawImage(image, 0, 0);
      changedLayers.forEach(layer => {
        const lines = layer.text.split('\n'); context.save(); context.textAlign = 'center'; context.textBaseline = 'middle'; context.lineJoin = 'round';
        context.font = `${effectiveFontWeight(layer)} ${layer.fontSize}px "${layer.fontFamily}"`;
        context.fillStyle = withAlpha(layer.color, layer.fillOpacity); context.strokeStyle = withAlpha(layer.strokeColor, layer.strokeOpacity); context.lineWidth = layer.strokeWidth * 2;
        const lineHeight = layer.fontSize * 1.2; const startY = layer.y * canvas.height - ((lines.length - 1) * lineHeight) / 2;
        lines.forEach((line, index) => { const x = layer.x * canvas.width; const y = startY + index * lineHeight; if (layer.strokeWidth > 0 && layer.strokeOpacity > 0) context.strokeText(line, x, y); if (layer.fillOpacity > 0) context.fillText(line, x, y); });
        context.restore();
      });
      onConfirm(canvas.toDataURL('image/png'));
    } finally { setSaving(false); }
  };

  return <div className="fixed inset-0 z-[10020] flex bg-black/90 backdrop-blur-sm" onPointerUp={() => { dragRef.current = null; ocrRegionStartRef.current = null; finishBrush(); }} onPointerMove={moveDrag}>
    <div className="flex min-w-0 flex-1 flex-col p-4">
      <div className="mb-3 flex items-center justify-between text-white"><div><h3 className="text-base font-bold">修改图片原有文字</h3><p className="text-xs text-gray-500">本地识别和消除不会产生 API 费用；只处理你修改过的文字行。</p></div><button onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-white/10"><X size={20}/></button></div>
      <div className="mb-2 flex items-center gap-2 text-xs text-gray-400">
        <button onClick={() => setBrushMode(!brushMode)} className={`flex items-center gap-1 rounded-lg px-3 py-2 ${brushMode ? 'bg-cyan-600 text-white' : 'bg-[#252525]'}`}><Eraser size={14}/>消除画笔</button>
        {brushMode && <label className="flex items-center gap-2">笔刷<input type="range" min="8" max="120" value={brushSize} onChange={event => setBrushSize(Number(event.target.value))}/>{brushSize}px</label>}
        <button onClick={undo} disabled={historyIndex <= 0} className="rounded-lg bg-[#252525] p-2 disabled:opacity-30"><Undo2 size={14}/></button>
        <button onClick={redo} disabled={historyIndex >= historyRef.current.length - 1} className="rounded-lg bg-[#252525] p-2 disabled:opacity-30"><Redo2 size={14}/></button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl border border-[#333] bg-[#0b0b0b] p-3">
        <div ref={stageRef} className="relative inline-flex max-h-full max-w-full select-none">
          <img ref={imageRef} src={baseImage} crossOrigin="anonymous" onLoad={syncBrushCanvas} className="max-h-[76vh] max-w-full object-contain" alt="文字编辑"/>
          <canvas ref={brushCanvasRef} onPointerDown={event => { if (!brushMode) return; brushDrawingRef.current = true; event.currentTarget.setPointerCapture(event.pointerId); brushAt(event); }} onPointerMove={brushAt} className={`absolute inset-0 h-full w-full ${brushMode ? 'z-30 cursor-crosshair opacity-100' : 'pointer-events-none opacity-0'}`}/>
          {ocrRegion && <div className="pointer-events-none absolute z-40 border border-cyan-300 bg-cyan-400/10" style={{ left: `${ocrRegion.x * 100}%`, top: `${ocrRegion.y * 100}%`, width: `${ocrRegion.width * 100}%`, height: `${ocrRegion.height * 100}%` }}/>}
          {selectingOcrRegion && <div className="absolute inset-0 z-50 cursor-crosshair" onPointerDown={beginOcrRegion} onPointerUp={() => { ocrRegionStartRef.current = null; setSelectingOcrRegion(false); setOcrMessage('选区已确定，点击“识别所选区域”'); }}/>}
          {layers.map(layer => {
            const changed = layer.source === 'manual' || layer.text !== layer.originalText || layer.modified;
            const style: React.CSSProperties = layer.box && !changed ? { left: `${layer.box.x / (imageRef.current?.naturalWidth || 1) * 100}%`, top: `${layer.box.y / (imageRef.current?.naturalHeight || 1) * 100}%`, width: `${layer.box.width / (imageRef.current?.naturalWidth || 1) * 100}%`, height: `${layer.box.height / (imageRef.current?.naturalHeight || 1) * 100}%` } : { left: `${layer.x * 100}%`, top: `${layer.y * 100}%`, transform: 'translate(-50%, -50%)', fontFamily: layer.fontFamily, fontSize: `${Math.max(1, layer.fontSize * previewScale)}px`, fontWeight: effectiveFontWeight(layer), color: withAlpha(layer.color, layer.fillOpacity), WebkitTextStroke: `${Math.max(0, layer.strokeWidth * previewScale)}px ${withAlpha(layer.strokeColor, layer.strokeOpacity)}` };
            return <div key={layer.id} onPointerDown={event => beginDrag(event, layer)} onClick={() => setSelectedId(layer.id)} className={`absolute z-20 cursor-pointer whitespace-pre text-center leading-[1.2] outline ${selectedId === layer.id ? 'bg-cyan-400/10 outline-2 outline-cyan-400' : 'outline-1 outline-cyan-300/40 hover:outline-white'} ${brushMode ? 'pointer-events-none' : ''}`} style={style}>{changed ? layer.text : ''}</div>;
          })}
        </div>
      </div>
    </div>

    <aside className="w-[360px] shrink-0 overflow-y-auto border-l border-[#333] bg-[#171717] p-4 text-white">
      <div className="rounded-xl border border-[#303030] bg-[#111] p-3">
        <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-xs font-bold"><ScanText size={15} className="text-cyan-400"/>图片文案识别</span><button title="重新识别当前选区" onClick={() => void runOcr(true)} disabled={ocrState === 'loading' || !ocrRegion} className="rounded p-1 text-gray-400 hover:text-white disabled:opacity-40"><RefreshCw size={14} className={ocrState === 'loading' ? 'animate-spin' : ''}/></button></div>
        <p className="mt-2 text-[11px] text-gray-500">{ocrMessage}</p>
        {ocrState === 'loading' && <div className="mt-2 h-1 overflow-hidden rounded bg-[#333]"><div className="h-full bg-cyan-500" style={{ width: `${Math.round(ocrProgress * 100)}%` }}/></div>}
        <div className="mt-3 grid grid-cols-2 gap-2"><button onClick={() => { setSelectingOcrRegion(true); setOcrMessage('请在图片内拖动框选文字区域'); }} disabled={ocrState === 'loading'} className={`rounded-lg border px-2 py-2 text-xs font-bold ${selectingOcrRegion ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200' : 'border-[#444] bg-[#222]'}`}>框选区域</button><button onClick={() => void runOcr(false)} disabled={ocrState === 'loading' || !ocrRegion} className="rounded-lg bg-cyan-600 px-2 py-2 text-xs font-bold disabled:opacity-30">识别所选区域</button></div>
      </div>
      <div className="mt-3 max-h-[230px] space-y-2 overflow-y-auto pr-1">
        {layers.filter(layer => layer.source === 'ocr').map((layer, index) => <button key={layer.id} onClick={() => setSelectedId(layer.id)} className={`w-full rounded-lg border p-2 text-left ${selectedId === layer.id ? 'border-cyan-500 bg-cyan-500/10' : 'border-[#333] bg-[#202020]'}`}><div className="mb-1 text-[9px] text-gray-500">第 {index + 1} 行 {(layer.text !== layer.originalText || layer.modified) && <span className="ml-2 text-orange-400">已修改</span>}</div><div className="truncate text-xs">{layer.text}</div></button>)}
      </div>
      <div className="my-3 flex gap-2"><button onClick={addLayer} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold"><Plus size={15}/>添加新文字</button><button onClick={removeSelected} disabled={!selected} className="rounded-lg border border-[#444] p-2 text-red-400 disabled:opacity-30"><Trash2 size={16}/></button></div>
      {selected ? <div className="space-y-3 border-t border-[#333] pt-3">
        <label className="block text-[10px] font-bold text-gray-500">文字内容<textarea value={selected.text} onChange={event => updateSelected({ text: event.target.value })} rows={3} className="mt-1 w-full resize-none rounded-lg border border-[#3a3a3a] bg-[#222] p-2 text-sm text-white outline-none focus:border-cyan-500"/></label>
        {selected.source === 'ocr' && (selected.text !== selected.originalText || selected.modified) && <button onClick={() => void autoErase()} className="flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-700 bg-cyan-500/10 px-3 py-2 text-xs font-bold text-cyan-300"><Eraser size={14}/>本地自动消除已修改原文字</button>}
        {selected.source === 'ocr' && selected.box && <div className="space-y-2 rounded-xl border border-violet-800/60 bg-violet-500/5 p-3"><div className="flex items-center gap-2 text-xs font-bold text-violet-300"><Sparkles size={14}/>AI 修改艺术字</div><input value={aiText} onChange={event => setAiText(event.target.value)} placeholder="输入替换后的准确文字" className="w-full rounded-lg border border-[#444] bg-[#202020] px-3 py-2 text-sm text-white outline-none focus:border-violet-500"/><select value={aiModel} onChange={event => setAiModel(event.target.value as ImageModel)} className="w-full rounded-lg border border-[#444] bg-[#202020] px-3 py-2 text-xs text-white outline-none">{AI_TEXT_MODELS.map(model => <option key={model.id} value={model.id}>{model.label} · 预计 ¥{model.price.toFixed(2)}</option>)}</select><button onClick={() => void aiReplaceText()} disabled={aiEditing || !aiText.trim()} className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-xs font-bold disabled:opacity-40"><Sparkles size={14}/>{aiEditing ? 'AI 正在修改…' : `开始修改 · 约 ¥${aiModelOption.price.toFixed(2)}`}</button>{aiError && <p className="text-[11px] leading-relaxed text-red-400">{aiError}</p>}<p className="text-[10px] leading-relaxed text-gray-500">只处理当前文字附近区域；成功后才扣网站额度，失败不扣费。</p></div>}
        <div className="block text-[10px] font-bold text-gray-500">字体（点击即时预览）<div className="mt-1 rounded-lg border border-cyan-700/50 bg-[#202020] px-3 py-2 text-center text-lg text-white" style={{fontFamily:selected.fontFamily,fontWeight:effectiveFontWeight(selected)}}>耀眼一夏 · AURA</div><div role="listbox" aria-label="字体" className="mt-1 max-h-44 space-y-1 overflow-y-auto rounded-lg border border-[#3a3a3a] bg-[#181818] p-1 pr-2">{FONT_OPTIONS.map(font => <button key={font.value} type="button" role="option" aria-selected={selected.fontFamily === font.value} onClick={() => updateSelected({ fontFamily: font.value, bold: false })} className={`block w-full rounded-md px-2 py-2 text-left text-sm transition ${selected.fontFamily === font.value ? 'bg-cyan-600 text-white' : 'bg-[#242424] text-gray-200 hover:bg-[#303030]'}`} style={{fontFamily:font.value}}>{font.label} · 耀眼 AURA</button>)}</div></div>
        <div className="grid grid-cols-2 gap-2"><label className="text-[10px] font-bold text-gray-500">字号<input type="number" min="8" max="500" value={selected.fontSize} onChange={event => updateSelected({fontSize:Number(event.target.value)})} className="mt-1 w-full rounded-lg border border-[#3a3a3a] bg-[#222] p-2 text-sm text-white"/></label><button onClick={() => updateSelected({bold:!selected.bold})} className={`mt-4 rounded-lg border px-3 text-xs font-bold ${selected.bold?'border-white bg-white text-black':'border-[#444]'}`}>粗体</button></div>
        <div className="grid grid-cols-2 gap-2"><label className="text-[10px] font-bold text-gray-500">文字颜色<input type="color" value={selected.color} onChange={event => updateSelected({color:event.target.value})} className="mt-1 h-8 w-full"/></label><label className="text-[10px] font-bold text-gray-500">描边颜色<input type="color" value={selected.strokeColor} onChange={event => updateSelected({strokeColor:event.target.value})} className="mt-1 h-8 w-full"/></label></div>
        <div className="grid grid-cols-2 gap-2"><label className="text-[10px] font-bold text-gray-500">文字透明度<input type="range" min="0" max="1" step="0.05" value={selected.fillOpacity} onChange={event => updateSelected({fillOpacity:Number(event.target.value)})} className="mt-2 w-full"/></label><label className="text-[10px] font-bold text-gray-500">描边透明度<input type="range" min="0" max="1" step="0.05" value={selected.strokeOpacity} onChange={event => updateSelected({strokeOpacity:Number(event.target.value)})} className="mt-2 w-full"/></label></div>
        <label className="block text-[10px] font-bold text-gray-500">描边粗细<input type="range" min="0" max="12" value={selected.strokeWidth} onChange={event => updateSelected({strokeWidth:Number(event.target.value)})} className="mt-2 w-full"/></label>
      </div> : <div className="py-8 text-center text-xs text-gray-600"><Type className="mx-auto mb-2"/>等待识别或添加文字</div>}
      <div className="mt-5 rounded-lg bg-[#222] p-2 text-[10px] leading-relaxed text-gray-500">普通文字建议使用字体库，中文最准确且不产生费用。复杂艺术字的 AI 模仿将作为独立高级模式接入，避免误改整张商品图。</div>
      <div className="mt-4 grid grid-cols-2 gap-2"><button onClick={onClose} className="rounded-lg border border-[#444] px-3 py-2 text-xs font-bold">取消</button><button onClick={() => void renderFinal()} disabled={saving || changedLayers.length === 0} className="flex items-center justify-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-xs font-bold disabled:opacity-40"><Check size={15}/>{saving?'处理中…':'保存为新图'}</button></div>
    </aside>
  </div>;
};
