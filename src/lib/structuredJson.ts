const stripMarkdownFence = (value: string): string => {
  const trimmed = value.trim().replace(/^\uFEFF/, '');
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
};

const extractFirstJsonObject = (value: string): string => {
  const start = value.indexOf('{');
  if (start < 0) return value;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const character = value[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) return value.slice(start, index + 1);
    }
  }
  return value;
};

export const parseStructuredJsonObject = <T extends Record<string, unknown>>(value: string): T => {
  const normalized = stripMarkdownFence(value);
  const candidate = extractFirstJsonObject(normalized);
  const parsed = JSON.parse(candidate) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('AI 返回的结构化结果不是 JSON 对象');
  }
  return parsed as T;
};
