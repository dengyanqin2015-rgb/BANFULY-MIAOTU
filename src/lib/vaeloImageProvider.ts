import type { AspectRatio, ImageSize } from './gemini';
import type { ImageModel } from './geminiModels';

export const VAELO_DEFAULT_BASE_URL = 'https://vaelo.8t.chat';
export const VAELO_MODEL_MAP: Partial<Record<ImageModel, string>> = {
  'gemini-3.1-flash-image': 'gemini-3.1-flash-image',
  'gemini-3-pro-image': 'gemini-3-pro-image',
  'gpt-image-2': 'gpt-image-2k',
};

export interface VaeloReferenceImage {
  data: string;
  mimeType: string;
}

export interface VaeloImageRequest {
  model: ImageModel;
  prompt: string;
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  size?: string;
  quality?: 'low' | 'medium' | 'high';
  images?: VaeloReferenceImage[];
  mask?: VaeloReferenceImage;
}

export interface VaeloJsonRequest {
  endpoint: string;
  body: Record<string, unknown>;
}

export const normalizeVaeloBaseUrl = (rawValue?: string): string => {
  const value = String(rawValue || VAELO_DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:') throw new Error('Vaelo Base URL 必须使用 HTTPS');
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('Vaelo Base URL 不能包含账号、查询参数或锚点');
  }
  return parsed.origin + parsed.pathname.replace(/\/+$/, '');
};

export const buildVaeloJsonRequest = (request: VaeloImageRequest): VaeloJsonRequest => {
  const upstreamModel = VAELO_MODEL_MAP[request.model];
  if (!upstreamModel) throw new Error(`Vaelo 不支持模型：${request.model}`);
  if (request.model === 'gpt-image-2') {
    if ((request.images?.length || 0) > 0 || request.mask) {
      throw new Error('GPT_IMAGE_EDIT_REQUIRES_MULTIPART');
    }
    return {
      endpoint: '/v1/images/generations',
      body: {
        model: upstreamModel,
        prompt: request.prompt,
        size: request.size || '1024x1024',
        n: 1,
        response_format: 'b64_json',
      },
    };
  }

  const parts: Array<Record<string, unknown>> = [{ text: request.prompt }];
  for (const image of request.images || []) {
    parts.push({ inlineData: { data: image.data.replace(/^data:[^;]+;base64,/, ''), mimeType: image.mimeType } });
  }
  const imageConfig: Record<string, string> = {
    aspectRatio: request.aspectRatio === 'AUTO' ? '1:1' : request.aspectRatio,
  };
  if (request.imageSize !== '512px') imageConfig.imageSize = request.imageSize;
  return {
    endpoint: `/v1beta/models/${encodeURIComponent(upstreamModel)}:generateContent`,
    body: {
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig,
      },
    },
  };
};

export const appendVaeloGptEditFields = (form: FormData, request: VaeloImageRequest): void => {
  form.append('model', VAELO_MODEL_MAP['gpt-image-2'] || 'gpt-image-2k');
  form.append('prompt', request.prompt);
  form.append('size', request.size || '1024x1024');
  form.append('n', '1');
};

const asDataUrl = (data: string, mimeType = 'image/png') =>
  data.startsWith('data:') ? data : `data:${mimeType};base64,${data}`;

type VaeloImagePayload = {
  data?: Array<{ url?: string; b64_json?: string }>;
  candidates?: Array<{ content?: { parts?: Array<{
    inlineData?: { data?: string; mimeType?: string; mime_type?: string };
    inline_data?: { data?: string; mimeType?: string; mime_type?: string };
  }> } }>;
};

export const extractVaeloImages = (model: ImageModel, payload: VaeloImagePayload): string[] => {
  if (model === 'gpt-image-2') {
    return (Array.isArray(payload?.data) ? payload.data : [])
      .map(item => item?.url || (item?.b64_json ? asDataUrl(item.b64_json) : ''))
      .filter(Boolean);
  }

  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return [];
  return parts.map(part => {
    const inline = part?.inlineData || part?.inline_data;
    return inline?.data ? asDataUrl(inline.data, inline.mimeType || inline.mime_type || 'image/png') : '';
  }).filter(Boolean);
};
