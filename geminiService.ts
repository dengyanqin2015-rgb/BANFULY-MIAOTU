import { GoogleGenAI, Type, Part } from "@google/genai";
import { VisualConstitution, ProductAnalysis, FinalPrompt, StrategyType, Storyboard, ImageDeconstruction, SegmentedObject } from "./types";

const parseB64 = (b64: string) => {
  const matches = b64.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) return { mimeType: 'image/jpeg', data: b64 };
  return { mimeType: matches[1], data: matches[2] };
};

const getAiClient = (apiKey?: string) => {
  // 优先使用传入的 apiKey，其次检查 localStorage 中的免费 Key，最后检查环境变量
  const localKey = typeof window !== 'undefined' ? localStorage.getItem('user_gemini_api_key') : null;
  const key = apiKey || localKey || process.env.GEMINI_API_KEY;
  if (!key) throw new Error("未配置 API Key。请点击右上角'配置 API Key'按钮进行设置。");
  return new GoogleGenAI({ apiKey: key });
};

export const decodeStyle = async (imageB64: string, modelName: string = 'gemini-3-flash-preview', apiKey?: string): Promise<VisualConstitution> => {
  const ai = getAiClient(apiKey);
  const { mimeType, data } = parseB64(imageB64);
  
  const response = await ai.models.generateContent({
    model: modelName,
    contents: {
      parts: [
        { inlineData: { data, mimeType } },
        { text: "请分析这张参考图的视觉风格。输出格式必须为 JSON，所有内容必须使用中文描述。" }
      ]
    },
    config: {
      systemInstruction: "你是一个顶尖的摄影师和视觉架构师。请深入分析图片的视觉DNA，并使用【纯中文】进行描述。字段要求：style(风格关键词), lighting(光影布局), color(核心配色), composition(构图与留白), texture(材质与氛围), prompt_prefix(用于AI绘画的通用描述前缀)。确保语言优美、专业且完全不含英文描述词。",
      responseMimeType: "application/json",
      maxOutputTokens: 4096,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          style: { type: Type.STRING },
          lighting: { type: Type.STRING },
          color: { type: Type.STRING },
          composition: { type: Type.STRING },
          texture: { type: Type.STRING },
          prompt_prefix: { type: Type.STRING }
        },
        required: ["style", "lighting", "color", "composition", "texture", "prompt_prefix"]
      }
    }
  });

  try {
    return JSON.parse(response.text || '{}');
  } catch { 
    throw new Error("视觉风格解析结果格式错误");
  }
};

