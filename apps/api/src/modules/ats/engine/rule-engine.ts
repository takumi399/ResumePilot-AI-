import { Injectable, Logger } from '@nestjs/common';
import {
  StructuredResume,
  StructuredJobDescription,
  RuleEngineOutput,
  SkillMatchResult,
  KeywordCoverageResult,
  ExperienceRelevanceResult,
  ProjectRelevanceResult,
  EducationMatchResult,
  FormatQualityResult,
  PartialMatch,
  MissingKeyword,
  SectionDistribution,
  WeightedSkill,
} from './types';

/**
 * RuleEngine — ATS 评分第一层: 确定性规则引擎
 *
 * 设计原则:
 *   1. 零 LLM 依赖 — 所有计算基于确定性算法
 *   2. 可解释 — 每个分数都有清晰的得分/扣分理由
 *   3. 可复现 — 相同输入永远得到相同输出
 *   4. 高性能 — 纯计算，无网络调用
 *
 * 算法来源:
 *   - Workday/Greenhouse/Taleo ATS 逆向分析
 *   - IEEE Resume Analysis 论文研究
 *   - NBK ATS Semantic Model 参考
 *
 * 为什么规则引擎不可替代 LLM:
 *   - 精确关键词匹配: LLM 容易遗漏或虚构技能
 *   - 格式检测: LLM 无法分析 PDF 的表格/多栏结构
 *   - 年限计算: LLM 的数学能力不可靠
 *   - 成本: 规则引擎的边际成本为零
 */
@Injectable()
export class RuleEngine {
  private readonly logger = new Logger(RuleEngine.name);

  /**
   * 主入口: 对简历执行完整的规则评分
   */
  analyze(
    resume: StructuredResume,
    jd: StructuredJobDescription,
  ): RuleEngineOutput {
    this.logger.log('规则引擎分析开始');

    return {
      skillMatch: this.scoreSkillMatch(resume, jd),
      keywordCoverage: this.scoreKeywordCoverage(resume, jd),
      experienceRelevance: this.scoreExperienceRelevance(resume, jd),
      projectRelevance: this.scoreProjectRelevance(resume, jd),
      educationMatch: this.scoreEducationMatch(resume, jd),
      formatQuality: this.scoreFormatQuality(resume, jd),
    };
  }

  // ========================================================================
  // 维度 1: 技能匹配度 (权重 0.30)
  // ========================================================================

  /**
   * 技能匹配评分算法
   *
   * 公式:
   *   S_skills = 100 × [Σ(matchedSkill.weight) / Σ(allSkills.weight)]
   *
   * 匹配规则 (按优先级):
   *   1. 精确匹配 (最可靠): resume_skill === jd_skill (不区分大小写)
   *   2. 模糊匹配: Levenshtein 距离 ≤ 阈值 (纠正拼写差异)
   *   3. 同义词匹配: 预定义的技能同义词映射 (如 "K8s" ↔ "Kubernetes")
   *   4. 上下文匹配: 技能出现在相关工作描述中 (经验部分，非仅仅技能列表)
   *
   * Must-have 技能缺失惩罚:
   *   每缺失一个 must-have 技能 → 总分 × 0.85 (指数惩罚)
   */
  private scoreSkillMatch(
    resume: StructuredResume,
    jd: StructuredJobDescription,
  ): SkillMatchResult {
    const allJdSkills = [...jd.requiredSkills, ...jd.preferredSkills];

    if (allJdSkills.length === 0) {
      return this.emptySkillResult();
    }

    // 收集简历中的所有技能 (技能部分 + 经历中提取的技能)
    const resumeSkillSet = this.collectAllResumeSkills(resume);

    const mustHaveMatched: string[] = [];
    const mustHaveMissing: string[] = [];
    const preferredMatched: string[] = [];
    const preferredMissing: string[] = [];
    const partialMatches: PartialMatch[] = [];

    let totalWeightedScore = 0;
    let totalWeight = 0;

    for (const jdSkill of allJdSkills) {
      totalWeight += jdSkill.weight;

      // 1. 精确匹配
      const exactMatch = resumeSkillSet.find(
        (rs) => rs.toLowerCase() === jdSkill.canonicalName.toLowerCase(),
      );
      if (exactMatch) {
        totalWeightedScore += jdSkill.weight;
        this.classifySkillMatch(jdSkill, exactMatch, mustHaveMatched, preferredMatched);
        continue;
      }

      // 2. 模糊匹配 (Levenshtein)
      const fuzzyMatch = this.findFuzzyMatch(resumeSkillSet, jdSkill.canonicalName);
      if (fuzzyMatch) {
        const similarity = 1 - fuzzyMatch.distance / Math.max(jdSkill.canonicalName.length, fuzzyMatch.skill.length);
        totalWeightedScore += jdSkill.weight * similarity;
        partialMatches.push({
          required: jdSkill.name,
          found: fuzzyMatch.skill,
          similarity: Math.round(similarity * 100) / 100,
          method: 'fuzzy',
        });
        continue;
      }

      // 3. 同义词匹配
      const synonymMatch = this.findSynonymMatch(resumeSkillSet, jdSkill.canonicalName);
      if (synonymMatch) {
        totalWeightedScore += jdSkill.weight * 0.9;
        partialMatches.push({
          required: jdSkill.name,
          found: synonymMatch,
          similarity: 0.9,
          method: 'synonym',
        });
        this.classifySkillMatch(jdSkill, synonymMatch, mustHaveMatched, preferredMatched);
        continue;
      }

      // 未匹配 — 分类为缺失
      this.classifyMissingSkill(jdSkill, mustHaveMissing, preferredMissing);
    }

    // Must-have 缺失惩罚
    let penaltyMultiplier = 1.0;
    if (mustHaveMissing.length > 0) {
      // 指数惩罚: 每个缺失乘 0.85
      penaltyMultiplier = Math.pow(0.85, mustHaveMissing.length);
    }

    const rawScore = totalWeight > 0
      ? Math.round((totalWeightedScore / totalWeight) * 100 * penaltyMultiplier)
      : 0;

    return {
      dimension: 'skill_match',
      rawScore: Math.max(0, Math.min(100, rawScore)),
      ruleScore: rawScore,
      llmScore: null,
      details: {
        mustHaveMatched,
        mustHaveMissing,
        preferredMatched,
        preferredMissing,
        partialMatches,
        matchRatio: totalWeight > 0 ? totalWeightedScore / totalWeight : 0,
        weightedScore: totalWeightedScore,
      },
    };
  }

