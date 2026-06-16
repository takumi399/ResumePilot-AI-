// ============================================================================
// ATS Scoring Engine — Type Definitions
// ============================================================================

// ============================================================================
// 输入数据结构
// ============================================================================

/** 简历结构化数据 (来自 AI 解析或手动输入) */
export interface StructuredResume {
  personalInfo: {
    fullName: string;
    email: string;
    phone?: string;
    location?: string;
    linkedIn?: string;
    portfolio?: string;
    github?: string;
  };
  professionalSummary: string;
  workExperience: WorkExperienceEntry[];
  education: EducationEntry[];
  skills: SkillSet;
  projects: ProjectEntry[];
  certifications: string[];
  languages: LanguageEntry[];
  awards: string[];
  publications: PublicationEntry[];
}

export interface WorkExperienceEntry {
  id: string;
  title: string;
  company: string;
  startDate: string;    // '2023-03'
  endDate: string | null; // null = 至今
  isCurrent: boolean;
  description: string;
  highlights: string[];  // 要点列表
  technologies: string[];
  industry?: string;
}

export interface EducationEntry {
  degree: string;        // '计算机科学学士'
  institution: string;
  year: string;          // '2019'
  gpa?: string;
  major?: string;
}

export interface SkillSet {
  technical: string[];    // ['Python', 'Kubernetes', 'PostgreSQL']
  soft: string[];         // ['团队协作', '沟通能力']
  languages: string[];    // ['英语 (CET-6)', '中文 (母语)']
  certifications: string[];
}

export interface ProjectEntry {
  name: string;
  description: string;
  technologies: string[];
  url?: string;
  highlights: string[];
}

export interface LanguageEntry {
  language: string;
  proficiency: 'native' | 'fluent' | 'intermediate' | 'basic';
}

export interface PublicationEntry {
  title: string;
  venue: string;
  date: string;
  url?: string;
}

/** 岗位 JD 结构化数据 */
export interface StructuredJobDescription {
  title: string;
  company?: string;
  department?: string;
  location?: string;
  experienceLevel: 'entry' | 'mid' | 'senior' | 'lead' | 'executive';
  requiredSkills: WeightedSkill[];
  preferredSkills: WeightedSkill[];
  responsibilities: string[];
  requiredQualifications: string[];
  preferredQualifications: string[];
  educationRequirement?: {
    minimumLevel: 'high_school' | 'associate' | 'bachelor' | 'master' | 'phd';
    preferredLevel?: 'high_school' | 'associate' | 'bachelor' | 'master' | 'phd';
    preferredMajors?: string[];
  };
  yearsOfExperienceRequired: number;
  industryFocus?: string[];
  rawText: string;  // 原始 JD 文本 (用于 LLM 分析)
}

export interface WeightedSkill {
  name: string;
  canonicalName: string;   // 标准化名称: 'python'
  weight: number;           // 0.0 - 1.0 关键词权重
  importance: 'must_have' | 'preferred' | 'nice_to_have';
  yearsRequired?: number;
  category?: string;        // 'programming_language', 'framework', 'cloud', etc.
}

// ============================================================================
// 中间计算结构
// ============================================================================

/** 规则引擎输出 */
export interface RuleEngineOutput {
  skillMatch: SkillMatchResult;
  keywordCoverage: KeywordCoverageResult;
  experienceRelevance: ExperienceRelevanceResult;
  projectRelevance: ProjectRelevanceResult;
  educationMatch: EducationMatchResult;
  formatQuality: FormatQualityResult;
}

/** LLM 分析输出 */
export interface LLMAnalysisOutput {
  skillSemanticMatch: SkillSemanticResult;
  experienceDepth: ExperienceDepthResult;
  projectDepth: ProjectDepthResult;
  careerTrajectory: CareerTrajectoryResult;
  overallImpression: string;
}

// ============================================================================
// 各维度评分结果
// ============================================================================

