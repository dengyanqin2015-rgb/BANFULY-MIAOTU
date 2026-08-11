export const PROMPT_SAFETY_RULE_VERSION = '2026-08-11.2';

export type PromptSafetyProvider = 'openai' | 'google';
export type PromptSafetyMode = 'observe' | 'enforce';
export type PromptSafetyOperation =
  | 'text_to_image'
  | 'image_to_image'
  | 'mask_text_edit'
  | 'mask_content_edit'
  | 'mixed_mask_edit';

export interface PromptSafetyChange {
  before: string;
  after: string;
  reason: string;
}

export interface PromptSafetyCompilation {
  rule_version: string;
  mode: PromptSafetyMode;
  provider: PromptSafetyProvider;
  operation: PromptSafetyOperation;
  decision: 'allow' | 'rewrite' | 'reject';
  candidate_decision: 'allow' | 'rewrite' | 'reject';
  applied: boolean;
  risk_level: 'none' | 'low' | 'medium' | 'high';
  risk_reason: string[];
  risk_tags: string[];
  rule_ids: string[];
  original_prompt: string;
  optimized_prompt: string;
  candidate_prompt: string;
  changes: PromptSafetyChange[];
  candidate_changes: PromptSafetyChange[];
  blocked: boolean;
  review_recommended: boolean;
}

interface CompileOptions {
  provider: PromptSafetyProvider;
  operation: PromptSafetyOperation;
  mode?: PromptSafetyMode;
  lockedTexts?: string[];
}

const HARD_MINOR_PATTERN = /儿童|孩子|小孩|幼童|男童|女童|小男孩|小女孩|未成年|未满\s*(?:18|十八)|小学生|初中生|高中生|中学生|校服|child|kid|minor|under\s*18/i;
const AMBIGUOUS_MINOR_PATTERN = /少年|少女|teenager/i;
const ADULT_QUALIFIED_AMBIGUOUS_MINOR_PATTERN = /(?:成年|成人|年满\s*(?:18|十八)|(?:18|十八)岁以上)\s*(?:的)?\s*(?:少女|少年)|adult\s+teenager/gi;
const MINOR_SEXUAL_PATTERN = /性感|色情|裸(?:体|露)?|赤裸|性行为|性交|做爱|挑逗|私密部位|比基尼|泳装|泳衣|内衣|bikini|lingerie|sexual|nude|naked/i;
const EXPLICIT_SEXUAL_PATTERN = /做爱|性交|口交|自慰|明确性行为|色情行为|露骨色情|全裸|明确裸露私密部位|私密部位特写|正面裸露|生殖器|porn(?:ographic)?|explicit\s+sex|sexual\s+act|fully\s+nude|explicit\s+nudity|genitals?/i;
const SWIMWEAR_PATTERN = /比基尼|泳装|泳衣|内衣|bikini|swimwear|lingerie/i;
const ACCESSORY_ONLY_PATTERN = /内衣收纳(?:盒|袋)|内衣洗衣袋|泳装收纳(?:盒|袋)|泳衣收纳(?:盒|袋)|内衣专用收纳|泳装专用收纳|衣架|收纳柜/i;
const NO_PERSON_PATTERN = /不要人物|没有人物|无人物|无人|只有产品|纯产品|平铺|静物|产品特写|白底产品/i;
const PERSON_PATTERN = /模特|美女|帅哥|女性|男性|女人|男人|女士|先生|人物|girl|woman|man|model|person/i;
const ADULT_PATTERN = /成年|成人|年满\s*18|adult|over\s*18/i;
const COMMERCIAL_FASHION_PATTERN = /商业|广告|商品|产品|电商|时尚|服装|服饰|目录|海报|commercial|fashion|catalog/i;
const GRAPHIC_VIOLENCE_PATTERN = /血腥|肢解|开膛|断肢|喷血|尸块|严重伤口|gore|dismember(?:ed|ment)?|graphic\s+violence/i;
const REAL_PERSON_PATTERN = /总统|国家主席|总理|明星|名人|真人|政治人物|president|prime\s+minister|celebrity|real\s+person/i;
const DECEPTIVE_PATTERN = /假新闻|突发新闻|真实报道|官方通报|现场死亡|被捕现场|伪造事件|fake\s+news|breaking\s+news/i;
const AMBIGUOUS_AGE_PATTERN = /年轻女孩|年轻男孩|青春少女|学生妹|young\s+girl|young\s+boy/i;
const LICENSED_PRODUCT_CONTEXT_PATTERN = /正版|官方授权|品牌授权|联名款|正版周边|授权周边|包装盒|商品包装|产品包装|玩具|公仔|手办|商品摄影|产品摄影/i;
const PHONE_PATTERN = /(?<!\d)1[3-9]\d{9}(?!\d)/g;
const ID_CARD_PATTERN = /(?<!\d)\d{17}[\dXx](?!\d)/g;

