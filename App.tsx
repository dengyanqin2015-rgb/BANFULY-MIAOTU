
import React, { useState, useEffect } from 'react';

declare global {
  interface Window {
    aistudio: {
      openSelectKey: () => void;
      hasSelectedApiKey: () => Promise<boolean>;
    };
  }
}

import * as XLSX from 'xlsx';
import { cn } from './src/lib/utils';
import { AppStep, VisualConstitution, ProductAnalysis, FinalPrompt, StrategyType, Storyboard, User, AuthState, RechargeLog, GenerationLog, SingleToolMode, ImageDeconstruction, ImageHistory, DetailStoryboard } from './types';
import { decodeStyle, analyzeProduct, fusePrompts, generateEcomImage, /* regenerateSinglePrompt, */ deconstructImage, segmentImage, detailAssistantStep1, detailAssistantStep2, detailAssistantStep3, regenerateSingleDetailStoryboard, updateDetailPromptFromFields } from './geminiService';
import { WorkflowCanvas } from './src/components/WorkflowCanvas';

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

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#000] flex items-center justify-center p-8 text-center">
          <div className="max-w-md space-y-6">
            <div className="w-20 h-20 bg-red-500/20 rounded-3xl flex items-center justify-center mx-auto mb-8">
              <i className="fas fa-exclamation-triangle text-3xl text-red-500"></i>
            </div>
            <h1 className="text-3xl font-black text-white tracking-tight">应用运行异常</h1>
            <p className="text-[#86868b] text-sm leading-relaxed">
              很抱歉，程序在运行过程中遇到了一个不可预期的错误。这可能是由于网络波动或组件加载失败导致的。
            </p>
            <div className="bg-[#1c1c1e] rounded-2xl p-4 text-left overflow-auto max-h-40">
              <code className="text-xs text-red-400 font-mono">
                {this.state.error?.toString()}
              </code>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-4 bg-white text-black rounded-2xl font-bold hover:scale-[1.02] active:scale-95 transition-all"
            >
              重新加载应用
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const App: React.FC = () => {
  const [step, setStep] = useState<AppStep>(AppStep.WORKFLOW);
  const [model, setModel] = useState('gemini-3-flash-preview');
  const [loading, setLoading] = useState(false);
  const [userApiKey, setUserApiKey] = useState<string>(() => {
    return localStorage.getItem('user_gemini_api_key') || process.env.GEMINI_API_KEY || '';
  });
  const [paidImageApiKey, setPaidImageApiKey] = useState<string>(() => {
    return localStorage.getItem('user_paid_image_api_key') || '';
  });
  const [doubaoApiKey, setDoubaoApiKey] = useState<string>(() => {
    return localStorage.getItem('user_doubao_api_key') || '';
  });
  const [doubaoModelId, setDoubaoModelId] = useState<string>(() => {
    return localStorage.getItem('user_doubao_model_id') || '';
  });
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);

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

  // 替换模式状态
  const [replacementBaseImage, setReplacementBaseImage] = useState<string | null>(null);
  const [segmentedObjects, setSegmentedObjects] = useState<SegmentedObject[]>([]);
  const [isSegmenting, setIsSegmenting] = useState(false);
  const [backgroundFidelity, setBackgroundFidelity] = useState(0.8);
  
  // 详情助手状态
  const [detailStep, setDetailStep] = useState<1 | 2 | 3>(1);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailProductAnalysis, setDetailProductAnalysis] = useState<string>('');
  const [detailDesignGuide, setDetailDesignGuide] = useState<string>('');
  const [detailScreenCount, setDetailScreenCount] = useState<number>(6);
  const [detailStoryboards, setDetailStoryboards] = useState<DetailStoryboard[]>([]);
  const [zoomedImageUrl, setZoomedImageUrl] = useState<string | null>(null);
  const [detailZoomScale, setDetailZoomScale] = useState(1);
  const [detailZoomOffset, setDetailZoomOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (zoomedImageUrl) {
      document.body.style.overflow = 'hidden';
      setDetailZoomScale(1);
      setDetailZoomOffset({ x: 0, y: 0 });
    } else {
      document.body.style.overflow = 'auto';
    }
  }, [zoomedImageUrl]);

  const handleDetailZoom = (e: React.WheelEvent) => {
    if (!zoomedImageUrl) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    const newScale = Math.min(Math.max(detailZoomScale + delta, 0.5), 5);
    setDetailZoomScale(newScale);
  };

  const handlePanStart = (e: React.MouseEvent) => {
    if (detailZoomScale <= 1) return;
    setIsPanning(true);
    setPanStart({ x: e.clientX - detailZoomOffset.x, y: e.clientY - detailZoomOffset.y });
  };

  const handlePanMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    setDetailZoomOffset({
      x: e.clientX - panStart.x,
      y: e.clientY - panStart.y
    });
  };

  const handlePanEnd = () => {
    setIsPanning(false);
  };

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

  interface ModelCost {
    name: string;
    label: string;
    resolutions: {
      [key: string]: { cost: number; rmb: number };
    };
  }

  const MODEL_COSTS: Record<string, ModelCost> = {
    'nanobanana': { 
      name: 'FLASH 2.5', 
      label: 'BALANCED',
      resolutions: {
        '1K': { cost: 0.039, rmb: 0.3 }
      }
    },
    'nanobanana2': { 
      name: 'FLASH 3.1', 
      label: 'HIGH FIDELITY',
      resolutions: {
        '0.5K': { cost: 0.045, rmb: 0.3 },
        '1K': { cost: 0.067, rmb: 0.5 },
        '2K': { cost: 0.101, rmb: 0.7 },
        '4K': { cost: 0.151, rmb: 1.1 }
      }
    },
    'nanobanana pro': { 
      name: 'PRO 3.0', 
      label: 'CINEMA GRADE',
      resolutions: {
        '1K': { cost: 0.134, rmb: 1.0 },
        '2K': { cost: 0.134, rmb: 1.0 },
        '4K': { cost: 0.24, rmb: 1.7 }
      }
    },
    'doubao-pro-v1': {
      name: 'Doubao-Seedream-5.0-lite',
      label: 'BYTEDANCE',
      resolutions: {
        '1K': { cost: 0.067, rmb: 0.3 },
        '2K': { cost: 0.067, rmb: 0.3 },
        '4K': { cost: 0.067, rmb: 0.3 }
      }
    }
  };
  
  // 原图预览状态
  // const [hoveredPreviewImage, setHoveredPreviewImage] = useState<{ url: string, title: string } | null>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch('/api/auth/me', { headers });
      if (res.ok) {
        const user = await res.json();
        setAuth({ user, token: token || 'session', loading: false });
      } else {
        setAuth({ user: null, token: null, loading: false });
        if (res.status === 401 || res.status === 403) {
          localStorage.removeItem('auth_token');
        }
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
        localStorage.setItem('auth_token', data.token);
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
    localStorage.removeItem('auth_token');
    setAuth({ user: null, token: null, loading: false });
    setStep(AppStep.FULL_PLAN);
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
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch('/api/user/deduct-credit', { 
        method: 'POST',
        headers,
        body: JSON.stringify({ amount })
      });
      if (res.ok) {
        const data = await res.json();
        setAuth(prev => ({ ...prev, user: prev.user ? { ...prev.user, credits: data.credits } : null }));
        return true;
      } else {
        const data = await res.json();
        if (res.status === 401 || res.status === 403) {
          alert('登录已失效，请重新登录');
          localStorage.removeItem('auth_token');
          setAuth({ user: null, token: null, loading: false });
        } else {
          alert(data.message || '点数不足');
        }
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

  const updateDetailStoryboard = <K extends keyof DetailStoryboard>(id: string, field: K, value: DetailStoryboard[K]) => {
    setDetailStoryboards(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
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

  const runDetailStep1 = async () => {
    if (productImages.length === 0) {
      alert("请先上传产品图");
      return;
    }
    setDetailLoading(true);
    try {
      const res = await detailAssistantStep1(productImages, productKeywords, model, userApiKey);
      setDetailProductAnalysis(res);
      setDetailStep(2);
    } catch (err: unknown) {
      const error = err as Error;
      alert("产品识别失败: " + error.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const runDetailStep2 = async () => {
    if (!detailProductAnalysis) return;
    setDetailLoading(true);
    try {
      const res = await detailAssistantStep2(detailProductAnalysis, productKeywords, model, userApiKey);
      setDetailDesignGuide(res);
      setDetailStep(3);
    } catch (err: unknown) {
      const error = err as Error;
      alert("生成设计规范失败: " + error.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const runDetailStep3 = async () => {
    if (!detailDesignGuide) return;
    setDetailLoading(true);
    try {
      const res = await detailAssistantStep3(detailDesignGuide, productKeywords, detailScreenCount, model, userApiKey);
      setDetailStoryboards(res);
    } catch (err: unknown) {
      const error = err as Error;
      alert("生成架构方案失败: " + error.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const runDetailRegenStoryboard = async (id: string) => {
    const sb = detailStoryboards.find(s => s.id === id);
    if (!sb || !detailDesignGuide) return;
    
    setDetailStoryboards(prev => prev.map(s => s.id === id ? { ...s, status: 'loading' } : s));
    try {
      const res = await regenerateSingleDetailStoryboard(detailDesignGuide, sb, productKeywords, model, userApiKey);
      // Keep existing images and ID
      setDetailStoryboards(prev => prev.map(s => s.id === id ? { 
        ...res, 
        id: s.id, 
        refImage: s.refImage, 
        generatedImage: s.generatedImage,
        status: 'idle' 
      } : s));
    } catch (err: unknown) {
      const error = err as Error;
      alert("重新生成失败: " + error.message);
      setDetailStoryboards(prev => prev.map(s => s.id === id ? { ...s, status: 'error' } : s));
    }
  };

  const runDetailUpdatePrompt = async (id: string) => {
    const sb = detailStoryboards.find(s => s.id === id);
    if (!sb || !detailDesignGuide) return;
    
    try {
      const newPrompt = await updateDetailPromptFromFields(detailDesignGuide, sb, model, userApiKey);
      updateDetailStoryboard(id, 'prompt', newPrompt);
    } catch (err: unknown) {
      console.error("更新提示词失败", err);
    }
  };

  const runDetailGenImage = async (id: string) => {
    const sb = detailStoryboards.find(s => s.id === id);
    if (!sb) return;

    if (!userApiKey) {
      alert("请先配置 API Key（点击右上角设置图标）");
      return;
    }

    if (!auth.user) {
      alert("请先登录");
      return;
    }

    const cost = (MODEL_COSTS[genModel as keyof typeof MODEL_COSTS].resolutions as Record<string, { rmb: number }>)[genResolution].rmb;
    if (auth.user.credits < cost) {
      alert(`点数不足，本次生成需要 ${cost} 点，当前剩余 ${auth.user.credits} 点`);
      return;
    }

    setDetailStoryboards(prev => prev.map(s => s.id === id ? { ...s, status: 'loading' } : s));
    
    try {
      console.log(`[DetailGen] Starting generation for storyboard ${id}. Model: ${genModel}, Resolution: ${genResolution}`);
      const refImage = sb.refImage || (productImages.length > 0 ? productImages[0] : undefined);

      const imageUrl = await generateEcomImage({
        prompt: sb.prompt,
        model: genModel,
        aspectRatio: genAspectRatio,
        imageSize: genResolution,
        refImageB64: refImage,
        apiKey: userApiKey
      });

      if (imageUrl) {
        console.log(`[DetailGen] Successfully generated image for storyboard ${id}`);
        // 成功后扣除点数
        const hasCredits = await deductCredit(cost);
        if (!hasCredits) {
          // 如果扣费失败（可能是网络问题或并发导致），虽然图生成了，但状态设为错误
          setDetailStoryboards(prev => prev.map(s => s.id === id ? { ...s, status: 'error' } : s));
          return;
        }

        setDetailStoryboards(prev => prev.map(s => s.id === id ? { ...s, generatedImage: imageUrl, status: 'done' } : s));
        if (auth.user) {
          fetch('/api/user/history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageUrl, prompt: sb.prompt })
          }).catch(console.error);
        }
      } else {
        console.error(`[DetailGen] generateEcomImage returned undefined for storyboard ${id}`);
        alert("生成失败：AI 未能返回图像。请检查 API Key 权限或尝试更换模型。");
        setDetailStoryboards(prev => prev.map(s => s.id === id ? { ...s, status: 'error' } : s));
      }
    } catch (err: unknown) {
      console.error(`[DetailGen] Error generating image for storyboard ${id}:`, err);
      const error = err as Error;
      
      if (error.message?.includes("Requested entity was not found") && typeof window !== 'undefined' && window.aistudio) {
        alert("模型未找到或 API Key 无权访问。请重新选择有效的 API Key。");
        window.aistudio.openSelectKey();
      } else {
        alert(`生成出错: ${error.message || '未知错误'}`);
      }
      
      setDetailStoryboards(prev => prev.map(s => s.id === id ? { ...s, status: 'error' } : s));
    }
  };

  const runDetailBulkGen = async () => {
    if (detailStoryboards.length === 0) return;
    
    // 限制并发数为 3
    const concurrencyLimit = 3;
    const pendingIds = detailStoryboards
      .filter(sb => sb.status !== 'done')
      .map(sb => sb.id);
    
    for (let i = 0; i < pendingIds.length; i += concurrencyLimit) {
      const chunk = pendingIds.slice(i, i + concurrencyLimit);
      await Promise.all(chunk.map(id => runDetailGenImage(id)));
    }
  };

  const handleDetailRefImageChange = (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const b64 = event.target?.result as string;
      setDetailStoryboards(prev => prev.map(s => s.id === id ? { ...s, refImage: b64 } : s));
    };
    reader.readAsDataURL(file);
  };

  const runDetailBulkDownload = () => {
    detailStoryboards.forEach((sb, idx) => {
      if (sb.generatedImage) {
        downloadImage(sb.generatedImage, `${sb.title}-${idx + 1}`);
      }
    });
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
      
      setStep(AppStep.FULL_PLAN);
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
      const cost = (MODEL_COSTS[genModel as keyof typeof MODEL_COSTS].resolutions as Record<string, { rmb: number }>)[genResolution].rmb;
      if (auth.user && auth.user.credits < cost) {
        alert(`点数不足，本次生成需要 ${cost} 点，当前剩余 ${auth.user.credits} 点`);
        setCardGenStatus(prev => ({ ...prev, [cardId]: 'idle' }));
        return;
      }

      const res = await generateEcomImage({
        prompt: assembledPrompt,
        model: genModel,
        aspectRatio: genAspectRatio,
        imageSize: genResolution,
        refImageB64: overrideRefImage || cardRefImages[cardId],
        apiKey: userApiKey
      });
      if (res) {
        // 成功后扣除点数
        await deductCredit(cost);
        // 保存到历史记录
        await saveToHistory(res, assembledPrompt);
        setCardGeneratedImages(prev => ({ ...prev, [cardId]: res }));
        setCardGenStatus(prev => ({ ...prev, [cardId]: 'done' }));
      } else {
        alert("生成失败，请检查 API Key 或尝试更换模型。");
        setCardGenStatus(prev => ({ ...prev, [cardId]: 'error' }));
      }
    } catch (err: unknown) {
      const error = err as Error;
      console.error("[generateSingleImage] Error:", error);
      if (error.message?.includes("Requested entity was not found") && typeof window !== 'undefined' && window.aistudio) {
        alert("模型未找到或 API Key 无权访问。请重新选择有效的 API Key。");
        window.aistudio.openSelectKey();
      } else {
        alert(`生成失败: ${error.message || '请重试'}`);
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
      const res = await fetch('/api/user/history/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
      });
      if (res.ok) {
        setImageHistory(prev => prev.filter(h => !selectedHistoryIds.has(h.id)));
        setSelectedHistoryIds(new Set());
      } else {
        alert("删除失败");
      }
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
        apiKey: userApiKey
      });

      if (imageUrl) {
        setSingleGeneratedImage(imageUrl);
        await deductCredit(cost);
        await saveToHistory(imageUrl, finalPrompt);
      } else {
        alert("生成失败，请检查 API Key 或尝试更换模型。");
      }
    } catch (err: unknown) {
      const error = err as Error;
      console.error("[runSingleGeneration] Error:", error);
      if (error.message?.includes("Requested entity was not found") && typeof window !== 'undefined' && window.aistudio) {
        alert("模型未找到或 API Key 无权访问。请重新选择有效的 API Key。");
        window.aistudio.openSelectKey();
      } else {
        alert(`生成失败: ${error.message || '请重试'}`);
      }
    } finally {
      setIsGeneratingSingle(false);
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
        apiKey: userApiKey
      });

      if (imageUrl) {
        setSingleGeneratedImage(imageUrl);
        await deductCredit(cost);
        await saveToHistory(imageUrl, finalPrompt);
      } else {
        alert("生成失败，请检查 API Key 或尝试更换模型。");
      }
    } catch (err: unknown) {
      const error = err as Error;
      console.error("[runReplacementGeneration] Error:", error);
      if (error.message?.includes("Requested entity was not found") && typeof window !== 'undefined' && window.aistudio) {
        alert("模型未找到或 API Key 无权访问。请重新选择有效的 API Key。");
        window.aistudio.openSelectKey();
      } else {
        alert(`生成失败: ${error.message || '请重试'}`);
      }
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
    <div className={cn("h-screen flex flex-col selection:bg-black selection:text-white overflow-hidden")}>
      {/* 导航栏 */}
      <header className="h-14 glass-nav flex items-center justify-between px-8 sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-6">
          <div className="text-lg font-extrabold tracking-tighter text-black cursor-pointer" onClick={() => setStep(AppStep.FULL_PLAN)}>BANFULY <span className="text-[#6e6e73] font-light">ARCHITECT</span></div>
          <div className="step-capsule flex gap-1 items-center bg-[#F5F5F7] border border-black/5 shadow-inner">
            {[
              { id: AppStep.WORKFLOW, label: '创意工作流' },
              { id: AppStep.FULL_PLAN, label: '全案策划' },
              { id: AppStep.DETAIL_ASSISTANT, label: '详情助手' },
              { id: AppStep.SINGLE_TOOL, label: '单图灵活工具' },
              { id: AppStep.HISTORY, label: '生图历史' },
              { id: AppStep.PROFILE, label: '个人中心' },
              ...(auth.user.role === 'admin' ? [{ id: AppStep.ADMIN_PANEL, label: '管理后台' }] : [])
            ].map((s) => (
              <button
                key={s.id}
                disabled={step < s.id && s.id !== AppStep.ADMIN_PANEL && s.id !== AppStep.PROFILE && s.id !== AppStep.HISTORY && s.id !== AppStep.SINGLE_TOOL && s.id !== AppStep.DETAIL_ASSISTANT && s.id !== AppStep.FULL_PLAN && s.id !== AppStep.WORKFLOW}
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
          </div>
          <button 
            onClick={() => setShowApiKeyModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-[#F5F5F7] text-[#0071e3] border border-[#0071e3]/20 hover:bg-[#0071e3]/5 transition-all shadow-sm"
          >
            <i className="fas fa-key"></i>
            {(userApiKey || paidImageApiKey || doubaoApiKey) ? '已配置 Key' : '配置 API Key'}
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

      <main className={cn("flex-1 w-full mx-auto relative", step === AppStep.WORKFLOW ? "h-[calc(100vh-112px)] max-w-none px-0 py-0 overflow-hidden" : "max-w-[1440px] px-8 py-8 overflow-y-auto")}>
        {step === AppStep.DETAIL_ASSISTANT && (
          <div className="animate-slide-up">
            <div className="flex items-end justify-between mb-10">
              <div>
                <div className="section-label mb-3 text-[#FF7F00]">Detail Assistant</div>
                <h1 className="text-4xl font-black tracking-tighter text-black">详情助手</h1>
                <p className="text-[#86868b] text-sm mt-2">基于产品特性，自动生成详情页设计规范与分镜架构</p>
              </div>
            </div>

            <div className="space-y-8">
              {/* Top Row: Recognition & Specification */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Step 1: Product Recognition */}
                <div className="apple-card p-8 bg-white border-black/10 shadow-xl flex flex-col min-h-[500px]">
                  <div className="flex items-center justify-between mb-6">
                    <div className="section-label text-[#FF7F00]">Node 01 / Recognition</div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${detailProductAnalysis ? 'bg-orange-100 text-[#FF7F00]' : 'bg-gray-100 text-gray-400'}`}>
                      {detailProductAnalysis ? '已完成' : '进行中'}
                    </span>
                  </div>
                  <h2 className="text-xl font-black mb-4 tracking-tight">产品特性识别 <span className="text-[#86868b]">深度解析核心卖点</span></h2>
                  
                  <div className="bg-[#F5F5F7] p-4 rounded-2xl border border-black/5 mb-6">
                    <label className="section-label text-[9px] mb-3 block text-black font-black uppercase tracking-widest">上传产品白底图 (最多6张)</label>
                    <div className="grid grid-cols-3 gap-2">
                      {productImages.map((img, idx) => (
                        <div key={idx} className="aspect-square rounded-lg bg-white border border-black/10 relative group overflow-hidden shadow-sm">
                          <img src={img} className="w-full h-full object-contain p-1" />
                          <button onClick={() => removeProductImage(idx)} className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/70 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 scale-75 hover:bg-black transition-all"><i className="fas fa-times text-[8px]"></i></button>
                        </div>
                      ))}
                      {productImages.length < 6 && (
                        <div className="aspect-square rounded-lg border-2 border-dashed border-black/15 hover:border-[#FF7F00]/30 flex flex-col items-center justify-center cursor-pointer bg-white transition-all group" onClick={() => document.getElementById('detail-prod-upload')?.click()}>
                          <i className="fas fa-plus opacity-20 group-hover:opacity-100 mb-0.5 text-xs"></i>
                          <span className="text-[8px] font-bold opacity-30 group-hover:opacity-100 uppercase">添加</span>
                        </div>
                      )}
                      <input id="detail-prod-upload" type="file" multiple className="hidden" onChange={handleMultipleFilesChange} />
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto max-h-[250px] mb-6 prose-orange border-t border-black/5 pt-4 no-scrollbar">
                    {detailProductAnalysis ? (
                      <textarea 
                        className="w-full h-full bg-transparent text-[13px] font-medium text-black leading-relaxed border-none focus:ring-0 p-0 outline-none resize-none no-scrollbar"
                        value={detailProductAnalysis}
                        onChange={(e) => setDetailProductAnalysis(e.target.value)}
                        placeholder="产品识别结果..."
                      />
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-[#86868b] opacity-40 italic py-10">
                        <i className="fas fa-microchip text-4xl mb-4"></i>
                        <p>等待识别产品...</p>
                      </div>
                    )}
                  </div>
                  <button 
                    onClick={runDetailStep1} 
                    disabled={detailLoading || productImages.length === 0}
                    className={`btn-primary w-full py-4 text-white text-[13px] font-black shadow-lg hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 border-none ${productImages.length === 0 ? 'bg-gray-300 cursor-not-allowed' : 'bg-[#FF7F00]'}`}
                  >
                    {detailLoading && detailStep === 1 ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-microchip"></i>}
                    开始识别产品
                  </button>
                </div>

                {/* Step 2: Design Specification */}
                <div className="apple-card p-8 bg-white border-black/10 shadow-xl flex flex-col min-h-[500px]">
                  <div className="flex items-center justify-between mb-6">
                    <div className="section-label text-[#FF7F00]">Node 02 / Specification</div>
                    <span className={`px-3 py-1 rounded-full text-[11px] font-black ${detailDesignGuide ? 'bg-orange-100 text-[#FF7F00]' : 'bg-gray-100 text-gray-400'}`}>
                      {detailDesignGuide ? '已完成' : '未开始'}
                    </span>
                  </div>
                  <h2 className="text-xl font-black mb-4 tracking-tight">详情设计规范 <span className="text-[#86868b]">大师级视觉基调</span></h2>
                  
                  <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar pb-2 border-b border-black/5">
                    {productImages.map((img, idx) => (
                      <div key={idx} className="w-10 h-10 rounded-lg bg-[#F5F5F7] border border-black/5 flex-shrink-0 overflow-hidden">
                        <img src={img} className="w-full h-full object-contain p-1" />
                      </div>
                    ))}
                    {productImages.length === 0 && <div className="text-[10px] text-gray-400 italic">未上传产品图</div>}
                  </div>

                  <div className="flex-1 overflow-y-auto max-h-[250px] mb-6 prose-orange no-scrollbar">
                    {detailDesignGuide ? (
                      <textarea 
                        className="w-full h-full bg-transparent text-[13px] font-medium text-black leading-relaxed border-none focus:ring-0 p-0 outline-none resize-none no-scrollbar"
                        value={detailDesignGuide}
                        onChange={(e) => setDetailDesignGuide(e.target.value)}
                        placeholder="设计规范结果..."
                      />
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-[#86868b] opacity-40 italic py-10">
                        <i className="fas fa-drafting-compass text-4xl mb-4"></i>
                        <p>等待生成规范...</p>
                      </div>
                    )}
                  </div>
                  <button 
                    onClick={runDetailStep2} 
                    disabled={detailLoading || !detailProductAnalysis}
                    className={`btn-primary w-full py-4 text-white text-[13px] font-black shadow-lg hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 border-none ${!detailProductAnalysis ? 'bg-gray-300 cursor-not-allowed' : 'bg-[#FF7F00]'}`}
                  >
                    {detailLoading && detailStep === 2 ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-drafting-compass"></i>}
                    生成设计规范
                  </button>
                </div>
              </div>

              {/* Bottom Row: Screen Structure (Full Width) */}
              <div className="apple-card p-8 bg-white border-black/10 shadow-xl flex flex-col min-h-[600px]">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <div className="section-label text-[#FF7F00] mb-2">Node 03 / Structure</div>
                    <h2 className="text-2xl font-black tracking-tight">分镜架构方案 <span className="text-[#86868b]">电商详情设计大师版</span></h2>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="bg-[#F5F5F7] p-1.5 rounded-2xl border border-black/5 flex gap-1">
                      {[3, 6, 9, 12].map(num => (
                        <button 
                          key={num}
                          onClick={() => setDetailScreenCount(num)}
                          className={`px-4 py-2 rounded-xl text-[12px] font-black transition-all ${detailScreenCount === num ? 'bg-white text-black shadow-md' : 'text-[#86868b] hover:text-black'}`}
                        >
                          {num} 屏
                        </button>
                      ))}
                    </div>
                    <span className={`px-3 py-1 rounded-full text-[11px] font-black ${detailStoryboards.length > 0 ? 'bg-orange-100 text-[#FF7F00]' : 'bg-gray-100 text-gray-400'}`}>
                      {detailStoryboards.length > 0 ? '已完成' : '未开始'}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col lg:flex-row gap-10 flex-1">
                  {/* Left Sidebar: Controls (20%) */}
                  <div className="w-full lg:w-[22%] space-y-10 border-r border-black/5 pr-8">
                    <div>
                      <label className="section-label mb-6 block text-black/60 font-black tracking-widest uppercase text-[10px]">渲染引擎 / ENGINE</label>
                      <div className="flex flex-col gap-3">
                        {Object.entries(MODEL_COSTS).map(([key, cfg]) => {
                          const isSelected = genModel === key;
                          const currentPrice = cfg.resolutions[genResolution]?.rmb || Object.values(cfg.resolutions)[0].rmb;
                          return (
                            <button 
                              key={key}
                              onClick={() => setGenModel(key)} 
                              className={`p-4 rounded-2xl border-2 text-left transition-all duration-300 flex flex-col gap-1 ${isSelected ? 'border-black bg-black text-white shadow-xl scale-[1.02]' : 'border-[#F5F5F7] bg-[#F5F5F7] hover:border-black/10'}`}
                            >
                              <div className="flex justify-between items-start">
                                <div className={`text-[13px] font-black ${isSelected ? 'text-white' : 'text-black'}`}>{cfg.name}</div>
                                <div className={`text-[10px] font-black ${isSelected ? 'text-[#FF7F00]' : 'text-[#0071e3]'}`}>¥{currentPrice.toFixed(1)}</div>
                              </div>
                              <div className={`text-[9px] font-bold uppercase tracking-widest ${isSelected ? 'text-white/60' : 'text-black/40'}`}>{cfg.label}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <label className="section-label mb-6 block text-black/60 font-black tracking-widest uppercase text-[10px]">渲染精度 / RESOLUTION</label>
                      <div className="grid grid-cols-2 gap-3">
                        {Object.keys(MODEL_COSTS[genModel].resolutions).map(res => {
                          const isSelected = genResolution === res;
                          const price = MODEL_COSTS[genModel].resolutions[res].rmb;
                          return (
                            <button 
                              key={res} 
                              onClick={() => setGenResolution(res)} 
                              className={`py-3 rounded-xl text-[12px] font-black transition-all border-2 flex flex-col items-center justify-center ${isSelected ? 'bg-black text-white border-black shadow-lg' : 'bg-[#F5F5F7] border-transparent opacity-60 hover:opacity-100'}`}
                            >
                              <span>{res}</span>
                              <span className={`text-[9px] font-bold ${isSelected ? 'text-white/60' : 'text-[#0071e3]'}`}>¥{price.toFixed(1)}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <label className="section-label mb-6 block text-black/60 font-black tracking-widest uppercase text-[10px]">构图比例 / ASPECT RATIO</label>
                      <div className="grid grid-cols-2 gap-3">
                        {['1:1', '16:9', '9:16', '4:3', '3:4'].map(r => {
                          const isSelected = genAspectRatio === r;
                          return (
                            <button 
                              key={r} 
                              onClick={() => setGenAspectRatio(r)} 
                              className={`py-3 rounded-xl text-[12px] font-black transition-all border-2 flex items-center justify-center ${isSelected ? 'bg-black text-white border-black shadow-lg' : 'bg-[#F5F5F7] border-transparent opacity-60 hover:opacity-100'}`}
                            >
                              {r}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="pt-6 border-t border-black/5 space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-[11px] font-bold text-black/40 uppercase tracking-widest">预计总费用</span>
                        <span className="text-[14px] font-black text-[#0071e3]">
                          约 ¥{((MODEL_COSTS[genModel].resolutions[genResolution]?.rmb || 0) * detailScreenCount).toFixed(1)}
                        </span>
                      </div>
                      <button 
                        onClick={runDetailStep3} 
                        disabled={detailLoading || !detailDesignGuide}
                        className={`w-full py-5 rounded-[24px] text-white text-[14px] font-black shadow-2xl hover:scale-[1.02] active:scale-95 transition-all flex flex-col items-center justify-center gap-1 border-none ${!detailDesignGuide ? 'bg-gray-300 cursor-not-allowed' : 'bg-[#FF7F00]'}`}
                      >
                        <div className="flex items-center gap-2">
                          {detailLoading && detailStep === 3 ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-sitemap"></i>}
                          <span>{detailStoryboards.length > 0 ? '重新生成全案' : '生成分镜架构'}</span>
                        </div>
                        <span className="text-[9px] opacity-60 font-bold uppercase tracking-widest">Master Edition</span>
                      </button>
                    </div>
                  </div>

                  {/* Right Content: Storyboards (80%) */}
                  <div className="flex-1 overflow-y-auto max-h-[1200px] no-scrollbar">
                    {detailStoryboards.length > 0 ? (
                      <div className="space-y-12">
                        {/* 批量操作按钮 */}
                        <div className="flex gap-4 sticky top-0 bg-white/90 backdrop-blur-xl py-4 z-20 border-b border-black/5 mb-8">
                          <button 
                            onClick={runDetailBulkGen}
                            disabled={detailLoading}
                            className="flex-1 py-4 bg-black text-white rounded-2xl text-[14px] font-black shadow-2xl hover:scale-[1.02] active:scale-95 transition-all flex flex-col items-center justify-center"
                          >
                            <div className="flex items-center gap-3">
                              <i className="fas fa-magic"></i> 智能批量渲染全案
                            </div>
                            <span className="text-[10px] opacity-60 font-bold">¥{((MODEL_COSTS[genModel].resolutions[genResolution]?.rmb || 0) * detailStoryboards.filter(s => s.status !== 'done').length).toFixed(1)}</span>
                          </button>
                          <button 
                            onClick={runDetailBulkDownload}
                            className="flex-1 py-4 bg-white text-black border border-black/10 rounded-2xl text-[14px] font-black shadow-md hover:bg-gray-50 active:scale-95 transition-all flex items-center justify-center gap-3"
                          >
                            <i className="fas fa-download"></i> 批量导出视觉资产
                          </button>
                        </div>

                        <div className="grid grid-cols-1 gap-10">
                          {detailStoryboards.map((sb, idx) => (
                            <div key={sb.id} className="bg-[#F5F5F7] rounded-[40px] p-8 border border-black/5 relative flex flex-col lg:flex-row gap-8">
                              {/* Left Side: Info */}
                              <div className="flex-1 space-y-6">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <span className="w-10 h-10 flex items-center justify-center bg-black text-white rounded-2xl font-black text-sm">P{idx + 1}</span>
                                    <h3 className="text-xl font-black tracking-tight">{sb.title}</h3>
                                  </div>
                                  <button 
                                    onClick={() => runDetailRegenStoryboard(sb.id)}
                                    disabled={sb.status === 'loading'}
                                    className="w-8 h-8 rounded-full bg-white border border-black/10 flex items-center justify-center text-[#86868b] hover:text-black hover:border-black transition-all shadow-sm"
                                    title="重新生成该分镜方案"
                                  >
                                    <i className={`fas fa-sync-alt ${sb.status === 'loading' ? 'fa-spin' : ''}`}></i>
                                  </button>
                                </div>
                                
                                <div className="bg-white/50 p-6 rounded-[32px] border border-black/5 space-y-6">
                                  <div className="flex items-center justify-between">
                                    <div className="text-[10px] font-black text-black/40 uppercase tracking-widest">视觉脚本与关键词 / VISUAL SCRIPT</div>
                                    <div className="flex gap-2">
                                      <span className="px-2 py-0.5 bg-black/5 rounded text-[8px] font-bold text-black/40 uppercase">Structured</span>
                                    </div>
                                  </div>
                                  
                                  <div className="grid grid-cols-1 gap-6">
                                    <div className="space-y-4">
                                      <div className="flex items-start gap-3">
                                        <div className="w-1 h-4 bg-[#FF7F00] rounded-full mt-1 shrink-0"></div>
                                        <div className="flex-1">
                                          <div className="text-[9px] font-black text-black/30 uppercase mb-1">设计目标 & 构图</div>
                                          <div className="flex flex-col gap-1">
                                            <input 
                                              className="w-full bg-transparent text-[12px] font-bold text-black leading-relaxed border-none focus:ring-0 p-0 outline-none"
                                              value={sb.designGoal}
                                              onChange={(e) => updateDetailStoryboard(sb.id, 'designGoal', e.target.value)}
                                              onBlur={() => runDetailUpdatePrompt(sb.id)}
                                              placeholder="设计目标"
                                            />
                                            <input 
                                              className="w-full bg-transparent text-[12px] font-bold text-black/60 leading-relaxed border-none focus:ring-0 p-0 outline-none"
                                              value={sb.composition}
                                              onChange={(e) => updateDetailStoryboard(sb.id, 'composition', e.target.value)}
                                              onBlur={() => runDetailUpdatePrompt(sb.id)}
                                              placeholder="构图方案"
                                            />
                                          </div>
                                        </div>
                                      </div>

                                      <div className="flex items-start gap-3">
                                        <div className="w-1 h-4 bg-blue-500 rounded-full mt-1 shrink-0"></div>
                                        <div className="flex-1">
                                          <div className="text-[9px] font-black text-black/30 uppercase mb-1">视觉要素 (关键词) / VISUAL ELEMENTS</div>
                                          <textarea 
                                            className="w-full text-[12px] font-bold text-black leading-relaxed whitespace-pre-wrap bg-black/5 p-3 rounded-xl border border-black/5 focus:ring-2 focus:ring-blue-500/20 outline-none resize-none min-h-[60px] no-scrollbar"
                                            value={sb.visualScript || sb.elements}
                                            onChange={(e) => updateDetailStoryboard(sb.id, 'visualScript', e.target.value)}
                                            onBlur={() => runDetailUpdatePrompt(sb.id)}
                                          />
                                        </div>
                                      </div>

                                      <div className="flex items-start gap-3">
                                        <div className="w-1 h-4 bg-green-500 rounded-full mt-1 shrink-0"></div>
                                        <div className="flex-1">
                                          <div className="text-[9px] font-black text-black/30 uppercase mb-1">营销文案 / MARKETING COPY</div>
                                          <div className="space-y-2">
                                            <input 
                                              className="w-full bg-transparent text-[13px] font-black text-[#0071e3] border-none focus:ring-0 p-0 outline-none"
                                              value={sb.copy.main}
                                              onChange={(e) => updateDetailStoryboard(sb.id, 'copy', { ...sb.copy, main: e.target.value })}
                                              onBlur={() => runDetailUpdatePrompt(sb.id)}
                                              placeholder="主标题"
                                            />
                                            <input 
                                              className="w-full bg-transparent text-[11px] font-bold text-black/60 border-none focus:ring-0 p-0 outline-none"
                                              value={sb.copy.sub}
                                              onChange={(e) => updateDetailStoryboard(sb.id, 'copy', { ...sb.copy, sub: e.target.value })}
                                              onBlur={() => runDetailUpdatePrompt(sb.id)}
                                              placeholder="副标题"
                                            />
                                            <textarea 
                                              className="w-full bg-transparent text-[10px] font-medium text-black/40 italic border-none focus:ring-0 p-0 outline-none resize-none no-scrollbar"
                                              value={sb.copy.description}
                                              onChange={(e) => updateDetailStoryboard(sb.id, 'copy', { ...sb.copy, description: e.target.value })}
                                              onBlur={() => runDetailUpdatePrompt(sb.id)}
                                              placeholder="描述文案"
                                              rows={2}
                                            />
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <label className="section-label text-[10px] opacity-60">AI 视觉指令 (可微调)</label>
                                    <button 
                                      onClick={() => {
                                        navigator.clipboard.writeText(sb.prompt);
                                      }}
                                      className="text-[10px] font-bold text-[#0071e3] hover:underline flex items-center gap-1"
                                    >
                                      <i className="far fa-copy"></i> 复制指令
                                    </button>
                                  </div>
                                  <textarea 
                                    className="w-full bg-white border border-black/10 rounded-2xl p-4 text-[12px] font-bold leading-relaxed outline-none focus:ring-2 focus:ring-[#FF7F00]/20 transition-all min-h-[100px] no-scrollbar"
                                    value={sb.prompt}
                                    onChange={(e) => updateDetailStoryboard(sb.id, 'prompt', e.target.value)}
                                  />
                                </div>
                              </div>

                              {/* Right Side: Image & Actions */}
                              <div className="w-full lg:w-[320px] xl:w-[400px] space-y-4 shrink-0">
                                <div 
                                  className={`rounded-[32px] bg-white border border-black/10 relative overflow-hidden shadow-xl group/img transition-all duration-300 ${sb.generatedImage ? 'cursor-zoom-in' : 'cursor-default'} w-full`}
                                  style={{ aspectRatio: genAspectRatio.replace(':', '/') }}
                                  onClick={() => sb.generatedImage && setZoomedImageUrl(sb.generatedImage)}
                                >
                                  {sb.generatedImage ? (
                                    <>
                                      <img 
                                        src={sb.generatedImage} 
                                        className="w-full h-full object-cover transition-transform duration-500 group-hover/img:scale-105" 
                                      />
                                      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                                        <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white border border-white/30">
                                          <i className="fas fa-search-plus text-xl"></i>
                                        </div>
                                      </div>
                                      <div className="absolute bottom-4 right-4 opacity-0 group-hover/img:opacity-100 transition-opacity">
                                        <button 
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            downloadImage(sb.generatedImage!, `${sb.title}-${idx+1}`);
                                          }}
                                          className="w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center hover:scale-110 transition-all text-black"
                                        >
                                          <i className="fas fa-download"></i>
                                        </button>
                                      </div>
                                    </>
                                  ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-300">
                                      {sb.status === 'loading' ? (
                                        <div className="text-center">
                                          <i className="fas fa-circle-notch fa-spin text-3xl text-[#FF7F00] mb-3"></i>
                                          <p className="text-[10px] font-black text-[#FF7F00] uppercase tracking-widest">正在生成...</p>
                                        </div>
                                      ) : (
                                        <>
                                          <i className="fas fa-image text-4xl mb-3 opacity-10"></i>
                                          <span className="text-[10px] font-black opacity-20 uppercase tracking-widest">等待视觉渲染</span>
                                        </>
                                      )}
                                    </div>
                                  )}
                                  
                                  {sb.refImage && (
                                    <div className="absolute top-3 left-3 w-12 h-12 rounded-xl border-2 border-white shadow-2xl overflow-hidden group/ref">
                                      <img src={sb.refImage} className="w-full h-full object-cover" />
                                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/ref:opacity-100 transition-opacity">
                                        <i className="fas fa-link text-white text-[10px]"></i>
                                      </div>
                                    </div>
                                  )}
                                </div>

                                <div className="grid grid-cols-1 gap-3">
                                  <button 
                                    onClick={() => runDetailGenImage(sb.id)}
                                    disabled={sb.status === 'loading'}
                                    className={`w-full py-4 rounded-2xl text-[13px] font-black flex flex-col items-center justify-center transition-all shadow-lg ${sb.status === 'loading' ? 'bg-[#F5F5F7] text-[#86868b]' : 'bg-black text-white hover:scale-[1.02]'}`}
                                  >
                                    <div className="flex items-center gap-2">
                                      {sb.status === 'loading' ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-bolt"></i>}
                                      <span>{sb.generatedImage ? '重新渲染' : '开始渲染'}</span>
                                    </div>
                                    <span className="text-[9px] opacity-60 font-bold">¥{(MODEL_COSTS[genModel].resolutions[genResolution]?.rmb || 0).toFixed(1)}</span>
                                  </button>
                                  <button 
                                    onClick={() => document.getElementById(`ref-upload-${sb.id}`)?.click()}
                                    className="w-full py-4 bg-white border border-black/10 rounded-2xl text-[13px] font-black hover:bg-gray-50 active:scale-95 transition-all flex items-center justify-center gap-2 shadow-sm"
                                  >
                                    <i className="fas fa-image"></i> 指定参考图
                                  </button>
                                  <input 
                                    id={`ref-upload-${sb.id}`} 
                                    type="file" 
                                    className="hidden" 
                                    onChange={(e) => handleDetailRefImageChange(sb.id, e)} 
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-[#86868b] opacity-40 italic py-40">
                        <i className="fas fa-layer-group text-6xl mb-6"></i>
                        <p className="text-lg">等待输出分镜架构方案...</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

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
                  disabled
                  className="px-6 py-2 rounded-lg text-[12px] font-black text-[#86868b] opacity-40 cursor-not-allowed"
                >
                  待开发模式 2
                </button>
              </div>
            </div>

            {singleToolMode === SingleToolMode.REFERENCE && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* 左侧：参考图与解构 */}
                <div className="lg:col-span-5 space-y-8">
                  <div className="apple-card p-8 bg-white border-black/10 shadow-xl">
                    <div className="section-label mb-6 text-[#0071e3]">Step 01 / Reference Image</div>
                    <h2 className="text-2xl font-black mb-6 tracking-tight">上传参考图 <span className="text-[#86868b]">定义视觉基调</span></h2>
                    
                    <div 
                      className={`aspect-square rounded-[32px] border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all duration-700 overflow-hidden relative group shadow-inner ${singleRefImage ? 'border-transparent' : 'border-black/15 bg-[#fbfbfd] hover:bg-white hover:border-[#0071e3]/30'}`}
                      onClick={() => document.getElementById('single-ref-upload')?.click()}
                    >
                      {singleRefImage ? (
                        <div className="relative w-full h-full cursor-zoom-in" onClick={(e) => { e.stopPropagation(); setZoomedImageUrl(singleRefImage); }}>
                          <img src={singleRefImage} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <p className="text-white font-black text-sm uppercase tracking-widest">更换参考图</p>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center">
                          <div className="w-16 h-16 bg-white rounded-2xl shadow-md flex items-center justify-center mx-auto mb-4 border border-black/5"><i className="fas fa-image text-xl text-[#0071e3]"></i></div>
                          <p className="text-sm font-black text-black/40 uppercase tracking-widest">点击上传参考图</p>
                        </div>
                      )}
                      <input id="single-ref-upload" type="file" className="hidden" onChange={(e) => handleFileChange(e, setSingleRefImage)} />
                    </div>

                    <div className="mt-6">
                      <button 
                        onClick={() => singleRefImage && runSingleDeconstruction(singleRefImage)}
                        disabled={!singleRefImage || isDeconstructing}
                        className={`w-full py-4 rounded-2xl text-[14px] font-black flex items-center justify-center gap-3 transition-all shadow-lg ${!singleRefImage || isDeconstructing ? 'bg-[#F5F5F7] text-[#86868b] cursor-not-allowed' : 'bg-black text-white hover:scale-[1.02] active:scale-95'}`}
                      >
                        {isDeconstructing ? (
                          <>
                            <i className="fas fa-circle-notch fa-spin"></i>
                            <span>正在深度解构视觉协议...</span>
                          </>
                        ) : (
                          <>
                            <i className="fas fa-microchip"></i>
                            <span>智能解构视觉协议</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {deconstructionResult && (
                    <div className="apple-card p-8 bg-white border-black/10 shadow-xl animate-slide-up">
                      <div className="section-label mb-6 text-[#0071e3]">Visual Protocol / 视觉协议</div>
                      <div className="grid grid-cols-2 gap-4">
                        {DECONSTRUCTION_FIELDS.map(f => (
                          <div key={f.key} className="bg-[#F5F5F7] p-4 rounded-2xl border border-black/5">
                            <div className="flex items-center gap-2 mb-2">
                              <i className={`fas ${f.icon} text-[10px] text-[#0071e3]`}></i>
                              <span className="text-[10px] font-black text-black/40 uppercase tracking-widest">{f.label}</span>
                            </div>
                            <p className="text-[11px] font-bold text-black leading-relaxed">{deconstructionResult[f.key as keyof ImageDeconstruction]}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* 右侧：产品图与生成 */}
                <div className="lg:col-span-7 space-y-8">
                  <div className="apple-card p-8 bg-white border-black/10 shadow-xl">
                    <div className="section-label mb-6 text-[#0071e3]">Step 02 / Product & Generation</div>
                    <h2 className="text-2xl font-black mb-6 tracking-tight">上传产品图 <span className="text-[#86868b]">执行视觉渲染</span></h2>
                    
                    <div className="grid grid-cols-2 gap-8">
                      <div 
                        className={`aspect-square rounded-[32px] border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all duration-700 overflow-hidden relative group shadow-inner ${singleProductImage ? 'border-transparent' : 'border-black/15 bg-[#fbfbfd] hover:bg-white hover:border-[#0071e3]/30'}`}
                        onClick={() => document.getElementById('single-product-upload')?.click()}
                      >
                        {singleProductImage ? (
                          <div className="relative w-full h-full cursor-zoom-in" onClick={(e) => { e.stopPropagation(); setZoomedImageUrl(singleProductImage); }}>
                            <img src={singleProductImage} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <p className="text-white font-black text-sm uppercase tracking-widest">更换产品图</p>
                            </div>
                          </div>
                        ) : (
                          <div className="text-center">
                            <div className="w-12 h-12 bg-white rounded-2xl shadow-md flex items-center justify-center mx-auto mb-4 border border-black/5"><i className="fas fa-box-open text-lg text-[#0071e3]"></i></div>
                            <p className="text-[10px] font-black text-black/40 uppercase tracking-widest">点击上传产品图</p>
                          </div>
                        )}
                        <input id="single-product-upload" type="file" className="hidden" onChange={(e) => handleFileChange(e, setSingleProductImage)} />
                      </div>

                      <div className="space-y-6">
                        <div>
                          <label className="section-label text-[10px] mb-3 block opacity-60">产品关键词 (可选)</label>
                          <input 
                            type="text" 
                            className="w-full bg-[#F5F5F7] border border-black/5 rounded-2xl p-4 text-[13px] font-bold outline-none focus:ring-2 focus:ring-[#0071e3]/20 transition-all"
                            placeholder="例如：白色陶瓷杯, 极简主义"
                            value={productKeywords}
                            onChange={(e) => setProductKeywords(e.target.value)}
                          />
                        </div>
                        
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <input 
                                type="checkbox" 
                                id="use-ref-image" 
                                checked={useRefImage} 
                                onChange={(e) => setUseRefImage(e.target.checked)}
                                className="w-4 h-4 rounded border-black/10 text-[#0071e3] focus:ring-[#0071e3]/20"
                              />
                              <label htmlFor="use-ref-image" className="text-[11px] font-black text-black/60 uppercase tracking-widest cursor-pointer">参考原图风格</label>
                            </div>
                            {useRefImage && <span className="text-[11px] font-black text-[#0071e3]">{Math.round(refStrength * 100)}%</span>}
                          </div>
                          {useRefImage && (
                            <input 
                              type="range" 
                              min="0" 
                              max="1" 
                              step="0.1" 
                              value={refStrength}
                              onChange={(e) => setRefStrength(parseFloat(e.target.value))}
                              className="w-full h-1.5 bg-[#F5F5F7] rounded-lg appearance-none cursor-pointer accent-[#0071e3]"
                            />
                          )}
                        </div>
                      </div>
                    </div>

                    {deconstructionResult && (
                      <div className="mt-8 space-y-4">
                        <label className="section-label text-[10px] opacity-60">AI 视觉指令 (可微调)</label>
                        <textarea 
                          className="w-full bg-[#F5F5F7] border border-black/5 rounded-[24px] p-6 text-[13px] font-bold leading-relaxed outline-none focus:ring-2 focus:ring-[#0071e3]/20 transition-all min-h-[120px]"
                          value={editablePrompt}
                          onChange={(e) => setEditablePrompt(e.target.value)}
                        />
                      </div>
                    )}

                    <div className="mt-8 pt-8 border-t border-black/5 space-y-10">
                      <div>
                        <label className="section-label mb-4 block text-black/60 font-black tracking-widest uppercase text-[10px]">渲染引擎 / ENGINE</label>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {Object.entries(MODEL_COSTS).map(([key, cfg]) => {
                            const isSelected = genModel === key;
                            const currentPrice = cfg.resolutions[genResolution]?.rmb || Object.values(cfg.resolutions)[0].rmb;
                            return (
                              <button 
                                key={key}
                                onClick={() => setGenModel(key)} 
                                className={`p-6 rounded-2xl border-2 text-left transition-all duration-500 relative overflow-hidden ${isSelected ? 'border-black bg-black text-white shadow-lg scale-[1.02]' : 'border-[#F5F5F7] bg-[#F5F5F7] hover:border-black/10'}`}
                              >
                                <div className={`text-[15px] font-black ${isSelected ? 'text-white' : 'text-black'}`}>{cfg.name}</div>
                                <div className={`text-[9px] mt-1 font-bold uppercase tracking-widest ${isSelected ? 'text-white/60' : 'text-black/40'}`}>{cfg.label}</div>
                                <div className={`text-[11px] mt-4 font-black ${isSelected ? 'text-[#0071e3]' : 'text-[#0071e3]'}`}>
                                  ¥{currentPrice.toFixed(2)}/图
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
                    </div>

                    <div className="mt-10 pt-8 border-t border-black/5 space-y-6">
                      <div className="pt-4 border-t border-black/5">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-[12px] font-bold text-[#86868b]">任务规模</span>
                          <span className="text-[12px] font-black text-black">1 张图片 (单图)</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[12px] font-bold text-[#86868b]">预计总费用</span>
                          <span className="text-[16px] font-black text-[#0071e3]">
                            约 ¥{(MODEL_COSTS[genModel].resolutions[genResolution]?.rmb || 0).toFixed(2)}
                          </span>
                        </div>
                      </div>

                      <button 
                        onClick={runSingleGeneration}
                        disabled={isGeneratingSingle || !singleProductImage || !deconstructionResult}
                        className={`w-full py-6 rounded-[32px] text-[16px] font-black flex items-center justify-center gap-3 transition-all shadow-2xl ${isGeneratingSingle ? 'bg-orange-500 text-white animate-breathe-orange' : 'bg-black text-white hover:scale-[1.02] active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed'}`}
                      >
                        {isGeneratingSingle ? (
                          <>
                            <i className="fas fa-circle-notch fa-spin"></i>
                            <span>正在执行视觉渲染任务...</span>
                          </>
                        ) : (
                          <>
                            <i className="fas fa-bolt"></i>
                            <span>开始视觉渲染</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {(singleGeneratedImage || isGeneratingSingle) && (
                    <div className="apple-card p-8 bg-white border-black/10 shadow-2xl animate-slide-up">
                      <div className="section-label mb-6 text-[#0071e3]">Step 03 / Result</div>
                      <div className="aspect-square rounded-[40px] overflow-hidden bg-[#F5F5F7] relative group shadow-inner">
                        {isGeneratingSingle ? (
                          <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4">
                            <div className="w-16 h-16 border-4 border-black/5 border-t-black rounded-full animate-spin"></div>
                            <p className="text-[12px] font-black text-[#86868b] uppercase tracking-widest animate-pulse">AI 正在重构光影与材质...</p>
                          </div>
                        ) : singleGeneratedImage ? (
                          <>
                            <img 
                              src={singleGeneratedImage} 
                              className="w-full h-full object-cover cursor-zoom-in" 
                              referrerPolicy="no-referrer" 
                              onClick={() => setZoomedImageUrl(singleGeneratedImage)}
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                              <button 
                                onClick={() => downloadImage(singleGeneratedImage, `single-tool-${Date.now()}`)}
                                className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center hover:scale-110 active:scale-90 transition-all shadow-xl"
                              >
                                <i className="fas fa-download"></i>
                              </button>
                            </div>
                          </>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {singleToolMode === SingleToolMode.REPLACEMENT && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* 左侧：基准图与解构画布 */}
                <div className="lg:col-span-5 space-y-8">
                  <div className="apple-card p-8 bg-white border-black/10 shadow-xl">
                    <div className="section-label mb-6 text-[#0071e3]">Step 01 / Base Image</div>
                    <h2 className="text-2xl font-black mb-6 tracking-tight">上传基准图 <span className="text-[#86868b]">定义场景结构</span></h2>
                    
                    <div 
                      className={`aspect-square rounded-[32px] border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all duration-700 overflow-hidden relative group shadow-inner ${replacementBaseImage ? 'border-transparent' : 'border-black/15 bg-[#fbfbfd] hover:bg-white hover:border-[#0071e3]/30'}`}
                      onClick={() => document.getElementById('base-image-upload')?.click()}
                    >
                      {replacementBaseImage ? (
                        <div className="relative w-full h-full cursor-zoom-in" onClick={(e) => { e.stopPropagation(); setZoomedImageUrl(replacementBaseImage); }}>
                          <img src={replacementBaseImage} className="w-full h-full object-cover" />
                          {segmentedObjects.map((obj, idx) => (
                            <div 
                              key={obj.id}
                              className={`absolute border-2 flex items-center justify-center group/bbox ${BBOX_COLORS[idx % BBOX_COLORS.length]}`}
                              style={{
                                left: `${obj.bbox[0] / 10}%`,
                                top: `${obj.bbox[1] / 10}%`,
                                width: `${obj.bbox[2] / 10}%`,
                                height: `${obj.bbox[3] / 10}%`
                              }}
                            >
                              <span className={`text-white text-[10px] font-black px-1 rounded absolute -top-4 left-0 ${LABEL_COLORS[idx % LABEL_COLORS.length]}`}>#{obj.id} {obj.label}</span>
                            </div>
                          ))}
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <p className="text-white font-black text-sm uppercase tracking-widest">更换基准图</p>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center">
                          <div className="w-16 h-16 bg-white rounded-2xl shadow-md flex items-center justify-center mx-auto mb-4 border border-black/5"><i className="fas fa-layer-group text-xl text-[#0071e3]"></i></div>
                          <p className="text-sm font-black text-black/40 uppercase tracking-widest">点击上传场景图</p>
                        </div>
                      )}
                      <input id="base-image-upload" type="file" className="hidden" onChange={(e) => {
                        handleFileChange(e, (base64) => {
                          setReplacementBaseImage(base64);
                          setSegmentedObjects([]);
                        });
                      }} />
                    </div>

                    <div className="mt-6">
                      <button 
                        onClick={() => replacementBaseImage && runSegmentation(replacementBaseImage)}
                        disabled={!replacementBaseImage || isSegmenting}
                        className={`w-full py-4 rounded-2xl text-[14px] font-black flex items-center justify-center gap-3 transition-all shadow-lg ${!replacementBaseImage || isSegmenting ? 'bg-[#F5F5F7] text-[#86868b] cursor-not-allowed' : 'bg-[#0071e3] text-white hover:scale-[1.02] active:scale-95'}`}
                      >
                        {isSegmenting ? (
                          <>
                            <i className="fas fa-circle-notch fa-spin"></i>
                            <span>正在智能识别物体...</span>
                          </>
                        ) : (
                          <>
                            <i className="fas fa-vector-square"></i>
                            <span>自动解构场景物体</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* 右侧：物品清单与替换 */}
                <div className="lg:col-span-7 space-y-8">
                  <div className="apple-card p-8 bg-white border-black/10 shadow-xl">
                    <div className="section-label mb-6 text-[#0071e3]">Step 02 / Item List & Replacement</div>
                    <h2 className="text-2xl font-black mb-6 tracking-tight">物品清单 <span className="text-[#86868b]">点对点精准替换</span></h2>
                    
                    {segmentedObjects.length === 0 ? (
                      <div className="py-20 text-center bg-[#F5F5F7] rounded-[32px] border border-dashed border-black/10">
                        <i className="fas fa-list-ul text-3xl text-black/10 mb-4"></i>
                        <p className="text-[12px] font-black text-black/30 uppercase tracking-widest">请先上传并解构基准图</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {segmentedObjects.map((obj, idx) => (
                          <div key={obj.id} className="bg-[#F5F5F7] p-6 rounded-[24px] border border-black/5 flex gap-6 items-start">
                            <div className="w-24 h-24 rounded-xl bg-white border border-black/5 overflow-hidden flex-shrink-0 relative cursor-zoom-in" onClick={() => setZoomedImageUrl(obj.original_crop_path)}>
                              <img src={obj.original_crop_path} className="w-full h-full object-cover" />
                              <div className={`absolute top-1 left-1 text-white text-[10px] font-black px-1.5 rounded-md ${LABEL_COLORS[idx % LABEL_COLORS.length]}`}>#{obj.id}</div>
                            </div>
                            
                            <div className="flex-1 space-y-4">
                              <div className="flex items-center justify-between">
                                <h3 className="text-[14px] font-black uppercase tracking-tight">{obj.label}</h3>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-black text-black/40 uppercase tracking-widest">当前占比:</span>
                                  <div className="w-24 h-1.5 bg-black/5 rounded-full overflow-hidden">
                                    <div className={`h-full ${LABEL_COLORS[idx % LABEL_COLORS.length]}`} style={{ width: `${obj.relative_scale_ratio * 100}%` }}></div>
                                  </div>
                                  <span className={`text-[10px] font-black ${LABEL_COLORS[idx % LABEL_COLORS.length].replace('bg-', 'text-')}`}>{(obj.relative_scale_ratio * 100).toFixed(0)}%</span>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-4">
                                <div 
                                  className={`h-20 rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all ${obj.replacementImage ? 'border-transparent bg-white' : 'border-black/10 hover:border-blue-400/30 hover:bg-white'}`}
                                  onClick={() => document.getElementById(`replace-upload-${obj.id}`)?.click()}
                                >
                                  {obj.replacementImage ? (
                                    <img src={obj.replacementImage} className="h-full object-contain p-2 cursor-zoom-in" onClick={(e) => { e.stopPropagation(); setZoomedImageUrl(obj.replacementImage); }} />
                                  ) : (
                                    <>
                                      <i className="fas fa-plus text-black/20 mb-1"></i>
                                      <span className="text-[9px] font-black text-black/40 uppercase tracking-widest">上传替换图</span>
                                    </>
                                  )}
                                  <input 
                                    id={`replace-upload-${obj.id}`} 
                                    type="file" 
                                    className="hidden" 
                                    onChange={(e) => handleFileChange(e, (base64) => {
                                      setSegmentedObjects(prev => prev.map(p => p.id === obj.id ? { ...p, replacementImage: base64 } : p));
                                    })} 
                                  />
                                </div>

                                <div className="space-y-2">
                                  <div className="flex justify-between">
                                    <span className="text-[9px] font-black text-black/40 uppercase tracking-widest">比例调整</span>
                                    <span className="text-[9px] font-black text-blue-400">{obj.scaleAdjustment.toFixed(1)}x</span>
                                  </div>
                                  <input 
                                    type="range" 
                                    min="0.5" 
                                    max="2.0" 
                                    step="0.1" 
                                    value={obj.scaleAdjustment}
                                    onChange={(e) => {
                                      const val = parseFloat(e.target.value);
                                      setSegmentedObjects(prev => prev.map(p => p.id === obj.id ? { ...p, scaleAdjustment: val } : p));
                                    }}
                                    className="w-full h-1 bg-black/10 rounded-lg appearance-none cursor-pointer accent-blue-400"
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="apple-card p-8 bg-white border-black/10 shadow-xl space-y-8">
                    <div className="space-y-4">
                      <div className="flex justify-between">
                        <span className="text-[10px] font-black text-black/40 uppercase tracking-widest">背景参考强度 (Background Fidelity)</span>
                        <span className="text-[10px] font-black text-blue-400">{Math.round(backgroundFidelity * 100)}%</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max="1" 
                        step="0.1" 
                        value={backgroundFidelity}
                        onChange={(e) => setBackgroundFidelity(parseFloat(e.target.value))}
                        className="w-full h-1.5 bg-[#F5F5F7] rounded-lg appearance-none cursor-pointer accent-blue-400"
                      />
                      <p className="text-[9px] text-black/30 font-bold leading-relaxed">
                        100% 表示严格锁定原背景，0% 表示允许 AI 大幅重绘背景氛围。
                      </p>
                    </div>

                    <div className="mt-8 pt-8 border-t border-black/5 space-y-10">
                      <div>
                        <label className="section-label mb-4 block text-black/60 font-black tracking-widest uppercase text-[10px]">渲染引擎 / ENGINE</label>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {Object.entries(MODEL_COSTS).map(([key, cfg]) => {
                            const isSelected = genModel === key;
                            const currentPrice = cfg.resolutions[genResolution]?.rmb || Object.values(cfg.resolutions)[0].rmb;
                            return (
                              <button 
                                key={key}
                                onClick={() => setGenModel(key)} 
                                className={`p-6 rounded-2xl border-2 text-left transition-all duration-500 relative overflow-hidden ${isSelected ? 'border-black bg-black text-white shadow-lg scale-[1.02]' : 'border-[#F5F5F7] bg-[#F5F5F7] hover:border-black/10'}`}
                              >
                                <div className={`text-[15px] font-black ${isSelected ? 'text-white' : 'text-black'}`}>{cfg.name}</div>
                                <div className={`text-[9px] mt-1 font-bold uppercase tracking-widest ${isSelected ? 'text-white/60' : 'text-black/40'}`}>{cfg.label}</div>
                                <div className={`text-[11px] mt-4 font-black ${isSelected ? 'text-[#0071e3]' : 'text-[#0071e3]'}`}>
                                  ¥{currentPrice.toFixed(2)}/图
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
                    </div>

                    <div className="mt-10 pt-8 border-t border-black/5 space-y-6">
                      <div className="pt-4 border-t border-black/5">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-[12px] font-bold text-[#86868b]">任务规模</span>
                          <span className="text-[12px] font-black text-black">1 张图片 (单图)</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[12px] font-bold text-[#86868b]">预计总费用</span>
                          <span className="text-[16px] font-black text-[#0071e3]">
                            约 ¥{(MODEL_COSTS[genModel].resolutions[genResolution]?.rmb || 0).toFixed(2)}
                          </span>
                        </div>
                      </div>

                      <button 
                        onClick={runReplacementGeneration}
                        disabled={isGeneratingSingle || segmentedObjects.length === 0 || !segmentedObjects.some(o => o.replacementImage)}
                        className={`w-full py-6 rounded-[32px] text-[16px] font-black flex items-center justify-center gap-3 transition-all shadow-2xl ${isGeneratingSingle ? 'bg-orange-500 text-white animate-breathe-orange' : 'bg-[#0071e3] text-white hover:scale-[1.02] active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed'}`}
                      >
                        {isGeneratingSingle ? (
                          <>
                            <i className="fas fa-circle-notch fa-spin"></i>
                            <span>正在进行智能替换与融合...</span>
                          </>
                        ) : (
                          <>
                            <i className="fas fa-wand-magic-sparkles"></i>
                            <span>立即生成替换大片</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {(singleGeneratedImage || isGeneratingSingle) && (
                    <div className="apple-card p-8 bg-white border-black/10 shadow-2xl animate-slide-up">
                      <div className="section-label mb-6 text-[#0071e3]">Step 03 / Result</div>
                      <div className="aspect-square rounded-[40px] overflow-hidden bg-[#F5F5F7] relative group shadow-inner">
                        {isGeneratingSingle ? (
                          <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4">
                            <div className="w-16 h-16 border-4 border-[#0071e3]/20 border-t-[#0071e3] rounded-full animate-spin"></div>
                            <p className="text-[12px] font-black text-[#86868b] uppercase tracking-widest animate-pulse">AI 正在重构光影与材质...</p>
                          </div>
                        ) : singleGeneratedImage ? (
                          <>
                            <img 
                              src={singleGeneratedImage} 
                              className="w-full h-full object-cover cursor-zoom-in" 
                              referrerPolicy="no-referrer" 
                              onClick={() => setZoomedImageUrl(singleGeneratedImage)}
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                              <button 
                                onClick={() => downloadImage(singleGeneratedImage, `replacement-tool-${Date.now()}`)}
                                className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center hover:scale-110 active:scale-90 transition-all shadow-xl"
                              >
                                <i className="fas fa-download"></i>
                              </button>
                            </div>
                          </>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>
              </div>
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

        {step === AppStep.WORKFLOW && (
          <WorkflowCanvas 
            userApiKey={userApiKey} 
            user={auth.user}
            onDeductCredit={deductCredit}
          />
        )}

        {step === AppStep.FULL_PLAN && (
          <div className="space-y-20 animate-slide-up pb-20">
            {/* Section 1: Style Decoder */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-7">
                <div className="apple-card p-8 h-full flex flex-col border-black/10 bg-white">
                  <div className="section-label mb-6 text-[#0071e3]">Step 01 / Decoder</div>
                  <div className="flex justify-between items-start mb-8">
                    <h1 className="text-3xl font-extrabold leading-tight tracking-tight">上传风格参考图，<br/><span className="text-[#86868b]">确立详情全案审美骨架。</span></h1>
                    <button 
                      onClick={() => setStep(AppStep.WORKFLOW)}
                      className="px-4 py-2 bg-black text-white text-[11px] font-black rounded-xl shadow-lg hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                    >
                      <i className="fas fa-project-diagram"></i> 进入创意工作流
                    </button>
                  </div>
                  <div 
                    className={`flex-1 rounded-[24px] border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all duration-700 overflow-hidden relative group shadow-inner min-h-[400px] ${styleImage ? 'border-transparent' : 'border-black/15 bg-[#fbfbfd] hover:bg-white hover:border-[#0071e3]/30'}`}
                    onClick={() => styleImage ? setZoomedImageUrl(styleImage) : document.getElementById('style-upload')?.click()}
                  >
                    {styleImage ? <img src={styleImage} className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" /> : (
                      <div className="text-center animate-pulse">
                        <div className="w-16 h-16 bg-white rounded-2xl shadow-md flex items-center justify-center mx-auto mb-4 border border-black/5"><i className="fas fa-image text-xl text-[#0071e3]"></i></div>
                        <p className="text-xs font-bold text-black opacity-60">点击上传参考图解析视觉基因</p>
                      </div>
                    )}
                    {styleImage && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); document.getElementById('style-upload')?.click(); }}
                        className="absolute bottom-4 right-4 w-10 h-10 bg-white/90 backdrop-blur-md rounded-full shadow-lg flex items-center justify-center text-black opacity-0 group-hover:opacity-100 transition-all hover:scale-110 z-10"
                      >
                        <i className="fas fa-camera text-xs"></i>
                      </button>
                    )}
                  </div>
                  <input id="style-upload" type="file" className="hidden" onChange={(e) => handleFileChange(e, setStyleImage)} />
                  <div className="mt-6">
                    <button 
                      onClick={runStep1} 
                      disabled={!styleImage || loading} 
                      className={`w-full py-4 rounded-2xl text-white text-[13px] font-black shadow-lg hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 border-none ${!styleImage || loading ? 'bg-gray-300 cursor-not-allowed' : 'bg-orange-500'}`}
                    >
                      <i className={`fas ${loading ? 'fa-circle-notch fa-spin' : 'fa-bolt'}`}></i> {loading ? '正在解析风格...' : '生成视觉宪法'}
                    </button>
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
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="h-px bg-black/5 w-full"></div>

            {/* Section 2: Product Strategy */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-6">
                <div className="apple-card p-8 border-black/10">
                  <div className="section-label mb-6 text-[#0071e3]">Step 02 / Strategy</div>
                  <h1 className="text-3xl font-extrabold mb-8 tracking-tight leading-tight">解析物理特征，<br/><span className="text-[#86868b]">执行场景化策划建模。</span></h1>
                  <div className="flex bg-[#F5F5F7] p-1 rounded-xl mb-8 shadow-inner">
                    <button onClick={() => setStrategyType(StrategyType.DETAIL)} className={`flex-1 py-3 rounded-lg text-[12px] font-black transition-all duration-500 ${strategyType === StrategyType.DETAIL ? 'bg-white shadow-md text-black scale-105' : 'text-[#86868b] hover:text-black'}`}>详情页分镜</button>
                    <button onClick={() => setStrategyType(StrategyType.MAIN_IMAGE)} className={`flex-1 py-3 rounded-lg text-[12px] font-black transition-all duration-500 ${strategyType === StrategyType.MAIN_IMAGE ? 'bg-white shadow-md text-black scale-105' : 'text-[#86868b] hover:text-black'}`}>营销主图方案</button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    <div className="bg-[#F5F5F7] p-4 rounded-[24px] border border-black/5 shadow-inner">
                      <label className="section-label text-[9px] mb-3 block text-black font-black uppercase tracking-widest">1. 上传产品白底图</label>
                      <div className="grid grid-cols-3 gap-3">
                        {productImages.map((img, idx) => (
                          <div key={idx} className="aspect-square rounded-xl bg-white border border-black/10 relative group overflow-hidden shadow-sm cursor-zoom-in" onClick={() => setZoomedImageUrl(img)}>
                            <img src={img} className="w-full h-full object-contain p-1" />
                            <button onClick={() => removeProductImage(idx)} className="absolute top-1 right-1 w-5 h-5 bg-black/70 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 scale-75 hover:bg-black transition-all"><i className="fas fa-times text-[9px]"></i></button>
                          </div>
                        ))}
                        {productImages.length < 6 && (
                          <div className="aspect-square rounded-xl border-2 border-dashed border-black/15 hover:border-[#0071e3]/30 flex flex-col items-center justify-center cursor-pointer bg-white transition-all group" onClick={() => document.getElementById('prod-multi')?.click()}>
                            <i className="fas fa-plus opacity-20 group-hover:opacity-100 mb-1 text-sm"></i>
                            <span className="text-[9px] font-bold opacity-30 group-hover:opacity-100 uppercase">添加</span>
                          </div>
                        )}
                        <input id="prod-multi" type="file" multiple className="hidden" onChange={handleMultipleFilesChange} />
                      </div>
                    </div>
                    
                    {strategyType === StrategyType.MAIN_IMAGE && (
                      <div className="bg-[#F5F5F7] p-4 rounded-[24px] border border-black/5 shadow-inner">
                         <label className="section-label text-[9px] mb-3 block text-black font-black uppercase tracking-widest">2. 上传构图参考 (可选)</label>
                         <div 
                           className={`aspect-square w-1/3 rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all duration-700 overflow-hidden relative group shadow-inner ${compositionRefImage ? 'border-transparent' : 'border-black/15 bg-white hover:bg-gray-50 hover:border-[#0071e3]/30'}`}
                           onClick={() => compositionRefImage ? setZoomedImageUrl(compositionRefImage) : document.getElementById('comp-upload')?.click()}
                         >
                           {compositionRefImage ? (
                             <>
                               <img src={compositionRefImage} className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" />
                               <button onClick={(e) => { e.stopPropagation(); setCompositionRefImage(null); }} className="absolute top-1 right-1 w-5 h-5 bg-black/70 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 scale-75 hover:bg-black transition-all"><i className="fas fa-times text-[9px]"></i></button>
                               <button onClick={(e) => { e.stopPropagation(); document.getElementById('comp-upload')?.click(); }} className="absolute bottom-2 right-2 w-7 h-7 bg-white/90 rounded-full flex items-center justify-center text-black opacity-0 group-hover:opacity-100 scale-75 hover:scale-100 transition-all shadow-md"><i className="fas fa-camera text-[8px]"></i></button>
                             </>
                           ) : (
                             <div className="text-center">
                               <i className="fas fa-drafting-compass opacity-20 group-hover:opacity-100 mb-1 text-lg"></i>
                               <p className="text-[9px] font-bold opacity-30 group-hover:opacity-100 uppercase">上传</p>
                             </div>
                           )}
                         </div>
                         <input id="comp-upload" type="file" className="hidden" onChange={(e) => handleFileChange(e, setCompositionRefImage)} />
                      </div>
                    )}
                  </div>
                  
                  <div className="space-y-6">
                    <div className="bg-[#F5F5F7] p-6 rounded-[24px] border border-black/5 shadow-inner">
                      <label className="section-label text-[9px] mb-3 block text-black font-black uppercase tracking-widest">核心卖点注入</label>
                      <textarea className="w-full bg-white border border-black/10 rounded-xl p-4 text-[13px] font-bold text-black focus:ring-2 focus:ring-[#0071e3]/20 outline-none transition-all min-h-[100px] shadow-sm no-scrollbar" placeholder="描述核心卖点，用于 AI 画面转化..." value={sellingPoints} onChange={(e) => setSellingPoints(e.target.value)} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-[#f0f9ff] p-6 rounded-[24px] border border-blue-100/50">
                        <label className="section-label text-[9px] text-blue-700 mb-3 block font-black">视觉加分项</label>
                        <textarea className="w-full bg-transparent border-none text-[12px] font-bold text-blue-900 focus:ring-0 p-0 min-h-[80px] placeholder:text-blue-200 no-scrollbar" placeholder="允许出现的元素..." value={allowedElements} onChange={(e) => setAllowedElements(e.target.value)} />
                      </div>
                      <div className="bg-[#fef2f2] p-6 rounded-[24px] border border-red-100/50">
                        <label className="section-label text-[9px] text-red-700 mb-3 block font-black">视觉禁忌项</label>
                        <textarea className="w-full bg-transparent border-none text-[12px] font-bold text-red-900 focus:ring-0 p-0 min-h-[80px] placeholder:text-red-200 no-scrollbar" placeholder="严禁出现的元素..." value={prohibitedElements} onChange={(e) => setProhibitedElements(e.target.value)} />
                      </div>
                    </div>
                    <div className="mt-8">
                      <button 
                        onClick={runStep2} 
                        disabled={productImages.length === 0 || loading} 
                        className={`w-full py-5 rounded-[24px] text-white text-[14px] font-black shadow-2xl hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 border-none ${productImages.length === 0 || loading ? 'bg-gray-300 cursor-not-allowed' : 'bg-orange-500'}`}
                      >
                        <i className={`fas ${loading ? 'fa-circle-notch fa-spin' : 'fa-bolt'}`}></i> {loading ? '正在执行建模...' : '执行建模'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="lg:col-span-6">
                <div className="apple-card p-8 h-full bg-[#F5F5F7] overflow-y-auto max-h-[800px] no-scrollbar border-black/5">
                  <div className="flex items-center justify-between mb-8 sticky top-0 bg-[#F5F5F7]/90 backdrop-blur-md z-10 pb-4 border-b border-black/5">
                    <div className="section-label text-black/40">{strategyType === StrategyType.DETAIL ? 'Storyboard' : 'Marketing Schemes'} Preview</div>
                  </div>
                  {!analysis ? (
                    <div className="h-[400px] flex flex-col items-center justify-center opacity-30 italic text-xs text-black">
                      <p>等待模型输出创意架构...</p>
                    </div>
                  ) : (
                    <div className="space-y-6 animate-slide-up">
                      <div className="bg-black text-white p-8 rounded-[32px] shadow-xl relative overflow-hidden group">
                        <div className="flex items-center gap-2 mb-4">
                          <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                          <span className="section-label text-white/50 tracking-widest text-[9px]">视觉物理基因模型</span>
                        </div>
                        <textarea 
                          className="w-full bg-transparent border-none text-white text-[15px] font-bold leading-relaxed opacity-90 focus:ring-0 p-0 resize-none no-scrollbar"
                          value={analysis.physical_features}
                          onChange={(e) => setAnalysis(prev => prev ? { ...prev, physical_features: e.target.value } : null)}
                          rows={4}
                        />
                      </div>
                      {analysis.storyboards.map((s, i) => (
                        <div key={s.id} className="bg-white p-6 rounded-[24px] border border-black/5 shadow-sm group hover:shadow-md transition-all">
                          <div className="flex justify-between items-center mb-4">
                            <span className="bg-[#F5F5F7] text-black px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest border border-black/5 uppercase">{strategyType === StrategyType.DETAIL ? '分镜' : '主图方案'} 0{i+1} / {s.title}</span>
                            <span className="text-[9px] font-black opacity-30 uppercase">{s.prominence}</span>
                          </div>
                          <div className="space-y-3">
                            <div className="bg-[#fbfbfd] p-4 rounded-xl border border-black/5 shadow-inner">
                              <span className="text-[8px] font-black opacity-30 block mb-1 uppercase tracking-widest">营销文案内容</span>
                              <textarea 
                                className="w-full bg-transparent border-none text-[15px] font-black text-black leading-tight focus:ring-0 p-0 resize-none no-scrollbar"
                                value={s.copy}
                                onChange={(e) => updateStoryboard(s.id, 'copy', e.target.value)}
                                rows={2}
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                               <div className="p-3 bg-[#F5F5F7] rounded-xl border border-black/5"><span className="text-[7px] font-black opacity-30 block mb-1 uppercase">建议占位</span><input 
                                 className="w-full bg-transparent border-none text-[10px] font-black text-black focus:ring-0 p-0 text-right"
                                 value={s.placement}
                                 onChange={(e) => updateStoryboard(s.id, 'placement', e.target.value)}
                               /></div>
                               <div className="p-3 bg-[#F5F5F7] rounded-xl border border-black/5"><span className="text-[7px] font-black opacity-30 block mb-1 uppercase">建议字号</span><input 
                                 className="w-full bg-transparent border-none text-[10px] font-black text-black focus:ring-0 p-0 text-right"
                                 value={s.font_size}
                                 onChange={(e) => updateStoryboard(s.id, 'font_size', e.target.value)}
                               /></div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="h-px bg-black/5 w-full"></div>

            {/* Section 3: Prompt Fusion */}
            <div className="animate-slide-up">
              <div className="flex items-end justify-between mb-10 px-2">
                <div>
                  <div className="section-label mb-3 text-[#0071e3]">Step 03 / Final Deck</div>
                  <h1 className="text-4xl font-black tracking-tighter text-black">{strategyType === StrategyType.DETAIL ? '详情页视觉架构已就绪。' : '高点击率主图全案已就绪。'}</h1>
                </div>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setIsBulkGenActive(true)} 
                    disabled={isBulkLoading || finalPrompts.length === 0}
                    className={`px-6 py-3 rounded-2xl text-[13px] font-black flex items-center gap-2 border-none shadow-xl active:scale-95 transition-all text-white ${isBulkLoading || finalPrompts.length === 0 ? 'bg-gray-300 cursor-not-allowed' : 'bg-orange-500 hover:bg-orange-600'}`}
                  >
                    <i className={`fas ${isBulkLoading ? 'fa-circle-notch fa-spin' : 'fa-bolt'}`}></i> {isBulkLoading ? '正在批量渲染...' : '一键批量渲染'}
                  </button>
                  <button onClick={downloadAllImages} disabled={finalPrompts.length === 0} className="px-6 py-3 rounded-2xl text-[13px] font-black bg-[#0071e3] hover:bg-[#0077ED] text-white shadow-xl active:scale-95 transition-all flex items-center gap-2">
                    <i className="fas fa-download"></i> 下载所有图片
                  </button>
                  <button onClick={copyAllPlanInfo} disabled={finalPrompts.length === 0} className="px-6 py-3 rounded-2xl text-[13px] font-black bg-black text-white shadow-xl active:scale-95 transition-all">
                    <i className="fas fa-copy mr-1"></i> 复制方案文本
                  </button>
                </div>
              </div>

              <div className="apple-card p-8 mb-12 grid grid-cols-1 md:grid-cols-2 gap-8 items-center bg-white border-black/10 shadow-xl">
                <div className="flex gap-6 items-center">
                  <div className="w-16 h-16 bg-[#F5F5F7] rounded-[20px] shadow-inner border border-black/5 flex items-center justify-center text-2xl text-[#0071e3]">
                    <i className="fas fa-font opacity-40"></i>
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-black tracking-tight">项目全局字体方案</h3>
                    <p className="text-[13px] text-[#6e6e73] font-medium">模型将以此为基准进行视觉排版模拟</p>
                  </div>
                </div>
                <div className="relative group">
                  <select value={globalSelectedFont} onChange={(e) => setGlobalSelectedFont(e.target.value)} className="w-full bg-[#F5F5F7] border border-black/10 rounded-[18px] p-4 text-[15px] font-black text-black appearance-none shadow-sm transition-all hover:border-[#0071e3]/30">
                    {analysis?.global_font_options.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none opacity-40"><i className="fas fa-chevron-down text-xs"></i></div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                {finalPrompts.length === 0 ? (
                  <div className="col-span-full h-[400px] flex flex-col items-center justify-center bg-[#F5F5F7] rounded-[40px] border border-dashed border-black/10 opacity-50">
                    <i className="fas fa-layer-group text-4xl mb-4"></i>
                    <p className="text-sm font-bold">暂无生成方案，请确保已执行 Step 02 建模</p>
                  </div>
                ) : finalPrompts.map((p, idx) => (
                  <div key={p.id} className="apple-card p-8 flex flex-col group h-full border-black/10 bg-white shadow-md hover:shadow-xl transition-all duration-700">
                    <div className="flex justify-between items-center mb-8">
                      <span className="bg-[#F5F5F7] px-4 py-1.5 rounded-full text-[10px] font-black text-black border border-black/5 tracking-widest uppercase">
                        {p.id === 'preview_grid' ? 'GLOBAL PREVIEW' : `${strategyType === StrategyType.DETAIL ? 'STORYBOARD' : 'SCHEME'} ${idx}`}
                      </span>
                      <div className="flex gap-2">
                        <div 
                          className="w-10 h-10 rounded-full bg-[#F5F5F7] border border-black/10 flex items-center justify-center cursor-pointer hover:bg-white transition-all shadow-sm group/ref relative overflow-hidden"
                          onClick={() => document.getElementById(`ref-${p.id}`)?.click()}
                          title="上传参考图"
                        >
                          {cardRefImages[p.id] ? <img src={cardRefImages[p.id]} className="w-full h-full object-cover rounded-full" /> : <i className="fas fa-image text-[#6e6e73] opacity-40 text-[12px]"></i>}
                          <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-black text-white rounded-full flex items-center justify-center text-[7px] opacity-0 group-hover/ref:opacity-100 transition-opacity"><i className="fas fa-plus"></i></div>
                        </div>
                        <input id={`ref-${p.id}`} type="file" className="hidden" onChange={(e) => handleCardRefImage(e, p.id)} />
                        <button 
                          onClick={() => setActiveGenCardId(p.id)} 
                          disabled={cardGenStatus[p.id] === 'loading'}
                          className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-md hover:scale-110 active:scale-90 ${cardGenStatus[p.id] === 'loading' ? 'bg-orange-500 text-white animate-breathe-orange' : 'bg-black text-white'}`}
                        >
                          {cardGenStatus[p.id] === 'loading' ? <i className="fas fa-circle-notch fa-spin text-[12px]"></i> : <i className="fas fa-wand-magic-sparkles text-[12px]"></i>}
                        </button>
                      </div>
                    </div>
                    
                    <h3 className="text-xl font-black mb-6 text-black tracking-tight">{p.title}</h3>

                    <div 
                      className="aspect-[4/3] rounded-[24px] overflow-hidden bg-[#F5F5F7] mb-8 border border-black/10 relative group/img shadow-inner cursor-zoom-in"
                      onMouseEnter={() => cardGeneratedImages[p.id] && setHoveredPreviewImage({ url: cardGeneratedImages[p.id], title: p.title })}
                      onMouseLeave={() => setHoveredPreviewImage(null)}
                      onClick={() => cardGeneratedImages[p.id] && setZoomedImageUrl(cardGeneratedImages[p.id])}
                    >
                      {cardGeneratedImages[p.id] ? (
                        <>
                          <img 
                            src={cardGeneratedImages[p.id]} 
                            className="w-full h-full object-cover transition-all duration-700 hover:opacity-80" 
                            alt={p.title}
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/10 transition-all flex items-center justify-center pointer-events-none">
                             <i className="fas fa-expand text-white opacity-0 group-hover/img:opacity-100 transition-opacity text-xl drop-shadow-lg scale-125"></i>
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); downloadImage(cardGeneratedImages[p.id], p.title); }} className="absolute bottom-4 right-4 w-11 h-11 bg-white/95 backdrop-blur-xl rounded-full shadow-lg flex items-center justify-center hover:scale-110 transition-all text-black z-20"><i className="fas fa-download text-sm"></i></button>
                        </>
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center opacity-40 italic text-[10px] gap-2">
                          <i className="fas fa-palette text-3xl opacity-10 mb-1"></i>
                          <p className="font-black uppercase tracking-[0.2em]">{cardGenStatus[p.id] === 'loading' ? '正在渲染细节...' : '等待任务触发'}</p>
                        </div>
                      )}
                    </div>

                    <div className="space-y-6 flex-1 flex flex-col">
                      <div className="bg-[#F5F5F7] p-5 rounded-[20px] border border-black/5 shadow-inner">
                        <div className="section-label text-[8px] mb-2 opacity-60 font-black flex justify-between tracking-widest uppercase">
                           <span>核心营销文案</span>
                           <span className="text-[#0071e3] opacity-60 text-[7px] cursor-pointer">修改</span>
                        </div>
                        <textarea className="w-full bg-transparent border-none text-[15px] font-black text-black leading-snug focus:ring-0 p-0 resize-none min-h-[40px] tracking-tight no-scrollbar" value={p.copy} rows={2} onChange={(e) => updatePromptCopy(p.id, e.target.value)} />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3">
                         <div className="p-4 bg-white border border-black/10 rounded-xl shadow-sm">
                           <span className="section-label text-[7px] opacity-40 block mb-1">排版位置</span>
                           <select 
                             className="w-full bg-transparent border-none text-[10px] font-black text-black focus:ring-0 p-0 appearance-none"
                             value={p.placement}
                             onChange={(e) => updatePromptPlacement(p.id, e.target.value)}
                           >
                             {PLACEMENT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                             <option value={p.placement}>{p.placement}</option>
                           </select>
                         </div>
                         <div className="p-4 bg-white border border-black/10 rounded-xl shadow-sm"><span className="section-label text-[7px] opacity-40 block mb-1 truncate">选定字体</span><span className="text-[10px] font-black text-black truncate">{globalSelectedFont}</span></div>
                      </div>

                      <div className="bg-black text-white p-6 rounded-[28px] relative overflow-hidden group/p shadow-lg border border-white/5 flex items-center justify-between">
                        <div className="relative z-10">
                          <div className="flex items-center gap-2 mb-1">
                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                            <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Ready to Render</span>
                          </div>
                          <h4 className="text-[16px] font-black tracking-tight">立即执行视觉渲染任务</h4>
                        </div>
                        <button 
                          onClick={() => setActiveGenCardId(p.id)} 
                          disabled={cardGenStatus[p.id] === 'loading'}
                          className={`relative z-10 w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-xl hover:scale-110 active:scale-90 ${cardGenStatus[p.id] === 'loading' ? 'bg-orange-500 text-white animate-breathe-orange' : 'bg-white text-black'}`}
                        >
                          {cardGenStatus[p.id] === 'loading' ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-bolt"></i>}
                        </button>
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 blur-2xl group-hover/p:bg-white/10 transition-all duration-700"></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
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
                      const currentPrice = cfg.resolutions[genResolution]?.rmb || Object.values(cfg.resolutions)[0].rmb;
                      return (
                        <button 
                          key={key}
                          onClick={() => setGenModel(key)} 
                          className={`p-6 rounded-2xl border-2 text-left transition-all duration-500 relative overflow-hidden ${isSelected ? 'border-black bg-black text-white shadow-lg scale-[1.02]' : 'border-[#F5F5F7] bg-[#F5F5F7] hover:border-black/10'}`}
                        >
                          <div className={`text-[15px] font-black ${isSelected ? 'text-white' : 'text-black'}`}>{cfg.name}</div>
                          <div className={`text-[9px] mt-1 font-bold uppercase tracking-widest ${isSelected ? 'text-white/60' : 'text-black/40'}`}>{cfg.label}</div>
                          <div className={`text-[11px] mt-4 font-black ${isSelected ? 'text-[#0071e3]' : 'text-[#0071e3]'}`}>
                            ¥{currentPrice.toFixed(2)}/图
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

      {/* 图片放大模态框 */}
      {zoomedImageUrl && (
        <div 
          className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center p-4 lg:p-10 animate-in fade-in duration-300 overflow-hidden"
          onWheel={handleDetailZoom}
          onClick={() => setZoomedImageUrl(null)}
        >
          <div 
            className={`relative max-w-full max-h-full flex items-center justify-center transition-transform duration-75 ${detailZoomScale > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-out'}`}
            style={{ 
              transform: `scale(${detailZoomScale}) translate(${detailZoomOffset.x / detailZoomScale}px, ${detailZoomOffset.y / detailZoomScale}px)` 
            }}
            onMouseDown={handlePanStart}
            onMouseMove={handlePanMove}
            onMouseUp={handlePanEnd}
            onMouseLeave={handlePanEnd}
            onClick={(e) => e.stopPropagation()}
          >
            <img 
              src={zoomedImageUrl} 
              className="max-w-full max-h-full object-contain shadow-2xl rounded-lg select-none pointer-events-none"
              draggable={false}
            />
          </div>
          
          {/* 缩放控制提示 */}
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-white/10 backdrop-blur-md px-6 py-3 rounded-full border border-white/20 text-white text-[12px] font-black flex items-center gap-6 pointer-events-none">
            <div className="flex items-center gap-2">
              <i className="fas fa-mouse text-[#FF7F00]"></i>
              <span>滚动缩放: {Math.round(detailZoomScale * 100)}%</span>
            </div>
            <div className="w-px h-4 bg-white/20"></div>
            <div className="flex items-center gap-2">
              <i className="fas fa-arrows-alt text-[#FF7F00]"></i>
              <span>拖拽平移</span>
            </div>
            <div className="w-px h-4 bg-white/20"></div>
            <div className="flex items-center gap-2">
              <i className="fas fa-times text-[#FF7F00]"></i>
              <span>点击空白关闭</span>
            </div>
          </div>

          <button 
            className="absolute top-8 right-8 w-12 h-12 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white transition-all border border-white/20 z-[210]"
            onClick={() => setZoomedImageUrl(null)}
          >
            <i className="fas fa-times text-xl"></i>
          </button>
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

      {/* API Key 配置弹窗 */}
      {showApiKeyModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[300] flex items-center justify-center p-4">
          <div 
            className="bg-[#1c1c1e] border border-white/10 rounded-[32px] w-full max-w-lg shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-8">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-2xl font-black text-white tracking-tight">配置 API 密钥</h3>
                  <p className="text-[#86868b] text-sm mt-1 font-medium">设置您的 Google Gemini 密钥，支持双 Key 自动切换</p>
                </div>
                <button 
                  onClick={() => setShowApiKeyModal(false)}
                  className="w-10 h-10 bg-white/5 hover:bg-white/10 rounded-full flex items-center justify-center text-white transition-all"
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>

              <div className="space-y-6">
                {/* 免费 Key 配置 */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <label className="text-[11px] font-black text-[#86868b] uppercase tracking-widest flex items-center gap-2">
                      <i className="fas fa-brain text-blue-500"></i>
                      识图/文案 (免费 Key)
                    </label>
                    <span className="text-[10px] font-bold text-blue-500/60 bg-blue-500/10 px-2 py-0.5 rounded-full">推荐使用 AI Studio 免费额度</span>
                  </div>
                  <div className="relative group">
                    <input 
                      type="password"
                      value={userApiKey}
                      onChange={(e) => {
                        const val = e.target.value;
                        setUserApiKey(val);
                        localStorage.setItem('user_gemini_api_key', val);
                      }}
                      className="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-4 text-white text-sm focus:border-blue-500/50 outline-none transition-all font-mono placeholder:text-[#3a3a3c]"
                      placeholder="输入您的免费 API Key..."
                    />
                    <div className="absolute inset-y-0 right-5 flex items-center pointer-events-none opacity-20 group-focus-within:opacity-100 transition-opacity">
                      <i className="fas fa-shield-alt text-xs text-blue-500"></i>
                    </div>
                  </div>
                  <p className="text-[10px] text-[#86868b] leading-relaxed px-1">
                    用于：班小夫助理对话、全案策划分析、详情助手识图、单图风格拆解等。
                  </p>
                </div>

                {/* 付费 Key 配置 */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <label className="text-[11px] font-black text-[#86868b] uppercase tracking-widest flex items-center gap-2">
                      <i className="fas fa-image text-orange-500"></i>
                      专业生图 (付费 Key)
                    </label>
                    <span className="text-[10px] font-bold text-orange-500/60 bg-orange-500/10 px-2 py-0.5 rounded-full">保障 2K/4K 高清输出</span>
                  </div>
                  <div className="relative group">
                    <input 
                      type="password"
                      value={paidImageApiKey}
                      onChange={(e) => {
                        const val = e.target.value;
                        setPaidImageApiKey(val);
                        localStorage.setItem('user_paid_image_api_key', val);
                      }}
                      className="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-4 text-white text-sm focus:border-orange-500/50 outline-none transition-all font-mono placeholder:text-[#3a3a3c]"
                      placeholder="输入您的付费 API Key (可选)..."
                    />
                    <div className="absolute inset-y-0 right-5 flex items-center pointer-events-none opacity-20 group-focus-within:opacity-100 transition-opacity">
                      <i className="fas fa-bolt text-xs text-orange-500"></i>
                    </div>
                  </div>
                  <p className="text-[10px] text-[#86868b] leading-relaxed px-1">
                    用于：ImageNode 节点生图。若不填，生图将自动回退使用上方的免费 Key。
                  </p>
                </div>
                {/* 豆包 Key 配置 */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <label className="text-[11px] font-black text-[#86868b] uppercase tracking-widest flex items-center gap-2">
                      <i className="fas fa-rocket text-red-500"></i>
                      豆包生图 (Doubao Key)
                    </label>
                    <span className="text-[10px] font-bold text-red-500/60 bg-red-500/10 px-2 py-0.5 rounded-full">字节跳动自研模型</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input 
                      type="password"
                      value={doubaoApiKey}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDoubaoApiKey(val);
                        localStorage.setItem('user_doubao_api_key', val);
                      }}
                      className="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-4 text-white text-sm focus:border-red-500/50 outline-none transition-all font-mono placeholder:text-[#3a3a3c]"
                      placeholder="API Key..."
                    />
                    <input 
                      type="text"
                      value={doubaoModelId}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDoubaoModelId(val);
                        localStorage.setItem('user_doubao_model_id', val);
                      }}
                      className="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-4 text-white text-sm focus:border-red-500/50 outline-none transition-all font-mono placeholder:text-[#3a3a3c]"
                      placeholder="Model ID (Endpoint)..."
                    />
                  </div>
                  <p className="text-[10px] text-[#86868b] leading-relaxed px-1">
                    用于：豆包专业生图。请前往火山引擎 Ark 平台获取 API Key 和接入点 ID。
                  </p>
                </div>
              </div>

              <div className="mt-10">
                <button 
                  onClick={() => {
                    setShowApiKeyModal(false);
                    alert("配置已保存，系统将根据任务自动切换 Key");
                  }}
                  className="w-full py-5 bg-white text-black rounded-2xl font-black text-sm hover:scale-[1.02] active:scale-95 transition-all shadow-[0_20px_40px_rgba(255,255,255,0.1)]"
                >
                  保存并开始创作
                </button>
                <div className="mt-4 text-center">
                  <a 
                    href="https://aistudio.google.com/app/apikey" 
                    target="_blank" 
                    rel="noreferrer"
                    className="text-[10px] font-bold text-blue-500 hover:underline"
                  >
                    获取您的 Google Gemini API Key <i className="fas fa-external-link-alt ml-1"></i>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const SafeApp = () => (
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

export default SafeApp;
