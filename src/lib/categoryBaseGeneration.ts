import type {
  AssetImageReference,
  AssetProfile,
  AssetType,
  CategoryBaseDefaults,
} from './assetLibrary';

export const CATEGORY_BASE_SLOT_KEYS = ['visualSystem', 'scene', 'material', 'model', 'copyLayout'] as const;
export type CategoryBaseSlotKey = (typeof CATEGORY_BASE_SLOT_KEYS)[number];
export const PRODUCTION_REFERENCE_ORDER: readonly CategoryBaseSlotKey[] = ['model', 'scene', 'material', 'visualSystem', 'copyLayout'];

export interface CategoryBaseGenerationSlot {
  key: CategoryBaseSlotKey;
  assetId: string;
  assetName: string;
  assetType: AssetType;
  versionId: string;
  version: number;
  profile: AssetProfile;
  referenceImages: Array<AssetImageReference & { viewUrl: string }>;
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

const SLOT_REFERENCE_RULES: Record<CategoryBaseSlotKey, string> = {
  visualSystem: '只控制整张图的色彩体系、字体风格、光影、版式、品牌气质和留白。不得复制参考图中的商品、人物、Logo、品牌名或具体文案，不得改变产品主体。',
  scene: '只参考符合当前任务的空间环境、室内风格、家居配色、家具、光线、镜头和构图。严禁复制场景参考图中的商品、人物、品牌和文字，不得改变产品主体。',
  material: '只控制产品表面的面料、纹理、工艺和质感。不得改变产品外形、颜色、图案、结构、部件、比例或品牌身份。',
  model: '仅在当前任务明确需要人物时使用。保持参考模特的面部、成年年龄特征、发型、体型和穿着方式；不得把模特图的背景、文案或其他商品带入成图。',
  copyLayout: '只使用已保存的结构化排版规则，控制字体风格、字号层级、位置、字数和内容方向。不得复制来源图片中的原文、商品、人物或品牌。',
};

const compactText = (value: string | undefined, maxLength: number) => {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ');
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}…` : normalized;
};

const MODEL_PERSON_TERMS = '(?:人物|人像|真人|模特|女人|女性|女士|女模特|美女|男人|男性|男士|男模特|成年人|成人|夫妻|情侣|新娘|新郎|妈妈|母亲|爸爸|父亲|孕妇)';
const MODEL_EXCLUDED_PATTERN = new RegExp(
  `(?:不要|不需要|无需|禁止|去掉|移除)(?:出现|展示|包含|加入|添加|有)?(?:任何|成年)?${MODEL_PERSON_TERMS}|(?:不出现|不展示|不包含)(?:任何|成年)?${MODEL_PERSON_TERMS}|(?:无人|无人物|不含人物|纯产品|产品平铺|静物平铺|only\\s+product|product\\s+only|no\\s+(?:people|person|model|woman|women|man|men))`,
  'i',
);
const MODEL_REQUESTED_PATTERN = new RegExp(
  `(?:${MODEL_PERSON_TERMS}|上身|试穿|穿着|穿搭|佩戴|手持|半身|全身|肖像|model|person|people|woman|women|man|men|wearing|try[- ]?on|portrait)`,
  'i',
);

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
  const manualProductContract = manualReferenceCount > 0
    ? `【手动产品参考图｜图1${manualReferenceCount > 1 ? `—图${manualReferenceCount}` : ''}｜最高视觉优先级】\n这些图片共同定义本次商品主体。必须保持产品外形、颜色、图案、结构、部件和比例一致；多角度图属于同一产品，不得与其他模块中的商品混合或替换。`
    : '';
  const slotsByKey = new Map(context.slots.map(slot => [slot.key, slot]));
  const sections = PRODUCTION_REFERENCE_ORDER.flatMap(key => {
    const slot = slotsByKey.get(key);
    if (!slot) return [];
    const primary = compactText(slot.profile.promptFragment, 1500) || compactText(slot.profile.summary, 500);
    const referenceNumbers = slot.referenceImages.map(() => ++referenceIndex);
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
      referenceNumbers.length && `对应输入参考图：${referenceNumbers.map(number => `图${number}`).join('、')}（同一模块共同理解）`,
      `模块边界：${SLOT_REFERENCE_RULES[slot.key]}`,
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
    manualProductContract,
    context.modelMaterialSuppressed ? '【模特资料】本次任务没有明确要求人物，模特参考图不参与，也不要擅自添加人物。' : '',
    ...sections,
    negatives.length ? `【避免事项】\n${[...new Set(negatives)].join('；')}` : '',
    '【执行顺序】先理解用户当前任务，再锁定手动产品参考图；其后依次应用模特身份、场景环境、材质表现、VI整体风格和文案排版。各模块只在自己的作用范围内生效，不得相互越权。用户明确给出的文案必须原样保留；仅当用户没有提供具体文案时，才按排版规则生成短文案。',
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
  context?.slots.reduce((count, slot) => count + slot.referenceImages.length, 0) ?? 0;
