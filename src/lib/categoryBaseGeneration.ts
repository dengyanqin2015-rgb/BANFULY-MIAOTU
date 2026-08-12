import type {
  AssetImageReference,
  AssetProfile,
  AssetType,
  CategoryBaseDefaults,
} from './assetLibrary';

export const CATEGORY_BASE_SLOT_KEYS = ['visualSystem', 'scene', 'material', 'model'] as const;
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

const SLOT_LABELS: Record<CategoryBaseSlotKey, string> = {
  visualSystem: 'VI视觉系统',
  scene: '场景',
  material: '材质',
  model: '模特',
};

const compactText = (value: string | undefined, maxLength: number) => {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ');
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}…` : normalized;
};

export const compileCategoryBasePrompt = (
  userPrompt: string,
  context?: CategoryBaseGenerationContext | null,
): string => {
  if (!context) return userPrompt;

  const sections = context.slots.flatMap(slot => {
    const primary = compactText(slot.profile.promptFragment, 1500) || compactText(slot.profile.summary, 500);
    const details = [
      primary && `正向约束：${primary}`,
      slot.profile.lockedFields.length && `必须保持：${slot.profile.lockedFields.slice(0, 12).join('、')}`,
      slot.profile.variableFields.length && `允许变化：${slot.profile.variableFields.slice(0, 12).join('、')}`,
    ].filter(Boolean);
    return details.length
      ? [`【${SLOT_LABELS[slot.key]}｜${slot.assetName}｜V${slot.version}】\n${details.join('\n')}`]
      : [];
  });

  const negatives = [
    context.defaults.negativePrompt,
    ...context.slots.map(slot => slot.profile.negativePrompt),
  ].map(value => compactText(value, 600)).filter(Boolean);

  return [
    '【用户当前生图任务｜最高优先级】',
    userPrompt.trim(),
    '',
    `【类目基座｜${context.baseName}｜${context.category || '未分类'}｜V${context.version}】`,
    compactText(context.description, 500),
    ...sections,
    negatives.length ? `【避免事项】\n${[...new Set(negatives)].join('；')}` : '',
    '【执行规则】用户当前任务决定本次画面内容；类目基座只提供稳定的视觉、场景、材质和模特约束。参考图按对应模块理解，不要把参考图中的商品、文字或人物机械复制到成图中，除非用户明确要求。',
  ].filter(Boolean).join('\n');
};

export const getCategoryBaseReferenceCount = (context?: CategoryBaseGenerationContext | null) =>
  context?.slots.filter(slot => slot.referenceImage).length ?? 0;
