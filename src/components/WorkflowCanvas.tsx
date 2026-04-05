import React, { useCallback, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
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
  SelectionMode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ImageNode, ImageNodeData } from './ImageNode';
import { NoteNode, NoteNodeData } from './NoteNode';
import { GenerationBar, GenerationBarRef } from './GenerationBar';
import { Assistant, AssistantRef } from './Assistant';
import { generateImage, AspectRatio, ImageSize, ImageModel, checkApiKey, openApiKeyDialog } from '../lib/gemini';
import { ImageStorage } from '../lib/storage';
import { Trash2, ChevronDown, Plus, Download, Upload, Edit2, FileText, Clipboard } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { User } from '../types';

const nodeTypes = {
  imageNode: ImageNode,
  noteNode: NoteNode,
};

interface Project {
  id: string;
  name: string;
  nodes: Node[];
  edges: Edge[];
  lastNodeId: string | null;
  updatedAt: number;
  version?: number;
}

const STORAGE_KEY = 'banfuly_ai_projects';

const defaultEdgeOptions = {
  type: 'default',
  animated: false,
  style: {
    stroke: '#555',
    strokeWidth: 2,
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
  const [hasApiKey, setHasApiKey] = useState(true);
  const [lastNodeId, setLastNodeId] = useState<string | null>(null);
  const [renamingProject, setRenamingProject] = useState<{ id: string, name: string } | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);
  const [paneMenu, setPaneMenu] = useState<{ show: boolean; x: number; y: number } | null>(null);
  const selectedNodes = nodes.filter(n => n.selected);
  
  const genBarRef = useRef<GenerationBarRef>(null);
  const assistantRef = useRef<AssistantRef>(null);
  const rfInstance = useRef<ReactFlowInstance | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const nodesRef = useRef<Node[]>([]);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  // Load projects on mount
  useEffect(() => {
    console.log('BANFULY-AI v1.0.2 initialized');
    console.log('Current projects in state:', projects);
    const init = async () => {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as Project[];
          
          // Migration: Move large data from localStorage to IndexedDB
          let changed = false;
          const migrated = await Promise.all(parsed.map(async (project) => {
            let projectChanged = false;
            const migratedNodes = await Promise.all((project.nodes || []).map(async (node) => {
              const nodeData = node.data as ImageNodeData;
              const newNodeData = { ...nodeData };
              let nodeChanged = false;

              // Extract imageUrl
              if (nodeData.imageUrl && !nodeData.imageUrl.startsWith('db://') && nodeData.imageUrl.startsWith('data:')) {
                const imageId = `img-${node.id}`;
                await ImageStorage.set(imageId, nodeData.imageUrl);
                newNodeData.imageUrl = `db://${imageId}`;
                nodeChanged = true;
              }

              // Extract originalImages
              if (nodeData.originalImages) {
                newNodeData.originalImages = await Promise.all(nodeData.originalImages.map(async (img, idx) => {
                  if (img.data && !img.data.startsWith('db://')) {
                    const imageId = `orig-${node.id}-${idx}`;
                    await ImageStorage.set(imageId, img.data);
                    nodeChanged = true;
                    return { ...img, data: `db://${imageId}` };
                  }
                  return img;
                }));
              }

              // Remove refImages
              if (newNodeData.refImages) {
                delete newNodeData.refImages;
                nodeChanged = true;
              }

              if (nodeChanged) {
                projectChanged = true;
                return { ...node, data: newNodeData };
              }
              return node;
            }));

            if (projectChanged) {
              changed = true;
              return { ...project, nodes: migratedNodes };
            }
            return project;
          }));

          const finalProjects = changed ? migrated : parsed;
          if (changed) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(finalProjects));
          }

          setProjects(finalProjects);
          if (finalProjects.length > 0) {
            await loadProject(finalProjects[0]);
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
      version: 1,
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

  const renameProject = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const project = projects.find(p => p.id === id);
    if (!project) return;
    setRenamingProject({ id: project.id, name: project.name });
  };

  const handleConfirmRename = () => {
    if (!renamingProject) return;
    const trimmedName = renamingProject.name.trim();
    if (trimmedName) {
      setProjects(prev => {
        const updated = prev.map(p => p.id === renamingProject.id ? { ...p, name: trimmedName, updatedAt: Date.now() } : p);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        return updated;
      });
    }
    setRenamingProject(null);
  };

  const handleResetAll = async () => {
    localStorage.removeItem(STORAGE_KEY);
    await ImageStorage.clear();
    window.location.reload();
  };

  const handleBatchDelete = () => {
    if (selectedNodes.length === 0) return;
    setShowBatchDeleteConfirm(true);
  };

  const confirmBatchDelete = () => {
    const selectedIds = new Set(selectedNodes.map(n => n.id));
    setNodes(nds => nds.filter(n => !selectedIds.has(n.id)));
    setEdges(eds => eds.filter(e => !selectedIds.has(e.source) && !selectedIds.has(e.target)));
    setShowBatchDeleteConfirm(false);
  };

  const handleBatchAddToGenBar = () => {
    if (selectedNodes.length === 0 || !genBarRef.current) return;
    
    selectedNodes.forEach(node => {
      const nodeData = node.data as ImageNodeData;
      if (nodeData.imageUrl) {
        const data = nodeData.imageUrl.split(',')[1];
        const mimeType = nodeData.imageUrl.split(';')[0].split(':')[1];
        genBarRef.current?.addImage(data, mimeType, nodeData.imageUrl, node.id);
      }
    });
  };

  const loadProject = async (project: Project) => {
    setCurrentProjectId(project.id);
    
    // Hydrate nodes with images from IndexedDB
    const hydratedNodes = await Promise.all((project.nodes || []).map(async (node) => {
      if (node.type === 'noteNode') {
        return attachNodeActions(node);
      }

      const nodeData = node.data as ImageNodeData;
      const newNodeData = { ...nodeData };

      // Hydrate imageUrl
      if (nodeData.imageUrl?.startsWith('db://')) {
        const imageId = nodeData.imageUrl.replace('db://', '');
        const realUrl = await ImageStorage.get(imageId);
        newNodeData.imageUrl = realUrl || undefined;
      }

      // Hydrate originalImages
      if (nodeData.originalImages) {
        newNodeData.originalImages = await Promise.all(nodeData.originalImages.map(async (img) => {
          if (img.data.startsWith('db://')) {
            const imageId = img.data.replace('db://', '');
            const realData = await ImageStorage.get(imageId);
            return { ...img, data: realData || '' };
          }
          return img;
        }));
      }

      // Re-derive refImages if needed
      if (newNodeData.originalImages) {
        newNodeData.refImages = newNodeData.originalImages.map(img => 
          img.data ? `data:${img.mimeType};base64,${img.data}` : ''
        ).filter(Boolean);
      }

      return attachNodeActions({
        ...node,
        data: newNodeData
      });
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
      if (node.type === 'noteNode') {
        const nodeData = node.data as NoteNodeData;
        const newNodeData = { ...nodeData };
        delete newNodeData.onDelete;
        delete newNodeData.onChange;
        return { ...node, data: newNodeData };
      }

      const nodeData = node.data as ImageNodeData;
      const newNodeData = { ...nodeData };
      
      // Remove functions and other non-serializable data
      delete newNodeData.onDelete;
      delete newNodeData.onRegenerate;
      delete newNodeData.onAdjust;
      delete newNodeData.onSendToAssistant;

      // Extract imageUrl
      if (nodeData.imageUrl && !nodeData.imageUrl.startsWith('db://')) {
        const imageId = `img-${node.id}`;
        await ImageStorage.set(imageId, nodeData.imageUrl);
        newNodeData.imageUrl = `db://${imageId}`;
      }

      // Extract originalImages data
      if (nodeData.originalImages) {
        newNodeData.originalImages = await Promise.all(nodeData.originalImages.map(async (img, idx) => {
          if (img.data && !img.data.startsWith('db://')) {
            const imageId = `orig-${node.id}-${idx}`;
            await ImageStorage.set(imageId, img.data);
            return { ...img, data: `db://${imageId}` };
          }
          return img;
        }));
      }

      // Remove refImages as it's redundant and large
      delete newNodeData.refImages;

      return {
        ...node,
        data: newNodeData
      };
    }));

    setProjects(prev => {
      const updated = prev.map(p => {
        if (p.id === currentProjectId) {
          // Increment version on modification
          const currentVersion = p.version || 0;
          return {
            ...p,
            nodes: nodesToSave,
            edges,
            lastNodeId,
            updatedAt: Date.now(),
            version: currentVersion + 1
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

  const attachNodeActions = useCallback((node: Node): Node => {
    if (node.type === 'noteNode') {
      const nodeData = node.data as NoteNodeData;
      return {
        ...node,
        data: {
          ...nodeData,
          onDelete: () => {
            setNodes((nds) => nds.filter((n) => n.id !== node.id));
          },
          onChange: (title: string, content: string) => {
            setNodes((nds) => nds.map(n => n.id === node.id ? {
              ...n,
              data: { ...n.data, title, content }
            } : n));
          }
        }
      };
    }

    const nodeData = node.data as ImageNodeData;
    
    // Recovery logic for legacy nodes
    const originalImages = nodeData.originalImages || nodeData.refImages?.map(img => {
      const match = img.match(/^data:([^;]+);base64,(.+)$/);
      return {
        data: match ? match[2] : '',
        mimeType: match ? match[1] : 'image/png',
      };
    });

    return {
      ...node,
      data: {
        ...nodeData,
        onDelete: () => {
          setNodes((nds) => nds.filter((n) => n.id !== node.id));
          setEdges((eds) => eds.filter((e) => e.source !== node.id && e.target !== node.id));
        },
        onRegenerate: nodeData.type === 'generated' ? () => {
          console.log(`[Workflow] Regenerating node ${node.id}`);
          handleGenerateRef.current(
            nodeData.prompt, 
            nodeData.aspectRatio || '1:1', 
            nodeData.imageSize || '1K', 
            nodeData.model || 'gemini-3.1-flash-image-preview', 
            originalImages, 
            node.id
          );
        } : undefined,
        onAdjust: nodeData.type === 'generated' ? () => {
          console.log(`[Workflow] Adjusting node ${node.id}`);
          if (genBarRef.current) {
            genBarRef.current.setParams(
              nodeData.prompt, 
              nodeData.aspectRatio || '1:1', 
              nodeData.imageSize || '1K', 
              nodeData.model || 'gemini-3.1-flash-image-preview', 
              originalImages?.map(img => ({ 
                data: img.data, 
                mimeType: img.mimeType, 
                preview: `data:${img.mimeType};base64,${img.data}`,
                sourceNodeId: img.sourceNodeId 
              }))
            );
          }
        } : undefined,
        onSendToAssistant: nodeData.imageUrl ? () => {
          if (assistantRef.current) {
            const match = nodeData.imageUrl!.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              assistantRef.current.sendImage(match[2], match[1], nodeData.imageUrl!);
            } else {
              assistantRef.current.open();
            }
          }
        } : undefined
      }
    };
  }, [setNodes, setEdges]);

  const onPaneContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    setPaneMenu({
      show: true,
      x: event.clientX,
      y: event.clientY,
    });
  }, []);

  const handleCreateNote = useCallback(() => {
    if (!paneMenu) return;
    const position = rfInstance.current?.screenToFlowPosition({
      x: paneMenu.x,
      y: paneMenu.y,
    }) || { x: 0, y: 0 };

    const newNodeId = `note-${Date.now()}`;
    const newNode = attachNodeActions({
      id: newNodeId,
      type: 'noteNode',
      position,
      data: {
        title: '操作说明',
        content: '',
      },
    });

    setNodes((nds) => [...nds, newNode]);
    setPaneMenu(null);
  }, [paneMenu, attachNodeActions, setNodes]);

  const handleBatchImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files) return;

      const position = paneMenu ? rfInstance.current?.screenToFlowPosition({
        x: paneMenu.x,
        y: paneMenu.y,
      }) : { x: 100, y: 100 };

      let currentX = position?.x || 100;
      let currentY = position?.y || 100;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const reader = new FileReader();
        reader.onload = async (event) => {
          const base64 = event.target?.result as string;
          const newNodeId = `import-${Date.now()}-${i}`;
          
          const newNode = attachNodeActions({
            id: newNodeId,
            type: 'imageNode',
            position: { x: currentX, y: currentY },
            data: {
              prompt: file.name,
              imageUrl: base64,
              type: 'source',
            },
          });

          setNodes((nds) => [...nds, newNode]);
        };
        reader.readAsDataURL(file);
        
        currentX += 350;
        if ((i + 1) % 3 === 0) {
          currentX = position?.x || 100;
          currentY += 450;
        }
      }
      setPaneMenu(null);
    };
    input.click();
  }, [paneMenu, attachNodeActions, setNodes]);

  useEffect(() => {
    const handlePaste = async (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.indexOf('image') !== -1) {
          const file = item.getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = async (e) => {
              const base64 = e.target?.result as string;
              
              const position = rfInstance.current?.screenToFlowPosition({
                x: window.innerWidth / 2,
                y: window.innerHeight / 2,
              }) || { x: 0, y: 0 };
              
              const newNodeId = `paste-${Date.now()}`;
              const newNode = attachNodeActions({
                id: newNodeId,
                type: 'imageNode',
                position,
                data: {
                  prompt: 'Pasted Image',
                  imageUrl: base64,
                  type: 'source',
                },
              });
              
              setNodes((nds) => [...nds, newNode]);
            };
            reader.readAsDataURL(file);
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [attachNodeActions, setNodes]);

  useEffect(() => {
    const handleClickOutside = () => setPaneMenu(null);
    if (paneMenu?.show) {
      window.addEventListener('click', handleClickOutside);
    }
    return () => window.removeEventListener('click', handleClickOutside);
  }, [paneMenu]);

  const handleGenerate = useCallback(async (
    prompt: string, 
    aspectRatio: AspectRatio, 
    imageSize: ImageSize, 
    model: ImageModel,
    images?: { data: string; mimeType: string; sourceNodeId?: string }[],
    targetNodeId?: string
  ) => {
    // Calculate cost
    const modelCfg = MODEL_COSTS[model];
    const lookupId = imageSize === "512px" ? "0.5K" : imageSize;
    const cost = modelCfg?.resolutions[lookupId]?.rmb || 0;

    if (user && user.credits < cost) {
      alert(`点数不足，本次生成需要 ${cost} 点，当前剩余 ${user.credits} 点`);
      return;
    }

    if (targetNodeId) {
      // Update existing node to loading state
      setNodes((nds) => nds.map(n => n.id === targetNodeId ? {
        ...n,
        data: { ...n.data, isLoading: true, error: undefined }
      } : n));

      console.log(`[Workflow] Starting regeneration for node ${targetNodeId}`, { prompt, aspectRatio, imageSize, model, imagesCount: images?.length });

      try {
        const urls = await generateImage({ 
          prompt, 
          aspectRatio, 
          imageSize, 
          model, 
          images: images?.map(img => ({ data: img.data, mimeType: img.mimeType })),
          apiKey: userApiKey
        });
        console.log(`[Workflow] Regeneration success for node ${targetNodeId}`, { url: urls[0] });
        
        if (onDeductCredit) {
          await onDeductCredit(cost);
        }

        setNodes((nds) => nds.map(n => n.id === targetNodeId ? attachNodeActions({
          ...n,
          data: { ...n.data, isLoading: false, imageUrl: urls[0] }
        }) : n));
      } catch (err: unknown) {
        const error = err as Error;
        console.error(`[Workflow] Regeneration failed for node ${targetNodeId}:`, error);
        setNodes((nds) => nds.map(n => n.id === targetNodeId ? {
          ...n,
          data: { ...n.data, isLoading: false, error: error.message }
        } : n));
      }
      return;
    }

    const newNodeId = `node-${Date.now()}`;
    
    // Separate images into those from existing nodes and those that are new uploads
    const existingSourceIds = (images || [])
      .filter(img => img.sourceNodeId)
      .map(img => img.sourceNodeId as string);
    
    const newUploads = (images || []).filter(img => !img.sourceNodeId);
    
    const currentNodes = nodesRef.current;

    // Create source nodes ONLY for new uploads
    const newSourceNodes: Node<ImageNodeData>[] = newUploads.map((img, i) => {
      const sourceId = `upload-${newNodeId}-${i}`;
      // Update the original image object with the new source ID
      // This ensures that if we "Adjust" this node later, it knows its sources are already nodes
      const imgIdx = (images || []).findIndex(orig => orig.data === img.data && !orig.sourceNodeId);
      if (imgIdx !== -1 && images) {
        images[imgIdx].sourceNodeId = sourceId;
      }

      let basePosX = 100;
      let basePosY = 100;
      
      if (currentNodes.length > 0) {
        const lastNode = currentNodes[currentNodes.length - 1];
        basePosX = lastNode.position.x;
        basePosY = lastNode.position.y + 400;
      }
      
      const pos = findSafePosition(basePosX, basePosY + i * 400, currentNodes);
      
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
      const sourceNodesInCanvas = currentNodes.filter(n => existingSourceIds.includes(n.id));
      const allSources = [...sourceNodesInCanvas, ...newSourceNodes];
      
      if (allSources.length > 0) {
        posX = Math.max(...allSources.map(n => n.position.x)) + 400;
        posY = allSources.reduce((acc, n) => acc + n.position.y, 0) / allSources.length;
      }
    } else if (currentNodes.length > 0) {
      // If no sources, place it below the last node
      const lastNode = currentNodes[currentNodes.length - 1];
      posX = lastNode.position.x;
      posY = lastNode.position.y + 450;
    }

    const safePos = findSafePosition(posX, posY, [...currentNodes, ...newSourceNodes]);
    posX = safePos.x;
    posY = safePos.y;

    const newNode: Node<ImageNodeData> = attachNodeActions({
      id: newNodeId,
      type: 'imageNode',
      position: { x: posX, y: posY },
      data: {
        prompt,
        isLoading: true,
        type: 'generated',
        refImages: images?.map(img => `data:${img.mimeType};base64,${img.data}`),
        originalImages: images,
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
      },
    });

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
    console.log(`[Workflow] Starting generation for node ${newNodeId}`, { prompt, aspectRatio, imageSize, model, imagesCount: images?.length });

    try {
      const urls = await generateImage({ 
        prompt, 
        aspectRatio, 
        imageSize, 
        model, 
        images: images?.map(img => ({ data: img.data, mimeType: img.mimeType })),
        apiKey: userApiKey
      });
      console.log(`[Workflow] Generation success for node ${newNodeId}`, { url: urls[0] });
      
      // Deduct credit on success
      if (onDeductCredit) {
        await onDeductCredit(cost);
      }

      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === newNodeId) {
            return attachNodeActions({
              ...node,
              data: {
                ...node.data,
                isLoading: false,
                imageUrl: urls[0],
              },
            });
          }
          return node;
        })
      );
    } catch (err: unknown) {
      const error = err as Error;
      console.error(`[Workflow] Generation failed for node ${newNodeId}:`, error);
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
                error: isKeyError ? "API Key required" : error.message,
              },
            };
          }
          return node;
        })
      );
    }
  }, [user, userApiKey, onDeductCredit, findSafePosition, attachNodeActions]);

  const handleGenerateRef = useRef(handleGenerate);
  useEffect(() => {
    handleGenerateRef.current = handleGenerate;
  }, [handleGenerate]);

  const handleOpenApiKey = async () => {
    await openApiKeyDialog();
    setHasApiKey(true);
  };

  // Hydrate nodes with actions when project changes or handleGenerate is ready
  useEffect(() => {
    if (!currentProjectId || !handleGenerateRef.current) return;
    
    setNodes(nds => nds.map(node => {
      // If actions are already attached and onSendToAssistant is correctly set, skip
      if (node.data.onDelete && (node.data.imageUrl ? !!node.data.onSendToAssistant : true)) return node;
      return attachNodeActions(node);
    }));
  }, [currentProjectId, attachNodeActions]);

  return (
    <div className="w-full h-full bg-[#1a1a1a] relative overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDoubleClick={handleNodeDoubleClick}
        onInit={(instance) => { rfInstance.current = instance; }}
        onPaneContextMenu={onPaneContextMenu}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        selectionOnDrag
        selectionMode={SelectionMode.Partial}
        panOnScroll
        selectionKeyCode="Shift"
        multiSelectionKeyCode="Control"
        fitView
        colorMode="dark"
        style={{ width: '100%', height: '100%' }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} color="#333" />
        <Controls />

        <AnimatePresence>
          {selectedNodes.length > 1 && (
            <Panel position="bottom-center" className="mb-24">
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.9 }}
                className="bg-[#1a1a1a]/90 backdrop-blur-xl border border-red-600/30 rounded-2xl p-2 shadow-2xl flex items-center gap-2"
              >
                <div className="px-4 py-2 border-r border-[#333] mr-2">
                  <span className="text-xs font-bold text-white">已选中 {selectedNodes.length} 个节点</span>
                </div>
                
                <button
                  onClick={handleBatchAddToGenBar}
                  className="flex items-center gap-2 px-4 py-2.5 bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 rounded-xl text-xs font-bold transition-all"
                >
                  <Plus size={14} />
                  批量作为参考图
                </button>

                <button
                  onClick={handleBatchDelete}
                  className="flex items-center gap-2 px-4 py-2.5 bg-red-600/20 text-red-500 hover:bg-red-600/30 rounded-xl text-xs font-bold transition-all"
                >
                  <Trash2 size={14} />
                  批量删除
                </button>
              </motion.div>
            </Panel>
          )}
        </AnimatePresence>

        {/* Pane Context Menu */}
        {paneMenu && createPortal(
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              style={{ 
                position: 'fixed', 
                left: paneMenu.x, 
                top: paneMenu.y,
                zIndex: 10000 
              }}
              className="w-56 bg-[#1a1a1a] border border-[#333] rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden py-1.5 backdrop-blur-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-widest">新建 / CREATE</div>
              <button 
                onClick={handleCreateNote}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-[#333] hover:text-white transition-colors"
              >
                <FileText size={16} className="text-blue-400" />
                <span>新建工作流说明</span>
              </button>
              <div className="h-px bg-[#333] my-1.5 mx-2" />
              <div className="px-4 py-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-widest">导入 / IMPORT</div>
              <button 
                onClick={handleBatchImport}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-[#333] hover:text-white transition-colors"
              >
                <Upload size={16} className="text-red-600" />
                <span>批量导入素材</span>
              </button>
              <button 
                onClick={() => {
                  setPaneMenu(null);
                  alert('请直接使用 Ctrl+V 粘贴图片到画布');
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-[#333] hover:text-white transition-colors"
              >
                <Clipboard size={16} className="text-green-500" />
                <span>粘贴图片 (Ctrl+V)</span>
              </button>
            </motion.div>
          </AnimatePresence>,
          document.body
        )}
        
        <Panel position="top-left" className="flex items-center gap-4 p-4">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center shadow-[0_0_20px_rgba(220,38,38,0.4)]">
                <span className="text-white font-black text-xl leading-none">B</span>
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold tracking-tight text-white">BANFULY-AI</span>
                  <span className="px-1.5 py-0.5 bg-red-600/20 text-red-500 text-[10px] font-bold rounded uppercase">Pro版 v1.0.{currentProject?.version || 0}</span>
                </div>
                <span className="text-[10px] text-gray-500 font-medium uppercase tracking-widest">Workflow Engine</span>
              </div>
            </div>

            {/* Project Management UI */}
            <div className="relative">
              <div 
                onClick={() => setShowProjectMenu(!showProjectMenu)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setShowProjectMenu(!showProjectMenu); }}
                role="button"
                tabIndex={0}
                className="flex items-center gap-3 px-4 py-2 bg-[#1a1a1a] border border-[#333] rounded-xl hover:bg-[#222] transition-all group cursor-pointer outline-none focus:border-red-600/50"
              >
                <div className="flex flex-col items-start">
                  <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">当前项目</span>
                  <div className="flex items-center gap-2">
                    <div 
                      className="flex items-center gap-2 cursor-pointer group/name"
                      onClick={(e) => { e.stopPropagation(); if (currentProject) renameProject(currentProject.id, e); }}
                    >
                      <span className="text-sm font-bold text-gray-200 group-hover/name:text-white transition-colors">{currentProject?.name || '未命名项目'}</span>
                      <Edit2 size={10} className="text-gray-500 group-hover/name:text-red-500 transition-colors" />
                    </div>
                  </div>
                </div>
                <ChevronDown size={16} className={cn("text-gray-500 transition-transform", showProjectMenu && "rotate-180")} />
              </div>

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
                          <div 
                            className="flex flex-col overflow-hidden flex-1"
                            onClick={(e) => {
                              if (currentProjectId === p.id) {
                                e.stopPropagation();
                                renameProject(p.id, e);
                              }
                            }}
                          >
                            <span className="text-sm font-bold truncate">{p.name}</span>
                            <span className="text-[9px] opacity-50">{new Date(p.updatedAt).toLocaleString()}</span>
                          </div>
                          <div className={cn(
                            "flex items-center gap-1 transition-all",
                            currentProjectId === p.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                          )}>
                            <button 
                              onClick={(e) => renameProject(p.id, e)}
                              className="p-1.5 hover:bg-yellow-500/20 hover:text-yellow-500 rounded-lg"
                              title="重命名"
                            >
                              <Edit2 size={14} />
                            </button>
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
                        onClick={() => setShowResetConfirm(true)}
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
        hasApiKey={hasApiKey}
        onOpenApiKey={handleOpenApiKey}
      />

      <Assistant 
        ref={assistantRef} 
        userApiKey={userApiKey} 
        user={user}
        onDeductCredit={onDeductCredit}
      />

      <AnimatePresence>
        {renamingProject && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-[#1a1a1a] border border-[#333] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
            >
              <div className="p-6">
                <h3 className="text-lg font-bold text-white mb-1">重命名项目</h3>
                <p className="text-xs text-gray-500 mb-6 uppercase tracking-widest">请输入新的项目名称</p>
                
                <input 
                  autoFocus
                  type="text"
                  value={renamingProject.name}
                  onChange={(e) => setRenamingProject({ ...renamingProject, name: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConfirmRename();
                    if (e.key === 'Escape') setRenamingProject(null);
                  }}
                  className="w-full bg-[#222] border border-[#333] rounded-xl px-4 py-3 text-white focus:border-red-600/50 outline-none transition-all mb-6"
                  placeholder="项目名称..."
                />
                
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => setRenamingProject(null)}
                    className="flex-1 px-4 py-3 bg-[#222] text-gray-400 font-bold rounded-xl hover:bg-[#333] transition-all"
                  >
                    取消
                  </button>
                  <button 
                    onClick={handleConfirmRename}
                    className="flex-1 px-4 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-all shadow-[0_0_20px_rgba(220,38,38,0.3)]"
                  >
                    确认修改
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {showResetConfirm && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-[#1a1a1a] border border-[#333] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
            >
              <div className="p-6">
                <div className="w-12 h-12 bg-red-600/20 rounded-full flex items-center justify-center mb-4">
                  <Trash2 className="text-red-600" size={24} />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">重置所有数据？</h3>
                <p className="text-sm text-gray-400 mb-6">此操作将永久删除所有项目和生成的图片，且不可撤销。确定要继续吗？</p>
                
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => setShowResetConfirm(false)}
                    className="flex-1 px-4 py-3 bg-[#222] text-gray-400 font-bold rounded-xl hover:bg-[#333] transition-all"
                  >
                    取消
                  </button>
                  <button 
                    onClick={handleResetAll}
                    className="flex-1 px-4 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-all shadow-[0_0_20px_rgba(220,38,38,0.3)]"
                  >
                    确定重置
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {showBatchDeleteConfirm && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-[#1a1a1a] border border-[#333] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
            >
              <div className="p-6">
                <div className="w-12 h-12 bg-red-600/20 rounded-full flex items-center justify-center mb-4">
                  <Trash2 className="text-red-600" size={24} />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">批量删除节点？</h3>
                <p className="text-sm text-gray-400 mb-6">确定要删除选中的 {selectedNodes.length} 个节点吗？此操作不可撤销。</p>
                
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => setShowBatchDeleteConfirm(false)}
                    className="flex-1 px-4 py-3 bg-[#222] text-gray-400 font-bold rounded-xl hover:bg-[#333] transition-all"
                  >
                    取消
                  </button>
                  <button 
                    onClick={confirmBatchDelete}
                    className="flex-1 px-4 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-all shadow-[0_0_20px_rgba(220,38,38,0.3)]"
                  >
                    确定删除
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
