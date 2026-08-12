import React, { useState, useEffect, useRef, useLayoutEffect, useImperativeHandle, forwardRef } from 'react';
import { Send, ChevronDown, Key, Image as ImageIcon, X, Boxes, Loader2, SlidersHorizontal, Library, Palette, Mountain, Layers3, UserRound, Type } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AspectRatio, ImageSize, ImageModel } from '../lib/gemini';
import { cn } from '../lib/utils';
import { assertImageUsage, processImageFiles } from '../lib/uploadProcessing';
import type { AssetRecord, AssetType, CategoryBaseRecord, PaginatedAssetResult } from '../lib/assetLibrary';
import type { CategoryBaseSlotKey, ProductionMaterialSelection, SelectedAssetMaterial } from '../lib/categoryBaseGeneration';

export interface SelectedCategoryBase {
  id: string;
  versionId: string;
  name: string;
  version: number;
}

export interface GenerationBarRef {
  addImage: (data: string, mimeType: string, preview: string, sourceNodeId?: string, usage?: { originalBytes: number; analysisBytes: number }) => void;
  setParams: (prompt: string, aspectRatio: AspectRatio, imageSize: ImageSize, model: ImageModel, images?: { data: string; mimeType: string; preview: string; sourceNodeId?: string }[], productionMaterials?: ProductionMaterialSelection) => void;
}

interface GenerationBarProps {
  onGenerate: (prompt: string, aspectRatio: AspectRatio, imageSize: ImageSize, model: ImageModel, images?: { data: string; mimeType: string; sourceNodeId?: string }[], targetNodeId?: string, productionMaterials?: ProductionMaterialSelection) => void;
  hasApiKey: boolean;
  onOpenApiKey: () => void;
}

