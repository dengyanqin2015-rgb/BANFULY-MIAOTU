
export interface VisualConstitution {
  style: string;
  lighting: string;
  color: string;
  composition: string;
  texture: string;
  prompt_prefix: string;
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
  MAIN_IMAGE = 'main_image'
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
}

export enum AppStep {
  STYLE_DECODER = 1,
  PRODUCT_STRATEGY = 2,
  PROMPT_FUSION = 3,
  HISTORY = 4,
  ADMIN_PANEL = 5,
  PROFILE = 6,
  SINGLE_TOOL = 7,
  DETAIL_ASSISTANT = 8,
  FULL_PLAN = 9,
  WORKFLOW = 10
}

export enum SingleToolMode {
  REFERENCE = 'reference',
  REPLACEMENT = 'replacement',
  PENDING_2 = 'pending_2'
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

export interface DetailStoryboard {
  id: string;
  title: string;
  designGoal: string;
  composition: string;
  elements: string;
  copy: {
    main: string;
    sub: string;
    description: string;
  };
  mood: string;
  visualScript: string; // 详细视觉脚本/关键词，带结构划分
  prompt: string;
  refImage?: string;
  generatedImage?: string;
  status: 'idle' | 'loading' | 'done' | 'error';
}
