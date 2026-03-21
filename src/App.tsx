
import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { AppStep, VisualConstitution, ProductAnalysis, FinalPrompt, StrategyType, Storyboard, User, AuthState, RechargeLog, GenerationLog, SingleToolMode, ImageDeconstruction, ImageHistory, CameraParams, MODEL_COSTS } from './types/index';
import { decodeStyle, analyzeProduct, fusePrompts, generateEcomImage, /* regenerateSinglePrompt, */ deconstructImage, segmentImage, generate3DModel, generateDepthMap, generateThreeDImage } from './geminiService';
import { ReferenceMode } from './components/ReferenceMode';
import { ReplacementMode } from './components/ReplacementMode';
import { View3DMode } from './components/View3DMode';
import { ThreeDAngleMode } from './components/ThreeDAngleMode';
import { GenerationHistory } from './components/GenerationHistory';
import { AdminPanel } from './components/AdminPanel';
import { UserProfile } from './components/UserProfile';
import { StyleDecoder } from './components/StyleDecoder';
import { ProductStrategy } from './components/ProductStrategy';
import { PromptFusion } from './components/PromptFusion';

const BBOX_COLORS = [
  'border-blue-400 bg-blue-400/20',
  'border-emerald-400 bg-emerald-400/20',
  'border-rose-400 bg-rose-400/20',
  'border-amber-400 bg-amber-400/20',
  'border-violet-400 bg-violet-400/20',
];
const LABEL_COLORS = [
  'bg-blue-400',
  'bg-emerald-400',
  'bg-rose-400',
  'bg-amber-400',
  'bg-violet-400',
];

