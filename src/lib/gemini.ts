import { GoogleGenAI, ThinkingLevel } from "@google/genai";

export type ImageModel = "gemini-2.5-flash-image" | "gemini-3.1-flash-image-preview" | "gemini-3-pro-image-preview" | "gpt-image-2";
export type ChatModel = "gemini-3-flash-preview" | "gemini-3.1-pro-preview";
export type ImageSize = "512px" | "1K" | "2K" | "4K";
export type AspectRatio = "AUTO" | "1:1" | "3:4" | "4:3" | "4:5" | "5:4" | "9:16" | "16:9" | "21:9" | "2:5" | "5:2" | "3:2" | "2:3" | "1:4" | "1:8" | "4:1" | "8:1";

export interface GenerationParams {
  prompt: string;
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  model: ImageModel;
  images?: { data: string; mimeType: string }[];
  mask?: { data: string; mimeType: string };
  apiKey?: string;
  quality?: "low" | "medium" | "high";
}

export interface ChatParams {
  message: string;
  images?: { data: string; mimeType: string }[];
  mode: 'normal' | 'deep';
  history?: { role: 'user' | 'model'; parts: { text: string }[] }[];
  apiKey?: string;
}

export interface ImageAnalysisTemplate {
  id: string;
  name: string;
  description?: string;
  prompt: string;
  isDefault: boolean;
}

export async function analyzeImageForPrompt(
  imageUrl: string,
  template: ImageAnalysisTemplate,
  apiKey?: string
): Promise<string> {
  const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("当前图片尚未转换为可解析格式，请重新上传后再试");
  const key = apiKey || localStorage.getItem('user_gemini_api_key');
  if (!key) throw new Error("请先配置 Gemini API Key");
  const ai = new GoogleGenAI({ apiKey: key });
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      parts: [
        { inlineData: { mimeType: match[1], data: match[2] } },
        { text: template.prompt }
      ]
    },
    config: {
      systemInstruction: "你是专业的视觉复刻提示词工程师。只输出一段可以直接用于文生图的中文提示词，不要输出标题、分析过程、Markdown或解释。必须忠实描述可见画面，不猜测不可见信息。"
    }
  });
  const text = response.text?.trim();
  if (!text) throw new Error("图片解析没有返回关键词");
  return text;
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
  const apiKey = params.apiKey || localStorage.getItem('user_gemini_api_key');
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
    systemInstruction: `你是 BANFULY 的中文电商视觉策略助手，核心任务是分析市场商品、竞品、消费者痛点、购买动机，并产出可落地的主图策划、详情页策划和高质量生图提示词。

必须遵守：
1. 默认全程使用简体中文；除用户明确要求外，不输出英文生图提示词。
2. 先区分“输入材料中的事实”和“你的策略推断”，禁止把推断冒充真实调研结论。
3. 策划必须围绕商品核心卖点、目标人群、使用场景、视觉层级、构图、光影、色彩、材质和文案区域。
4. 每一段可直接用于生图的提示词必须完整独立，并放在单独的 \`\`\`prompt 代码块中；一个代码块只放一套完整中文提示词，不添加解释或标题。
5. 生图提示词应准确包含主体、外观结构、动作或摆放、环境、构图、镜头、光影、色彩、材质、清晰度、文字区域及禁止元素。
6. 普通交流保持简洁；市场分析、主图和详情策划使用清晰的小标题与可执行结论。`,
  };

  if (params.mode === 'deep') {
    config.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
  }

  try {
    const request = (model: string) => ai.models.generateContent({
      model,
      contents: [...(params.history || []), { role: 'user', parts }],
      config,
    });
    try {
      const response = await request(modelName);
      return response.text || "抱歉，我无法生成回复。";
    } catch (deepError) {
      if (params.mode !== 'deep') throw deepError;
      const fallback = await request('gemini-3-flash-preview');
      return `> 深度模型当前不可用，已自动使用 Flash 高思考模式完成本次任务。\n\n${fallback.text || "抱歉，我无法生成回复。"}`;
    }
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
  if (params.model === 'gpt-image-2') {
    const apiKey = localStorage.getItem('user_openai_api_key');
    const savedQuality = localStorage.getItem('user_openai_image_quality');
    const quality = params.quality || (savedQuality === 'medium' || savedQuality === 'high' ? savedQuality : 'low');
    const sizeTable: Record<string, Record<string, string>> = {
      '512px': { '1:1': '1024x1024', '3:4': '1024x1360', '4:3': '1360x1024', '9:16': '1024x1824', '16:9': '1824x1024', '2:5': '1024x2560', '5:2': '2560x1024', '3:2': '1536x1024', '2:3': '1024x1536', 'AUTO': 'auto' },
      '1K': { '1:1': '1024x1024', '3:4': '1024x1360', '4:3': '1360x1024', '9:16': '1024x1824', '16:9': '1824x1024', '2:5': '1024x2560', '5:2': '2560x1024', '3:2': '1536x1024', '2:3': '1024x1536', 'AUTO': 'auto' },
      '2K': { '1:1': '2048x2048', '3:4': '1536x2048', '4:3': '2048x1536', '9:16': '1152x2048', '16:9': '2048x1152', '2:5': '1280x3200', '5:2': '3200x1280', '3:2': '2048x1360', '2:3': '1360x2048', 'AUTO': 'auto' },
      '4K': { '1:1': '2880x2880', '3:4': '2480x3312', '4:3': '3312x2480', '9:16': '2160x3840', '16:9': '3840x2160', '2:5': '1536x3840', '5:2': '3840x1536', '3:2': '3520x2352', '2:3': '2352x3520', 'AUTO': 'auto' }
    };
    if (['1:4', '1:8', '4:1', '8:1'].includes(params.aspectRatio)) {
      throw new Error('GPT Image 2 官方接口最大支持 3:1 比例，请改用 9:16、16:9 或其他模型');
    }
    const size = sizeTable[params.imageSize]?.[params.aspectRatio] || '1024x1024';
    const token = localStorage.getItem('auth_token');
    const response = await fetch('/api/ai/openai/images', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ apiKey, prompt: params.prompt, size, quality, images: params.images || [], mask: params.mask })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`${result.message || response.statusText}${result.diagnosticId ? `（诊断编号：${result.diagnosticId}）` : ''}`);
    const image = result.images?.[0]?.url;
    if (!image) throw new Error("OpenAI 未返回图片数据");
    return [image.startsWith('http') || image.startsWith('data:') ? image : `data:image/png;base64,${image}`];
  }

  // 豆包模型特殊处理逻辑
  if ((params.model as string) === 'doubao-pro-v1') {
    const doubaoApiKey = localStorage.getItem('user_doubao_api_key');
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
  const localPaidKey = typeof window !== 'undefined' ? localStorage.getItem('user_paid_image_api_key') : null;
  const apiKey = localPaidKey || params.apiKey || localStorage.getItem('user_gemini_api_key');
  
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
