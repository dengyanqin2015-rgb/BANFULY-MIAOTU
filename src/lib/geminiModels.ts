export type ImageModel =
  | 'gemini-2.5-flash-image'
  | 'gemini-3.1-flash-image'
  | 'gemini-3-pro-image'
  | 'gpt-image-2';

export const DEFAULT_IMAGE_MODEL: ImageModel = 'gemini-3.1-flash-image';

const CURRENT_IMAGE_MODELS = new Set<ImageModel>([
  'gemini-2.5-flash-image',
  'gemini-3.1-flash-image',
  'gemini-3-pro-image',
  'gpt-image-2',
]);

const LEGACY_IMAGE_MODEL_MIGRATIONS: Record<string, ImageModel> = {
  'gemini-3.1-flash-image-preview': 'gemini-3.1-flash-image',
  'gemini-3-pro-image-preview': 'gemini-3-pro-image',
};

export function normalizeImageModel(model?: string | null): ImageModel {
  if (!model) return DEFAULT_IMAGE_MODEL;
  if (CURRENT_IMAGE_MODELS.has(model as ImageModel)) return model as ImageModel;
  return LEGACY_IMAGE_MODEL_MIGRATIONS[model] || DEFAULT_IMAGE_MODEL;
}

export function isLegacyImageModel(model?: string | null): boolean {
  return Boolean(model && LEGACY_IMAGE_MODEL_MIGRATIONS[model]);
}

export interface ImageApiKeyCandidates {
  paidApiKey?: string | null;
  storedPaidApiKey?: string | null;
  userApiKey?: string | null;
  storedUserApiKey?: string | null;
}

export function selectImageApiKey(candidates: ImageApiKeyCandidates): string | null {
  return candidates.paidApiKey?.trim()
    || candidates.storedPaidApiKey?.trim()
    || candidates.userApiKey?.trim()
    || candidates.storedUserApiKey?.trim()
    || null;
}
