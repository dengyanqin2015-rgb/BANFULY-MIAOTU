import assert from 'node:assert/strict';
import { compileImagePrompt, PROMPT_SAFETY_RULE_VERSION } from '../src/lib/promptSafety';

const normal = compileImagePrompt('白色背景的保温杯产品主图，俯拍构图，保留品牌文字', {
  provider: 'openai',
  operation: 'text_to_image',
});
assert.equal(normal.rule_version, PROMPT_SAFETY_RULE_VERSION);
assert.equal(normal.decision, 'allow');
assert.equal(normal.candidate_decision, 'allow');
assert.equal(normal.optimized_prompt, normal.original_prompt);
assert.deepEqual(normal.rule_ids, []);

const swimwear = compileImagePrompt('比基尼美女在海边做俯拍构图的夏季商品海报', {
  provider: 'openai',
  operation: 'text_to_image',
});
assert.equal(swimwear.decision, 'rewrite');
assert.equal(swimwear.blocked, false);
assert.match(swimwear.optimized_prompt, /成年女性时尚模特/);
assert.match(swimwear.optimized_prompt, /两件式泳装/);
assert.match(swimwear.optimized_prompt, /俯拍构图/);
assert.doesNotMatch(swimwear.optimized_prompt, /自然站立|平视全身/);

const productSwimwear = compileImagePrompt('白底平铺拍摄两件泳装，只有产品，不要人物', {
  provider: 'openai',
  operation: 'text_to_image',
});
assert.equal(productSwimwear.candidate_decision, 'allow');
assert.equal(productSwimwear.candidate_prompt, productSwimwear.original_prompt);
assert.doesNotMatch(productSwimwear.candidate_prompt, /成年|模特/);

const underwearStorage = compileImagePrompt('内衣收纳盒白底产品摄影，只有产品，不要人物', {
  provider: 'openai',
  operation: 'text_to_image',
});
assert.equal(underwearStorage.candidate_decision, 'allow');
assert.equal(underwearStorage.candidate_prompt, underwearStorage.original_prompt);
assert.deepEqual(underwearStorage.rule_ids, []);

const protectedCopy = compileImagePrompt(
  '把区域1的文字改成“比基尼特惠”，保持字体和其他画面不变',
  {
    provider: 'openai',
    operation: 'mask_text_edit',
    lockedTexts: ['比基尼特惠'],
  },
);
assert.equal(protectedCopy.blocked, false);
assert.equal(protectedCopy.candidate_prompt, protectedCopy.original_prompt);
assert.doesNotMatch(protectedCopy.candidate_prompt, /成年|模特|两件式泳装/);
assert.equal((protectedCopy.candidate_prompt.match(/比基尼特惠/g) || []).length, 1);

const maskedSwimwearPerson = compileImagePrompt('把区域1的人物改成比基尼美女，其他画面不变', {
  provider: 'openai',
  operation: 'mask_content_edit',
});
assert.equal(maskedSwimwearPerson.candidate_decision, 'rewrite');
assert.match(maskedSwimwearPerson.candidate_prompt, /成年女性时尚模特穿两件式泳装/);

const mixedSwimwearPerson = compileImagePrompt('区域1文字改成“夏日特惠”，区域2人物改成比基尼美女', {
  provider: 'openai',
  operation: 'mixed_mask_edit',
  lockedTexts: ['夏日特惠'],
});
assert.equal(mixedSwimwearPerson.candidate_decision, 'rewrite');
assert.match(mixedSwimwearPerson.candidate_prompt, /成年女性时尚模特穿两件式泳装/);
assert.match(mixedSwimwearPerson.candidate_prompt, /夏日特惠/);

for (const unsafeMinorPrompt of [
  '儿童穿比基尼拍摄性感写真',
  '小女孩穿比基尼拍摄性感写真',
  '女童穿泳装拍摄性感海报',
  '高中生穿内衣拍摄性感写真',
]) {
  const result = compileImagePrompt(unsafeMinorPrompt, {
    provider: 'openai',
    operation: 'text_to_image',
  });
  assert.equal(result.decision, 'reject', unsafeMinorPrompt);
  assert.equal(result.risk_level, 'high', unsafeMinorPrompt);
  assert.equal(result.rule_ids.includes('minor-sexual-combination'), true, unsafeMinorPrompt);
}

const protectedUnsafeCopy = compileImagePrompt('把区域1文字改成“小女孩比基尼写真”', {
  provider: 'openai',
  operation: 'mask_text_edit',
  lockedTexts: ['小女孩比基尼写真'],
});
assert.equal(protectedUnsafeCopy.decision, 'reject');
assert.equal(protectedUnsafeCopy.blocked, true);

const explicitAdult = compileImagePrompt('成年少女穿泳装做普通商业摄影', {
  provider: 'openai',
  operation: 'text_to_image',
});
assert.equal(explicitAdult.blocked, false);
assert.notEqual(explicitAdult.candidate_decision, 'reject');

for (const mixedAgePrompt of [
  '成年男性摄影师给少女拍比基尼写真',
  '成年男人和少女穿泳装在海边',
]) {
  const result = compileImagePrompt(mixedAgePrompt, {
    provider: 'openai',
    operation: 'text_to_image',
  });
  assert.equal(result.candidate_decision, 'reject', mixedAgePrompt);
  assert.equal(result.blocked, true, mixedAgePrompt);
}