export const analyzeProduct = async (imagesB64: string[], extraInfo: string, strategyType: StrategyType, modelName: string = 'gemini-3-flash-preview', compositionRefImageB64?: string | null, apiKey?: string): Promise<ProductAnalysis> => {
  const ai = getAiClient(apiKey);
  
  const imageParts = imagesB64.map(b64 => {
    const { mimeType, data } = parseB64(b64);
    return { inlineData: { data, mimeType } };
  });

  let systemInstruction = '';
  const requestParts: ({ text: string; } | { inlineData: { data: string; mimeType: string; }; })[] = [...imageParts];
  let userPrompt = '';

  if (strategyType === StrategyType.DETAIL) {
    const detailStructure = `1.首屏海报(视觉暴击), 2.信任背书(实验室/背书), 3.细节展示(精密构造), 4.痛点展示(对比隐喻), 5.同行对比(降维打击), 6.场景展示(生活向往)`;
    systemInstruction = `你是一个顶级电商营销专家。
任务：
1. 精确提取产品的物理外观特征。
2. 设计 6 个【详情页】视觉分镜方案，重点是“卖点转化”和“阅读逻辑”，结构必须遵循：${detailStructure}。

**硬性约束：**
- **文案 (copy 字段)**：文案必须高度凝练，控制在 4-8 个汉字。

要求：
- 推荐 3-5 个合适的统一字体。
- 输出 JSON 数据。`;
    userPrompt = `分析这些产品图，为详情页策划6个分镜。指令集文本：${extraInfo}`;
    requestParts.push({ text: userPrompt });

  } else { // MAIN_IMAGE logic
    systemInstruction = `你是一个顶级电商营销专家和场景构图大师。
任务：自动分析产品特性，生成 6 套最适合该产品的高点击率主图方案。
核心要求：
- **智能适配**：深入理解产品核心卖点、材质、目标人群，创造出最能激发购买欲望的场景。
- **文案融合**：设计的文案和排版必须与画面高度融合，做到美观且不干扰用户对产品主体的感知。
- **构图多样性**：每个方案都必须是产品的【完整展示】，并采用具有创意和美感的构图，如黄金比例、对称、对角线等，而不是死板的多角度拍摄。严禁生成产品【局部特写】的方案。

**硬性约束：**
- **文案 (copy 字段)**：文案必须高度凝练，控制在 4-8 个汉字。

要求：
- 推荐 3-5 个合适的统一字体。
- 输出 JSON 数据。`;

    if (compositionRefImageB64) {
      const { mimeType, data } = parseB64(compositionRefImageB64);
      requestParts.push({ inlineData: { data, mimeType } });
      userPrompt = `这是构图参考图。请严格只参考这张图的【构图】，忽略其他所有元素。基于这个构图，为上传的产品图在【同一个场景】下，生成 6 个【不同构图角度】的营销主图方案。分析指令：${extraInfo}。`;
    } else {
      userPrompt = `请为这些产品图，在【同一个场景】下，自动生成 6 个【不同构图角度】的营销主图方案。分析指令：${extraInfo}`;
    }
    requestParts.push({ text: userPrompt });
  }

  const response = await ai.models.generateContent({
    model: modelName,
    contents: { parts: requestParts },
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      maxOutputTokens: 8192,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          physical_features: { type: Type.STRING },
          global_font_options: { type: Type.ARRAY, items: { type: Type.STRING } },
          storyboards: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                title: { type: Type.STRING },
                concept: { type: Type.STRING },
                visual_description: { type: Type.STRING },
                marketing_angle: { type: Type.STRING },
                copy: { type: Type.STRING },
                font_size: { type: Type.STRING },
                placement: { type: Type.STRING },
                prominence: { type: Type.STRING }
              },
              required: ["id", "title", "concept", "visual_description", "marketing_angle", "copy", "font_size", "placement", "prominence"]
            }
          }
        },
        required: ["physical_features", "global_font_options", "storyboards"]
      }
    }
  });

  try {
    const result = JSON.parse(response.text || '{}');
    return {
      strategy_type: strategyType,
      physical_features: result.physical_features || "未提取到明显特征",
      global_font_options: result.global_font_options || ["系统默认字体"],
      storyboards: (result.storyboards || []).slice(0, 6)
    };
  } catch { 
    throw new Error("产品解析结果格式错误");
  }
};

export const fusePrompts = async (constitution: VisualConstitution, analysis: ProductAnalysis, modelName: string = 'gemini-3-flash-preview', apiKey?: string): Promise<FinalPrompt[]> => {
  const ai = getAiClient(apiKey);
  
  const response = await ai.models.generateContent({
    model: modelName,
    contents: {
      parts: [{
        text: `模式：${analysis.strategy_type === StrategyType.DETAIL ? '详情页' : '营销主图'}
风格DNA: ${constitution.style}
提示词前缀: ${constitution.prompt_prefix}
禁止项: ${analysis.prohibited_elements || '无'}
分镜策划详情：${JSON.stringify(analysis.storyboards)}`
      }]
    },
    config: {
      systemInstruction: `你是一个顶尖的电商视觉架构师。
任务：将风格与营销分镜融合。
如果是“营销主图”模式，生成的 prompt 必须追求单图的视觉爆发力、光影张力，确保其在搜索列表页能脱颖而出。
如果是“详情页”模式，确保画面的专业感和信息传递。

输出 JSON 格式，结果存放在 results 数组中。`,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          results: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                title: { type: Type.STRING },
                concept: { type: Type.STRING },
                prompt: { type: Type.STRING },
                copy: { type: Type.STRING },
                font_size: { type: Type.STRING },
                placement: { type: Type.STRING },
                prominence: { type: Type.STRING }
              },
              required: ["id", "title", "concept", "prompt", "copy", "font_size", "placement", "prominence"]
            }
          }
        }
      }
    }
  });

  try {
    const parsed = JSON.parse(response.text || '{}');
    return parsed.results || [];
  } catch { 
    throw new Error("方案融合结果格式错误");
  }
};