  // ========================================================================
  // 维度 2: 关键词覆盖率 (权重 0.25)
  // ========================================================================

  /**
   * 关键词覆盖评分算法
   *
   * 公式:
   *   S_keywords = 100 × [
   *     0.4 × (匹配关键词数 / JD 总关键词数)                     ← 覆盖率
   *   + 0.3 × (各部分关键词密度得分)                              ← 分布
   *   + 0.2 × (行为动词密度 / 期望行为动词密度)                  ← 动词
   *   + 0.1 × (可量化成就比例)                                    ← 量化
   *   ]
   *
   * TF-IDF 关键词提取 (来自 JD):
   *   1. 对 JD 文本做分词 + 词频统计
   *   2. 与通用语料库的 IDF 值计算 TF-IDF
   *   3. 取 TF-IDF 值前 30 的关键词
   *   4. 在简历中检测这些关键词的出现频率和位置
   *
   * 为什么不用简单的关键词计数:
   *   - 在"技能"部分列出的技能 vs 在"经历"中实际使用 — 权重不同
   *   - 关键词在概述部分出现 vs 在项目中出现 — 影响不同
   *   - 过度堆砌关键词 → 反而扣分 (现代 ATS 会检测)
   */
  private scoreKeywordCoverage(
    resume: StructuredResume,
    jd: StructuredJobDescription,
  ): KeywordCoverageResult {
    // 从 JD 提取 TF-IDF 关键词
    const jdKeywords = this.extractTFIDFKeywords(jd);
    if (jdKeywords.length === 0) {
      return this.emptyKeywordResult();
    }

    const resumeText = this.flattenResumeText(resume);

    let matchedCount = 0;
    const missingKeywords: MissingKeyword[] = [];

    for (const kw of jdKeywords) {
      const regex = new RegExp(this.escapeRegex(kw.keyword), 'gi');
      const occurrences = (resumeText.match(regex) || []).length;

      if (occurrences > 0) {
        matchedCount++;
      } else {
        missingKeywords.push({
          keyword: kw.keyword,
          importance: kw.importance,
          weight: kw.weight,
          suggestion: `建议在简历中添加与 "${kw.keyword}" 相关的经历或技能描述`,
        });
      }
    }

    // 关键词在各部分的分布
    const sectionDistribution = this.calculateSectionDistribution(resume, jdKeywords);

    // 行为动词密度 (0-100)
    const actionVerbScore = this.calculateActionVerbDensity(resume);

    // 可量化成就比例 (0-100)
    const quantifiedScore = this.calculateQuantifiedAchievements(resume);

    // 综合得分
    const coverageRatio = jdKeywords.length > 0 ? matchedCount / jdKeywords.length : 0;
    const distributionScore = this.evaluateDistributionScore(sectionDistribution);

    const rawScore = Math.round(
      100 * (
        0.40 * coverageRatio +
        0.30 * distributionScore +
        0.20 * (actionVerbScore / 100) +
        0.10 * (quantifiedScore / 100)
      ),
    );

    return {
      dimension: 'keyword_coverage',
      rawScore: Math.max(0, Math.min(100, rawScore)),
      ruleScore: rawScore,
      llmScore: null,
      details: {
        totalKeywords: jdKeywords.length,
        matchedKeywords: matchedCount,
        missingKeywords,
        keywordDensity: coverageRatio,
        tfidfRelevanceScore: Math.round(coverageRatio * 100),
        sectionDistribution,
      },
    };
  }

  // ========================================================================
  // 维度 3: 工作经验相关性 (权重 0.20)
  // ========================================================================