const CHARACTER_RULES = [
  {
    id: 'character-sponge-sea-hero',
    pattern: /海绵宝宝/gi,
    replacement: '原创的黄色方形海洋卡通角色，拥有大眼睛、友善笑容和独特原创服装设计',
  },
  {
    id: 'character-armored-tech-hero',
    pattern: /钢铁侠/gi,
    replacement: '原创的红金配色高科技装甲英雄，采用独特原创轮廓与非品牌化能量核心设计',
  },
] as const;

function addUnique(target: string[], value: string) {
  if (!target.includes(value)) target.push(value);
}

function replaceAndRecord(
  input: string,
  pattern: RegExp,
  replacement: string,
  reason: string,
  changes: PromptSafetyChange[],
) {
  const before = input;
  const after = before.replace(pattern, replacement);
  if (after !== before) changes.push({ before, after, reason });
  return after;
}

function protectLockedTexts(prompt: string, lockedTexts: string[]) {
  let protectedPrompt = prompt;
  const tokens: Array<{ token: string; value: string }> = [];
  lockedTexts.forEach((value, index) => {
    const token = `__BANFULY_LOCKED_TEXT_${index}__`;
    if (!value || !protectedPrompt.includes(value)) return;
    protectedPrompt = protectedPrompt.split(value).join(token);
    tokens.push({ token, value });
  });
  return {
    protectedPrompt,
    restore(value: string) {
      return tokens.reduce((result, item) => result.split(item.token).join(item.value), value);
    },
  };
}

function hasPattern(value: string, pattern: RegExp) {
  pattern.lastIndex = 0;
  return pattern.test(value);
}