export const generateEcomImage = async (params: {
  prompt: string,
  model: string,
  aspectRatio: string,
  imageSize?: string,
  refImageB64?: string,
  productImageB64?: string,
  productImagesB64?: string[], // Support multiple product images
  apiKey?: string
}): Promise<string | undefined> => {
  // 自动切换逻辑：
  // 1. 优先检查环境变量中配置的付费生图专用 Key (VITE_PAID_IMAGE_API_KEY)
  // 2. 其次检查用户在浏览器本地存储中设置的付费 Key (user_paid_image_api_key)
  // 3. 然后使用传入的 apiKey
  // 4. 最后回退到系统默认的免费 Key
  const envPaidKey = process.env.VITE_PAID_IMAGE_API_KEY;
  const localPaidKey = typeof window !== 'undefined' ? localStorage.getItem('user_paid_image_api_key') : null;
  const finalApiKey = envPaidKey || localPaidKey || params.apiKey;
  
  // 豆包模型特殊处理逻辑
  if (params.model === 'doubao-pro-v1') {
    const doubaoApiKey = localStorage.getItem('user_doubao_api_key') || process.env.VITE_DOUBAO_API_KEY;
    const doubaoEndpoint = localStorage.getItem('user_doubao_endpoint') || process.env.VITE_DOUBAO_ENDPOINT || 'https://ark.cn-beijing.volces.com/api/v3/images/generations';
    const doubaoModelId = localStorage.getItem('user_doubao_model_id') || process.env.VITE_DOUBAO_MODEL_ID || 'Doubao-Seedream-5.0-lite';

    if (!doubaoApiKey || !doubaoModelId) {
      throw new Error("豆包 API 配置不完整。请在设置中配置 Doubao API Key 和 Model ID。");
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
      
      return b64.startsWith('http') ? b64 : `data:image/png;base64,${b64}`;
    } catch (err) {
      console.error("Doubao generation error:", err);
      throw err;
    }
  }

  const ai = getAiClient(finalApiKey);
  const parts: Part[] = [{ text: params.prompt }];
  
  if (params.refImageB64) {
    const { mimeType, data } = parseB64(params.refImageB64);
    parts.push({
      inlineData: { data, mimeType }
    });
  }

  if (params.productImageB64) {
    const { mimeType, data } = parseB64(params.productImageB64);
    parts.push({
      inlineData: { data, mimeType }
    });
  }

  if (params.productImagesB64 && params.productImagesB64.length > 0) {
    params.productImagesB64.forEach(b64 => {
      const { mimeType, data } = parseB64(b64);
      parts.push({
        inlineData: { data, mimeType }
      });
    });
  }

  let actualModel = 'gemini-2.5-flash-image';
  if (params.model === 'nanobanana2') {
    actualModel = 'gemini-3.1-flash-image-preview';
  } else if (params.model === 'nanobanana pro') {
    actualModel = 'gemini-3-pro-image-preview';
  } else if (params.model === 'imagen') {
    actualModel = 'imagen-4.0-generate-001';
  }

  const imageConfig: { aspectRatio: string; imageSize?: string } = {
    aspectRatio: params.aspectRatio || "1:1"
  };
  
  if (actualModel !== 'gemini-2.5-flash-image') {
    const sizeMap: Record<string, string> = {
      '0.5K': '512px',
      '1K': '1K',
      '2K': '2K',
      '4K': '4K'
    };
    imageConfig.imageSize = sizeMap[params.imageSize || '1K'] || params.imageSize || "1K";
  }

  try {
    console.log(`[generateEcomImage] Calling ${actualModel} with prompt:`, params.prompt);
    console.log(`[generateEcomImage] Image parts count: ${parts.length - 1}`);
    
    // For Imagen models, use generateImages
    if (actualModel.startsWith('imagen')) {
      const response = await ai.models.generateImages({
        model: actualModel,
        prompt: params.prompt,
        config: {
          numberOfImages: 1,
          aspectRatio: params.aspectRatio as '1:1' | '3:4' | '4:3' | '9:16' | '16:9' || '1:1',
        }
      });
      const b64 = response.generatedImages?.[0]?.image?.imageBytes;
      return b64 ? `data:image/png;base64,${b64}` : undefined;
    }

    const response = await ai.models.generateContent({
      model: actualModel,
      contents: [{ parts }],
      config: {
        imageConfig,
        maxOutputTokens: 2048,
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' }
        ]
      }
    });

    console.log("[generateEcomImage] Response received:", JSON.stringify(response, null, 2));

    const candidate = response.candidates?.[0];
    if (candidate?.finishReason === 'MAX_TOKENS') {
      throw new Error("生成失败：输出超过了模型限制（Max Tokens）。请尝试缩短提示词或减少复杂度。");
    }
    if (candidate?.finishReason === 'SAFETY') {
      throw new Error("生成由于安全策略被拦截。请尝试修改提示词，确保不包含敏感或违规内容。");
    }
    if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
      throw new Error(`生成未正常完成。原因: ${candidate.finishReason}`);
    }

    const part = candidate?.content?.parts?.find(p => p.inlineData);
    if (part?.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }

    // If no image, check for text (might be a safety refusal or error message)
    if (response.text) {
      console.warn("[generateEcomImage] Model returned text instead of image:", response.text);
      throw new Error(`模型未返回图像。模型反馈: ${response.text}`);
    }

    return undefined;
  } catch (error: unknown) {
    const err = error as Error;
    console.error("[generateEcomImage] Error:", err);
    if (err.message?.includes("Requested entity was not found")) {
      throw new Error(`模型 ${actualModel} 未找到或 API Key 无权访问该模型。请尝试更换模型或重新配置 API Key。`);
    }
    if (err.message?.includes("permission")) {
      throw new Error("API Key 权限不足，无法调用生图模型。请检查您的 Google AI Studio 设置。");
    }
    throw err;
  }
};

