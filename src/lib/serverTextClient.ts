export interface ServerGenerateContentRequest {
  model: string;
  contents: unknown;
  config?: Record<string, unknown> & { abortSignal?: AbortSignal };
}

export interface ServerGenerateContentResponse {
  text?: string;
  requestId?: string;
  elapsedMs?: number;
}

const generateContent = async (request: ServerGenerateContentRequest): Promise<ServerGenerateContentResponse> => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
  const { abortSignal, ...config } = request.config || {};
  const response = await fetch('/api/ai/text/generate-content', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      model: request.model,
      contents: request.contents,
      config,
    }),
    signal: abortSignal,
  });
  const payload = await response.json().catch(() => ({})) as ServerGenerateContentResponse & { message?: string };
  if (!response.ok) throw new Error(payload.message || `AI 文本服务请求失败（HTTP ${response.status}）`);
  return payload;
};

export const createServerTextClient = () => ({
  models: { generateContent },
});
