export const VISUAL_PROMPT_DIMENSIONS = [
  '核心主体及准确外观特征',
  '主体数量、相对位置、动作或摆放方式',
  '环境背景、空间关系与必要道具',
  '构图、视觉层级、留白和版式',
  '拍摄视角、镜头感、景别与景深',
  '光源方向、光质、阴影和高光',
  '主辅色、色彩占比与色调关系',
  '材质、纹理和表面细节',
  '画面风格、商业质感、清晰度和细节',
  '画面文字、准确文案、位置、字号层级与字体气质',
] as const;

export const VISUAL_PROMPT_STRUCTURE_INSTRUCTION = `生图提示词必须沿用“一键解析关键词”的同一套结构，依次覆盖：${VISUAL_PROMPT_DIMENSIONS.map((item, index) => `${index + 1}. ${item}`).join('；')}。
不得只描述场景。主体、产品、构图、镜头、光影、色彩、材质和文字版式都是必填维度；无法从材料确认的内容应使用保守的专业默认值，不得虚构品牌、参数或不可见事实。
文字规则：用户明确给出的文案、标题、副标题、口号或画面文字必须逐字保留在最终提示词中，同时说明其位置、层级、字体气质和可读性；不得改写、概括、漏字或只写“预留文案区域”。用户未要求文字且图片中没有可见文字时，明确要求画面不添加额外文字、伪文字、水印或标识。`;

export const IMAGE_ANALYSIS_SYSTEM_INSTRUCTION = `你是专业的视觉复刻提示词工程师。${VISUAL_PROMPT_STRUCTURE_INSTRUCTION}
只输出一段可以直接用于文生图的完整中文提示词，不输出标题、分析过程、Markdown或解释。必须忠实描述可见画面，不猜测不可见信息。`;

const VISUAL_TASK_PATTERN = /(生图|提示词|关键词|图片|图像|主图|详情页|海报|视觉|构图|场景|复刻|文案|标题|广告图|产品图)/i;

export function isVisualPromptTask(message: string, hasImages = false): boolean {
  return hasImages || VISUAL_TASK_PATTERN.test(message);
}

export function extractRequiredCopy(message: string): string[] {
  const values: string[] = [];
  const patterns = [
    /(?:文案|主标题|副标题|标题|口号|标语|slogan|画面文字)\s*(?:内容)?\s*(?:为|是|写成|使用)?\s*[:：]?\s*[“"「『]([^”"」』\n]{1,100})[”"」』]/gi,
    /(?:文案|主标题|副标题|标题|口号|标语|slogan|画面文字)\s*(?:内容)?\s*(?:为|是|写成|使用)?\s*[:：]\s*(?![“"「『\s])([^\n。；;]{1,100})/gi,
    /(?:写上|显示|加入|放上|添加)\s*[“"「『]([^”"」』\n]{1,100})[”"」』]/gi,
    /[“"「『]([^”"」』\n]{1,100})[”"」』]\s*(?:这句)?\s*(?:作为|用作)?\s*(?:主)?文案/gi,
  ];

  for (const pattern of patterns) {
    for (const match of message.matchAll(pattern)) {
      const value = match[1]?.trim().replace(/[，,]?(?:并|同时)?(?:放在|位于|置于).+$/u, '').trim();
      if (value && !values.includes(value)) values.push(value);
    }
  }
  return values;
}

export function buildStructuredAssistantMessage(
  message: string,
  hasImages = false,
  analysisTemplate?: { name: string; prompt: string },
): string {
  if (!isVisualPromptTask(message, hasImages)) return message;
  const requiredCopy = extractRequiredCopy(message);
  const copyContract = requiredCopy.length
    ? `\n本次必须逐字保留的画面文案：${requiredCopy.map(item => `“${item}”`).join('、')}。这些文字必须实际出现在最终生图提示词中。`
    : '';
  const templateContract = analysisTemplate
    ? `\n后台当前默认解析模板“${analysisTemplate.name}”的脚本如下，图片分析和提示词生成必须实际执行这套脚本：\n${analysisTemplate.prompt}\n`
    : '';
  return `${message}\n\n执行要求：\n${VISUAL_PROMPT_STRUCTURE_INSTRUCTION}${templateContract}${copyContract}\n如果输出可直接用于生图的内容，必须把每套完整提示词分别放入独立的 \`\`\`prompt 代码块。`;
}

export function ensureRequiredCopyInPromptBlocks(response: string, sourceMessage: string): string {
  const requiredCopy = extractRequiredCopy(sourceMessage);
  if (!requiredCopy.length) return response;

  return response.replace(/```prompt\s*\n([\s\S]*?)```/gi, (block, content: string) => {
    const missing = requiredCopy.filter(item => !content.includes(item));
    if (!missing.length) return block;
    const constraint = `文字与版式：画面中逐字准确显示${missing.map(item => `“${item}”`).join('、')}，不得改写、漏字或生成伪文字，并明确安排其位置、字号层级、字体气质与清晰可读性。`;
    return `\`\`\`prompt\n${content.trim()}\n${constraint}\n\`\`\``;
  });
}