export const regenerateSinglePrompt = async (constitution: VisualConstitution, storyboard: Storyboard, analysis: ProductAnalysis, modelName: string = 'gemini-3-flash-preview', apiKey?: string): Promise<string> => {
  const ai = getAiClient(apiKey);

  const response = await ai.models.generateContent({
    model: modelName,
    contents: {
      parts: [{
        text: `
          模式：${analysis.strategy_type === StrategyType.DETAIL ? '详情页' : '营销主图'}
          风格DNA: ${constitution.style}
          提示词前缀: ${constitution.prompt_prefix}
          禁止项: ${analysis.prohibited_elements || '无'}
          当前分镜策划详情：${JSON.stringify(storyboard)}`
      }]
    },
    config: {
      systemInstruction: `你是一个顶尖的电商视觉架构师。
任务：为当前分镜重新生成一个更具创意和视觉冲击力的生图 Prompt。
要求：
- 保持原有的营销核心（文案、卖点）不变。
- 在视觉呈现、构图、氛围上进行大胆创新。
- 输出的 prompt 必须是纯文本字符串，直接可用。`,
      responseMimeType: "text/plain",
    }
  });

  return response.text || storyboard.prompt; // Fallback to old prompt
};

export const refinePrompt = async (concept: string, modelName: string = 'gemini-3-flash-preview', apiKey?: string): Promise<string> => {
  const ai = getAiClient(apiKey);

  const response = await ai.models.generateContent({
    model: modelName,
    contents: {
      parts: [{
        text: `请将以下创意概念转化为一段高质量、具有视觉冲击力的 AI 生图提示词 (Prompt)。
        创意概念：${concept}
        要求：
        1. 使用【纯中文】描述。
        2. 包含光影、材质、构图、氛围等专业摄影/艺术词汇。
        3. 直接输出提示词字符串，不要有任何多余文字。`
      }]
    },
    config: {
      systemInstruction: "你是一个顶尖的视觉架构师和 AI 提示词专家。你的任务是基于用户的简单概念，生成极具视觉张力的中文生图指令。",
      maxOutputTokens: 1024,
    }
  });

  return response.text || concept;
};