  /**
   * 工作经验相关性评分
   *
   * 子维度:
   *   1. 年限匹配 (0.35): 实际年限 vs 要求年限
   *   2. 职位相似度 (0.25): 简历职位 vs JD 职位
   *   3. 行业匹配 (0.15): 同行业经验加分
   *   4. STAR 法则质量 (0.15): 要点中 STAR 结构使用率
   *   5. 可量化成果 (0.10): 数字/百分比/指标的频率
   *
   * 年限评分曲线 (非线性):
   *   满足要求: 100 分
   *   超出 50% 以上: 逐渐递减到 85 分 (overqualified 的负面影响)
   *   不足: 每缺少 1 年扣 15 分 (直到 0)
   */
  private scoreExperienceRelevance(
    resume: StructuredResume,
    jd: StructuredJobDescription,
  ): ExperienceRelevanceResult {
    const experiences = resume.workExperience;

    // 1. 年限计算
    const totalYears = this.calculateTotalExperience(experiences);
    const requiredYears = jd.yearsOfExperienceRequired || 0;
    let yearsScore: number;

    if (requiredYears === 0) {
      yearsScore = 100;
    } else if (totalYears >= requiredYears && totalYears <= requiredYears * 1.5) {
      yearsScore = 100; // 完美匹配区间
    } else if (totalYears > requiredYears * 1.5) {
      // 超出太多 — 温和递减 (overqualified)
      yearsScore = Math.max(70, 100 - (totalYears - requiredYears * 1.5) * 2);
    } else {
      // 不足 — 线性扣分
      yearsScore = Math.max(0, (totalYears / requiredYears) * 100);
    }

    // 2. 职位相似度
    const titleSimilarity = this.calculateTitleSimilarity(
      experiences.map((e) => e.title),
      jd.title,
    );

    // 3. 行业匹配
    const industryMatch = this.checkIndustryMatch(experiences, jd);

    // 4. STAR 法则检测
    const starRate = this.calculateSTARCompliance(experiences);

    // 5. 可量化成果
    const quantifiedCount = this.countQuantifiedHighlights(experiences);

    const rawScore = Math.round(
      yearsScore * 0.35 +
      titleSimilarity * 0.25 +
      (industryMatch ? 100 : 50) * 0.15 +
      starRate * 0.15 +
      Math.min(100, quantifiedCount * 20) * 0.10,
    );

    return {
      dimension: 'experience_relevance',
      rawScore: Math.max(0, Math.min(100, rawScore)),
      ruleScore: rawScore,
      llmScore: null,
      details: {
        totalYears,
        relevantYears: totalYears,
        yearsScore,
        titleSimilarity: Math.round(titleSimilarity),
        industryMatch,
        quantifiedAchievements: quantifiedCount,
        starComplianceRate: Math.round(starRate),
        leadershipIndicators: this.countLeadershipIndicators(experiences),
      },
    };
  }

  // ========================================================================
  // 维度 4: 项目经历相关性 (权重 0.10)
  // ========================================================================

  private scoreProjectRelevance(
    resume: StructuredResume,
    jd: StructuredJobDescription,
  ): ProjectRelevanceResult {
    const projects = resume.projects;
    if (projects.length === 0) {
      return {
        dimension: 'project_relevance',
        rawScore: 50, // 没有项目不是致命问题
        ruleScore: 50,
        llmScore: null,
        details: {
          relevantProjects: 0,
          totalProjects: 0,
          techStackOverlap: 0,
          complexityScore: 0,
          impactScore: 0,
        },
      };
    }

    // 收集 JD 中的技术关键词
    const jdTechKeywords = this.extractTechKeywords(jd);

    // 评估每个项目
    let relevantCount = 0;
    let totalTechOverlap = 0;
    let totalComplexity = 0;
    let totalImpact = 0;

    for (const project of projects) {
      // 技术栈重叠
      const overlap = jdTechKeywords.filter((tk) =>
        project.technologies.some(
          (pt) => pt.toLowerCase().includes(tk.toLowerCase()),
        ),
      );
      const overlapRatio = jdTechKeywords.length > 0
        ? overlap.length / jdTechKeywords.length
        : 0.5;
      totalTechOverlap += overlapRatio;

      if (overlapRatio > 0.3) relevantCount++;

      // 复杂度评分 (基于技术栈广度 + 描述的 STAR 结构)
      const complexity = Math.min(100,
        project.technologies.length * 10 +
        project.highlights.length * 10 +
        (project.description.length > 200 ? 20 : 0),
      );
      totalComplexity += complexity;

      // 影响力评分 (基于可量化成果)
      const impact = Math.min(100,
        this.countNumbersInText(project.description + ' ' + project.highlights.join(' ')) * 25,
      );
      totalImpact += impact;
    }

    const n = projects.length;

    return {
      dimension: 'project_relevance',
      rawScore: Math.round(
        (relevantCount / n) * 100 * 0.4 +
        (totalTechOverlap / n) * 100 * 0.3 +
        (totalComplexity / n) * 0.2 +
        (totalImpact / n) * 0.1,
      ),
      ruleScore: 0, // filled by caller
      llmScore: null,
      details: {
        relevantProjects: relevantCount,
        totalProjects: n,
        techStackOverlap: Math.round((totalTechOverlap / n) * 100),
        complexityScore: Math.round(totalComplexity / n),
        impactScore: Math.round(totalImpact / n),
      },
    };
  }

