import React, { useCallback, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  ReactFlow,
  Controls,
  ControlButton,
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
import { MaskEditNode, type MaskEditNodeData } from './MaskEditNode';
import { NoteNode, NoteNodeData } from './NoteNode';
import { GenerationBar, GenerationBarRef } from './GenerationBar';
import { Assistant, AssistantRef } from './Assistant';
import { generateImage, analyzeImageForPrompt, getDefaultImageAnalysisTemplate, AspectRatio, ImageSize, ImageModel, checkApiKey, openApiKeyDialog } from '../lib/gemini';
import { ImageStorage } from '../lib/storage';
import { Trash2, ChevronDown, Plus, Download, Upload, Edit2, FileText, Clipboard, LocateFixed, Maximize2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { User } from '../types';
import { allocatePasteBatchOrigin, getBatchImportPosition, IMAGE_UPLOAD_LIMITS, processImageFiles } from '../lib/uploadProcessing';
import { advanceGenerationGrid, findDerivedNodePosition, findFreeGenerationPosition, findFreeGridPosition, WORKFLOW_LAYOUT } from '../lib/workflowLayout';
import { GenerationTaskCoordinator, getGenerationErrorMessage, getGenerationProgress, type GenerationTaskToken } from '../lib/generationTasks';
import { ImageWriteCache, SerialTaskQueue, createProjectFingerprint, stripRuntimeGraphState } from '../lib/projectPersistence';
import {
  CATEGORY_BASE_SLOT_KEYS,
  compileProductionMaterialsPrompt,
  PRODUCTION_REFERENCE_ORDER,
  shouldUseModelMaterial,
  type CategoryBaseSlotKey,
  type CategoryBaseGenerationContext,
  type CategoryBaseGenerationSlot,
  type ProductionMaterialContext,
  type ProductionMaterialSelection,
} from '../lib/categoryBaseGeneration';

const loadProductionMaterials = async (
  selected: ProductionMaterialSelection,
  manualImages: { data: string; mimeType: string; sourceNodeId?: string }[],
  prompt: string,
) => {
  let baseContext: CategoryBaseGenerationContext | undefined;
  if (selected.base) {
    const response = await fetch(`/api/category-bases/${encodeURIComponent(selected.base.id)}/generation-context?versionId=${encodeURIComponent(selected.base.versionId)}`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || '类目基座读取失败');
    baseContext = payload as CategoryBaseGenerationContext;
    if (baseContext.baseId !== selected.base.id || baseContext.versionId !== selected.base.versionId) throw new Error('类目基座版本校验失败，请重新选择');
  }

  const slots = new Map(baseContext?.slots.map(slot => [slot.key, slot]) || []);
  await Promise.all(CATEGORY_BASE_SLOT_KEYS.map(async key => {
    if (!Object.prototype.hasOwnProperty.call(selected.overrides, key)) return;
    const override = selected.overrides[key];
    if (!override) return void slots.delete(key);
    const response = await fetch(`/api/assets/${encodeURIComponent(override.assetId)}/generation-context?versionId=${encodeURIComponent(override.versionId)}`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || `${override.name}读取失败`);
    const slot = payload as CategoryBaseGenerationSlot;
    if (slot.key !== key || slot.versionId !== override.versionId) throw new Error(`${override.name}版本校验失败`);
    slots.set(key, slot);
  }));
  const modelMaterialSuppressed = slots.has('model') && !shouldUseModelMaterial(prompt);
  if (modelMaterialSuppressed) slots.delete('model');
  const context: ProductionMaterialContext = {
    base: baseContext ? {
      baseId: baseContext.baseId, baseName: baseContext.baseName, category: baseContext.category,
      description: baseContext.description, versionId: baseContext.versionId,
      version: baseContext.version, defaults: baseContext.defaults,
    } : undefined,
    slots: CATEGORY_BASE_SLOT_KEYS.flatMap(key => slots.get(key) ? [slots.get(key)!] : []),
    modelMaterialSuppressed,
  };

  const manualUsage = manualImages.reduce((usage, image) => {
    const bytes = Math.ceil(image.data.length * 3 / 4);
    return {
      count: usage.count + 1,
      originalBytes: usage.originalBytes + bytes,
      analysisBytes: usage.analysisBytes + bytes,
    };
  }, { count: 0, originalBytes: 0, analysisBytes: 0 });
  const remaining = Math.max(0, IMAGE_UPLOAD_LIMITS.maxFiles - manualImages.length);
  const slotReferenceLimits: Record<CategoryBaseSlotKey, number> = {
    model: 3,
    scene: 2,
    material: 2,
    visualSystem: 2,
    copyLayout: 0,
  };
  const slotsByKey = new Map(context.slots.map(slot => [slot.key, slot]));
  const references = PRODUCTION_REFERENCE_ORDER.flatMap(key => {
    const slot = slotsByKey.get(key);
    return slot
      ? slot.referenceImages.slice(0, slotReferenceLimits[slot.key]).map(image => ({ slot, image }))
      : [];
  }).slice(0, remaining);
  const includedReferenceIds = new Set(references.map(({ image }) => image.id));
  context.slots = context.slots.map(slot => (
    { ...slot, referenceImages: slot.referenceImages.filter(image => includedReferenceIds.has(image.id)) }
  ));
  const files = await Promise.all(references.map(async ({ slot, image }) => {
    const imageResponse = await fetch(image.viewUrl);
    if (!imageResponse.ok) throw new Error(`${slot.assetName} 的基座参考图读取失败`);
    const blob = await imageResponse.blob();
    return new File([blob], `${slot.key}-${image.id}`, { type: blob.type || image.mimeType || 'image/png' });
  }));
  const processed = await processImageFiles(files, manualUsage);
  return {
    context,
    referenceImages: processed.map(image => ({ data: image.analysisData, mimeType: image.analysisMimeType })),
  };
};

const nodeTypes = {
  imageNode: ImageNode,
  noteNode: NoteNode,
  maskEditNode: MaskEditNode,
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
  },
  'gpt-image-2': {
    name: 'GPT IMAGE 2',
    label: 'LINKAI · HIGH FIDELITY',
    resolutions: {
      '1K': { cost: 0, rmb: 1.0 }
    }
  }
};

MODEL_COSTS['gpt-image-2'] = {
  name: 'GPT IMAGE 2',
  label: 'OPENAI OFFICIAL',
  resolutions: {
    '1K': { cost: 0, rmb: 1.0 },
    '2K': { cost: 0, rmb: 1.0 },
    '4K': { cost: 0, rmb: 1.0 }
  }
};

interface WorkflowCanvasProps {
  userApiKey?: string;
  user?: User | null;
  onDeductCredit?: (amount: number) => Promise<boolean>;
  isActive?: boolean;
}

export const WorkflowCanvas: React.FC<WorkflowCanvasProps> = ({ 
  userApiKey,
  user,
  onDeductCredit,
  isActive = true,
}) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const projectsRef = useRef<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [showProjectMenu, setShowProjectMenu] = useState(false);
  
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const nodesRef = useRef<Node[]>([]);
  const pasteLayoutCursorRef = useRef<{ x: number; y: number } | null>(null);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [hasApiKey, setHasApiKey] = useState(true);
  const [lastNodeId, setLastNodeId] = useState<string | null>(null);
  const [renamingProject, setRenamingProject] = useState<{ id: string, name: string } | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);
  const uploadUsageRef = useRef({ count: 0, originalBytes: 0, analysisBytes: 0 });
  const uploadQueueRef = useRef<Promise<void>>(Promise.resolve());
  const uploadIdCounterRef = useRef(0);
  const nextUploadBatchId = useCallback((prefix: string) => `${prefix}-${crypto.randomUUID?.() || `${Date.now()}-${++uploadIdCounterRef.current}`}`, []);
  useEffect(() => {
    nodesRef.current = nodes;
    uploadUsageRef.current = nodes.reduce((usage, node) => {
      const data = node.data as ImageNodeData;
      const originalBytes = typeof data.uploadOriginalBytes === 'number' ? data.uploadOriginalBytes : 0;
      const analysisBytes = typeof data.uploadAnalysisBytes === 'number' ? data.uploadAnalysisBytes : 0;
      if (!originalBytes && !analysisBytes) return usage;
      return { count: usage.count + 1, originalBytes: usage.originalBytes + originalBytes, analysisBytes: usage.analysisBytes + analysisBytes };
    }, { count: 0, originalBytes: 0, analysisBytes: 0 });
  }, [nodes]);
  const [paneMenu, setPaneMenu] = useState<{ show: boolean; x: number; y: number } | null>(null);
  const selectedNodes = nodes.filter(n => n.selected);
  
  const genBarRef = useRef<GenerationBarRef>(null);
  const assistantRef = useRef<AssistantRef>(null);
  const rfInstance = useRef<ReactFlowInstance | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const layoutCursorRef = useRef<{ nextX: number; nextY: number } | null>(null);
  const placementReservationsRef = useRef<Map<string, { position: { x: number; y: number } }>>(new Map());
  const generationTasksRef = useRef(new GenerationTaskCoordinator());
  const generationProgressTimersRef = useRef(new Map<string, number>());
  const saveQueueRef = useRef(new SerialTaskQueue());
  const saveCurrentProjectRef = useRef<() => Promise<Project | null>>(async () => null);
  const imageWriteCacheRef = useRef(new ImageWriteCache());
  const saveFingerprintRef = useRef(new Map<string, string>());
  const loadEpochRef = useRef(0);

  const stopGenerationProgress = useCallback((nodeId: string) => {
    const timer = generationProgressTimersRef.current.get(nodeId);
    if (timer !== undefined) window.clearInterval(timer);
    generationProgressTimersRef.current.delete(nodeId);
  }, []);

  const stopAllGenerationProgress = useCallback(() => {
    generationProgressTimersRef.current.forEach(timer => window.clearInterval(timer));
    generationProgressTimersRef.current.clear();
  }, []);

  const startGenerationProgress = useCallback((
    nodeId: string,
    task: GenerationTaskToken,
    model: ImageModel,
    referenceImageCount: number,
  ) => {
    stopGenerationProgress(nodeId);
    const startedAt = Date.now();
    const update = () => {
      if (!generationTasksRef.current.isCurrent(task)) {
        stopGenerationProgress(nodeId);
        return;
      }
      const progress = getGenerationProgress(model, (Date.now() - startedAt) / 1000, referenceImageCount);
      setNodes(current => current.map(node => node.id === nodeId ? {
        ...node,
        data: { ...node.data, generationStatus: progress.label, generationDetail: progress.detail },
      } : node));
    };
    update();
    generationProgressTimersRef.current.set(nodeId, window.setInterval(update, 1000));
  }, [setNodes, stopGenerationProgress]);

  useEffect(() => () => {
    generationTasksRef.current.cancelAll();
    stopAllGenerationProgress();
  }, [stopAllGenerationProgress]);
  useEffect(() => { projectsRef.current = projects; }, [projects]);

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
              if (nodeData.imageUrl && !nodeData.imageUrl?.startsWith('db://') && nodeData.imageUrl?.startsWith('data:')) {
                const imageId = `img-${node.id}`;
                await ImageStorage.set(imageId, nodeData.imageUrl);
                newNodeData.imageUrl = `db://${imageId}`;
                nodeChanged = true;
              }

              // Extract originalImages
              if (nodeData.originalImages) {
                newNodeData.originalImages = await Promise.all(nodeData.originalImages.map(async (img, idx) => {
                  if (img.data && !img.data?.startsWith('db://')) {
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

          projectsRef.current = finalProjects;
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
      void saveCurrentProject().catch(error => console.error('Auto-save failed', error));
    }, 1000);

    return () => clearTimeout(timer);
  }, [nodes, edges, lastNodeId, currentProjectId]);

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
    
    const updatedProjects = [newProject, ...projectsRef.current];
    projectsRef.current = updatedProjects;
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
      const updated = projectsRef.current.map(p => p.id === renamingProject.id ? { ...p, name: trimmedName, updatedAt: Date.now() } : p);
      projectsRef.current = updated;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      setProjects(updated);
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
      if (nodeData.imageUrl && nodeData.imageUrl.startsWith('data:')) {
        const parts = nodeData.imageUrl.split(',');
        if (parts.length > 1) {
          const data = parts[1];
          const mimePart = nodeData.imageUrl.split(';')[0];
          const mimeType = mimePart.includes(':') ? mimePart.split(':')[1] : 'image/png';
          genBarRef.current?.addImage(data, mimeType, nodeData.imageUrl, node.id,
            typeof nodeData.uploadOriginalBytes === 'number' && typeof nodeData.uploadAnalysisBytes === 'number'
              ? { originalBytes: nodeData.uploadOriginalBytes, analysisBytes: nodeData.uploadAnalysisBytes }
              : undefined);
        }
      }
    });
  };

  const loadProject = async (project: Project) => {
    const loadEpoch = ++loadEpochRef.current;
    const hydratedImageValues = new Map<string, string>();
    generationTasksRef.current.cancelAll();
    stopAllGenerationProgress();
    
    // Hydrate nodes with images from IndexedDB
    const hydratedNodes = await Promise.all((project.nodes || []).map(async (node) => {
      try {
        if (node.type === 'noteNode') {
          return attachNodeActions(node);
        }

        const nodeData = node.data as ImageNodeData;
        const newNodeData = { ...nodeData };
        if (newNodeData.isLoading) {
          newNodeData.isLoading = false;
          newNodeData.error = '上次生成任务已中断，请重新生成';
        }
        delete newNodeData.generationStatus;
        delete newNodeData.generationDetail;

        // Hydrate imageUrl
        if (nodeData.imageUrl?.startsWith('db://')) {
          const imageId = nodeData.imageUrl.replace('db://', '');
          const realUrl = await ImageStorage.get(imageId);
          newNodeData.imageUrl = realUrl || undefined;
          if (realUrl) hydratedImageValues.set(imageId, realUrl);
        }

        // Hydrate originalImages
        if (nodeData.originalImages) {
          newNodeData.originalImages = await Promise.all(nodeData.originalImages.map(async (img) => {
            if (img.data?.startsWith('db://')) {
              const imageId = img.data.replace('db://', '');
              const realData = await ImageStorage.get(imageId);
              if (realData) hydratedImageValues.set(imageId, realData);
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
      } catch (err) {
        console.error('Failed to hydrate node', node.id, err);
        return attachNodeActions(node);
      }
    }));

    if (loadEpoch !== loadEpochRef.current) return;

    imageWriteCacheRef.current.replace(hydratedImageValues);
    saveFingerprintRef.current.set(
      project.id,
      createProjectFingerprint(project.nodes || [], project.edges || [], project.lastNodeId || null),
    );
    setCurrentProjectId(project.id);
    setNodes(hydratedNodes);
    setEdges(project.edges || []);
    setLastNodeId(project.lastNodeId || null);
    placementReservationsRef.current.clear();
    const lastGridNode = [...hydratedNodes].reverse().find(node => {
      const data = node.data as ImageNodeData;
      const legacyReference = data.layoutMode === undefined && Boolean(data.originalImages?.length);
      return data.type === 'generated' && data.layoutMode !== 'reference' && !legacyReference;
    });
    if (lastGridNode) {
      const next = advanceGenerationGrid((lastGridNode.data as ImageNodeData).layoutSlot || lastGridNode.position);
      layoutCursorRef.current = { nextX: next.x, nextY: next.y };
    } else {
      layoutCursorRef.current = null;
    }
    setShowProjectMenu(false);
  };

  const saveCurrentProject = (): Promise<Project | null> => {
    const projectId = currentProjectId;
    if (!projectId) return Promise.resolve(null);
    const nodeSnapshot = nodes.map(node => ({ ...node, data: { ...node.data } }));
    const edgeSnapshot = edges.map(edge => ({ ...edge }));
    const lastNodeSnapshot = lastNodeId;

    return saveQueueRef.current.enqueue(async () => {
      const imageWrites: Array<{ key: string; value: string }> = [];
      const nodesToSave = nodeSnapshot.map((node) => {
      if (node.type === 'noteNode') {
        const nodeData = node.data as NoteNodeData;
        const newNodeData = { ...nodeData };
        delete newNodeData.onDelete;
        delete newNodeData.onChange;
        return stripRuntimeGraphState({ ...node, data: newNodeData } as unknown as Record<string, unknown>) as unknown as Node;
      }

      const nodeData = node.data as ImageNodeData;
      const newNodeData = { ...nodeData };
      if (newNodeData.isLoading) {
        newNodeData.isLoading = false;
        newNodeData.error = '生成任务在页面关闭前尚未完成，请重新生成';
      }
      // Progress text is runtime-only. Persisting the one-second updates would
      // create needless project versions and IndexedDB writes.
      delete newNodeData.generationStatus;
      delete newNodeData.generationDetail;
      
      // Remove functions and other non-serializable data
      delete newNodeData.onDelete;
      delete newNodeData.onCancel;
      delete newNodeData.onRegenerate;
      delete newNodeData.onAdjust;
      delete newNodeData.onAnalyze;
      delete newNodeData.onCrop;
      delete newNodeData.onCreateMask;
      delete (newNodeData as Record<string, unknown>).onApply;
      delete (newNodeData as Record<string, unknown>).onDraftChange;
      delete newNodeData.onSendToAssistant;

      // Extract imageUrl
      if (nodeData.imageUrl && !nodeData.imageUrl?.startsWith('db://')) {
        const imageId = `img-${projectId}-${node.id}`;
        if (!imageWriteCacheRef.current.matches(imageId, nodeData.imageUrl)) {
          imageWrites.push({ key: imageId, value: nodeData.imageUrl });
        }
        newNodeData.imageUrl = `db://${imageId}`;
      }

      // Extract originalImages data
      if (nodeData.originalImages) {
        newNodeData.originalImages = nodeData.originalImages.map((img, idx) => {
          if (img.data && !img.data?.startsWith('db://')) {
            const imageId = `orig-${projectId}-${node.id}-${idx}`;
            if (!imageWriteCacheRef.current.matches(imageId, img.data)) {
              imageWrites.push({ key: imageId, value: img.data });
            }
            return { ...img, data: `db://${imageId}` };
          }
          return img;
        });
      }

      // Remove refImages as it's redundant and large
      delete newNodeData.refImages;

      return stripRuntimeGraphState({
        ...node,
        data: newNodeData
      } as unknown as Record<string, unknown>) as unknown as Node;
      });
      const edgesToSave = edgeSnapshot.map(edge =>
        stripRuntimeGraphState(edge as unknown as Record<string, unknown>) as unknown as Edge
      );
      const fingerprint = createProjectFingerprint(nodesToSave, edgesToSave, lastNodeSnapshot);
      const currentProject = projectsRef.current.find(project => project.id === projectId);
      if (!currentProject) return null;
      if (saveFingerprintRef.current.get(projectId) === fingerprint) return currentProject;

      for (const write of imageWrites) {
        await ImageStorage.set(write.key, write.value);
        imageWriteCacheRef.current.remember(write.key, write.value);
      }

      const savedProject: Project = {
        ...currentProject,
        nodes: nodesToSave,
        edges: edgesToSave,
        lastNodeId: lastNodeSnapshot,
        updatedAt: Date.now(),
        version: (currentProject.version || 0) + 1,
      };
      const updated = projectsRef.current.map(project => project.id === projectId ? savedProject : project);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to save current project to localStorage', e);
        throw e;
      }
      projectsRef.current = updated;
      saveFingerprintRef.current.set(projectId, fingerprint);
      setProjects(updated);
      return savedProject;
    });
  };
  saveCurrentProjectRef.current = saveCurrentProject;

  useEffect(() => {
    const flush = () => {
      void saveCurrentProjectRef.current().catch(error => console.error('Final project save failed', error));
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const switchProject = async (project: Project) => {
    if (project.id === currentProjectId) {
      setShowProjectMenu(false);
      return;
    }
    try {
      await saveCurrentProject();
      const latestProject = projectsRef.current.find(item => item.id === project.id);
      if (latestProject) await loadProject(latestProject);
    } catch (error) {
      console.error('Project switch cancelled because save failed', error);
      alert('当前项目保存失败，暂未切换项目，请重试');
    }
  };

  const createProjectAfterSave = async () => {
    try {
      await saveCurrentProject();
      createNewProject();
    } catch (error) {
      console.error('Project creation cancelled because save failed', error);
      alert('当前项目保存失败，暂未创建新项目，请重试');
    }
  };

  const deleteProject = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = projectsRef.current.filter(p => p.id !== id);
    projectsRef.current = updated;
    saveFingerprintRef.current.delete(id);
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
      const latestProject = project.id === currentProjectId
        ? (await saveCurrentProject()) || project
        : projectsRef.current.find(item => item.id === project.id) || project;
      
      const images: Record<string, string> = {};
      const includeStoredImage = async (reference?: string) => {
        if (!reference?.startsWith('db://')) return;
        const imageId = reference.replace('db://', '');
        const data = await ImageStorage.get(imageId);
        if (data) images[imageId] = data;
      };
      for (const node of latestProject.nodes) {
        const nodeData = node.data as ImageNodeData;
        await includeStoredImage(nodeData.imageUrl);
        for (const original of nodeData.originalImages || []) {
          await includeStoredImage(original.data);
        }
      }

      const bundle = {
        version: '1.0',
        project: {
          ...latestProject,
          id: `exported-${Date.now()}`, 
        },
        images
      };

      const blob = new Blob([JSON.stringify(bundle)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `BANFULY_Workflow_${latestProject.name}_${new Date().toISOString().split('T')[0]}.json`;
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

        await saveCurrentProject();
        const updatedProjects = [newProject, ...projectsRef.current];
        projectsRef.current = updatedProjects;
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
      genBarRef.current.addImage(data, mimeType, nodeData.imageUrl, node.id,
        typeof nodeData.uploadOriginalBytes === 'number' && typeof nodeData.uploadAnalysisBytes === 'number'
          ? { originalBytes: nodeData.uploadOriginalBytes, analysisBytes: nodeData.uploadAnalysisBytes }
          : undefined);
    }
  }, []);

  const advanceLayoutCursor = useCallback((position: { x: number; y: number }) => {
    const next = advanceGenerationGrid(position);
    layoutCursorRef.current = { nextX: next.x, nextY: next.y };
  }, []);

  const handleNodeDragStop: NodeMouseHandler = useCallback((_event, node) => {
    const nodeData = node.data as ImageNodeData;
    if (nodeData.type !== "generated") return;
    setLastNodeId(node.id);
  }, []);

  const fitAllNodes = useCallback(() => {
    rfInstance.current?.fitView({ padding: 0.16, duration: 450 });
  }, []);

  const focusLatestNode = useCallback(() => {
    const currentNodes = nodesRef.current;
    const latest =
      currentNodes.find(node => node.id === lastNodeId) ||
      [...currentNodes].reverse().find(node => (node.data as ImageNodeData).type === "generated");
    if (!latest) {
      fitAllNodes();
      return;
    }
    rfInstance.current?.fitView({
      nodes: [latest],
      padding: 0.35,
      maxZoom: 1,
      duration: 450,
    });
  }, [fitAllNodes, lastNodeId]);

  const focusNode = useCallback((nodeId: string) => {
    window.setTimeout(() => {
      const node = nodesRef.current.find(item => item.id === nodeId);
      if (!node) return;
      rfInstance.current?.fitView({ nodes: [node], padding: 0.35, maxZoom: 1, duration: 450 });
    }, 80);
  }, []);

  const findSafePosition = (x: number, y: number, currentNodes: Array<{ position: { x: number; y: number } }>) => {
    return findFreeGridPosition({ x, y }, currentNodes);
  };

  const findSafePositionToRight = useCallback((x: number, y: number, currentNodes: Array<{ position: { x: number; y: number } }>) => {
    return findDerivedNodePosition({ x: x - WORKFLOW_LAYOUT.horizontalGap, y }, currentNodes);
  }, []);

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
          onChange: (title: string, content: string, fontSize: number, color: string, isLocked: boolean) => {
            setNodes((nds) => nds.map(n => n.id === node.id ? {
              ...n,
              data: { ...n.data, title, content, fontSize, color, isLocked }
            } : n));
          }
        }
      };
    }

    if (node.type === 'maskEditNode') {
      const nodeData = node.data as MaskEditNodeData;
      return {
        ...node,
        data: {
          ...nodeData,
          onDelete: () => {
            setNodes(current => current.filter(item => item.id !== node.id));
            setEdges(current => current.filter(edge => edge.source !== node.id && edge.target !== node.id));
          },
          onDraftChange: (draft) => {
            setNodes(current => current.map(item => item.id === node.id ? { ...item, data: { ...item.data, draft } } : item));
          },
          onApply: (editedImageUrl: string) => {
            const createdAt = Date.now();
            const resultNodeId = `mask-result-${createdAt}`;
            setNodes(current => {
              const position = findSafePositionToRight(node.position.x + 400, node.position.y, current);
              const resultNode = attachNodeActions({
                id: resultNodeId,
                type: 'imageNode',
                position,
                data: {
                  prompt: `遮罩修改自：${nodeData.prompt || '原始图片'}`,
                  imageUrl: editedImageUrl,
                  type: 'source',
                  sourceNodeId: node.id,
                  resolution: '遮罩定点修改图片'
                }
              });
              return [...current, resultNode];
            });
            setEdges(current => [...current, { id: `edge-mask-result-${createdAt}`, source: node.id, target: resultNodeId }]);
          }
        }
      };
    }

    const nodeData = node.data as ImageNodeData;
    const savedProductionMaterials = nodeData.productionMaterials || (nodeData.categoryBase ? {
      base: nodeData.categoryBase,
      overrides: {},
    } : undefined);
    
    // Recovery logic for legacy nodes
    const originalImages: NonNullable<ImageNodeData['originalImages']> | undefined = nodeData.originalImages || nodeData.refImages?.map(img => {
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
            generationTasksRef.current.cancel(node.id);
            stopGenerationProgress(node.id);
            setNodes((nds) => nds.filter((n) => n.id !== node.id));
            setEdges((eds) => eds.filter((e) => e.source !== node.id && e.target !== node.id));
          },
          onCancel: nodeData.isLoading ? () => {
            generationTasksRef.current.cancel(node.id);
            stopGenerationProgress(node.id);
            setNodes(current => current.map(item => item.id === node.id ? attachNodeActions({
              ...item,
              data: {
                ...item.data,
                isLoading: false,
                error: '已停止本次生成，不会由本站自动重新提交',
                generationStatus: undefined,
                generationDetail: undefined,
              },
            }) : item));
          } : undefined,
        onRegenerate: nodeData.type === 'generated' ? () => {
          console.log(`[Workflow] Regenerating node ${node.id}`);
          handleGenerateRef.current(
            nodeData.prompt, 
            nodeData.aspectRatio || '1:1', 
            nodeData.imageSize || '1K', 
            nodeData.model || 'gemini-3.1-flash-image-preview', 
            originalImages, 
            node.id,
            savedProductionMaterials,
          );
        } : undefined,
        onAdjust: nodeData.type === 'generated' ? (mode: 'reference' | 'text' = 'reference') => {
          console.log(`[Workflow] Adjusting node ${node.id}`);
          if (genBarRef.current) {
            genBarRef.current.setParams(
              mode === 'text' && nodeData.analysisPrompt ? nodeData.analysisPrompt : nodeData.prompt,
              nodeData.aspectRatio || '1:1', 
              nodeData.imageSize || '1K', 
              nodeData.model || 'gemini-3.1-flash-image-preview', 
              mode === 'text' ? [] : originalImages?.map(img => ({
                data: img.data, 
                mimeType: img.mimeType, 
                preview: `data:${img.mimeType};base64,${img.data}`,
                sourceNodeId: img.sourceNodeId 
              })),
              savedProductionMaterials,
            );
          }
        } : undefined,
        onAnalyze: nodeData.imageUrl ? async () => {
          setNodes(nds => nds.map(n => n.id === node.id ? {
            ...n,
            data: { ...n.data, isAnalyzing: true, analysisError: undefined }
          } : n));
          try {
            const template = await getDefaultImageAnalysisTemplate();
            const analysisPrompt = await analyzeImageForPrompt((nodeData.analysisImageUrl as string | undefined) || nodeData.imageUrl!, template, userApiKey);
            setNodes(nds => nds.map(n => n.id === node.id ? attachNodeActions({
              ...n,
              data: {
                ...n.data,
                analysisPrompt,
                analysisTemplateName: template.name,
                isAnalyzing: false,
                analysisError: undefined
              }
            }) : n));
          } catch (error) {
            setNodes(nds => nds.map(n => n.id === node.id ? {
              ...n,
              data: { ...n.data, isAnalyzing: false, analysisError: (error as Error).message }
            } : n));
          }
        } : undefined,
        onCrop: nodeData.imageUrl ? (croppedImages: string[]) => {
          const createdAt = Date.now();
          setNodes(current => {
            const columns = Math.min(8, Math.max(1, croppedImages.length));
            const groupStartX = node.position.x + 400;
            let groupStartY = node.position.y;
            let attempts = 0;
            while (attempts < 40) {
              const groupCollides = croppedImages.some((_, index) => {
                const x = groupStartX + (index % columns) * 400;
                const y = groupStartY + Math.floor(index / columns) * 400;
                return current.some(existing =>
                  Math.abs(existing.position.x - x) < 350 &&
                  Math.abs(existing.position.y - y) < 360
                );
              });
              if (!groupCollides) break;
              groupStartY += 420;
              attempts++;
            }
            const created = croppedImages.map((imageUrl, index) => {
              const column = index % columns;
              const row = Math.floor(index / columns);
              const position = {
                x: groupStartX + column * 400,
                y: groupStartY + row * 400
              };
              const croppedNode = attachNodeActions({
                id: `crop-${createdAt}-${index}`,
                type: 'imageNode',
                position,
                data: {
                  prompt: `裁剪自：${nodeData.prompt || '原始图片'}（切片 ${index + 1}/${croppedImages.length}）`,
                  imageUrl,
                  type: 'source',
                  sourceNodeId: node.id,
                  resolution: '裁剪切片'
                }
              });
              return croppedNode;
            });
            return [...current, ...created];
          });
          setEdges(current => [
            ...current,
            ...croppedImages.map((_, index) => ({
              id: `edge-crop-${createdAt}-${index}`,
              source: node.id,
              target: `crop-${createdAt}-${index}`
            }))
          ]);
        } : undefined,
        onCreateMask: nodeData.imageUrl ? () => {
          const createdAt = Date.now();
          const maskNodeId = `mask-edit-${createdAt}`;
          setNodes(current => {
            const position = findSafePositionToRight(node.position.x + 400, node.position.y, current);
            const maskNode = attachNodeActions({
              id: maskNodeId,
              type: 'maskEditNode',
              position,
              data: {
                prompt: nodeData.prompt || '原始图片',
                imageUrl: nodeData.imageUrl!,
                sourceNodeId: node.id,
              }
            });
            return [...current, maskNode];
          });
          setEdges(current => [...current, {
            id: `edge-mask-edit-${createdAt}`,
            source: node.id,
            target: maskNodeId
          }]);
        } : undefined,
        onSendToAssistant: nodeData.imageUrl ? () => {
          if (assistantRef.current) {
            const analysisUrl = (nodeData.analysisImageUrl as string | undefined) || nodeData.imageUrl!;
            const match = analysisUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              assistantRef.current.sendImage(match[2], match[1], nodeData.imageUrl!, false,
                typeof nodeData.uploadOriginalBytes === 'number' && typeof nodeData.uploadAnalysisBytes === 'number'
                  ? { originalBytes: nodeData.uploadOriginalBytes, analysisBytes: nodeData.uploadAnalysisBytes }
                  : undefined);
            } else {
              assistantRef.current.open();
            }
          }
        } : undefined
      }
    };
  }, [setNodes, setEdges, userApiKey, findSafePositionToRight, stopGenerationProgress]);

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
      const files = Array.from((e.target as HTMLInputElement).files || []);
      if (!files.length) return;

      const position = paneMenu ? rfInstance.current?.screenToFlowPosition({
        x: paneMenu.x,
        y: paneMenu.y,
      }) : { x: 100, y: 100 };

      uploadQueueRef.current = uploadQueueRef.current.then(async () => {
      try {
        const images = await processImageFiles(files, uploadUsageRef.current);
        uploadUsageRef.current = images.reduce((usage, image) => ({ count: usage.count + 1, originalBytes: usage.originalBytes + image.originalBytes, analysisBytes: usage.analysisBytes + image.analysisBytes }), uploadUsageRef.current);
        const batchId = nextUploadBatchId('import');
        const importedNodes = images.map((image, i) => {
          const newNodeId = `${batchId}-${i}`;
          return attachNodeActions({
            id: newNodeId,
            type: 'imageNode',
            position: getBatchImportPosition({ x: position?.x || 100, y: position?.y || 100 }, i),
            data: {
              prompt: image.file.name,
              imageUrl: image.originalDataUrl,
              type: 'source',
              uploadOriginalBytes: image.originalBytes,
              uploadAnalysisBytes: image.analysisBytes,
              analysisImageUrl: image.analysisDataUrl,
            },
          });
        });
        setNodes((nds) => [...nds, ...importedNodes]);
      } catch (error) {
        alert((error as Error).message);
      }
      });
      await uploadQueueRef.current;
      setPaneMenu(null);
    };
    input.click();
  }, [paneMenu, attachNodeActions, setNodes, nextUploadBatchId]);

  useEffect(() => {
    const handlePaste = async (event: ClipboardEvent) => {
      const target = event.target;
      const isEditing = target instanceof Element && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
      if (!isActive || document.hidden || event.defaultPrevented || isEditing) return;
      const items = event.clipboardData?.items;
      if (!items) return;
      const files = Array.from(items).filter(item => item.type.startsWith('image/')).map(item => item.getAsFile()).filter((file): file is File => Boolean(file));
      if (!files.length) return;
      event.preventDefault();
      uploadQueueRef.current = uploadQueueRef.current.then(async () => {
        try {
          const images = await processImageFiles(files, uploadUsageRef.current);
          uploadUsageRef.current = images.reduce((usage, image) => ({ count: usage.count + 1, originalBytes: usage.originalBytes + image.originalBytes, analysisBytes: usage.analysisBytes + image.analysisBytes }), uploadUsageRef.current);
          const center = rfInstance.current?.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 }) || { x: 0, y: 0 };
          const layout = allocatePasteBatchOrigin(center, nodesRef.current.map(node => node.position.y + 450), pasteLayoutCursorRef.current, images.length);
          const origin = layout.origin;
          pasteLayoutCursorRef.current = layout.nextCursor;
          const batchId = nextUploadBatchId('paste');
          const pastedNodes = images.map((image, index) => attachNodeActions({
                id: `${batchId}-${index}`,
                type: 'imageNode',
                position: getBatchImportPosition(origin, index),
                data: {
                  prompt: image.file.name || `粘贴图片 ${index + 1}`,
                  imageUrl: image.originalDataUrl,
                  type: 'source',
                  uploadOriginalBytes: image.originalBytes,
                  uploadAnalysisBytes: image.analysisBytes,
                  analysisImageUrl: image.analysisDataUrl,
                },
              }));
          setNodes(nds => [...nds, ...pastedNodes]);
        } catch (error) { alert((error as Error).message); }
      });
      await uploadQueueRef.current;
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [attachNodeActions, isActive, nextUploadBatchId, setNodes]);

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
    targetNodeId?: string,
    productionMaterials?: ProductionMaterialSelection,
  ) => {
    const manualImages = images || [];
    let requestPrompt = prompt;
    let requestImages = manualImages.map(image => ({ data: image.data, mimeType: image.mimeType }));
    if (productionMaterials) {
      try {
        const prepared = await loadProductionMaterials(productionMaterials, manualImages, prompt);
        requestPrompt = compileProductionMaterialsPrompt(prompt, prepared.context, manualImages.length);
        requestImages = [...requestImages, ...prepared.referenceImages];
      } catch (error) {
        alert(error instanceof Error ? error.message : '类目基座读取失败');
        return;
      }
    }
    // Calculate cost
    const modelCfg = MODEL_COSTS[model];
    const lookupId = imageSize === "512px" ? "0.5K" : imageSize;
    const cost = modelCfg?.resolutions[lookupId]?.rmb || 0;

    if (user && user.credits < cost) {
      alert(`点数不足，本次生成需要 ${cost} 点，当前剩余 ${user.credits} 点`);
      return;
    }

    if (targetNodeId) {
      const task = generationTasksRef.current.start(targetNodeId);
      // Update existing node to loading state
      setNodes((nds) => nds.map(n => n.id === targetNodeId ? attachNodeActions({
        ...n,
        data: { ...n.data, isLoading: true, error: undefined }
      }) : n));
      startGenerationProgress(targetNodeId, task, model, requestImages.length);
      setLastNodeId(targetNodeId);
      focusNode(targetNodeId);

      console.log(`[Workflow] Starting regeneration for node ${targetNodeId}`, { prompt, aspectRatio, imageSize, model, imagesCount: images?.length });

      try {
        const urls = await generateImage({ 
          prompt: requestPrompt,
          aspectRatio, 
          imageSize, 
          model, 
          images: requestImages,
          apiKey: userApiKey,
          signal: task.signal,
          requestId: task.id,
        });
        if (!generationTasksRef.current.isCurrent(task)) return;
        console.log(`[Workflow] Regeneration success for node ${targetNodeId}`, { url: urls[0] });
        
        if (onDeductCredit) {
          await onDeductCredit(cost);
        }
        if (!generationTasksRef.current.isCurrent(task)) return;

        setNodes((nds) => nds.map(n => n.id === targetNodeId ? attachNodeActions({
          ...n,
          data: { ...n.data, isLoading: false, imageUrl: urls[0], generationStatus: undefined, generationDetail: undefined }
        }) : n));
      } catch (err: unknown) {
        if (!generationTasksRef.current.isCurrent(task)) return;
        const error = err as Error;
        console.error(`[Workflow] Regeneration failed for node ${targetNodeId}:`, error);
        setNodes((nds) => nds.map(n => n.id === targetNodeId ? {
          ...n,
          data: { ...n.data, isLoading: false, error: getGenerationErrorMessage(error, task.signal), generationStatus: undefined, generationDetail: undefined }
        } : n));
      } finally {
        stopGenerationProgress(targetNodeId);
        generationTasksRef.current.finish(task);
      }
      return;
    }

    const newNodeId = `node-${crypto.randomUUID()}`;
    
    // Separate images into those from existing nodes and those that are new uploads
    const existingSourceIds = (images || [])
      .filter(img => img.sourceNodeId)
      .map(img => img.sourceNodeId as string);
    
    const newUploads = (images || []).filter(img => !img.sourceNodeId);
    
    const currentNodes = nodesRef.current;
    const occupiedNodes = [...currentNodes, ...placementReservationsRef.current.values()];

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
      
      const pos = findSafePosition(basePosX, basePosY + i * 400, occupiedNodes);
      
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

    // Reference-based generations form a horizontal chain to the right of their sources.
    // Generations without references continue on the predictable shared grid.
    let posX = layoutCursorRef.current?.nextX ?? 100;
    let posY = layoutCursorRef.current?.nextY ?? 100;
    const sourceNodesInCanvas = currentNodes.filter(node => existingSourceIds.includes(node.id));
    const allSources = [...sourceNodesInCanvas, ...newSourceNodes];
    const hasReferences = allSources.length > 0;

    if (hasReferences) {
      const rightmostSource = allSources.reduce((rightmost, node) =>
        node.position.x > rightmost.position.x ? node : rightmost
      );
      posX = rightmostSource.position.x + 400;
      posY = rightmostSource.position.y;
      const referenceSafePos = findSafePositionToRight(
        posX,
        posY,
        [...occupiedNodes, ...newSourceNodes]
      );
      posX = referenceSafePos.x;
      posY = referenceSafePos.y;
    } else if (!layoutCursorRef.current && currentNodes.length > 0) {
      const lastGenerated =
        currentNodes.find(node => {
          const data = node.data as ImageNodeData;
          const legacyReference = data.layoutMode === undefined && Boolean(data.originalImages?.length);
          return node.id === lastNodeId && data.type === 'generated' && data.layoutMode !== 'reference' && !legacyReference;
        }) ||
        [...currentNodes].reverse().find(node => {
          const data = node.data as ImageNodeData;
          const legacyReference = data.layoutMode === undefined && Boolean(data.originalImages?.length);
          return data.type === 'generated' && data.layoutMode !== 'reference' && !legacyReference;
        });
      if (lastGenerated) {
        const next = advanceGenerationGrid((lastGenerated.data as ImageNodeData).layoutSlot || lastGenerated.position);
        posX = next.x;
        posY = next.y;
        layoutCursorRef.current = { nextX: posX, nextY: posY };
      }
    }

    if (!hasReferences) {
      const safePos = findFreeGenerationPosition(
        { x: posX, y: posY },
        [...occupiedNodes, ...newSourceNodes],
      );
      posX = safePos.x;
      posY = safePos.y;
    }
    if (!hasReferences) advanceLayoutCursor({ x: posX, y: posY });

    const newNode = attachNodeActions({
      id: newNodeId,
      type: 'imageNode',
      position: { x: posX, y: posY },
      data: {
        prompt,
        isLoading: true,
        type: 'generated',
        layoutMode: hasReferences ? 'reference' : 'grid',
        layoutSlot: { x: posX, y: posY },
        refImages: images?.map(img => `data:${img.mimeType};base64,${img.data}`),
        originalImages: manualImages,
        productionMaterials,
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
    }) as Node<ImageNodeData>;

    [...newSourceNodes, newNode].forEach(node => placementReservationsRef.current.set(node.id, { position: node.position }));
    window.setTimeout(() => {
      [...newSourceNodes, newNode].forEach(node => placementReservationsRef.current.delete(node.id));
    }, 1000);

    setNodes((nds) => [...nds, ...newSourceNodes, newNode]);
    focusNode(newNodeId);

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
    const task = generationTasksRef.current.start(newNodeId);
    startGenerationProgress(newNodeId, task, model, requestImages.length);
    console.log(`[Workflow] Starting generation for node ${newNodeId}`, { prompt, aspectRatio, imageSize, model, imagesCount: images?.length });

    try {
      const urls = await generateImage({ 
        prompt: requestPrompt,
        aspectRatio, 
        imageSize, 
        model, 
        images: requestImages,
        apiKey: userApiKey,
        signal: task.signal,
        requestId: task.id,
      });
      if (!generationTasksRef.current.isCurrent(task)) return;
      console.log(`[Workflow] Generation success for node ${newNodeId}`, { url: urls[0] });
      
      // Deduct credit on success
      if (onDeductCredit) {
        await onDeductCredit(cost);
      }
      if (!generationTasksRef.current.isCurrent(task)) return;

      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === newNodeId) {
            return attachNodeActions({
              ...node,
              data: {
                ...node.data,
                isLoading: false,
                imageUrl: urls[0],
                generationStatus: undefined,
                generationDetail: undefined,
              },
            });
          }
          return node;
        })
      );
    } catch (err: unknown) {
      if (!generationTasksRef.current.isCurrent(task)) return;
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
                error: isKeyError ? "API Key required" : getGenerationErrorMessage(error, task.signal),
                generationStatus: undefined,
                generationDetail: undefined,
              },
            };
          }
          return node;
        })
      );
    } finally {
      stopGenerationProgress(newNodeId);
      generationTasksRef.current.finish(task);
    }
  }, [user, userApiKey, onDeductCredit, findSafePosition, findSafePositionToRight, attachNodeActions, advanceLayoutCursor, focusNode, lastNodeId, startGenerationProgress, stopGenerationProgress]);

  const handleGenerateRef = useRef(handleGenerate);
  useEffect(() => {
    handleGenerateRef.current = handleGenerate;
  }, [handleGenerate]);

  const handleOpenApiKey = async () => {
    await openApiKeyDialog();
    setHasApiKey(true);
  };

  return (
    <div className="w-full h-full bg-[#1a1a1a] relative overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDoubleClick={handleNodeDoubleClick}
        onNodeDragStop={handleNodeDragStop}
        onInit={(instance) => { rfInstance.current = instance as unknown as ReactFlowInstance; }}
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
        <Controls showFitView={false}>
          <ControlButton
            onClick={fitAllNodes}
            title="查看全部节点"
            aria-label="查看全部节点"
          >
            <Maximize2 size={14} />
          </ControlButton>
          <ControlButton
            onClick={focusLatestNode}
            title="定位最新生成图片"
            aria-label="定位最新生成图片"
          >
            <LocateFixed size={14} />
          </ControlButton>
        </Controls>

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
                          onClick={() => void createProjectAfterSave()}
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
                          onClick={() => void switchProject(p)}
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
