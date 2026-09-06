export interface VaeloTextInput {
  requestedModel: string;
  contents: unknown;
  config?: Record<string, unknown>;
}

export interface VaeloTextRequest {
  endpoint: string;
  body: Record<string, unknown>;
  upstreamModel: string;
}

const clean = (value?: string) => String(value || '').trim().replace(/^Bearer\s+/i, '').trim();

export const resolveVaeloTextApiKey = (env: Record<string, string | undefined>): string =>
  clean(env.VAELO_TEXT_API_KEY);

export const resolveVaeloTextModel = (
  requestedModel: string,
  env: Record<string, string | undefined>,
): string => {
  const normalModel = clean(env.VAELO_TEXT_MODEL);
  const deepModel = clean(env.VAELO_DEEP_TEXT_MODEL);
  if (!normalModel) return '';
  return /pro|deep/i.test(requestedModel) ? (deepModel || normalModel) : normalModel;
};

const normalizeContents = (contents: unknown): unknown[] => {
  if (Array.isArray(contents)) return contents;
  if (contents && typeof contents === 'object') return [contents];
  throw new Error('AI_TEXT_CONTENTS_INVALID');
};

type GeminiPart = { text?: unknown; inlineData?: { data?: unknown; mimeType?: unknown } };
type GeminiContent = { role?: unknown; parts?: GeminiPart[] };

const toOpenAiContent = (parts: GeminiPart[]): string | Array<Record<string, unknown>> => {
  const converted: Array<Record<string, unknown>> = [];
  for (const part of parts) {
    if (typeof part?.text === 'string') {
      converted.push({ type: 'text', text: part.text });
      continue;
    }
    const inline = part?.inlineData;
    if (inline && typeof inline.data === 'string') {
      const mimeType = typeof inline.mimeType === 'string' ? inline.mimeType : 'image/jpeg';
      const dataUrl = inline.data.startsWith('data:') ? inline.data : `data:${mimeType};base64,${inline.data}`;
      converted.push({ type: 'image_url', image_url: { url: dataUrl } });
    }
  }
  return converted.length === 1 && converted[0].type === 'text'
    ? String(converted[0].text || '')
    : converted;
};

const toOpenAiMessages = (contents: unknown, systemInstruction?: unknown, responseSchema?: unknown) => {
  const messages: Array<Record<string, unknown>> = [];
  const systemParts: string[] = [];
  if (typeof systemInstruction === 'string') systemParts.push(systemInstruction);
  else if (systemInstruction && typeof systemInstruction === 'object') {
    const parts = (systemInstruction as GeminiContent).parts;
    if (Array.isArray(parts)) systemParts.push(parts.map(part => typeof part.text === 'string' ? part.text : '').filter(Boolean).join('\n'));
  }
  if (responseSchema) systemParts.push(`严格按照以下 JSON Schema 输出，不要添加 Markdown 代码围栏：\n${JSON.stringify(responseSchema)}`);
  if (systemParts.filter(Boolean).length) messages.push({ role: 'system', content: systemParts.filter(Boolean).join('\n\n') });

  for (const rawContent of normalizeContents(contents)) {
    const content = rawContent as GeminiContent;
    if (!Array.isArray(content?.parts)) throw new Error('AI_TEXT_CONTENTS_INVALID');
    messages.push({
      role: content.role === 'model' || content.role === 'assistant' ? 'assistant' : 'user',
      content: toOpenAiContent(content.parts),
    });
  }
  return messages;
};

export const buildVaeloTextRequest = (
  input: VaeloTextInput,
  env: Record<string, string | undefined>,
): VaeloTextRequest => {
  const upstreamModel = resolveVaeloTextModel(input.requestedModel, env);
  if (!upstreamModel) throw new Error('AI_TEXT_MODEL_NOT_CONFIGURED');
  const config = input.config || {};
  const { systemInstruction, responseMimeType, responseSchema, maxOutputTokens, thinkingConfig, ...generationConfig } = config;
  const body: Record<string, unknown> = {
    model: upstreamModel,
    messages: toOpenAiMessages(input.contents, systemInstruction, responseSchema),
  };
  if (typeof maxOutputTokens === 'number') body.max_tokens = maxOutputTokens;
  if (responseMimeType === 'application/json') body.response_format = { type: 'json_object' };
  if (thinkingConfig && typeof thinkingConfig === 'object') body.reasoning_effort = 'high';
  Object.assign(body, generationConfig);
  return {
    endpoint: '/v1/chat/completions',
    upstreamModel,
    body,
  };
};

export const extractVaeloText = (payload: unknown): string => {
  const content = (payload as { choices?: Array<{ message?: { content?: unknown } }> })
    ?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  return content.map(part => {
    if (!part || typeof part !== 'object') return '';
    const value = part as { text?: unknown };
    return typeof value.text === 'string' ? value.text : '';
  }).filter(Boolean).join('\n').trim();
};
