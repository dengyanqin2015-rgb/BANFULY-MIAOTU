
export enum AppStep {
  WORKFLOW = 0,
  FULL_PLAN = 1,
  DETAIL_ASSISTANT = 2,
  SINGLE_TOOL = 3,
  HISTORY = 4,
  PROFILE = 5,
  ADMIN_PANEL = 6
}

export enum StrategyType {
  MAIN = 'main',
  DETAIL = 'detail'
}

export interface User {
  id: string;
  username: string;
  role: 'admin' | 'user';
  credits: number;
}

export interface AuthState {
  user: User | null;
  loading: boolean;
}

export interface RechargeLog {
  id: string;
  userId: string;
  username: string;
  amount: number;
  previousCredits: number;
  newCredits: number;
  adminId: string;
  adminName: string;
  timestamp: string;
}

export interface GenerationLog {
  id: string;
  userId: string;
  username: string;
  timestamp: string;
}

export interface ImageHistoryItem {
  id: string;
  userId: string;
  imageUrl: string;
  prompt: string;
  timestamp: string;
}

export interface Constitution {
  id: string;
  title: string;
  prompt_prefix: string;
  style: string;
  lighting: string;
  composition: string;
  color: string;
  background: string;
  camera: string;
}

export interface Storyboard {
  id: string;
  title: string;
  concept: string;
  prompt: string;
  copy: string;
  font_size: string;
  placement: string;
  prominence: string;
}

export interface Analysis {
  physical_features: string;
  selling_points: string;
  allowed_elements: string;
  prohibited_elements: string;
  storyboards: Storyboard[];
  global_font_options: string[];
}

export interface FinalPrompt extends Storyboard {
  generatedImage?: string;
}

export interface DetailStoryboard {
  id: string;
  title: string;
  concept: string;
  prompt: string;
  refImage?: string;
  generatedImage?: string;
  status: 'idle' | 'loading' | 'done' | 'error';
}

export interface DeconstructionResult {
  generated_prompt: string;
  style_description: string;
  lighting_description: string;
  composition_description: string;
  color_description: string;
  subject_description: string;
  background_description: string;
  camera_description: string;
  [key: string]: string;
}

export interface SegmentedObject {
  id: number;
  label: string;
  bbox: [number, number, number, number];
  original_crop_path?: string;
  replacementImage?: string;
  scaleAdjustment: number;
}
