// ============================================================================
// Resume Optimization Engine — Type Definitions
// ============================================================================

/** 优化请求输入 */
export interface OptimizationRequest {
  /** 原始简历结构化数据 */
  resume: OptimizerResumeInput;
  /** 目标岗位 JD */
  jobDescription: OptimizerJDInput;
  /** ATS 评分结果 (来自评分引擎，用于聚焦低分区域) */
  atsContext?: ATSContextInput;
  /** 优化激进级别 */
  level: OptimizationLevel;
  /** 用户偏好 (可选) */
  preferences?: UserOptimizationPreferences;
}

export type OptimizationLevel = 'conservative' | 'moderate' | 'aggressive';

export interface UserOptimizationPreferences {
  /** 保留个人写作风格 (true = 微调, false = 完全改写) */
  preserveStyle?: boolean;
  /** 关注特定部分 (空 = 全部分) */
  focusSections?: string[];
  /** 目标公司文化关键词 */
  targetCulture?: string[];
  /** 需保留的关键信息 */
  preserveKeywords?: string[];
}

export interface OptimizerResumeInput {
  personalInfo: { fullName: string; email?: string; phone?: string; location?: string };
  professionalSummary: string;
  workExperience: OptimizerExperienceInput[];
  education: OptimizerEducationInput[];
  skills: { technical: string[]; soft: string[]; languages: string[]; certifications: string[] };
  projects: OptimizerProjectInput[];
}

export interface OptimizerExperienceInput {
  id: string;
  title: string;
  company: string;
  startDate: string;
  endDate: string | null;
  isCurrent: boolean;
  description: string;
  highlights: string[];
  technologies: string[];
}

export interface OptimizerEducationInput {
  degree: string;
  institution: string;
  year: string;
  gpa?: string;
  major?: string;
}

export interface OptimizerProjectInput {
  name: string;
  description: string;
  technologies: string[];
  highlights: string[];
}

export interface OptimizerJDInput {
  title: string;
  company?: string;
  requiredSkills: string[];
  preferredSkills: string[];
  responsibilities: string[];
  qualifications: string[];
  rawText: string;
}

export interface ATSContextInput {
  overallScore: number;
  dimensionScores: Array<{ name: string; label: string; score: number; breakdown: string[] }>;
  missingKeywords: string[];
  skillGaps: Array<{ skill: string; importance: string }>;
}

// ============================================================================
// 优化输出 (5 个维度)
// ============================================================================

/** 完整优化结果 */
export interface OptimizationResult {
  /** 1. 缺失技能补充建议 */
  missingSkills: MissingSkillOptimization[];
  /** 2. 弱描述内容增强 */
  weakDescriptions: WeakDescriptionOptimization[];
  /** 3. STAR 法则改写 */
  starRewrites: STARRewriteOptimization[];
  /** 4. 项目描述优化 */
  projectOptimizations: ProjectOptimization[];
  /** 5. 工作经历优化 */
  experienceOptimizations: ExperienceOptimization[];
  /** 优化后的完整简历 (aggressive 模式) */
  optimizedResume?: OptimizerResumeInput;
  /** 元数据 */
  metadata: OptimizationMetadata;
}

// ============================================================================
// 1. 缺失技能
// ============================================================================

export interface MissingSkillOptimization {
  /** 缺失的技能名称 */
  skill: string;
  /** 技能类型 */
  category: 'technical' | 'soft' | 'domain' | 'tool' | 'certification';
  /** JD 中的重要性 */
  importance: 'must_have' | 'preferred' | 'nice_to_have';
  /** 候选人当前相关能力评估 */
  currentProficiency: 'none' | 'adjacent' | 'transferable';
  /** 建议插入的简历部分 */
  targetSection: 'skills' | 'work_experience' | 'projects' | 'summary' | 'education';
  /** 具体插入建议 (可直接使用或编辑的文本) */
  suggestedInsertion: string;
  /** 如果候选人有相邻技能，如何桥接的解释 */
  bridgeExplanation: string | null;
  /** 学习路径建议 (如果需要) */
  learningPath: string | null;
  /** 对 ATS 评分的预估提升 */
  estimatedImpact: { dimension: string; scoreBoost: number };
}

// ============================================================================
// 2. 弱描述内容
// ============================================================================

export interface WeakDescriptionOptimization {
  /** 弱内容的 ID (指向原简历中的位置) */
  targetId: string;
  /** 所在部分 */
  section: 'professional_summary' | 'work_experience' | 'projects' | 'education';
  /** 子索引 (如 work_experience[2].highlights[1]) */
  subPath: string;
  /** 原始文本 */
  originalText: string;
  /** 弱点类型 */
  weaknessType: WeaknessType;
  /** 弱点分析 */
  analysis: string;
  /** 优化后的文本 */
  optimizedText: string;
  /** 为什么这样修改的解释 */
  explanation: string;
  /** 使用的技巧 */
  techniquesUsed: OptimizationTechnique[];
  /** 预估影响 */
  estimatedImpact: { dimension: string; scoreBoost: number };
}

