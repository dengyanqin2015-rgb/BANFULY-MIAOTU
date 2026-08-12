import type {
  AssetImageReference,
  AssetProfile,
  AssetType,
  CategoryBaseDefaults,
} from './assetLibrary';

export const CATEGORY_BASE_SLOT_KEYS = ['visualSystem', 'scene', 'material', 'model', 'copyLayout'] as const;
export type CategoryBaseSlotKey = (typeof CATEGORY_BASE_SLOT_KEYS)[number];

export interface CategoryBaseGenerationSlot {
  key: CategoryBaseSlotKey;
  assetId: string;
  assetName: string;
  assetType: AssetType;
  versionId: string;
  version: number;
  profile: AssetProfile;
  referenceImage?: AssetImageReference & { viewUrl: string };
}

export interface CategoryBaseGenerationContext {
  baseId: string;
  baseName: string;
  category: string;
  description: string;
  versionId: string;
  version: number;
  defaults: CategoryBaseDefaults;
  slots: CategoryBaseGenerationSlot[];
}

export interface SelectedAssetMaterial {
  assetId: string;
  versionId: string;
  name: string;
  version: number;
  type: AssetType;
}

export interface ProductionMaterialSelection {
  base?: {
    id: string;
    versionId: string;
    name: string;
    version: number;
  };
  overrides: Partial<Record<CategoryBaseSlotKey, SelectedAssetMaterial | null>>;
}

export interface ProductionMaterialContext {
  base?: Omit<CategoryBaseGenerationContext, 'slots'>;
  slots: CategoryBaseGenerationSlot[];
  modelMaterialSuppressed?: boolean;
}

const SLOT_LABELS: Record<CategoryBaseSlotKey, string> = {
  visualSystem: 'VI视觉系统',
  scene: '场景',
  material: '材质',
  model: '模特',
  copyLayout: '文案排版',
};

const compactText = (value: string | undefined, maxLength: number) => {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ');
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}…` : normalized;
};

const MODEL_EXCLUDED_PATTERN = /(?:不要|不需要|无需|禁止|去掉|移除)(?:任何)?(?:人物|人像|真人|模特)|(?:无人|无人物|不含人物|纯产品|产品平铺|静物平铺|only\s+product|product\s+only|no\s+(?:people|person|model))/i;
const MODEL_REQUESTED_PATTERN = /(?:人物|人像|真人|模特|上身|试穿|穿着|穿搭|佩戴|手持|半身|全身|肖像|成年(?:男性|女性|男人|女人)|model|person|people|woman|women|man|men|wearing|try[- ]?on|portrait)/i;

export const shouldUseModelMaterial = (prompt: string) => {
  const normalized = String(prompt || '').trim();
  if (!normalized || MODEL_EXCLUDED_PATTERN.test(normalized)) return false;
  return MODEL_REQUESTED_PATTERN.test(normalized);
};

export const compileProductionMaterialsPrompt = (
  userPrompt: string,
  context?: ProductionMaterialContext | null,
  manualReferenceCount = 0,
): string => {
  if (!context || (!context.base && context.slots.length === 0 && !context.modelMaterialSuppressed)) return userPrompt;

  let referenceIndex = manualReferenceCount;
  const sections = context.slots.flatMap(slot => {
    const primary = compactText(slot.profile.promptFragment, 1500) || compactText(slot.profile.summary, 500);
    const referenceNumber = slot.referenceImage ? ++referenceIndex : null;
    const layout = slot.key === 'copyLayout' ? slot.profile.attributes : null;
    const layoutRules = layout ? [
      layout.templateKind && `模板用途：${layout.templateKind === 'detail' ? '详情模板' : '主图模板'}`,
      layout.headlineFont && `主标题字体：${layout.headlineFont}`,
      layout.headlineSize && `主标题字号：${layout.headlineSize}`,
      layout.headlinePosition && `主标题位置：${layout.headlinePosition}`,
      Number(layout.headlineMaxChars) > 0 && `主标题不超过${layout.headlineMaxChars}字`,
      layout.headlineDirection && `主标题内容方向：${layout.headlineDirection}`,
      layout.sellingPointPosition && `核心卖点位置：${layout.sellingPointPosition}`,
      Number(layout.sellingPointMaxChars) > 0 && `核心卖点不超过${layout.sellingPointMaxChars}字`,
      layout.sellingPointDirection && `核心卖点方向：${layout.sellingPointDirection}`,
      layout.subcopyFont && `副文案字体：${layout.subcopyFont}`,
      layout.subcopySize && `副文案字号：${layout.subcopySize}`,
      layout.subcopyPosition && `副文案位置：${layout.subcopyPosition}`,
      Number(layout.subcopyMaxChars) > 0 && `副文案不超过${layout.subcopyMaxChars}字`,
      layout.subcopyDirection && `副文案方向：${layout.subcopyDirection}`,
    ].filter(Boolean) : [];
    const details = [
      referenceNumber && `对应输入参考图：图${referenceNumber}`,
      primary && `正向约束：${primary}`,
      ...layoutRules,
      slot.profile.lockedFields.length && `必须保持：${slot.profile.lockedFields.slice(0, 12).join('、')}`,
      slot.profile.variableFields.length && `允许变化：${slot.profile.variableFields.slice(0, 12).join('、')}`,
    ].filter(Boolean);
    return details.length
      ? [`【${SLOT_LABELS[slot.key]}｜${slot.assetName}｜V${slot.version}】\n${details.join('\n')}`]
      : [];
  });

  const negatives = [
    context.base?.defaults.negativePrompt,
    ...context.slots.map(slot => slot.profile.negativePrompt),
  ].map(value => compactText(value, 600)).filter(Boolean);

  return [
    '【用户当前生图任务｜最高优先级】',
    userPrompt.trim(),
    '',
    context.base
      ? `【类目基座｜${context.base.baseName}｜${context.base.category || '未分类'}｜V${context.base.version}】`
      : '【手动组合生产资料】',
    compactText(context.base?.description, 500),
    context.modelMaterialSuppressed ? '【模特资料】本次任务没有明确要求人物，模特参考图不参与，也不要擅自添加人物。' : '',
    ...sections,
    negatives.length ? `【避免事项】\n${[...new Set(negatives)].join('；')}` : '',
    '【执行规则】用户当前任务决定本次画面内容；生产资料分别提供视觉、场景、材质、模特和文案排版约束。参考图必须按对应模块理解，不得相互越权。用户明确给出的文案必须原样保留；仅当用户没有提供具体文案时，才按文案排版模板的内容方向生成短文案。不要把参考图中的商品、文字或人物机械复制到成图中，除非用户明确要求。',
  ].filter(Boolean).join('\n');
};

export const compileCategoryBasePrompt = (
  userPrompt: string,
  context?: CategoryBaseGenerationContext | null,
): string => compileProductionMaterialsPrompt(
  userPrompt,
  context ? {
    base: {
      baseId: context.baseId,
      baseName: context.baseName,
      category: context.category,
      description: context.description,
      versionId: context.versionId,
      version: context.version,
      defaults: context.defaults,
    },
    slots: context.slots,
  } : null,
);

export const getCategoryBaseReferenceCount = (context?: CategoryBaseGenerationContext | null) =>
  context?.slots.filter(slot => slot.referenceImage).length ?? 0;
