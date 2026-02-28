import { GoogleGenAI, Type } from "@google/genai";
import { VisualConstitution, ProductAnalysis, FinalPrompt, StrategyType, Storyboard } from "./types";

const parseB64 = (b64: string) => {
  const matches = b64.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) return { mimeType: 'image/jpeg', data: b64 };
  return { mimeType: matches[1], data: matches[2] };
};

const getAiClient = (apiKey?: string) => {
  const key = apiKey || process.env.GEMINI_API_KEY;
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
  refImageB64?: string,
  apiKey?: string
}): Promise<string | undefined> => {
  const ai = getAiClient(params.apiKey);
  const parts: ({ text: string; } | { inlineData: { data: string; mimeType: string; }; })[] = [{ text: params.prompt }];
  
  if (params.refImageB64) {
    const { mimeType, data } = parseB64(params.refImageB64);
    parts.push({
      inlineData: { data, mimeType }
    });
  }

  const actualModel = params.model === 'nanobanana' ? 'gemini-2.5-flash-image' : 'gemini-3-pro-image-preview';

  const response = await ai.models.generateContent({
    model: actualModel,
    contents: { parts },
    config: {
      imageConfig: {
        aspectRatio: params.aspectRatio,
        imageSize: actualModel === 'gemini-3-pro-image-preview' ? "1K" : undefined
      }
    }
  });

  const part = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
  return part?.inlineData ? `data:image/png;base64,${part.inlineData.data}` : undefined;
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