export const segmentImage = async (imageB64: string, modelName: string = 'gemini-3-flash-preview', apiKey?: string): Promise<SegmentedObject[]> => {
  const ai = getAiClient(apiKey);
  const { mimeType, data } = parseB64(imageB64);

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [
          { inlineData: { data, mimeType } },
          { text: "请深度识别这张图片中的所有独立物体，包括主要产品、背景道具、装饰性小物件以及环境元素。不仅要识别大物体，也要捕捉细微的道具。为每个物体提供一个标签、一个精准的边界框 [x, y, width, height]（坐标范围 0-1000），以及它占全图面积的大致百分比（0-1 之间）。输出格式必须为 JSON 数组。" }
        ]
      },
      config: {
        systemInstruction: `你是一个顶级的电商图像分析专家。你的任务是进行极细致的场景解构。
        要求：
        1. 识别图片中的所有关键元素，包括主要商品、支撑道具、背景装饰、甚至是非常小的点缀物（如花瓣、水滴、小石子等）。
        2. 识别数量建议在 5-10 个之间，确保覆盖场景的丰富度。
        3. 标签应具体且专业（例如：'磨砂质感化妆品瓶', '干枯尤加利叶', '大理石纹理底座'）。
        返回格式：
        [
          {
            "id": 1,
            "label": "物体名称",
            "bbox": [x, y, width, height],
            "relative_scale_ratio": 0.15
          }
        ]
        注意：bbox 坐标是相对于 1000x1000 画布的。`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.INTEGER },
              label: { type: Type.STRING },
              bbox: {
                type: Type.ARRAY,
                items: { type: Type.NUMBER },
                description: "[x, y, width, height]"
              },
              relative_scale_ratio: { type: Type.NUMBER }
            },
            required: ["id", "label", "bbox", "relative_scale_ratio"]
          }
        }
      }
    });

    const results = JSON.parse(response.text || '[]');
    return results.map((obj: SegmentedObject) => ({
      ...obj,
      original_crop_path: imageB64, // In a real app, this would be a cropped image
      scaleAdjustment: 1.0
    }));
  } catch (error) {
    console.error("Error in segmentImage:", error);
    throw error;
  }
};

export const deconstructImage = async (imageB64: string, modelName: string = 'gemini-3-flash-preview', apiKey?: string): Promise<ImageDeconstruction> => {
  console.log("deconstructImage called with model:", modelName, "apiKey provided:", !!apiKey);
  const ai = getAiClient(apiKey);
  const { mimeType, data } = parseB64(imageB64);
  console.log("Parsed image mimeType:", mimeType, "data length:", data.length);
  
  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [
          { inlineData: { data, mimeType } },
          { text: "请作为电商视觉大师，按照《商业视觉工程：全要素图片解构表》对这张图片进行深度解构。输出格式必须为 JSON，所有内容必须使用中文描述。" }
        ]
      },
      config: {
        systemInstruction: `你是一个顶尖的电商视觉架构师。请按照以下16个核心要素对图片进行解构，并生成一段用于AI生图的提示词（generated_prompt）。
      
      解构要素：
      1. shape_form: 形态与轮廓
      2. color_palette: 色彩构成
      3. texture: 材质与肌理
      4. space_negative: 空间与留白
      5. light_direction: 光源方向
      6. light_quality: 光质软硬
      7. shadows: 阴影形态
      8. mood_tone: 色调氛围
      9. focal_point: 视觉中心
      10. leading_lines: 引导线
      11. depth_of_field: 景深虚实
      12. perspective: 拍摄视角
      13. subject: 核心主体
      14. context_background: 环境背景
      15. props: 关键道具
      16. story_moment: 瞬间故事
      
      最后，基于以上解构，生成一段高质量的、用于AI生图的中文提示词(generated_prompt)，该提示词应能完美复现原图的视觉氛围和构图，但主体部分应描述为可替换的通用占位符。`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            shape_form: { type: Type.STRING },
            color_palette: { type: Type.STRING },
            texture: { type: Type.STRING },
            space_negative: { type: Type.STRING },
            light_direction: { type: Type.STRING },
            light_quality: { type: Type.STRING },
            shadows: { type: Type.STRING },
            mood_tone: { type: Type.STRING },
            focal_point: { type: Type.STRING },
            leading_lines: { type: Type.STRING },
            depth_of_field: { type: Type.STRING },
            perspective: { type: Type.STRING },
            subject: { type: Type.STRING },
            context_background: { type: Type.STRING },
            props: { type: Type.STRING },
            story_moment: { type: Type.STRING },
            generated_prompt: { type: Type.STRING }
          },
          required: [
            "shape_form", "color_palette", "texture", "space_negative", 
            "light_direction", "light_quality", "shadows", "mood_tone", 
            "focal_point", "leading_lines", "depth_of_field", "perspective", 
            "subject", "context_background", "props", "story_moment", "generated_prompt"
          ]
        }
      }
    });

    console.log("Gemini raw response text:", response.text);
    if (!response.text) {
      throw new Error("AI 未返回任何内容，请检查图片或 API Key 是否有效。");
    }

    try {
      const parsed = JSON.parse(response.text);
      console.log("Parsed deconstruction result successfully:", parsed);
      return parsed;
    } catch (parseError) {
      console.error("JSON parse error for response:", response.text, "Error:", parseError);
      throw new Error("AI 返回的 JSON 格式错误，请重试。");
    }
  } catch (error) {
    console.error("Error in deconstructImage:", error);
    throw error;
  }
};

