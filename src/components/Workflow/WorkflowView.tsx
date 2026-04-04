import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Minus, 
  Maximize, 
  MousePointer2, 
  Hand, 
  Square, 
  Upload, 
  Search, 
  Copy, 
  Trash2, 
  RefreshCw, 
  Send,
  X,
  ChevronLeft,
  Zap,
  CreditCard,
  Download,
  Settings2,
  CopyPlus
} from 'lucide-react';
import { WorkflowNode, WorkflowConnection } from '@/types';
import { generateEcomImage } from '@/geminiService';

// --- Constants ---
const GRID_SIZE = 20;
const NODE_WIDTH = 240;
const PORT_OFFSET_TOP = 190;
const BRAND_COLOR = '#FF7F00';

const ASPECT_RATIOS = [
  { label: '自动', value: 'auto', icon: <Maximize className="w-3 h-3" /> },
  { label: '1:1', value: '1:1', icon: <Square className="w-3 h-3" /> },
  { label: '3:4', value: '3:4', icon: <div className="w-2.5 h-3.5 border border-current rounded-sm" /> },
  { label: '4:3', value: '4:3', icon: <div className="w-3.5 h-2.5 border border-current rounded-sm" /> },
  { label: '9:16', value: '9:16', icon: <div className="w-2 h-4 border border-current rounded-sm" /> },
  { label: '16:9', value: '16:9', icon: <div className="w-4 h-2 border border-current rounded-sm" /> },
];

const MODELS = [
  { name: 'PRO 3.0', cost: 1.5, desc: '极致画质 · 商业摄影级' },
  { name: 'FLASH 3.1', cost: 0.8, desc: '极速渲染 · 创意无限' },
  { name: 'Flash 2.5', cost: 0.5, desc: '轻量高效 · 快速出图' },
  { name: 'Image 1.5', cost: 1.0, desc: '经典模型 · 稳定输出' },
];

// --- Types ---
interface WorkflowViewProps {
  userApiKey: string;
  auth: {
    user: {
      username: string;
      credits: number;
    } | null;
  };
  deductCredit: (amount?: number) => Promise<boolean>;
  genModel: string;
  genResolution: string;
  genAspectRatio: string;
  onBack: () => void;
}

