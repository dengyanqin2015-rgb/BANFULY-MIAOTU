import React, { useState, useRef, useEffect, useLayoutEffect, useImperativeHandle, forwardRef } from 'react';
import { motion, AnimatePresence, useDragControls, PanInfo } from 'motion/react';
import { MessageSquare, X, Send, Loader2, Copy, Check, Sparkles, BrainCircuit, FileText, Square } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import * as XLSX from 'xlsx';
import { cn } from '../lib/utils';
import { chatWithAssistant } from '../lib/gemini';
import { User } from '../types';
import { assertImageUsage, DOCUMENT_UPLOAD_LIMITS, processImageFiles, readFileAsArrayBuffer, readFileAsDataUrl, validateDocumentFiles } from '../lib/uploadProcessing';
import { ASSISTANT_DEEP_TIMEOUT_MS, ASSISTANT_NORMAL_TIMEOUT_MS, AssistantTaskCoordinator, getAssistantErrorMessage, pruneAssistantPreviews, trimAssistantHistory } from '../lib/assistantRuntime';

export interface AssistantRef {
  open: () => void;
  sendImage: (data: string, mimeType: string, preview: string, autoSend?: boolean, usage?: { originalBytes: number; analysisBytes: number }) => void;
}

const ASSISTANT_COSTS = {
  normal: 0.05,
  deep: 0.1,
  perImage: 0.05
};

interface Message {
  role: 'user' | 'model';
  content: string;
  images?: string[];
  files?: { name: string; mimeType: string; preview?: string }[];
  timestamp: number;
  includeInHistory?: boolean;
}

interface AssistantProps {
  userApiKey?: string;
  user?: User | null;
  onDeductCredit?: (amount: number) => Promise<boolean>;
}