export const detailAssistantStep1 = async (imagesB64: string[], keywords: string = '', modelName: string = 'gemini-3-flash-preview', apiKey?: string): Promise<string> => {
  const ai = getAiClient(apiKey);
  const imageParts = imagesB64.map(b64 => {
    const { mimeType, data } = parseB64(b64);
    return { inlineData: { data, mimeType } };
  });

  const response = await ai.models.generateContent({
    model: modelName,
    contents: {
      parts: [
        ...imageParts,
        { text: `请识别这些产品图${keywords ? `（产品关键词：${keywords}）` : ''}，并基于产品特性和应用场景输出一份详细的产品分析报告。包含：核心卖点、目标人群、使用场景、视觉呈现建议。` }
      ]
    },
    config: {
      systemInstruction: "你是一个顶尖的电商产品分析师。请基于上传的产品图和关键词，深入挖掘其物理特性、功能卖点以及潜在的应用场景。输出内容应专业、客观且具有营销洞察力。使用 Markdown 格式输出，所有描述必须使用中文。",
      maxOutputTokens: 4096,
    }
  });

  return response.text || "未能生成分析报告";
};

export const detailAssistantStep2 = async (productAnalysis: string, keywords: string = '', modelName: string = 'gemini-3-flash-preview', apiKey?: string): Promise<string> => {
  const ai = getAiClient(apiKey);

  const response = await ai.models.generateContent({
    model: modelName,
    contents: {
      parts: [
        { text: `基于以下产品分析${keywords ? `和关键词（${keywords}）` : ''}，生成一份整体设计规范：\n${productAnalysis}` }
      ]
    },
    config: {
      systemInstruction: `你是一个顶尖的视觉设计总监。请为该产品制定一份详尽的详情页设计规范。
      规范必须包含：
      1. 色彩系统：主色调（如活力橙 #FF7F00）、辅助色、背景色。
      2. 字体系统：标题字体（如思源黑体 Bold）、正文字体（如思源黑体 Regular）、字号层级（大标题:副标题:正文 = 3:1.8:1）。
      3. 视觉语言：装饰元素（如冰块碎屑、冷凝水珠）、图标风格（简约线性）、留白原则（20% 呼吸空间）。
      4. 摄影风格：光线（自然阳光、45度硬光）、景深（中度景深）、相机参数参考。
      5. 品质要求：分辨率（4K）、风格（专业产品摄影）、真实感（超写实）。
      
      输出内容必须使用 Markdown 格式，且逻辑清晰，所有描述必须使用中文。`,
      maxOutputTokens: 8192,
    }
  });

  return response.text || "未能生成设计规范";
};

