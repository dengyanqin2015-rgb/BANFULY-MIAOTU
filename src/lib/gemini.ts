import { GoogleGenAI, ThinkingLevel } from "@google/genai";

export type ImageModel = "gemini-2.5-flash-image" | "gemini-3.1-flash-image-preview" | "gemini-3-pro-image-preview" | "doubao-pro-v1";
export type ChatModel = "gemini-3-flash-preview" | "gemini-3.1-pro-preview";
export type ImageSize = "512px" | "1K" | "2K" | "4K";
export type AspectRatio = "AUTO" | "1:1" | "3:4" | "4:3" | "9:16" | "16:9" | "1:4" | "1:8" | "4:1" | "8:1";

export interface GenerationParams {
  prompt: string;
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  model: ImageModel;
  images?: { data: string; mimeType: string }[];
  apiKey?: string;
}

export interface ChatParams {
  message: string;
  images?: { data: string; mimeType: string }[];
  mode: 'normal' | 'deep';
  history?: { role: 'user' | 'model'; parts: { text: string }[] }[];
  apiKey?: string;
}

// Extend Window interface for AI Studio specific functions
declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

export async function checkApiKey() {
  if (typeof window.aistudio !== 'undefined' && window.aistudio.hasSelectedApiKey) {
    return await window.aistudio.hasSelectedApiKey();
  }
  return true; 
}

export async function openApiKeyDialog() {
  if (typeof window.aistudio !== 'undefined' && window.aistudio.openSelectKey) {
    await window.aistudio.openSelectKey();
  }
}

export async function chatWithAssistant(params: ChatParams): Promise<string> {
  // 聊天和识图始终优先使用默认的免费 Key (环境变量中的 GEMINI_API_KEY)
  const apiKey = params.apiKey || process.env.API_KEY || process.env.GEMINI_API_KEY;
  const ai = new GoogleGenAI({ apiKey: apiKey as string });
  
  const modelName = params.mode === 'deep' ? 'gemini-3.1-pro-preview' : 'gemini-3-flash-preview';
  
  const parts: { text?: string; inlineData?: { data: string; mimeType: string } }[] = [{ text: params.message }];
  if (params.images && params.images.length > 0) {
    params.images.forEach(img => {
      parts.push({
        inlineData: {
          data: img.data,
          mimeType: img.mimeType
        }
      });
    });
  }

  const config: { systemInstruction: string; thinkingConfig?: { thinkingLevel: ThinkingLevel } } = {
    systemInstruction: `你是一个全能的AI助手，能够进行各种任务，包括文本生成、创意写作、图像理解、代码创作等。

你的回复应当遵循以下准则：
1. **语言适配**：根据用户输入语言进行回复。
2. **风格**：友好、专业、高效。
3. **格式清晰**：尽可能利用Markdown语法（标题、列表、加粗等）使回答结构清晰、易于阅读。
4. **回答精炼**：直接回应用户需求，不要添加不必要的符号或冗余标记。`,
  };

  if (params.mode === 'deep') {
    config.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
  }

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [
        ...(params.history || []),
        { role: 'user', parts }
      ],
      config: config,
    });

    return response.text || "抱歉，我无法生成回复。";
  } catch (err: unknown) {
    const error = err as Error;
    console.error("Assistant chat failed:", error);
    if (error.message?.includes("Requested entity was not found")) {
      throw new Error("API_KEY_REQUIRED");
    }
    throw error;
  }
}