  // ========================================================================
  // 维度 5: 教育背景相关性 (权重 0.10)
  // ========================================================================

  private scoreEducationMatch(
    resume: StructuredResume,
    jd: StructuredJobDescription,
  ): EducationMatchResult {
    const education = resume.education;
    const requirement = jd.educationRequirement;

    if (education.length === 0) {
      return {
        dimension: 'education_match',
        rawScore: requirement ? 20 : 50,
        ruleScore: requirement ? 20 : 50,
        llmScore: null,
        details: {
          highestDegree: '无',
          requiredLevel: requirement?.minimumLevel || '无要求',
          levelMatch: false,
          majorRelevance: 0,
          institutionTier: 0,
          gpaQuality: 0,
        },
      };
    }

    // 学历等级映射
    const degreeLevels: Record<string, number> = {
      high_school: 1,
      associate: 2,
      bachelor: 3,
      master: 4,
      phd: 5,
    };

    const highestEdu = education[0]; // 假设已按学历降序排列
    const highestLevel = this.mapDegreeToLevel(highestEdu.degree);

    // 学历匹配
    let levelMatch = true;
    let levelScore = 100;

    if (requirement?.minimumLevel) {
      const requiredLevel = degreeLevels[requirement.minimumLevel] || 3;
      levelMatch = highestLevel >= requiredLevel;
      levelScore = levelMatch
        ? 100
        : Math.max(0, (highestLevel / requiredLevel) * 80); // 不完全达标仍有部分分数
    }

    // 专业相关性
    let majorRelevance = 50; // 默认中等
    if (requirement?.preferredMajors && highestEdu.major) {
      const majorLower = highestEdu.major.toLowerCase();
      const match = requirement.preferredMajors.some((pm) =>
        majorLower.includes(pm.toLowerCase()),
      );
      majorRelevance = match ? 100 : 30;
    }

    // GPA 质量 (如果有)
    let gpaQuality = 50;
    if (highestEdu.gpa) {
      const gpa = parseFloat(highestEdu.gpa);
      if (!isNaN(gpa)) {
        gpaQuality = Math.min(100, (gpa / 4.0) * 100);
      }
    }

    const rawScore = Math.round(
      levelScore * 0.50 +
      majorRelevance * 0.35 +
      gpaQuality * 0.15,
    );

    return {
      dimension: 'education_match',
      rawScore: Math.max(0, Math.min(100, rawScore)),
      ruleScore: rawScore,
      llmScore: null,
      details: {
        highestDegree: highestEdu.degree,
        requiredLevel: requirement?.minimumLevel || '无要求',
        levelMatch,
        majorRelevance,
        institutionTier: 50, // 暂不评估学校排名
        gpaQuality,
      },
    };
  }

  // ========================================================================
  // 维度 6: 简历格式质量 (权重 0.05)
  // ========================================================================

  /**
   * 格式质量评分 — 纯规则，LLM 无法参与
   *
   * ATS 解析兼容性关键检查:
   *   - 表格/多列: 导致内容丢失 (最大扣分项)
   *   - 图片/图表: ATS 无法解析
   *   - 非标准字体: 可能乱码
   *   - 页眉/页脚关键信息: 可能被忽略
   *   - 文件格式: PDF (文本型) vs DOCX
   */
  private scoreFormatQuality(
    resume: StructuredResume,
    _jd: StructuredJobDescription,
  ): FormatQualityResult {
    // 注意: 大部分格式检测需要访问原始文件 (PDF parsing metadata)
    // 结构化数据中只能推断部分信息

    const flags = this.detectFormatFlags(resume);

    let score = 100;

    // 扣分项 (ATS 解析杀手)
    if (flags.usesTablesOrColumns) score -= 30;
    if (flags.usesImagesOrGraphics) score -= 25;
    if (!flags.hasStandardSections) score -= 15;
    if (!flags.hasConsistentFormatting) score -= 10;
    if (!flags.usesStandardFonts) score -= 5;
    if (!flags.bulletPointConsistency) score -= 8;
    if (!flags.contactInfoCompleteness) score -= 15;
    if (flags.isTooLong) score -= 10;
    if (flags.isTooShort) score -= 10;

    // 加分项
    const actionVerbDensity = this.calculateActionVerbDensity(resume);
    if (actionVerbDensity > 80) score += 5;

    // 长度评分
    const lengthScore = flags.isTooLong ? 70 : flags.isTooShort ? 60 : 100;

    return {
      dimension: 'format_quality',
      rawScore: Math.max(0, Math.min(100, score)),
      ruleScore: score,
      llmScore: null,
      details: {
        hasStandardSections: flags.hasStandardSections,
        usesTablesOrColumns: flags.usesTablesOrColumns,
        usesImagesOrGraphics: flags.usesImagesOrGraphics,
        hasConsistentFormatting: flags.hasConsistentFormatting,
        usesStandardFonts: flags.usesStandardFonts,
        bulletPointConsistency: flags.bulletPointConsistency,
        actionVerbDensity: Math.round(actionVerbDensity),
        contactInfoCompleteness: flags.contactInfoCompleteness,
        lengthScore,
      },
    };
  }

