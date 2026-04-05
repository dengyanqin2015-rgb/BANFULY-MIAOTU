import { GoogleGenAI } from "@google/genai";

export type ImageModel = "gemini-2.5-flash-image" | "gemini-3.1-flash-image-preview" | "gemini-3-pro-image-preview";
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

export async function generateImage(params: GenerationParams): Promise<string[]> {
  const apiKey = params.apiKey || process.env.API_KEY || process.env.GEMINI_API_KEY;
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
    
    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          const base64Data = part.inlineData.data;
          imageUrls.push(`data:${part.inlineData.mimeType};base64,${base64Data}`);
        }
      }
    }

    if (imageUrls.length === 0) {
      // Check if it was blocked by safety filters
      const safetyRatings = response.candidates?.[0]?.safetyRatings;
      const isBlocked = safetyRatings?.some(r => r.probability !== 'NEGLIGIBLE');
      if (isBlocked) {
        throw new Error("内容因安全策略被拦截，请尝试修改提示词");
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