const GOOGLE_ASPECT_RATIOS: AspectRatio[] = ["AUTO", "1:1", "16:9", "9:16", "21:9", "4:3", "3:4", "5:4", "4:5", "3:2", "2:3", "4:1", "1:4", "8:1", "1:8"];
const GPT_ASPECT_RATIOS: AspectRatio[] = ["AUTO", "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "5:2", "2:5"];

interface ModelCost {
  name: string;
  label: string;
  resolutions: {
    [key: string]: { cost: number; rmb: number };
  };
}

const MODEL_COSTS: Record<ImageModel, ModelCost> = {
  'gemini-2.5-flash-image': { 
    name: 'FLASH 2.5', 
    label: 'BALANCED',
    resolutions: {
      '1K': { cost: 0.039, rmb: 0.3 }
    }
  },
  'gemini-3.1-flash-image-preview': { 
    name: 'FLASH 3.1', 
    label: 'HIGH FIDELITY',
    resolutions: {
      '0.5K': { cost: 0.045, rmb: 0.3 },
      '1K': { cost: 0.067, rmb: 0.5 },
      '2K': { cost: 0.101, rmb: 0.7 },
      '4K': { cost: 0.151, rmb: 1.1 }
    }
  },
  'gemini-3-pro-image-preview': { 
    name: 'PRO 3.0', 
    label: 'CINEMA GRADE',
    resolutions: {
      '1K': { cost: 0.134, rmb: 1.0 },
      '2K': { cost: 0.134, rmb: 1.0 },
      '4K': { cost: 0.24, rmb: 1.7 }
    }
  },
  'gpt-image-2': {
    name: 'GPT IMAGE 2',
    label: 'LINKAI · HIGH FIDELITY',
    resolutions: {
      '1K': { cost: 0, rmb: 1.0 }
    }
  }
};

MODEL_COSTS['gpt-image-2'] = {
  name: 'GPT IMAGE 2',
  label: 'OPENAI OFFICIAL',
  resolutions: {
    '1K': { cost: 0, rmb: 1.0 },
    '2K': { cost: 0, rmb: 1.0 },
    '4K': { cost: 0, rmb: 1.0 }
  }
};

const IMAGE_SIZES: { id: ImageSize; label: string }[] = [
  { id: "512px", label: "0.5K" },
  { id: "1K", label: "1K" },
  { id: "2K", label: "2K" },
  { id: "4K", label: "4K" },
];

type GptImageQuality = "low" | "medium" | "high";
const USD_TO_CNY = 6.78;

const GOOGLE_INPUT_USD_PER_MILLION: Partial<Record<ImageModel, number>> = {
  "gemini-2.5-flash-image": 0.3,
  "gemini-3.1-flash-image-preview": 0.5,
  "gemini-3-pro-image-preview": 2,
};

const estimateGoogleImagePrice = (
  modelId: ImageModel,
  size: ImageSize,
  promptValue: string,
  referenceImageCount: number
) => {
  const lookupId = size === "512px" ? "0.5K" : size;
  const modelCfg = MODEL_COSTS[modelId];
  const outputUsd = modelCfg?.resolutions[lookupId]?.cost
    ?? Object.values(modelCfg?.resolutions ?? {})[0]?.cost
    ?? 0;
  const inputRate = GOOGLE_INPUT_USD_PER_MILLION[modelId] ?? 0;
  // Google does not return a pre-request exact bill. Use the current prompt plus
  // the documented 560-token image-input baseline to produce a transparent estimate.
  const promptTokens = Math.max(1, Math.ceil(promptValue.length / 2));
  const referenceImageTokens = referenceImageCount * 560;
  const inputUsd = (promptTokens + referenceImageTokens) * inputRate / 1_000_000;
  return { usd: outputUsd + inputUsd, cny: (outputUsd + inputUsd) * USD_TO_CNY };
};

const GPT_QUALITY_OPTIONS: { id: GptImageQuality; label: string; description: string }[] = [
  { id: "low", label: "快速", description: "预览草图 · 最快" },
  { id: "medium", label: "标准", description: "质量速度均衡" },
  { id: "high", label: "精细", description: "最终成品 · 较慢" },
];

const GPT_SIZE_TABLE: Record<ImageSize, Record<string, string>> = {
  "512px": { "1:1": "1024x1024", "3:4": "1024x1360", "4:3": "1360x1024", "9:16": "1024x1824", "16:9": "1824x1024", "2:5": "1024x2560", "5:2": "2560x1024", "3:2": "1536x1024", "2:3": "1024x1536", "AUTO": "1024x1024" },
  "1K": { "1:1": "1024x1024", "3:4": "1024x1360", "4:3": "1360x1024", "9:16": "1024x1824", "16:9": "1824x1024", "2:5": "1024x2560", "5:2": "2560x1024", "3:2": "1536x1024", "2:3": "1024x1536", "AUTO": "1024x1024" },
  "2K": { "1:1": "2048x2048", "3:4": "1536x2048", "4:3": "2048x1536", "9:16": "1152x2048", "16:9": "2048x1152", "2:5": "1280x3200", "5:2": "3200x1280", "3:2": "2048x1360", "2:3": "1360x2048", "AUTO": "2048x2048" },
  "4K": { "1:1": "2880x2880", "3:4": "2480x3312", "4:3": "3312x2480", "9:16": "2160x3840", "16:9": "3840x2160", "2:5": "1536x3840", "5:2": "3840x1536", "3:2": "3520x2352", "2:3": "2352x3520", "AUTO": "2880x2880" },
};

const estimateGptImagePrice = (
  size: ImageSize,
  ratio: AspectRatio,
  quality: GptImageQuality
) => {
  const dimensions = GPT_SIZE_TABLE[size]?.[ratio] || GPT_SIZE_TABLE[size]["1:1"];
  const [width, height] = dimensions.split("x").map(Number);
  const longEdge = Math.max(width, height);
  const shortEdge = Math.min(width, height);
  const qualityAxis = quality === "low" ? 16 : quality === "medium" ? 48 : 96;
  const shortAxis = Math.max(1, Math.floor(qualityAxis * shortEdge / longEdge));
  const areaMultiplier = (2_000_000 + width * height) / 4_000_000;
  const outputTokens = Math.ceil(qualityAxis * shortAxis * areaMultiplier);
  const usd = outputTokens * 30 / 1_000_000;
  return { usd, cny: usd * USD_TO_CNY };
};

const MODELS: { id: ImageModel; name: string; version: string; desc: string }[] = [
  { id: "gemini-2.5-flash-image", name: "FLASH", version: "2.5", desc: "BALANCED" },
  { id: "gemini-3.1-flash-image-preview", name: "FLASH", version: "3.1", desc: "HIGH FIDELITY" },
  { id: "gemini-3-pro-image-preview", name: "PRO", version: "3.0", desc: "CINEMA GRADE" },
  { id: "gpt-image-2", name: "GPT IMAGE", version: "2", desc: "LINKAI" },
];

const MATERIAL_SLOTS: Array<{ key: CategoryBaseSlotKey; type: AssetType; label: string; caption: string; icon: React.ElementType; color: string }> = [
  { key: 'visualSystem', type: 'visual_system', label: 'VI视觉', caption: '色调 · 字体 · 品牌基调', icon: Palette, color: 'text-orange-400' },
  { key: 'scene', type: 'scene', label: '场景', caption: '环境 · 光线 · 氛围配色', icon: Mountain, color: 'text-blue-400' },
  { key: 'material', type: 'material', label: '材质', caption: '产品结构 · 纹理 · 工艺', icon: Layers3, color: 'text-violet-400' },
  { key: 'model', type: 'model', label: '模特', caption: '需要人物时按需启用', icon: UserRound, color: 'text-emerald-400' },
  { key: 'copyLayout', type: 'copy_layout', label: '文案排版', caption: '字体 · 位置 · 内容方向', icon: Type, color: 'text-fuchsia-400' },
];

export const GenerationBar = forwardRef<GenerationBarRef, GenerationBarProps>(({ onGenerate, hasApiKey, onOpenApiKey }, ref) => {
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("1:1");
  const [imageSize, setImageSize] = useState<ImageSize>("1K");
  const [model, setModel] = useState<ImageModel>("gemini-3.1-flash-image-preview");
  const [gptQuality, setGptQuality] = useState<GptImageQuality>(() => {
    const saved = localStorage.getItem("user_openai_image_quality");
    return saved === "medium" || saved === "high" ? saved : "low";
  });
  const [showOptions, setShowOptions] = useState(false);
  const [images, setImages] = useState<{ data: string; mimeType: string; preview: string; width?: number; height?: number; sourceNodeId?: string; originalBytes?: number; analysisBytes?: number }[]>([]);
  const availableAspectRatios = model === "gpt-image-2" ? GPT_ASPECT_RATIOS : GOOGLE_ASPECT_RATIOS;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const uploadUsageRef = useRef({ count: 0, originalBytes: 0, analysisBytes: 0 });
  const uploadQueueRef = useRef<Promise<void>>(Promise.resolve());
  const imageDataRef = useRef(new Set<string>());
  const submitLockRef = useRef(false);
  const submitUnlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isSubmitLocked, setIsSubmitLocked] = useState(false);
  const [categoryBases, setCategoryBases] = useState<CategoryBaseRecord[]>([]);
  const [productionMaterials, setProductionMaterials] = useState<ProductionMaterialSelection>({ overrides: {} });
  const [optionPage, setOptionPage] = useState<'model' | 'materials'>('model');
  const [openMaterialMenu, setOpenMaterialMenu] = useState<'base' | CategoryBaseSlotKey | null>(null);
  const [basesLoading, setBasesLoading] = useState(false);
  const [basesLoaded, setBasesLoaded] = useState(false);
  const [basesError, setBasesError] = useState('');
  const [assetsByType, setAssetsByType] = useState<Record<AssetType, AssetRecord[]>>({
    visual_system: [], scene: [], material: [], model: [], copy_layout: [],
  });

  useEffect(() => () => {
    if (submitUnlockTimerRef.current) clearTimeout(submitUnlockTimerRef.current);
  }, []);

  useLayoutEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [prompt]);

  useEffect(() => {
    const lookupId = imageSize === "512px" ? "0.5K" : imageSize;
    if (!MODEL_COSTS[model].resolutions[lookupId]) {
      const available = Object.keys(MODEL_COSTS[model].resolutions);
      if (available.length > 0) {
        const first = available[0];
        setImageSize(first === "0.5K" ? "512px" : first as ImageSize);
      }
    }
  }, [model]);

  useEffect(() => {
    if (!availableAspectRatios.includes(aspectRatio)) {
      setAspectRatio("1:1");
    }
  }, [model, aspectRatio]);

  useEffect(() => {
    localStorage.setItem("user_openai_image_quality", gptQuality);
  }, [gptQuality]);

  useEffect(() => {
    if (!showOptions || basesLoaded || basesLoading) return;
    setBasesLoading(true);
    setBasesError('');
    Promise.all([
      fetch('/api/category-bases?page=1&pageSize=100&status=active'),
      ...MATERIAL_SLOTS.map(slot => fetch(`/api/assets?type=${slot.type}&page=1&pageSize=100&status=active`)),
    ])
      .then(async responses => Promise.all(responses.map(async response => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || '生产资料加载失败');
        return payload as PaginatedAssetResult<CategoryBaseRecord | AssetRecord>;
      })))
      .then(([baseResult, ...assetResults]) => {
        setCategoryBases(baseResult.items as CategoryBaseRecord[]);
        setAssetsByType(Object.fromEntries(MATERIAL_SLOTS.map((slot, index) => [slot.type, assetResults[index].items])) as Record<AssetType, AssetRecord[]>);
        setBasesLoaded(true);
      })
      .catch(error => setBasesError(error instanceof Error ? error.message : '生产资料加载失败'))
      .finally(() => setBasesLoading(false));
  }, [showOptions, basesLoaded, basesLoading]);

  const selectCategoryBase = (record: CategoryBaseRecord | null) => {
    setOpenMaterialMenu(null);
    if (!record) {
      setProductionMaterials(current => ({ overrides: current.overrides }));
      return;
    }
    setProductionMaterials({ base: { id: record.base.id, versionId: record.version.id, name: record.base.name, version: record.version.version }, overrides: {} });
    const defaults = record.version.defaults;
    if (MODELS.some(item => item.id === defaults.modelId)) setModel(defaults.modelId as ImageModel);
    if (IMAGE_SIZES.some(item => item.id === defaults.imageSize)) setImageSize(defaults.imageSize as ImageSize);
    const nextModel = MODELS.some(item => item.id === defaults.modelId) ? defaults.modelId as ImageModel : model;
    const compatibleRatios = nextModel === 'gpt-image-2' ? GPT_ASPECT_RATIOS : GOOGLE_ASPECT_RATIOS;
    if (compatibleRatios.includes(defaults.aspectRatio as AspectRatio)) setAspectRatio(defaults.aspectRatio as AspectRatio);
  };

  const selectMaterial = (key: CategoryBaseSlotKey, record: AssetRecord | null) => {
    const selected: SelectedAssetMaterial | null = record ? {
      assetId: record.asset.id,
      versionId: record.version.id,
      name: record.asset.name,
      version: record.version.version,
      type: record.asset.type,
    } : null;
    setProductionMaterials(current => ({ ...current, overrides: { ...current.overrides, [key]: selected } }));
    setOpenMaterialMenu(null);
  };

  const assetLookup = new Map(Object.values(assetsByType).flat().map(record => [record.asset.id, record]));
  const selectedBaseRecord = categoryBases.find(record => record.base.id === productionMaterials.base?.id && record.version.id === productionMaterials.base.versionId);
  const resolveMaterial = (key: CategoryBaseSlotKey): SelectedAssetMaterial | null | undefined => {
    if (Object.prototype.hasOwnProperty.call(productionMaterials.overrides, key)) return productionMaterials.overrides[key];
    const reference = selectedBaseRecord?.version.components[key];
    if (!reference) return undefined;
    const record = assetLookup.get(reference.assetId);
    return record ? {
      assetId: reference.assetId, versionId: reference.versionId, version: reference.version,
      name: record.asset.name, type: record.asset.type,
    } : undefined;
  };

  useImperativeHandle(ref, () => ({
    addImage: (data, mimeType, preview, sourceNodeId, usage) => {
      uploadQueueRef.current = uploadQueueRef.current.then(async () => {
        if (imageDataRef.current.has(data)) return;
        const bytes = Math.ceil(data.length * 3 / 4);
        const originalBytes = usage?.originalBytes ?? bytes;
        const analysisBytes = usage?.analysisBytes ?? bytes;
        try {
          assertImageUsage(uploadUsageRef.current, { count: 1, originalBytes, analysisBytes });
        } catch (error) {
          alert((error as Error).message);
          return;
        }
        uploadUsageRef.current = {
          count: uploadUsageRef.current.count + 1,
          originalBytes: uploadUsageRef.current.originalBytes + originalBytes,
          analysisBytes: uploadUsageRef.current.analysisBytes + analysisBytes,
        };
        imageDataRef.current.add(data);
        // Try to get dimensions
        const img = new Image();
        img.onload = () => {
          setImages(current => current.map(item => 
            item.data === data ? { ...item, width: img.width, height: img.height } : item
          ));
        };
        img.src = preview;
        
        setImages(prev => [...prev, { data, mimeType, preview, sourceNodeId, originalBytes, analysisBytes }]);
      });
    },
    setParams: (p, ar, is, m, imgs, selectedMaterials) => {
      setPrompt(p);
      setAspectRatio(ar);
      setImageSize(is);
      setModel(m);
      setProductionMaterials(selectedMaterials || { overrides: {} });
      if (imgs) {
        uploadQueueRef.current = uploadQueueRef.current.then(async () => {
        const next = imgs.map(img => {
          const bytes = Math.ceil(img.data.length * 3 / 4);
          return { ...img, originalBytes: bytes, analysisBytes: bytes };
        });
        const usage = next.reduce((sum, image) => ({ count: sum.count + 1, originalBytes: sum.originalBytes + image.originalBytes, analysisBytes: sum.analysisBytes + image.analysisBytes }), { count: 0, originalBytes: 0, analysisBytes: 0 });
        try {
          assertImageUsage({}, usage);
          uploadUsageRef.current = usage;
          imageDataRef.current = new Set(next.map(image => image.data));
          setImages(next);
        } catch (error) { alert((error as Error).message); }
        });
      }
      setShowOptions(true);
    }
  }));

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    uploadQueueRef.current = uploadQueueRef.current.then(async () => {
      try {
        const processed = await processImageFiles(files, uploadUsageRef.current);
        uploadUsageRef.current = processed.reduce((usage, image) => ({ count: usage.count + 1, originalBytes: usage.originalBytes + image.originalBytes, analysisBytes: usage.analysisBytes + image.analysisBytes }), uploadUsageRef.current);
        processed.forEach(image => imageDataRef.current.add(image.originalData));
        setImages(prev => [...prev, ...processed.map(image => ({
        data: image.originalData,
        mimeType: image.originalMimeType,
        preview: image.originalDataUrl,
        width: image.width,
        height: image.height,
        originalBytes: image.originalBytes,
        analysisBytes: image.analysisBytes,
      }))]);
        setShowOptions(true);
      } catch (error) { alert((error as Error).message); }
    });
    await uploadQueueRef.current;
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeImage = (index: number) => {
    setImages(prev => {
      const removed = prev[index];
      if (removed) uploadUsageRef.current = {
        count: Math.max(0, uploadUsageRef.current.count - 1),
        originalBytes: Math.max(0, uploadUsageRef.current.originalBytes - (removed.originalBytes || 0)),
        analysisBytes: Math.max(0, uploadUsageRef.current.analysisBytes - (removed.analysisBytes || 0)),
      };
      if (removed) imageDataRef.current.delete(removed.data);
      return prev.filter((_, i) => i !== index);
    });
  };

  /*
  const getClosestAspectRatio = (width: number, height: number): AspectRatio => {
    const ratio = width / height;
    const targets: { ratio: number; value: AspectRatio }[] = [
      { ratio: 1, value: "1:1" },
      { ratio: 3/4, value: "3:4" },
      { ratio: 4/3, value: "4:3" },
      { ratio: 9/16, value: "9:16" },
      { ratio: 16/9, value: "16:9" },
      { ratio: 21/9, value: "21:9" },
      { ratio: 4/5, value: "4:5" },
      { ratio: 5/4, value: "5:4" },
      { ratio: 1/4, value: "1:4" },
      { ratio: 4/1, value: "4:1" },
      { ratio: 1/8, value: "1:8" },
      { ratio: 8/1, value: "8:1" },
      { ratio: 2/5, value: "2:5" },
      { ratio: 5/2, value: "5:2" },
      { ratio: 3/2, value: "3:2" },
      { ratio: 2/3, value: "2:3" },
    ];
    
    const compatibleTargets = targets.filter(target => availableAspectRatios.includes(target.value));
    return compatibleTargets.reduce((prev, curr) =>
      Math.abs(curr.ratio - ratio) < Math.abs(prev.ratio - ratio) ? curr : prev
    ).value;
  };
  */

  const getClosestAspectRatio = (ratio: number): AspectRatio => {
    const targets: { ratio: number; value: AspectRatio }[] = [
      { ratio: 1, value: "1:1" },
      { ratio: 3/4, value: "3:4" },
      { ratio: 4/3, value: "4:3" },
      { ratio: 9/16, value: "9:16" },
      { ratio: 16/9, value: "16:9" },
      { ratio: 21/9, value: "21:9" },
      { ratio: 4/5, value: "4:5" },
      { ratio: 5/4, value: "5:4" },
      { ratio: 1/4, value: "1:4" },
      { ratio: 4/1, value: "4:1" },
      { ratio: 1/8, value: "1:8" },
      { ratio: 8/1, value: "8:1" },
      { ratio: 2/5, value: "2:5" },
      { ratio: 5/2, value: "5:2" },
      { ratio: 3/2, value: "3:2" },
      { ratio: 2/3, value: "2:3" },
    ];
    
    return targets.reduce((prev, curr) => 
      Math.abs(curr.ratio - ratio) < Math.abs(prev.ratio - ratio) ? curr : prev
    ).value;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || submitLockRef.current) return;
    submitLockRef.current = true;
    setIsSubmitLocked(true);
    submitUnlockTimerRef.current = setTimeout(() => {
      submitLockRef.current = false;
      setIsSubmitLocked(false);
      submitUnlockTimerRef.current = null;
    }, 800);
    
    let finalAspectRatio = aspectRatio;
    let finalImageSize = imageSize;

    if (aspectRatio === "AUTO") {
      // 1. Check for explicit dimensions in prompt (e.g., "1024x1024", "1920*1080")
      const dimMatch = prompt.match(/(\d+)\s*[x*]\s*(\d+)/);
      if (dimMatch) {
        const w = parseInt(dimMatch[1]);
        const h = parseInt(dimMatch[2]);
        
        // Update size based on max dimension
        const maxDim = Math.max(w, h);
        if (maxDim <= 768) finalImageSize = "512px";
        else if (maxDim <= 1536) finalImageSize = "1K";
        else if (maxDim <= 3072) finalImageSize = "2K";
        else finalImageSize = "4K";

        finalAspectRatio = getClosestAspectRatio(w / h);
      } else {
        // 2. Check for explicit ratio in prompt (e.g., "16:9", "4:3")
        const ratioMatch = prompt.match(/(1:1|21:9|16:9|9:16|4:3|3:4|4:5|5:4|2:5|5:2|3:2|2:3|1:4|4:1|1:8|8:1)/);
        if (ratioMatch && availableAspectRatios.includes(ratioMatch[1] as AspectRatio)) {
          finalAspectRatio = ratioMatch[1] as AspectRatio;
        } else {
          // 3. Check for image references in prompt (e.g., "Image 1", "图1")
          const imageRefMatch = prompt.match(/(?:Image|图)\s*(\d+)/i);
          if (imageRefMatch) {
            const index = parseInt(imageRefMatch[1]) - 1;
            if (images[index] && images[index].width && images[index].height) {
              const ratio = images[index].width! / images[index].height!;
              finalAspectRatio = getClosestAspectRatio(ratio);
              
              // Also update size based on reference image
              const maxDim = Math.max(images[index].width!, images[index].height!);
              if (maxDim <= 768) finalImageSize = "512px";
              else if (maxDim <= 1536) finalImageSize = "1K";
              else if (maxDim <= 3072) finalImageSize = "2K";
              else finalImageSize = "4K";
            }
          } else if (images.length > 0) {
            // 4. Default to first image if no specific reference
            const firstImg = images[0];
            if (firstImg.width && firstImg.height) {
              const ratio = firstImg.width / firstImg.height;
              finalAspectRatio = getClosestAspectRatio(ratio);
            }
          }
        }
      }
    }
    
    onGenerate(prompt, finalAspectRatio, finalImageSize, model, images.map(img => ({ 
      data: img.data, 
      mimeType: img.mimeType,
      sourceNodeId: img.sourceNodeId
    })), undefined, (productionMaterials.base || Object.keys(productionMaterials.overrides).length) ? productionMaterials : undefined);
    setPrompt('');
    setImages([]);
    uploadUsageRef.current = { count: 0, originalBytes: 0, analysisBytes: 0 };
    imageDataRef.current.clear();
    // Auto collapse options after sending
    setShowOptions(false);
  };

  const calculatePrice = (mId: ImageModel, sId: ImageSize) => {
    if (mId === "gpt-image-2") {
      const estimated = estimateGptImagePrice(sId, aspectRatio, gptQuality);
      return `¥${estimated.cny.toFixed(2)}`;
    }
    const estimated = estimateGoogleImagePrice(mId, sId, prompt, images.length);
    return `¥${estimated.cny.toFixed(2)}`;
  };

  return (
    <div className="absolute bottom-5 left-1/2 -translate-x-1/2 w-full max-w-[660px] px-3 z-50">
      <AnimatePresence>
        {images.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="flex flex-wrap gap-2 mb-2 p-2 bg-[#1a1a1a]/90 backdrop-blur-xl border border-[#333] rounded-xl"
          >
            {images.map((img, index) => (
              <div key={index} className="relative group w-16 h-16 rounded-lg overflow-hidden border border-[#444]">
                <img src={img.preview} alt="preview" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeImage(index)}
                  className="absolute top-0.5 right-0.5 p-0.5 bg-black/60 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      
      <div className="bg-[#1a1a1a]/94 backdrop-blur-xl border border-[#333] rounded-xl p-1.5 shadow-2xl">
        <form onSubmit={handleSubmit} className="flex flex-col">
          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              multiple
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-3 hover:bg-[#333] rounded-xl text-gray-400 transition-colors"
            >
              <ImageIcon size={20} />
            </button>

            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                if (e.target.value.trim() && !showOptions) {
                  setShowOptions(true);
                }
              }}
              onFocus={() => {
                if (!showOptions) setShowOptions(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (prompt.trim()) {
                    handleSubmit(e as unknown as React.FormEvent);
                  }
                }
              }}
              placeholder="请输入你想生成的画面描述..."
              className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-gray-200 placeholder-gray-500 py-3 resize-none max-h-[300px] min-h-[44px] overflow-y-auto"
              rows={1}
            />

            <div className="flex items-center gap-1 px-2 border-l border-[#333]">
              <button
                type="button"
                onClick={() => setShowOptions(!showOptions)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                  showOptions ? "bg-red-600 text-white" : "hover:bg-[#333] text-gray-400"
                )}
              >
                参数设置
                <ChevronDown size={12} className={cn("transition-transform", showOptions && "rotate-180")} />
              </button>

              {!hasApiKey ? (
                <button
                  type="button"
                  onClick={onOpenApiKey}
                  className="p-2 bg-yellow-500/20 text-yellow-500 rounded-xl hover:bg-yellow-500/30 transition-colors flex items-center gap-2 px-4"
                >
                  <Key size={18} />
                  <span className="text-xs font-bold whitespace-nowrap">API Key</span>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!prompt.trim() || isSubmitLocked}
                  className={cn(
                    "p-2 rounded-xl transition-all flex items-center justify-center min-w-[44px]",
                    !prompt.trim() || isSubmitLocked
                      ? "bg-[#333] text-gray-600 cursor-not-allowed" 
                      : "bg-red-600 text-white hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(220,38,38,0.3)]"
                  )}
                >
                  <Send size={20} />
                </button>
              )}
            </div>
          </div>

          <AnimatePresence>
            {showOptions && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
              >
                <div className="pt-2 pb-0.5 border-t border-[#333] mt-1.5 space-y-2.5 max-h-[44vh] overflow-y-auto overscroll-contain pr-1">
                  <div className="grid grid-cols-2 gap-1 rounded-lg bg-[#111] p-1">
                    <button type="button" onClick={() => setOptionPage('model')} className={cn('flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[10px] font-black transition', optionPage === 'model' ? 'bg-white text-black' : 'text-gray-500 hover:text-white')}><SlidersHorizontal size={12} />模型参数</button>
                    <button type="button" onClick={() => setOptionPage('materials')} className={cn('flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[10px] font-black transition', optionPage === 'materials' ? 'bg-white text-black' : 'text-gray-500 hover:text-white')}><Library size={12} />生产资料</button>
                  </div>

                  {optionPage === 'materials' && (
                    <div className="space-y-2.5">
                      <MaterialPicker
                        label="类目基座" caption="一键带出整套生产资料" icon={Boxes} color="text-orange-400"
                        selected={productionMaterials.base ? `${productionMaterials.base.name} · V${productionMaterials.base.version}` : undefined}
                        open={openMaterialMenu === 'base'} onToggle={() => setOpenMaterialMenu(value => value === 'base' ? null : 'base')}
                        onClear={() => selectCategoryBase(null)}
                      >
                        {categoryBases.map(record => <PickerOption key={record.base.id} title={record.base.name} meta={`${record.base.category || '未分类'} · V${record.version.version}`} onClick={() => selectCategoryBase(record)} />)}
                      </MaterialPicker>
                      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                        {MATERIAL_SLOTS.map(slot => {
                          const selected = resolveMaterial(slot.key);
                          return (
                            <MaterialPicker
                              key={slot.key} label={slot.label} caption={slot.caption} icon={slot.icon} color={slot.color}
                              selected={selected ? `${selected.name} · V${selected.version}` : undefined}
                              open={openMaterialMenu === slot.key} onToggle={() => setOpenMaterialMenu(value => value === slot.key ? null : slot.key)}
                              onClear={() => selectMaterial(slot.key, null)} compact
                            >
                              {assetsByType[slot.type].map(record => <PickerOption key={record.asset.id} title={record.asset.name} meta={`${record.asset.category || '未分类'} · V${record.version.version}`} onClick={() => selectMaterial(slot.key, record)} />)}
                            </MaterialPicker>
                          );
                        })}
                      </div>
                      {basesLoading && <div className="flex items-center gap-2 px-1 text-[9px] text-gray-500"><Loader2 size={11} className="animate-spin" />正在读取生产资料</div>}
                      {basesError && <div className="px-1 text-[9px] text-red-400">{basesError}</div>}
                      <div className="rounded-lg border border-[#303030] bg-[#151515] px-2.5 py-2 text-[8px] leading-4 text-gray-500">基座负责默认组合；单独选择的资料会覆盖对应槽位。未选择任何资料时，保持原生图逻辑不变。</div>
                    </div>
                  )}

                  {optionPage === 'model' && <>

                  {/* Engine Selection */}
                  <div>
                    <div className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1 px-1">渲染引擎 / ENGINE</div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {MODELS.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setModel(m.id)}
                          className={cn(
                            "flex flex-col items-start px-2.5 py-1.5 rounded-lg transition-all text-left relative overflow-hidden min-h-[56px]",
                            model === m.id 
                              ? "bg-white text-black shadow-[0_6px_18px_rgba(255,255,255,0.08)] ring-1 ring-white/70"
                              : "bg-[#222] text-gray-400 hover:bg-[#2a2a2a]"
                          )}
                        >
                          <div className="text-xs font-black tracking-tight leading-tight">{m.name} {m.version}</div>
                          <div className="text-[7px] font-bold opacity-60 mb-1 uppercase tracking-wider">{m.desc}</div>
                          <div className={cn(
                            "text-[10px] font-bold",
                            model === m.id ? "text-red-600" : "text-red-500"
                          )}>{calculatePrice(m.id, imageSize)}/图</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {model === "gpt-image-2" && (
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="text-[9px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap px-1">
                        GPT 精细度
                      </div>
                      <div className="grid grid-cols-3 gap-1.5 flex-1">
                        {GPT_QUALITY_OPTIONS.map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => setGptQuality(option.id)}
                            className={cn(
                              "flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg transition-all text-left min-h-[34px]",
                              gptQuality === option.id
                                ? "bg-white text-black ring-1 ring-white/70"
                                : "bg-[#222] text-gray-400 hover:bg-[#2a2a2a]"
                            )}
                        >
                          <span className="text-[11px] font-black whitespace-nowrap">{option.label}</span>
                          <span className={cn(
                            "text-[8px] font-black whitespace-nowrap",
                            gptQuality === option.id ? "text-red-600" : "text-red-500"
                          )}>
                            ¥{estimateGptImagePrice(imageSize, aspectRatio, option.id).cny.toFixed(2)}
                          </span>
                        </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Resolution Selection */}
                  <div>
                    <div className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1 px-1">渲染精度 / RESOLUTION</div>
                    <div className="flex flex-wrap gap-1.5">
                      {IMAGE_SIZES.filter(size => {
                        const lookupId = size.id === "512px" ? "0.5K" : size.id;
                        return !!MODEL_COSTS[model].resolutions[lookupId];
                      }).map((size) => (
                        <button
                          key={size.id}
                          type="button"
                          onClick={() => setImageSize(size.id)}
                          className={cn(
                            "flex items-baseline gap-1 px-3 py-1.5 rounded-lg transition-all",
                            imageSize === size.id 
                              ? "bg-white text-black ring-1 ring-white/70"
                              : "bg-[#222] text-gray-400 hover:bg-[#2a2a2a]"
                          )}
                        >
                          <span className="text-xs font-black">{size.label}</span>
                          <span className="text-[8px] font-bold opacity-60">{calculatePrice(model, size.id)}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Aspect Ratio Selection */}
                  <div>
                    <div className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1 px-1">构图比例 / ASPECT RATIO</div>
                    <div className="flex flex-wrap gap-1.5">
                      {availableAspectRatios.map((ratio) => (
                        <button
                          key={ratio}
                          type="button"
                          onClick={() => setAspectRatio(ratio)}
                          className={cn(
                            "px-3 py-1.5 rounded-lg text-xs font-black transition-all",
                            aspectRatio === ratio 
                              ? "bg-white text-black ring-1 ring-white/70"
                              : "bg-[#222] text-gray-400 hover:bg-[#2a2a2a]"
                          )}
                        >
                          {ratio}
                        </button>
                      ))}
                    </div>
                  </div>
                  </>}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </form>
      </div>
    </div>
  );
});

GenerationBar.displayName = 'GenerationBar';

const MaterialPicker: React.FC<{
  label: string;
  caption: string;
  icon: React.ElementType;
  color: string;
  selected?: string;
  open: boolean;
  onToggle: () => void;
  onClear: () => void;
  compact?: boolean;
  children: React.ReactNode;
}> = ({ label, caption, icon: Icon, color, selected, open, onToggle, onClear, compact, children }) => (
  <div className="relative">
    <button type="button" onClick={onToggle} className={cn('flex w-full items-center gap-2 rounded-lg border px-2.5 text-left transition', compact ? 'min-h-[48px] py-1.5' : 'min-h-[44px] py-2', selected ? 'border-white/30 bg-[#252525]' : 'border-[#333] bg-[#202020] hover:bg-[#292929]')}>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#303030]"><Icon size={14} className={color} /></span>
      <span className="min-w-0 flex-1"><span className="block truncate text-[10px] font-black text-gray-100">{selected || label}</span><span className="block truncate text-[8px] text-gray-500">{selected ? `${label} · 固定版本` : caption}</span></span>
      <ChevronDown size={12} className={cn('shrink-0 text-gray-500 transition-transform', open && 'rotate-180')} />
    </button>
    {selected && <button type="button" onClick={event => { event.stopPropagation(); onClear(); }} className="absolute right-7 top-1/2 -translate-y-1/2 rounded p-1 text-gray-600 hover:bg-black/30 hover:text-white"><X size={10} /></button>}
    <AnimatePresence>{open && <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="absolute z-40 left-0 right-0 mt-1 max-h-44 overflow-y-auto rounded-lg border border-[#3b3b3b] bg-[#181818] p-1 shadow-2xl">{children}<button type="button" onClick={onClear} className="w-full rounded-md px-2.5 py-2 text-left text-[10px] text-gray-500 hover:bg-[#272727]">不使用此项</button></motion.div>}</AnimatePresence>
  </div>
);

const PickerOption: React.FC<{ title: string; meta: string; onClick: () => void }> = ({ title, meta, onClick }) => (
  <button type="button" onClick={onClick} className="flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left hover:bg-[#272727]"><span className="min-w-0"><span className="block truncate text-[10px] font-bold text-gray-100">{title}</span><span className="block truncate text-[8px] text-gray-500">{meta}</span></span></button>
);
