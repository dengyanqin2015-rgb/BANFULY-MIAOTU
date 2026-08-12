import assert from 'node:assert/strict';
import {
  compileCategoryBasePrompt,
  getCategoryBaseReferenceCount,
  type CategoryBaseGenerationContext,
} from '../src/lib/categoryBaseGeneration';

const profile = (promptFragment: string, negativePrompt = '') => ({
  summary: `${promptFragment}摘要`,
  promptFragment,
  negativePrompt,
  lockedFields: ['品牌色'],
  variableFields: ['商品'],
  attributes: {},
});

const context: CategoryBaseGenerationContext = {
  baseId: 'base-1',
  baseName: '夏日泳装基座',
  category: '泳装',
  description: '统一明亮商业视觉',
  versionId: 'base-version-2',
  version: 2,
  defaults: { aspectRatio: '4:5', negativePrompt: '不要水印' },
  slots: [
    {
      key: 'visualSystem', assetId: 'vi-1', assetName: '海岸VI', assetType: 'visual_system',
      versionId: 'vi-version-3', version: 3, profile: profile('蓝白品牌视觉', '不要脏色'),
      referenceImage: { id: 'image-1', role: 'source', objectId: 'object-1', sortOrder: 0, viewUrl: '/view/1' },
    },
    {
      key: 'scene', assetId: 'scene-1', assetName: '海滩场景', assetType: 'scene',
      versionId: 'scene-version-1', version: 1, profile: profile('日光海滩'),
    },
  ],
};

assert.equal(compileCategoryBasePrompt('白底商品主图'), '白底商品主图', '未选择基座时必须原样返回');
const compiled = compileCategoryBasePrompt('白底商品主图', context);
assert.ok(compiled.startsWith('【用户当前生图任务｜最高优先级】\n白底商品主图'));
assert.match(compiled, /【类目基座｜夏日泳装基座｜泳装｜V2】/);
assert.match(compiled, /【VI视觉系统｜海岸VI｜V3】/);
assert.match(compiled, /【场景｜海滩场景｜V1】/);
assert.match(compiled, /不要水印；不要脏色/);
assert.equal(getCategoryBaseReferenceCount(context), 1);
assert.equal(getCategoryBaseReferenceCount(null), 0);

console.log('category base generation tests passed');