export const Assistant = forwardRef<AssistantRef, AssistantProps>(({ userApiKey, user, onDeductCredit }, ref) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<'normal' | 'deep'>('normal');
  const [pendingImages, setPendingImages] = useState<{ data: string; mimeType: string; preview: string; name?: string; originalBytes?: number; analysisBytes?: number }[]>([]);
  const imageUsageRef = useRef({ count: 0, originalBytes: 0, analysisBytes: 0 });
  const documentUsageRef = useRef({ count: 0, bytes: 0 });
  const attachmentQueueRef = useRef<Promise<void>>(Promise.resolve());
  const assistantTaskRef = useRef(new AssistantTaskCoordinator());
  const sendLockRef = useRef(false);
  const autoSendTimersRef = useRef(new Set<number>());
  const syncAttachmentUsage = (items: typeof pendingImages) => {
    imageUsageRef.current = items.filter(item => Boolean(item.preview)).reduce((usage, item) => ({
      count: usage.count + 1,
      originalBytes: usage.originalBytes + (item.originalBytes || Math.ceil(item.data.length * 3 / 4)),
      analysisBytes: usage.analysisBytes + (item.analysisBytes || Math.ceil(item.data.length * 3 / 4)),
    }), { count: 0, originalBytes: 0, analysisBytes: 0 });
    documentUsageRef.current = items.filter(item => !item.preview).reduce((usage, item) => ({ count: usage.count + 1, bytes: usage.bytes + (item.originalBytes || 0) }), { count: 0, bytes: 0 });
  };
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [size, setSize] = useState({ width: 450, height: 650 });
  const [position, setPosition] = useState({ x: window.innerWidth - 500, y: 100 });
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dragControls = useDragControls();

  useEffect(() => () => {
    assistantTaskRef.current.cancel();
    autoSendTimersRef.current.forEach(timer => window.clearTimeout(timer));
    autoSendTimersRef.current.clear();
  }, []);

  useLayoutEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  useImperativeHandle(ref, () => ({
    open: () => setIsOpen(true),
    sendImage: (data, mimeType, preview, autoSend = false, usage) => {
      setIsOpen(true);
      attachmentQueueRef.current = attachmentQueueRef.current.then(async () => {
      const bytes = Math.ceil(data.length * 3 / 4);
      const originalBytes = usage?.originalBytes ?? bytes;
      const analysisBytes = usage?.analysisBytes ?? bytes;
      try {
        assertImageUsage(imageUsageRef.current, { count: 1, originalBytes, analysisBytes });
      } catch (error) { alert((error as Error).message); return; }
      imageUsageRef.current = { count: imageUsageRef.current.count + 1, originalBytes: imageUsageRef.current.originalBytes + originalBytes, analysisBytes: imageUsageRef.current.analysisBytes + analysisBytes };
      const newImage = { data, mimeType, preview, originalBytes, analysisBytes };
      setPendingImages(prev => [...prev, newImage]);
      
      if (autoSend) {
        // We need to wait for the state to update or use the values directly
        const timer = window.setTimeout(() => {
          autoSendTimersRef.current.delete(timer);
          handleSendWithParams("请分析这张图片并提供生图建议。", [newImage]);
        }, 100);
        autoSendTimersRef.current.add(timer);
      } else {
        setInput("请分析这张图片并提供生图建议。");
      }
      });
    }
  }));

  const handleSendWithParams = async (text: string, images: { data: string; mimeType: string; preview: string; name?: string }[]) => {
    if (isLoading || sendLockRef.current) return;
    sendLockRef.current = true;

    // Calculate cost
    const cost = (mode === 'deep' ? ASSISTANT_COSTS.deep : ASSISTANT_COSTS.normal) + (images.length * ASSISTANT_COSTS.perImage);

    if (user && user.credits < cost) {
      setMessages(prev => [...prev, {
        role: 'model',
        content: `抱歉，点数不足。本次分析需要 ${cost.toFixed(2)} 点，当前剩余 ${user.credits.toFixed(2)} 点。`,
        timestamp: Date.now(),
        includeInHistory: false,
      }]);
      sendLockRef.current = false;
      return;
    }

    // Clear these specific images from pending
    setPendingImages(prev => {
      const next = prev.filter(p => !images.some(img => img.preview === p.preview));
      syncAttachmentUsage(next);
      return next;
    });

    const userMessage: Message = {
      role: 'user',
      content: text,
      images: images.filter(img => img.mimeType.startsWith('image/')).map(img => img.preview),
      files: images.map(img => ({ name: img.name || '图片', mimeType: img.mimeType, preview: img.mimeType.startsWith('image/') ? img.preview : undefined })),
      timestamp: Date.now()
    };

    setMessages(prev => pruneAssistantPreviews([...prev, userMessage]));
    setIsLoading(true);
    const task = assistantTaskRef.current.start(mode === 'deep' ? ASSISTANT_DEEP_TIMEOUT_MS : ASSISTANT_NORMAL_TIMEOUT_MS);

    try {
      const history = trimAssistantHistory(messages.filter(msg => msg.includeInHistory !== false).map(msg => ({
        role: msg.role,
        parts: [{ text: msg.content }]
      })));

      const response = await chatWithAssistant({
        message: text,
        images: images.map(img => ({ data: img.data, mimeType: img.mimeType })),
        mode,
        history,
        apiKey: userApiKey,
        signal: task.signal,
      });
      if (!assistantTaskRef.current.isCurrent(task)) return;

      if (onDeductCredit) {
        await onDeductCredit(cost);
      }
      if (!assistantTaskRef.current.isCurrent(task)) return;

      setMessages(prev => [...prev, {
        role: 'model',
        content: response,
        timestamp: Date.now()
      }]);
    } catch (error: unknown) {
      if (!assistantTaskRef.current.isCurrent(task)) return;
      const err = error as Error;
      console.error("Assistant error:", err);
      setMessages(prev => [...prev, {
        role: 'model',
        content: `抱歉，出错了：${getAssistantErrorMessage(err, task.signal)}`,
        timestamp: Date.now(),
        includeInHistory: false,
      }]);
    } finally {
      if (assistantTaskRef.current.isCurrent(task)) {
        assistantTaskRef.current.finish(task);
        sendLockRef.current = false;
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    const handleWindowResize = () => {
      setPosition(prev => {
        const windowWidth = window.innerWidth;
        const currentRight = windowWidth - (prev.x + size.width);
        if (currentRight < 20) {
          return { ...prev, x: windowWidth - size.width - 20 };
        }
        return prev;
      });
    };
    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, [size.width]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSend = async () => {
    if ((!input.trim() && pendingImages.length === 0) || isLoading || sendLockRef.current) return;
    sendLockRef.current = true;

    // Calculate cost
    const cost = (mode === 'deep' ? ASSISTANT_COSTS.deep : ASSISTANT_COSTS.normal) + (pendingImages.length * ASSISTANT_COSTS.perImage);

    if (user && user.credits < cost) {
      setMessages(prev => [...prev, {
        role: 'model',
        content: `抱歉，点数不足。本次分析需要 ${cost.toFixed(2)} 点，当前剩余 ${user.credits.toFixed(2)} 点。`,
        timestamp: Date.now(),
        includeInHistory: false,
      }]);
      sendLockRef.current = false;
      return;
    }

    const userMessage: Message = {
      role: 'user',
      content: input,
      images: pendingImages.filter(img => img.mimeType.startsWith('image/')).map(img => img.preview),
      files: pendingImages.map(img => ({ name: img.name || '附件', mimeType: img.mimeType, preview: img.mimeType.startsWith('image/') ? img.preview : undefined })),
      timestamp: Date.now()
    };

    setMessages(prev => pruneAssistantPreviews([...prev, userMessage]));
    const currentInput = input;
    const currentImages = [...pendingImages];
    
    setInput('');
    setPendingImages([]);
    syncAttachmentUsage([]);
    setIsLoading(true);
    const task = assistantTaskRef.current.start(mode === 'deep' ? ASSISTANT_DEEP_TIMEOUT_MS : ASSISTANT_NORMAL_TIMEOUT_MS);

    try {
      const history = trimAssistantHistory(messages.filter(msg => msg.includeInHistory !== false).map(msg => ({
        role: msg.role,
        parts: [{ text: msg.content }]
      })));

      const response = await chatWithAssistant({
        message: currentInput || "请分析这些图片",
        images: currentImages.map(img => ({ data: img.data, mimeType: img.mimeType })),
        mode,
        history,
        apiKey: userApiKey,
        signal: task.signal,
      });
      if (!assistantTaskRef.current.isCurrent(task)) return;

      if (onDeductCredit) {
        await onDeductCredit(cost);
      }
      if (!assistantTaskRef.current.isCurrent(task)) return;

      setMessages(prev => [...prev, {
        role: 'model',
        content: response,
        timestamp: Date.now()
      }]);
    } catch (error: unknown) {
      if (!assistantTaskRef.current.isCurrent(task)) return;
      const err = error as Error;
      console.error("Assistant error:", err);
      setMessages(prev => [...prev, {
        role: 'model',
        content: `抱歉，出错了：${getAssistantErrorMessage(err, task.signal)}`,
        timestamp: Date.now(),
        includeInHistory: false,
      }]);
    } finally {
      if (assistantTaskRef.current.isCurrent(task)) {
        assistantTaskRef.current.finish(task);
        sendLockRef.current = false;
        setIsLoading(false);
      }
    }
  };

  const handleStop = () => {
    assistantTaskRef.current.cancel();
    sendLockRef.current = false;
    setIsLoading(false);
    setMessages(prev => [...prev, {
      role: 'model',
      content: '已停止等待本次回答。你可以修改问题后重新发送。',
      timestamp: Date.now(),
      includeInHistory: false,
    }]);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!files.length) return;
    attachmentQueueRef.current = attachmentQueueRef.current.then(async () => {
    try {
      const imageFiles = files.filter(file => file.type.startsWith('image/'));
      const documentFiles = validateDocumentFiles(files.filter(file => !file.type.startsWith('image/')), documentUsageRef.current.count, documentUsageRef.current.bytes);
      const images = await processImageFiles(imageFiles, imageUsageRef.current);
      const additions = images.map(image => ({ data: image.analysisData, mimeType: image.analysisMimeType, preview: image.originalDataUrl, name: image.file.name, originalBytes: image.originalBytes, analysisBytes: image.analysisBytes }));
      for (const file of documentFiles) {
        if (/\.xlsx?$/i.test(file.name)) {
          const workbook = XLSX.read(await readFileAsArrayBuffer(file), { type: 'array', sheetRows: DOCUMENT_UPLOAD_LIMITS.maxExcelRows + 1 });
          let cellCount = 0;
          const parts = workbook.SheetNames.map(name => {
            const sheet = workbook.Sheets[name];
            const range = sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']) : undefined;
            const rows = range ? range.e.r + 1 : 0;
            cellCount += range ? (range.e.r + 1) * (range.e.c + 1) : 0;
            if (rows > DOCUMENT_UPLOAD_LIMITS.maxExcelRows) throw new Error(`“${file.name}”工作表“${name}”超过 ${DOCUMENT_UPLOAD_LIMITS.maxExcelRows} 行`);
            if (cellCount > DOCUMENT_UPLOAD_LIMITS.maxExcelCells) throw new Error(`“${file.name}”超过 ${DOCUMENT_UPLOAD_LIMITS.maxExcelCells} 个单元格限制`);
            return `工作表：${name}\n${XLSX.utils.sheet_to_csv(sheet)}`;
          });
          const bytes = new TextEncoder().encode(parts.join('\n\n'));
          let binary = '';
          for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
          additions.push({ data: btoa(binary), mimeType: 'text/csv', preview: '', name: file.name, originalBytes: file.size, analysisBytes: 0 });
        } else {
          const dataUrl = await readFileAsDataUrl(file);
          additions.push({ data: dataUrl.split(',')[1], mimeType: file.type || 'text/plain', preview: '', name: file.name, originalBytes: file.size, analysisBytes: 0 });
        }
      }
      imageUsageRef.current = images.reduce((usage, image) => ({ count: usage.count + 1, originalBytes: usage.originalBytes + image.originalBytes, analysisBytes: usage.analysisBytes + image.analysisBytes }), imageUsageRef.current);
      documentUsageRef.current = documentFiles.reduce((usage, file) => ({ count: usage.count + 1, bytes: usage.bytes + file.size }), documentUsageRef.current);
      setPendingImages(prev => [...prev, ...additions]);
    } catch (error) {
      setMessages(prev => [...prev, { role: 'model', content: `附件添加失败：${(error as Error).message}`, timestamp: Date.now(), includeInHistory: false }]);
    }
    });
    await attachmentQueueRef.current;
  };

  const removePendingImage = (index: number) => {
    setPendingImages(prev => {
      const next = prev.filter((_, itemIndex) => itemIndex !== index);
      syncAttachmentUsage(next);
      return next;
    });
  };

  const handleCopy = async (text: string, id: string, event?: React.MouseEvent) => {
    event?.preventDefault();
    event?.stopPropagation();
    const value = text.trim();
    if (!value) return;
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
      } else {
        throw new Error('Clipboard API unavailable');
      }
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (!copied) {
        setMessages(prev => [...prev, { role: 'model', content: '复制失败，请选中提示词后按 Ctrl+C。', timestamp: Date.now(), includeInHistory: false }]);
        return;
      }
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId(current => current === id ? null : current), 2000);
  };

  const handleResize = (e: React.MouseEvent, direction: string) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = size.width;
    const startHeight = size.height;
    const startPos = position;

    const onMouseMove = (moveEvent: MouseEvent) => {
      let newWidth = startWidth;
      let newHeight = startHeight;
      let newX = startPos.x;
      let newY = startPos.y;

      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      if (direction.includes('e')) {
        newWidth = Math.max(350, startWidth + deltaX);
      }
      if (direction.includes('w')) {
        const width = Math.max(350, startWidth - deltaX);
        if (width !== startWidth) {
          newWidth = width;
          newX = startPos.x + (startWidth - width);
        }
      }
      if (direction.includes('s')) {
        newHeight = Math.max(400, startHeight + deltaY);
      }
      if (direction.includes('n')) {
        const height = Math.max(400, startHeight - deltaY);
        if (height !== startHeight) {
          newHeight = height;
          newY = startPos.y + (startHeight - height);
        }
      }

      setSize({ width: newWidth, height: newHeight });
      setPosition({ x: newX, y: newY });
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    const newX = position.x + info.offset.x;
    const newY = position.y + info.offset.y;
    
    const threshold = 50;
    const windowWidth = window.innerWidth;
    const currentRight = windowWidth - (newX + size.width);
    
    if (currentRight < threshold) {
      // Snap to right
      setPosition({ x: windowWidth - size.width - 20, y: newY });
    } else {
      setPosition({ x: newX, y: newY });
    }
  };

  return (
    <>
      {/* Floating Button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(true)}
        className="fixed bottom-32 right-8 z-[60] w-16 h-16 bg-red-600 rounded-full shadow-[0_0_30px_rgba(220,38,38,0.4)] flex flex-col items-center justify-center text-white border-2 border-white/20 group"
      >
        <div className="relative flex items-center justify-center">
          <span className="text-lg font-black text-white leading-none">AI</span>
          <motion.div 
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-400 rounded-full border-2 border-red-600" 
          />
        </div>
        <span className="text-[9px] font-black mt-1 uppercase tracking-tighter">AI 助手</span>
      </motion.button>

      {/* Chat Dialog */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            drag
            dragControls={dragControls}
            dragListener={false}
            dragMomentum={false}
            onDragEnd={handleDragEnd}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ 
              opacity: 1, 
              scale: 1,
              x: position.x,
              y: position.y
            }}
            exit={{ opacity: 0, scale: 0.9 }}
            style={{ 
              width: size.width, 
              height: size.height,
              position: 'fixed',
              top: 0,
              left: 0,
              zIndex: 100
            }}
            className="bg-[#1a1a1a] border border-[#333] rounded-3xl shadow-[0_30px_100px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden backdrop-blur-2xl"
          >
            {/* Resize Handles */}
            <div className="absolute inset-0 pointer-events-none">
              <div onMouseDown={(e) => handleResize(e, 'n')} className="absolute top-0 left-0 right-0 h-1 cursor-ns-resize pointer-events-auto" />
              <div onMouseDown={(e) => handleResize(e, 's')} className="absolute bottom-0 left-0 right-0 h-1 cursor-ns-resize pointer-events-auto" />
              <div onMouseDown={(e) => handleResize(e, 'w')} className="absolute top-0 bottom-0 left-0 w-1 cursor-ew-resize pointer-events-auto" />
              <div onMouseDown={(e) => handleResize(e, 'e')} className="absolute top-0 bottom-0 right-0 w-1 cursor-ew-resize pointer-events-auto" />
              <div onMouseDown={(e) => handleResize(e, 'nw')} className="absolute top-0 left-0 w-3 h-3 cursor-nwse-resize pointer-events-auto" />
              <div onMouseDown={(e) => handleResize(e, 'ne')} className="absolute top-0 right-0 w-3 h-3 cursor-nesw-resize pointer-events-auto" />
              <div onMouseDown={(e) => handleResize(e, 'sw')} className="absolute bottom-0 left-0 w-3 h-3 cursor-nesw-resize pointer-events-auto" />
              <div onMouseDown={(e) => handleResize(e, 'se')} className="absolute bottom-0 right-0 w-3 h-3 cursor-nwse-resize pointer-events-auto" />
            </div>

            {/* Header - Drag Handle */}
            <div 
              onPointerDown={(e) => dragControls.start(e)}
              className="p-4 border-b border-[#333] flex items-center justify-between bg-gradient-to-r from-red-600/10 to-transparent cursor-move select-none shrink-0"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center shadow-lg">
                  <span className="text-xl font-black text-white">B</span>
                </div>
                <div>
                  <h3 className="text-sm font-black text-white tracking-tight">AI 助手 / ASSISTANT</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Online</span>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-2 hover:bg-[#333] rounded-xl text-gray-500 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Mode Switcher */}
            <div className="p-2 bg-[#111] flex gap-2 shrink-0">
              <button
                onClick={() => setMode('normal')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                  mode === 'normal' ? "bg-white text-black" : "text-gray-500 hover:bg-[#222]"
                )}
              >
                <Sparkles size={12} />
                普通模式
              </button>
              <button
                onClick={() => setMode('deep')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                  mode === 'deep' ? "bg-red-600 text-white shadow-lg shadow-red-600/20" : "text-gray-500 hover:bg-[#222]"
                )}
              >
                <BrainCircuit size={12} />
                深度思考模式
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-hide">
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4">
                  <div className="w-16 h-16 bg-[#222] rounded-3xl flex items-center justify-center text-gray-600">
                    <MessageSquare size={32} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-400">你好！我是你的AI助手</p>
                    <p className="text-xs text-gray-600 mt-1 leading-relaxed">我可以帮你回答问题、创作内容、分析图片或提供代码建议。请随时提问！</p>
                  </div>
                </div>
              )}
              
              {messages.map((msg, idx) => (
                <div key={idx} className={cn("flex flex-col", msg.role === 'user' ? "items-end" : "items-start")}>
                  <div className={cn(
                    "max-w-[90%] rounded-2xl p-4 text-sm leading-relaxed",
                    msg.role === 'user' 
                      ? "bg-red-600 text-white rounded-tr-none" 
                      : "bg-[#222] text-gray-200 rounded-tl-none border border-[#333]"
                  )}>
                    {msg.images && msg.images.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {msg.images.map((img, i) => (
                          <img key={i} src={img} className="w-20 h-20 object-cover rounded-lg border border-white/10" alt="upload" />
                        ))}
                      </div>
                    )}
                    {msg.files && msg.files.some(file => !file.preview) && (
                      <div className="mb-3 flex flex-wrap gap-2">
                        {msg.files.filter(file => !file.preview).map((file, fileIndex) => (
                          <div key={fileIndex} className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-[10px] text-gray-300">
                            <FileText size={13} />{file.name}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="markdown-body prose prose-invert prose-sm max-w-none">
                      <ReactMarkdown
                        components={{
                          code({ inline, className, children, ...props }: { inline?: boolean; className?: string; children: React.ReactNode }) {
                            const codeString = String(children).replace(/\n$/, '');
                            
                            if (!inline) {
                              const isPrompt = className?.includes('language-prompt');
                              return (
                                <div className="relative group/code my-4">
                                  {isPrompt && <div className="border-b border-blue-400/20 bg-blue-500/10 px-3 py-2 text-[10px] font-bold text-blue-300">完整中文生图提示词</div>}
                                  <div className={cn("absolute right-2 top-2 z-10", isPrompt ? "opacity-100" : "opacity-0 group-hover/code:opacity-100 transition-opacity")}>
                                    <button
                                      type="button"
                                      onClick={(event) => handleCopy(codeString, `code-${idx}-${codeString.slice(0, 12)}`, event)}
                                      className="p-1.5 bg-black/50 hover:bg-black/80 rounded-lg text-white transition-all border border-white/10"
                                      title={isPrompt ? "复制完整提示词" : "复制内容"}
                                    >
                                      {copiedId === `code-${idx}-${codeString.slice(0, 12)}` ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                                    </button>
                                  </div>
                                  <code className={cn(className, "block bg-black/40 p-4 rounded-xl border border-white/5 whitespace-pre-wrap break-words")} {...props}>
                                    {children}
                                  </code>
                                </div>
                              );
                            }
                            return <code className={cn(className, "bg-white/10 px-1.5 py-0.5 rounded text-red-400")} {...props}>{children}</code>;
                          }
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  </div>
                  {msg.role === 'model' && (
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        type="button"
                        onClick={(event) => handleCopy(msg.content, `msg-${idx}`, event)}
                        className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500 hover:text-white transition-colors px-2 py-1 hover:bg-[#333] rounded-lg"
                      >
                        {copiedId === `msg-${idx}` ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                        {copiedId === `msg-${idx}` ? '已复制全文' : '一键复制全文'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
              
              {isLoading && (
                <div className="flex items-start gap-3">
                  <div className="bg-[#222] border border-[#333] rounded-2xl rounded-tl-none p-4 flex items-center gap-3">
                    <Loader2 className="animate-spin text-red-600" size={16} />
                    <span className="text-xs text-gray-500 font-bold uppercase tracking-widest">正在思考中...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Input Area */}
            <div className="p-4 border-t border-[#333] bg-[#111] shrink-0">
              <AnimatePresence>
                {pendingImages.length > 0 && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="flex flex-wrap gap-2 mb-3 overflow-x-auto pb-2"
                  >
                    {pendingImages.map((img, i) => (
                      <div key={i} className="relative group flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-[#333] bg-[#222]">
                        {img.preview ? <img src={img.preview} className="w-full h-full object-cover" alt="pending" /> : <div className="flex flex-col items-center gap-1 p-1 text-center"><FileText size={18} className="text-blue-400" /><span className="line-clamp-2 text-[8px] text-gray-400">{img.name}</span></div>}
                        <button 
                          onClick={() => removePendingImage(i)}
                          className="absolute top-1 right-1 p-1 bg-black/60 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex items-end gap-2 bg-[#1a1a1a] border border-[#333] rounded-2xl p-2 focus-within:border-red-600/50 transition-all">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/*,.pdf,.txt,.md,.csv,.json,.html,.xml,.xlsx,.xls"
                  multiple
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-3 hover:bg-[#333] rounded-xl text-gray-400 hover:text-white transition-colors"
                >
                  <FileText size={20} />
                </button>
                
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="输入消息或上传图片..."
                  className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-gray-200 placeholder-gray-600 py-3 resize-none max-h-[300px] min-h-[44px] overflow-y-auto"
                  rows={1}
                />

                <button
                  onClick={isLoading ? handleStop : handleSend}
                  disabled={!isLoading && !input.trim() && pendingImages.length === 0}
                  title={isLoading ? '停止回答' : '发送消息'}
                  className={cn(
                    "p-3 rounded-xl transition-all",
                    isLoading
                      ? "bg-red-600 text-white hover:bg-red-500"
                      : (!input.trim() && pendingImages.length === 0)
                      ? "bg-[#222] text-gray-600"
                      : "bg-red-600 text-white hover:scale-105 active:scale-95 shadow-lg shadow-red-600/20"
                  )}
                >
                  {isLoading ? <Square size={18} fill="currentColor" /> : <Send size={20} />}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
});

Assistant.displayName = 'Assistant';