export const detailAssistantStep3 = async (designGuide: string, keywords: string = '', screenCount: number = 6, modelName: string = 'gemini-3-flash-preview', apiKey?: string): Promise<DetailStoryboard[]> => {
  const ai = getAiClient(apiKey);

  const prompt = `基于以下设计规范${keywords ? `和关键词（${keywords}）` : ''}，为详情页生成 ${screenCount} 屏的要素和框架结构参考，并为每一屏生成一个高质量的 AI 生图提示词 (prompt)：\n${designGuide}`;
  console.log(`[detailAssistantStep3] Prompt length: ${prompt.length}, Screen count: ${screenCount}, Model: ${modelName}`);
  
  const response = await ai.models.generateContent({
    model: modelName,
    contents: {
      parts: [
        { text: prompt }
      ]
    },
    config: {
      systemInstruction: `你是一位享誉业界的【电商详情页设计专业大师】。
      任务：基于提供的【详情设计规范】作为视觉基调，为该产品设计一套具有极高价值感、美感和品牌张力的详情页分镜架构方案。
      
      **大师级设计准则：**
      1. **精准还原与细节塑造**：在保持设计规范基调的前提下，必须精准还原产品的物理细节，严禁随意增加或删除宝贝本身的特征。通过光影勾勒材质纹理，让产品在视觉上“触手可得”。
      2. **价值感与心动感**：不仅是展示产品，更是塑造价值。通过极致的视觉表达和品牌氛围，将产品塑造得令人心动，产生强烈的购买欲望。
      3. **排版美学与灵动表达**：拒绝死板的艺术堆砌。排版需兼顾现代设计美学与营销逻辑，在保持风格一致性的同时，适度引入视觉特效（如冷凝水雾、流体动态等）来增强冲击力。
      4. **场景化叙事**：必须展示真实且高级的应用场景，让用户在场景中感知产品卖点。
      
      **核心要求：**
      1. **严格执行规范**：每一屏的视觉描述、构图、光影、材质和生图提示词，必须【严格执行】设计规范中定义的色彩系统、字体系统、视觉语言（如装饰元素、留白原则）和摄影风格。
      2. **全局视觉统一**：确保全案 6 屏在视觉语言上高度统一，建立顶级品牌感。
      3. **输出格式**：JSON 数组，包含 ${screenCount} 个对象。
      
      **对象字段要求：**
      - id: 唯一标识，如 "screen1"
      - title: 屏标题，如 "场景展示海报"
      - designGoal: 设计目标（结合大师级营销逻辑与设计规范）
      - composition: 构图方案（必须体现规范中的【留白原则】和构图比例，兼顾排版美学）
      - elements: 内容要素（包含规范中的【装饰元素】、特效元素及应用场景要素）
      - copy: 对象，包含 main (主标题), sub (副标题), description (说明文字)
      - mood: 氛围营造（体现规范中的【色彩系统】和【光线设计】，营造心动氛围）
      - visualScript: 详细视觉脚本。必须严格按照以下结构化关键词格式输出：[核心主体]：...；[环境背景]：...；[光影氛围]：...；[材质细节]：...；[构图视角]：...。**所有内容必须使用中文**。
      - prompt: 专门用于 AI 生图的高质量提示词。要求：
        1. **必须全部使用中文描述**，严禁出现任何英文单词或字母。
        2. 必须严格遵循 visualScript 中的结构化关键词逻辑进行自然语言扩展。
        3. 必须在提示词中明确包含主标题 (copy.main) 和副标题 (copy.sub)，并详细描述它们在画面中的排版位置、字体风格（参考规范中的字体系统）、颜色（参考规范中的主色调）。
        4. 提示词应详细且具有视觉张力，确保 AI 能理解如何将文字与画面完美融合，体现大师级审美。
      
      第一屏必须是“场景展示海报”。`,
      responseMimeType: "application/json",
      maxOutputTokens: 16384,
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            title: { type: Type.STRING },
            designGoal: { type: Type.STRING },
            composition: { type: Type.STRING },
            elements: { type: Type.STRING },
            copy: {
              type: Type.OBJECT,
              properties: {
                main: { type: Type.STRING },
                sub: { type: Type.STRING },
                description: { type: Type.STRING }
              },
              required: ["main", "sub", "description"]
            },
            mood: { type: Type.STRING },
            visualScript: { type: Type.STRING },
            prompt: { type: Type.STRING }
          },
          required: ["id", "title", "designGoal", "composition", "elements", "copy", "mood", "visualScript", "prompt"]
        }
      }
    }
  });

  try {
    const results = JSON.parse(response.text || '[]');
    return results.map((item: Record<string, unknown>) => ({
      ...item,
      status: 'idle'
    }));
  } catch {
    throw new Error("未能生成架构方案或 JSON 格式错误");
  }
};

