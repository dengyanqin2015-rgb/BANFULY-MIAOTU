
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
  PROFILE = 6
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
