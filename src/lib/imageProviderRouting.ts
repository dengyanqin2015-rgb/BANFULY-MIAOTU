import type { AspectRatio, ImageSize } from './gemini';
import type { ImageModel } from './geminiModels';

type ImageProvider = 'direct' | 'vaelo';

let providerPromise: Promise<ImageProvider> | null = null;

export const getConfiguredImageProvider = async (token: string | null): Promise<ImageProvider> => {
  if (!providerPromise) {
    providerPromise = fetch('/api/ai/image-provider', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).then(async response => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || '无法读取生图线路配置');
      return payload.provider === 'vaelo' ? 'vaelo' : 'direct';
    }).catch(error => {
      providerPromise = null;
      throw error;
    });
  }
  return providerPromise;
};

export const toVaeloImageModel = (model: string): ImageModel | null => {
  if (model === 'gpt-image-2') return 'gpt-image-2';
  if (model === 'gemini-3.1-flash-image' || model === 'nanobanana2') return 'gemini-3.1-flash-image';
  if (model === 'gemini-3-pro-image' || model === 'nanobanana pro') return 'gemini-3-pro-image';
  return null;
};

export const getGptImageSize = (imageSize: string, aspectRatio: string): string => {
  const sizeTable: Record<string, Record<string, string>> = {
    '512px': { '1:1': '1024x1024', '3:4': '1024x1360', '4:3': '1360x1024', '9:16': '1024x1824', '16:9': '1824x1024', '2:5': '1024x2560', '5:2': '2560x1024', '3:2': '1536x1024', '2:3': '1024x1536', AUTO: 'auto' },
    '1K': { '1:1': '1024x1024', '3:4': '1024x1360', '4:3': '1360x1024', '9:16': '1024x1824', '16:9': '1824x1024', '2:5': '1024x2560', '5:2': '2560x1024', '3:2': '1536x1024', '2:3': '1024x1536', AUTO: 'auto' },
    '2K': { '1:1': '2048x2048', '3:4': '1536x2048', '4:3': '2048x1536', '9:16': '1152x2048', '16:9': '2048x1152', '2:5': '1280x3200', '5:2': '3200x1280', '3:2': '2048x1360', '2:3': '1360x2048', AUTO: 'auto' },
    '4K': { '1:1': '2880x2880', '3:4': '2480x3312', '4:3': '3312x2480', '9:16': '2160x3840', '16:9': '3840x2160', '2:5': '1536x3840', '5:2': '3840x1536', '3:2': '3520x2352', '2:3': '2352x3520', AUTO: 'auto' },
  };
  return sizeTable[imageSize]?.[aspectRatio] || '1024x1024';
};

export interface VaeloClientRequest {
  prompt: string;
  model: ImageModel;
  aspectRatio: AspectRatio | string;
  imageSize: ImageSize | string;
  quality?: 'low' | 'medium' | 'high';
  images?: { data: string; mimeType: string }[];
  mask?: { data: string; mimeType: string };
  requestId?: string;
  signal?: AbortSignal;
}

export const generateImageViaVaelo = async (request: VaeloClientRequest, token: string | null): Promise<string[]> => {
  const response = await fetch('/api/ai/vaelo/images', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      prompt: request.prompt,
      model: request.model,
      aspectRatio: request.aspectRatio,
      imageSize: request.imageSize,
      quality: request.quality,
      images: request.images || [],
      mask: request.mask,
      requestId: request.requestId,
      size: request.model === 'gpt-image-2' ? getGptImageSize(request.imageSize, request.aspectRatio) : undefined,
    }),
    signal: request.signal,
  });
  const payload = await response.json().catch(() => ({})) as { message?: string; diagnosticId?: string; images?: Array<{ url?: string }> };
  if (!response.ok) throw new Error(`${payload.message || response.statusText}${payload.diagnosticId ? `（诊断编号：${payload.diagnosticId}）` : ''}`);
  const urls = Array.isArray(payload.images) ? payload.images.map(item => item?.url).filter((url): url is string => Boolean(url)) : [];
  if (!urls.length) throw new Error('Vaelo 未返回图片数据');
  return urls;
};