export interface SkillMatchResult {
  dimension: 'skill_match';
  rawScore: number;           // 0-100
  ruleScore: number;          // 规则引擎分数
  llmScore: number | null;    // LLM 语义分数 (可为 null)
  details: {
    mustHaveMatched: string[];      // 已匹配的必备技能
    mustHaveMissing: string[];      // 缺失的必备技能
    preferredMatched: string[];     // 已匹配的优先技能
    preferredMissing: string[];     // 缺失的优先技能
    partialMatches: PartialMatch[]; // 模糊匹配 (语义相近但不完全相同)
    matchRatio: number;             // 匹配率 0.0-1.0
    weightedScore: number;          // 加权分数 0-100
  };
}

export interface PartialMatch {
  required: string;
  found: string;
  similarity: number;   // 0.0-1.0
  method: 'exact' | 'fuzzy' | 'synonym' | 'semantic';
}

export interface KeywordCoverageResult {
  dimension: 'keyword_coverage';
  rawScore: number;
  ruleScore: number;
  llmScore: number | null;
  details: {
    totalKeywords: number;
    matchedKeywords: number;
    missingKeywords: MissingKeyword[];
    keywordDensity: number;            // 0.0-1.0 关键词密度
    tfidfRelevanceScore: number;       // TF-IDF 相关性 0-100
    sectionDistribution: SectionDistribution; // 关键词在各部分的分布
  };
}

export interface MissingKeyword {
  keyword: string;
  importance: 'must_have' | 'preferred' | 'nice_to_have';
  weight: number;
  suggestion: string;  // AI 生成的关键词相关建议
}

export interface SectionDistribution {
  summary: number;        // 概述部分关键词密度
  experience: number;     // 经历部分关键词密度
  skills: number;         // 技能部分关键词密度
  projects: number;       // 项目部分关键词密度
  education: number;      // 教育部分关键词密度
}

export interface ExperienceRelevanceResult {
  dimension: 'experience_relevance';
  rawScore: number;
  ruleScore: number;
  llmScore: number | null;
  details: {
    totalYears: number;
    relevantYears: number;
    yearsScore: number;             // 0-100 年限分数
    titleSimilarity: number;        // 0-100 职位名称相似度
    industryMatch: boolean;
    quantifiedAchievements: number; // 可量化成就数量
    starComplianceRate: number;     // STAR 法则符合率 0-100
    leadershipIndicators: number;   // 领导力指标数量
  };
}

export interface ProjectRelevanceResult {
  dimension: 'project_relevance';
  rawScore: number;
  ruleScore: number;
  llmScore: number | null;
  details: {
    relevantProjects: number;
    totalProjects: number;
    techStackOverlap: number;   // 技术栈重叠度 0-100
    complexityScore: number;    // 项目复杂度 0-100
    impactScore: number;        // 项目影响力 0-100
  };
}

export interface EducationMatchResult {
  dimension: 'education_match';
  rawScore: number;
  ruleScore: number;
  llmScore: number | null;
  details: {
    highestDegree: string;
    requiredLevel: string;
    levelMatch: boolean;
    majorRelevance: number;    // 0-100 专业相关性
    institutionTier: number;   // 学校层级 0-100 (可选)
    gpaQuality: number;        // GPA 质量 0-100 (可选)
  };
}

export interface FormatQualityResult {
  dimension: 'format_quality';
  rawScore: number;
  ruleScore: number;      // 纯规则评分，LLM 不参与
  llmScore: null;
  details: {
    hasStandardSections: boolean;    // 标准章节头
    usesTablesOrColumns: boolean;    // 表格/多列 (ATS 杀手)
    usesImagesOrGraphics: boolean;   // 图片/图表 (ATS 杀手)
    hasConsistentFormatting: boolean;// 格式一致性
    usesStandardFonts: boolean;      // 标准字体
    bulletPointConsistency: boolean; // 要点符号一致性
    actionVerbDensity: number;       // 行为动词密度 0-100
    contactInfoCompleteness: boolean;// 联系方式完整性
    lengthScore: number;             // 篇幅分数 0-100 (太长/太短扣分)
  };
}

// ============================================================================
// LLM 语义分析结果
// ============================================================================

export interface SkillSemanticResult {
  score: number;            // 0-100
  semanticSimilarity: number; // 余弦相似度
  contextMatches: ContextMatch[];
  confidenceScore: number;  // 置信度 0-1
}

export interface ContextMatch {
  skill: string;
  foundInContext: boolean;  // 技能是否出现在相关的工作描述中
  contextQuality: number;   // 上下文质量 0-100
  evidence: string;         // 原文证据
}

