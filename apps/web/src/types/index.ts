// ============================================================================
// ResumePilot AI — Frontend Type Definitions
// ============================================================================

// ============================================================================
// API Response Envelope
// ============================================================================

export interface ApiResponse<T> {
  data: T;
  message?: string;
  meta?: PaginationMeta;
}

export interface ApiError {
  statusCode: number;
  message: string | string[];
  error: string;
  timestamp: string;
  path: string;
  requestId?: string;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ============================================================================
// Auth Types
// ============================================================================

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name?: string;
}

export interface AuthResponse {
  accessToken: string;
  expiresIn: number;
  tokenType: string;
  user: UserProfile;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  status: UserStatus;
  emailVerified: boolean;
  mfaEnabled: boolean;
  createdAt: string;
}

export type UserRole = 'JOB_SEEKER' | 'RECRUITER' | 'ADMIN' | 'SUPER_ADMIN';
export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION' | 'DELETED';

// ============================================================================
// Resume Types
// ============================================================================

export type FileType = 'PDF' | 'DOCX' | 'TXT';
export type ParseStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'NEEDS_REVIEW';

export interface ResumeItem {
  id: string;
  title: string;
  originalFileName: string;
  originalFileType: FileType;
  fileSizeBytes: number;
  fileSizeFormatted: string;
  mimeType: string;
  pageCount: number | null;
  parseStatus: ParseStatus;
  parseError: string | null;
  isPrimary: boolean;
  isArchived: boolean;
  language: string;
  createdAt: string;
  updatedAt: string;
  downloadUrl: string | null;
}

export interface ResumeListResponse {
  items: ResumeItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface UploadResumeResponse {
  resume: ResumeItem;
  message: string;
}

// ============================================================================
// Job Description Types
// ============================================================================

export interface JobItem {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  jobType: string | null;
  experienceLevel: string | null;
  sourceType: 'manual' | 'url_import' | 'linkedin' | 'api_import';
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateJobRequest {
  title: string;
  company?: string;
  rawText: string;
  sourceUrl?: string;
}

// ============================================================================
// ATS Analysis Types
// ============================================================================

export interface ATSScoreResult {
  overallScore: number;
  percentile: number | null;
  rating: ATSRating;
  dimensions: DimensionScore[];
  keywordAnalysis: {
    matched: string[];
    partial: Array<{ required: string; found: string; similarity: number }>;
    missing: Array<{ keyword: string; importance: string; suggestion: string }>;
  };
  skillGaps: {
    critical: SkillGap[];
    moderate: SkillGap[];
    strengths: string[];
  };
  suggestions: OptimizationSuggestion[];
  confidence: number;
  metadata: { engineVersion: string; modelUsed?: string; processingTimeMs: number; timestamp: string };
}

export type ATSRating = 'excellent' | 'good' | 'fair' | 'poor' | 'fail';

export interface DimensionScore {
  name: string;
  label: string;
  score: number;
  weight: number;
  weightedScore: number;
  breakdown: string[];
}

export interface SkillGap {
  skill: string;
  importance: string;
  currentLevel: string;
  requiredLevel: string;
  suggestion: string;
}

export interface OptimizationSuggestion {
  id: string;
  section: string;
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  originalText?: string;
  suggestedText?: string;
  explanation: string;
  impactEstimate: { scoreBoost: number; dimension: string };
}

// ============================================================================
// History Types
// ============================================================================

export interface HistoryItem {
  id: string;
  resumeId: string;
  resumeTitle: string;
  jobTitle: string;
  atsScore: number;
  rating: ATSRating;
  createdAt: string;
}

// ============================================================================
// Dashboard Stats
// ============================================================================

export interface DashboardStats {
  totalResumes: number;
  totalJobs: number;
  totalAnalyses: number;
  avgAtsScore: number;
  bestAtsScore: number;
  analysesThisMonth: number;
  scoreDistribution: { excellent: number; good: number; fair: number; poor: number };
  memberSince: string;
}

// ============================================================================
// Common
// ============================================================================

export interface SelectOption {
  value: string;
  label: string;
}