export const regenerateSingleDetailStoryboard = async (
  designGuide: string,
  currentStoryboard: DetailStoryboard,
  keywords: string = '',
  modelName: string = 'gemini-3-flash-preview',
  apiKey?: string
): Promise<DetailStoryboard> => {
  const ai = getAiClient(apiKey);

  const response = await ai.models.generateContent({
    model: modelName,
    contents: {
      parts: [
        { text: `基于以下设计规范${keywords ? `和关键词（${keywords}）` : ''}，请为详情页中的这一屏（ID: ${currentStoryboard.id}，原标题: ${currentStoryboard.title}）重新生成一个更具创意、更符合大师级水准的方案：\n\n设计规范：\n${designGuide}\n\n当前方案参考：\n${JSON.stringify(currentStoryboard)}` }
      ]
    },
    config: {
      systemInstruction: `你是一位享誉业界的【电商详情页设计专业大师】。
      任务：为详情页中的特定一屏重新设计方案。
      要求：
      1. 保持视觉基调与设计规范高度一致。
      2. 在构图、视觉脚本和生图提示词上进行创新，提升价值感。
      3. 输出格式为单个 JSON 对象，包含：id, title, designGoal, composition, elements, copy (main, sub, description), mood, visualScript, prompt。
      4. 所有描述必须使用中文。`,
      responseMimeType: "application/json",
      maxOutputTokens: 4096,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          title: { type: Type.STRING },
          designGoal: { type: Type.STRING },
          composition: { type: Type.STRING },
          elements: { type: Type.STRING },
          copy: {
            type: Type.OBJECT,
            properties: {
              main: { type: Type.STRING },
              sub: { type: Type.STRING },
              description: { type: Type.STRING }
            },
            required: ["main", "sub", "description"]
          },
          mood: { type: Type.STRING },
          visualScript: { type: Type.STRING },
          prompt: { type: Type.STRING }
        },
        required: ["id", "title", "designGoal", "composition", "elements", "copy", "mood", "visualScript", "prompt"]
      }
    }
  });

  try {
    const result = JSON.parse(response.text || '{}');
    return { ...result, status: 'idle' };
  } catch {
    throw new Error("未能重新生成方案或 JSON 格式错误");
  }
};

export const updateDetailPromptFromFields = async (
  designGuide: string,
  storyboard: DetailStoryboard,
  modelName: string = 'gemini-3-flash-preview',
  apiKey?: string
): Promise<string> => {
  const ai = getAiClient(apiKey);

  const response = await ai.models.generateContent({
    model: modelName,
    contents: {
      parts: [
        { text: `基于以下设计规范和修改后的分镜要素，请重新生成一个高质量的 AI 生图提示词 (prompt)：\n\n设计规范：\n${designGuide}\n\n修改后的分镜要素：\n设计目标: ${storyboard.designGoal}\n构图方案: ${storyboard.composition}\n内容要素: ${storyboard.elements}\n视觉脚本: ${storyboard.visualScript}\n主标题: ${storyboard.copy.main}\n副标题: ${storyboard.copy.sub}\n描述文案: ${storyboard.copy.description}` }
      ]
    },
    config: {
      systemInstruction: `你是一个顶尖的电商视觉架构师。
      任务：根据用户修改后的分镜细节，重新生成一个【纯中文】的 AI 生图提示词。
      要求：
      1. 严格遵循视觉脚本的逻辑。
      2. 融入设计规范中的色彩、光影和材质要求。
      3. 确保提示词具有极强的视觉描述力和排版指导。
      4. 直接输出提示词字符串，不要有任何多余文字。`,
      maxOutputTokens: 2048,
    }
  });

  return response.text || storyboard.prompt;
};