export function compileImagePrompt(originalPrompt: string, options: CompileOptions): PromptSafetyCompilation {
  const original = String(originalPrompt || '').trim();
  const mode = options.mode ?? 'enforce';
  const lockedTexts = (options.lockedTexts || [])
    .map(value => String(value || '').trim())
    .filter(Boolean)
    .slice(0, 20);
  const isTextOnlyMask = options.operation === 'mask_text_edit';
  const riskText = [original, ...lockedTexts].join('\n');
  const { protectedPrompt, restore } = protectLockedTexts(original, lockedTexts);
  let candidatePrompt = protectedPrompt;
  const candidateChanges: PromptSafetyChange[] = [];
  const riskReason: string[] = [];
  const riskTags: string[] = [];
  const ruleIds: string[] = [];
  let riskLevel: PromptSafetyCompilation['risk_level'] = 'none';
  let blocked = false;
  let reviewRecommended = false;

  const raiseRisk = (level: PromptSafetyCompilation['risk_level']) => {
    const order = { none: 0, low: 1, medium: 2, high: 3 };
    if (order[level] > order[riskLevel]) riskLevel = level;
  };
  const mark = (ruleId: string, tag: string, reason: string, level: PromptSafetyCompilation['risk_level'], review = false) => {
    addUnique(ruleIds, ruleId);
    addUnique(riskTags, tag);
    addUnique(riskReason, reason);
    raiseRisk(level);
    reviewRecommended ||= review;
  };

  const ambiguousMinorRiskText = riskText.replace(ADULT_QUALIFIED_AMBIGUOUS_MINOR_PATTERN, '');
  const hasMinor = hasPattern(riskText, HARD_MINOR_PATTERN)
    || hasPattern(ambiguousMinorRiskText, AMBIGUOUS_MINOR_PATTERN);
  if (hasMinor && hasPattern(riskText, MINOR_SEXUAL_PATTERN)) {
    mark('minor-sexual-combination', 'minor-sexual', '未成年人或疑似未成年人和性化、泳装或裸露语义同时出现', 'high', true);
    blocked = true;
  }
  if (hasPattern(riskText, EXPLICIT_SEXUAL_PATTERN)) {
    mark('explicit-sexual-content', 'explicit-sexual', '包含无法通过语义改写安全保留的明确性行为', 'high', true);
    blocked = true;
  }

  if (!blocked && hasPattern(riskText, SWIMWEAR_PATTERN) && !hasPattern(riskText, ACCESSORY_ONLY_PATTERN)) {
    mark('adult-fashion-context', 'adult-apparel', '泳装或内衣语义需要区分成人时尚展示、纯产品摄影和局部文字编辑', 'medium');
    const hasPerson = hasPattern(riskText, PERSON_PATTERN) && !hasPattern(riskText, NO_PERSON_PATTERN);
    if (!isTextOnlyMask && hasPerson) {
      candidatePrompt = replaceAndRecord(
        candidatePrompt,
        /比基尼美女|美女穿比基尼/gi,
        '成年女性时尚模特穿两件式泳装',
        '将容易被误判的成人泳装人物表述改为明确成年、非性化的商业时尚语义',
        candidateChanges,
      );
      candidatePrompt = replaceAndRecord(
        candidatePrompt,
        /性感美女/gi,
        '成年女性时尚模特',
        '移除不必要的性化形容并明确成年时尚语境',
        candidateChanges,
      );
      if (!hasPattern(riskText, ADULT_PATTERN) && !candidatePrompt.includes('成年')) {
        const before = candidatePrompt;
        candidatePrompt = `成年人物，${candidatePrompt}`;
        candidateChanges.push({ before, after: candidatePrompt, reason: '人物泳装或内衣场景明确限定为成年人' });
      }
      if (!hasPattern(riskText, COMMERCIAL_FASHION_PATTERN)) {
        const before = candidatePrompt;
        candidatePrompt = `${candidatePrompt}。普通商业时尚摄影，姿态自然，不强调私密部位，不包含色情暗示。`;
        candidateChanges.push({ before, after: candidatePrompt, reason: '补充非性化商业时尚语境，不改变主体和构图' });
      }
    }
  }

  if (!blocked && hasPattern(riskText, GRAPHIC_VIOLENCE_PATTERN)) {
    mark('graphic-violence-soften', 'graphic-violence', '包含写实血腥或严重伤害描述', 'high', true);
    if (!isTextOnlyMask || hasPattern(candidatePrompt, GRAPHIC_VIOLENCE_PATTERN)) {
      candidatePrompt = replaceAndRecord(
        candidatePrompt,
        /血腥|肢解|开膛|断肢|喷血|尸块|严重伤口|gore|dismember(?:ed|ment)?|graphic\s+violence/gi,
        '紧张但不血腥、无可见伤口的电影化冲突',
        '降低写实残酷程度，同时保留动作或叙事目标',
        candidateChanges,
      );
    }
  }

  const lockedPrivacy = lockedTexts.some(text => hasPattern(text, PHONE_PATTERN) || hasPattern(text, ID_CARD_PATTERN));
  if (hasPattern(riskText, PHONE_PATTERN) || hasPattern(riskText, ID_CARD_PATTERN)) {
    mark(
      lockedPrivacy ? 'privacy-locked-copy' : 'privacy-redaction',
      'privacy',
      lockedPrivacy ? '受保护文案中包含疑似个人信息，保留原文但建议人工确认' : '提示词中包含疑似手机号或身份证号',
      'medium',
      lockedPrivacy,
    );
    if (!lockedPrivacy) {
      candidatePrompt = replaceAndRecord(candidatePrompt, PHONE_PATTERN, '[已隐藏电话号码]', '隐藏疑似电话号码', candidateChanges);
      candidatePrompt = replaceAndRecord(candidatePrompt, ID_CARD_PATTERN, '[已隐藏身份证号]', '隐藏疑似身份证号码', candidateChanges);
    }
  }

  if (!blocked && hasPattern(riskText, REAL_PERSON_PATTERN) && hasPattern(riskText, DECEPTIVE_PATTERN)) {
    mark('real-person-deception-context', 'real-person-deception', '真实人物和疑似虚假事件语义同时出现', 'high', true);
    if (!isTextOnlyMask && !/虚构|概念设计|电影场景/i.test(candidatePrompt)) {
      const before = candidatePrompt;
      candidatePrompt = `虚构电影概念设计：${candidatePrompt}`;
      candidateChanges.push({ before, after: candidatePrompt, reason: '明确为虚构艺术场景，避免被理解为真实新闻事件' });
    }
  }

  if (!blocked) {
    const riskClauses = riskText.split(/[，。；;！？!?\n]/).map(value => value.trim()).filter(Boolean);
    CHARACTER_RULES.forEach(rule => {
      if (!hasPattern(riskText, rule.pattern)) return;
      const hasLicensedCharacterClause = riskClauses.some(clause =>
        hasPattern(clause, rule.pattern) && hasPattern(clause, LICENSED_PRODUCT_CONTEXT_PATTERN));
      const isProductOrCopyContext = isTextOnlyMask || hasLicensedCharacterClause;
      mark(rule.id, 'protected-character', '包含知名角色名称，需要区分原创角色生成与正版商品、包装或文案编辑', 'medium', isProductOrCopyContext);
      if (!isProductOrCopyContext) {
        candidatePrompt = replaceAndRecord(
          candidatePrompt,
          rule.pattern,
          rule.replacement,
          '将受保护角色原名替换为不复制具体角色的原创视觉描述',
          candidateChanges,
        );
      }
    });
  }

  if (hasPattern(riskText, AMBIGUOUS_AGE_PATTERN)) {
    mark('ambiguous-age-review', 'ambiguous-age', '年龄语义不明确，建议在人物敏感场景中人工确认', 'medium', true);
  }

  candidatePrompt = restore(candidatePrompt);
  const candidateDecision: PromptSafetyCompilation['candidate_decision'] = blocked
    ? 'reject'
    : candidateChanges.length > 0 ? 'rewrite' : 'allow';
  const applied = mode === 'enforce' && candidateDecision !== 'allow';
  const decision: PromptSafetyCompilation['decision'] = mode === 'observe' ? 'allow' : candidateDecision;

  return {
    rule_version: PROMPT_SAFETY_RULE_VERSION,
    mode,
    provider: options.provider,
    operation: options.operation,
    decision,
    candidate_decision: candidateDecision,
    applied,
    risk_level: riskLevel,
    risk_reason: riskReason,
    risk_tags: riskTags,
    rule_ids: ruleIds,
    original_prompt: original,
    optimized_prompt: mode === 'observe' ? original : candidatePrompt,
    candidate_prompt: candidatePrompt,
    changes: mode === 'observe' ? [] : candidateChanges,
    candidate_changes: candidateChanges,
    blocked,
    review_recommended: reviewRecommended,
  };
}
