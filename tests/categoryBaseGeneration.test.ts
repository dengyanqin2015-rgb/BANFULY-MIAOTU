import assert from 'node:assert/strict';
import {
  compileCategoryBasePrompt,
  compileProductionMaterialsPrompt,
  getCategoryBaseReferenceCount,
  shouldUseModelMaterial,
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
      referenceImages: [
        { id: 'image-1', role: 'source', objectId: 'object-1', sortOrder: 0, viewUrl: '/view/1' },
        { id: 'image-2', role: 'reference', objectId: 'object-2', sortOrder: 1, viewUrl: '/view/2' },
      ],
    },
    {
      key: 'scene', assetId: 'scene-1', assetName: '海滩场景', assetType: 'scene',
      versionId: 'scene-version-1', version: 1, profile: profile('日光海滩'),
      referenceImages: [],
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
assert.equal(getCategoryBaseReferenceCount(context), 2);
assert.equal(getCategoryBaseReferenceCount(null), 0);
assert.equal(shouldUseModelMaterial('纯产品平铺主图，不要人物'), false);
assert.equal(shouldUseModelMaterial('生成一张白底商品主图'), false);
assert.equal(shouldUseModelMaterial('成年女性模特穿着泳装拍摄全身主图'), true);
assert.equal(shouldUseModelMaterial('模特穿搭，但画面不要人物'), false);

const copyLayoutContext = {
  base: undefined,
  slots: [{
    key: 'copyLayout' as const,
    assetId: 'copy-1', assetName: '主图左上标题', assetType: 'copy_layout' as const,
    versionId: 'copy-version-1', version: 1,
    profile: {
      ...profile('简洁电商文案排版'),
      attributes: {
        templateKind: 'main_image', headlineFont: '现代黑体', headlineSize: '画面宽度8%',
        headlinePosition: '左上安全区', headlineMaxChars: 10, headlineDirection: '核心利益点',
        sellingPointPosition: '商品右侧', sellingPointMaxChars: 16, sellingPointDirection: '差异化卖点',
        subcopyFont: '细黑体', subcopySize: '主标题的45%', subcopyPosition: '标题下方',
        subcopyMaxChars: 20, subcopyDirection: '使用场景佐证',
      },
    },
    referenceImages: [],
  }],
};
const copyPrompt = compileProductionMaterialsPrompt('商品名称必须写“清透一夏”', copyLayoutContext, 2);
assert.doesNotMatch(copyPrompt, /对应输入参考图/);
assert.match(copyPrompt, /主标题字体：现代黑体/);
assert.match(copyPrompt, /主标题不超过10字/);
assert.match(copyPrompt, /用户明确给出的文案必须原样保留/);

const productContract = compileProductionMaterialsPrompt('卧室中的落地衣架盖布主图', context, 2);
assert.match(productContract, /手动产品参考图｜图1—图2｜最高视觉优先级/);
assert.match(productContract, /VI视觉系统[\s\S]*对应输入参考图：图3、图4/);
assert.match(productContract, /不得复制参考图中的商品、人物、Logo、品牌名或具体文案/);
assert.match(productContract, /场景[\s\S]*严禁复制场景参考图中的商品、人物、品牌和文字/);

const suppressedModelPrompt = compileProductionMaterialsPrompt('纯产品平铺主图', {
  slots: [],
  modelMaterialSuppressed: true,
});
assert.match(suppressedModelPrompt, /模特参考图不参与，也不要擅自添加人物/);

console.log('category base generation tests passed');