const App: React.FC = () => {
  const [step, setStep] = useState<AppStep>(AppStep.STYLE_DECODER);
  const [model, setModel] = useState('gemini-3-flash-preview');
  const [loading, setLoading] = useState(false);
  const [userApiKey, setUserApiKey] = useState<string>(() => {
    return localStorage.getItem('user_gemini_api_key') || process.env.GEMINI_API_KEY || '';
  });

  // Auth 状态
  const [auth, setAuth] = useState<AuthState>({ user: null, token: null, loading: true });
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // 管理后台状态
  const [adminUsers, setAdminUsers] = useState<User[]>([]);
  const [rechargeLogs, setRechargeLogs] = useState<RechargeLog[]>([]);
  const [generationLogs, setGenerationLogs] = useState<GenerationLog[]>([]);
  const [adminTab, setAdminTab] = useState<'users' | 'recharge' | 'stats'>('users');
  const [adminLoading, setAdminLoading] = useState(false);

  // 个人信息管理状态
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [profileMessage, setProfileMessage] = useState('');
  const [userRechargeLogs, setUserRechargeLogs] = useState<RechargeLog[]>([]);
  const [userGenLogs, setUserGenLogs] = useState<GenerationLog[]>([]);
  const [profileTab, setProfileTab] = useState<'password' | 'recharge' | 'stats'>('password');
  const [profileLoading, setProfileLoading] = useState(false);

  // 生图历史状态
  const [imageHistory, setImageHistory] = useState<ImageHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<Set<string>>(new Set());

  // 统计与筛选状态
  const [filterYear, setFilterYear] = useState<string>('');
  const [filterMonth, setFilterMonth] = useState<string>('');
  const [filterDay, setFilterDay] = useState<string>('');
  const [filterUser, setFilterUser] = useState<string>('all');

  const exportToExcel = (data: Record<string, string | number | boolean | null>[], fileName: string) => {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    XLSX.writeFile(wb, `${fileName}.xlsx`);
  };

  // 状态定义
  const [styleImage, setStyleImage] = useState<string | null>(null);
  const [constitution, setConstitution] = useState<VisualConstitution | null>(null);
  const [productImages, setProductImages] = useState<string[]>([]);
  const [sellingPoints, setSellingPoints] = useState('');
  const [allowedElements, setAllowedElements] = useState('');
  const [prohibitedElements, setProhibitedElements] = useState('');
  const [strategyType, setStrategyType] = useState<StrategyType>(StrategyType.DETAIL);
  const [analysis, setAnalysis] = useState<ProductAnalysis | null>(null);
  const [finalPrompts, setFinalPrompts] = useState<FinalPrompt[]>([]);
  const [globalSelectedFont, setGlobalSelectedFont] = useState<string>('');
  const [cardRefImages, setCardRefImages] = useState<Record<string, string>>({});
  const [cardGeneratedImages, setCardGeneratedImages] = useState<Record<string, string>>({});
  const [cardGenStatus, setCardGenStatus] = useState<Record<string, 'idle' | 'loading' | 'done' | 'error'>>({});
  const [activeGenCardId, setActiveGenCardId] = useState<string | null>(null);
  const [isBulkGenActive, setIsBulkGenActive] = useState(false);
  const [isBulkLoading, setIsBulkLoading] = useState(false);
  const [bulkRefImage, setBulkRefImage] = useState<string | null>(null);
  const [genModel, setGenModel] = useState('nanobanana2');
  const [genAspectRatio, setGenAspectRatio] = useState('1:1');
  const [genResolution, setGenResolution] = useState('1K');

  useEffect(() => {
    const availableResolutions = Object.keys(MODEL_COSTS[genModel as keyof typeof MODEL_COSTS].resolutions);
    if (!availableResolutions.includes(genResolution)) {
      setGenResolution(availableResolutions[0]);
    }
  }, [genModel]);

  const [compositionRefImage, setCompositionRefImage] = useState<string | null>(null);

  // 单图灵活工具状态
  const [singleToolMode, setSingleToolMode] = useState<SingleToolMode>(SingleToolMode.REFERENCE);
  const [singleRefImage, setSingleRefImage] = useState<string | null>(null);
  const [singleProductImage, setSingleProductImage] = useState<string | null>(null);
  const [deconstructionResult, setDeconstructionResult] = useState<ImageDeconstruction | null>(null);
  const [singleGeneratedImage, setSingleGeneratedImage] = useState<string | null>(null);
  const [isDeconstructing, setIsDeconstructing] = useState(false);
  const [isGeneratingSingle, setIsGeneratingSingle] = useState(false);
  const [editablePrompt, setEditablePrompt] = useState("");
  const [useRefImage, setUseRefImage] = useState(true);
  const [refStrength, setRefStrength] = useState(0.5);
  const [productKeywords, setProductKeywords] = useState("");

  // 3D 视角生图状态
  const [threeDProductImage, setThreeDProductImage] = useState<string | null>(null);
  const [isGenerating3D, setIsGenerating3D] = useState(false);
  const [threeDModelUrl, setThreeDModelUrl] = useState<string | null>(null);
  const [threeDCameraParams, setThreeDCameraParams] = useState<CameraParams | null>(null);

  // 3D 角度 (Perspective Warp) 状态
  const [threeDAngleImage, setThreeDAngleImage] = useState<string | null>(null);
  const [depthMap, setDepthMap] = useState<string | null>(null);
  const [isGeneratingDepth, setIsGeneratingDepth] = useState(false);
  const [isGeneratingThreeD, setIsGeneratingThreeD] = useState(false);
  const [threeDGeneratedImage, setThreeDGeneratedImage] = useState<string | null>(null);

  // 替换模式状态
  const [replacementBaseImage, setReplacementBaseImage] = useState<string | null>(null);
  const [segmentedObjects, setSegmentedObjects] = useState<SegmentedObject[]>([]);
  const [isSegmenting, setIsSegmenting] = useState(false);
  const [backgroundFidelity, setBackgroundFidelity] = useState(0.8);

  const cropImage = (imageB64: string, bbox: [number, number, number, number]): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(imageB64);
          return;
        }
        // bbox is [x, y, width, height] in 0-1000 scale
        const x = (bbox[0] / 1000) * img.width;
        const y = (bbox[1] / 1000) * img.height;
        const w = (bbox[2] / 1000) * img.width;
        const h = (bbox[3] / 1000) * img.height;

        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = imageB64;
    });
  };

  const PLACEMENT_OPTIONS = [
    "左侧留白 (Left Margin)",
    "右侧留白 (Right Margin)",
    "顶部留白 (Top Margin)",
    "底部留白 (Bottom Margin)",
    "居中 (Centered)",
    "对角线留白 (Diagonal Margin)",
    "左上角留白 (Top-Left Margin)",
    "右上角留白 (Top-Right Margin)",
    "左下角留白 (Bottom-Left Margin)",
    "右下角留白 (Bottom-Right Margin)"
  ];

  // 原图预览状态
  const [hoveredPreviewImage, setHoveredPreviewImage] = useState<{ url: string, title: string } | null>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const user = await res.json();
        setAuth({ user, token: 'session', loading: false });
      } else {
        setAuth({ user: null, token: null, loading: false });
      }
    } catch (err) {
      console.error(err);
      setAuth({ user: null, token: null, loading: false });
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (res.ok) {
        setAuth({ user: data.user, token: data.token, loading: false });
      } else {
        setAuthError(data.message);
      }
    } catch (err) {
      console.error(err);
      setAuthError('登录失败，请重试');
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (res.ok) {
        alert('注册成功，请登录');
        setAuthMode('login');
      } else {
        setAuthError(data.message);
      }
    } catch (err) {
      console.error(err);
      setAuthError('注册失败，请重试');
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setAuth({ user: null, token: null, loading: false });
    setStep(AppStep.STYLE_DECODER);
  };

  const fetchAdminUsers = async () => {
    setAdminLoading(true);
    try {
      const res = await fetch('/api/admin/users');
      if (res.ok) {
        const users = await res.json();
        setAdminUsers(users);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setAdminLoading(false);
    }
  };

  const fetchRechargeLogs = async () => {
    setAdminLoading(true);
    try {
      const res = await fetch('/api/admin/recharge-logs');
      if (res.ok) {
        const logs = await res.json();
        setRechargeLogs(logs);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setAdminLoading(false);
    }
  };

  const fetchGenerationLogs = async () => {
    setAdminLoading(true);
    try {
      const res = await fetch('/api/admin/generation-logs');
      if (res.ok) {
        const logs = await res.json();
        setGenerationLogs(logs);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setAdminLoading(false);
    }
  };

  const updateCredits = async (userId: string, credits: number) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}/credits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credits })
      });
      if (res.ok) {
        fetchAdminUsers();
      }
    } catch (err) {
      console.error(err);
      alert('更新失败');
    }
  };

  const updateRole = async (userId: string, role: string) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role })
      });
      if (res.ok) {
        fetchAdminUsers();
      }
    } catch (err) {
      console.error(err);
      alert('更新失败');
    }
  };

  const handleResetPassword = async (userId: string, username: string) => {
    if (!confirm(`确定要将用户 ${username} 的密码重置为 123456 吗？`)) return;
    try {
      const res = await fetch(`/api/admin/users/${userId}/reset-password`, {
        method: 'POST'
      });
      const data = await res.json();
      alert(data.message);
    } catch (err) {
      console.error(err);
      alert('重置失败');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMessage('');
    try {
      const res = await fetch('/api/user/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword, newPassword })
      });
      const data = await res.json();
      if (res.ok) {
        setProfileMessage('密码修改成功');
        setOldPassword('');
        setNewPassword('');
      } else {
        setProfileMessage(data.message);
      }
    } catch (err) {
      console.error(err);
      setProfileMessage('修改失败，请重试');
    }
  };

  const deductCredit = async (amount: number = 1) => {
    try {
      const res = await fetch('/api/user/deduct-credit', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount })
      });
      if (res.ok) {
        const data = await res.json();
        setAuth(prev => ({ ...prev, user: prev.user ? { ...prev.user, credits: data.credits } : null }));
        return true;
      } else {
        const data = await res.json();
        alert(data.message || '点数不足');
        return false;
      }
    } catch (err) {
      console.error(err);
      return false;
    }
  };

  useEffect(() => {
    if (analysis?.global_font_options && analysis.global_font_options.length > 0) {
      setGlobalSelectedFont(analysis.global_font_options[0]);
    }
  }, [analysis]);

  // 文件处理函数
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, setter: (val: string) => void) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setter(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleMultipleFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      Array.from(files).forEach((file: File) => {
        const reader = new FileReader();
        reader.onloadend = () => setProductImages(prev => [...prev, reader.result as string]);
        reader.readAsDataURL(file);
      });
    }
  };

  const handleCardRefImage = (e: React.ChangeEvent<HTMLInputElement>, cardId: string) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setCardRefImages(prev => ({ ...prev, [cardId]: reader.result as string }));
      reader.readAsDataURL(file);
    }
  };

  // 强化全案批量同步逻辑
  const handleBulkRefImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const b64 = reader.result as string;
        setBulkRefImage(b64);
        
        // 核心同步逻辑：将全案参考图同步到每一个分镜卡片
        const newCardRefs = { ...cardRefImages };
        finalPrompts.forEach(p => {
          newCardRefs[p.id] = b64;
        });
        setCardRefImages(newCardRefs);
      };
      reader.readAsDataURL(file);
    }
  };

  const updatePromptPlacement = (id: string, newPlacement: string) => {
    setFinalPrompts(prev => prev.map(p => p.id === id ? { ...p, placement: newPlacement } : p));
  };

  const updatePromptCopy = (id: string, newCopy: string) => {
    setFinalPrompts(prev => prev.map(p => p.id === id ? { ...p, copy: newCopy } : p));
  };

  /* const updateFinalPrompt = (id: string, newPrompt: string) => {
    setFinalPrompts(prev => prev.map(p => p.id === id ? { ...p, prompt: newPrompt } : p));
  }; */

  const downloadImage = (dataUrl: string, title: string) => {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `${title}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const copyToClipboard = (text: string, msg: string = "已复制到剪贴板") => {
    navigator.clipboard.writeText(text);
    alert(msg);
  };

  // 复制单个卡片全案详情
  /* const copyFullCardInfo = (p: FinalPrompt) => {
    const fullText = `
【视觉架构方案详情 - ${p.title}】
模式：${strategyType === StrategyType.DETAIL ? '详情分镜' : '主图方案'}
策划构思：${p.concept}
核心文案：${p.copy}
排版布局：${p.placement} (建议字号: ${p.font_size})
全局字体：${globalSelectedFont}
AI 生图提示词 (PROMPT)：
${p.prompt}
    `.trim();
    copyToClipboard(fullText, `【${p.title}】方案详情已复制`);
  }; */

  // 一键复制全案方案（汇总全部 6 个分镜）
  const copyAllPlanInfo = () => {
    if (finalPrompts.length === 0) return;
    
    let allPlanText = `【BANFULY · 电商视觉架构师 - ${strategyType === StrategyType.DETAIL ? '详情全案' : '主图全案'}方案汇总】\n`;
    allPlanText += `项目全局选定字体：${globalSelectedFont}\n`;
    allPlanText += `视觉前缀协议：${constitution?.prompt_prefix || '默认'}\n`;
    allPlanText += `------------------------------------------------\n\n`;

    finalPrompts.forEach((p, index) => {
      allPlanText += `[方案 0${index + 1}: ${p.title}]\n`;
      allPlanText += `● 营销构想：${p.concept}\n`;
      allPlanText += `● 核心文案：${p.copy}\n`;
      allPlanText += `● 排版建议：${p.placement} (${p.font_size})\n`;
      allPlanText += `● 生图指令：${p.prompt}\n\n`;
    });

    allPlanText += `------------------------------------------------\n报告生成于 BANFULY Visual LAB`;
    
    copyToClipboard(allPlanText, `全案 6 套${strategyType === StrategyType.DETAIL ? '生图' : '主图'}方案已汇总复制`);
  };

  const downloadAllImages = async () => {
    if (Object.keys(cardGeneratedImages).length === 0) {
      alert("暂无生成的图片可下载，请先执行渲染任务。");
      return;
    }

    for (const [cardId, dataUrl] of Object.entries(cardGeneratedImages)) {
      const card = finalPrompts.find(p => p.id === cardId);
      const title = card ? `${card.title.replace(/[\\/:*?"<>|]/g, '_')}` : `image-${cardId}`;
      
      try {
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `${title}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (e) {
        console.error("图片下载失败", e);
        alert(`图片下载失败: ${title}.png`);
      }
    }
    alert("所有图片已开始下载。");
  };

  const removeProductImage = (index: number) => setProductImages(prev => prev.filter((_, i) => i !== index));

  const updateStoryboard = (id: string, field: keyof Storyboard, value: string) => {
    setAnalysis(prev => {
        if (!prev) return null;
        return {
            ...prev,
            storyboards: prev.storyboards.map(sb =>
                sb.id === id ? { ...sb, [field]: value } : sb
            )
        };
    });
  };

  // 步骤执行函数
  const runStep1 = async () => {
    if (!styleImage) return;
    setLoading(true);
    try {
      const res = await decodeStyle(styleImage, model, userApiKey);
      setConstitution(res);
    } catch (err) {
      alert("分析风格失败: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const runStep2 = async () => {
    if (productImages.length === 0) return;
    setLoading(true);
    setAnalysis(null);
    const combinedInfo = `卖点:${sellingPoints}, 允许:${allowedElements}, 禁止:${prohibitedElements}`;
    try {
      const res = await analyzeProduct(productImages, combinedInfo, strategyType, model, compositionRefImage, userApiKey);
      setAnalysis({ ...res, selling_points: sellingPoints, allowed_elements: allowedElements, prohibited_elements: prohibitedElements });
      
      // 方案融合：将视觉风格与策划分镜结合，生成最终生图指令
      if (constitution) {
        const prompts = await fusePrompts(constitution, { ...res, selling_points: sellingPoints, allowed_elements: allowedElements, prohibited_elements: prohibitedElements }, model, userApiKey);
        
        // 新增：全案预览（6宫格）卡片
        const previewPrompt: FinalPrompt = {
          id: 'preview_grid',
          title: '全案预览 (6宫格)',
          concept: '汇总 6 个分镜的视觉特征，生成一张 2x3 的网格预览图，用于快速评估全案风格一致性。',
          prompt: prompts.map((p, i) => `[Panel ${i+1}: ${p.prompt}]`).join('\n'),
          copy: 'PREVIEW ALL',
          font_size: 'N/A',
          placement: 'Grid Layout',
          prominence: 'High'
        };
        
        setFinalPrompts([previewPrompt, ...prompts]);
      }
      
      setStep(AppStep.PROMPT_FUSION);
    } catch (err) {
      alert("分析失败: " + err.message);
    } finally {
      setLoading(false);
    }
  };



  // 生图指令算法
  const generateSingleImage = async (cardId: string, overrideRefImage?: string) => {
    const currentCard = finalPrompts.find(p => p.id === cardId);
    if (!currentCard || !constitution || !analysis) return;

    if (genModel === 'nanobanana pro' || model === 'gemini-3.1-pro-preview') {
      if (typeof window !== 'undefined' && window.aistudio) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        if (!hasKey) {
          alert("使用 Pro 3.0 模型需要选择您自己的付费 API Key。");
          await window.aistudio.openSelectKey();
          return;
        }
      }
    }

    setCardGenStatus(prev => ({ ...prev, [cardId]: 'loading' }));

    const isPreview = cardId === 'preview_grid';
    const prohibitedNotice = prohibitedElements 
      ? `【绝对禁止项】：严禁在画面中出现“${prohibitedElements}”。确保画面呈现极致无缝、平滑的工业质感。`
      : "保持画面专业极简，视觉纯净。";

    let assembledPrompt = '';
    
    if (isPreview) {
      assembledPrompt = `
        【BANFULY 视觉全案预览协议 - 6宫格】
        任务：生成一张包含 6 个不同场景的 2x3 网格图。
        视觉协议：${constitution.prompt_prefix}。风格：${constitution.style}。光影：${constitution.lighting}。
        物理规避：${prohibitedNotice}。
        产品特征：${analysis.physical_features}。
        
        网格内容描述：
        ${currentCard.prompt}
        
        要求：将上述 6 个场景以 2x3 的网格形式展示在同一张图中，每个格子展示一个场景。8k超清，商业大片质感。
      `.trim();
    } else {
      assembledPrompt = `
        【BANFULY 视觉渲染协议】
        模式：${strategyType === StrategyType.DETAIL ? '详情呈现' : '高点击率营销主图'}
        1. 核心文案：画面中【仅展示】文字内容："${currentCard.copy}"。
        2. 字体特征：匹配"${globalSelectedFont}"的视觉风格，展现高端感。
        3. 视觉协议：${constitution.prompt_prefix}。风格：${constitution.style}。光影：${constitution.lighting}。
        4. 物理规避：${prohibitedNotice}。
        5. 排版约束：在画面的【${currentCard.placement}】区域留白，用于后期排版。
        6. 产品特征：${analysis.physical_features}。场景意境：${currentCard.prompt}。
        要求：8k超清，商业大片质感。
      `.trim();
    }

    try {
      // 检查点数
      if (auth.user && auth.user.credits <= 0) {
        alert("您的生图点数已耗尽，请联系管理员充值。");
        return;
      }

      const res = await generateEcomImage({
        prompt: assembledPrompt,
        model: genModel,
        aspectRatio: genAspectRatio,
        imageSize: genResolution === '0.5K' ? '512px' : genResolution,
        refImageB64: overrideRefImage || cardRefImages[cardId],
        apiKey: userApiKey
      });
      if (res) {
        // 成功后扣除点数
        await deductCredit();
        // 保存到历史记录
        await saveToHistory(res, assembledPrompt);
        setCardGeneratedImages(prev => ({ ...prev, [cardId]: res }));
        setCardGenStatus(prev => ({ ...prev, [cardId]: 'done' }));
      } else {
        setCardGenStatus(prev => ({ ...prev, [cardId]: 'error' }));
      }
    } catch (err) {
      if (err?.message?.includes("Requested entity was not found") && typeof window !== 'undefined' && window.aistudio) {
        await window.aistudio.openSelectKey();
      }
      setCardGenStatus(prev => ({ ...prev, [cardId]: 'error' }));
    }
  };

  const executeImageGen = async () => {
    if (!activeGenCardId) return;
    const cardId = activeGenCardId;
    setActiveGenCardId(null);
    await generateSingleImage(cardId);
  };

  const executeBulkGen = async () => {
    setIsBulkGenActive(false);
    setIsBulkLoading(true);
    try {
      const tasks = finalPrompts.map(p => generateSingleImage(p.id));
      await Promise.all(tasks);
    } finally {
      setIsBulkLoading(false);
    }
  };

  /* const regeneratePrompt = async (cardId: string) => {
    const card = finalPrompts.find(p => p.id === cardId);
    if (!card || !constitution || !analysis) return;

    setCardGenStatus(prev => ({ ...prev, [cardId]: 'loading' }));
    try {
      const storyboard = analysis.storyboards.find(sb => sb.id === cardId);
      if (!storyboard) throw new Error('Storyboard not found');

      const newPrompt = await regenerateSinglePrompt(constitution, storyboard, analysis, model, userApiKey);
      setFinalPrompts(prev => prev.map(p => p.id === cardId ? { ...p, prompt: newPrompt } : p));
    } catch (err) {
      alert(`重新生成失败: ${err.message}`);
    } finally {
      setCardGenStatus(prev => ({ ...prev, [cardId]: 'idle' }));
    }
  }; */

  const activeStep = (sId: AppStep) => {
    if (sId === AppStep.ADMIN_PANEL) {
      fetchAdminUsers();
    }
    if (sId === AppStep.PROFILE) {
      fetchUserLogs();
    }
    if (sId === AppStep.HISTORY) {
      fetchHistory();
    }
    setStep(sId);
  };

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const endpoint = auth.user?.role === 'admin' ? '/api/admin/history' : '/api/user/history';
      const res = await fetch(endpoint);
      if (res.ok) {
        setImageHistory(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const saveToHistory = async (imageUrl: string, prompt: string) => {
    try {
      await fetch('/api/user/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl, prompt })
      });
    } catch (err) {
      console.error("保存历史失败", err);
    }
  };

  const deleteHistoryItem = async (id: string) => {
    if (!confirm("确定要删除这条历史记录吗？")) return;
    try {
      const res = await fetch(`/api/user/history/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setImageHistory(prev => prev.filter(h => h.id !== id));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const deleteSelectedHistory = async () => {
    if (selectedHistoryIds.size === 0) return;
    if (!confirm(`确定要删除选中的 ${selectedHistoryIds.size} 条记录吗？`)) return;
    
    try {
      const ids = Array.from(selectedHistoryIds);
      await Promise.all(ids.map(id => fetch(`/api/user/history/${id}`, { method: 'DELETE' })));
      setImageHistory(prev => prev.filter(h => !selectedHistoryIds.has(h.id)));
      setSelectedHistoryIds(new Set());
    } catch (err) {
      console.error(err);
      alert("部分删除失败");
    }
  };

  const downloadSelectedHistory = () => {
    if (selectedHistoryIds.size === 0) return;
    const selected = imageHistory.filter(h => selectedHistoryIds.has(h.id));
    selected.forEach((h, i) => {
      setTimeout(() => {
        downloadImage(h.imageUrl, `history-${h.id}`);
      }, i * 200);
    });
  };

  const toggleHistorySelection = (id: string) => {
    const newSelected = new Set(selectedHistoryIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedHistoryIds(newSelected);
  };

  const fetchUserLogs = async () => {
    setProfileLoading(true);
    try {
      const [rechargeRes, genRes] = await Promise.all([
        fetch('/api/user/recharge-logs'),
        fetch('/api/user/generation-logs')
      ]);
      if (rechargeRes.ok) setUserRechargeLogs(await rechargeRes.json());
      if (genRes.ok) setUserGenLogs(await genRes.json());
    } catch (err) {
      console.error(err);
    } finally {
      setProfileLoading(false);
    }
  };

  const activeGenCard = finalPrompts.find(p => p.id === activeGenCardId);

  const runSingleDeconstruction = async (base64: string) => {
    console.log("Starting single deconstruction with base64 length:", base64.length);
    if (!userApiKey) {
      console.warn("No API Key found");
      alert("请先配置 API Key");
      return;
    }
    setDeconstructionResult(null);
    setIsDeconstructing(true);
    try {
      console.log("Calling deconstructImage with model:", model);
      const result = await deconstructImage(base64, model, userApiKey);
      console.log("Deconstruction result received successfully:", result);
      setDeconstructionResult(result);
      setEditablePrompt(result.generated_prompt);
      console.log("deconstructionResult state updated with:", result);
    } catch (err) {
      console.error("Deconstruction error in runSingleDeconstruction:", err);
      alert(`图片解构失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsDeconstructing(false);
    }
  };

  const runSingleGeneration = async () => {
    if (!userApiKey) {
      alert("请先配置 API Key");
      return;
    }
    if (!deconstructionResult || !singleProductImage) {
      alert("请先上传参考图并解析，以及上传产品图");
      return;
    }

    const cost = (MODEL_COSTS[genModel as keyof typeof MODEL_COSTS].resolutions as Record<string, { rmb: number }>)[genResolution].rmb;
    if (auth.user!.credits < cost) {
      alert(`点数不足，本次生成需要 ${cost} 点，当前剩余 ${auth.user!.credits} 点`);
      return;
    }

    setIsGeneratingSingle(true);
    try {
      const finalPrompt = `产品图：白色背景的产品。${productKeywords ? `产品关键词：${productKeywords}。` : ''} ${editablePrompt}. 确保提供的图像中的产品是主要拍摄对象，并保留其细节。参考强度：${refStrength}。`;
      
      const imageUrl = await generateEcomImage({
        prompt: finalPrompt,
        refImageB64: useRefImage ? singleRefImage : undefined,
        productImageB64: singleProductImage,
        model: genModel,
        aspectRatio: genAspectRatio,
        imageSize: genResolution,
        apiKey: userApiKey,
        backgroundFidelity: refStrength
      });

      setSingleGeneratedImage(imageUrl);
      await deductCredit(cost);
      await saveToHistory(imageUrl, finalPrompt);
    } catch (err) {
      console.error(err);
      alert("生成失败，请重试");
    } finally {
      setIsGeneratingSingle(false);
    }
  };

  const run3DModelGeneration = async (imageB64: string) => {
    if (!userApiKey) {
      alert("请先配置 API Key");
      return;
    }
    setIsGenerating3D(true);
    try {
      const modelUrl = await generate3DModel(imageB64, model, userApiKey);
      setThreeDModelUrl(modelUrl);
    } catch (err) {
      console.error(err);
      alert("3D 模型生成失败，请重试");
    } finally {
      setIsGenerating3D(false);
    }
  };

  const run3DViewGeneration = async () => {
    if (!userApiKey) {
      alert("请先配置 API Key");
      return;
    }
    if (!threeDModelUrl) {
      alert("请先生成 3D 模型");
      return;
    }

    const cost = (MODEL_COSTS[genModel as keyof typeof MODEL_COSTS].resolutions as Record<string, { rmb: number }>)[genResolution].rmb;
    if (auth.user!.credits < cost) {
      alert(`点数不足，本次生成需要 ${cost} 点，当前剩余 ${auth.user!.credits} 点`);
      return;
    }

    setIsGeneratingSingle(true);
    try {
      // 将 3D 视角参数转化为提示词
      const cameraPrompt = `视角参数：位置(${threeDCameraParams?.position?.map((v: number) => v.toFixed(2)).join(', ')}), 旋转(${threeDCameraParams?.rotation?.map((v: number) => v.toFixed(2)).join(', ')}), 视野(${threeDCameraParams?.fov?.toFixed(2)})。请根据此视角生成一张高质量的产品图。`;
      
      const imageUrl = await generateEcomImage({
        prompt: cameraPrompt,
        productImageB64: threeDProductImage!,
        model: genModel,
        aspectRatio: genAspectRatio,
        imageSize: genResolution,
        apiKey: userApiKey,
      });

      setSingleGeneratedImage(imageUrl);
      await deductCredit(cost);
      await saveToHistory(imageUrl, cameraPrompt);
    } catch (err) {
      console.error(err);
      alert("视角渲染失败，请重试");
    } finally {
      setIsGeneratingSingle(false);
    }
  };

  const runDepthGeneration = async (imageB64: string) => {
    if (!userApiKey) {
      alert("请先配置 API Key");
      return;
    }
    setIsGeneratingDepth(true);
    try {
      const result = await generateDepthMap(imageB64, userApiKey);
      if (result) setDepthMap(result);
    } catch (err) {
      console.error(err);
      alert("深度图生成失败");
    } finally {
      setIsGeneratingDepth(false);
    }
  };

  const runThreeDGeneration = async (warpedB64: string) => {
    if (!userApiKey) {
      alert("请先配置 API Key");
      return;
    }
    if (!threeDAngleImage) {
      alert("请先上传产品图");
      return;
    }
    
    const cost = (MODEL_COSTS[genModel as keyof typeof MODEL_COSTS].resolutions as Record<string, { rmb: number }>)[genResolution].rmb;
    if ((auth.user?.credits || 0) < cost) {
      alert(`点数不足，本次生成需要 ${cost} 点，当前剩余 ${auth.user?.credits} 点`);
      return;
    }

    setIsGeneratingThreeD(true);
    try {
      const result = await generateThreeDImage({
        originalImageB64: threeDAngleImage,
        warpedDepthMapB64: warpedB64,
        prompt: deconstructionResult?.generated_prompt || "High-end product photography",
        model: genModel,
        aspectRatio: genAspectRatio,
        imageSize: genResolution,
        apiKey: userApiKey
      });
      if (result) {
        setThreeDGeneratedImage(result);
        await deductCredit(cost);
        await saveToHistory(result, "3D Angle Perspective Wrap");
      }
    } catch (err) {
      console.error(err);
      alert("生成失败，请重试");
    } finally {
      setIsGeneratingThreeD(false);
    }
  };

  const runSegmentation = async (imageB64: string) => {
    if (!userApiKey) {
      alert("请先配置 API Key");
      return;
    }
    setIsSegmenting(true);
    try {
      const objects = await segmentImage(imageB64, model, userApiKey);
      
      // 为每个物体生成裁剪图
      const objectsWithCrops = await Promise.all(objects.map(async obj => {
        const crop = await cropImage(imageB64, obj.bbox);
        return { ...obj, original_crop_path: crop };
      }));
      
      setSegmentedObjects(objectsWithCrops);
    } catch (err) {
      console.error(err);
      alert("解构失败，请重试");
    } finally {
      setIsSegmenting(false);
    }
  };

  const runReplacementGeneration = async () => {
    if (!userApiKey) {
      alert("请先配置 API Key");
      return;
    }
    if (!replacementBaseImage || segmentedObjects.length === 0) {
      alert("请先上传基准图并解构");
      return;
    }

    const cost = (MODEL_COSTS[genModel as keyof typeof MODEL_COSTS].resolutions as Record<string, { rmb: number }>)[genResolution].rmb;
    if (auth.user!.credits < cost) {
      alert(`点数不足，本次生成需要 ${cost} 点，当前剩余 ${auth.user!.credits} 点`);
      return;
    }

    setIsGeneratingSingle(true);
    try {
      const replacements = segmentedObjects.filter(obj => obj.replacementImage);
      if (replacements.length === 0) {
        alert("请至少替换一个物体");
        setIsGeneratingSingle(false);
        return;
      }

      const replacementDetails = replacements.map(r => 
        `替换物体 #${r.id} (${r.label})，新物体比例: ${r.scaleAdjustment}x`
      ).join('; ');

      const finalPrompt = `基于基准图进行局部替换。${replacementDetails}。背景保留强度: ${backgroundFidelity}。请确保新物体与原场景的光影、透视、材质完美融合。保持整体构图一致。`;
      
      // 收集所有替换图作为参考
      const imageUrl = await generateEcomImage({
        prompt: finalPrompt,
        refImageB64: replacementBaseImage,
        productImagesB64: replacements.map(r => r.replacementImage).filter(Boolean) as string[],
        model: genModel,
        aspectRatio: genAspectRatio,
        imageSize: genResolution,
        apiKey: userApiKey,
        backgroundFidelity
      });

      setSingleGeneratedImage(imageUrl);
      await deductCredit(cost);
      await saveToHistory(imageUrl, finalPrompt);
    } catch (err) {
      console.error(err);
      alert("生成失败，请重试");
    } finally {
      setIsGeneratingSingle(false);
    }
  };

  const DECONSTRUCTION_FIELDS = [
    { key: 'shape_form', label: '形态与轮廓 (Shape)', icon: 'fa-shapes' },
    { key: 'color_palette', label: '色彩构成 (Color)', icon: 'fa-palette' },
    { key: 'texture', label: '材质与肌理 (Texture)', icon: 'fa-scroll' },
    { key: 'space_negative', label: '空间与留白 (Space)', icon: 'fa-border-none' },
    { key: 'light_direction', label: '光源方向 (Light Dir)', icon: 'fa-sun' },
    { key: 'light_quality', label: '光质软硬 (Light Qual)', icon: 'fa-lightbulb' },
    { key: 'shadows', label: '阴影形态 (Shadows)', icon: 'fa-moon' },
    { key: 'mood_tone', label: '情绪基调 (Mood)', icon: 'fa-smile' },
    { key: 'focal_point', label: '视觉焦点 (Focus)', icon: 'fa-bullseye' },
    { key: 'leading_lines', label: '引导线 (Lines)', icon: 'fa-slash' },
    { key: 'depth_of_field', label: '景深层次 (Depth)', icon: 'fa-layer-group' },
    { key: 'perspective', label: '透视角度 (Perspective)', icon: 'fa-cube' },
    { key: 'subject', label: '主体特征 (Subject)', icon: 'fa-tag' },
    { key: 'context_background', label: '背景环境 (Background)', icon: 'fa-image' },
    { key: 'props', label: '道具配饰 (Props)', icon: 'fa-box-open' },
    { key: 'story_moment', label: '叙事瞬间 (Story)', icon: 'fa-clock' },
  ];

  if (auth.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0071e3]"></div>
      </div>
    );
  }

  if (!auth.user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F5F7] p-8">
        <div className="apple-card w-full max-w-md p-10 bg-white border-black/10 shadow-2xl">
          <div className="text-center mb-10">
            <div className="text-2xl font-extrabold tracking-tighter text-black mb-2">BANFULY <span className="text-[#6e6e73] font-light">ARCHITECT</span></div>
            <p className="text-xs font-bold text-[#86868b] uppercase tracking-widest">电商视觉架构师 · 登录中心</p>
          </div>
          
          <form onSubmit={authMode === 'login' ? handleLogin : handleRegister} className="space-y-6">
            <div>
              <label className="section-label text-[10px] mb-2 block opacity-60">用户名 / Username</label>
              <input 
                type="text" 
                required
                className="w-full bg-[#F5F5F7] border border-black/5 rounded-xl p-4 text-[14px] font-bold outline-none focus:ring-2 focus:ring-[#0071e3]/20 transition-all"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="请输入用户名"
              />
            </div>
            <div>
              <label className="section-label text-[10px] mb-2 block opacity-60">密码 / Password</label>
              <input 
                type="password" 
                required
                className="w-full bg-[#F5F5F7] border border-black/5 rounded-xl p-4 text-[14px] font-bold outline-none focus:ring-2 focus:ring-[#0071e3]/20 transition-all"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
              />
            </div>
            
            {authError && <p className="text-red-500 text-[11px] font-bold text-center">{authError}</p>}
            
            <button type="submit" className="btn-primary w-full py-4 bg-black text-white text-[14px] font-black shadow-xl hover:scale-[1.02] active:scale-95 transition-all">
              {authMode === 'login' ? '立即登录' : '注册新账号'}
            </button>
          </form>
          
          <div className="mt-8 pt-8 border-t border-black/5 text-center">
            <button 
              onClick={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setAuthError(''); }}
              className="text-[12px] font-bold text-[#0071e3] hover:underline"
            >
              {authMode === 'login' ? '没有账号？立即注册' : '已有账号？返回登录'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col selection:bg-black selection:text-white">
      {/* 导航栏 */}
      <header className="h-14 glass-nav flex items-center justify-between px-8 sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-6">
          <div className="text-lg font-extrabold tracking-tighter text-black cursor-pointer" onClick={() => setStep(AppStep.STYLE_DECODER)}>BANFULY <span className="text-[#6e6e73] font-light">ARCHITECT</span></div>
          <div className="step-capsule flex gap-1 items-center bg-[#F5F5F7] border border-black/5 shadow-inner">
            {[
              { id: AppStep.STYLE_DECODER, label: '视觉宪法' },
              { id: AppStep.PRODUCT_STRATEGY, label: '营销策划' },
              { id: AppStep.PROMPT_FUSION, label: '生成方案' },
              { id: AppStep.SINGLE_TOOL, label: '单图灵活工具' },
              { id: AppStep.HISTORY, label: '生图历史' },
              { id: AppStep.PROFILE, label: '个人中心' },
              ...(auth.user.role === 'admin' ? [{ id: AppStep.ADMIN_PANEL, label: '管理后台' }] : [])
            ].map((s) => (
              <button
                key={s.id}
                disabled={step < s.id && s.id !== AppStep.ADMIN_PANEL && s.id !== AppStep.PROFILE && s.id !== AppStep.HISTORY && s.id !== AppStep.SINGLE_TOOL}
                onClick={() => activeStep(s.id)}
                className={`px-4 py-1.5 rounded-full text-[11px] font-bold transition-all duration-500 ${step === s.id ? 'bg-white shadow-md text-black scale-105' : 'text-[#86868b] opacity-60 hover:opacity-100'}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-4 mr-4 border-r border-black/10 pr-4">
            <div className="text-right">
              <p className="text-[10px] font-black text-black leading-none">{auth.user.username}</p>
              <p className="text-[9px] font-bold text-[#0071e3] mt-1">生图点数: {auth.user.credits}</p>
            </div>
            <button onClick={handleLogout} className="w-8 h-8 rounded-full bg-[#F5F5F7] flex items-center justify-center text-[#86868b] hover:text-red-500 transition-all">
              <i className="fas fa-sign-out-alt text-xs"></i>
            </button>
          </div>
          <div className="flex items-center gap-2">
            {step === AppStep.STYLE_DECODER && (
              <button onClick={runStep1} disabled={!styleImage || loading} className={`btn-primary bg-orange-500 hover:bg-orange-600 px-8 py-4 text-[13px] flex items-center gap-2 border-none shadow-lg shadow-orange-500/10 active:scale-95 transition-all ${loading ? 'animate-breathe-orange' : ''}`}>
                <i className={`fas ${loading ? 'fa-circle-notch fa-spin' : 'fa-bolt'}`}></i> {loading ? '正在解析风格...' : '生成视觉宪法'}
              </button>
            )}
            {step === AppStep.PRODUCT_STRATEGY && (
              <button onClick={runStep2} disabled={productImages.length === 0 || loading} className={`btn-primary bg-orange-500 hover:bg-orange-600 px-8 py-4 text-[13px] flex items-center gap-2 border-none shadow-lg shadow-orange-500/10 active:scale-95 transition-all ${loading ? 'animate-breathe-orange' : ''}`}>
                <i className={`fas ${loading ? 'fa-circle-notch fa-spin' : 'fa-bolt'}`}></i> {loading ? '正在执行建模...' : '执行建模'}
              </button>
            )}
            {step === AppStep.PROMPT_FUSION && (
              <div className="flex gap-4">
                <button 
                  onClick={() => setIsBulkGenActive(true)} 
                  disabled={isBulkLoading}
                  className={`btn-primary bg-orange-500 hover:bg-orange-600 px-8 py-4 text-[13px] flex items-center gap-2 border-none shadow-lg shadow-orange-500/10 active:scale-95 transition-all ${isBulkLoading ? 'animate-breathe-orange' : ''}`}
                >
                  <i className={`fas ${isBulkLoading ? 'fa-circle-notch fa-spin' : 'fa-bolt'}`}></i> {isBulkLoading ? '正在批量渲染...' : '一键批量渲染'}
                </button>
                <button onClick={downloadAllImages} className="btn-primary px-8 py-4 text-[13px] bg-[#0071e3] hover:bg-[#0077ED] shadow-lg active:scale-95 transition-all flex items-center gap-2">
                  <i className="fas fa-download"></i> 下载所有图片
                </button>
                <button onClick={copyAllPlanInfo} className="btn-primary px-8 py-4 text-[13px] bg-black shadow-lg active:scale-95 transition-all">
                  <i className="fas fa-copy mr-2"></i> 复制全案方案文本
                </button>
              </div>
            )}
          </div>
          <button 
            onClick={async () => {
              if (typeof window !== 'undefined' && window.aistudio) {
                await window.aistudio.openSelectKey();
              } else {
                const key = prompt("请输入您的 Google Gemini API Key (将保存在本地浏览器中):", userApiKey);
                if (key) {
                  setUserApiKey(key);
                  localStorage.setItem('user_gemini_api_key', key);
                  alert("API Key 已保存");
                }
              }
            }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-[#F5F5F7] text-[#0071e3] border border-[#0071e3]/20 hover:bg-[#0071e3]/5 transition-all shadow-sm"
          >
            <i className="fas fa-key"></i>
            {userApiKey ? '已配置 Key' : '配置 API Key'}
          </button>
          <select 
            value={model} 
            onChange={(e) => setModel(e.target.value)}
            className="bg-white border border-black/10 px-3 py-1.5 rounded-lg text-[11px] font-bold outline-none cursor-pointer shadow-sm hover:border-[#0071e3]/30 transition-all"
          >
            <option value="gemini-3-flash-preview">FLASH 3.0 (极速引擎)</option>
            <option value="gemini-3.1-pro-preview">PRO 3.1 (高保真引擎)</option>
          </select>
        </div>
      </header>

      <main className="flex-1 max-w-[1440px] mx-auto w-full px-8 py-8">
        {step === AppStep.SINGLE_TOOL && (
          <div className="animate-slide-up">
            <div className="flex items-end justify-between mb-10">
              <div>
                <div className="section-label mb-3 text-[#0071e3]">Single Image Flexible Tool</div>
                <h1 className="text-4xl font-black tracking-tighter text-black">单图灵活工具</h1>
              </div>
              <div className="flex gap-2 bg-[#F5F5F7] p-1 rounded-xl border border-black/5 shadow-inner">
                <button 
                  onClick={() => setSingleToolMode(SingleToolMode.REFERENCE)}
                  className={`px-6 py-2 rounded-lg text-[12px] font-black transition-all ${singleToolMode === SingleToolMode.REFERENCE ? 'bg-white shadow-md text-black' : 'text-[#86868b] hover:text-black'}`}
                >
                  参考模式
                </button>
                <button 
                  onClick={() => setSingleToolMode(SingleToolMode.REPLACEMENT)}
                  className={`px-6 py-2 rounded-lg text-[12px] font-black transition-all ${singleToolMode === SingleToolMode.REPLACEMENT ? 'bg-white shadow-md text-black' : 'text-[#86868b] hover:text-black'}`}
                >
                  替换模式
                </button>
                <button 
                  onClick={() => setSingleToolMode(SingleToolMode.VIEW_3D)}
                  className={`px-6 py-2 rounded-lg text-[12px] font-black transition-all ${singleToolMode === SingleToolMode.VIEW_3D ? 'bg-white shadow-md text-black' : 'text-[#86868b] hover:text-black'}`}
                >
                  3D视角生图
                </button>
                <button 
                  onClick={() => setSingleToolMode(SingleToolMode.THREE_D_ANGLE)}
                  className={`px-6 py-2 rounded-lg text-[12px] font-black transition-all ${singleToolMode === SingleToolMode.THREE_D_ANGLE ? 'bg-white shadow-md text-black' : 'text-[#86868b] hover:text-black'}`}
                >
                  3D角度
                </button>
              </div>
            </div>

            {singleToolMode === SingleToolMode.REFERENCE && (
              <ReferenceMode
                singleRefImage={singleRefImage}
                setSingleRefImage={setSingleRefImage}
                isDeconstructing={isDeconstructing}
                deconstructionResult={deconstructionResult}
                runDeconstruction={runSingleDeconstruction}
                singleProductImage={singleProductImage}
                setSingleProductImage={setSingleProductImage}
                genModel={genModel}
                setGenModel={setGenModel}
                genResolution={genResolution}
                setGenResolution={setGenResolution}
                genAspectRatio={genAspectRatio}
                setGenAspectRatio={setGenAspectRatio}
                isGeneratingSingle={isGeneratingSingle}
                runSingleGeneration={runSingleGeneration}
                singleGeneratedImage={singleGeneratedImage}
                downloadImage={downloadImage}
                DECONSTRUCTION_FIELDS={DECONSTRUCTION_FIELDS}
                editablePrompt={editablePrompt}
                setEditablePrompt={setEditablePrompt}
                useRefImage={useRefImage}
                setUseRefImage={setUseRefImage}
                refStrength={refStrength}
                setRefStrength={setRefStrength}
                productKeywords={productKeywords}
                setProductKeywords={setProductKeywords}
              />
            )}

            {singleToolMode === SingleToolMode.REPLACEMENT && (
              <ReplacementMode
                replacementBaseImage={replacementBaseImage}
                setReplacementBaseImage={setReplacementBaseImage}
                isSegmenting={isSegmenting}
                segmentedObjects={segmentedObjects}
                runSegmentation={runSegmentation}
                singleProductImage={singleProductImage}
                setSingleProductImage={setSingleProductImage}
                genModel={genModel}
                setGenModel={setGenModel}
                genResolution={genResolution}
                setGenResolution={setGenResolution}
                genAspectRatio={genAspectRatio}
                setGenAspectRatio={setGenAspectRatio}
                isGeneratingSingle={isGeneratingSingle}
                runSingleGeneration={runReplacementGeneration}
                singleGeneratedImage={singleGeneratedImage}
                downloadImage={downloadImage}
                BBOX_COLORS={BBOX_COLORS}
                LABEL_COLORS={LABEL_COLORS}
                backgroundFidelity={backgroundFidelity}
                setBackgroundFidelity={setBackgroundFidelity}
              />
            )}

            {singleToolMode === SingleToolMode.VIEW_3D && (
              <View3DMode
                threeDProductImage={threeDProductImage}
                setThreeDProductImage={setThreeDProductImage}
                isGenerating3D={isGenerating3D}
                threeDModelUrl={threeDModelUrl}
                run3DModelGeneration={run3DModelGeneration}
                threeDCameraParams={threeDCameraParams}
                setThreeDCameraParams={setThreeDCameraParams}
                genModel={genModel}
                setGenModel={setGenModel}
                genResolution={genResolution}
                setGenResolution={setGenResolution}
                genAspectRatio={genAspectRatio}
                setGenAspectRatio={setGenAspectRatio}
                isGeneratingSingle={isGeneratingSingle}
                run3DViewGeneration={run3DViewGeneration}
                singleGeneratedImage={singleGeneratedImage}
                downloadImage={downloadImage}
              />
            )}

            {singleToolMode === SingleToolMode.THREE_D_ANGLE && (
              <ThreeDAngleMode
                threeDAngleImage={threeDAngleImage}
                setThreeDAngleImage={setThreeDAngleImage}
                depthMap={depthMap}
                isGeneratingDepth={isGeneratingDepth}
                runDepthGeneration={runDepthGeneration}
                isGeneratingThreeD={isGeneratingThreeD}
                runThreeDGeneration={runThreeDGeneration}
                threeDGeneratedImage={threeDGeneratedImage}
              />
            )}
          </div>
        )}
        {step === AppStep.HISTORY && (
          <div className="animate-slide-up">
            <div className="flex items-end justify-between mb-10">
              <div>
                <div className="section-label mb-3 text-[#0071e3]">Generation History</div>
                <h1 className="text-4xl font-black tracking-tighter text-black">
                  {auth.user?.role === 'admin' ? '全平台生图历史' : '我的生图历史'}
                </h1>
                <p className="text-[12px] text-[#86868b] font-bold mt-2 uppercase tracking-widest">
                  系统仅保留最近 60 张历史图片，请及时下载保存
                </p>
              </div>
              <div className="flex gap-4">
                {selectedHistoryIds.size > 0 && (
                  <>
                    <button 
                      onClick={deleteSelectedHistory}
                      className="btn-primary px-6 py-3 text-[12px] bg-red-500 hover:bg-red-600 shadow-lg active:scale-95 transition-all flex items-center gap-2"
                    >
                      <i className="fas fa-trash"></i> 删除选中 ({selectedHistoryIds.size})
                    </button>
                    <button 
                      onClick={downloadSelectedHistory}
                      className="btn-primary px-6 py-3 text-[12px] bg-[#0071e3] hover:bg-[#0077ED] shadow-lg active:scale-95 transition-all flex items-center gap-2"
                    >
                      <i className="fas fa-download"></i> 下载选中 ({selectedHistoryIds.size})
                    </button>
                  </>
                )}
                <button 
                  onClick={() => setSelectedHistoryIds(selectedHistoryIds.size === imageHistory.length ? new Set() : new Set(imageHistory.map(h => h.id)))}
                  className="btn-primary px-6 py-3 text-[12px] bg-black shadow-lg active:scale-95 transition-all"
                >
                  {selectedHistoryIds.size === imageHistory.length ? '取消全选' : '全选本页'}
                </button>
              </div>
            </div>

            {historyLoading ? (
              <div className="h-[400px] flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0071e3]"></div>
              </div>
            ) : imageHistory.length === 0 ? (
              <div className="h-[400px] flex flex-col items-center justify-center bg-[#F5F5F7] rounded-[40px] border border-dashed border-black/10 opacity-50">
                <i className="fas fa-history text-4xl mb-4"></i>
                <p className="text-sm font-bold">暂无历史记录</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                {imageHistory.map((h) => (
                  <div 
                    key={h.id} 
                    className={`apple-card group relative aspect-square overflow-hidden bg-white border-2 transition-all cursor-pointer ${selectedHistoryIds.has(h.id) ? 'border-[#0071e3] shadow-xl scale-[0.98]' : 'border-black/5 shadow-md hover:shadow-lg'}`}
                    onClick={() => toggleHistorySelection(h.id)}
                  >
                    <img src={h.imageUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-4">
                      <div className="flex justify-between items-start">
                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${selectedHistoryIds.has(h.id) ? 'bg-[#0071e3] border-[#0071e3]' : 'border-white'}`}>
                          {selectedHistoryIds.has(h.id) && <i className="fas fa-check text-[10px] text-white"></i>}
                        </div>
                        <button 
                          onClick={(e) => { e.stopPropagation(); deleteHistoryItem(h.id); }}
                          className="w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center hover:scale-110 transition-transform"
                        >
                          <i className="fas fa-trash text-[10px]"></i>
                        </button>
                      </div>
                                            <div className="space-y-2">
                        {auth.user?.role === 'admin' && (
                          <div className="bg-white/20 backdrop-blur-md px-2 py-1 rounded text-[9px] font-black text-white uppercase tracking-widest">
                            User: {h.username}
                          </div>
                        )}
                        <div className="bg-white/20 backdrop-blur-md px-2 py-1 rounded text-[9px] font-black text-white uppercase tracking-widest">
                          {new Date(Number(h.timestamp)).toLocaleString()}
                        </div>
                        
                        {/* Prompt 显示与复制 */}
                        <div className="group/prompt relative">
                          <div className="bg-black/50 backdrop-blur-md px-2 py-1.5 rounded text-[8px] text-white/80 line-clamp-2 hover:line-clamp-none transition-all cursor-help border border-white/10">
                            {h.prompt || "无提示词记录"}
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); copyToClipboard(h.prompt, "提示词已复制"); }}
                            className="absolute top-0 right-0 bottom-0 bg-blue-600/80 hover:bg-blue-600 text-white px-2 rounded-r flex items-center justify-center opacity-0 group-hover/prompt:opacity-100 transition-opacity"
                            title="复制提示词"
                          >
                            <i className="fas fa-copy text-[10px]"></i>
                          </button>
                        </div>

                        <button 
                          onClick={(e) => { e.stopPropagation(); downloadImage(h.imageUrl, `history-${h.id}`); }}
                          className="w-full py-2 bg-white text-black text-[10px] font-black rounded-lg hover:bg-[#F5F5F7] transition-colors"
                        >
                          下载原图
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {step === AppStep.PROFILE && (
          <div className="animate-slide-up max-w-4xl mx-auto w-full">
            <div className="flex items-end justify-between mb-10">
              <div>
                <div className="section-label mb-3 text-[#0071e3]">User Profile</div>
                <h1 className="text-4xl font-black tracking-tighter text-black">个人信息管理</h1>
              </div>
              <div className="flex gap-2 bg-[#F5F5F7] p-1 rounded-xl border border-black/5 shadow-inner">
                <button 
                  onClick={() => setProfileTab('password')}
                  className={`px-6 py-2 rounded-lg text-[12px] font-black transition-all ${profileTab === 'password' ? 'bg-white shadow-md text-black' : 'text-[#86868b] hover:text-black'}`}
                >
                  修改密码
                </button>
                <button 
                  onClick={() => setProfileTab('recharge')}
                  className={`px-6 py-2 rounded-lg text-[12px] font-black transition-all ${profileTab === 'recharge' ? 'bg-white shadow-md text-black' : 'text-[#86868b] hover:text-black'}`}
                >
                  充值记录
                </button>
                <button 
                  onClick={() => setProfileTab('stats')}
                  className={`px-6 py-2 rounded-lg text-[12px] font-black transition-all ${profileTab === 'stats' ? 'bg-white shadow-md text-black' : 'text-[#86868b] hover:text-black'}`}
                >
                  生图记录
                </button>
              </div>
            </div>

            <div className="apple-card bg-white border-black/10 overflow-hidden shadow-2xl">
              <div className="p-10 border-b border-black/5 flex items-center gap-6">
                <div className="w-20 h-20 rounded-full bg-[#0071e3]/10 flex items-center justify-center text-[#0071e3] text-3xl font-black">
                  {auth.user.username[0].toUpperCase()}
                </div>
                <div>
                  <h2 className="text-2xl font-black text-black">{auth.user.username}</h2>
                  <p className="text-[#86868b] font-bold text-sm uppercase tracking-widest mt-1">
                    {auth.user.role === 'admin' ? '系统管理员' : '普通用户'} · 剩余点数: {auth.user.credits}
                  </p>
                </div>
              </div>

              <div className="p-10">
                {profileTab === 'password' && (
                  <form onSubmit={handleChangePassword} className="space-y-8 max-w-2xl">
                    <h3 className="section-label text-[12px] opacity-60">修改账户密码 / Change Password</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="section-label text-[10px] mb-2 block opacity-60">当前密码 / Current Password</label>
                        <input 
                          type="password" 
                          required
                          className="w-full bg-[#F5F5F7] border border-black/5 rounded-xl p-4 text-[14px] font-bold outline-none focus:ring-2 focus:ring-[#0071e3]/20 transition-all"
                          value={oldPassword}
                          onChange={(e) => setOldPassword(e.target.value)}
                          placeholder="请输入当前密码"
                        />
                      </div>
                      <div>
                        <label className="section-label text-[10px] mb-2 block opacity-60">新密码 / New Password</label>
                        <input 
                          type="password" 
                          required
                          className="w-full bg-[#F5F5F7] border border-black/5 rounded-xl p-4 text-[14px] font-bold outline-none focus:ring-2 focus:ring-[#0071e3]/20 transition-all"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="请输入新密码"
                        />
                      </div>
                    </div>

                    {profileMessage && (
                      <p className={`text-center text-[12px] font-bold ${profileMessage.includes('成功') ? 'text-green-500' : 'text-red-500'}`}>
                        {profileMessage}
                      </p>
                    )}

                    <button type="submit" className="btn-primary w-full py-4 bg-black text-white text-[14px] font-black shadow-xl hover:scale-[1.02] active:scale-95 transition-all">
                      确认修改密码
                    </button>
                  </form>
                )}

                {profileTab === 'recharge' && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-[#F5F5F7] border-b border-black/5">
                          <th className="px-8 py-5 section-label text-[10px] opacity-60">时间</th>
                          <th className="px-8 py-5 section-label text-[10px] opacity-60">变动额度</th>
                          <th className="px-8 py-5 section-label text-[10px] opacity-60">变动后</th>
                          <th className="px-8 py-5 section-label text-[10px] opacity-60">操作人</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/5">
                        {userRechargeLogs.length === 0 ? (
                          <tr><td colSpan={4} className="px-8 py-10 text-center text-[#86868b] font-bold">暂无充值记录</td></tr>
                        ) : userRechargeLogs.map(log => (
                          <tr key={log.id} className="hover:bg-[#F5F5F7]/30 transition-all">
                            <td className="px-8 py-6 text-[12px] text-[#86868b] font-medium">
                              {new Date(log.timestamp).toLocaleString()}
                            </td>
                            <td className="px-8 py-6">
                              <span className={`text-[13px] font-black ${log.amount >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                {log.amount >= 0 ? `+${log.amount}` : log.amount}
                              </span>
                            </td>
                            <td className="px-8 py-6 text-[13px] font-bold text-black">{log.newCredits}</td>
                            <td className="px-8 py-6 text-[12px] text-[#86868b] font-bold">{log.adminName}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {profileTab === 'stats' && (
                  <div className="space-y-6">
                    <div className="flex flex-wrap items-center gap-4 bg-[#F5F5F7] p-6 rounded-2xl border border-black/5">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-black opacity-40 uppercase">年份</span>
                        <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)} className="bg-white border-none rounded-lg px-3 py-1.5 text-[12px] font-bold outline-none shadow-sm">
                          <option value="">全部</option>
                          {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}年</option>)}
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-black opacity-40 uppercase">月份</span>
                        <select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="bg-white border-none rounded-lg px-3 py-1.5 text-[12px] font-bold outline-none shadow-sm">
                          <option value="">全部</option>
                          {Array.from({length: 12}, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}月</option>)}
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-black opacity-40 uppercase">日期</span>
                        <select value={filterDay} onChange={(e) => setFilterDay(e.target.value)} className="bg-white border-none rounded-lg px-3 py-1.5 text-[12px] font-bold outline-none shadow-sm">
                          <option value="">全部</option>
                          {Array.from({length: 31}, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}日</option>)}
                        </select>
                      </div>
                      <div className="ml-auto flex items-center gap-6">
                        <div className="text-right">
                          <span className="text-[10px] font-black opacity-40 block uppercase">筛选后总计</span>
                          <span className="text-2xl font-black text-[#0071e3]">
                            {userGenLogs.filter(log => {
                              const date = new Date(log.timestamp);
                              return (!filterYear || date.getFullYear().toString() === filterYear) &&
                                     (!filterMonth || (date.getMonth() + 1).toString() === filterMonth) &&
                                     (!filterDay || date.getDate().toString() === filterDay);
                            }).length}
                          </span>
                        </div>
                        <button 
                          onClick={() => {
                            const filtered = userGenLogs.filter(log => {
                              const date = new Date(log.timestamp);
                              return (!filterYear || date.getFullYear().toString() === filterYear) &&
                                     (!filterMonth || (date.getMonth() + 1).toString() === filterMonth) &&
                                     (!filterDay || date.getDate().toString() === filterDay);
                            });
                            exportToExcel(filtered.map(l => ({ '时间': new Date(l.timestamp).toLocaleString(), '操作': '生图渲染' })), `个人生图记录_${new Date().getTime()}`);
                          }}
                          className="bg-black text-white px-6 py-2 rounded-xl text-[12px] font-black shadow-lg hover:scale-105 active:scale-95 transition-all"
                        >
                          导出 Excel
                        </button>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="bg-[#F5F5F7] border-b border-black/5">
                            <th className="px-8 py-5 section-label text-[10px] opacity-60">时间</th>
                            <th className="px-8 py-5 section-label text-[10px] opacity-60">操作类型</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-black/5">
                          {userGenLogs.filter(log => {
                            const date = new Date(log.timestamp);
                            return (!filterYear || date.getFullYear().toString() === filterYear) &&
                                   (!filterMonth || (date.getMonth() + 1).toString() === filterMonth) &&
                                   (!filterDay || date.getDate().toString() === filterDay);
                          }).length === 0 ? (
                            <tr><td colSpan={2} className="px-8 py-10 text-center text-[#86868b] font-bold">暂无符合条件的生图记录</td></tr>
                          ) : userGenLogs.filter(log => {
                            const date = new Date(log.timestamp);
                            return (!filterYear || date.getFullYear().toString() === filterYear) &&
                                   (!filterMonth || (date.getMonth() + 1).toString() === filterMonth) &&
                                   (!filterDay || date.getDate().toString() === filterDay);
                          }).map(log => (
                            <tr key={log.id} className="hover:bg-[#F5F5F7]/30 transition-all">
                              <td className="px-8 py-6 text-[12px] text-[#86868b] font-medium">
                                {new Date(log.timestamp).toLocaleString()}
                              </td>
                              <td className="px-8 py-6">
                                <span className="bg-blue-500/10 text-blue-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
                                  生图渲染
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {profileLoading && (
                <div className="p-10 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0071e3]"></div>
                </div>
              )}
            </div>
          </div>
        )}

        {step === AppStep.ADMIN_PANEL && auth.user.role === 'admin' && (
          <div className="animate-slide-up">
            <div className="flex items-end justify-between mb-10">
              <div>
                <div className="section-label mb-3 text-[#0071e3]">Admin Dashboard</div>
                <h1 className="text-4xl font-black tracking-tighter text-black">
                  {adminTab === 'users' ? '账户与生图点数管理' : adminTab === 'recharge' ? '充值流水记录' : '生图统计记录'}
                </h1>
              </div>
              <div className="flex gap-2 bg-[#F5F5F7] p-1 rounded-xl border border-black/5 shadow-inner">
                <button 
                  onClick={() => { setAdminTab('users'); fetchAdminUsers(); setFilterUser('all'); setFilterYear(''); setFilterMonth(''); setFilterDay(''); }}
                  className={`px-6 py-2 rounded-lg text-[12px] font-black transition-all ${adminTab === 'users' ? 'bg-white shadow-md text-black' : 'text-[#86868b] hover:text-black'}`}
                >
                  用户管理
                </button>
                <button 
                  onClick={() => { setAdminTab('recharge'); fetchRechargeLogs(); setFilterUser('all'); setFilterYear(''); setFilterMonth(''); setFilterDay(''); }}
                  className={`px-6 py-2 rounded-lg text-[12px] font-black transition-all ${adminTab === 'recharge' ? 'bg-white shadow-md text-black' : 'text-[#86868b] hover:text-black'}`}
                >
                  充值流水
                </button>
                <button 
                  onClick={() => { setAdminTab('stats'); fetchGenerationLogs(); setFilterUser('all'); setFilterYear(''); setFilterMonth(''); setFilterDay(''); }}
                  className={`px-6 py-2 rounded-lg text-[12px] font-black transition-all ${adminTab === 'stats' ? 'bg-white shadow-md text-black' : 'text-[#86868b] hover:text-black'}`}
                >
                  生图统计
                </button>
              </div>
            </div>

            <div className="apple-card bg-white border-black/10 overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                {adminTab === 'users' && (
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-[#F5F5F7] border-b border-black/5">
                        <th className="px-8 py-5 section-label text-[10px] opacity-60">用户名</th>
                        <th className="px-8 py-5 section-label text-[10px] opacity-60">角色</th>
                        <th className="px-8 py-5 section-label text-[10px] opacity-60">剩余点数</th>
                        <th className="px-8 py-5 section-label text-[10px] opacity-60">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/5">
                      {adminUsers.map(u => (
                        <tr key={u.id} className="hover:bg-[#F5F5F7]/30 transition-all">
                          <td className="px-8 py-6">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-[#0071e3]/10 flex items-center justify-center text-[#0071e3] text-xs font-black">
                                {u.username[0].toUpperCase()}
                              </div>
                              <span className="text-[14px] font-black text-black">{u.username}</span>
                            </div>
                          </td>
                          <td className="px-8 py-6">
                            <select 
                              value={u.role} 
                              onChange={(e) => updateRole(u.id, e.target.value)}
                              className="bg-[#F5F5F7] border-none rounded-lg px-3 py-1.5 text-[12px] font-bold outline-none cursor-pointer"
                            >
                              <option value="user">普通用户</option>
                              <option value="admin">管理员</option>
                            </select>
                          </td>
                          <td className="px-8 py-6">
                            <div className="flex items-center gap-3">
                              <input 
                                type="number" 
                                className="w-20 bg-[#F5F5F7] border-none rounded-lg px-3 py-1.5 text-[12px] font-bold outline-none"
                                defaultValue={u.credits}
                                onBlur={(e) => updateCredits(u.id, parseInt(e.target.value))}
                              />
                              <span className="text-[10px] font-bold text-[#86868b]">点</span>
                            </div>
                          </td>
                          <td className="px-8 py-6">
                            <div className="flex gap-4">
                              <button 
                                onClick={() => {
                                  const newCredits = prompt(`为用户 ${u.username} 设置点数:`, u.credits.toString());
                                  if (newCredits !== null) updateCredits(u.id, parseInt(newCredits));
                                }}
                                className="text-[11px] font-black text-[#0071e3] hover:underline"
                              >
                                快速充值
                              </button>
                              <button 
                                onClick={() => handleResetPassword(u.id, u.username)}
                                className="text-[11px] font-black text-red-500 hover:underline"
                              >
                                重置密码
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {adminTab === 'recharge' && (
                  <div className="space-y-6">
                    <div className="flex flex-wrap items-center gap-4 bg-[#F5F5F7] p-6 rounded-2xl border border-black/5">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-black opacity-40 uppercase">用户</span>
                        <select value={filterUser} onChange={(e) => setFilterUser(e.target.value)} className="bg-white border-none rounded-lg px-3 py-1.5 text-[12px] font-bold outline-none shadow-sm">
                          <option value="all">所有人</option>
                          {adminUsers.map(u => <option key={u.id} value={u.username}>{u.username}</option>)}
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-black opacity-40 uppercase">年份</span>
                        <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)} className="bg-white border-none rounded-lg px-3 py-1.5 text-[12px] font-bold outline-none shadow-sm">
                          <option value="">全部</option>
                          {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}年</option>)}
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-black opacity-40 uppercase">月份</span>
                        <select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="bg-white border-none rounded-lg px-3 py-1.5 text-[12px] font-bold outline-none shadow-sm">
                          <option value="">全部</option>
                          {Array.from({length: 12}, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}月</option>)}
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-black opacity-40 uppercase">日期</span>
                        <select value={filterDay} onChange={(e) => setFilterDay(e.target.value)} className="bg-white border-none rounded-lg px-3 py-1.5 text-[12px] font-bold outline-none shadow-sm">
                          <option value="">全部</option>
                          {Array.from({length: 31}, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}日</option>)}
                        </select>
                      </div>
                      <div className="ml-auto flex items-center gap-6">
                        <div className="text-right">
                          <span className="text-[10px] font-black opacity-40 block uppercase">筛选后总计</span>
                          <span className="text-2xl font-black text-[#0071e3]">
                            {rechargeLogs.filter(log => {
                              const date = new Date(Number(log.timestamp));
                              return (filterUser === 'all' || log.username === filterUser) &&
                                     (!filterYear || date.getFullYear().toString() === filterYear) &&
                                     (!filterMonth || (date.getMonth() + 1).toString() === filterMonth) &&
                                     (!filterDay || date.getDate().toString() === filterDay);
                            }).length}
                          </span>
                        </div>
                        <button 
                          onClick={() => {
                            const filtered = rechargeLogs.filter(log => {
                              const date = new Date(Number(log.timestamp));
                              return (filterUser === 'all' || log.username === filterUser) &&
                                     (!filterYear || date.getFullYear().toString() === filterYear) &&
                                     (!filterMonth || (date.getMonth() + 1).toString() === filterMonth) &&
                                     (!filterDay || date.getDate().toString() === filterDay);
                            });
                            exportToExcel(filtered.map(l => ({ 
                              '时间': new Date(Number(l.timestamp)).toLocaleString(), 
                              '用户': l.username, 
                              '变动额度': l.amount, 
                              '变动后': l.newCredits, 
                              '操作人': l.adminName 
                            })), `充值流水记录_${new Date().getTime()}`);
                          }}
                          className="bg-black text-white px-6 py-2 rounded-xl text-[12px] font-black shadow-lg hover:scale-105 active:scale-95 transition-all"
                        >
                          导出 Excel
                        </button>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="bg-[#F5F5F7] border-b border-black/5">
                            <th className="px-8 py-5 section-label text-[10px] opacity-60">时间</th>
                            <th className="px-8 py-5 section-label text-[10px] opacity-60">用户</th>
                            <th className="px-8 py-5 section-label text-[10px] opacity-60">变动额度</th>
                            <th className="px-8 py-5 section-label text-[10px] opacity-60">变动后</th>
                            <th className="px-8 py-5 section-label text-[10px] opacity-60">操作人</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-black/5">
                          {rechargeLogs.filter(log => {
                            const date = new Date(Number(log.timestamp));
                            return (filterUser === 'all' || log.username === filterUser) &&
                                   (!filterYear || date.getFullYear().toString() === filterYear) &&
                                   (!filterMonth || (date.getMonth() + 1).toString() === filterMonth) &&
                                   (!filterDay || date.getDate().toString() === filterDay);
                          }).length === 0 ? (
                            <tr><td colSpan={5} className="px-8 py-10 text-center text-[#86868b] font-bold">暂无符合条件的充值记录</td></tr>
                          ) : rechargeLogs.filter(log => {
                            const date = new Date(Number(log.timestamp));
                            return (filterUser === 'all' || log.username === filterUser) &&
                                   (!filterYear || date.getFullYear().toString() === filterYear) &&
                                   (!filterMonth || (date.getMonth() + 1).toString() === filterMonth) &&
                                   (!filterDay || date.getDate().toString() === filterDay);
                          }).map(log => (
                            <tr key={log.id} className="hover:bg-[#F5F5F7]/30 transition-all">
                              <td className="px-8 py-6 text-[12px] text-[#86868b] font-medium">
                                {new Date(Number(log.timestamp)).toLocaleString()}
                              </td>
                              <td className="px-8 py-6 text-[14px] font-black text-black">{log.username}</td>
                              <td className="px-8 py-6">
                                <span className={`text-[13px] font-black ${log.amount >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                  {log.amount >= 0 ? `+${log.amount}` : log.amount}
                                </span>
                              </td>
                              <td className="px-8 py-6 text-[13px] font-bold text-black">{log.newCredits}</td>
                              <td className="px-8 py-6 text-[12px] text-[#86868b] font-bold">{log.adminName}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {adminTab === 'stats' && (
                  <div className="space-y-6">
                    <div className="flex flex-wrap items-center gap-4 bg-[#F5F5F7] p-6 rounded-2xl border border-black/5">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-black opacity-40 uppercase">用户</span>
                        <select value={filterUser} onChange={(e) => setFilterUser(e.target.value)} className="bg-white border-none rounded-lg px-3 py-1.5 text-[12px] font-bold outline-none shadow-sm">
                          <option value="all">所有人</option>
                          {adminUsers.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-black opacity-40 uppercase">年份</span>
                        <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)} className="bg-white border-none rounded-lg px-3 py-1.5 text-[12px] font-bold outline-none shadow-sm">
                          <option value="">全部</option>
                          {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}年</option>)}
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-black opacity-40 uppercase">月份</span>
                        <select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="bg-white border-none rounded-lg px-3 py-1.5 text-[12px] font-bold outline-none shadow-sm">
                          <option value="">全部</option>
                          {Array.from({length: 12}, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}月</option>)}
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-black opacity-40 uppercase">日期</span>
                        <select value={filterDay} onChange={(e) => setFilterDay(e.target.value)} className="bg-white border-none rounded-lg px-3 py-1.5 text-[12px] font-bold outline-none shadow-sm">
                          <option value="">全部</option>
                          {Array.from({length: 31}, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}日</option>)}
                        </select>
                      </div>
                      <div className="ml-auto flex items-center gap-6">
                        <div className="text-right">
                          <span className="text-[10px] font-black opacity-40 block uppercase">筛选后总计</span>
                          <span className="text-2xl font-black text-[#0071e3]">
                            {generationLogs.filter(log => {
                              const date = new Date(Number(log.timestamp));
                              return (filterUser === 'all' || log.userId === filterUser) &&
                                     (!filterYear || date.getFullYear().toString() === filterYear) &&
                                     (!filterMonth || (date.getMonth() + 1).toString() === filterMonth) &&
                                     (!filterDay || date.getDate().toString() === filterDay);
                            }).length}
                          </span>
                        </div>
                        <button 
                          onClick={() => {
                            const filtered = generationLogs.filter(log => {
                              const date = new Date(Number(log.timestamp));
                              return (filterUser === 'all' || log.userId === filterUser) &&
                                     (!filterYear || date.getFullYear().toString() === filterYear) &&
                                     (!filterMonth || (date.getMonth() + 1).toString() === filterMonth) &&
                                     (!filterDay || date.getDate().toString() === filterDay);
                            });
                            exportToExcel(filtered.map(l => ({ '时间': new Date(Number(l.timestamp)).toLocaleString(), '用户': l.username, '操作': '生图渲染' })), `全平台生图统计_${new Date().getTime()}`);
                          }}
                          className="bg-black text-white px-6 py-2 rounded-xl text-[12px] font-black shadow-lg hover:scale-105 active:scale-95 transition-all"
                        >
                          导出 Excel
                        </button>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="bg-[#F5F5F7] border-b border-black/5">
                            <th className="px-8 py-5 section-label text-[10px] opacity-60">时间</th>
                            <th className="px-8 py-5 section-label text-[10px] opacity-60">用户</th>
                            <th className="px-8 py-5 section-label text-[10px] opacity-60">操作类型</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-black/5">
                          {generationLogs.filter(log => {
                            const date = new Date(Number(log.timestamp));
                            return (filterUser === 'all' || log.userId === filterUser) &&
                                   (!filterYear || date.getFullYear().toString() === filterYear) &&
                                   (!filterMonth || (date.getMonth() + 1).toString() === filterMonth) &&
                                   (!filterDay || date.getDate().toString() === filterDay);
                          }).length === 0 ? (
                            <tr><td colSpan={3} className="px-8 py-10 text-center text-[#86868b] font-bold">暂无符合条件的统计记录</td></tr>
                          ) : generationLogs.filter(log => {
                            const date = new Date(Number(log.timestamp));
                            return (filterUser === 'all' || log.userId === filterUser) &&
                                   (!filterYear || date.getFullYear().toString() === filterYear) &&
                                   (!filterMonth || (date.getMonth() + 1).toString() === filterMonth) &&
                                   (!filterDay || date.getDate().toString() === filterDay);
                          }).map(log => (
                            <tr key={log.id} className="hover:bg-[#F5F5F7]/30 transition-all">
                              <td className="px-8 py-6 text-[12px] text-[#86868b] font-medium">
                                {new Date(Number(log.timestamp)).toLocaleString()}
                              </td>
                              <td className="px-8 py-6 text-[14px] font-black text-black">{log.username}</td>
                              <td className="px-8 py-6">
                                <span className="bg-blue-500/10 text-blue-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
                                  生图渲染
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
              {adminLoading && (
                <div className="p-10 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0071e3]"></div>
                </div>
              )}
            </div>
          </div>
        )}

        {step === AppStep.STYLE_DECODER && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-slide-up">
            <div className="lg:col-span-7">
              <div className="apple-card p-8 h-full flex flex-col border-black/10 bg-white">
                <div className="section-label mb-6 text-[#0071e3]">Step 01 / Decoder</div>
                <h1 className="text-3xl font-extrabold mb-8 leading-tight tracking-tight">上传风格参考图，<br/><span className="text-[#86868b]">确立详情全案审美骨架。</span></h1>
                <div 
                  className={`flex-1 rounded-[24px] border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all duration-700 overflow-hidden relative group shadow-inner min-h-[400px] ${styleImage ? 'border-transparent' : 'border-black/15 bg-[#fbfbfd] hover:bg-white hover:border-[#0071e3]/30'}`}
                  onClick={() => document.getElementById('style-upload')?.click()}
                >
                  {styleImage ? <img src={styleImage} className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" /> : (
                    <div className="text-center animate-pulse">
                      <div className="w-16 h-16 bg-white rounded-2xl shadow-md flex items-center justify-center mx-auto mb-4 border border-black/5"><i className="fas fa-image text-xl text-[#0071e3]"></i></div>
                      <p className="text-xs font-bold text-black opacity-60">点击上传参考图解析视觉基因</p>
                    </div>
                  )}
                  <input id="style-upload" type="file" className="hidden" onChange={(e) => handleFileChange(e, setStyleImage)} />
                </div>

              </div>
            </div>
            <div className="lg:col-span-5">
              <div className="apple-card p-8 h-full flex flex-col bg-[#F5F5F7] border-black/5">
                <div className="section-label mb-8 text-black/40 tracking-[0.2em]">视觉宪法协议 / Protocol</div>
                {!constitution ? (
                  <div className="flex-1 flex flex-col items-center justify-center opacity-40 italic text-xs text-black">等待审美模型注入 DNA...</div>
                ) : (
                  <div className="space-y-6 flex-1 overflow-y-auto pr-2 no-scrollbar">
                    <div className="bg-white p-6 rounded-2xl border border-black/10 shadow-sm">
                      <label className="section-label text-[9px] mb-3 block opacity-60 font-black tracking-widest">全局提示词前缀</label>
                      <textarea className="w-full bg-transparent border-none text-[13px] font-bold text-black focus:ring-0 p-0 leading-relaxed no-scrollbar" rows={4} value={constitution.prompt_prefix} onChange={(e) => setConstitution({...constitution, prompt_prefix: e.target.value})} />
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                      {[
                        { key: 'style', label: '核心风格', color: 'bg-blue-500' },
                        { key: 'lighting', label: '光影逻辑', color: 'bg-orange-400' },
                        { key: 'color', label: '配色方案', color: 'bg-green-500' },
                        { key: 'composition', label: '构图法则', color: 'bg-purple-500' },
                        { key: 'texture', label: '材质氛围', color: 'bg-red-400' }
                      ].map(item => (
                        <div key={item.key} className="bg-white px-6 py-4 rounded-2xl border border-black/5 shadow-sm flex items-center justify-between group hover:border-[#0071e3]/20 transition-all">
                          <div className="flex items-center gap-3">
                            <div className={`w-1.5 h-1.5 rounded-full ${item.color}`}></div>
                            <label className="section-label text-[9px] text-black/50">{item.label}</label>
                          </div>
                          <input className="text-right text-[12px] font-black outline-none border-none bg-transparent w-2/3 text-black focus:text-[#0071e3] transition-colors" value={(constitution as VisualConstitution)[item.key as keyof VisualConstitution]} onChange={(e) => setConstitution(prev => prev ? {...prev, [item.key]: e.target.value} : null)} />
                        </div>
                      ))}
                    </div>
                    
                    {/* 确认跳转按钮 */}
                    <div className="pt-4">
                      <button 
                        onClick={() => setStep(AppStep.PRODUCT_STRATEGY)}
                        className="w-full py-4 bg-black text-white rounded-2xl text-[13px] font-black hover:bg-gray-800 transition-all flex items-center justify-center gap-2 shadow-xl"
                      >
                        确认视觉宪法，进入营销策划 <i className="fas fa-arrow-right"></i>
                      </button>
                    </div>

                  </div>
                )}
                {constitution && (
                  <button 
                    onClick={() => setStep(AppStep.PRODUCT_STRATEGY)}
                    className="btn-primary w-full py-4 mt-8 text-[14px] tracking-wide bg-[#0071e3] hover:bg-[#0077ED] shadow-lg shadow-blue-500/10 active:scale-95 transition-all"
                  >
                    进入营销策划 <i className="fas fa-arrow-right ml-2"></i>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {step === AppStep.PRODUCT_STRATEGY && (
          <ProductStrategy
            productImages={productImages}
            removeProductImage={removeProductImage}
            compositionRefImage={compositionRefImage}
            setCompositionRefImage={setCompositionRefImage}
            strategyType={strategyType}
            setStrategyType={setStrategyType}
            sellingPoints={sellingPoints}
            setSellingPoints={setSellingPoints}
            allowedElements={allowedElements}
            setAllowedElements={setAllowedElements}
            prohibitedElements={prohibitedElements}
            setProhibitedElements={setProhibitedElements}
            analysis={analysis}
            setAnalysis={setAnalysis}
            updateStoryboard={updateStoryboard}
            loading={loading}
            onFileUpload={handleFileChange}
            onMultipleFilesUpload={handleMultipleFilesChange}
          />
        )}

        {step === AppStep.PROMPT_FUSION && (
          <PromptFusion
            analysis={analysis}
            strategyType={strategyType}
            finalPrompts={finalPrompts}
            globalSelectedFont={globalSelectedFont}
            setGlobalSelectedFont={setGlobalSelectedFont}
            cardRefImages={cardRefImages}
            handleCardRefImage={handleCardRefImage}
            cardGenStatus={cardGenStatus}
            cardGeneratedImages={cardGeneratedImages}
            setActiveGenCardId={setActiveGenCardId}
            updatePromptCopy={updatePromptCopy}
            updatePromptPlacement={updatePromptPlacement}
            downloadImage={downloadImage}
            setHoveredPreviewImage={setHoveredPreviewImage}
            setStep={setStep}
            PLACEMENT_OPTIONS={PLACEMENT_OPTIONS}
          />
        )}
      </main>

        {(isBulkGenActive || activeGenCardId) && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => { setActiveGenCardId(null); setIsBulkGenActive(false); }}></div>
            <div className="relative w-full max-w-2xl bg-white rounded-[40px] shadow-2xl overflow-hidden animate-scale-up">
              <div className="p-8 border-b border-black/5 flex justify-between items-center bg-[#fbfbfd]">
                <div>
                  <h2 className="text-2xl font-black tracking-tight text-black">
                    {isBulkGenActive ? '全案批量渲染配置' : '单图渲染方案配置'}
                  </h2>
                  <p className="text-[11px] text-[#86868b] font-bold mt-1 uppercase tracking-widest">
                    {isBulkGenActive ? `正在为 ${finalPrompts.length} 个场景注入审美基因` : `正在为 "${activeGenCard?.title}" 注入审美基因`}
                  </p>
                </div>
                <button onClick={() => { setActiveGenCardId(null); setIsBulkGenActive(false); }} className="w-10 h-10 rounded-full bg-black/5 flex items-center justify-center hover:bg-black hover:text-white transition-all">
                  <i className="fas fa-times"></i>
                </button>
              </div>

              <div className="p-10 space-y-10 max-h-[70vh] overflow-y-auto no-scrollbar">
                <div>
                  <label className="section-label mb-4 block text-black/60 font-black tracking-widest uppercase text-[10px]">渲染引擎 / ENGINE</label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {Object.entries(MODEL_COSTS).map(([key, cfg]) => {
                      const isSelected = genModel === key;
                      const minPrice = Math.min(...Object.values(cfg.resolutions).map(r => r.rmb));
                      const hasMultiple = Object.keys(cfg.resolutions).length > 1;
                      return (
                        <button 
                          key={key}
                          onClick={() => setGenModel(key)} 
                          className={`p-6 rounded-2xl border-2 text-left transition-all duration-500 relative overflow-hidden ${isSelected ? 'border-black bg-black text-white shadow-lg scale-[1.02]' : 'border-[#F5F5F7] bg-[#F5F5F7] hover:border-black/10'}`}
                        >
                          <div className={`text-[15px] font-black ${isSelected ? 'text-white' : 'text-black'}`}>{cfg.name}</div>
                          <div className={`text-[9px] mt-1 font-bold uppercase tracking-widest ${isSelected ? 'text-white/60' : 'text-black/40'}`}>{cfg.label}</div>
                          <div className={`text-[11px] mt-4 font-black ${isSelected ? 'text-[#0071e3]' : 'text-[#0071e3]'}`}>
                            ¥{minPrice.toFixed(2)}{hasMultiple ? '起' : ''}/图
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="section-label mb-4 block text-black/60 font-black tracking-widest uppercase text-[10px]">渲染精度 / RESOLUTION</label>
                  <div className="flex flex-wrap gap-3">
                    {Object.keys(MODEL_COSTS[genModel].resolutions).map(res => {
                      const isSelected = genResolution === res;
                      const price = MODEL_COSTS[genModel].resolutions[res].rmb;
                      return (
                        <button 
                          key={res} 
                          onClick={() => setGenResolution(res)} 
                          className={`px-6 py-3 rounded-xl text-[13px] font-black transition-all border-2 duration-500 ${isSelected ? 'bg-black text-white border-black scale-105 shadow-md' : 'bg-[#F5F5F7] border-transparent opacity-60 hover:opacity-100 hover:border-black/10'}`}
                        >
                          <span>{res}</span>
                          <span className={`ml-2 text-[9px] opacity-50 font-bold`}>¥{price.toFixed(2)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="section-label mb-4 block text-black/60 font-black tracking-widest uppercase text-[10px]">构图比例 / ASPECT RATIO</label>
                  <div className="flex flex-wrap gap-3">
                    {['1:1', '16:9', '9:16', '4:3', '3:4'].map(r => {
                      const isSelected = genAspectRatio === r;
                      return (
                        <button 
                          key={r} 
                          onClick={() => setGenAspectRatio(r)} 
                          className={`px-6 py-3 rounded-xl text-[13px] font-black transition-all border-2 duration-500 ${isSelected ? 'bg-black text-white border-black scale-105 shadow-md' : 'bg-[#F5F5F7] border-transparent opacity-60 hover:opacity-100 hover:border-black/10'}`}
                        >
                          {r}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {isBulkGenActive ? (
                  <div>
                    <label className="section-label mb-4 block text-black/60 font-black tracking-widest uppercase text-[10px]">全案统一特征参考 / Global Ref</label>
                    <div className="p-6 rounded-[24px] bg-[#F5F5F7] border border-black/5 flex items-center justify-between shadow-inner">
                      <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-[18px] bg-white border border-black/10 overflow-hidden flex items-center justify-center shadow-md">
                          {bulkRefImage ? <img src={bulkRefImage} className="w-full h-full object-cover" /> : <i className="fas fa-image opacity-20 text-xl"></i>}
                        </div>
                        <div>
                          <p className="text-[14px] font-black text-black">全案统一特征参考</p>
                          <p className="text-[11px] text-[#86868b] font-bold">{bulkRefImage ? '已同步到所有卡片' : '未上传 (每一屏可独立上传)'}</p>
                        </div>
                      </div>
                      <div className="flex gap-4">
                         {bulkRefImage && (
                           <button 
                             onClick={() => setBulkRefImage(null)} 
                             className="text-[10px] font-black text-red-500 mr-2"
                           >
                             清除
                           </button>
                         )}
                         <button onClick={() => document.getElementById('bulk-ref-up')?.click()} className="text-[10px] font-black text-[#0071e3] border-b border-[#0071e3] py-0.5">上传图片</button>
                      </div>
                      <input id="bulk-ref-up" type="file" className="hidden" onChange={handleBulkRefImage} />
                    </div>
                  </div>
                ) : null}

                <div className="pt-4 border-t border-black/5">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[12px] font-bold text-[#86868b]">任务规模</span>
                    <span className="text-[12px] font-black text-black">{isBulkGenActive ? `${finalPrompts.length} 张图片 (全案)` : '1 张图片 (单图)'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[12px] font-bold text-[#86868b]">预计总费用</span>
                    <span className="text-[16px] font-black text-[#0071e3]">
                      约 ¥{(MODEL_COSTS[genModel].resolutions[genResolution]?.rmb * (isBulkGenActive ? finalPrompts.length : 1)).toFixed(2)}
                    </span>
                  </div>
                </div>

                <button 
                  onClick={isBulkGenActive ? executeBulkGen : executeImageGen} 
                  disabled={isBulkLoading || loading || (!isBulkGenActive && !activeGenCardId)}
                  className={`w-full py-6 rounded-[32px] text-[16px] font-black flex items-center justify-center gap-3 transition-all shadow-2xl ${isBulkLoading ? 'bg-orange-500 text-white animate-breathe-orange' : 'bg-black text-white hover:scale-[1.02] active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed'}`}
                >
                  {isBulkLoading ? (
                    <>
                      <i className="fas fa-circle-notch fa-spin"></i>
                      <span>正在注入审美基因并渲染...</span>
                    </>
                  ) : (
                    <>
                      <i className={isBulkGenActive ? 'fas fa-bolt' : 'fas fa-wand-magic-sparkles'}></i>
                      <span>{isBulkGenActive ? '立即开始全案批量渲染' : '立即开始视觉渲染'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

      {/* 页脚 */}
      <footer className="h-14 glass-nav flex items-center px-10 justify-between text-[10px] font-black tracking-widest text-[#86868b] border-t border-black/5">
        <div className="flex items-center gap-6">
          <span className="flex items-center gap-2.5"><div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-md"></div> RENDER ENGINE READY</span>
          <span className="opacity-50 uppercase">Architect Core V3.3 · Mode: {strategyType === StrategyType.DETAIL ? 'Detail Story' : 'Marketing Impact'}</span>
        </div>
        <div className="opacity-40 uppercase">Copyright © 2025 BANFULY Visual LAB.</div>
      </footer>
    </div>
  );
};

export default App;
