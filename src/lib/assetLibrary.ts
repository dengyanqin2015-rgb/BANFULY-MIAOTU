export const ASSET_TYPES = ['visual_system', 'scene', 'material', 'model'] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const ASSET_STATUSES = ['active', 'archived'] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const ASSET_SOURCE_KINDS = ['manual', 'image_extraction', 'ai_generated', 'imported'] as const;
export type AssetSourceKind = (typeof ASSET_SOURCE_KINDS)[number];

export const ASSET_IMAGE_ROLES = [
  'source',
  'reference',
  'thumbnail',
  'logo',
  'font_sample',
  'palette',
  'other',
] as const;
export type AssetImageRole = (typeof ASSET_IMAGE_ROLES)[number];

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface AssetImageReference {
  id: string;
  role: AssetImageRole;
  objectId: string;
  url?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  sortOrder: number;
}

export interface AssetProfile {
  summary: string;
  promptFragment: string;
  negativePrompt: string;
  lockedFields: string[];
  variableFields: string[];
  attributes: Record<string, JsonValue>;
  confidence?: number;
}

export interface AssetItem {
  id: string;
  userId: string;
  type: AssetType;
  name: string;
  category: string;
  tags: string[];
  status: AssetStatus;
  currentVersion: number;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface AssetVersion {
  id: string;
  assetId: string;
  userId: string;
  version: number;
  sourceKind: AssetSourceKind;
  profile: AssetProfile;
  imageRefs: AssetImageReference[];
  changeNote: string;
  createdAt: number;
}

export interface AssetRecord {
  asset: AssetItem;
  version: AssetVersion;
}

export interface AssetVersionReference {
  assetId: string;
  versionId: string;
  version: number;
}

export interface CategoryBaseComponents {
  visualSystem?: AssetVersionReference;
  scene?: AssetVersionReference;
  material?: AssetVersionReference;
  model?: AssetVersionReference;
}

export interface CategoryBaseDefaults {
  modelId?: string;
  aspectRatio?: string;
  imageSize?: string;
  quality?: string;
  negativePrompt?: string;
}

export interface CategoryBase {
  id: string;
  userId: string;
  name: string;
  category: string;
  description: string;
  status: AssetStatus;
  currentVersion: number;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface CategoryBaseVersion {
  id: string;
  baseId: string;
  userId: string;
  version: number;
  components: CategoryBaseComponents;
  defaults: CategoryBaseDefaults;
  changeNote: string;
  createdAt: number;
}

export interface CategoryBaseRecord {
  base: CategoryBase;
  version: CategoryBaseVersion;
}

export interface AssetWriteInput {
  type: AssetType;
  name: string;
  category: string;
  tags: string[];
  status: AssetStatus;
  sourceKind: AssetSourceKind;
  profile: AssetProfile;
  imageRefs: AssetImageReference[];
  changeNote: string;
}

export interface CategoryBaseWriteInput {
  name: string;
  category: string;
  description: string;
  status: AssetStatus;
  components: CategoryBaseComponents;
  defaults: CategoryBaseDefaults;
  changeNote: string;
}

export interface AssetPageOptions {
  page: number;
  pageSize: number;
  type?: AssetType;
  category?: string;
  status?: AssetStatus;
  search?: string;
}

export interface CategoryBasePageOptions {
  page: number;
  pageSize: number;
  category?: string;
  status?: AssetStatus;
  search?: string;
}

export interface PaginatedAssetResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export class AssetValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssetValidationError';
  }
}

const text = (value: unknown, maxLength: number): string => String(value ?? '').trim().slice(0, maxLength);

const requireText = (value: unknown, label: string, maxLength: number): string => {
  const normalized = text(value, maxLength);
  if (!normalized) throw new AssetValidationError(`${label}不能为空`);
  return normalized;
};

const stringList = (value: unknown, maxItems: number, maxLength: number): string[] => {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => text(item, maxLength)).filter(Boolean))].slice(0, maxItems);
};

const recordValue = (value: unknown): Record<string, JsonValue> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const serialized = JSON.stringify(value);
  if (serialized.length > 64 * 1024) throw new AssetValidationError('资产结构化属性不能超过64KB');
  return JSON.parse(serialized) as Record<string, JsonValue>;
};

const optionalPositiveInteger = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

export const isAssetType = (value: unknown): value is AssetType =>
  ASSET_TYPES.includes(value as AssetType);

export const isAssetStatus = (value: unknown): value is AssetStatus =>
  ASSET_STATUSES.includes(value as AssetStatus);

const normalizeImageRefs = (value: unknown): AssetImageReference[] => {
  if (!Array.isArray(value)) return [];
  if (value.length > 12) throw new AssetValidationError('单个资产最多保存12张参考图');
  return value.map((item, index) => {
    const source = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const role = ASSET_IMAGE_ROLES.includes(source.role as AssetImageRole)
      ? source.role as AssetImageRole
      : 'reference';
    const objectId = requireText(source.objectId, `第${index + 1}张图片对象ID`, 120);
    return {
      id: text(source.id, 100) || `image-${index + 1}`,
      role,
      objectId,
      mimeType: text(source.mimeType, 100) || undefined,
      width: optionalPositiveInteger(source.width),
      height: optionalPositiveInteger(source.height),
      sortOrder: Number.isInteger(Number(source.sortOrder)) ? Number(source.sortOrder) : index,
    };
  });
};

