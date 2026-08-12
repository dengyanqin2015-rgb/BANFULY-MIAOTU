import assert from 'node:assert/strict';
import {
  AssetValidationError,
  normalizeAssetWriteInput,
  normalizeCategoryBaseWriteInput,
  paginateInMemory,
  parseAssetPageOptions,
} from '../src/lib/assetLibrary';

const visualSystem = normalizeAssetWriteInput({
  type: 'visual_system',
  name: ' AURA 清透视觉 ',
  category: '女士泳装',
  tags: ['清透', '轻奢', '清透'],
  sourceKind: 'image_extraction',
  profile: {
    summary: '低饱和蓝白配色',
    promptFragment: '保持清透、自然光和大面积留白。',
    negativePrompt: '避免高饱和霓虹色。',
    lockedFields: ['品牌色', '品牌色'],
    variableFields: ['场景'],
    attributes: { primaryColors: ['#D8EEF4', '#F7F4EC'] },
    confidence: 1.8,
  },
  imageRefs: [{
    id: 'source-1',
    role: 'source',
    objectId: 'storage-object-1',
    width: 1200,
    height: 1600,
  }],
});

assert.equal(visualSystem.name, 'AURA 清透视觉');
assert.deepEqual(visualSystem.tags, ['清透', '轻奢']);
assert.equal(visualSystem.profile.confidence, 1);
assert.deepEqual(visualSystem.profile.lockedFields, ['品牌色']);
assert.equal(visualSystem.imageRefs[0].sortOrder, 0);

assert.throws(
  () => normalizeAssetWriteInput({
    type: 'visual_system',
    name: '错误图片',
    imageRefs: [{ role: 'source', objectId: '' }],
  }),
  (error: unknown) => error instanceof AssetValidationError && /对象ID不能为空/.test(error.message),
);

assert.throws(
  () => normalizeAssetWriteInput({ type: 'unknown', name: '无效类型' }),
  (error: unknown) => error instanceof AssetValidationError && /资产类型无效/.test(error.message),
);

const categoryBase = normalizeCategoryBaseWriteInput({
  name: '泳装｜清透海滩｜亚洲女性',
  category: '女士泳装',
  description: '基础泳装类目方案',
  components: {
    visualSystem: { assetId: 'asset-1', versionId: 'version-1', version: 1 },
    scene: { assetId: 'asset-2', versionId: 'version-2', version: 3 },
  },
  defaults: { modelId: 'gemini-3.1-flash-image-preview', aspectRatio: '4:5' },
});

assert.equal(categoryBase.components.scene?.version, 3);
assert.equal(categoryBase.defaults.aspectRatio, '4:5');

const copyLayout = normalizeAssetWriteInput({
  type: 'copy_layout', name: '主图左上标题模板', category: '泳装', status: 'active', sourceKind: 'manual',
  profile: {
    summary: '主图文案结构', promptFragment: '文字清晰、层级明确', negativePrompt: '',
    lockedFields: ['标题位置'], variableFields: ['具体文案'],
    attributes: { templateKind: 'main_image', headlineMaxChars: 10 },
  }, imageRefs: [],
});
assert.equal(copyLayout.type, 'copy_layout');
assert.equal(copyLayout.profile.attributes.headlineMaxChars, 10);

assert.throws(
  () => normalizeCategoryBaseWriteInput({ name: '空基座', category: '泳装', components: {} }),
  (error: unknown) => error instanceof AssetValidationError && /至少需要选择一个资产/.test(error.message),
);

assert.deepEqual(parseAssetPageOptions({ page: '-2', pageSize: '1000', type: 'scene' }), {
  page: 1,
  pageSize: 100,
  type: 'scene',
  category: undefined,
  status: undefined,
  search: undefined,
});

assert.deepEqual(paginateInMemory([1, 2, 3, 4, 5], 2, 2), {
  items: [3, 4],
  total: 5,
  page: 2,
  pageSize: 2,
});

console.log('asset library domain tests passed');
