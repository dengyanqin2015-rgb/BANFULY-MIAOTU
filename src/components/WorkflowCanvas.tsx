import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Minus, 
  Maximize, 
  MousePointer2, 
  Hand, 
  MoreVertical, 
  RefreshCw, 
  Copy, 
  Download, 
  Send, 
  Trash2,
  ChevronDown,
  Check,
  Search,
  Zap,
  ArrowRight,
  Upload,
  X
} from 'lucide-react';
import { cn } from '../lib/utils';
import { WorkflowNode, WorkflowEdge } from '../../types';
import { generateEcomImage } from '../geminiService';

interface WorkflowCanvasProps {
  userApiKey: string;
  onDeductCredit: (amount?: number) => Promise<boolean>;
  userCredits: number;
  onBack: () => void;
  modelCosts: Record<string, {
    name: string;
    label: string;
    resolutions: {
      [key: string]: { cost: number; rmb: number };
    };
  }>;
}

const ASPECT_RATIOS = [
  { id: '1:1', label: '1:1' },
  { id: '4:3', label: '4:3' },
  { id: '3:4', label: '3:4' },
  { id: '16:9', label: '16:9' },
  { id: '9:16', label: '9:16' },
];

export const WorkflowCanvas: React.FC<WorkflowCanvasProps> = ({ 
  userApiKey, 
  onDeductCredit, 
  userCredits, 
  onBack,
  modelCosts
}) => {
  const [nodes, setNodes] = useState<WorkflowNode[]>([]);
  const [edges, setEdges] = useState<WorkflowEdge[]>([]);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [tool, setTool] = useState<'select' | 'hand'>('select');
  const [prompt, setPrompt] = useState('');
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [previewImage, setPreviewImage] = useState<{ url: string, title?: string } | null>(null);
  
  const modelKeys = Object.keys(modelCosts);
  const [selectedModelId, setSelectedModelId] = useState(modelKeys[0] || 'nanobanana');
  const [selectedResolution, setSelectedResolution] = useState('1K');
  const [selectedRatio, setSelectedRatio] = useState(ASPECT_RATIOS[0]);
  
  const selectedModel = modelCosts[selectedModelId];
  const currentPrice = selectedModel?.resolutions[selectedResolution]?.rmb || (selectedModel ? Object.values(selectedModel.resolutions)[0].rmb : 0);

  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showRatioMenu, setShowRatioMenu] = useState(false);
  const [showResolutionMenu, setShowResolutionMenu] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, nodeId: string } | null>(null);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [showQuickPrompts, setShowQuickPrompts] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasFileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [prompt]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, target: 'input' | 'canvas' = 'input') => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file, index) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        if (target === 'input') {
          setUploadedImages(prev => [...prev, result]);
        } else {
          // Add directly to canvas as a node
          const newNode: WorkflowNode = {
            id: `node-upload-${Date.now()}-${index}`,
            type: 'input',
            x: (window.innerWidth / 2 - transform.x) / transform.scale + (index * 40),
            y: (window.innerHeight / 2 - transform.y) / transform.scale + (index * 40),
            data: {
              imageUrl: result,
              prompt: '上传图片',
              status: 'idle'
            }
          };
          setNodes(prev => [...prev, newNode]);
        }
      };
      reader.readAsDataURL(file);
    });
    // Reset input
    e.target.value = '';
  };

  const removeUploadedImage = (index: number) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== index));
  };

  const clearUploadedImages = () => {
    setUploadedImages([]);
  };

  const addImageToInput = (imageUrl: string, nodePrompt?: string) => {
    setUploadedImages(prev => [...prev, imageUrl]);
    if (nodePrompt && nodePrompt !== '上传图片') {
      setPrompt(nodePrompt);
    }
  };

  // Initialize with an empty state or some instructions if needed
  useEffect(() => {
    // Optional: add a starting node or just leave it empty
  }, []);

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (tool === 'hand' || e.button === 1) {
      setIsDraggingCanvas(true);
      setDragStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
    }
    setContextMenu(null);
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (isDraggingCanvas) {
      setTransform(prev => ({
        ...prev,
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      }));
    } else if (draggingNodeId) {
      setNodes(prev => prev.map(n => 
        n.id === draggingNodeId 
          ? { 
              ...n, 
              x: n.x + e.movementX / transform.scale, 
              y: n.y + e.movementY / transform.scale 
            } 
          : n
      ));
    }
  };

  const handleCanvasMouseUp = () => {
    setIsDraggingCanvas(false);
    setDraggingNodeId(null);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey) {
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.min(Math.max(transform.scale * delta, 0.1), 5);
      setTransform(prev => ({ ...prev, scale: newScale }));
    } else {
      setTransform(prev => ({
        ...prev,
        x: prev.x - e.deltaX,
        y: prev.y - e.deltaY
      }));
    }
  };

  const addNode = async (text: string) => {
    if (!text.trim() && uploadedImages.length === 0) return;

    const imagesToUse = [...uploadedImages];
    const resultNodeId = `node-result-${Date.now()}`;
    const newNodes: WorkflowNode[] = [];
    const newEdges: WorkflowEdge[] = [];
    
    // 1. Identify parent nodes and create new input nodes for fresh uploads
    const parentNodeIds: string[] = [];
    const centerX = (window.innerWidth / 2 - transform.x) / transform.scale;
    const centerY = (window.innerHeight / 2 - transform.y) / transform.scale;

    imagesToUse.forEach((imgUrl, idx) => {
      // Check if this image is already a node on the canvas
      const existingNode = nodes.find(n => n.data.imageUrl === imgUrl);
      if (existingNode) {
        parentNodeIds.push(existingNode.id);
      } else {
        // Create a new input node for this upload
        const inputNodeId = `node-input-${Date.now()}-${idx}`;
        const inputNode: WorkflowNode = {
          id: inputNodeId,
          type: 'input',
          x: centerX - 400,
          y: centerY + (idx - imagesToUse.length / 2) * 350,
          data: {
            imageUrl: imgUrl,
            status: 'done'
          }
        };
        newNodes.push(inputNode);
        parentNodeIds.push(inputNodeId);
      }
    });

    // 2. Create the result node
    const resultNode: WorkflowNode = {
      id: resultNodeId,
      type: 'image',
      x: centerX,
      y: centerY,
      data: {
        prompt: text,
        status: 'loading',
        model: selectedModelId,
        aspectRatio: selectedRatio.id,
        resolution: selectedResolution
      }
    };
    newNodes.push(resultNode);

    // 3. Create edges from all parents to the result
    parentNodeIds.forEach(pId => {
      newEdges.push({
        id: `edge-${pId}-${resultNodeId}`,
        source: pId,
        target: resultNodeId
      });
    });

    setNodes(prev => [...prev, ...newNodes]);
    setEdges(prev => [...prev, ...newEdges]);
    setPrompt('');
    setUploadedImages([]);

    try {
      // Deduct credit
      const cost = modelCosts[selectedModelId]?.resolutions[selectedResolution]?.rmb || 0;
      const success = await onDeductCredit(cost);
      if (!success) {
        setNodes(prev => prev.map(n => n.id === resultNodeId ? { ...n, data: { ...n.data, status: 'error' } } : n));
        return;
      }

      const imageUrl = await generateEcomImage({
        prompt: text,
        model: selectedModelId,
        aspectRatio: selectedRatio.id,
        apiKey: userApiKey,
        productImagesB64: imagesToUse
      });

      if (imageUrl) {
        setNodes(prev => prev.map(n => n.id === resultNodeId ? { ...n, data: { ...n.data, imageUrl, status: 'done' } } : n));
      } else {
        setNodes(prev => prev.map(n => n.id === resultNodeId ? { ...n, data: { ...n.data, status: 'error' } } : n));
      }
    } catch (error) {
      console.error(error);
      setNodes(prev => prev.map(n => n.id === resultNodeId ? { ...n, data: { ...n.data, status: 'error' } } : n));
    }
  };

  const deleteNode = (id: string) => {
    setNodes(prev => prev.filter(n => n.id !== id));
    setEdges(prev => prev.filter(e => e.source !== id && e.target !== id));
    setContextMenu(null);
  };

  const copyImageToClipboard = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      alert('图片链接已复制到剪贴板');
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
    setContextMenu(null);
  };

  const exportImage = (url: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = `banfuly-${Date.now()}.png`;
    link.click();
    setContextMenu(null);
  };

  const QUICK_PROMPTS = [
    "极简主义风格，柔和光影",
    "赛博朋克都市，霓虹灯光",
    "电影感构图，深景深",
    "微距摄影，细节纹理",
    "超现实主义，梦幻色彩"
  ];

  const adjustAndRegenerate = (id: string) => {
    const node = nodes.find(n => n.id === id);
    if (!node) return;

    // Set prompt
    setPrompt(node.data.prompt || '');

    // Find parent images
    const parentEdges = edges.filter(e => e.target === id);
    const parentNodes = nodes.filter(n => parentEdges.some(e => e.source === n.id));
    const parentImages = parentNodes.map(n => n.data.imageUrl).filter(Boolean) as string[];

    setUploadedImages(parentImages);
    setContextMenu(null);
  };

  const regenerateNode = async (id: string) => {
    const node = nodes.find(n => n.id === id);
    if (!node) return;

    setNodes(prev => prev.map(n => n.id === id ? { ...n, data: { ...n.data, status: 'loading' } } : n));
    setContextMenu(null);

    try {
      const nodeModelId = node.data.model || selectedModelId;
      const nodeRes = node.data.resolution || selectedResolution;
      const cost = modelCosts[nodeModelId]?.resolutions[nodeRes]?.rmb || 0;
      
      const success = await onDeductCredit(cost);
      if (!success) {
        setNodes(prev => prev.map(n => n.id === id ? { ...n, data: { ...n.data, status: 'error' } } : n));
        return;
      }

      // Find all parent images via edges
      const parentEdges = edges.filter(e => e.target === id);
      const parentNodes = nodes.filter(n => parentEdges.some(e => e.source === n.id));
      const parentImages = parentNodes.map(n => n.data.imageUrl).filter(Boolean) as string[];

      const imageUrl = await generateEcomImage({
        prompt: node.data.prompt || '',
        model: nodeModelId,
        aspectRatio: node.data.aspectRatio || selectedRatio.id,
        apiKey: userApiKey,
        productImagesB64: parentImages
      });

      if (imageUrl) {
        setNodes(prev => prev.map(n => n.id === id ? { ...n, data: { ...n.data, imageUrl, status: 'done' } } : n));
      } else {
        setNodes(prev => prev.map(n => n.id === id ? { ...n, data: { ...n.data, status: 'error' } } : n));
      }
    } catch (error) {
      console.error(error);
      setNodes(prev => prev.map(n => n.id === id ? { ...n, data: { ...n.data, status: 'error' } } : n));
    }
  };

  return (
    <div className="relative w-full h-screen bg-[#0a0a0a] overflow-hidden font-sans text-white">
      {/* Grid Background */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage: `radial-gradient(circle, #333 1px, transparent 1px)`,
          backgroundSize: `${20 * transform.scale}px ${20 * transform.scale}px`,
          backgroundPosition: `${transform.x}px ${transform.y}px`
        }}
      />

      {/* Canvas Area */}
      <div 
        ref={canvasRef}
        className={cn(
          "absolute inset-0 cursor-default",
          tool === 'hand' && "cursor-grab active:cursor-grabbing"
        )}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        onWheel={handleWheel}
      >
        <div 
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            transformOrigin: '0 0'
          }}
        >
          {/* Edges */}
          <svg className="absolute inset-0 pointer-events-none overflow-visible">
            {edges.map(edge => {
              const source = nodes.find(n => n.id === edge.source);
              const target = nodes.find(n => n.id === edge.target);
              if (!source || !target) return null;
              
              // Dynamic connection points based on relative position
              const sourceIsLeft = source.x + 150 < target.x + 150;
              
              const startX = sourceIsLeft ? source.x + 300 : source.x;
              // Calculate dynamic vertical center based on aspect ratio
              const getCenterY = (n: WorkflowNode) => {
                const ratio = n.data.aspectRatio || '1:1';
                let h = 300; // default square
                if (ratio === '16:9') h = 300 * (9/16);
                if (ratio === '9:16') h = 300 * (16/9);
                if (ratio === '4:3') h = 300 * (3/4);
                if (ratio === '3:4') h = 300 * (4/3);
                return 40 + (h / 2); // 40 is header height
              };
              
              const startY = source.y + getCenterY(source); 
              const endX = sourceIsLeft ? target.x : target.x + 300;
              const endY = target.y + getCenterY(target);
              
              // Improved Bezier curve calculation
              const dx = Math.abs(endX - startX);
              const curvature = Math.min(dx * 0.5, 150);
              const cp1x = sourceIsLeft ? startX + curvature : startX - curvature;
              const cp2x = sourceIsLeft ? endX - curvature : endX + curvature;
              
              return (
                <path 
                  key={edge.id}
                  d={`M ${startX} ${startY} C ${cp1x} ${startY}, ${cp2x} ${endY}, ${endX} ${endY}`}
                  stroke="#10b981"
                  strokeWidth="3"
                  strokeOpacity="0.8"
                  fill="none"
                  strokeLinecap="round"
                  className="transition-[d] duration-75"
                />
              );
            })}
          </svg>

          {/* Nodes */}
          {nodes.map(node => (
            <motion.div
              key={node.id}
              onMouseDown={(e) => {
                if (tool === 'select' && e.button === 0) {
                  e.stopPropagation();
                  setDraggingNodeId(node.id);
                }
              }}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className={cn(
                "absolute group touch-none",
                draggingNodeId === node.id ? "z-50" : "z-10"
              )}
              style={{ left: node.x, top: node.y, width: 300 }}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({ x: e.clientX, y: e.clientY, nodeId: node.id });
              }}
            >
              <div className={cn(
                "bg-[#1a1a1a] border rounded-2xl overflow-hidden shadow-2xl transition-all",
                node.type === 'input' ? "border-blue-500/30 ring-1 ring-blue-500/10" : "border-[#333] hover:border-[#444]",
                draggingNodeId === node.id && "shadow-[0_0_30px_rgba(0,0,0,0.5)] scale-[1.02]"
              )}>
                {/* Node Header */}
                <div className="px-4 py-2 border-b border-[#333] flex items-center justify-between bg-[#222]">
                  <span className="text-xs font-medium text-gray-400">
                    {node.type === 'input' ? '输入图片' : `图片生成 (${modelCosts[node.data.model || '']?.name || 'FLASH 2.5'})`}
                  </span>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setContextMenu({ x: e.clientX, y: e.clientY, nodeId: node.id });
                    }}
                    className="p-1 hover:bg-[#333] rounded-md transition-colors"
                  >
                    <MoreVertical size={14} className="text-gray-400" />
                  </button>
                </div>

                {/* Node Content */}
                <div className="p-3">
                  <div 
                    className={cn(
                      "relative bg-[#0f0f0f] rounded-xl overflow-hidden group/img cursor-pointer",
                      node.data.aspectRatio === '16:9' ? "aspect-video" :
                      node.data.aspectRatio === '9:16' ? "aspect-[9/16]" :
                      node.data.aspectRatio === '4:3' ? "aspect-[4/3]" :
                      node.data.aspectRatio === '3:4' ? "aspect-[3/4]" :
                      "aspect-square"
                    )}
                    onDoubleClick={() => node.data.imageUrl && addImageToInput(node.data.imageUrl, node.data.prompt)}
                  >
                    {node.data.status === 'loading' ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                        <RefreshCw className="animate-spin text-blue-500" size={32} />
                        <span className="text-xs text-gray-500">正在构思画面...</span>
                      </div>
                    ) : node.data.status === 'error' ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center">
                        <Trash2 className="text-red-500" size={32} />
                        <span className="text-xs text-red-400">生成失败，请检查设置或点数</span>
                      </div>
                    ) : (
                      <>
                        <img 
                          src={node.data.imageUrl} 
                          alt={node.data.prompt} 
                          className="w-full h-full object-contain transition-transform duration-500 group-hover/img:scale-110"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center gap-4">
                          <button 
                            onClick={() => setPreviewImage({ url: node.data.imageUrl!, title: node.data.prompt })}
                            className="p-2 bg-white/10 hover:bg-white/20 rounded-full backdrop-blur-md transition-all"
                          >
                            <Search size={20} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                  
                  {/* Prompt Text */}
                  <div className="mt-3 p-2 bg-[#0f0f0f] rounded-lg border border-[#222]">
                    <p className="text-xs text-gray-400 line-clamp-3 leading-relaxed">
                      {node.data.prompt}
                    </p>
                  </div>
                </div>

                {/* Node Footer */}
                <div className="px-4 py-2 bg-[#222] border-t border-[#333] flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">
                      {node.data.resolution || '1K'} • {node.data.aspectRatio || '1:1'}
                    </span>
                    <span className="text-[8px] text-gray-600 uppercase tracking-widest mt-0.5">
                      {modelCosts[node.data.model || '']?.name || 'FLASH 2.5'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => regenerateNode(node.id)}
                      className="p-1.5 hover:bg-[#333] rounded-lg transition-colors text-gray-400 hover:text-blue-400"
                      title="重新生成"
                    >
                      <RefreshCw size={12} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Dynamic Connection Points (Green Dots) */}
              {(() => {
                const hasLeftConn = edges.some(e => 
                  (e.target === node.id && (nodes.find(n => n.id === e.source)?.x || 0) + 150 < node.x + 150) ||
                  (e.source === node.id && (nodes.find(n => n.id === e.target)?.x || 0) + 150 < node.x + 150)
                );
                const hasRightConn = edges.some(e => 
                  (e.target === node.id && (nodes.find(n => n.id === e.source)?.x || 0) + 150 > node.x + 150) ||
                  (e.source === node.id && (nodes.find(n => n.id === e.target)?.x || 0) + 150 > node.x + 150)
                );

                const getCenterY = () => {
                  const ratio = node.data.aspectRatio || '1:1';
                  let h = 300;
                  if (ratio === '16:9') h = 300 * (9/16);
                  if (ratio === '9:16') h = 300 * (16/9);
                  if (ratio === '4:3') h = 300 * (3/4);
                  if (ratio === '3:4') h = 300 * (4/3);
                  return 40 + (h / 2);
                };

                const dotStyle = { top: getCenterY() };

                return (
                  <>
                    {hasLeftConn && (
                      <div 
                        style={dotStyle}
                        className="absolute -left-2 -translate-y-1/2 w-4 h-4 bg-green-500 rounded-full border-2 border-[#0a0a0a] shadow-[0_0_15px_rgba(16,185,129,0.8)] z-20" 
                      />
                    )}
                    {hasRightConn && (
                      <div 
                        style={dotStyle}
                        className="absolute -right-2 -translate-y-1/2 w-4 h-4 bg-green-500 rounded-full border-2 border-[#0a0a0a] shadow-[0_0_15px_rgba(16,185,129,0.8)] z-20" 
                      />
                    )}
                    {/* Default dot for new nodes or unconnected nodes */}
                    {!hasLeftConn && !hasRightConn && (
                      <div 
                        style={dotStyle}
                        className="absolute -right-2 -translate-y-1/2 w-4 h-4 bg-green-500/30 rounded-full border-2 border-[#0a0a0a] z-20" 
                      />
                    )}
                  </>
                );
              })()}
            </motion.div>
          ))}
        </div>
      </div>

      {/* Side Toolbar */}
      <div className="absolute right-6 top-1/2 -translate-y-1/2 flex flex-col gap-4 z-40">
        <div className="bg-[#1a1a1a]/80 backdrop-blur-xl border border-[#333] rounded-2xl p-1.5 flex flex-col gap-1 shadow-2xl">
          <button 
            onClick={() => setTool('hand')}
            title="抓手工具 (H)"
            className={cn(
              "p-2.5 rounded-xl transition-all",
              tool === 'hand' ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" : "hover:bg-[#333] text-gray-400"
            )}
          >
            <Hand size={20} />
          </button>
          <button 
            onClick={() => setTool('select')}
            title="选择工具 (V)"
            className={cn(
              "p-2.5 rounded-xl transition-all",
              tool === 'select' ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" : "hover:bg-[#333] text-gray-400"
            )}
          >
            <MousePointer2 size={20} />
          </button>
        </div>

        <div className="bg-[#1a1a1a]/80 backdrop-blur-xl border border-[#333] rounded-2xl p-1.5 flex flex-col gap-1 shadow-2xl">
          <button 
            onClick={() => canvasFileInputRef.current?.click()}
            title="批量上传到画布"
            className="p-2.5 hover:bg-[#333] rounded-xl transition-all text-gray-400 hover:text-white"
          >
            <Upload size={20} />
          </button>
          <input 
            type="file" 
            ref={canvasFileInputRef} 
            onChange={(e) => handleFileUpload(e, 'canvas')} 
            multiple 
            accept="image/*" 
            className="hidden" 
          />
          <div className="h-[1px] bg-[#333] mx-2 my-1" />
          <button 
            onClick={() => setTransform(prev => ({ ...prev, scale: Math.min(prev.scale + 0.1, 5) }))}
            title="放大"
            className="p-2.5 hover:bg-[#333] rounded-xl transition-all text-gray-400 hover:text-white"
          >
            <Plus size={20} />
          </button>
          <button 
            onClick={() => setTransform(prev => ({ ...prev, scale: Math.max(prev.scale - 0.1, 0.1) }))}
            title="缩小"
            className="p-2.5 hover:bg-[#333] rounded-xl transition-all text-gray-400 hover:text-white"
          >
            <Minus size={20} />
          </button>
          <div className="h-[1px] bg-[#333] mx-2 my-1" />
          <button 
            onClick={() => setTransform({ x: 0, y: 0, scale: 1 })}
            title="重置视图"
            className="p-2.5 hover:bg-[#333] rounded-xl transition-all text-gray-400 hover:text-white"
          >
            <Maximize size={20} />
          </button>
        </div>
      </div>

      {/* Bottom Input Bar */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-full max-w-3xl px-6">
        <div className="bg-[#1a1a1a]/90 backdrop-blur-2xl border border-[#333] rounded-[24px] p-2 shadow-2xl">
          {/* Uploaded Images Thumbnails */}
          <AnimatePresence>
            {uploadedImages.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="flex items-center gap-3 px-4 py-3 border-b border-[#222] mb-1 overflow-x-auto scrollbar-hide"
              >
                {uploadedImages.map((img, idx) => (
                  <div key={idx} className="relative group/thumb flex-shrink-0">
                    <img 
                      src={img} 
                      alt={`upload-${idx}`} 
                      className="h-12 w-auto min-w-[3rem] max-w-[8rem] rounded-lg object-contain bg-black/20 border border-[#333] cursor-pointer hover:scale-105 transition-transform"
                      referrerPolicy="no-referrer"
                      onClick={() => setPreviewImage({ url: img })}
                    />
                    <button 
                      onClick={() => removeUploadedImage(idx)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity shadow-lg z-10"
                    >
                      <X size={10} className="text-white" />
                    </button>
                    <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-black/60 rounded-full flex items-center justify-center text-[8px] font-bold text-white border border-white/10 pointer-events-none">
                      {idx + 1}
                    </div>
                  </div>
                ))}
                <button 
                  onClick={clearUploadedImages}
                  className="flex-shrink-0 w-12 h-12 rounded-lg border border-dashed border-[#333] flex flex-col items-center justify-center gap-1 hover:bg-red-500/10 hover:border-red-500/30 transition-all group"
                >
                  <Trash2 size={14} className="text-gray-500 group-hover:text-red-400" />
                  <span className="text-[8px] text-gray-600 group-hover:text-red-400 uppercase">清空</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center gap-2">
            <div className="flex-1 relative flex items-end pb-2">
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="mb-2 p-2 bg-[#222] hover:bg-[#333] rounded-xl text-gray-400 transition-colors"
              >
                <Upload size={20} />
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={(e) => handleFileUpload(e, 'input')} 
                multiple 
                accept="image/*" 
                className="hidden" 
              />
              <textarea 
                ref={textareaRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    addNode(prompt);
                  }
                }}
                placeholder="请输入你想要生成的画面描述..."
                rows={1}
                className="flex-1 bg-transparent border-none focus:ring-0 text-gray-200 placeholder-gray-500 py-3 px-4 text-lg resize-none min-h-[56px] max-h-[200px] overflow-y-auto"
              />
              <button 
                onClick={() => {
                  const emojis = ['✨', '🎨', '🚀', '🌈', '📸', '🖼️', '🌟', '🔥'];
                  const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
                  setPrompt(prev => prev + randomEmoji);
                }}
                className="mb-2 p-2 hover:bg-[#222] rounded-xl text-gray-500 hover:text-amber-400 transition-colors"
                title="插入表情包"
              >
                <span className="text-xl">😊</span>
              </button>
              <div className="absolute left-0 -top-12 flex items-center gap-2">
                <div className="bg-[#1a1a1a]/80 backdrop-blur-md border border-[#333] rounded-full px-3 py-1 flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-[10px] font-medium text-gray-400 uppercase tracking-widest">Workflow Engine Active</span>
                </div>
              </div>
            </div>
            <button 
              onClick={() => addNode(prompt)}
              disabled={!prompt.trim()}
              className={cn(
                "w-14 h-14 rounded-2xl flex items-center justify-center transition-all",
                prompt.trim() 
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30 hover:scale-105 active:scale-95" 
                  : "bg-[#222] text-gray-600 cursor-not-allowed"
              )}
            >
              <ArrowRight size={24} />
            </button>
          </div>

          <div className="flex items-center justify-between px-4 py-2 border-t border-[#222] mt-1">
            <div className="flex items-center gap-4">
              {/* Model Selector */}
              <div className="relative">
                <button 
                  onClick={() => setShowModelMenu(!showModelMenu)}
                  className="flex items-center gap-2 text-xs text-gray-400 hover:text-white transition-colors"
                >
                  <Zap size={14} className="text-amber-400" />
                  <span>{selectedModel?.name}</span>
                  <ChevronDown size={12} />
                </button>
                <AnimatePresence>
                  {showModelMenu && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute bottom-full mb-4 left-0 w-48 bg-[#1a1a1a] border border-[#333] rounded-2xl overflow-hidden shadow-2xl z-50"
                    >
                      <div className="p-2 border-b border-[#222] bg-[#222]/50">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider px-2">选择引擎</span>
                      </div>
                      {Object.entries(modelCosts).map(([id, cfg]) => (
                        <button
                          key={id}
                          onClick={() => {
                            setSelectedModelId(id);
                            // Reset resolution if not available in new model
                            if (!cfg.resolutions[selectedResolution]) {
                              setSelectedResolution(Object.keys(cfg.resolutions)[0]);
                            }
                            setShowModelMenu(false);
                          }}
                          className={cn(
                            "w-full px-4 py-3 flex items-center justify-between text-sm transition-colors",
                            selectedModelId === id ? "bg-blue-600/10 text-blue-400" : "hover:bg-[#222] text-gray-400"
                          )}
                        >
                          <div className="flex flex-col items-start">
                            <span>{cfg.name}</span>
                            <span className="text-[10px] opacity-50">{cfg.label}</span>
                          </div>
                          {selectedModelId === id && <Check size={14} />}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="h-4 w-[1px] bg-[#333]" />

              {/* Resolution Selector */}
              <div className="relative">
                <button 
                  onClick={() => setShowResolutionMenu(!showResolutionMenu)}
                  className="flex items-center gap-2 text-xs text-gray-400 hover:text-white transition-colors"
                >
                  <span>{selectedResolution}</span>
                  <ChevronDown size={12} />
                </button>
                <AnimatePresence>
                  {showResolutionMenu && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute bottom-full mb-4 left-0 w-32 bg-[#1a1a1a] border border-[#333] rounded-2xl overflow-hidden shadow-2xl z-50"
                    >
                      <div className="p-2 border-b border-[#222] bg-[#222]/50">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider px-2">画质</span>
                      </div>
                      {Object.keys(selectedModel?.resolutions || {}).map(res => (
                        <button
                          key={res}
                          onClick={() => {
                            setSelectedResolution(res);
                            setShowResolutionMenu(false);
                          }}
                          className={cn(
                            "w-full px-4 py-3 flex items-center justify-between text-sm transition-colors",
                            selectedResolution === res ? "bg-blue-600/10 text-blue-400" : "hover:bg-[#222] text-gray-400"
                          )}
                        >
                          <div className="flex flex-col items-start">
                            <span>{res}</span>
                            <span className="text-[10px] opacity-50">¥{selectedModel.resolutions[res].rmb}</span>
                          </div>
                          {selectedResolution === res && <Check size={14} />}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="h-4 w-[1px] bg-[#333]" />

              {/* Ratio Selector */}
              <div className="relative">
                <button 
                  onClick={() => setShowRatioMenu(!showRatioMenu)}
                  className="flex items-center gap-2 text-xs text-gray-400 hover:text-white transition-colors"
                >
                  <span>{selectedRatio.label}</span>
                  <ChevronDown size={12} />
                </button>
                <AnimatePresence>
                  {showRatioMenu && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute bottom-full mb-4 left-0 w-32 bg-[#1a1a1a] border border-[#333] rounded-2xl overflow-hidden shadow-2xl z-50"
                    >
                      {ASPECT_RATIOS.map(r => (
                        <button
                          key={r.id}
                          onClick={() => {
                            setSelectedRatio(r);
                            setShowRatioMenu(false);
                          }}
                          className={cn(
                            "w-full px-4 py-3 flex items-center justify-between text-sm transition-colors",
                            selectedRatio.id === r.id ? "bg-blue-600/10 text-blue-400" : "hover:bg-[#222] text-gray-400"
                          )}
                        >
                          <span>{r.label}</span>
                          {selectedRatio.id === r.id && <Check size={14} />}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="h-4 w-[1px] bg-[#333]" />

              <div className="relative">
                <button 
                  onClick={() => setShowQuickPrompts(!showQuickPrompts)}
                  className="flex items-center gap-2 text-xs text-gray-400 hover:text-white transition-colors"
                >
                  <span>快捷提示词</span>
                  <ChevronDown size={12} className={cn("transition-transform", showQuickPrompts && "rotate-180")} />
                </button>

                <AnimatePresence>
                  {showQuickPrompts && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute bottom-full left-0 mb-4 w-48 bg-[#1a1a1a] border border-[#333] rounded-2xl overflow-hidden shadow-2xl z-50"
                    >
                      {QUICK_PROMPTS.map((p, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            setPrompt(prev => prev ? `${prev}, ${p}` : p);
                            setShowQuickPrompts(false);
                          }}
                          className="w-full px-4 py-3 text-left text-xs text-gray-400 hover:bg-[#222] hover:text-white transition-colors border-b border-[#222] last:border-none"
                        >
                          {p}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-3 py-1 bg-white/5 border border-white/10 rounded-full">
                <span className="text-[10px] font-bold text-gray-500 uppercase">单次消耗</span>
                <span className="text-xs font-bold text-gray-300">¥{currentPrice.toFixed(1)}</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-400/10 border border-amber-400/20 rounded-full">
                <Zap size={12} className="text-amber-400" />
                <span className="text-xs font-bold text-amber-400">{userCredits}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Context Menu */}
      <AnimatePresence>
        {contextMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed z-[100] w-56 bg-[#1a1a1a] border border-[#333] rounded-2xl overflow-hidden shadow-2xl"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <div className="p-2 flex flex-col gap-1">
              <button 
                onClick={() => regenerateNode(contextMenu.nodeId)}
                className="w-full px-3 py-2.5 flex items-center gap-3 text-sm text-gray-300 hover:bg-[#222] rounded-xl transition-colors"
              >
                <RefreshCw size={16} />
                <span>再次生成</span>
              </button>
              <button 
                onClick={() => adjustAndRegenerate(contextMenu.nodeId)}
                className="w-full px-3 py-2.5 flex items-center gap-3 text-sm text-gray-300 hover:bg-[#222] rounded-xl transition-colors"
              >
                <Plus size={16} />
                <span>调整后再次生成</span>
              </button>
              <div className="h-[1px] bg-[#222] my-1" />
              <button 
                onClick={() => {
                  const node = nodes.find(n => n.id === contextMenu.nodeId);
                  if (node?.data.imageUrl) copyImageToClipboard(node.data.imageUrl);
                }}
                className="w-full px-3 py-2.5 flex items-center gap-3 text-sm text-gray-300 hover:bg-[#222] rounded-xl transition-colors"
              >
                <Copy size={16} />
                <span>复制链接</span>
              </button>
              <button 
                onClick={() => {
                  const node = nodes.find(n => n.id === contextMenu.nodeId);
                  if (node?.data.imageUrl) exportImage(node.data.imageUrl);
                }}
                className="w-full px-3 py-2.5 flex items-center gap-3 text-sm text-gray-300 hover:bg-[#222] rounded-xl transition-colors"
              >
                <Download size={16} />
                <span>导出图片</span>
              </button>
              <div className="h-[1px] bg-[#222] my-1" />
              <button 
                onClick={() => {
                  const node = nodes.find(n => n.id === contextMenu.nodeId);
                  if (node?.data.imageUrl) {
                    onBack(); // Go back to main app
                    // Note: In a real app we'd pass this image back to the main state
                  }
                }}
                className="w-full px-3 py-2.5 flex items-center gap-3 text-sm text-gray-300 hover:bg-[#222] rounded-xl transition-colors"
              >
                <Send size={16} />
                <span>发送给助手</span>
              </button>
              <button 
                onClick={() => deleteNode(contextMenu.nodeId)}
                className="w-full px-3 py-2.5 flex items-center gap-3 text-sm text-red-400 hover:bg-red-500/10 rounded-xl transition-colors"
              >
                <Trash2 size={16} />
                <span>删除</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Left Logo & Nav */}
      <div className="absolute left-8 top-8 flex items-center gap-6 z-40">
        <button 
          onClick={onBack}
          title="返回主页"
          className="p-2.5 bg-[#1a1a1a]/80 backdrop-blur-md border border-[#333] hover:bg-[#222] rounded-xl transition-all text-gray-400 hover:text-white group shadow-xl"
        >
          <ArrowRight size={20} className="rotate-180 group-hover:-translate-x-1 transition-transform" />
        </button>
        <div className="flex items-center gap-3 bg-[#1a1a1a]/80 backdrop-blur-md border border-[#333] px-4 py-2 rounded-2xl shadow-xl">
          <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center shadow-lg shadow-black/20">
            <Zap size={18} className="text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-extrabold tracking-tighter leading-none">BANFULY <span className="text-gray-500 font-light">ARCHITECT</span></span>
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-bold bg-[#FF7F00] text-white px-1.5 py-0.5 rounded uppercase">PRO</span>
              <span className="text-[9px] text-gray-500 font-medium uppercase tracking-wider">Visual Lab</span>
            </div>
          </div>
        </div>
      </div>

      {/* Image Preview Modal */}
      <AnimatePresence>
        {previewImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-8 bg-black/95 backdrop-blur-2xl"
            onClick={() => setPreviewImage(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative max-w-6xl w-full max-h-full flex flex-col items-center gap-8"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative group/preview w-full flex justify-center">
                <img 
                  src={previewImage.url} 
                  alt="Preview" 
                  className="max-w-full max-h-[75vh] object-contain rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.5)] border border-white/10"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/10 pointer-events-none" />
              </div>

              {previewImage.title && (
                <div className="bg-[#1a1a1a]/80 backdrop-blur-md border border-[#333] p-6 rounded-2xl max-w-3xl w-full shadow-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <Zap size={14} className="text-blue-500" />
                    <span className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">Prompt Instruction</span>
                  </div>
                  <p className="text-gray-200 text-sm leading-relaxed font-light italic">&ldquo;{previewImage.title}&rdquo;</p>
                </div>
              )}

              <div className="flex items-center gap-4">
                <button 
                  onClick={() => {
                    const link = document.createElement('a');
                    link.href = previewImage.url;
                    link.download = `banfuly-${Date.now()}.png`;
                    link.click();
                  }}
                  className="px-6 py-3 bg-white text-black rounded-full font-bold text-sm hover:bg-gray-200 transition-all flex items-center gap-2 shadow-lg"
                >
                  下载原图
                </button>
                <button 
                  onClick={() => setPreviewImage(null)}
                  className="px-6 py-3 bg-[#222] text-white rounded-full font-bold text-sm hover:bg-[#333] transition-all border border-[#444]"
                >
                  关闭预览
                </button>
              </div>

              <button 
                onClick={() => setPreviewImage(null)}
                className="absolute -top-12 right-0 p-2 text-gray-500 hover:text-white transition-colors"
              >
                <X size={32} />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
