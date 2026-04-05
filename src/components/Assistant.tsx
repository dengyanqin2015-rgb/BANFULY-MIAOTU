import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { motion, AnimatePresence, useDragControls } from 'motion/react';
import { MessageSquare, X, Send, Image as ImageIcon, Loader2, Copy, Check, Sparkles, BrainCircuit, Maximize2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { cn } from '../lib/utils';
import { chatWithAssistant } from '../lib/gemini';

export interface AssistantRef {
  open: () => void;
  sendImage: (data: string, mimeType: string, preview: string, autoSend?: boolean) => void;
}

interface Message {
  role: 'user' | 'model';
  content: string;
  images?: string[];
  timestamp: number;
}

interface AssistantProps {
  userApiKey?: string;
}

export const Assistant = forwardRef<AssistantRef, AssistantProps>(({ userApiKey }, ref) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<'normal' | 'deep'>('normal');
  const [pendingImages, setPendingImages] = useState<{ data: string; mimeType: string; preview: string }[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [size, setSize] = useState({ width: 450, height: 650 });
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragControls = useDragControls();

  useImperativeHandle(ref, () => ({
    open: () => setIsOpen(true),
    sendImage: (data, mimeType, preview, autoSend = false) => {
      setIsOpen(true);
      const newImage = { data, mimeType, preview };
      setPendingImages(prev => [...prev, newImage]);
      
      if (autoSend) {
        // We need to wait for the state to update or use the values directly
        setTimeout(() => {
          handleSendWithParams("请分析这张图片并提供生图建议。", [newImage]);
        }, 100);
      } else {
        setInput("请分析这张图片并提供生图建议。");
      }
    }
  }));

  const handleSendWithParams = async (text: string, images: { data: string; mimeType: string; preview: string }[]) => {
    if (isLoading) return;

    // Clear these specific images from pending
    setPendingImages(prev => prev.filter(p => !images.some(img => img.preview === p.preview)));

    const userMessage: Message = {
      role: 'user',
      content: text,
      images: images.map(img => img.preview),
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const history = messages.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.content }]
      }));

      const response = await chatWithAssistant({
        message: text,
        images: images.map(img => ({ data: img.data, mimeType: img.mimeType })),
        mode,
        history,
        apiKey: userApiKey
      });

      setMessages(prev => [...prev, {
        role: 'model',
        content: response,
        timestamp: Date.now()
      }]);
    } catch (error: unknown) {
      const err = error as Error;
      console.error("Assistant error:", err);
      setMessages(prev => [...prev, {
        role: 'model',
        content: `抱歉，出错了：${err.message || '未知错误'}`,
        timestamp: Date.now()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSend = async () => {
    if ((!input.trim() && pendingImages.length === 0) || isLoading) return;

    const userMessage: Message = {
      role: 'user',
      content: input,
      images: pendingImages.map(img => img.preview),
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = input;
    const currentImages = [...pendingImages];
    
    setInput('');
    setPendingImages([]);
    setIsLoading(true);

    try {
      const history = messages.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.content }]
      }));

      const response = await chatWithAssistant({
        message: currentInput || "请分析这些图片",
        images: currentImages.map(img => ({ data: img.data, mimeType: img.mimeType })),
        mode,
        history,
        apiKey: userApiKey
      });

      setMessages(prev => [...prev, {
        role: 'model',
        content: response,
        timestamp: Date.now()
      }]);
    } catch (error: unknown) {
      const err = error as Error;
      console.error("Assistant error:", err);
      setMessages(prev => [...prev, {
        role: 'model',
        content: `抱歉，出错了：${err.message || '未知错误'}`,
        timestamp: Date.now()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = (reader.result as string).split(',')[1];
        const preview = reader.result as string;
        setPendingImages(prev => [...prev, { data: base64String, mimeType: file.type, preview }]);
      };
      reader.readAsDataURL(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleResize = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = size.width;
    const startHeight = size.height;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = Math.max(350, startWidth + (moveEvent.clientX - startX));
      const newHeight = Math.max(400, startHeight + (moveEvent.clientY - startY));
      setSize({ width: newWidth, height: newHeight });
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
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
        <div className="relative">
          <MessageSquare size={24} />
          <motion.div 
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-400 rounded-full border-2 border-red-600" 
          />
        </div>
        <span className="text-[9px] font-black mt-1 uppercase tracking-tighter">班小夫助理</span>
      </motion.button>

      {/* Chat Dialog */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            drag
            dragControls={dragControls}
            dragListener={false}
            dragMomentum={false}
            initial={{ opacity: 0, scale: 0.9, y: 0, x: 0 }}
            animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20, x: 20 }}
            style={{ 
              width: size.width, 
              height: size.height,
              position: 'fixed',
              bottom: '128px',
              right: '112px'
            }}
            className="z-[100] bg-[#1a1a1a] border border-[#333] rounded-3xl shadow-[0_30px_100px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden backdrop-blur-2xl"
          >
            {/* Header - Drag Handle */}
            <div 
              onPointerDown={(e) => dragControls.start(e)}
              className="p-4 border-b border-[#333] flex items-center justify-between bg-gradient-to-r from-red-600/10 to-transparent cursor-move select-none"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center shadow-lg">
                  <Sparkles className="text-white" size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white tracking-tight">班小夫助理 / AI ASSISTANT</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Architect Core V3.3 Online</span>
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
            <div className="p-2 bg-[#111] flex gap-2">
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
                    <p className="text-sm font-bold text-gray-400">你好！我是班小夫</p>
                    <p className="text-xs text-gray-600 mt-1 leading-relaxed">我可以帮你分析图片、优化提示词，或者提供电商视觉架构的深度建议。请随时提问！</p>
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
                    <div className="markdown-body prose prose-invert prose-sm max-w-none">
                      <ReactMarkdown
                        components={{
                          code({ inline, className, children, ...props }: { inline?: boolean; className?: string; children: React.ReactNode }) {
                            const codeString = String(children).replace(/\n$/, '');
                            
                            if (!inline) {
                              return (
                                <div className="relative group/code my-4">
                                  <div className="absolute right-2 top-2 opacity-0 group-hover/code:opacity-100 transition-opacity">
                                    <button
                                      onClick={() => handleCopy(codeString, `code-${idx}`)}
                                      className="p-1.5 bg-black/50 hover:bg-black/80 rounded-lg text-white transition-all border border-white/10"
                                      title="复制内容"
                                    >
                                      {copiedId === `code-${idx}` ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                                    </button>
                                  </div>
                                  <code className={cn(className, "block bg-black/40 p-4 rounded-xl border border-white/5 overflow-x-auto")} {...props}>
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
                        onClick={() => handleCopy(msg.content, `msg-${idx}`)}
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
                    <span className="text-xs text-gray-500 font-bold uppercase tracking-widest">班小夫正在思考中...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Input Area */}
            <div className="p-4 border-t border-[#333] bg-[#111]">
              <AnimatePresence>
                {pendingImages.length > 0 && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="flex flex-wrap gap-2 mb-3 overflow-x-auto pb-2"
                  >
                    {pendingImages.map((img, i) => (
                      <div key={i} className="relative group w-16 h-16 rounded-xl overflow-hidden border border-[#333]">
                        <img src={img.preview} className="w-full h-full object-cover" alt="pending" />
                        <button 
                          onClick={() => setPendingImages(prev => prev.filter((_, idx) => idx !== i))}
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
                  accept="image/*"
                  multiple
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-3 hover:bg-[#333] rounded-xl text-gray-400 hover:text-white transition-colors"
                >
                  <ImageIcon size={20} />
                </button>
                
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="输入消息或上传图片..."
                  className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-gray-200 placeholder-gray-600 py-3 resize-none max-h-32 min-h-[44px]"
                  rows={1}
                />

                <button
                  onClick={handleSend}
                  disabled={(!input.trim() && pendingImages.length === 0) || isLoading}
                  className={cn(
                    "p-3 rounded-xl transition-all",
                    (!input.trim() && pendingImages.length === 0) || isLoading
                      ? "bg-[#222] text-gray-600"
                      : "bg-red-600 text-white hover:scale-105 active:scale-95 shadow-lg shadow-red-600/20"
                  )}
                >
                  <Send size={20} />
                </button>
              </div>
            </div>

            {/* Resize Handle */}
            <div 
              onMouseDown={handleResize}
              className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize flex items-center justify-center group/resize"
            >
              <div className="w-1 h-1 bg-gray-600 rounded-full group-hover/resize:bg-red-600 transition-colors" />
              <div className="absolute bottom-1 right-1">
                <Maximize2 size={10} className="text-gray-600 group-hover/resize:text-red-600 rotate-90" />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
});

Assistant.displayName = 'Assistant';
