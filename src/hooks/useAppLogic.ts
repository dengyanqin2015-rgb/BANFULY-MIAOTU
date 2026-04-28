
import { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { 
  AppStep, StrategyType, AuthState, User, RechargeLog, GenerationLog, 
  ImageHistoryItem, Constitution, Analysis, FinalPrompt, DetailStoryboard, 
  SingleToolMode, ImageDeconstruction, SegmentedObject, MODEL_COSTS 
} from '../types';
import { 
  decodeStyle, analyzeProduct, fusePrompts, generateEcomImage, 
  deconstructImage, segmentImage, detailAssistantStep1, 
  detailAssistantStep2, detailAssistantStep3, 
  regenerateSingleDetailStoryboard, updateDetailPromptFromFields 
} from '../geminiService';

export const useAppLogic = () => {
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
  const [imageHistory, setImageHistory] = useState<ImageHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<Set<string>>(new Set());

  // 统计与筛选状态
  const [filterYear, setFilterYear] = useState<string>('');
  const [filterMonth, setFilterMonth] = useState<string>('');
  const [filterDay, setFilterDay] = useState<string>('');
  const [filterUser, setFilterUser] = useState<string>('all');

  // 策划状态
  const [styleImage, setStyleImage] = useState<string | null>(null);
  const [constitution, setConstitution] = useState<Constitution | null>(null);
  const [productImages, setProductImages] = useState<string[]>([]);
  const [sellingPoints, setSellingPoints] = useState('');
  const [allowedElements, setAllowedElements] = useState('');
  const [prohibitedElements, setProhibitedElements] = useState('');
  const [strategyType, setStrategyType] = useState<StrategyType>(StrategyType.DETAIL);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [finalPrompts, setFinalPrompts] = useState<FinalPrompt[]>([]);
  const [globalSelectedFont, setGlobalSelectedFont] = useState<string>('');
  const [cardRefImages, setCardRefImages] = useState<Record<string, string>>({});
  const [cardGeneratedImages, setCardGeneratedImages] = useState<Record<string, string>>({});
  const [cardGenStatus, setCardGenStatus] = useState<Record<string, 'idle' | 'loading' | 'done' | 'error'>>({});
  const [activeGenCardId, setActiveGenCardId] = useState<string | null>(null);
  const [isBulkLoading, setIsBulkLoading] = useState(false);
  const [genModel, setGenModel] = useState('nanobanana2');
  const [genAspectRatio, setGenAspectRatio] = useState('1:1');
  const [genResolution, setGenResolution] = useState('1K');
  const [compositionRefImage, setCompositionRefImage] = useState<string | null>(null);

  // 单图工具状态
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

  // Auth Functions
  const checkAuth = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

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
    setStep(AppStep.WORKFLOW);
  };

  const deductCredit = useCallback(async (amount: number = 1) => {
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
  }, []);

  // Admin Functions
  const fetchAdminUsers = async () => {
    setAdminLoading(true);
    try {
      const res = await fetch('/api/admin/users');
      if (res.ok) setAdminUsers(await res.json());
    } catch (err) { console.error(err); }
    finally { setAdminLoading(false); }
  };

  const fetchRechargeLogs = async () => {
    setAdminLoading(true);
    try {
      const res = await fetch('/api/admin/recharge-logs');
      if (res.ok) setRechargeLogs(await res.json());
    } catch (err) { console.error(err); }
    finally { setAdminLoading(false); }
  };

  const fetchGenerationLogs = async () => {
    setAdminLoading(true);
    try {
      const res = await fetch('/api/admin/generation-logs');
      if (res.ok) setGenerationLogs(await res.json());
    } catch (err) { console.error(err); }
    finally { setAdminLoading(false); }
  };

  const updateCredits = async (userId: string, credits: number) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}/credits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credits })
      });
      if (res.ok) fetchAdminUsers();
    } catch (err) { console.error(err); alert('更新失败'); }
  };

  const updateRole = async (userId: string, role: string) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role })
      });
      if (res.ok) fetchAdminUsers();
    } catch (err) { console.error(err); alert('更新失败'); }
  };

  const handleResetPassword = async (userId: string, username: string) => {
    if (!confirm(`确定要将用户 ${username} 的密码重置为 123456 吗？`)) return;
    try {
      const res = await fetch(`/api/admin/users/${userId}/reset-password`, { method: 'POST' });
      const data = await res.json();
      alert(data.message);
    } catch (err) { console.error(err); alert('重置失败'); }
  };

  // Profile Functions
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
    } catch (err) { console.error(err); setProfileMessage('修改失败，请重试'); }
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
    } catch (err) { console.error(err); }
    finally { setProfileLoading(false); }
  };

  // History Functions
  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const endpoint = auth.user?.role === 'admin' ? '/api/admin/history' : '/api/user/history';
      const res = await fetch(endpoint);
      if (res.ok) setImageHistory(await res.json());
    } catch (err) { console.error(err); }
    finally { setHistoryLoading(false); }
  }, [auth.user?.role]);

  const saveToHistory = useCallback(async (imageUrl: string, prompt: string) => {
    try {
      await fetch('/api/user/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl, prompt })
      });
    } catch (err) { console.error("保存历史失败", err); }
  }, []);

  const deleteHistoryItem = async (id: string) => {
    if (!confirm("确定要删除这条历史记录吗？")) return;
    try {
      const res = await fetch(`/api/user/history/${id}`, { method: 'DELETE' });
      if (res.ok) setImageHistory(prev => prev.filter(h => h.id !== id));
    } catch (err) { console.error(err); }
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
      } else { alert("删除失败"); }
    } catch (err) { console.error(err); alert("部分删除失败"); }
  };

  // File Helpers
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

  const removeProductImage = (index: number) => setProductImages(prev => prev.filter((_, i) => i !== index));

  const handleCompositionRefImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setCompositionRefImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleCardRefImageChange = (cardId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setCardRefImages(prev => ({ ...prev, [cardId]: reader.result as string }));
      reader.readAsDataURL(file);
    }
  };

  // Step 2: Full Plan Generation
  const runStep2 = async () => {
    if (productImages.length === 0) return;
    setLoading(true);
    setAnalysis(null);
    const combinedInfo = `卖点:${sellingPoints}, 允许:${allowedElements}, 禁止:${prohibitedElements}`;
    try {
      const res = await analyzeProduct(productImages, combinedInfo, strategyType, model, compositionRefImage, userApiKey);
      setAnalysis({ ...res, selling_points: sellingPoints, allowed_elements: allowedElements, prohibited_elements: prohibitedElements });
      
      if (constitution) {
        const prompts = await fusePrompts(constitution, { ...res, selling_points: sellingPoints, allowed_elements: allowedElements, prohibited_elements: prohibitedElements }, model, userApiKey);
        
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
      alert("分析失败: " + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

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
        await deductCredit(cost);
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

  const executeBulkGen = async () => {
    setIsBulkLoading(true);
    try {
      const tasks = finalPrompts.map(p => generateSingleImage(p.id));
      await Promise.all(tasks);
    } finally {
      setIsBulkLoading(false);
    }
  };

  // Detail Assistant Functions
  const runDetailStep1 = async () => {
    if (productImages.length === 0) { alert("请先上传产品图"); return; }
    setDetailLoading(true);
    try {
      const res = await detailAssistantStep1(productImages, productKeywords, model, userApiKey);
      setDetailProductAnalysis(res);
      setDetailStep(2);
    } catch (err) { alert("产品识别失败: " + (err as Error).message); }
    finally { setDetailLoading(false); }
  };

  const runDetailStep2 = async () => {
    if (!detailProductAnalysis) return;
    setDetailLoading(true);
    try {
      const res = await detailAssistantStep2(detailProductAnalysis, productKeywords, model, userApiKey);
      setDetailDesignGuide(res);
      setDetailStep(3);
    } catch (err) { alert("生成设计规范失败: " + (err as Error).message); }
    finally { setDetailLoading(false); }
  };

  const runDetailStep3 = async () => {
    if (!detailDesignGuide) return;
    setDetailLoading(true);
    try {
      const res = await detailAssistantStep3(detailDesignGuide, productKeywords, detailScreenCount, model, userApiKey);
      setDetailStoryboards(res);
    } catch (err) { alert("生成架构方案失败: " + (err as Error).message); }
    finally { setDetailLoading(false); }
  };

  const runDetailGenImage = async (id: string) => {
    const sb = detailStoryboards.find(s => s.id === id);
    if (!sb || !auth.user || !userApiKey) return;

    const cost = (MODEL_COSTS[genModel as keyof typeof MODEL_COSTS].resolutions as Record<string, { rmb: number }>)[genResolution].rmb;
    if (auth.user.credits < cost) {
      alert(`点数不足，本次生成需要 ${cost} 点，当前剩余 ${auth.user.credits} 点`);
      return;
    }

    setDetailStoryboards(prev => prev.map(s => s.id === id ? { ...s, status: 'loading' } : s));
    try {
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
        const hasCredits = await deductCredit(cost);
        if (!hasCredits) {
          setDetailStoryboards(prev => prev.map(s => s.id === id ? { ...s, status: 'error' } : s));
          return;
        }
        setDetailStoryboards(prev => prev.map(s => s.id === id ? { ...s, generatedImage: imageUrl, status: 'done' } : s));
        saveToHistory(imageUrl, sb.prompt);
      } else {
        setDetailStoryboards(prev => prev.map(s => s.id === id ? { ...s, status: 'error' } : s));
      }
    } catch (err) {
      console.error(err);
      setDetailStoryboards(prev => prev.map(s => s.id === id ? { ...s, status: 'error' } : s));
    }
  };

  const runDetailBulkGen = async () => {
    if (detailStoryboards.length === 0) return;
    const concurrencyLimit = 3;
    const pendingIds = detailStoryboards.filter(sb => sb.status !== 'done').map(sb => sb.id);
    for (let i = 0; i < pendingIds.length; i += concurrencyLimit) {
      const chunk = pendingIds.slice(i, i + concurrencyLimit);
      await Promise.all(chunk.map(id => runDetailGenImage(id)));
    }
  };

  const runDetailRegenStoryboard = async (id: string) => {
    const sb = detailStoryboards.find(s => s.id === id);
    if (!sb || !detailDesignGuide) return;
    setDetailStoryboards(prev => prev.map(s => s.id === id ? { ...s, status: 'loading' } : s));
    try {
      const res = await regenerateSingleDetailStoryboard(detailDesignGuide, sb, productKeywords, model, userApiKey);
      setDetailStoryboards(prev => prev.map(s => s.id === id ? { ...res, id: s.id, refImage: s.refImage, generatedImage: s.generatedImage, status: 'idle' } : s));
    } catch (err) {
      alert("重新生成失败: " + (err as Error).message);
      setDetailStoryboards(prev => prev.map(s => s.id === id ? { ...s, status: 'error' } : s));
    }
  };

  const runDetailUpdatePrompt = async (id: string) => {
    const sb = detailStoryboards.find(s => s.id === id);
    if (!sb || !detailDesignGuide) return;
    try {
      const newPrompt = await updateDetailPromptFromFields(detailDesignGuide, sb, model, userApiKey);
      setDetailStoryboards(prev => prev.map(s => s.id === id ? { ...s, prompt: newPrompt } : s));
    } catch (err) { console.error(err); }
  };

  // Single Tool Functions
  const runSingleDeconstruction = async (base64: string) => {
    if (!userApiKey) { alert("请先配置 API Key"); return; }
    setDeconstructionResult(null);
    setIsDeconstructing(true);
    try {
      const result = await deconstructImage(base64, model, userApiKey);
      setDeconstructionResult(result);
      setEditablePrompt(result.generated_prompt);
    } catch (err) { alert(`图片解构失败: ${err instanceof Error ? err.message : String(err)}`); }
    finally { setIsDeconstructing(false); }
  };

  const runSingleGeneration = async () => {
    if (!userApiKey || !deconstructionResult || !singleProductImage) { alert("请先上传参考图并解析，以及上传产品图"); return; }
    const cost = (MODEL_COSTS[genModel as keyof typeof MODEL_COSTS].resolutions as Record<string, { rmb: number }>)[genResolution].rmb;
    if (auth.user!.credits < cost) { alert(`点数不足`); return; }
    setIsGeneratingSingle(true);
    try {
      const finalPrompt = `产品图：白色背景的产品。${productKeywords ? `产品关键词：${productKeywords}。` : ''} ${editablePrompt}. 参考强度：${refStrength}。`;
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
      }
    } catch (err) { console.error(err); }
    finally { setIsGeneratingSingle(false); }
  };

  const runSegmentation = async (imageB64: string) => {
    if (!userApiKey) { alert("请先配置 API Key"); return; }
    setIsSegmenting(true);
    try {
      const objects = await segmentImage(imageB64, model, userApiKey);
      const objectsWithCrops = await Promise.all(objects.map(async obj => {
        const crop = await cropImage(imageB64, obj.bbox);
        return { ...obj, original_crop_path: crop };
      }));
      setSegmentedObjects(objectsWithCrops);
    } catch (err) { console.error(err); alert("解构失败"); }
    finally { setIsSegmenting(false); }
  };

  const runReplacementGeneration = async () => {
    if (!userApiKey || !replacementBaseImage || segmentedObjects.length === 0) return;
    const cost = (MODEL_COSTS[genModel as keyof typeof MODEL_COSTS].resolutions as Record<string, { rmb: number }>)[genResolution].rmb;
    if (auth.user!.credits < cost) return;
    setIsGeneratingSingle(true);
    try {
      const replacements = segmentedObjects.filter(obj => obj.replacementImage);
      const replacementDetails = replacements.map(r => `替换物体 #${r.id} (${r.label})`).join('; ');
      const finalPrompt = `基于基准图进行局部替换。${replacementDetails}。背景保留强度: ${backgroundFidelity}。`;
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
      }
    } catch (err) { console.error(err); }
    finally { setIsGeneratingSingle(false); }
  };

  const cropImage = (imageB64: string, bbox: [number, number, number, number]): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(imageB64); return; }
        const x = (bbox[0] / 1000) * img.width;
        const y = (bbox[1] / 1000) * img.height;
        const w = (bbox[2] / 1000) * img.width;
        const h = (bbox[3] / 1000) * img.height;
        canvas.width = w; canvas.height = h;
        ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = imageB64;
    });
  };

  const toggleHistorySelection = (id: string) => {
    setSelectedHistoryIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const downloadSelectedHistory = () => {
    selectedHistoryIds.forEach(id => {
      const item = imageHistory.find(h => h.id === id);
      if (item) downloadImage(item.imageUrl, `history-${id}`);
    });
  };

  const handleDetailRefImageChange = (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setDetailStoryboards(prev => prev.map(s => s.id === id ? { ...s, refImage: reader.result as string } : s));
      reader.readAsDataURL(file);
    }
  };

  const downloadImage = (url: string, name: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = `${name}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const activeStep = (sId: AppStep) => {
    if (sId === AppStep.ADMIN_PANEL) fetchAdminUsers();
    if (sId === AppStep.PROFILE) fetchUserLogs();
    if (sId === AppStep.HISTORY) fetchHistory();
    setStep(sId);
  };

  const exportToExcel = (data: Record<string, string | number | boolean | null>[], fileName: string) => {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    XLSX.writeFile(wb, `${fileName}.xlsx`);
  };

  return {
    step, setStep: activeStep,
    model, setModel,
    loading,
    userApiKey, setUserApiKey,
    paidImageApiKey, setPaidImageApiKey,
    doubaoApiKey, setDoubaoApiKey,
    doubaoModelId, setDoubaoModelId,
    showApiKeyModal, setShowApiKeyModal,
    auth, authMode, setAuthMode, username, setUsername, password, setPassword, authError, handleLogin, handleRegister, handleLogout,
    adminUsers, rechargeLogs, generationLogs, adminTab, setAdminTab, adminLoading, updateCredits, updateRole, handleResetPassword, fetchRechargeLogs, fetchGenerationLogs, exportToExcel,
    oldPassword, setOldPassword, newPassword, setNewPassword, profileMessage, userRechargeLogs, userGenLogs, profileTab, setProfileTab, profileLoading, handleChangePassword,
    imageHistory, historyLoading, selectedHistoryIds, toggleHistorySelection, deleteHistoryItem, deleteSelectedHistory, downloadSelectedHistory,
    filterYear, setFilterYear, filterMonth, setFilterMonth, filterDay, setFilterDay, filterUser, setFilterUser,
    styleImage, setStyleImage, constitution, setConstitution, productImages, setProductImages, sellingPoints, setSellingPoints, allowedElements, setAllowedElements, prohibitedElements, setProhibitedElements, strategyType, setStrategyType, analysis, setAnalysis, finalPrompts, setFinalPrompts, globalSelectedFont, setGlobalSelectedFont, cardRefImages, cardGeneratedImages, cardGenStatus, activeGenCardId, isBulkLoading, genModel, setGenModel, genAspectRatio, setGenAspectRatio, genResolution, setGenResolution, compositionRefImage, setCompositionRefImage,
    singleToolMode, setSingleToolMode, singleRefImage, setSingleRefImage, singleProductImage, setSingleProductImage, deconstructionResult, setDeconstructionResult, singleGeneratedImage, setSingleGeneratedImage, isDeconstructing, isGeneratingSingle, editablePrompt, setEditablePrompt, useRefImage, setUseRefImage, refStrength, setRefStrength, productKeywords, setProductKeywords, replacementBaseImage, setReplacementBaseImage, segmentedObjects, setSegmentedObjects, isSegmenting, backgroundFidelity, setBackgroundFidelity,
    detailStep, setDetailStep, detailLoading, detailProductAnalysis, detailDesignGuide, detailScreenCount, setDetailScreenCount, detailStoryboards, setDetailStoryboards, zoomedImageUrl, setZoomedImageUrl,
    handleMultipleFilesChange, removeProductImage, handleCompositionRefImageChange, handleCardRefImageChange, runStep2, generateSingleImage, executeBulkGen,
    runDetailStep1, runDetailStep2, runDetailStep3, runDetailGenImage, runDetailBulkGen, runDetailRegenStoryboard, runDetailUpdatePrompt, handleDetailRefImageChange,
    runSingleDeconstruction, runSingleGeneration, runSegmentation, runReplacementGeneration,
    downloadImage
  };
};
