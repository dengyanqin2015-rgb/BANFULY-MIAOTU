import React, { useCallback, useState, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Node,
  Edge,
  Connection,
  BackgroundVariant,
  Panel,
  type NodeMouseHandler,
  ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ImageNode, ImageNodeData } from './ImageNode';
import { GenerationBar, GenerationBarRef } from './GenerationBar';
import { generateImage, AspectRatio, ImageSize, ImageModel, checkApiKey, openApiKeyDialog } from '../lib/gemini';
import { ImageStorage } from '../lib/storage';
import { Trash2, ChevronDown, Plus, Download, Upload } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { User } from '../types';

const nodeTypes = {
  imageNode: ImageNode,
};

interface Project {
  id: string;
  name: string;
  nodes: Node[];
  edges: Edge[];
  lastNodeId: string | null;
  updatedAt: number;
}

const STORAGE_KEY = 'banfuly_ai_projects';

const defaultEdgeOptions = {
  type: 'default',
  animated: false,
  style: {
    stroke: '#333',
    strokeWidth: 1,
  },
};

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
  }
};

interface WorkflowCanvasProps {
  userApiKey?: string;
  user?: User | null;
  onDeductCredit?: (amount: number) => Promise<boolean>;
}

export const WorkflowCanvas: React.FC<WorkflowCanvasProps> = ({ 
  userApiKey,
  user,
  onDeductCredit
}) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [showProjectMenu, setShowProjectMenu] = useState(false);
  
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(true);
  const [lastNodeId, setLastNodeId] = useState<string | null>(null);
  const genBarRef = useRef<GenerationBarRef>(null);
  const rfInstance = useRef<ReactFlowInstance | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load projects on mount
  useEffect(() => {
    console.log('BANFULY-AI v1.0.2 initialized');
    const init = async () => {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as Project[];
          setProjects(parsed);
          if (parsed.length > 0) {
            await loadProject(parsed[0]);
          } else {
            createNewProject('默认项目');
          }
        } catch (e) {
          console.error('Failed to load projects', e);
          createNewProject('默认项目');
        }
      } else {
        createNewProject('默认项目');
      }

      const verifyKey = async () => {
        const ok = await checkApiKey();
        setHasApiKey(ok);
      };
      verifyKey();
    };
    init();
  }, []);

  // Auto-save current project
  useEffect(() => {
    if (!currentProjectId) return;
    
    const timer = setTimeout(() => {
      saveCurrentProject();
    }, 1000);

    return () => clearTimeout(timer);
  }, [nodes, edges, lastNodeId]);

  const createNewProject = (name: string = `新项目 ${Date.now().toString().slice(-4)}`) => {
    const newProject: Project = {
      id: `proj-${Date.now()}`,
      name,
      nodes: [],
      edges: [],
      lastNodeId: null,
      updatedAt: Date.now(),
    };
    
    const updatedProjects = [newProject, ...projects];
    setProjects(updatedProjects);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedProjects));
    } catch (e) {
      console.error('Failed to save projects to localStorage', e);
    }
    loadProject(newProject);
  };

  const loadProject = async (project: Project) => {
    setCurrentProjectId(project.id);
    
    // Hydrate nodes with images from IndexedDB
    const hydratedNodes = await Promise.all((project.nodes || []).map(async (node) => {
      const nodeData = node.data as ImageNodeData;
      if (nodeData.imageUrl?.startsWith('db://')) {
        const imageId = nodeData.imageUrl.replace('db://', '');
        const realUrl = await ImageStorage.get(imageId);
        return {
          ...node,
          data: {
            ...nodeData,
            imageUrl: realUrl || undefined
          }
        };
      }
      return node;
    }));

    setNodes(hydratedNodes);
    setEdges(project.edges || []);
    setLastNodeId(project.lastNodeId || null);
    setShowProjectMenu(false);
  };

  const saveCurrentProject = async () => {
    if (!currentProjectId) return;
    
    // Extract images to IndexedDB and store references in localStorage
    const nodesToSave = await Promise.all(nodes.map(async (node) => {
      const nodeData = node.data as ImageNodeData;
      if (nodeData.imageUrl && !nodeData.imageUrl.startsWith('db://')) {
        const imageId = `img-${node.id}`;
        await ImageStorage.set(imageId, nodeData.imageUrl);
        return {
          ...node,
          data: {
            ...nodeData,
            imageUrl: `db://${imageId}`
          }
        };
      }
      return node;
    }));

    setProjects(prev => {
      const updated = prev.map(p => {
        if (p.id === currentProjectId) {
          return {
            ...p,
            nodes: nodesToSave,
            edges,
            lastNodeId,
            updatedAt: Date.now(),
          };
        }
        return p;
      });
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to save current project to localStorage', e);
      }
      return updated;
    });
  };

  const deleteProject = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = projects.filter(p => p.id !== id);
    setProjects(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to update projects in localStorage after deletion', e);
    }
    
    if (currentProjectId === id) {
      if (updated.length > 0) {
        loadProject(updated[0]);
      } else {
        createNewProject('默认项目');
      }
    }
  };

  const exportProject = async (project: Project) => {
    try {
      // Ensure we have the latest data saved
      await saveCurrentProject();
      
      const images: Record<string, string> = {};
      for (const node of project.nodes) {
        const nodeData = node.data as ImageNodeData;
        if (nodeData.imageUrl?.startsWith('db://')) {
          const imageId = nodeData.imageUrl.replace('db://', '');
          const data = await ImageStorage.get(imageId);
          if (data) images[imageId] = data;
        }
      }

      const bundle = {
        version: '1.0',
        project: {
          ...project,
          id: `exported-${Date.now()}`, 
        },
        images
      };

      const blob = new Blob([JSON.stringify(bundle)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `BANFULY_Workflow_${project.name}_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Export failed', e);
      alert('导出失败');
    }
  };

  const importProject = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const bundle = JSON.parse(event.target?.result as string);
        if (!bundle.project || !bundle.images) throw new Error('Invalid format');

        // Save images to IndexedDB
        for (const [id, data] of Object.entries(bundle.images)) {
          await ImageStorage.set(id as string, data as string);
        }

        const newProject: Project = {
          ...bundle.project,
          id: `proj-${Date.now()}`,
          name: `${bundle.project.name} (导入)`,
          updatedAt: Date.now()
        };

        const updatedProjects = [newProject, ...projects];
        setProjects(updatedProjects);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedProjects));
        loadProject(newProject);
        alert('导入成功');
      } catch (err) {
        console.error('Import failed', err);
        alert('导入失败：文件格式不正确');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const currentProject = projects.find(p => p.id === currentProjectId);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const handleNodeDoubleClick: NodeMouseHandler = useCallback((event, node) => {
    const nodeData = node.data as ImageNodeData;
    if (nodeData.imageUrl && genBarRef.current) {
      const data = nodeData.imageUrl.split(',')[1];
      const mimeType = nodeData.imageUrl.split(';')[0].split(':')[1];
      genBarRef.current.addImage(data, mimeType, nodeData.imageUrl, node.id);
    }
  }, []);

  const findSafePosition = (x: number, y: number, currentNodes: Node[]) => {
    const finalX = x;
    let finalY = y;
    let collision = true;
    let attempts = 0;
    
    while (collision && attempts < 20) {
      collision = currentNodes.some(n => 
        Math.abs(n.position.x - finalX) < 350 && 
        Math.abs(n.position.y - finalY) < 400
      );
      if (collision) {
        finalY += 450;
      }
      attempts++;
    }
    return { x: finalX, y: finalY };
  };

  const handleGenerate = async (
    prompt: string, 
    aspectRatio: AspectRatio, 
    imageSize: ImageSize, 
    model: ImageModel,
    images?: { data: string; mimeType: string; sourceNodeId?: string }[]
  ) => {
    setIsGenerating(true);
    const newNodeId = `node-${Date.now()}`;
    
    // Separate images into those from existing nodes and those that are new uploads
    const existingSourceIds = (images || [])
      .filter(img => img.sourceNodeId)
      .map(img => img.sourceNodeId as string);
    
    const newUploads = (images || []).filter(img => !img.sourceNodeId);
    
    // Create source nodes ONLY for new uploads
    const newSourceNodes: Node<ImageNodeData>[] = newUploads.map((img, i) => {
      let basePosX = 100;
      let basePosY = 100;
      
      if (nodes.length > 0) {
        const lastNode = nodes[nodes.length - 1];
        basePosX = lastNode.position.x;
        basePosY = lastNode.position.y + 400;
      }
      
      const pos = findSafePosition(basePosX, basePosY + i * 400, nodes);
      
      return {
        id: `upload-${newNodeId}-${i}`,
        type: 'imageNode',
        position: pos,
        data: {
          prompt: 'Uploaded Reference',
          imageUrl: `data:${img.mimeType};base64,${img.data}`,
          type: 'source',
          onDelete: () => {
            setNodes((nds) => nds.filter((n) => n.id !== `upload-${newNodeId}-${i}`));
            setEdges((eds) => eds.filter((e) => e.source !== `upload-${newNodeId}-${i}` && e.target !== `upload-${newNodeId}-${i}`));
          }
        },
      };
    });

    // Calculate position for the new node
    let posX = 100;
    let posY = 100;

    if (existingSourceIds.length > 0 || newSourceNodes.length > 0) {
      // Position to the right of sources
      const sourceNodesInCanvas = nodes.filter(n => existingSourceIds.includes(n.id));
      const allSources = [...sourceNodesInCanvas, ...newSourceNodes];
      
      if (allSources.length > 0) {
        posX = Math.max(...allSources.map(n => n.position.x)) + 400;
        posY = allSources.reduce((acc, n) => acc + n.position.y, 0) / allSources.length;
      }
    } else if (nodes.length > 0) {
      // If no sources, place it below the last node
      const lastNode = nodes[nodes.length - 1];
      posX = lastNode.position.x;
      posY = lastNode.position.y + 450;
    }

    const safePos = findSafePosition(posX, posY, [...nodes, ...newSourceNodes]);
    posX = safePos.x;
    posY = safePos.y;

    const newNode: Node<ImageNodeData> = {
      id: newNodeId,
      type: 'imageNode',
      position: { x: posX, y: posY },
      data: {
        prompt,
        isLoading: true,
        type: 'generated',
        refImages: images?.map(img => `data:${img.mimeType};base64,${img.data}`),
        aspectRatio,
        imageSize,
        model,
        resolution: (() => {
          const base = imageSize === '512px' ? 512 : imageSize === '1K' ? 1024 : imageSize === '2K' ? 2048 : 4096;
          if (aspectRatio === '1:1') return `${base} x ${base}`;
          if (aspectRatio === '16:9') return `${base} x ${Math.round(base * 9 / 16)}`;
          if (aspectRatio === '9:16') return `${Math.round(base * 9 / 16)} x ${base}`;
          if (aspectRatio === '4:3') return `${base} x ${Math.round(base * 3 / 4)}`;
          if (aspectRatio === '3:4') return `${Math.round(base * 3 / 4)} x ${base}`;
          return `${base} x ${base}`;
        })(),
        onDelete: () => {
          setNodes((nds) => nds.filter((n) => n.id !== newNodeId));
          setEdges((eds) => eds.filter((e) => e.source !== newNodeId && e.target !== newNodeId));
        },
        onRegenerate: () => {
          handleGenerate(prompt, aspectRatio, imageSize, model, images);
        },
        onAdjust: () => {
          if (genBarRef.current) {
            genBarRef.current.setParams(
              prompt, 
              aspectRatio, 
              imageSize, 
              model, 
              images?.map(img => ({ 
                data: img.data, 
                mimeType: img.mimeType, 
                preview: `data:${img.mimeType};base64,${img.data}`,
                sourceNodeId: img.sourceNodeId 
              }))
            );
          }
        }
      },
    };

    setNodes((nds) => [...nds, ...newSourceNodes, newNode]);

    // Create edges from ALL sources (existing and new)
    const newEdges: Edge[] = [
      ...existingSourceIds.map(sid => ({
        id: `edge-${sid}-${newNodeId}`,
        source: sid,
        target: newNodeId,
      })),
      ...newSourceNodes.map(sn => ({
        id: `edge-${sn.id}-${newNodeId}`,
        source: sn.id,
        target: newNodeId,
      }))
    ];

    if (newEdges.length > 0) {
      setEdges((eds) => [...eds, ...newEdges]);
    }

    setLastNodeId(newNodeId);

    // Check credits
    const modelCfg = MODEL_COSTS[model];
    const lookupId = imageSize === "512px" ? "0.5K" : imageSize;
    const cost = modelCfg?.resolutions[lookupId]?.rmb || 0;

    if (user && user.credits < cost) {
      alert(`点数不足，本次生成需要 ${cost} 点，当前剩余 ${user.credits} 点`);
      setNodes((nds) => nds.filter(n => n.id !== newNodeId));
      setEdges((eds) => eds.filter(e => e.target !== newNodeId));
      return;
    }

    try {
      const urls = await generateImage({ 
        prompt, 
        aspectRatio, 
        imageSize, 
        model, 
        images: images?.map(img => ({ data: img.data, mimeType: img.mimeType })),
        apiKey: userApiKey
      });
      
      // Deduct credit on success
      if (onDeductCredit) {
        await onDeductCredit(cost);
      }

      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === newNodeId) {
            return {
              ...node,
              data: {
                ...node.data,
                isLoading: false,
                imageUrl: urls[0],
              },
            };
          }
          return node;
        })
      );
    } catch (err: unknown) {
      const error = err as Error;
      console.error(error);
      const isKeyError = error.message === "API_KEY_REQUIRED";
      if (isKeyError) {
        setHasApiKey(false);
      }
      
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === newNodeId) {
            return {
              ...node,
              data: {
                ...node.data,
                isLoading: false,
                error: isKeyError ? "API Key required" : "Generation failed",
              },
            };
          }
          return node;
        })
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleOpenApiKey = async () => {
    await openApiKeyDialog();
    setHasApiKey(true);
  };

  return (
    <div className="w-full h-full bg-[#0a0a0a] relative overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDoubleClick={handleNodeDoubleClick}
        onInit={(instance) => { rfInstance.current = instance; }}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        colorMode="dark"
        style={{ width: '100%', height: '100%' }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#333" />
        <Controls />
        
        <Panel position="top-left" className="flex items-center gap-4 p-4">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center shadow-[0_0_20px_rgba(220,38,38,0.4)]">
                <span className="text-white font-black text-xl leading-none">B</span>
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold tracking-tight">BANFULY-AI</span>
                  <span className="px-1.5 py-0.5 bg-yellow-500/20 text-yellow-500 text-[10px] font-bold rounded uppercase">体验版 v1.0.2</span>
                </div>
                <span className="text-[10px] text-gray-500 font-medium uppercase tracking-widest">Workflow Engine</span>
              </div>
            </div>

            {/* Project Management UI */}
            <div className="relative">
              <button 
                onClick={() => setShowProjectMenu(!showProjectMenu)}
                className="flex items-center gap-3 px-4 py-2 bg-[#1a1a1a] border border-[#333] rounded-xl hover:bg-[#222] transition-all group"
              >
                <div className="flex flex-col items-start">
                  <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">当前项目</span>
                  <span className="text-sm font-bold text-gray-200">{currentProject?.name || '未命名项目'}</span>
                </div>
                <ChevronDown size={16} className={cn("text-gray-500 transition-transform", showProjectMenu && "rotate-180")} />
              </button>

              <AnimatePresence>
                {showProjectMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute top-full left-0 mt-2 w-64 bg-[#1a1a1a] border border-[#333] rounded-2xl shadow-2xl overflow-hidden z-[100] py-2 backdrop-blur-xl"
                  >
                    <div className="px-4 py-2 flex items-center justify-between border-b border-[#333] mb-2">
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">项目列表</span>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => fileInputRef.current?.click()}
                          className="p-1.5 bg-[#333] text-gray-300 rounded-lg hover:bg-[#444] transition-all"
                          title="导入项目"
                        >
                          <Upload size={14} />
                        </button>
                        <button 
                          onClick={() => createNewProject()}
                          className="p-1.5 bg-red-600 text-white rounded-lg hover:scale-110 transition-transform"
                          title="新建项目"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                    
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={importProject} 
                      accept=".json" 
                      className="hidden" 
                    />

                    <div className="max-h-64 overflow-y-auto px-2 space-y-1">
                      {projects.map(p => (
                        <div 
                          key={p.id}
                          onClick={() => loadProject(p)}
                          className={cn(
                            "flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-all group",
                            currentProjectId === p.id ? "bg-red-600/10 text-red-600" : "hover:bg-[#222] text-gray-400"
                          )}
                        >
                          <div className="flex flex-col overflow-hidden">
                            <span className="text-sm font-bold truncate">{p.name}</span>
                            <span className="text-[9px] opacity-50">{new Date(p.updatedAt).toLocaleString()}</span>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                            <button 
                              onClick={(e) => { e.stopPropagation(); exportProject(p); }}
                              className="p-1.5 hover:bg-blue-500/20 hover:text-blue-500 rounded-lg"
                              title="导出"
                            >
                              <Download size={14} />
                            </button>
                            <button 
                              onClick={(e) => deleteProject(p.id, e)}
                              className="p-1.5 hover:bg-red-500/20 hover:text-red-500 rounded-lg"
                              title="删除"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                      <div className="h-px bg-[#333] my-1.5 mx-2" />
                      <button 
                        onClick={async () => {
                            if (confirm('确定要清空所有项目数据吗？此操作不可撤销。')) {
                              localStorage.removeItem(STORAGE_KEY);
                              await ImageStorage.clear();
                              window.location.reload();
                            }
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 size={14} />
                        <span>重置所有数据</span>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </Panel>


      </ReactFlow>

      <GenerationBar 
        ref={genBarRef}
        onGenerate={handleGenerate} 
        isGenerating={isGenerating} 
        hasApiKey={hasApiKey}
        onOpenApiKey={handleOpenApiKey}
      />
    </div>
  );
};
