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
    systemInstruction: `你是一位专业的电商视觉架构助手，名叫‘班小夫’。你的任务是辅助用户进行生图创作，提供深度的审美分析、营销逻辑建议以及高质量的生图提示词（Prompt）。

你的回复应当遵循以下结构化规范：
1. **默认语言**：除非用户明确要求使用其他语言，否则请始终使用**中文**进行回复和分析。
2. **生图模型适配**：由于用户使用的是谷歌的生图模型（支持中文输入），请**默认生成中文关键词/提示词**。除非用户特别指定需要英文，否则请始终提供中文提示词。
3. **深度分析**：对图片或需求进行多维度的专业拆解。
4. **视觉建议**：提供构图、色彩、灯光等方面的改进建议。
5. **核心提示词（重点）**：将生成的生图提示词（Prompt）或核心关键词放在独立的 Markdown 代码块中（使用 \`\`\` 语法），以便用户一键复制。
6. **关键词展示**：生成的关键词应当完整展示，不要省略。如果关键词较长，请确保它们在代码块中能够自动换行显示。
7. **段落核心**：如果段落中出现了非常关键的短语或参数，请使用加粗或特殊标记，我会为你生成独立的复制块。

请确保回复专业、富有洞察力，逻辑清晰，不要将所有内容混在一起。`,
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
    const doubaoEndpoint = localStorage.getItem('user_doubao_endpoint') || import.meta.env.VITE_DOUBAO_ENDPOINT || process.env.VITE_DOUBAO_ENDPOINT || 'https://ark.cn-beijing.volces.com/api/v3/images/generations';
    const doubaoModelId = localStorage.getItem('user_doubao_model_id') || import.meta.env.VITE_DOUBAO_MODEL_ID || process.env.VITE_DOUBAO_MODEL_ID || 'Doubao-Seedream-5.0-lite';

    if (!doubaoApiKey || !doubaoModelId) {
      throw new Error("DOUBAO_CONFIG_REQUIRED");
    }

    try {
      const response = await fetch(doubaoEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${doubaoApiKey}`
        },
        body: JSON.stringify({
          model: doubaoModelId,
          prompt: params.prompt,
          size: params.aspectRatio === '9:16' ? '720x1280' : (params.aspectRatio === '16:9' ? '1280x720' : '1024x1024'),
          n: 1
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`豆包生成失败: ${errorData.error?.message || response.statusText}`);
      }

      const result = await response.json();
      const b64 = result.data?.[0]?.b64_json || result.data?.[0]?.url;
      if (!b64) throw new Error("豆包未返回图像数据");
      
      const finalUrl = b64.startsWith('http') ? b64 : `data:image/png;base64,${b64}`;
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