export async function generateImage(params: GenerationParams): Promise<string[]> {
  // 豆包模型特殊处理逻辑
  if (params.model === 'doubao-pro-v1') {
    const doubaoApiKey = localStorage.getItem('user_doubao_api_key') || import.meta.env.VITE_DOUBAO_API_KEY || process.env.VITE_DOUBAO_API_KEY;
    const doubaoEndpoint = localStorage.getItem('user_doubao_endpoint') || import.meta.env.VITE_DOUBAO_ENDPOINT || 'https://ark.cn-beijing.volces.com/api/v3/images/generations';
    const doubaoModelId = localStorage.getItem('user_doubao_model_id') || 'doubao-1-5-vision-image-generations';

    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/doubao/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          apiKey: doubaoApiKey,
          endpoint: doubaoEndpoint,
          model: doubaoModelId,
          prompt: params.prompt,
          size: params.imageSize === '4K' 
            ? (params.aspectRatio === '9:16' ? '2160x3840' : (params.aspectRatio === '16:9' ? '3840x2160' : '3072x3072'))
            : (params.aspectRatio === '9:16' ? '1440x2560' : (params.aspectRatio === '16:9' ? '2560x1440' : '2048x2048')),
          n: 1,
          watermark: false // 恢复到修正去水印后的状态
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || response.statusText);
      }

      const result = await response.json();
      const b64 = result.data?.[0]?.b64_json || result.data?.[0]?.url;
      if (!b64) throw new Error("豆包未返回图像数据");
      
      const finalUrl = b64?.startsWith('http') ? b64 : `data:image/png;base64,${b64}`;
      return [finalUrl];
    } catch (err) {
      console.error("Doubao generation error:", err);
      throw err;
    }
  }

  // 自动切换逻辑：
  // 1. 优先检查环境变量中配置的付费生图专用 Key (VITE_PAID_IMAGE_API_KEY)
  // 2. 其次检查用户在浏览器本地存储中设置的付费 Key (user_paid_image_api_key)
  // 3. 然后使用用户在 UI 中手动传入的 Key (params.apiKey)
  // 4. 最后回退到系统默认的免费 Key
  const envPaidKey = import.meta.env.VITE_PAID_IMAGE_API_KEY || process.env.VITE_PAID_IMAGE_API_KEY;
  const localPaidKey = typeof window !== 'undefined' ? localStorage.getItem('user_paid_image_api_key') : null;
  const apiKey = envPaidKey || localPaidKey || params.apiKey || process.env.API_KEY || process.env.GEMINI_API_KEY;
  
  const ai = new GoogleGenAI({ apiKey: apiKey as string });
  
  try {
    const parts: { text?: string; inlineData?: { data: string; mimeType: string } }[] = [{ text: params.prompt }];
    
    if (params.images && params.images.length > 0) {
      params.images.forEach(img => {
        parts.push({
          inlineData: {
            data: img.data,
            mimeType: img.mimeType
          }
        });
      });
    }

    const config: { imageConfig: { aspectRatio: string; imageSize?: string } } = {
      imageConfig: {
        aspectRatio: params.aspectRatio === "AUTO" ? "1:1" : params.aspectRatio,
      },
    };

    // Only 3.1 and 3 Pro support imageSize
    if (params.model !== 'gemini-2.5-flash-image') {
      config.imageConfig.imageSize = params.imageSize;
    }

    const response = await ai.models.generateContent({
      model: params.model,
      contents: {
        parts: parts,
      },
      config: config,
    });

    const imageUrls: string[] = [];
    let responseText = "";
    
    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          const base64Data = part.inlineData.data;
          imageUrls.push(`data:${part.inlineData.mimeType};base64,${base64Data}`);
        } else if (part.text) {
          responseText += part.text;
        }
      }
    }

    if (imageUrls.length === 0) {
      // Check if it was blocked by safety filters
      const safetyRatings = response.candidates?.[0]?.safetyRatings;
      const isBlocked = safetyRatings?.some(r => r.probability !== 'NEGLIGIBLE');
      const finishReason = response.candidates?.[0]?.finishReason;

      if (isBlocked || finishReason === 'SAFETY') {
        throw new Error("内容因安全策略被拦截，请尝试修改提示词（例如避免真实人物或敏感话题）");
      }
      
      if (responseText) {
        throw new Error(`模型未返回图像，反馈信息：${responseText}`);
      }

      throw new Error("模型未返回图像数据，请尝试更换模型或修改提示词");
    }

    return imageUrls;
  } catch (err: unknown) {
    const error = err as Error;
    console.error("Image generation failed:", error);
    if (error.message?.includes("Requested entity was not found")) {
      throw new Error("API_KEY_REQUIRED");
    }
    if (error.message?.includes("safety")) {
      throw new Error("内容安全拦截");
    }
    throw error;
  }
}
