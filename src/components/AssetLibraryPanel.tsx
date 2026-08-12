import React, { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  Boxes,
  Image as ImageIcon,
  Layers3,
  Mountain,
  Palette,
  Plus,
  Save,
  Search,
  Sparkles,
  UploadCloud,
  UserRound,
  Type,
  X,
} from 'lucide-react';
import type {
  AssetImageReference,
  AssetRecord,
  AssetType,
  CategoryBaseComponents,
  CategoryBaseRecord,
  PaginatedAssetResult,
} from '../lib/assetLibrary';

type LibraryTab = 'bases' | AssetType;

const TYPE_META: Record<AssetType, { label: string; short: string; icon: React.ElementType; accent: string }> = {
  visual_system: { label: 'VI 视觉系统', short: 'VI', icon: Palette, accent: '#ff4d2e' },
  scene: { label: '场景库', short: 'SCENE', icon: Mountain, accent: '#1473e6' },
  material: { label: '材质库', short: 'MATERIAL', icon: Layers3, accent: '#8b5cf6' },
  model: { label: '模特库', short: 'MODEL', icon: UserRound, accent: '#059669' },
  copy_layout: { label: '文案排版库', short: 'COPY', icon: Type, accent: '#d946ef' },
};

const SLOT_KEYS: Array<{ key: keyof CategoryBaseComponents; type: AssetType }> = [
  { key: 'visualSystem', type: 'visual_system' },
  { key: 'scene', type: 'scene' },
  { key: 'material', type: 'material' },
  { key: 'model', type: 'model' },
  { key: 'copyLayout', type: 'copy_layout' },
];

const CONTROL_CLASS = 'w-full rounded-xl border border-black/15 bg-[#f5f5f7] px-3.5 py-3 text-sm font-semibold text-[#1d1d1f] outline-none transition placeholder:text-[#9b9ba1] focus:border-black/45 focus:bg-white focus:ring-2 focus:ring-black/5';

const emptyAssetForm = (type: AssetType) => ({
  type,
  name: '',
  category: '',
  tags: '',
  summary: '',
  promptFragment: '',
  negativePrompt: '',
  lockedFields: '',
  variableFields: '',
  templateKind: 'main_image',
  headlineFont: '',
  headlineSize: '',
  headlinePosition: '',
  headlineMaxChars: '',
  headlineDirection: '',
  sellingPointPosition: '',
  sellingPointMaxChars: '',
  sellingPointDirection: '',
  subcopyFont: '',
  subcopySize: '',
  subcopyPosition: '',
  subcopyMaxChars: '',
  subcopyDirection: '',
});

const emptyBaseForm = () => ({
  name: '',
  category: '',
  description: '',
  visualSystem: '',
  scene: '',
  material: '',
  model: '',
  copyLayout: '',
  modelId: '',
  aspectRatio: '',
  imageSize: '',
});

const api = async <T,>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || `请求失败（${response.status}）`);
  return payload as T;
};

const imageDimensions = (file: File): Promise<{ width: number; height: number }> => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    resolve({ width: image.naturalWidth, height: image.naturalHeight });
    URL.revokeObjectURL(url);
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    reject(new Error(`无法读取图片：${file.name}`));
  };
  image.src = url;
});

const splitList = (value: string) => value.split(/[,，\n]/).map(item => item.trim()).filter(Boolean);