export interface ExperienceDepthResult {
  score: number;
  impactLevel: 'low' | 'medium' | 'high' | 'exceptional';
  roleProgression: number;    // 职业发展轨迹 0-100
  scopeIndicators: string[];  // 影响力指标
  confidenceScore: number;
}

export interface ProjectDepthResult {
  score: number;
  technicalDepth: number;     // 技术深度 0-100
  businessImpact: number;     // 商业影响 0-100
  confidenceScore: number;
}

export interface CareerTrajectoryResult {
  score: number;
  growthRate: number;         // 成长速度 0-100
  stabilityScore: number;     // 稳定性 0-100
  promotionIndicators: number;// 晋升迹象
  confidenceScore: number;
}

// ============================================================================
// 最终输出
// ============================================================================

export interface ATSScoreResult {
  /** 总体 ATS 分数 0-100 */
  overallScore: number;

  /** 百分位排名 (在所有分析中的位置) */
  percentile: number | null;

  /** 评级 */
  rating: ATSRating;

  /** 各维度评分 */
  dimensions: DimensionScore[];

  /** 关键词分析 */
  keywordAnalysis: {
    matched: string[];
    partial: PartialMatch[];
    missing: MissingKeyword[];
    densityMap: SectionDistribution;
  };

  /** 技能差距 */
  skillGaps: {
    critical: SkillGap[];
    moderate: SkillGap[];
    strengths: string[];
  };

  /** AI 优化建议 (来自 LLM) */
  suggestions: Suggestion[];

  /** 评分置信度 */
  confidence: number;  // 0.0-1.0

  /** 元数据 */
  metadata: {
    engineVersion: string;
    modelUsed?: string;
    tokensUsed?: number;
    processingTimeMs: number;
    timestamp: string;
  };
}

export interface DimensionScore {
  name: string;
  label: string;
  score: number;         // 0-100
  weight: number;        // 在总分中的权重
  weightedScore: number; // score × weight
  ruleScore: number;
  llmScore: number | null;
  fusionAlpha: number;   // 规则引擎权重 (1-α = LLM 权重)
  confidence: number;
  breakdown: string[];   // 人类可读的得分/扣分项
}

export interface SkillGap {
  skill: string;
  importance: 'must_have' | 'preferred' | 'nice_to_have';
  currentLevel: string;    // 'none', 'beginner', 'intermediate', 'advanced'
  requiredLevel: string;
  suggestion: string;
}

export interface Suggestion {
  id: string;
  section: string;           // 目标简历部分
  type: 'rewrite' | 'add_keyword' | 'quantify' | 'reorder' | 'remove' | 'formatting';
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  originalText?: string;
  suggestedText?: string;
  explanation: string;
  impactEstimate: {
    scoreBoost: number;      // 预估分数提升
    dimension: string;       // 影响的维度
  };
}

export type ATSRating = 'excellent' | 'good' | 'fair' | 'poor' | 'fail';

// ============================================================================
// 引擎配置
// ============================================================================

export interface ATSEngineConfig {
  /** 各维度权重 */
  weights: {
    skillMatch: number;
    keywordCoverage: number;
    experienceRelevance: number;
    projectRelevance: number;
    educationMatch: number;
    formatQuality: number;
  };
  /** 各维度融合参数 (规则引擎权重) */
  fusionAlphas: {
    skillMatch: number;
    keywordCoverage: number;
    experienceRelevance: number;
    projectRelevance: number;
    educationMatch: number;
    formatQuality: number;
  };
  /** LLM 模型配置 */
  llm: {
    enabled: boolean;
    model: string;
    temperature: number;
    maxTokens: number;
    enableStreaming: boolean;
  };
  /** 技能匹配配置 */
  skillMatching: {
    fuzzyThreshold: number;      // 模糊匹配阈值 0-1
    synonymExpansion: boolean;   // 同义词扩展
    contextWeight: number;       // 上下文匹配权重
  };
  /** 评分阈值 */
  thresholds: {
    excellent: number;  // ≥ 85
    good: number;       // ≥ 70
    fair: number;       // ≥ 50
    poor: number;       // ≥ 30
    // < 30 = fail
  };
}
