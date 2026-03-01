
import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { AppStep, VisualConstitution, ProductAnalysis, FinalPrompt, StrategyType, Storyboard, User, AuthState, RechargeLog, GenerationLog } from './types';
import { decodeStyle, analyzeProduct, fusePrompts, generateEcomImage, regenerateSinglePrompt } from './geminiService';

const App: React.FC = () => {
  const [step, setStep] = useState<AppStep>(AppStep.STYLE_DECODER);
  const [model, setModel] = useState('gemini-3-flash-preview');
  const [loading, setLoading] = useState(false);
  const [userApiKey, setUserApiKey] = useState<string>(() => {
    return localStorage.getItem('user_gemini_api_key') || '';
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
  const [genModel, setGenModel] = useState('nanobanana');
  const [genAspectRatio, setGenAspectRatio] = useState('1:1');
  const [compositionRefImage, setCompositionRefImage] = useState<string | null>(null);
  
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

  const deductCredit = async () => {
    try {
      const res = await fetch('/api/user/deduct-credit', { method: 'POST' });
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

  const updatePromptCopy = (id: string, newCopy: string) => {
    setFinalPrompts(prev => prev.map(p => p.id === id ? { ...p, copy: newCopy } : p));
  };

  const updateFinalPrompt = (id: string, newPrompt: string) => {
    setFinalPrompts(prev => prev.map(p => p.id === id ? { ...p, prompt: newPrompt } : p));
  };

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
  const copyFullCardInfo = (p: FinalPrompt) => {
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
  };

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
        setFinalPrompts(prompts);
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

    if (genModel === 'nanobanana pro' || model === 'gemini-3-pro-preview') {
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

    const prohibitedNotice = prohibitedElements 
      ? `【绝对禁止项】：严禁在画面中出现“${prohibitedElements}”。确保画面呈现极致无缝、平滑的工业质感。`
      : "保持画面专业极简，视觉纯净。";

    const assembledPrompt = `
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

  const regeneratePrompt = async (cardId: string) => {
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
  };

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
              { id: AppStep.HISTORY, label: '生图历史' },
              { id: AppStep.PROFILE, label: '个人中心' },
              ...(auth.user.role === 'admin' ? [{ id: AppStep.ADMIN_PANEL, label: '管理后台' }] : [])
            ].map((s) => (
              <button
                key={s.id}
                disabled={step < s.id && s.id !== AppStep.ADMIN_PANEL && s.id !== AppStep.PROFILE && s.id !== AppStep.HISTORY}
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
            <option value="gemini-3-pro-preview">PRO 3.0 (高保真引擎)</option>
          </select>
        </div>
      </header>

      <main className="flex-1 max-w-[1440px] mx-auto w-full px-8 py-8">
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
                          {new Date(h.timestamp).toLocaleString()}
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
                  onClick={() => { setAdminTab('users'); fetchAdminUsers(); }}
                  className={`px-6 py-2 rounded-lg text-[12px] font-black transition-all ${adminTab === 'users' ? 'bg-white shadow-md text-black' : 'text-[#86868b] hover:text-black'}`}
                >
                  用户管理
                </button>
                <button 
                  onClick={() => { setAdminTab('recharge'); fetchRechargeLogs(); }}
                  className={`px-6 py-2 rounded-lg text-[12px] font-black transition-all ${adminTab === 'recharge' ? 'bg-white shadow-md text-black' : 'text-[#86868b] hover:text-black'}`}
                >
                  充值流水
                </button>
                <button 
                  onClick={() => { setAdminTab('stats'); fetchGenerationLogs(); }}
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
                      {rechargeLogs.map(log => (
                        <tr key={log.id} className="hover:bg-[#F5F5F7]/30 transition-all">
                          <td className="px-8 py-6 text-[12px] text-[#86868b] font-medium">
                            {new Date(log.timestamp).toLocaleString()}
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
                              const date = new Date(log.timestamp);
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
                              const date = new Date(log.timestamp);
                              return (filterUser === 'all' || log.userId === filterUser) &&
                                     (!filterYear || date.getFullYear().toString() === filterYear) &&
                                     (!filterMonth || (date.getMonth() + 1).toString() === filterMonth) &&
                                     (!filterDay || date.getDate().toString() === filterDay);
                            });
                            exportToExcel(filtered.map(l => ({ '时间': new Date(l.timestamp).toLocaleString(), '用户': l.username, '操作': '生图渲染' })), `全平台生图统计_${new Date().getTime()}`);
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
                            const date = new Date(log.timestamp);
                            return (filterUser === 'all' || log.userId === filterUser) &&
                                   (!filterYear || date.getFullYear().toString() === filterYear) &&
                                   (!filterMonth || (date.getMonth() + 1).toString() === filterMonth) &&
                                   (!filterDay || date.getDate().toString() === filterDay);
                          }).length === 0 ? (
                            <tr><td colSpan={3} className="px-8 py-10 text-center text-[#86868b] font-bold">暂无符合条件的统计记录</td></tr>
                          ) : generationLogs.filter(log => {
                            const date = new Date(log.timestamp);
                            return (filterUser === 'all' || log.userId === filterUser) &&
                                   (!filterYear || date.getFullYear().toString() === filterYear) &&
                                   (!filterMonth || (date.getMonth() + 1).toString() === filterMonth) &&
                                   (!filterDay || date.getDate().toString() === filterDay);
                          }).map(log => (
                            <tr key={log.id} className="hover:bg-[#F5F5F7]/30 transition-all">
                              <td className="px-8 py-6 text-[12px] text-[#86868b] font-medium">
                                {new Date(log.timestamp).toLocaleString()}
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
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-slide-up">
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
                        <div key={idx} className="aspect-square rounded-xl bg-white border border-black/10 relative group overflow-hidden shadow-sm">
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
                         onClick={() => document.getElementById('comp-upload')?.click()}
                       >
                         {compositionRefImage ? (
                           <>
                             <img src={compositionRefImage} className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" />
                             <button onClick={(e) => { e.stopPropagation(); setCompositionRefImage(null); }} className="absolute top-1 right-1 w-5 h-5 bg-black/70 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 scale-75 hover:bg-black transition-all"><i className="fas fa-times text-[9px]"></i></button>
                           </>
                         ) : (
                           <div className="text-center">
                             <i className="fas fa-drafting-compass opacity-20 group-hover:opacity-100 mb-1 text-lg"></i>
                             <p className="text-[9px] font-bold opacity-30 group-hover:opacity-100 uppercase">上传</p>
                           </div>
                         )}
                         <input id="comp-upload" type="file" className="hidden" onChange={(e) => handleFileChange(e, setCompositionRefImage)} />
                       </div>
                    </div>
                  )}
                </div>
                
                <div className="grid grid-cols-1 gap-4 mb-8">
                  {productImages.map((img, idx) => (
                    <div key={idx} className="aspect-square rounded-2xl bg-[#FBFBFD] border border-black/10 relative group overflow-hidden shadow-sm">
                      <img src={img} className="w-full h-full object-contain p-2" />
                      <button onClick={() => removeProductImage(idx)} className="absolute top-2 right-2 w-6 h-6 bg-black/80 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 scale-75 hover:bg-black transition-all"><i className="fas fa-times text-[10px]"></i></button>
                    </div>
                  ))}
                  {productImages.length < 6 && (
                    <div className="aspect-square rounded-2xl border-2 border-dashed border-black/15 hover:border-[#0071e3]/30 flex flex-col items-center justify-center cursor-pointer bg-[#FBFBFD] transition-all group" onClick={() => document.getElementById('prod-multi')?.click()}>
                      <i className="fas fa-plus opacity-20 group-hover:opacity-100 mb-1"></i>
                      <span className="text-[9px] font-bold opacity-30 group-hover:opacity-100 uppercase">添加白底图</span>
                    </div>
                  )}
                  <input id="prod-multi" type="file" multiple className="hidden" onChange={handleMultipleFilesChange} />
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
        )}

        {step === AppStep.PROMPT_FUSION && (
          <div className="animate-slide-up">
            <div className="flex items-end justify-between mb-10 px-2">
              <div>
                <div className="section-label mb-3 text-[#0071e3]">Step 03 / Final Deck</div>
                <h1 className="text-4xl font-black tracking-tighter text-black">{strategyType === StrategyType.DETAIL ? '详情页视觉架构已就绪。' : '高点击率主图全案已就绪。'}</h1>
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
                  <p className="text-sm font-bold">暂无生成方案，请返回上一步重新执行建模</p>
                  <button onClick={() => setStep(AppStep.PRODUCT_STRATEGY)} className="mt-4 text-[#0071e3] font-bold border-b border-[#0071e3]">返回营销策划</button>
                </div>
              ) : finalPrompts.map((p, idx) => (
                <div key={p.id} className="apple-card p-8 flex flex-col group h-full border-black/10 bg-white shadow-md hover:shadow-xl transition-all duration-700">
                  <div className="flex justify-between items-center mb-8">
                    <span className="bg-[#F5F5F7] px-4 py-1.5 rounded-full text-[10px] font-black text-black border border-black/5 tracking-widest uppercase">{strategyType === StrategyType.DETAIL ? 'STORYBOARD' : 'SCHEME'} {idx + 1}</span>
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
                       <div className="p-4 bg-white border border-black/10 rounded-xl shadow-sm"><span className="section-label text-[7px] opacity-40 block mb-1">排版位置</span><span className="text-[10px] font-black text-black">{p.placement}</span></div>
                       <div className="p-4 bg-white border border-black/10 rounded-xl shadow-sm"><span className="section-label text-[7px] opacity-40 block mb-1 truncate">选定字体</span><span className="text-[10px] font-black text-black truncate">{globalSelectedFont}</span></div>
                    </div>

                    <div className="bg-black text-white p-6 rounded-[28px] relative overflow-hidden group/p shadow-lg border border-white/5 flex flex-col h-full mt-auto">
                      <div className="flex justify-between items-center mb-4">
                         <span className="section-label text-white/40 text-[9px] font-black uppercase tracking-widest">生图方案详情</span>
                         <div className="flex items-center gap-2">
                          <button 
                            onClick={() => regeneratePrompt(p.id)} 
                            disabled={cardGenStatus[p.id] === 'loading'}
                            className="text-[8px] font-black text-white/70 hover:text-white transition-all bg-white/10 px-3 py-1.5 rounded-full border border-white/10 hover:bg-white/20 active:scale-95 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {cardGenStatus[p.id] === 'loading' ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-sync-alt"></i>}
                            <span>重新生成</span>
                          </button>
                          <button 
                           onClick={() => copyFullCardInfo(p)} 
                           className="text-[8px] font-black text-white/70 hover:text-white transition-all bg-white/10 px-3 py-1.5 rounded-full border border-white/10 hover:bg-white/20 active:scale-95 flex items-center gap-2"
                          >
                           <i className="fas fa-copy"></i>
                          </button>
                        </div>
                      </div>
                      <textarea 
                        className="w-full bg-transparent border-none text-white text-[11px] font-medium leading-relaxed opacity-70 focus:ring-0 p-0 resize-none h-32 no-scrollbar"
                        value={p.prompt}
                        onChange={(e) => updateFinalPrompt(p.id, e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* 原图弹出预览 Overlay */}
      {hoveredPreviewImage && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-12 pointer-events-none transition-all duration-300 animate-slide-up">
           <div className="absolute inset-0 bg-black/70 backdrop-blur-2xl"></div>
           <div className="relative max-w-full max-h-full flex flex-col items-center">
              <div className="bg-white/10 backdrop-blur-md px-6 py-2 rounded-full mb-6 border border-white/20 shadow-2xl">
                <span className="text-white text-xs font-black tracking-[0.3em] uppercase">{hoveredPreviewImage.title} · 原图渲染细节</span>
              </div>
              <img 
                src={hoveredPreviewImage.url} 
                className="max-w-[80vw] max-h-[75vh] object-contain rounded-[32px] shadow-[0_40px_100px_rgba(0,0,0,0.6)] border-2 border-white/20"
                alt="Full Preview"
              />
              <div className="mt-8 bg-white/95 px-8 py-3.5 rounded-full shadow-2xl flex items-center gap-4 border border-black/5 animate-pulse">
                <i className="fas fa-mouse-pointer text-black/40 text-xs"></i>
                <span className="text-black font-black text-[10px] uppercase tracking-widest">移开鼠标以返回编辑界面</span>
              </div>
           </div>
        </div>
      )}

      {/* 生图配置弹窗 */}
      {(activeGenCardId || isBulkGenActive) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-8 animate-slide-up">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-xl transition-all duration-700" onClick={() => { setActiveGenCardId(null); setIsBulkGenActive(false); }}></div>
          <div className="apple-card w-full max-w-xl bg-white p-12 relative z-[110] shadow-[0_40px_100px_rgba(0,0,0,0.4)] border-white/10 overflow-hidden">
             <div className="absolute -top-24 -right-24 w-64 h-64 bg-[#0071e3]/10 rounded-full blur-[80px]"></div>
             <div className="flex items-center gap-6 mb-10 relative">
                <div className={`w-16 h-16 rounded-[22px] flex items-center justify-center text-white text-2xl shadow-xl transform hover:rotate-12 transition-all ${isBulkGenActive ? 'bg-orange-500' : 'bg-black'}`}>
                  <i className={isBulkGenActive ? 'fas fa-bolt' : 'fas fa-wand-magic-sparkles'}></i>
                </div>
                <div>
                  <h2 className="text-2xl font-black text-black tracking-tighter">{isBulkGenActive ? `执行${strategyType === StrategyType.DETAIL ? '全案' : '主图'}批量生成` : '提交生图渲染任务'}</h2>
                  <p className="text-[13px] text-[#6e6e73] font-bold mt-1 tracking-tight">{isBulkGenActive ? '同步注入全局审美基因' : `当前${strategyType === StrategyType.DETAIL ? '分镜' : '方案'}：${activeGenCard?.title}`}</p>
                </div>
                <button onClick={() => { setActiveGenCardId(null); setIsBulkGenActive(false); }} className="ml-auto w-10 h-10 rounded-full hover:bg-[#F5F5F7] flex items-center justify-center text-black/20 hover:text-black transition-all"><i className="fas fa-times text-lg"></i></button>
             </div>
             
             <div className="space-y-10 relative">
                <div>
                  <label className="section-label mb-4 block text-black/60 font-black tracking-widest uppercase text-[10px]">渲染引擎 / Engine</label>
                  <div className="grid grid-cols-2 gap-4">
                    <button onClick={() => setGenModel('nanobanana')} className={`p-6 rounded-[24px] border-4 text-left transition-all duration-500 group ${genModel === 'nanobanana' ? 'border-black bg-black text-white shadow-lg' : 'border-[#F5F5F7] bg-[#F5F5F7] hover:border-black/10'}`}>
                      <div className="text-[16px] font-black">FLASH 2.5</div>
                      <div className="text-[9px] opacity-60 mt-1 font-bold uppercase tracking-widest">Balanced</div>
                    </button>
                    <button onClick={() => setGenModel('nanobanana pro')} className={`p-6 rounded-[24px] border-4 text-left transition-all duration-500 group ${genModel === 'nanobanana pro' ? 'border-black bg-black text-white shadow-lg' : 'border-[#F5F5F7] bg-[#F5F5F7] hover:border-black/10'}`}>
                      <div className="text-[16px] font-black">PRO 3.0</div>
                      <div className="text-[9px] opacity-60 mt-1 font-bold uppercase tracking-widest">Cinema Grade</div>
                    </button>
                  </div>
                </div>
                
                <div>
                  <label className="section-label mb-4 block text-black/60 font-black tracking-widest uppercase text-[10px]">构图比例 / Aspect Ratio</label>
                  <div className="flex flex-wrap gap-3">
                    {['1:1', '16:9', '9:16', '4:3', '3:4'].map(r => (
                      <button key={r} onClick={() => setGenAspectRatio(r)} className={`px-6 py-3 rounded-xl text-[13px] font-black transition-all border-2 duration-500 ${genAspectRatio === r ? 'bg-black text-white border-black scale-105 shadow-md' : 'bg-[#F5F5F7] border-transparent opacity-60 hover:opacity-100 hover:border-black/10'}`}>{r}</button>
                    ))}
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
                ) : (
                  <div className="bg-[#F5F5F7] p-6 rounded-[24px] border border-black/5 shadow-inner">
                    <div className="section-label text-[9px] mb-3 opacity-40 font-black uppercase tracking-widest">方案配置快览</div>
                    <div className="flex justify-between items-center bg-white px-5 py-3 rounded-xl shadow-sm border border-black/5">
                      <span className="text-[12px] font-bold text-[#86868b]">视觉占位：<span className="text-black font-black">{activeGenCard?.placement}</span></span>
                      <span className="text-[12px] font-black text-[#0071e3] italic">{globalSelectedFont}</span>
                    </div>
                  </div>
                )}

                <button 
                  onClick={isBulkGenActive ? executeBulkGen : executeImageGen} 
                  className={`btn-primary w-full py-5 text-[16px] shadow-xl transition-all duration-500 font-black tracking-widest ${isBulkGenActive ? 'bg-orange-500 hover:bg-orange-600' : 'bg-black hover:bg-[#1d1d1f]'}`}
                >
                  <i className={`${isBulkGenActive ? 'fas fa-bolt' : 'fas fa-wand-magic-sparkles'} mr-3`}></i>
                  {isBulkGenActive ? `启动全案批量生成` : '启动单图方案渲染'}
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
