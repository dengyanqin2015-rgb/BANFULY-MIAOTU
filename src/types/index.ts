
export interface VisualConstitution {
  style: string;
  lighting: string;
  color: string;
  composition: string;
  texture: string;
  prompt_prefix: string;
  palette?: string[];
}

export interface Storyboard {
  id: string;
  title: string;
  concept: string;
  visual_description: string;
  marketing_angle: string;
  copy: string;       
  font_size: string;  
  placement: string;  
  prominence: string; 
}

export enum StrategyType {
  DETAIL = 'detail',
  MAIN_IMAGE = 'main_image',
  STORYTELLING = 'storytelling',
  FUNCTIONAL = 'functional',
  MINIMALIST = 'minimalist',
  EXPERIMENTAL = 'experimental'
}

export interface ProductAnalysis {
  strategy_type: StrategyType;
  physical_features: string;
  global_font_options: string[]; 
  storyboards: Storyboard[];
  // 结构化指令存储
  selling_points?: string;
  allowed_elements?: string;
  prohibited_elements?: string;
  // Additional fields
  name?: string;
  usp?: string;
  audience?: string;
  visualAdvice?: string;
}

export interface FinalPrompt {
  id: string;
  title: string;
  concept: string;
  prompt: string;
  copy: string;
  font_size: string;
  placement: string;
  prominence: string;
  imageUrl?: string;
  loading?: boolean;
}

export enum AppStep {
  STYLE_DECODER = 1,
  PRODUCT_STRATEGY = 2,
  PROMPT_FUSION = 3,
  HISTORY = 4,
  ADMIN_PANEL = 5,
  PROFILE = 6,
  SINGLE_TOOL = 7
}

export enum SingleToolMode {
  REFERENCE = 'reference',
  REPLACEMENT = 'replacement',
  VIEW_3D = 'view_3d',
  THREE_D_ANGLE = 'three_d_angle'
}

export interface SegmentedObject {
  id: number;
  label: string;
  bbox: [number, number, number, number];
  mask_path?: string;
  original_crop_path: string;
  relative_scale_ratio: number;
  replacementImage?: string;
  scaleAdjustment: number;
}

export interface ImageDeconstruction {
  shape_form: string;
  color_palette: string;
  texture: string;
  space_negative: string;
  light_direction: string;
  light_quality: string;
  shadows: string;
  mood_tone: string;
  focal_point: string;
  leading_lines: string;
  depth_of_field: string;
  perspective: string;
  subject: string;
  context_background: string;
  props: string;
  story_moment: string;
  generated_prompt: string;
}

export interface ImageHistory {
  id: string;
  userId: string;
  username: string;
  imageUrl: string;
  prompt: string;
  timestamp: number;
}

export interface User {
  id: string;
  username: string;
  role: 'admin' | 'user';
  credits: number;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
}

export interface RechargeLog {
  id: string;
  userId: string;
  username: string;
  amount: number;
  previousCredits: number;
  newCredits: number;
  timestamp: number;
  adminId: string;
  adminName: string;
}

export interface GenerationLog {
  id: string;
  userId: string;
  username: string;
  timestamp: number;
}

export interface CameraParams {
  position: [number, number, number];
  rotation: [number, number, number];
  fov: number;
}

export interface ModelResolution {
  cost: number;
  rmb: number;
  credits: number;
}

export interface ModelConfig {
  name: string;
  label: string;
  description: string;
  resolutions: Record<string, ModelResolution>;
}

export const MODEL_COSTS: Record<string, ModelConfig> = {
  'nanobanana': { 
    name: 'FLASH 2.5', 
    label: 'BALANCED',
    description: '平衡性能与质量，适合快速迭代',
    resolutions: {
      '1K': { cost: 0.039, rmb: 0.28, credits: 1 }
    }
  },
  'nanobanana2': { 
    name: 'FLASH 3.1', 
    label: 'HIGH FIDELITY',
    description: '高保真渲染，细节表现力极强',
    resolutions: {
      '0.5K': { cost: 0.045, rmb: 0.33, credits: 1 },
      '1K': { cost: 0.067, rmb: 0.49, credits: 2 },
      '2K': { cost: 0.101, rmb: 0.73, credits: 4 },
      '4K': { cost: 0.151, rmb: 1.10, credits: 8 }
    }
  },
  'nanobanana pro': { 
    name: 'PRO 3.0', 
    label: 'CINEMA GRADE',
    description: '电影级光影，极致商业质感',
    resolutions: {
      '1K': { cost: 0.134, rmb: 0.97, credits: 5 },
      '2K': { cost: 0.134, rmb: 0.97, credits: 10 },
      '4K': { cost: 0.24, rmb: 1.74, credits: 20 }
    }
  }
};