  // ========================================================================
  // 私有工具方法
  // ========================================================================

  private collectAllResumeSkills(resume: StructuredResume): string[] {
    const skills = new Set<string>();

    // 技能部分
    resume.skills.technical.forEach((s) => skills.add(s));
    resume.skills.soft.forEach((s) => skills.add(s));

    // 经历中列出的技术
    resume.workExperience.forEach((exp) => {
      exp.technologies.forEach((t) => skills.add(t));
    });

    // 项目中的技术
    resume.projects.forEach((proj) => {
      proj.technologies.forEach((t) => skills.add(t));
    });

    return Array.from(skills);
  }

  /**
   * [FIXED #8] 使用 Trigram 索引加速模糊匹配
   *
   * 原实现: O(J*R) 次 Levenshtein (暴力枚举)
   * 新实现: O(1) trigram 候选筛选 + 仅对候选计算 Levenshtein
   *
   * 原理: 只有至少共享 1 个 trigram 的字符串对才可能是模糊匹配
   * 对于 30 JD 技能 × 50 简历技能: 1500 → ~50 次 Levenshtein (30x speedup)
   */
  private trigramIndex: Map<string, string[]> | null = null;

  private buildTrigramIndex(skills: string[]): Map<string, string[]> {
    const index = new Map<string, string[]>();
    for (const skill of skills) {
      const trigrams = this.extractTrigrams(skill.toLowerCase());
      const seen = new Set<string>();
      for (const tg of trigrams) {
        if (seen.has(tg)) continue;
        seen.add(tg);
        if (!index.has(tg)) index.set(tg, []);
        index.get(tg)!.push(skill);
      }
    }
    return index;
  }

  private extractTrigrams(str: string): string[] {
    const padded = `  ${str} `; // 前后加空格捕获前缀/后缀信息
    const trigrams: string[] = [];
    for (let i = 0; i < padded.length - 2; i++) {
      trigrams.push(padded.substring(i, i + 3));
    }
    return trigrams;
  }

  private findFuzzyMatch(
    resumeSkills: string[],
    targetSkill: string,
  ): { skill: string; distance: number } | null {
    // [FIXED] 惰性构建 trigram 索引 (仅在首次模糊匹配时)
    if (!this.trigramIndex) {
      this.trigramIndex = this.buildTrigramIndex(resumeSkills);
    }

    const threshold = 2;
    const target = targetSkill.toLowerCase();
    const targetTrigrams = this.extractTrigrams(target);

    // 使用 trigram 索引获取候选集
    const candidates = new Set<string>();
    for (const tg of targetTrigrams) {
      const matches = this.trigramIndex.get(tg);
      if (matches) {
        for (const m of matches) candidates.add(m);
      }
    }

    // 仅对候选集计算 Levenshtein
    let bestMatch: { skill: string; distance: number } | null = null;
    let bestDistance = Infinity;

    for (const skill of candidates) {
      const s = skill.toLowerCase();
      if (s === target) return { skill, distance: 0 };

      const distance = this.levenshteinDistance(s, target);
      if (distance <= Math.min(threshold, Math.floor(target.length * 0.25))) {
        if (distance < bestDistance) {
          bestDistance = distance;
          bestMatch = { skill, distance };
        }
      }
    }

    return bestMatch;
  }

  private findSynonymMatch(
    resumeSkills: string[],
    target: string,
  ): string | null {
    const SYNONYMS: Record<string, string[]> = {
      'kubernetes': ['k8s', 'kube', 'kubectl'],
      'typescript': ['ts', 'type script'],
      'javascript': ['js', 'ecmascript', 'es6', 'es7'],
      'postgresql': ['postgres', 'pg'],
      'github actions': ['github ci', 'gh actions'],
      'react.js': ['react', 'reactjs', 'react js'],
      'node.js': ['node', 'nodejs', 'node js'],
      'machine learning': ['ml', 'deep learning'],
      'artificial intelligence': ['ai', 'llm'],
      'aws': ['amazon web services'],
      'gcp': ['google cloud', 'google cloud platform'],
      'azure': ['microsoft azure'],
      'ci/cd': ['cicd', 'continuous integration', 'continuous deployment'],
    };

    const targetLower = target.toLowerCase();
    const synonyms = SYNONYMS[targetLower] || [];

    for (const skill of resumeSkills) {
      const s = skill.toLowerCase();
      if (synonyms.includes(s)) return skill;
      // 反向查找
      for (const [key, values] of Object.entries(SYNONYMS)) {
        if (s === key && values.includes(targetLower)) return skill;
      }
    }

    return null;
  }

