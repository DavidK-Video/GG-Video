
export enum VideoMode {
  TEXT_TO_VIDEO = 'TEXT_TO_VIDEO',
  IMAGE_TO_VIDEO = 'IMAGE_TO_VIDEO',
  INTERPOLATION = 'INTERPOLATION',
  CONSISTENCY = 'CONSISTENCY'
}

export enum Resolution {
  R720P = '720p',
  R1080P = '1080p'
}

export enum AspectRatio {
  LANDSCAPE = '16:9',
  PORTRAIT = '9:16',
  SQUARE = '1:1',
  SUPER_TALL = '1:2'
}

export interface GenerationHistory {
  id: string;
  url: string;
  prompt: string;
  timestamp: number;
  mode: VideoMode;
  progress?: number;
  status?: string;
  laneId?: string;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  price: string;
  duration: string;
  concurrentLimit: number;
  promptLimit: number;
  subtitle: string;
  stitchTime: string;
  videoLimitText: string;
}

export interface UserProfile {
  email: string;
  phone?: string;
  role: 'user' | 'admin';
  plan_name: string;
  plan_start_date?: string;
  plan_expiry_date?: string;
  plan_status: 'active' | 'expired' | 'suspended';
  remaining_days: number;
  project_name?: string;
  api_keys?: string[];
  machineId: string;
  // Compatibility fields
  accountType?: string;
  expiryDate?: string;
  usedCount?: number;
  limitText?: string;
  licenseInfo?: string;
  is_active?: boolean;
  isAdmin?: boolean;
  pro1_enabled?: boolean;
  pro9_enabled?: boolean;
  use_free_image_gen?: boolean;
  credits?: number;
  isSuspended?: boolean;
}

// Fixed: Export BatchResult interface for consistency across components
export interface BatchResult {
  prompt: string;
  url: string;
  selected?: boolean;
  error?: string;
}