const WorkflowView: React.FC<WorkflowViewProps> = ({
  userApiKey,
  auth,
  deductCredit,
  genModel,
  genResolution,
  genAspectRatio,
  onBack
}) => {
  // --- State ---
  const [nodes, setNodes] = useState<WorkflowNode[]>([]);
  const [connections, setConnections] = useState<WorkflowConnection[]>([]);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [tool, setTool] = useState<'select' | 'pan' | 'marquee'>('select');
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [marqueeStart, setMarqueeStart] = useState<{ x: number, y: number } | null>(null);
  const [marqueeEnd, setMarqueeEnd] = useState<{ x: number, y: number } | null>(null);
  const [previewImage, setPreviewImage] = useState<WorkflowNode | null>(null);
  const [inputText, setInputText] = useState('');
  const [inputImages, setInputImages] = useState<{ id: string, url: string, sourceNodeId?: string }[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedModel, setSelectedModel] = useState(() => {
    const found = MODELS.find(m => m.name === genModel);
    return found ? found.name : 'FLASH 3.1';
  });
  const [selectedAspectRatio, setSelectedAspectRatio] = useState(genAspectRatio || 'auto');
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showSmartPrompts, setShowSmartPrompts] = useState(false);
  const [showQuickPrompts, setShowQuickPrompts] = useState(false);

  const QUICK_PROMPTS = [
    { label: '极简主义', prompt: 'minimalist, clean, high-end' },
    { label: '赛博朋克', prompt: 'cyberpunk, neon, futuristic' },
    { label: '商业摄影', prompt: 'professional product photography, studio lighting' },
    { label: '自然光泽', prompt: 'natural lighting, soft shadows, organic' },
    { label: '超写实', prompt: 'hyper-realistic, 8k, highly detailed' }
  ];

  const SMART_PROMPTS = [
    {
      title: '电商视觉对齐',
      desc: '参考图1风格，生成图2产品，保持细节一致',
      prompt: '参考图1风格和比例，生成图2产品。确保细节一致，特别是白色部分不要有色差。读取图2的卖点，替换掉对应位置文案，注意排版合理协调。疑似品牌的英文都替换成其他，疑似年份时间的都替换成2026。'
    },
    {
      title: '品牌视觉升级',
      desc: '基于参考图1的构图，将图2产品融入其中',
      prompt: '以参考图1的构图和光影为基准，将图2中的产品完美融入。保持产品的材质真实感，背景风格统一。文案部分：提取图2的核心卖点，以更现代的排版方式呈现，所有年份更新为2026。'
    },
    {
      title: '场景化迁移',
      desc: '将图2产品迁移到图1的场景中',
      prompt: '将图2中的产品放置在图1所展示的场景中。确保产品的透视、光影与场景完全匹配。保留图2产品的核心特征，背景细节参考图1。文案：根据场景氛围重新排版图2的卖点，品牌名做去品牌化处理。'
    }
  ];

  // Use props if they are valid user-friendly names or map them
  useEffect(() => {
    if (genAspectRatio && ASPECT_RATIOS.some(r => r.value === genAspectRatio)) {
      setSelectedAspectRatio(genAspectRatio);
    }
  }, [genAspectRatio]);

  useEffect(() => {
    if (genModel && MODELS.some(m => m.name === genModel)) {
      setSelectedModel(genModel);
    }
  }, [genModel]);

  // Satisfy linter for genResolution
  useEffect(() => {
    if (genResolution) {
      // Could be used for something in the future
    }
  }, [genResolution]);

  const currentModel = MODELS.find(m => m.name === selectedModel) || MODELS[1];

  const canvasRef = useRef<HTMLDivElement>(null);
  const isPanning = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

  // --- Helpers ---
  const screenToCanvas = (x: number, y: number) => {
    if (!canvasRef.current) return { x, y };
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: (x - rect.left - transform.x) / transform.scale,
      y: (y - rect.top - transform.y) / transform.scale
    };
  };

  // --- Node Management ---
  const addNode = useCallback((node: Omit<WorkflowNode, 'id'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newNode = { ...node, id };
    setNodes(prev => [...prev, newNode]);
    return newNode;
  }, []);

  const deleteNodes = useCallback((ids: Set<string>) => {
    setNodes(prev => prev.filter(n => !ids.has(n.id)));
    setConnections(prev => prev.filter(c => !ids.has(c.sourceId) && !ids.has(c.targetId)));
    setSelectedNodeIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.delete(id));
      return next;
    });
  }, []);

  // --- Interaction Handlers ---
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click

    const { x, y } = screenToCanvas(e.clientX, e.clientY);

    if (tool === 'pan' || e.altKey) {
      isPanning.current = true;
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      return;
    }

    if (tool === 'marquee') {
      setMarqueeStart({ x, y });
      setMarqueeEnd({ x, y });
      if (!e.shiftKey) setSelectedNodeIds(new Set());
      return;
    }

    // Check if clicked a node
    const clickedNode = nodes.find(n => 
      x >= n.x && x <= n.x + n.width &&
      y >= n.y && y <= n.y + n.height
    );

    if (clickedNode) {
      if (e.shiftKey) {
        setSelectedNodeIds(prev => {
          const next = new Set(prev);
          if (next.has(clickedNode.id)) next.delete(clickedNode.id);
          else next.add(clickedNode.id);
          return next;
        });
      } else {
        if (!selectedNodeIds.has(clickedNode.id)) {
          setSelectedNodeIds(new Set([clickedNode.id]));
        }
      }
    } else {
      if (!e.shiftKey) setSelectedNodeIds(new Set());
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning.current) {
      const dx = e.clientX - lastMousePos.current.x;
      const dy = e.clientY - lastMousePos.current.y;
      setTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      return;
    }

    if (marqueeStart) {
      const { x, y } = screenToCanvas(e.clientX, e.clientY);
      setMarqueeEnd({ x, y });

      // Update selection
      const x1 = Math.min(marqueeStart.x, x);
      const y1 = Math.min(marqueeStart.y, y);
      const x2 = Math.max(marqueeStart.x, x);
      const y2 = Math.max(marqueeStart.y, y);

      const newSelection = new Set<string>();
      nodes.forEach(n => {
        if (n.x < x2 && n.x + n.width > x1 && n.y < y2 && n.y + n.height > y1) {
          newSelection.add(n.id);
        }
      });
      setSelectedNodeIds(newSelection);
    }
  };

  const handleMouseUp = () => {
    isPanning.current = false;
    setMarqueeStart(null);
    setMarqueeEnd(null);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      const delta = -e.deltaY;
      const scaleFactor = Math.pow(1.1, delta / 100);
      const newScale = Math.min(Math.max(transform.scale * scaleFactor, 0.1), 5);
      
      // Zoom towards mouse
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        const canvasMouseX = (mouseX - transform.x) / transform.scale;
        const canvasMouseY = (mouseY - transform.y) / transform.scale;
        
        setTransform({
          scale: newScale,
          x: mouseX - canvasMouseX * newScale,
          y: mouseY - canvasMouseY * newScale
        });
      }
    } else {
      setTransform(prev => ({ ...prev, x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (tool !== 'select') return;
    const { x, y } = screenToCanvas(e.clientX, e.clientY);
    
    // Check if clicked a node
    const clickedNode = nodes.find(n => 
      x >= n.x && x <= n.x + n.width &&
      y >= n.y && y <= n.y + n.height
    );

    if (!clickedNode) {
      // Generate at this position
      handleGenerate(x, y);
    }
  };

  // --- Hotkeys ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;

      switch (e.key.toLowerCase()) {
        case 'm': setTool('marquee'); break;
        case 'v': setTool('select'); break;
        case 'h': setTool('pan'); break;
        case 'delete':
        case 'backspace':
          if (selectedNodeIds.size > 0) deleteNodes(selectedNodeIds);
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodeIds, deleteNodes]);

  // --- Generation ---
  const handleGenerate = async (x?: number, y?: number, overrideImages?: InputImage[], overrideText?: string) => {
    const imagesToUse = overrideImages || inputImages;
    const textToUse = overrideText || inputText;

    if (!textToUse && imagesToUse.length === 0) return;

    if (!userApiKey || !auth.user) {
      alert('请先配置 API Key 并登录');
      return;
    }

    const cost = currentModel.cost;
    if (auth.user && auth.user.credits < cost) {
      alert('积分不足');
      return;
    }

    let finalAspectRatio = selectedAspectRatio;
    if (selectedAspectRatio === 'auto' && imagesToUse.length > 0) {
      try {
        const img = new Image();
        img.src = imagesToUse[0].url;
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });
        const ratio = img.width / img.height;
        const ratios = [
          { val: 1, str: '1:1' },
          { val: 3/4, str: '3:4' },
          { val: 4/3, str: '4:3' },
          { val: 9/16, str: '9:16' },
          { val: 16/9, str: '16:9' }
        ];
        const closest = ratios.reduce((prev, curr) => 
          Math.abs(curr.val - ratio) < Math.abs(prev.val - ratio) ? curr : prev
        );
        finalAspectRatio = closest.str;
      } catch {
        finalAspectRatio = '1:1';
      }
    } else if (selectedAspectRatio === 'auto') {
      finalAspectRatio = '1:1';
    }

    setIsGenerating(true);
    
    // Use provided coordinates or center of view
    const targetX = x ?? (window.innerWidth / 2 - transform.x) / transform.scale;
    const targetY = y ?? (window.innerHeight / 2 - transform.y) / transform.scale;

    // Create a placeholder node
    const resultNodeId = Math.random().toString(36).substr(2, 9);
    const resultNode: WorkflowNode = {
      id: resultNodeId,
      type: 'result',
      x: targetX,
      y: targetY,
      width: NODE_WIDTH,
      height: NODE_WIDTH,
      imageUrl: '',
      prompt: textToUse,
      status: 'loading'
    };
    setNodes(prev => [...prev, resultNode]);

    // Construct prompt with image order logic
    let enhancedPrompt = textToUse;
    if (imagesToUse.length > 0) {
      const imageRefs = imagesToUse.map((_, i) => `参考图${i + 1}`).join('、');
      enhancedPrompt = `请结合${imageRefs}，按照以下指令生图：\n${textToUse}`;
    }

    // Create connections and update inputImages with sourceNodeId to avoid redundant nodes
    if (imagesToUse.length > 0) {
      const updatedInputImages = [...imagesToUse];
      imagesToUse.forEach((imgObj, i) => {
        let sourceId = imgObj.sourceNodeId;
        
        // If it's a direct upload (no sourceNodeId), create an input node
        if (!sourceId) {
          const inputNode = addNode({
            type: 'input',
            x: targetX - 300,
            y: targetY + (i - (imagesToUse.length - 1) / 2) * 300,
            width: NODE_WIDTH,
            height: NODE_WIDTH,
            imageUrl: imgObj.url,
            status: 'done'
          });
          sourceId = inputNode.id;
          updatedInputImages[i] = { ...imgObj, sourceNodeId: sourceId };
        }

        setConnections(prev => [...prev, {
          id: Math.random().toString(36).substr(2, 9),
          sourceId: sourceId!,
          targetId: resultNodeId
        }]);
      });
      // Only update global state if we're not overriding
      if (!overrideImages) {
        setInputImages(updatedInputImages);
      }
    }

    try {
      const imageUrl = await generateEcomImage({
        prompt: enhancedPrompt,
        model: selectedModel,
        aspectRatio: finalAspectRatio,
        refImagesB64: imagesToUse.map(img => img.url),
        apiKey: userApiKey
      });

      if (imageUrl) {
        await deductCredit(cost);
        setNodes(prev => prev.map(n => n.id === resultNodeId ? { ...n, imageUrl, status: 'done' } : n));
        if (!overrideText) setInputText('');
        if (!overrideImages) setInputImages([]);
      } else {
        setNodes(prev => prev.map(n => n.id === resultNodeId ? { ...n, status: 'error', errorMessage: '生成结果为空' } : n));
      }
    } catch (err: unknown) {
      console.error(err);
      let msg = '生成失败';
      const error = err as Error;
      if (error?.message?.includes('Rate exceeded') || error?.message?.includes('429')) {
        msg = '请求频率过高，请稍后再试';
      } else if (error?.message) {
        msg = error.message;
      }
      setNodes(prev => prev.map(n => n.id === resultNodeId ? { ...n, status: 'error', errorMessage: msg } : n));
    } finally {
      setIsGenerating(false);
    }
  };

  const uploadImages = (files: FileList, createNodes: boolean = true, addToInput: boolean = false) => {
    Array.from(files).forEach((file, i) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const b64 = event.target?.result as string;
        const imgId = Math.random().toString(36).substr(2, 9);
        
        let nodeId: string | undefined;
        if (createNodes) {
          const newNode = addNode({
            type: 'input',
            x: (window.innerWidth / 2 - transform.x) / transform.scale + i * 40,
            y: (window.innerHeight / 2 - transform.y) / transform.scale + i * 40,
            width: NODE_WIDTH,
            height: NODE_WIDTH,
            imageUrl: b64,
            status: 'done'
          });
          nodeId = newNode.id;
          
          // Adjust height based on aspect ratio
          const img = new Image();
          img.onload = () => {
            const ratio = img.width / img.height;
            const height = NODE_WIDTH / ratio;
            setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, height } : n));
          };
          img.src = b64;
        }

        if (addToInput) {
          setInputImages(prev => [...prev, { 
            id: imgId, 
            url: b64,
            sourceNodeId: nodeId
          }]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleBatchUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    uploadImages(files, true, false);
  };

  const handleInputUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    uploadImages(files, true, true);
  };

  // --- Render Helpers ---
  const renderConnections = () => {
    return connections.map(conn => {
      const source = nodes.find(n => n.id === conn.sourceId);
      const target = nodes.find(n => n.id === conn.targetId);
      if (!source || !target) return null;

      // Dynamic ports: source right, target left
      const x1 = source.x + source.width;
      const y1 = source.y + PORT_OFFSET_TOP;
      const x2 = target.x;
      const y2 = target.y + PORT_OFFSET_TOP;

      const dx = Math.abs(x2 - x1) * 0.5;
      const path = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

      return (
        <g key={conn.id}>
          <path
            d={path}
            fill="none"
            stroke="rgba(34, 197, 94, 0.2)"
            strokeWidth="8"
            className="transition-all duration-300"
          />
          <path
            d={path}
            fill="none"
            stroke="#22C55E"
            strokeWidth="3"
            className="transition-all duration-300"
            style={{ filter: 'drop-shadow(0 0 4px rgba(34, 197, 94, 0.5))' }}
          />
          {/* Ports */}
          <circle cx={x1} cy={y1} r="4" fill="#22C55E" />
          <circle cx={x2} cy={y2} r="4" fill="#22C55E" />
        </g>
      );
    });
  };

  return (
    <div className="relative w-full h-screen bg-[#0F0F0F] overflow-hidden text-white font-sans">
      {/* Grid Background */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)`,
          backgroundSize: `${GRID_SIZE * transform.scale}px ${GRID_SIZE * transform.scale}px`,
          backgroundPosition: `${transform.x}px ${transform.y}px`
        }}
      />

      {/* Canvas Area */}
      <div 
        ref={canvasRef}
        className="w-full h-full cursor-crosshair"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
      >
        <div 
          style={{ 
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            transformOrigin: '0 0'
          }}
        >
          {/* Connections Layer */}
          <svg className="absolute inset-0 pointer-events-none overflow-visible">
            {renderConnections()}
          </svg>

          {/* Nodes Layer */}
          {nodes.map(node => (
            <WorkflowNodeComponent
              key={node.id}
              node={node}
              isSelected={selectedNodeIds.has(node.id)}
              onDrag={(id, dx, dy) => {
                setNodes(prevNodes => prevNodes.map(n => {
                  if (selectedNodeIds.has(n.id)) {
                    return { ...n, x: n.x + dx, y: n.y + dy };
                  }
                  if (n.id === id) {
                    return { ...n, x: n.x + dx, y: n.y + dy };
                  }
                  return n;
                }));
              }}
              onSelect={(id, multi) => {
                if (multi) {
                  setSelectedNodeIds(prev => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  });
                } else {
                  setSelectedNodeIds(new Set([id]));
                }
              }}
              onPreview={() => setPreviewImage(node)}
              onDelete={() => deleteNodes(new Set([node.id]))}
              onSendToInput={() => {
                setInputImages(prev => [...prev, { 
                  id: Math.random().toString(36).substr(2, 9), 
                  url: node.imageUrl,
                  sourceNodeId: node.id 
                }]);
                if (node.prompt) setInputText(node.prompt);
              }}
              onClone={() => {
                addNode({
                  ...node,
                  id: Math.random().toString(36).substr(2, 9),
                  x: node.x + 50,
                  y: node.y + 50
                });
              }}
              onRegenerate={() => {
                // Find original source nodes
                const sourceNodeIds = connections
                  .filter(c => c.targetId === node.id)
                  .map(c => c.sourceId);
                
                const sourceNodes = nodes.filter(n => sourceNodeIds.includes(n.id));
                
                const prompt = node.prompt || '';
                const images = sourceNodes.map(n => ({
                  id: Math.random().toString(36).substr(2, 9),
                  url: n.imageUrl,
                  sourceNodeId: n.id
                }));
                
                handleGenerate(node.x, node.y, images, prompt);
              }}
              onAdjustRegenerate={() => {
                const sourceNodeIds = connections
                  .filter(c => c.targetId === node.id)
                  .map(c => c.sourceId);
                
                const sourceNodes = nodes.filter(n => sourceNodeIds.includes(n.id));
                
                setInputText(node.prompt || '');
                setInputImages(sourceNodes.map(n => ({
                  id: Math.random().toString(36).substr(2, 9),
                  url: n.imageUrl,
                  sourceNodeId: n.id
                })));
                
                // Don't generate immediately, let user adjust
                const inputEl = document.querySelector('textarea');
                inputEl?.focus();
              }}
            />
          ))}

          {/* Selection Marquee */}
          {marqueeStart && marqueeEnd && (
            <div 
              className="absolute border border-blue-500 bg-blue-500/10 pointer-events-none"
              style={{
                left: Math.min(marqueeStart.x, marqueeEnd.x),
                top: Math.min(marqueeStart.y, marqueeEnd.y),
                width: Math.abs(marqueeEnd.x - marqueeStart.x),
                height: Math.abs(marqueeEnd.y - marqueeStart.y)
              }}
            />
          )}
        </div>
      </div>

      {/* Header / Brand */}
      <div className="absolute top-6 left-6 flex items-center gap-4 z-50">
        <button 
          onClick={onBack}
          className="p-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <div className="flex flex-col">
          <h1 className="text-xl font-bold tracking-tighter text-white">
            BANFULY <span style={{ color: BRAND_COLOR }}>ARCHITECT</span>
          </h1>
          <span className="text-[10px] uppercase tracking-widest text-white/40 font-medium">
            PRO Visual Lab · Workflow
          </span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="absolute left-6 top-1/2 -translate-y-1/2 flex flex-col gap-2 p-2 bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl z-50">
        <ToolbarButton 
          active={tool === 'select'} 
          onClick={() => setTool('select')} 
          icon={<MousePointer2 className="w-5 h-5" />} 
          label="选择 (V)" 
        />
        <ToolbarButton 
          active={tool === 'pan'} 
          onClick={() => setTool('pan')} 
          icon={<Hand className="w-5 h-5" />} 
          label="平移 (H)" 
        />
        <ToolbarButton 
          active={tool === 'marquee'} 
          onClick={() => setTool('marquee')} 
          icon={<Square className="w-5 h-5" />} 
          label="选框 (M)" 
        />
        <div className="w-full h-px bg-white/10 my-1" />
        <ToolbarButton 
          onClick={() => setTransform(prev => ({ ...prev, scale: Math.min(prev.scale * 1.2, 5) }))} 
          icon={<Plus className="w-5 h-5" />} 
          label="放大" 
        />
        <ToolbarButton 
          onClick={() => setTransform(prev => ({ ...prev, scale: Math.max(prev.scale / 1.2, 0.1) }))} 
          icon={<Minus className="w-5 h-5" />} 
          label="缩小" 
        />
        <ToolbarButton 
          onClick={() => setTransform({ x: 0, y: 0, scale: 1 })} 
          icon={<Maximize className="w-5 h-5" />} 
          label="重置视图" 
        />
        <div className="w-full h-px bg-white/10 my-1" />
        <label className="cursor-pointer">
          <input type="file" multiple className="hidden" onChange={handleBatchUpload} accept="image/*" />
          <ToolbarButton as="div" icon={<Upload className="w-5 h-5" />} label="批量上传" />
        </label>
        <div className="relative">
          <ToolbarButton 
            onClick={() => setShowQuickPrompts(!showQuickPrompts)} 
            icon={<Zap className="w-5 h-5" />} 
            label="快捷灵感" 
          />
          {showQuickPrompts && (
            <div className="absolute left-full ml-3 top-0 w-40 bg-[#1A1A1A] border border-white/10 rounded-2xl shadow-2xl py-2 z-[60]">
              {QUICK_PROMPTS.map(p => (
                <button
                  key={p.label}
                  onClick={() => {
                    setInputText(prev => prev ? `${prev}, ${p.prompt}` : p.prompt);
                    setShowQuickPrompts(false);
                  }}
                  className="w-full px-4 py-2 text-left text-xs text-white/60 hover:text-white hover:bg-white/5 transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="w-full h-px bg-white/10 my-1" />
        <ToolbarButton 
          onClick={() => {
            if (window.confirm('确定要清空所有节点和连接吗？')) {
              setNodes([]);
              setConnections([]);
              setSelectedNodeIds(new Set());
            }
          }} 
          icon={<Trash2 className="w-5 h-5" />} 
          label="清空画布" 
        />
      </div>

      {/* Bottom Input Bar */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-full max-w-3xl px-6 z-50">
        <div className="bg-black/60 backdrop-blur-2xl border border-white/10 rounded-3xl p-4 shadow-2xl">
          {/* Uploaded Thumbnails */}
          {inputImages.length > 0 && (
            <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide">
              {inputImages.map((img, i) => (
                <div key={img.id} className="relative group flex-shrink-0">
                  <div className="absolute top-1 left-1 bg-black/60 rounded px-1 text-[8px] font-bold text-white z-10">
                    {i + 1}
                  </div>
                  <img 
                    src={img.url} 
                    className="h-16 rounded-lg border border-white/10 object-contain bg-black/20" 
                    alt="" 
                  />
                  <button 
                    onClick={() => setInputImages(prev => prev.filter((_, idx) => idx !== i))}
                    className="absolute -top-2 -right-2 p-1 bg-red-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
              ))}
              <button 
                onClick={() => setInputImages([])}
                className="flex flex-col items-center justify-center h-16 px-4 rounded-lg border border-dashed border-white/10 hover:bg-white/5 transition-colors text-[10px] text-white/40"
              >
                <Trash2 className="w-4 h-4 mb-1" />
                清空
              </button>
            </div>
          )}

          <div className="flex items-end gap-3">
            <div className="flex-1 relative">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleGenerate();
                  }
                }}
                placeholder="输入提示词，双击画布或点击生成..."
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-[#FF7F00]/50 transition-colors resize-none min-h-[56px] max-h-32"
                rows={1}
              />
              <div className="absolute right-3 bottom-3 flex items-center gap-2">
                <label className="p-1.5 text-white/40 hover:text-white transition-colors cursor-pointer">
                  <input type="file" multiple className="hidden" onChange={handleInputUpload} accept="image/*" />
                  <Upload className="w-5 h-5" />
                </label>
                <button 
                  onClick={() => setShowSmartPrompts(!showSmartPrompts)}
                  className={`p-1.5 transition-colors ${showSmartPrompts ? 'text-[#FF7F00]' : 'text-white/40 hover:text-white'}`}
                  title="智能电商提示词"
                >
                  <Zap className="w-5 h-5" />
                </button>
              </div>

              {showSmartPrompts && (
                <div className="absolute bottom-full mb-3 left-0 w-80 bg-[#1A1A1A] border border-white/10 rounded-2xl shadow-2xl py-3 z-[60] overflow-hidden">
                  <div className="px-4 mb-2 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-white/30 uppercase tracking-wider">智能电商模板</span>
                    <button onClick={() => setShowSmartPrompts(false)} className="text-white/40 hover:text-white">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="max-h-64 overflow-y-auto scrollbar-hide px-2">
                    {SMART_PROMPTS.map((p, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setInputText(p.prompt);
                          setShowSmartPrompts(false);
                        }}
                        className="w-full px-3 py-2.5 flex flex-col items-start gap-1 rounded-xl hover:bg-white/5 transition-colors mb-1 text-left border border-transparent hover:border-white/5"
                      >
                        <span className="text-xs font-bold text-[#FF7F00]">{p.title}</span>
                        <span className="text-[10px] text-white/60 leading-relaxed">{p.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 relative">
              <div 
                className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-full border border-white/10 cursor-pointer hover:bg-white/10 transition-colors"
                onClick={() => setShowModelMenu(!showModelMenu)}
              >
                <Zap className="w-3.5 h-3.5 text-[#FF7F00]" />
                <span className="text-[10px] font-bold text-white/60">
                  {currentModel.name} · {selectedAspectRatio === 'auto' ? '自动' : selectedAspectRatio}
                </span>
                <div className="w-px h-3 bg-white/10 mx-1" />
                <span className="text-[10px] font-bold text-[#FF7F00]">
                  {currentModel.cost} 积分
                </span>
              </div>

              {showModelMenu && (
                <div className="absolute bottom-full mb-3 right-0 w-64 bg-[#1A1A1A] border border-white/10 rounded-2xl shadow-2xl py-3 z-[60] overflow-hidden">
                  <div className="px-4 mb-2">
                    <span className="text-[10px] font-bold text-white/30 uppercase tracking-wider">选择模型</span>
                  </div>
                  <div className="max-h-48 overflow-y-auto scrollbar-hide px-2">
                    {MODELS.map(m => (
                      <button
                        key={m.name}
                        onClick={() => setSelectedModel(m.name)}
                        className={`w-full px-3 py-2 flex flex-col items-start gap-0.5 rounded-xl hover:bg-white/5 transition-colors mb-1 ${
                          selectedModel === m.name ? 'bg-[#FF7F00]/10 border border-[#FF7F00]/20' : 'border border-transparent'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className={`text-xs font-bold ${selectedModel === m.name ? 'text-[#FF7F00]' : 'text-white'}`}>{m.name}</span>
                          <span className="text-[9px] font-bold text-white/40">{m.cost} 积分</span>
                        </div>
                        <span className="text-[9px] text-white/30">{m.desc}</span>
                      </button>
                    ))}
                  </div>
                  
                  <div className="h-px bg-white/5 my-2 mx-4" />
                  
                  <div className="px-4 mb-2">
                    <span className="text-[10px] font-bold text-white/30 uppercase tracking-wider">图片比例</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 px-2">
                    {ASPECT_RATIOS.map(ratio => (
                      <button
                        key={ratio.value}
                        onClick={() => setSelectedAspectRatio(ratio.value)}
                        className={`flex flex-col items-center gap-1 py-2 rounded-xl border transition-all ${
                          selectedAspectRatio === ratio.value 
                            ? 'bg-[#FF7F00]/10 border-[#FF7F00]/30 text-[#FF7F00]' 
                            : 'bg-white/5 border-transparent text-white/40 hover:bg-white/10'
                        }`}
                      >
                        {ratio.icon}
                        <span className="text-[9px] font-bold">{ratio.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={() => handleGenerate()}
                disabled={isGenerating}
                className="h-12 px-6 bg-[#FF7F00] hover:bg-[#FF8F20] disabled:bg-white/10 disabled:text-white/20 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95 shadow-[0_0_20px_rgba(255,127,0,0.3)]"
              >
                {isGenerating ? (
                  <RefreshCw className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    生成图像
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Credit Info */}
      <div className="absolute top-6 right-6 flex items-center gap-3 z-50">
        <div className="px-4 py-2 bg-black/40 backdrop-blur-xl border border-white/10 rounded-full flex items-center gap-3">
          <CreditCard className="w-4 h-4 text-[#FF7F00]" />
          <div className="flex flex-col">
            <span className="text-[10px] text-white/40 font-medium uppercase tracking-tighter leading-none mb-0.5">可用积分</span>
            <span className="text-sm font-bold text-white leading-none">{auth.user?.credits?.toFixed(2) || '0.00'}</span>
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      <AnimatePresence>
        {previewImage && (
          <WorkflowPreview 
            node={previewImage} 
            onClose={() => setPreviewImage(null)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
};

// --- Sub-components ---

const WorkflowNodeComponent: React.FC<{
  node: WorkflowNode;
  isSelected: boolean;
  onDrag: (id: string, dx: number, dy: number) => void;
  onSelect: (id: string, multi: boolean) => void;
  onPreview: () => void;
  onDelete: () => void;
  onSendToInput: () => void;
  onRegenerate: () => void;
  onAdjustRegenerate: () => void;
  onClone: () => void;
}> = ({ node, isSelected, onDrag, onSelect, onPreview, onDelete, onSendToInput, onRegenerate, onAdjustRegenerate, onClone }) => {
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const [showMenu, setShowMenu] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (e.button === 2) {
      setMenuPos({ x: e.clientX, y: e.clientY });
      setShowMenu(true);
      return;
    }
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    onSelect(node.id, e.shiftKey);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuPos({ x: e.clientX, y: e.clientY });
    setShowMenu(true);
  };

  useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      onDrag(node.id, dx, dy);
      dragStart.current = { x: e.clientX, y: e.clientY };
    };
    const handleMouseUp = () => setIsDragging(false);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, onDrag, node.id]);

  return (
    <div 
      className={`absolute rounded-2xl overflow-hidden transition-shadow duration-200 ${
        isSelected ? 'ring-2 ring-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.4)]' : 'ring-1 ring-white/10 shadow-xl'
      } ${node.type === 'input' ? 'bg-[#1A2635]' : 'bg-[#1A1A1A]'}`}
      style={{ 
        left: node.x, 
        top: node.y, 
        width: node.width,
        cursor: isDragging ? 'grabbing' : 'grab'
      }}
      onMouseDown={handleMouseDown}
      onContextMenu={handleContextMenu}
    >
      {/* Node Header */}
      <div className={`px-3 py-2 flex items-center justify-between border-b border-white/5 ${
        node.type === 'input' ? 'bg-blue-500/10' : 'bg-white/5'
      }`}>
        <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">
          {node.type === 'input' ? '输入图像' : '生成结果'}
        </span>
        <div className="flex gap-1">
          <button onClick={onPreview} className="p-1 hover:bg-white/10 rounded transition-colors">
            <Search className="w-3 h-3 text-white/60" />
          </button>
          <button onClick={onDelete} className="p-1 hover:bg-red-500/20 rounded transition-colors">
            <Trash2 className="w-3 h-3 text-red-400" />
          </button>
        </div>
      </div>

      {/* Image Area */}
      <div className="relative aspect-square bg-black/40 group">
        {node.status === 'loading' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-8 h-8 text-[#FF7F00] animate-spin" />
            <span className="text-[10px] text-white/40 font-bold animate-pulse">正在渲染中...</span>
          </div>
        ) : node.status === 'error' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-red-400 px-4 text-center">
            <X className="w-8 h-8" />
            <span className="text-[10px] font-bold">生成失败</span>
            {node.errorMessage && (
              <div className="max-h-24 overflow-y-auto scrollbar-hide">
                <span className="text-[9px] text-white/40 leading-tight block">{node.errorMessage}</span>
              </div>
            )}
            <button 
              onClick={(e) => { e.stopPropagation(); onRegenerate(); }}
              className="mt-2 px-3 py-1 bg-white/10 hover:bg-white/20 rounded-full text-[9px] font-bold transition-colors"
            >
              重试
            </button>
          </div>
        ) : (
          <>
            <img src={node.imageUrl} className="w-full h-full object-contain" alt="" />
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
              <button 
                onClick={onPreview}
                className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
              >
                <Search className="w-5 h-5" />
              </button>
              <button 
                onClick={onSendToInput}
                className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
                title="发送到输入框"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Node Footer / Prompt */}
      {node.prompt && (
        <div className="p-3 bg-black/20 group/prompt">
          <p className="text-[10px] text-white/60 line-clamp-2 leading-relaxed italic">
            &quot;{node.prompt}&quot;
          </p>
          <button 
            onClick={() => {
              navigator.clipboard.writeText(node.prompt!);
              alert('提示词已复制');
            }}
            className="mt-2 flex items-center gap-1.5 text-[9px] font-bold text-[#FF7F00] opacity-0 group-hover/prompt:opacity-100 transition-opacity"
          >
            <Copy className="w-3 h-3" />
            复制关键词
          </button>
        </div>
      )}

      {/* Context Menu */}
      {showMenu && (
        <div 
          className="fixed z-[1000] bg-[#1A1A1A] border border-white/10 rounded-xl shadow-2xl py-1 min-w-[180px]"
          style={{ left: menuPos.x, top: menuPos.y }}
          onMouseLeave={() => setShowMenu(false)}
          onClick={(e) => e.stopPropagation()}
        >
          <MenuButton icon={<RefreshCw className="w-4 h-4" />} label="再次生成" onClick={() => { onRegenerate(); setShowMenu(false); }} />
          <MenuButton icon={<Settings2 className="w-4 h-4" />} label="调整后再次生成" onClick={() => { onAdjustRegenerate(); setShowMenu(false); }} />
          <div className="h-px bg-white/5 my-1" />
          <MenuButton icon={<Copy className="w-4 h-4" />} label="复制图片" onClick={() => { 
            if (node.imageUrl) {
              navigator.clipboard.writeText(node.imageUrl);
              alert('图片链接已复制');
            }
            setShowMenu(false); 
          }} />
          <MenuButton icon={<Download className="w-4 h-4" />} label="导出图片" onClick={() => {
            if (node.imageUrl) {
              const link = document.createElement('a');
              link.href = node.imageUrl;
              link.download = `export-${node.id}.png`;
              link.click();
            }
            setShowMenu(false);
          }} />
          <div className="h-px bg-white/5 my-1" />
          <MenuButton icon={<Send className="w-4 h-4" />} label="发送给输入框" onClick={() => { onSendToInput(); setShowMenu(false); }} />
          <MenuButton icon={<CopyPlus className="w-4 h-4" />} label="克隆节点" onClick={() => { onClone(); setShowMenu(false); }} />
          <div className="h-px bg-white/5 my-1" />
          <MenuButton icon={<Trash2 className="w-4 h-4" />} label="删除节点" variant="danger" onClick={() => { onDelete(); setShowMenu(false); }} />
        </div>
      )}
    </div>
  );
};

const ToolbarButton: React.FC<{ 
  active?: boolean; 
  onClick?: () => void; 
  icon: React.ReactNode; 
  label: string;
  as?: React.ElementType;
}> = ({ active, onClick, icon, label, as: Component = 'button' }) => (
  <Component
    onClick={onClick}
    className={`group relative p-2.5 rounded-xl transition-all ${
      active ? 'bg-[#FF7F00] text-white shadow-[0_0_15px_rgba(255,127,0,0.4)]' : 'text-white/40 hover:text-white hover:bg-white/5'
    }`}
  >
    {icon}
    <div className="absolute left-full ml-3 px-2 py-1 bg-black text-[10px] font-bold whitespace-nowrap rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-[100]">
      {label}
    </div>
  </Component>
);

const MenuButton: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void; className?: string }> = ({ icon, label, onClick, className }) => (
  <button 
    onClick={onClick}
    className={`w-full px-4 py-2.5 flex items-center gap-3 text-xs font-medium hover:bg-white/5 transition-colors ${className || 'text-white/80'}`}
  >
    {icon}
    {label}
  </button>
);

const WorkflowPreview: React.FC<{ node: WorkflowNode; onClose: () => void }> = ({ node, onClose }) => (
  <motion.div 
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-3xl flex items-center justify-center p-8"
    onClick={onClose}
  >
    <button className="absolute top-8 right-8 p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors">
      <X className="w-8 h-8" />
    </button>

    <div className="flex flex-col lg:flex-row gap-12 max-w-7xl w-full items-center" onClick={e => e.stopPropagation()}>
      <div className="flex-1 relative group">
        <img 
          src={node.imageUrl} 
          className="w-full max-h-[80vh] object-contain rounded-2xl shadow-2xl" 
          alt="" 
        />
        <div className="absolute bottom-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity">
          <button 
            onClick={() => {
              const link = document.createElement('a');
              link.href = node.imageUrl;
              link.download = `workflow-${node.id}.png`;
              link.click();
            }}
            className="flex items-center gap-2 px-6 py-3 bg-white text-black rounded-full font-bold shadow-xl hover:scale-105 transition-transform"
          >
            <Download className="w-5 h-5" />
            下载原图
          </button>
        </div>
      </div>

      <div className="w-full lg:w-96 flex flex-col gap-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">图像详情</h2>
          <p className="text-white/40 text-sm font-medium uppercase tracking-widest">
            {node.type === 'input' ? '输入参考图像' : 'AI 生成结果'}
          </p>
        </div>

        {node.prompt && (
          <div className="p-6 bg-white/5 border border-white/10 rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white/40 uppercase tracking-widest">生成提示词</span>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(node.prompt!);
                  alert('提示词已复制');
                }}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <Copy className="w-4 h-4 text-[#FF7F00]" />
              </button>
            </div>
            <p className="text-sm leading-relaxed text-white/80 italic">
              &quot;{node.prompt}&quot;
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-white/5 border border-white/10 rounded-2xl">
            <span className="block text-[10px] font-bold text-white/40 uppercase mb-1">节点 ID</span>
            <span className="text-xs font-mono text-white/80">{node.id}</span>
          </div>
          <div className="p-4 bg-white/5 border border-white/10 rounded-2xl">
            <span className="block text-[10px] font-bold text-white/40 uppercase mb-1">状态</span>
            <span className="text-xs font-bold text-green-400">已就绪</span>
          </div>
        </div>

        <button 
          onClick={onClose}
          className="w-full py-4 border border-white/10 hover:bg-white/5 rounded-2xl font-bold transition-colors"
        >
          返回画布
        </button>
      </div>
    </div>
  </motion.div>
);

export default WorkflowView;