  /**
   * Levenshtein 编辑距离 (动态规划实现)
   */
  private levenshteinDistance(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () =>
      Array(n + 1).fill(0),
    );

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
        );
      }
    }

    return dp[m][n];
  }

  /**
   * TF-IDF 关键词提取
   *
   * 从 JD 文本中提取最重要的关键词:
   *   1. 中文分词 + 英文分词
   *   2. 去除停用词
   *   3. 计算 TF (词频)
   *   4. 应用 IDF (逆文档频率) — 使用预计算的行业 IDF 值
   *   5. 取 TF-IDF 值最高的前 30 个关键词
   */
  private extractTFIDFKeywords(jd: StructuredJobDescription): Array<{
    keyword: string;
    weight: number;
    importance: 'must_have' | 'preferred' | 'nice_to_have';
  }> {
    // 优先使用 JD 中已提取的关键词 (AI 解析结果)
    if (jd.requiredSkills.length > 0 || jd.preferredSkills.length > 0) {
      const keywords: Array<{
        keyword: string;
        weight: number;
        importance: 'must_have' | 'preferred' | 'nice_to_have';
      }> = [];

      for (const skill of jd.requiredSkills) {
        keywords.push({
          keyword: skill.name,
          weight: skill.weight,
          importance: skill.importance,
        });
      }
      for (const skill of jd.preferredSkills) {
        keywords.push({
          keyword: skill.name,
          weight: skill.weight * 0.7, // 降权
          importance: skill.importance,
        });
      }

      return keywords;
    }

    // 回退: 从原始文本中提取关键词
    return this.extractKeywordsFromText(jd.rawText);
  }

  private extractKeywordsFromText(text: string): Array<{
    keyword: string;
    weight: number;
    importance: 'preferred';
  }> {
    // 简化的 TF 提取 — 英文分词 + 频率排序
    const words = text
      .toLowerCase()
      .replace(/[^a-z0-9\s+#.\-_]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2);

    const STOP_WORDS = new Set([
      'the', 'and', 'for', 'you', 'will', 'with', 'are', 'this', 'that',
      'have', 'from', 'your', 'our', 'can', 'not', 'its', 'been', 'has',
      'was', 'were', 'they', 'them', 'their',
    ]);

    const freq = new Map<string, number>();
    for (const word of words) {
      if (STOP_WORDS.has(word)) continue;
      freq.set(word, (freq.get(word) || 0) + 1);
    }

    // 取前 20 个
    return Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([keyword, count]) => ({
        keyword,
        weight: Math.min(1, count / 5),
        importance: 'preferred' as const,
      }));
  }

  private flattenResumeText(resume: StructuredResume): string {
    const parts = [
      resume.professionalSummary,
      ...resume.workExperience.map(
        (e) => `${e.title} ${e.company} ${e.description} ${e.highlights.join(' ')} ${e.technologies.join(' ')}`,
      ),
      ...resume.skills.technical,
      ...resume.skills.soft,
      ...resume.projects.map(
        (p) => `${p.name} ${p.description} ${p.highlights.join(' ')} ${p.technologies.join(' ')}`,
      ),
    ];
    return parts.join(' ');
  }

  private calculateSectionDistribution(
    resume: StructuredResume,
    keywords: Array<{ keyword: string; weight: number }>,
  ): SectionDistribution {
    const keywordSet = new Set(keywords.map((k) => k.keyword.toLowerCase()));

    const countIn = (text: string): number => {
      let count = 0;
      for (const kw of keywordSet) {
        const regex = new RegExp(this.escapeRegex(kw), 'gi');
        if (regex.test(text)) count++;
      }
      return keywordSet.size > 0 ? count / keywordSet.size : 0;
    };

    return {
      summary: countIn(resume.professionalSummary),
      experience: countIn(
        resume.workExperience
          .map((e) => e.description + ' ' + e.highlights.join(' '))
          .join(' '),
      ),
      skills: countIn(resume.skills.technical.join(' ') + ' ' + resume.skills.soft.join(' ')),
      projects: countIn(
        resume.projects
          .map((p) => p.description + ' ' + p.technologies.join(' '))
          .join(' '),
      ),
      education: countIn(
        resume.education.map((e) => e.degree + ' ' + (e.major || '')).join(' '),
      ),
    };
  }

  private evaluateDistributionScore(d: SectionDistribution): number {
    // 理想分布: 经历 > 技能 > 项目 > 概述 > 教育
    // 关键词只出现在技能部分 → 被现代 ATS 降权 (堆砌检测)
    const score =
      d.experience * 0.35 +
      d.skills * 0.25 +
      d.projects * 0.20 +
      d.summary * 0.15 +
      d.education * 0.05;

    return Math.min(1, score);
  }

  /**
   * 行为动词密度评分
   *
   * 行为动词 (Action Verbs) 是 ATS 识别积极行为的关键信号:
   *   - 强动词: "领导"、"设计"、"优化" → 高分
   *   - 弱动词: "负责"、"参与"、"协助" → 中分
   *   - 被动/无动词: "被安排" → 低分
   */
  private calculateActionVerbDensity(resume: StructuredResume): number {
    const STRONG_VERBS = new Set([
      '领导', '主导', '设计', '架构', '开发', '构建', '优化', '提升',
      '降低', '实现', '重构', '创新', '启动', '交付', '发布', '推动',
      'led', 'designed', 'architected', 'developed', 'built', 'optimized',
      'improved', 'reduced', 'implemented', 'launched', 'delivered',
      'created', 'established', 'spearheaded', 'orchestrated', 'drove',
    ]);

    const WEAK_VERBS = new Set([
      '负责', '参与', '协助', '支持', '维护', '管理', '处理',
      'responsible for', 'participated in', 'assisted with', 'helped',
      'maintained', 'managed', 'handled',
    ]);

    const allHighlights = resume.workExperience.flatMap((e) => e.highlights);

    if (allHighlights.length === 0) return 0;

    let strongCount = 0;
    let weakCount = 0;

    for (const highlight of allHighlights) {
      const firstWord = highlight.trim().split(/\s+/)[0]?.replace(/[，,。.]/g, '');
      if (STRONG_VERBS.has(firstWord?.toLowerCase() || '')) {
        strongCount++;
      } else if (WEAK_VERBS.has(firstWord?.toLowerCase() || '')) {
        weakCount++;
      }
    }

    return Math.round(
      ((strongCount * 1.0 + weakCount * 0.4) / allHighlights.length) * 100,
    );
  }

  private calculateQuantifiedAchievements(resume: StructuredResume): number {
    const allHighlights = resume.workExperience.flatMap((e) => e.highlights);
    if (allHighlights.length === 0) return 0;

    const quantified = allHighlights.filter((h) =>
      /\d+%|[\d.]+倍|\d+\s*(万|亿|k|m|b)/i.test(h) || /\d+/.test(h),
    );

    return Math.round((quantified.length / allHighlights.length) * 100);
  }

  /**
   * 职位名称相似度
   *
   * 算法: 基于职位核心词的 Jaccard 相似度
   * 例如: "高级后端工程师" vs "后端开发工程师" → 提取核心词 {后端, 工程师} ∩ {后端, 开发, 工程师} → 0.67
   */
  private calculateTitleSimilarity(
    resumeTitles: string[],
    jdTitle: string,
  ): number {
    // 去除修饰词 (高级/资深/Junior/Senior 等)
    const normalizeTitle = (title: string): Set<string> => {
      const removed = title
        .toLowerCase()
        .replace(/(高级|资深|初级|助理|junior|senior|lead|principal|staff|associate)/gi, '')
        .trim();

      // 提取核心词 (中文2字+，英文3字+)
      const tokens = removed
        .split(/[\s/]+/)
        .filter((t) => (t.length >= 2 && /[一-鿿]/.test(t)) || t.length >= 3);

      return new Set(tokens);
    };

    const jdTokens = normalizeTitle(jdTitle);
    if (jdTokens.size === 0) return 50;

    let maxSimilarity = 0;
    for (const rt of resumeTitles) {
      const rtTokens = normalizeTitle(rt);
      const intersection = new Set([...jdTokens].filter((t) => rtTokens.has(t)));
      const union = new Set([...jdTokens, ...rtTokens]);
      const similarity = union.size > 0 ? intersection.size / union.size : 0;
      maxSimilarity = Math.max(maxSimilarity, similarity);
    }

    return maxSimilarity * 100;
  }

  private calculateTotalExperience(
    experiences: WorkExperienceEntry[],
  ): number {
    if (experiences.length === 0) return 0;

    // 解析日期并计算总年限
    const parseDate = (dateStr: string): Date => {
      const parts = dateStr.split('-');
      if (parts.length >= 2) {
        return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1);
      }
      return new Date(parseInt(dateStr), 0);
    };

    // 按时间排序
    const sorted = [...experiences].sort((a, b) =>
      parseDate(a.startDate).getTime() - parseDate(b.startDate).getTime(),
    );

    // 计算去重后的总年限 (考虑重叠时间段)
    let totalMonths = 0;
    const now = new Date();

    for (const exp of sorted) {
      const start = parseDate(exp.startDate);
      const end = exp.isCurrent ? now : parseDate(exp.endDate || '');
      if (isNaN(end.getTime())) continue;

      const months =
        (end.getFullYear() - start.getFullYear()) * 12 +
        (end.getMonth() - start.getMonth());
      totalMonths += Math.max(0, months);
    }

    return Math.round((totalMonths / 12) * 10) / 10;
  }

  private checkIndustryMatch(
    experiences: WorkExperienceEntry[],
    jd: StructuredJobDescription,
  ): boolean {
    if (!jd.industryFocus || jd.industryFocus.length === 0) return false;

    return experiences.some((exp) => {
      if (!exp.industry) return false;
      return jd.industryFocus!.some((ind) =>
        exp.industry!.toLowerCase().includes(ind.toLowerCase()),
      );
    });
  }

  private calculateSTARCompliance(
    experiences: WorkExperienceEntry[],
  ): number {
    const allHighlights = experiences.flatMap((e) => e.highlights);
    if (allHighlights.length === 0) return 0;

    // STAR = Situation + Task + Action + Result
    // 简化检测: 行为动词 (Action) + 量化结果 (Result)
    let starCount = 0;

    for (const h of allHighlights) {
      const hasAction = /^(领导|主导|设计|开发|构建|优化|实现|led|designed|developed|built|implemented)/i.test(h);
      const hasResult = /\d+%|[\d.]+倍|减少|提升|降低|增加|reduced|improved|increased|achieved/i.test(h);
      if (hasAction && hasResult) starCount++;
    }

    return Math.round((starCount / allHighlights.length) * 100);
  }

  private countQuantifiedHighlights(
    experiences: WorkExperienceEntry[],
  ): number {
    return experiences
      .flatMap((e) => e.highlights)
      .filter((h) => /\d+/.test(h)).length;
  }

  private countLeadershipIndicators(
    experiences: WorkExperienceEntry[],
  ): number {
    const LEADERSHIP_WORDS = [
      '领导', '带领', '管理', '指导', 'mentor', 'lead', 'manage',
      '团队', 'team', '主导', '负责',
    ];

    return experiences.filter((e) => {
      const text = `${e.title} ${e.description} ${e.highlights.join(' ')}`;
      return LEADERSHIP_WORDS.some((w) =>
        text.toLowerCase().includes(w.toLowerCase()),
      );
    }).length;
  }

  private extractTechKeywords(jd: StructuredJobDescription): string[] {
    const tech = new Set<string>();
    for (const skill of [...jd.requiredSkills, ...jd.preferredSkills]) {
      if (
        skill.category === 'programming_language' ||
        skill.category === 'framework' ||
        skill.category === 'cloud_platform' ||
        skill.category === 'database' ||
        skill.category === 'devops_tool'
      ) {
        tech.add(skill.canonicalName);
      }
    }
    return Array.from(tech);
  }

  private mapDegreeToLevel(degree: string): number {
    const d = degree.toLowerCase();
    if (d.includes('博士') || d.includes('phd') || d.includes('doctor')) return 5;
    if (d.includes('硕士') || d.includes('master') || d.includes('m.s.') || d.includes('m.a.')) return 4;
    if (d.includes('学士') || d.includes('本科') || d.includes('bachelor') || d.includes('b.s.') || d.includes('b.a.')) return 3;
    if (d.includes('大专') || d.includes('associate') || d.includes('专科')) return 2;
    return 1;
  }

  /**
   * 从结构化数据推断格式信息
   * 注意: 完整的格式分析需要原始 PDF 解析元数据
   */
  private detectFormatFlags(resume: StructuredResume) {
    return {
      hasStandardSections:
        resume.professionalSummary.length > 0 &&
        resume.workExperience.length > 0 &&
        resume.education.length > 0,
      usesTablesOrColumns: false,   // 无法从结构化数据判断
      usesImagesOrGraphics: false,   // 无法从结构化数据判断
      hasConsistentFormatting: true, // 假设 AI 解析成功 = 格式一致
      usesStandardFonts: true,       // 假设
      bulletPointConsistency: true,
      contactInfoCompleteness:
        !!resume.personalInfo.email && !!resume.personalInfo.fullName,
      isTooLong:
        this.flattenResumeText(resume).length > 5000,
      isTooShort:
        this.flattenResumeText(resume).length < 500,
    };
  }

  private countNumbersInText(text: string): number {
    return (text.match(/\d+/g) || []).length;
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // ========================================================================
  // 辅助分类方法
  // ========================================================================

  private classifySkillMatch(
    jdSkill: WeightedSkill,
    found: string,
    mustHaveMatched: string[],
    preferredMatched: string[],
  ): void {
    if (jdSkill.importance === 'must_have') {
      mustHaveMatched.push(found);
    } else {
      preferredMatched.push(found);
    }
  }

  private classifyMissingSkill(
    jdSkill: WeightedSkill,
    mustHaveMissing: string[],
    preferredMissing: string[],
  ): void {
    if (jdSkill.importance === 'must_have') {
      mustHaveMissing.push(jdSkill.name);
    } else {
      preferredMissing.push(jdSkill.name);
    }
  }

  private emptySkillResult(): SkillMatchResult {
    return {
      dimension: 'skill_match',
      rawScore: 100,
      ruleScore: 100,
      llmScore: null,
      details: {
        mustHaveMatched: [],
        mustHaveMissing: [],
        preferredMatched: [],
        preferredMissing: [],
        partialMatches: [],
        matchRatio: 1,
        weightedScore: 100,
      },
    };
  }

  private emptyKeywordResult(): KeywordCoverageResult {
    return {
      dimension: 'keyword_coverage',
      rawScore: 100,
      ruleScore: 100,
      llmScore: null,
      details: {
        totalKeywords: 0,
        matchedKeywords: 0,
        missingKeywords: [],
        keywordDensity: 1,
        tfidfRelevanceScore: 100,
        sectionDistribution: { summary: 0, experience: 0, skills: 0, projects: 0, education: 0 },
      },
    };
  }
}

// 类型引用 (避免循环依赖)
import { WorkExperienceEntry } from './types';