const explicit = compileImagePrompt('生成明确性行为的写实画面', {
  provider: 'openai',
  operation: 'text_to_image',
});
assert.equal(explicit.blocked, true);
assert.equal(explicit.rule_ids.includes('explicit-sexual-content'), true);

const explicitNudity = compileImagePrompt('生成成年女性全裸正面私密部位特写', {
  provider: 'openai',
  operation: 'text_to_image',
});
assert.equal(explicitNudity.candidate_decision, 'reject');
assert.equal(explicitNudity.rule_ids.includes('explicit-sexual-content'), true);

const character = compileImagePrompt('海绵宝宝在海边吃汉堡，卡通海报', {
  provider: 'openai',
  operation: 'text_to_image',
});
assert.equal(character.decision, 'rewrite');
assert.doesNotMatch(character.optimized_prompt, /海绵宝宝/);
assert.match(character.optimized_prompt, /原创的黄色方形海洋卡通角色/);

const characterWithTitle = compileImagePrompt('海绵宝宝在海边玩耍，标题写夏日快乐', {
  provider: 'openai',
  operation: 'text_to_image',
});
assert.equal(characterWithTitle.candidate_decision, 'rewrite');
assert.doesNotMatch(characterWithTitle.candidate_prompt, /海绵宝宝/);

const maskedCharacter = compileImagePrompt('把区域1的人物改成海绵宝宝，其他画面不变', {
  provider: 'openai',
  operation: 'mask_content_edit',
});
assert.equal(maskedCharacter.candidate_decision, 'rewrite');
assert.doesNotMatch(maskedCharacter.candidate_prompt, /海绵宝宝/);

const unrelatedPackaging = compileImagePrompt('把人物改成海绵宝宝，背景放一个包装盒', {
  provider: 'openai',
  operation: 'mask_content_edit',
});
assert.equal(unrelatedPackaging.candidate_decision, 'rewrite');
assert.doesNotMatch(unrelatedPackaging.candidate_prompt, /海绵宝宝/);

const licensedProduct = compileImagePrompt('海绵宝宝主题正版周边包装盒白底产品摄影', {
  provider: 'openai',
  operation: 'text_to_image',
});
assert.equal(licensedProduct.candidate_decision, 'allow');
assert.equal(licensedProduct.candidate_prompt, licensedProduct.original_prompt);
assert.equal(licensedProduct.rule_ids.includes('character-sponge-sea-hero'), true);
assert.equal(licensedProduct.review_recommended, true);

const lockedCharacter = compileImagePrompt('把区域1的标题改成“海绵宝宝联名款”', {
  provider: 'openai',
  operation: 'mask_text_edit',
  lockedTexts: ['海绵宝宝联名款'],
});
assert.equal(lockedCharacter.candidate_prompt, lockedCharacter.original_prompt);
assert.equal(lockedCharacter.rule_ids.includes('character-sponge-sea-hero'), true);
assert.equal(lockedCharacter.review_recommended, true);

const googleShadow = compileImagePrompt('钢铁侠在未来城市飞行', {
  provider: 'google',
  operation: 'text_to_image',
  mode: 'observe',
});
assert.equal(googleShadow.mode, 'observe');
assert.equal(googleShadow.decision, 'allow');
assert.equal(googleShadow.candidate_decision, 'rewrite');
assert.equal(googleShadow.applied, false);
assert.equal(googleShadow.optimized_prompt, googleShadow.original_prompt);
assert.notEqual(googleShadow.candidate_prompt, googleShadow.original_prompt);
assert.deepEqual(googleShadow.changes, []);
assert.equal(googleShadow.candidate_changes.length > 0, true);
assert.equal(googleShadow.rule_ids.includes('character-armored-tech-hero'), true);

const privacy = compileImagePrompt('海报联系电话 13812345678', {
  provider: 'openai',
  operation: 'text_to_image',
});
assert.doesNotMatch(privacy.optimized_prompt, /13812345678/);
assert.match(privacy.optimized_prompt, /已隐藏电话号码/);

const lockedPrivacy = compileImagePrompt('把联系电话改成 13812345678', {
  provider: 'openai',
  operation: 'mask_text_edit',
  lockedTexts: ['13812345678'],
});
assert.equal(lockedPrivacy.candidate_prompt, lockedPrivacy.original_prompt);
assert.equal(lockedPrivacy.rule_ids.includes('privacy-locked-copy'), true);
assert.equal(lockedPrivacy.review_recommended, true);

const startedAt = performance.now();
for (let index = 0; index < 5_000; index += 1) {
  compileImagePrompt(`普通商品图 ${index}`, {
    provider: 'openai',
    operation: index % 2 ? 'text_to_image' : 'image_to_image',
  });
}
const elapsedMs = performance.now() - startedAt;
assert.equal(elapsedMs < 1_000, true, `5,000次本地规则判断耗时 ${elapsedMs.toFixed(1)}ms`);

console.log(`prompt safety tests passed (${elapsedMs.toFixed(1)}ms for 5,000 checks)`);