export const AssetLibraryPanel: React.FC = () => {
  const [tab, setTab] = useState<LibraryTab>('bases');
  const [assetsByType, setAssetsByType] = useState<Record<AssetType, AssetRecord[]>>({
    visual_system: [], scene: [], material: [], model: [], copy_layout: [],
  });
  const [bases, setBases] = useState<CategoryBaseRecord[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [storageConfigured, setStorageConfigured] = useState(false);
  const [assetModalOpen, setAssetModalOpen] = useState(false);
  const [baseModalOpen, setBaseModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<AssetRecord | null>(null);
  const [editingBase, setEditingBase] = useState<CategoryBaseRecord | null>(null);
  const [assetForm, setAssetForm] = useState(emptyAssetForm('visual_system'));
  const [baseForm, setBaseForm] = useState(emptyBaseForm());
  const [files, setFiles] = useState<File[]>([]);

  const loadAll = async () => {
    setLoading(true);
    setError('');
    try {
      const [storage, baseResult, visual, scene, material, model, copyLayout] = await Promise.all([
        api<{ configured: boolean }>('/api/storage/status'),
        api<PaginatedAssetResult<CategoryBaseRecord>>('/api/category-bases?page=1&pageSize=100'),
        ...(['visual_system', 'scene', 'material', 'model', 'copy_layout'] as AssetType[]).map(type =>
          api<PaginatedAssetResult<AssetRecord>>(`/api/assets?type=${type}&page=1&pageSize=100`)
        ),
      ]);
      setStorageConfigured(storage.configured);
      setBases(baseResult.items);
      setAssetsByType({
        visual_system: visual.items,
        scene: scene.items,
        material: material.items,
        model: model.items,
        copy_layout: copyLayout.items,
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '资产库加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadAll(); }, []);

  const assetLookup = useMemo(() => {
    const result = new Map<string, AssetRecord>();
    Object.values(assetsByType).flat().forEach(record => result.set(record.asset.id, record));
    return result;
  }, [assetsByType]);

  const visibleAssets = useMemo(() => {
    if (tab === 'bases') return [];
    const query = search.trim().toLowerCase();
    return assetsByType[tab].filter(record => !query ||
      `${record.asset.name} ${record.asset.category} ${record.asset.tags.join(' ')}`.toLowerCase().includes(query)
    );
  }, [assetsByType, search, tab]);

  const visibleBases = useMemo(() => {
    const query = search.trim().toLowerCase();
    return bases.filter(record => !query ||
      `${record.base.name} ${record.base.category} ${record.base.description}`.toLowerCase().includes(query)
    );
  }, [bases, search]);

  const openNewAsset = (type: AssetType) => {
    setEditingAsset(null);
    setAssetForm(emptyAssetForm(type));
    setFiles([]);
    setAssetModalOpen(true);
  };

  const openEditAsset = (record: AssetRecord) => {
    setEditingAsset(record);
    setAssetForm({
      type: record.asset.type,
      name: record.asset.name,
      category: record.asset.category,
      tags: record.asset.tags.join('，'),
      summary: record.version.profile.summary,
      promptFragment: record.version.profile.promptFragment || record.version.profile.summary,
      negativePrompt: record.version.profile.negativePrompt,
      lockedFields: record.version.profile.lockedFields.join('，'),
      variableFields: record.version.profile.variableFields.join('，'),
      templateKind: String(record.version.profile.attributes.templateKind || 'main_image'),
      headlineFont: String(record.version.profile.attributes.headlineFont || ''),
      headlineSize: String(record.version.profile.attributes.headlineSize || ''),
      headlinePosition: String(record.version.profile.attributes.headlinePosition || ''),
      headlineMaxChars: String(record.version.profile.attributes.headlineMaxChars || ''),
      headlineDirection: String(record.version.profile.attributes.headlineDirection || ''),
      sellingPointPosition: String(record.version.profile.attributes.sellingPointPosition || ''),
      sellingPointMaxChars: String(record.version.profile.attributes.sellingPointMaxChars || ''),
      sellingPointDirection: String(record.version.profile.attributes.sellingPointDirection || ''),
      subcopyFont: String(record.version.profile.attributes.subcopyFont || ''),
      subcopySize: String(record.version.profile.attributes.subcopySize || ''),
      subcopyPosition: String(record.version.profile.attributes.subcopyPosition || ''),
      subcopyMaxChars: String(record.version.profile.attributes.subcopyMaxChars || ''),
      subcopyDirection: String(record.version.profile.attributes.subcopyDirection || ''),
    });
    setFiles([]);
    setAssetModalOpen(true);
  };

  const uploadFile = async (file: File, sortOrder: number): Promise<AssetImageReference> => {
    const dimensions = await imageDimensions(file);
    const presigned = await api<{ objectId: string; uploadUrl: string; headers: Record<string, string> }>('/api/storage/uploads/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: file.name, mimeType: file.type, byteSize: file.size, ...dimensions }),
    });
    const uploadResponse = await fetch(presigned.uploadUrl, { method: 'PUT', body: file, headers: presigned.headers });
    if (!uploadResponse.ok) throw new Error(`图片上传失败：${file.name}`);
    await api(`/api/storage/uploads/${presigned.objectId}/complete`, { method: 'POST' });
    return {
      id: `image-${presigned.objectId}`,
      objectId: presigned.objectId,
      role: sortOrder === 0 ? 'source' : 'reference',
      mimeType: file.type,
      width: dimensions.width,
      height: dimensions.height,
      sortOrder,
    };
  };

  const saveAsset = async () => {
    if (!assetForm.name.trim()) return setError('请填写资产名称');
    if (files.length > 0 && !storageConfigured) return setError('测试站尚未绑定 Railway Bucket');
    setSaving(true);
    setError('');
    try {
      const existingRefs = editingAsset?.version.imageRefs || [];
      const uploadedRefs: AssetImageReference[] = [];
      for (let index = 0; index < files.length; index += 1) {
        uploadedRefs.push(await uploadFile(files[index], existingRefs.length + index));
      }
      const body = {
        type: assetForm.type,
        name: assetForm.name,
        category: assetForm.category,
        tags: splitList(assetForm.tags),
        status: 'active',
        sourceKind: editingAsset ? 'manual' : files.length ? 'imported' : 'manual',
        profile: {
          summary: assetForm.promptFragment || assetForm.summary,
          promptFragment: assetForm.promptFragment,
          negativePrompt: assetForm.negativePrompt,
          lockedFields: splitList(assetForm.lockedFields),
          variableFields: splitList(assetForm.variableFields),
          attributes: assetForm.type === 'copy_layout' ? {
            templateKind: assetForm.templateKind,
            headlineFont: assetForm.headlineFont,
            headlineSize: assetForm.headlineSize,
            headlinePosition: assetForm.headlinePosition,
            headlineMaxChars: Number(assetForm.headlineMaxChars) || 0,
            headlineDirection: assetForm.headlineDirection,
            sellingPointPosition: assetForm.sellingPointPosition,
            sellingPointMaxChars: Number(assetForm.sellingPointMaxChars) || 0,
            sellingPointDirection: assetForm.sellingPointDirection,
            subcopyFont: assetForm.subcopyFont,
            subcopySize: assetForm.subcopySize,
            subcopyPosition: assetForm.subcopyPosition,
            subcopyMaxChars: Number(assetForm.subcopyMaxChars) || 0,
            subcopyDirection: assetForm.subcopyDirection,
          } : {},
        },
        imageRefs: [...existingRefs, ...uploadedRefs],
        changeNote: editingAsset ? '页面编辑更新' : '首次创建',
      };
      await api(editingAsset ? `/api/assets/${editingAsset.asset.id}` : '/api/assets', {
        method: editingAsset ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setAssetModalOpen(false);
      await loadAll();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存资产失败');
    } finally {
      setSaving(false);
    }
  };

  const archiveAsset = async (record: AssetRecord) => {
    if (!window.confirm(`归档“${record.asset.name}”？已有基座仍会保留其固定版本。`)) return;
    try {
      await api(`/api/assets/${record.asset.id}`, { method: 'DELETE' });
      await loadAll();
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : '归档失败');
    }
  };

  const openNewBase = () => {
    setEditingBase(null);
    setBaseForm(emptyBaseForm());
    setBaseModalOpen(true);
  };

  const openEditBase = (record: CategoryBaseRecord) => {
    setEditingBase(record);
    setBaseForm({
      name: record.base.name,
      category: record.base.category,
      description: record.base.description,
      visualSystem: record.version.components.visualSystem?.assetId || '',
      scene: record.version.components.scene?.assetId || '',
      material: record.version.components.material?.assetId || '',
      model: record.version.components.model?.assetId || '',
      copyLayout: record.version.components.copyLayout?.assetId || '',
      modelId: record.version.defaults.modelId || '',
      aspectRatio: record.version.defaults.aspectRatio || '',
      imageSize: record.version.defaults.imageSize || '',
    });
    setBaseModalOpen(true);
  };

  const saveBase = async () => {
    if (!baseForm.name.trim() || !baseForm.category.trim()) return setError('请填写基座名称和类目');
    const components: CategoryBaseComponents = {};
    for (const { key } of SLOT_KEYS) {
      const assetId = baseForm[key];
      const record = assetLookup.get(assetId);
      if (record) components[key] = {
        assetId: record.asset.id,
        versionId: record.version.id,
        version: record.version.version,
      };
    }
    if (Object.keys(components).length === 0) return setError('至少选择一个资产槽位');
    setSaving(true);
    setError('');
    try {
      await api(editingBase ? `/api/category-bases/${editingBase.base.id}` : '/api/category-bases', {
        method: editingBase ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: baseForm.name,
          category: baseForm.category,
          description: baseForm.description,
          status: 'active',
          components,
          defaults: {
            modelId: baseForm.modelId || undefined,
            aspectRatio: baseForm.aspectRatio || undefined,
            imageSize: baseForm.imageSize || undefined,
          },
          changeNote: editingBase ? '调整基座组合' : '首次创建',
        }),
      });
      setBaseModalOpen(false);
      await loadAll();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存基座失败');
    } finally {
      setSaving(false);
    }
  };

  const archiveBase = async (record: CategoryBaseRecord) => {
    if (!window.confirm(`归档基座“${record.base.name}”？`)) return;
    try {
      await api(`/api/category-bases/${record.base.id}`, { method: 'DELETE' });
      await loadAll();
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : '归档失败');
    }
  };

  return (
    <div className="space-y-7 pb-16">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="section-label mb-3 text-[#ff3b30]">Brand Foundation</div>
          <h1 className="text-4xl font-black tracking-tighter text-black">品牌基座库</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6e6e73]">把视觉、场景、材质、模特和文案排版拆开沉淀，再自由拼成可复用的类目方案。</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`rounded-full border px-3 py-1.5 text-[11px] font-bold ${storageConfigured ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
            {storageConfigured ? '私有图片库已连接' : '等待绑定 Railway Bucket'}
          </span>
          <button
            onClick={() => tab === 'bases' ? openNewBase() : openNewAsset(tab)}
            className="flex items-center gap-2 rounded-xl bg-black px-4 py-2.5 text-xs font-black text-white shadow-lg transition hover:-translate-y-0.5"
          >
            <Plus size={15} /> {tab === 'bases' ? '新建类目基座' : `新增${TYPE_META[tab].label}`}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
        <button onClick={() => setTab('bases')} className={`rounded-2xl border p-4 text-left transition ${tab === 'bases' ? 'border-black bg-black text-white shadow-xl' : 'border-black/10 bg-white hover:border-black/30'}`}>
          <Boxes size={20} />
          <div className="mt-5 text-[10px] font-black tracking-[0.18em] opacity-60">FOUNDATIONS</div>
          <div className="mt-1 text-sm font-black">类目基座 <span className="opacity-50">{bases.length}</span></div>
        </button>
        {(Object.keys(TYPE_META) as AssetType[]).map(type => {
          const meta = TYPE_META[type];
          const Icon = meta.icon;
          const active = tab === type;
          return (
            <button key={type} onClick={() => setTab(type)} className={`rounded-2xl border p-4 text-left transition ${active ? 'border-black bg-white shadow-xl ring-2 ring-black/5' : 'border-black/10 bg-white hover:border-black/30'}`}>
              <Icon size={20} style={{ color: meta.accent }} />
              <div className="mt-5 text-[10px] font-black tracking-[0.18em] text-[#86868b]">{meta.short}</div>
              <div className="mt-1 text-sm font-black text-black">{meta.label} <span className="text-[#86868b]">{assetsByType[type].length}</span></div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3 rounded-2xl border border-black/10 bg-white px-4 py-3 shadow-sm">
        <Search size={16} className="text-[#86868b]" />
        <input value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索名称、类目或标签" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
        <span className="text-[10px] font-bold text-[#86868b]">{tab === 'bases' ? visibleBases.length : visibleAssets.length} 项</span>
      </div>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}

      {loading ? (
        <div className="flex min-h-[320px] items-center justify-center text-sm font-bold text-[#86868b]">正在读取品牌资产…</div>
      ) : tab === 'bases' ? (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          {visibleBases.map(record => (
            <article key={record.base.id} className="group rounded-[26px] border border-black/10 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[10px] font-black tracking-[0.16em] text-[#86868b]">{record.base.category} · V{record.version.version}</div>
                  <h3 className="mt-2 text-xl font-black tracking-tight">{record.base.name}</h3>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#6e6e73]">{record.base.description || '尚未填写方案说明'}</p>
                </div>
                <div className="flex gap-1 opacity-0 transition group-hover:opacity-100">
                  <button onClick={() => openEditBase(record)} className="rounded-lg px-3 py-2 text-[11px] font-bold hover:bg-black/5">编辑</button>
                  <button onClick={() => archiveBase(record)} className="rounded-lg p-2 text-[#86868b] hover:bg-red-50 hover:text-red-500"><Archive size={15} /></button>
                </div>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {SLOT_KEYS.map(({ key, type }) => {
                  const reference = record.version.components[key];
                  const asset = reference ? assetLookup.get(reference.assetId) : undefined;
                  const meta = TYPE_META[type];
                  return (
                    <div key={key} className={`min-h-[92px] rounded-2xl border p-3 ${asset ? 'border-black/10 bg-[#f7f7f8]' : 'border-dashed border-black/10 bg-white'}`}>
                      <div className="text-[9px] font-black tracking-wider" style={{ color: meta.accent }}>{meta.short}</div>
                      <div className="mt-3 line-clamp-2 text-[11px] font-bold text-black">{asset?.asset.name || '未选择'}</div>
                      {reference && <div className="mt-1 text-[9px] text-[#86868b]">V{reference.version}</div>}
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
          {visibleBases.length === 0 && <EmptyState title="还没有类目基座" description="从各类生产资料中任选组合，保存成可复用方案。" onCreate={openNewBase} />}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {visibleAssets.map(record => {
            const meta = TYPE_META[record.asset.type];
            const firstImage = record.version.imageRefs[0];
            return (
              <article key={record.asset.id} className="group overflow-hidden rounded-[26px] border border-black/10 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl">
                <div className="relative aspect-[16/10] overflow-hidden bg-[#f2f2f3]">
                  {firstImage ? <img src={`/api/storage/objects/${firstImage.objectId}/view`} alt={record.asset.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" /> : (
                    <div className="flex h-full items-center justify-center"><ImageIcon size={30} className="text-black/15" /></div>
                  )}
                  <div className="absolute left-3 top-3 rounded-full bg-black/75 px-2.5 py-1 text-[9px] font-black tracking-widest text-white backdrop-blur">{meta.short} · V{record.version.version}</div>
                  <div className="absolute right-3 top-3 flex gap-1 opacity-0 transition group-hover:opacity-100">
                    <button onClick={() => openEditAsset(record)} className="rounded-lg bg-white/90 px-3 py-2 text-[10px] font-black shadow">编辑</button>
                    <button onClick={() => archiveAsset(record)} className="rounded-lg bg-white/90 p-2 text-[#86868b] shadow hover:text-red-500"><Archive size={14} /></button>
                  </div>
                </div>
                <div className="p-5">
                  <div className="text-[10px] font-bold text-[#86868b]">{record.asset.category || '未分类'}</div>
                  <h3 className="mt-1 text-lg font-black tracking-tight">{record.asset.name}</h3>
                  <p className="mt-2 line-clamp-2 min-h-10 text-xs leading-5 text-[#6e6e73]">{record.version.profile.summary || '尚未填写结构化说明'}</p>
                  <div className="mt-4 flex flex-wrap gap-1.5">{record.asset.tags.slice(0, 4).map(tag => <span key={tag} className="rounded-full bg-black/5 px-2 py-1 text-[9px] font-bold text-[#6e6e73]">{tag}</span>)}</div>
                </div>
              </article>
            );
          })}
          {visibleAssets.length === 0 && <EmptyState title={`还没有${TYPE_META[tab].label}`} description="添加参考图片和规则，后续可自由组合到不同基座。" onCreate={() => openNewAsset(tab)} />}
        </div>
      )}

      {assetModalOpen && (
        <Modal title={editingAsset ? `编辑${TYPE_META[assetForm.type].label}` : `新增${TYPE_META[assetForm.type].label}`} onClose={() => !saving && setAssetModalOpen(false)}>
          <div className="rounded-2xl border border-black/10 bg-[#fafafa] p-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="名称"><input value={assetForm.name} onChange={e => setAssetForm({ ...assetForm, name: e.target.value })} placeholder="例如：AURA 清透海岸" className={CONTROL_CLASS} /></Field>
              <Field label="所属类目"><input value={assetForm.category} onChange={e => setAssetForm({ ...assetForm, category: e.target.value })} placeholder="例如：女士泳装" className={CONTROL_CLASS} /></Field>
            </div>
          </div>

          {assetForm.type === 'copy_layout' && (
            <div className="rounded-2xl border border-fuchsia-200 bg-fuchsia-50/50 p-4">
              <Field label="模板类型">
                <select value={assetForm.templateKind} onChange={e => setAssetForm({ ...assetForm, templateKind: e.target.value })} className={CONTROL_CLASS}>
                  <option value="main_image">主图模板</option>
                  <option value="detail">详情模板</option>
                </select>
              </Field>
            </div>
          )}

          {assetForm.type !== 'copy_layout' && (
            <Field label={`参考图片（最多 ${12 - (editingAsset?.version.imageRefs.length || 0)} 张）`}>
              {editingAsset && editingAsset.version.imageRefs.length > 0 && (
                <div className="mb-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {editingAsset.version.imageRefs.map(reference => (
                    <div key={reference.id} className="aspect-square overflow-hidden rounded-xl border border-black/10 bg-[#f2f2f3]">
                      <img src={`/api/storage/objects/${reference.objectId}/view`} alt="参考图" className="h-full w-full object-cover" />
                    </div>
                  ))}
                </div>
              )}
              <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-6 text-xs font-bold transition ${storageConfigured ? 'border-black/15 bg-[#fafafa] text-[#444] hover:border-black/35 hover:bg-[#f5f5f7]' : 'cursor-not-allowed border-amber-300 bg-amber-50 text-amber-700'}`}>
                <UploadCloud size={18} /> {storageConfigured ? (files.length ? `已选择 ${files.length} 张图片` : '上传参考图 · JPG / PNG / WebP · 单张不超过 15MB') : '请先在 Railway 测试环境绑定 Bucket'}
                <input disabled={!storageConfigured} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={e => setFiles(Array.from(e.target.files || []).slice(0, 12 - (editingAsset?.version.imageRefs.length || 0)))} />
              </label>
            </Field>
          )}

          <Field label={assetForm.type === 'copy_layout' ? '排版提示词' : '提示词'}>
            <textarea
              value={assetForm.promptFragment}
              onChange={e => setAssetForm({ ...assetForm, promptFragment: e.target.value })}
              rows={assetForm.type === 'copy_layout' ? 6 : 5}
              placeholder={assetForm.type === 'copy_layout'
                ? '例如：主标题使用粗宋体，位于左上安全区，控制在 10 字内；核心卖点靠近商品右侧，副文案小一档并保持留白。'
                : '说明这组参考图在生图时要控制什么，例如色调、场景氛围、产品材质或模特特征。'}
              className={`${CONTROL_CLASS} resize-none leading-6`}
            />
          </Field>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setAssetModalOpen(false)} disabled={saving} className="rounded-xl px-4 py-2.5 text-xs font-bold text-[#6e6e73]">取消</button>
            <button onClick={saveAsset} disabled={saving} className="flex items-center gap-2 rounded-xl bg-black px-5 py-2.5 text-xs font-black text-white disabled:opacity-50"><Save size={14} />{saving ? '保存中…' : '保存资产'}</button>
          </div>
        </Modal>
      )}

      {baseModalOpen && (
        <Modal title={editingBase ? '调整类目基座' : '新建类目基座'} onClose={() => !saving && setBaseModalOpen(false)} wide>
          <div className="grid grid-cols-1 gap-4 rounded-2xl border border-black/10 bg-[#fafafa] p-4 md:grid-cols-2">
            <Field label="基座名称"><input value={baseForm.name} onChange={e => setBaseForm({ ...baseForm, name: e.target.value })} placeholder="例如：泳装清透海岸基座" className={CONTROL_CLASS} /></Field>
            <Field label="所属类目"><input value={baseForm.category} onChange={e => setBaseForm({ ...baseForm, category: e.target.value })} placeholder="例如：女士泳装" className={CONTROL_CLASS} /></Field>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {SLOT_KEYS.map(({ key, type }) => {
              const meta = TYPE_META[type];
              return (
                <label key={key} className="rounded-2xl border border-black/10 bg-[#f7f7f8] p-4">
                  <span className="text-[10px] font-black tracking-wider" style={{ color: meta.accent }}>{meta.label}</span>
                  <select value={baseForm[key]} onChange={e => setBaseForm({ ...baseForm, [key]: e.target.value })} className={`${CONTROL_CLASS} mt-3`}>
                    <option value="">不使用</option>
                    {assetsByType[type].map(record => <option key={record.asset.id} value={record.asset.id}>{record.asset.name} · V{record.version.version}</option>)}
                  </select>
                </label>
              );
            })}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setBaseModalOpen(false)} disabled={saving} className="rounded-xl px-4 py-2.5 text-xs font-bold text-[#6e6e73]">取消</button>
            <button onClick={saveBase} disabled={saving} className="flex items-center gap-2 rounded-xl bg-black px-5 py-2.5 text-xs font-black text-white disabled:opacity-50"><Sparkles size={14} />{saving ? '保存中…' : '保存组合'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
};

const EmptyState: React.FC<{ title: string; description: string; onCreate: () => void }> = ({ title, description, onCreate }) => (
  <div className="col-span-full flex min-h-[300px] flex-col items-center justify-center rounded-[26px] border border-dashed border-black/15 bg-white text-center">
    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-black text-white"><Plus size={20} /></div>
    <h3 className="mt-5 text-lg font-black">{title}</h3>
    <p className="mt-2 text-xs text-[#86868b]">{description}</p>
    <button onClick={onCreate} className="mt-5 rounded-xl border border-black/10 px-4 py-2 text-xs font-black hover:bg-black hover:text-white">立即创建</button>
  </div>
);

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block space-y-2">
    <span className="text-[10px] font-black tracking-wider text-[#6e6e73]">{label}</span>
    {children}
  </label>
);

const Modal: React.FC<{ title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }> = ({ title, children, onClose, wide }) => (
  <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
    <div className={`max-h-[92vh] w-full overflow-y-auto rounded-[28px] border border-white/20 bg-white p-6 shadow-2xl ${wide ? 'max-w-4xl' : 'max-w-3xl'}`}>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-black tracking-tight">{title}</h2>
        <button onClick={onClose} className="rounded-full p-2 text-[#86868b] hover:bg-black/5"><X size={18} /></button>
      </div>
      <div className="space-y-5">{children}</div>
    </div>
  </div>
);