export type WeaknessType =
  | 'vague_language'        // 模糊语言 ("参与了一些项目")
  | 'passive_voice'         // 被动语态
  | 'weak_action_verb'      // 弱行为动词 ("负责"而非"主导")
  | 'missing_quantification'// 缺少量化数据
  | 'too_generic'           // 过于通用
  | 'irrelevant_to_jd'      // 与 JD 无关
  | 'redundant'             // 冗余重复
  | 'outdated'              // 过时内容
  | 'overly_technical'      // 过度技术化 (对非技术 JD)
  | 'not_technical_enough'; // 技术深度不足

export type OptimizationTechnique =
  | 'star_format'           // STAR 法则
  | 'quantification'        // 量化成果
  | 'action_verb_upgrade'   // 升级行为动词
  | 'keyword_injection'     // 注入关键词
  | 'specificity_boost'     // 增加具体细节
  | 'impact_highlighting'   // 突出影响力
  | 'conciseness'           // 精简表达
  | 'contextualization'     // 添加上下文
  | 'modernization';        // 现代化表达

// ============================================================================
// 3. STAR 改写
// ============================================================================

export interface STARRewriteOptimization {
  /** 目标位置 */
  targetId: string;
  section: 'work_experience' | 'projects';
  subPath: string;
  /** 原始要点 */
  originalBullet: string;
  /** STAR 分析: 原始内容的 STAR 结构评估 */
  starAnalysis: {
    situation: { present: boolean; score: number; content: string };
    task: { present: boolean; score: number; content: string };
    action: { present: boolean; score: number; content: string };
    result: { present: boolean; score: number; content: string };
  };
  /** 3 个 STAR 改写变体 (不同侧重点) */
  variants: STARVariant[];
  /** 推荐的变体索引 (0-2) */
  recommendedIndex: number;
  /** 推荐理由 */
  recommendationReason: string;
}

export interface STARVariant {
  /** 侧重点 */
  focus: 'technical_depth' | 'business_impact' | 'leadership' | 'efficiency' | 'innovation';
  /** 改写后的要点 */
  rewrittenBullet: string;
  /** 使用的 STAR 结构映射 */
  starMapping: string;
  /** 关键词密度提升 */
  keywordBoost: string[];
  /** 预估 ATS 评分提升 */
  estimatedScoreBoost: number;
}

// ============================================================================
// 4. 项目描述优化
// ============================================================================

export interface ProjectOptimization {
  /** 项目 ID */
  projectId: string;
  projectName: string;
  /** 优化后的项目名称 (更具描述性) */
  optimizedName: string | null;
  /** 优化后的描述 */
  optimizedDescription: string;
  /** 优化后的要点 */
  optimizedHighlights: string[];
  /** 优化类型 */
  optimizations: {
    type: 'name_enhancement' | 'description_enhancement' | 'highlight_rewrite' | 'tech_highlight' | 'impact_highlight';
    original: string;
    optimized: string;
    reason: string;
  }[];
  /** 新增技术关键词 (来自 JD) */
  injectedKeywords: string[];
}

// ============================================================================
// 5. 工作经历优化
// ============================================================================

export interface ExperienceOptimization {
  /** 经历条目 ID */
  experienceId: string;
  /** 公司 + 职位 */
  position: string;
  /** 优化后的职位标题 */
  optimizedTitle: string | null;
  /** 优化后的描述段落 */
  optimizedDescription: string;
  /** 优化后的要点 */
  optimizedHighlights: string[];
  /** 新增的要点 (补充遗漏的成就) */
  additionalHighlights: AdditionalHighlight[];
  /** 删除的要点 (不相关或冗余) */
  removedHighlightIndices: number[];
  /** 与 JD 的匹配度提升 */
  relevanceImprovement: number; // 0-100
}

export interface AdditionalHighlight {
  /** 基于什么推断生成 */
  basedOn: 'jd_requirement' | 'industry_standard' | 'career_projection' | 'skill_inference';
  /** 生成的要点 */
  highlight: string;
  /** 置信度 (基于推断的要点不应 100% 确定) */
  confidence: number; // 0-1
  /** 提醒用户验证 */
  needsUserVerification: boolean;
}

// ============================================================================
// 元数据
// ============================================================================

export interface OptimizationMetadata {
  /** 使用的模型 */
  model: string;
  /** 优化级别 */
  level: OptimizationLevel;
  /** Token 用量 */
  tokensUsed: { prompt: number; completion: number; total: number };
  /** 处理时间 (ms) */
  processingTimeMs: number;
  /** 生成的建议总数 */
  totalSuggestions: number;
  /** 预估 ATS 总分提升 */
  estimatedOverallScoreBoost: number;
  /** 生成时间 */
  generatedAt: string;
  /** 引擎版本 */
  engineVersion: string;
}