const normalizeProfile = (value: unknown): AssetProfile => {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const confidenceValue = source.confidence === undefined ? undefined : Number(source.confidence);
  const confidence = Number.isFinite(confidenceValue)
    ? Math.min(1, Math.max(0, confidenceValue as number))
    : undefined;
  return {
    summary: text(source.summary, 2000),
    promptFragment: text(source.promptFragment, 12000),
    negativePrompt: text(source.negativePrompt, 4000),
    lockedFields: stringList(source.lockedFields, 50, 100),
    variableFields: stringList(source.variableFields, 50, 100),
    attributes: recordValue(source.attributes),
    confidence,
  };
};

export const normalizeAssetWriteInput = (value: unknown): AssetWriteInput => {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  if (!isAssetType(source.type)) throw new AssetValidationError('资产类型无效');
  const status = isAssetStatus(source.status) ? source.status : 'active';
  const sourceKind = ASSET_SOURCE_KINDS.includes(source.sourceKind as AssetSourceKind)
    ? source.sourceKind as AssetSourceKind
    : 'manual';
  return {
    type: source.type,
    name: requireText(source.name, '资产名称', 100),
    category: text(source.category, 100),
    tags: stringList(source.tags, 30, 50),
    status,
    sourceKind,
    profile: normalizeProfile(source.profile),
    imageRefs: normalizeImageRefs(source.imageRefs),
    changeNote: text(source.changeNote, 500),
  };
};

const normalizeVersionReference = (value: unknown, label: string): AssetVersionReference | undefined => {
  if (value === undefined || value === null) return undefined;
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const assetId = requireText(source.assetId, `${label}资产ID`, 100);
  const versionId = requireText(source.versionId, `${label}版本ID`, 100);
  const version = optionalPositiveInteger(source.version);
  if (!version) throw new AssetValidationError(`${label}版本号无效`);
  return { assetId, versionId, version };
};

const normalizeBaseDefaults = (value: unknown): CategoryBaseDefaults => {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    modelId: text(source.modelId, 100) || undefined,
    aspectRatio: text(source.aspectRatio, 20) || undefined,
    imageSize: text(source.imageSize, 20) || undefined,
    quality: text(source.quality, 20) || undefined,
    negativePrompt: text(source.negativePrompt, 4000) || undefined,
  };
};

export const normalizeCategoryBaseWriteInput = (value: unknown): CategoryBaseWriteInput => {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const rawComponents = source.components && typeof source.components === 'object'
    ? source.components as Record<string, unknown>
    : {};
  const components: CategoryBaseComponents = {
    visualSystem: normalizeVersionReference(rawComponents.visualSystem, '视觉系统'),
    scene: normalizeVersionReference(rawComponents.scene, '场景'),
    material: normalizeVersionReference(rawComponents.material, '材质'),
    model: normalizeVersionReference(rawComponents.model, '模特'),
  };
  if (!Object.values(components).some(Boolean)) throw new AssetValidationError('类目基座至少需要选择一个资产');
  return {
    name: requireText(source.name, '基座名称', 120),
    category: requireText(source.category, '所属类目', 100),
    description: text(source.description, 1000),
    status: isAssetStatus(source.status) ? source.status : 'active',
    components,
    defaults: normalizeBaseDefaults(source.defaults),
    changeNote: text(source.changeNote, 500),
  };
};

export const parseAssetPageOptions = (query: Record<string, unknown>): AssetPageOptions => {
  const page = Math.max(1, Number.parseInt(String(query.page ?? '1'), 10) || 1);
  const pageSize = Math.min(100, Math.max(10, Number.parseInt(String(query.pageSize ?? '20'), 10) || 20));
  return {
    page,
    pageSize,
    type: isAssetType(query.type) ? query.type : undefined,
    category: text(query.category, 100) || undefined,
    status: isAssetStatus(query.status) ? query.status : undefined,
    search: text(query.search, 100) || undefined,
  };
};

export const parseCategoryBasePageOptions = (query: Record<string, unknown>): CategoryBasePageOptions => {
  const page = Math.max(1, Number.parseInt(String(query.page ?? '1'), 10) || 1);
  const pageSize = Math.min(100, Math.max(10, Number.parseInt(String(query.pageSize ?? '20'), 10) || 20));
  return {
    page,
    pageSize,
    category: text(query.category, 100) || undefined,
    status: isAssetStatus(query.status) ? query.status : undefined,
    search: text(query.search, 100) || undefined,
  };
};

export const paginateInMemory = <T>(items: T[], page: number, pageSize: number): PaginatedAssetResult<T> => {
  const offset = (page - 1) * pageSize;
  return { items: items.slice(offset, offset + pageSize), total: items.length, page, pageSize };
};
