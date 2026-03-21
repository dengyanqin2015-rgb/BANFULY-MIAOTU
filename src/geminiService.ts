import { GoogleGenAI, TextPart, InlineDataPart } from "@google/genai";
import { VisualConstitution, ProductAnalysis, StrategyType, Storyboard } from './types';

interface GenerateImageParams {
  prompt: string;
  model: string;
  aspectRatio: string;
  refImageB64?: string;
  apiKey?: string;
}

const getGeminiClient = (apiKey?: string) => {
  if (apiKey) {
    return new GoogleGenAI({ apiKey });
  } else if (process.env.GEMINI_API_KEY) {
    return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  } else {
    throw new Error("未配置 Gemini API Key。请在设置中输入您的 Key 或确保环境变量已设置。");
  }
};

export const decodeStyle = async (imageB64: string, model: string, apiKey?: string): Promise<VisualConstitution> => {
  const ai = getGeminiClient(apiKey);
  const imagePart = {
    inlineData: {
      mimeType: "image/jpeg",
      data: imageB64.split(',')[1],
    },
  };

  const prompt = `你是一个顶级的电商视觉架构师，擅长从图片中提取视觉DNA并转化为可用于AI生图的提示词协议。请根据用户提供的图片，分析其核心视觉风格、光影逻辑、配色方案、构图法则和材质氛围。将分析结果结构化为以下JSON格式输出。请确保每个字段都包含具体的、可用于AI生图的描述性提示词，字数在15-30字之间。请不要输出任何多余的文字，只需要JSON。\n\n{\n  "prompt_prefix": "[整体视觉协议前缀，例如：超现实主义、赛博朋克、极简主义]",\n  "style": "[核心风格描述，例如：高级感、科技感、复古风]",\n  "lighting": "[光影逻辑描述，例如：伦勃朗光、高对比度、柔和漫射光]",\n  "color": "[配色方案描述，例如：莫兰迪色系、高饱和撞色、黑白灰]",\n  "composition": "[构图法则描述，例如：黄金比例构图、对称构图、对角线构图]",\n  "texture": "[材质氛围描述，例如：金属质感、丝绸般光滑、粗糙颗粒感]"\n}
\n请严格遵循JSON格式，不要有任何额外说明。`;

  const response = await ai.models.generateContent({
    model: model,
    contents: [{ parts: [imagePart, { text: prompt }] }],
    config: {
      responseMimeType: "application/json",
    },
  });

  const text = response.text;
  if (!text) throw new Error("API 返回为空");
  return JSON.parse(text) as VisualConstitution;
};

export const analyzeProduct = async (
  productImagesB64: string[],
  productInfo: string,
  strategyType: StrategyType,
  model: string,
  compositionRefImageB64: string | null,
  apiKey?: string
): Promise<ProductAnalysis> => {
  const ai = getGeminiClient(apiKey);
  const imageParts = productImagesB64.map(img => ({
    inlineData: {
      mimeType: "image/jpeg",
      data: img.split(',')[1],
    },
  }));

  let compositionImagePart = [];
  if (compositionRefImageB64) {
    compositionImagePart = [{
      inlineData: {
        mimeType: "image/jpeg",
        data: compositionRefImageB64.split(',')[1],
      },
    }];
  }

  const prompt = `你是一个顶级的电商视觉架构师，擅长从产品图中提取物理特征，并结合营销信息，输出电商详情页或主图的创意分镜方案。\n\n用户提供了以下产品图片和产品信息：\n产品信息：${productInfo}\n\n请根据这些信息，结合你对电商视觉的理解，输出一个结构化的JSON对象。\n\n输出要求：\n1.  "physical_features": 提炼产品的主要物理特征，例如材质、形状、尺寸、功能等，用作AI生图的物理约束。字数在30-50字之间。\n2.  "global_font_options": 根据产品调性，给出3-5个适合的字体风格建议，例如："现代无衬线体", "优雅衬线体", "科技未来感字体"。\n3.  "storyboards": 根据产品信息和策略类型（${strategyType === StrategyType.DETAIL ? '详情页分镜' : '营销主图方案'}），生成6个创意分镜方案。每个方案包含：\n    a.  "id": 唯一ID，例如 "sb1", "sb2"。\n    b.  "title": 分镜的标题，例如 "产品卖点特写", "场景化展示"。\n    c.  "concept": 该分镜的营销构思，字数在20-40字之间。\n    d.  "copy": 该分镜的核心文案，字数在10-20字之间。\n    e.  "placement": 建议文案在画面中的排版位置，例如 "左上角", "居中", "右下角"。\n    f.  "font_size": 建议文案的字号，例如 "大字号", "中字号", "小字号"。\n    g.  "prominence": 该分镜在整个方案中的重要性，例如 "高", "中", "低"。\n    h.  "prompt": 该分镜的生图提示词，结合产品特征和营销构思，字数在50-80字之间。\n\n请严格遵循JSON格式输出，不要有任何额外说明。`;

  const contents = [...imageParts, ...compositionImagePart, { text: prompt }];

  const response = await ai.models.generateContent({
    model: model,
    contents: [{ parts: contents }],
    config: {
      responseMimeType: "application/json",
    },
  });

  const text = response.text;
  if (!text) throw new Error("API 返回为空");
  return JSON.parse(text) as ProductAnalysis;
};

export const generateEcomImage = async ({ prompt, model, aspectRatio, refImageB64, apiKey }: GenerateImageParams): Promise<string | null> => {
  const ai = getGeminiClient(apiKey);

  const contents: (TextPart | InlineDataPart)[] = [{ text: prompt }];
  if (refImageB64) {
    contents.unshift({
      inlineData: {
        mimeType: "image/jpeg",
        data: refImageB64.split(',')[1],
      },
    });
  }

  const response = await ai.models.generateContent({
    model: model === 'nanobanana pro' ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image',
    contents: [{ parts: contents }],
    config: {
      imageConfig: {
        aspectRatio: aspectRatio,
        imageSize: model === 'nanobanana pro' ? '1K' : '512px',
      },
    },
  });

  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  return null;
};

export const regenerateSinglePrompt = async (
  constitution: VisualConstitution,
  storyboard: Storyboard,
  analysis: ProductAnalysis,
  model: string,
  apiKey?: string
): Promise<string> => {
  const ai = getGeminiClient(apiKey);

  const prompt = `你是一个顶级的电商视觉架构师。请根据以下信息，重新生成一个更优质的AI生图提示词。\n\n视觉宪法：\n- 前缀协议: ${constitution.prompt_prefix}\n- 核心风格: ${constitution.style}\n- 光影逻辑: ${constitution.lighting}\n- 配色方案: ${constitution.color}\n- 构图法则: ${constitution.composition}\n- 材质氛围: ${constitution.texture}\n\n产品物理特征: ${analysis.physical_features}\n\n当前分镜方案：\n- 标题: ${storyboard.title}\n- 营销构思: ${storyboard.concept}\n- 核心文案: ${storyboard.copy}\n- 排版位置: ${storyboard.placement}\n- 建议字号: ${storyboard.font_size}\n- 重要性: ${storyboard.prominence}\n\n请结合以上所有信息，生成一个全新的、更具创意和细节的AI生图提示词。提示词应在50-80字之间，直接输出提示词内容，不要有任何额外说明。`;

  const response = await ai.models.generateContent({
    model: model,
    contents: [{ parts: [{ text: prompt }] }],
  });

  const text = response.text;
  if (!text) throw new Error("API 返回为空");
  return text;
};
