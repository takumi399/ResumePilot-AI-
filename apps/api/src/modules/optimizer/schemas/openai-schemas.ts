// ============================================================================
// Resume Optimization Engine — OpenAI Structured Output Schemas
// ============================================================================
//
// 使用 OpenAI json_schema strict mode:
//   - 100% 保证输出符合 Schema
//   - 所有字段必须声明 required 或 optional
//   - additionalProperties: false 强制
//   - 支持嵌套 object 和 array
//
// Schema 设计原则:
//   1. 每个 Schema 对应一个优化维度 (单一职责)
//   2. 所有字段提供 description → 增强 LLM 理解
//   3. enum 约束 → 防止 LLM 产生不一致的分类值
//   4. 嵌套对象使用 $ref 风格的手动展开 (strict mode 不支持 $ref)
// ============================================================================

// ============================================================================
// Schema 1: 缺失技能优化
// ============================================================================

export const MISSING_SKILLS_SCHEMA = {
  type: 'object',
  description: '缺失技能补充建议列表',
  properties: {
    missing_skills: {
      type: 'array',
      description: '缺失技能列表，按重要性排序 (must_have 优先)',
      items: {
        type: 'object',
        properties: {
          skill: { type: 'string', description: '缺失的技能名称' },
          category: {
            type: 'string',
            enum: ['technical', 'soft', 'domain', 'tool', 'certification'],
            description: '技能分类',
          },
          importance: {
            type: 'string',
            enum: ['must_have', 'preferred', 'nice_to_have'],
            description: '在 JD 中的重要性',
          },
          current_proficiency: {
            type: 'string',
            enum: ['none', 'adjacent', 'transferable'],
            description: '候选人当前相关能力: none=完全缺失, adjacent=有相邻技能, transferable=有可转移经验',
          },
          target_section: {
            type: 'string',
            enum: ['skills', 'work_experience', 'projects', 'summary', 'education'],
            description: '建议插入的简历部分',
          },
          suggested_insertion: {
            type: 'string',
            description: '可直接使用的插入文本 (1-3句话)',
          },
          bridge_explanation: {
            type: ['string', 'null'],
            description: '如何从现有经验桥接到该技能 (仅 current_proficiency 非 none 时提供)',
          },
          learning_path: {
            type: ['string', 'null'],
            description: '快速获取该技能的学习路径建议 (仅 current_proficiency=none 时提供)',
          },
          estimated_impact: {
            type: 'object',
            properties: {
              dimension: { type: 'string', description: '受影响的评分维度' },
              score_boost: { type: 'number', description: '预估 ATS 分数提升 (0-20)' },
            },
            required: ['dimension', 'score_boost'],
            additionalProperties: false,
          },
        },
        required: [
          'skill', 'category', 'importance', 'current_proficiency',
          'target_section', 'suggested_insertion',
          'bridge_explanation', 'learning_path', 'estimated_impact',
        ],
        additionalProperties: false,
      },
    },
    summary: {
      type: 'object',
      description: '缺失技能统计摘要',
      properties: {
        total_missing: { type: 'number' },
        critical_missing: { type: 'number', description: 'must_have 中完全无法桥接的数量' },
        bridgeable: { type: 'number', description: '可以通过相邻技能桥接的数量' },
        overall_impact: { type: 'number', description: '补齐所有技能后的预估总分提升' },
      },
      required: ['total_missing', 'critical_missing', 'bridgeable', 'overall_impact'],
      additionalProperties: false,
    },
  },
  required: ['missing_skills', 'summary'],
  additionalProperties: false,
};

// ============================================================================
// Schema 2: 弱描述增强
// ============================================================================

export const WEAK_DESCRIPTIONS_SCHEMA = {
  type: 'object',
  description: '弱描述优化建议列表',
  properties: {
    weak_descriptions: {
      type: 'array',
      description: '识别到的弱描述及其优化版本',
      items: {
        type: 'object',
        properties: {
          target_id: { type: 'string', description: '目标的唯一ID，对应输入中的 [EXP-N] 或 [PRJ-N]' },
          section: {
            type: 'string',
            enum: ['professional_summary', 'work_experience', 'projects', 'education'],
          },
          sub_path: { type: 'string', description: '子路径，如 highlights[2], description' },
          original_text: { type: 'string', description: '原始文本' },
          weakness_type: {
            type: 'string',
            enum: [
              'vague_language', 'passive_voice', 'weak_action_verb',
              'missing_quantification', 'too_generic', 'irrelevant_to_jd',
              'redundant', 'outdated', 'overly_technical', 'not_technical_enough',
            ],
          },
          analysis: { type: 'string', description: '为什么这是弱描述 (1-2句)' },
          optimized_text: { type: 'string', description: '优化后的完整文本' },
          explanation: { type: 'string', description: '为什么这样改更好 (1-2句)' },
          techniques_used: {
            type: 'array',
            items: {
              type: 'string',
              enum: [
                'star_format', 'quantification', 'action_verb_upgrade',
                'keyword_injection', 'specificity_boost', 'impact_highlighting',
                'conciseness', 'contextualization', 'modernization',
              ],
            },
            description: '使用的优化技巧',
          },
          estimated_impact: {
            type: 'object',
            properties: {
              dimension: { type: 'string' },
              score_boost: { type: 'number' },
            },
            required: ['dimension', 'score_boost'],
            additionalProperties: false,
          },
        },
        required: [
          'target_id', 'section', 'sub_path', 'original_text',
          'weakness_type', 'analysis', 'optimized_text', 'explanation',
          'techniques_used', 'estimated_impact',
        ],
        additionalProperties: false,
      },
    },
    summary: {
      type: 'object',
      properties: {
        total_weak_points: { type: 'number' },
        by_type: {
          type: 'object',
          description: '按弱点类型统计 { "vague_language": 3, "weak_action_verb": 5 }',
          additionalProperties: { type: 'number' },
        },
        overall_impact: { type: 'number' },
      },
      required: ['total_weak_points', 'by_type', 'overall_impact'],
      additionalProperties: false,
    },
  },
  required: ['weak_descriptions', 'summary'],
  additionalProperties: false,
};

// ============================================================================
// Schema 3: STAR 改写
// ============================================================================

export const STAR_REWRITE_SCHEMA = {
  type: 'object',
  description: 'STAR法则改写建议列表',
  properties: {
    star_rewrites: {
      type: 'array',
      description: '对每个相关要点的 STAR 分析和改写变体',
      items: {
        type: 'object',
        properties: {
          target_id: { type: 'string' },
          section: { type: 'string', enum: ['work_experience', 'projects'] },
          sub_path: { type: 'string' },
          original_bullet: { type: 'string' },
          star_analysis: {
            type: 'object',
            properties: {
              situation: {
                type: 'object',
                properties: {
                  present: { type: 'boolean' },
                  score: { type: 'number', description: '0-25' },
                  content: { type: 'string', description: '原文中体现S的部分' },
                },
                required: ['present', 'score', 'content'],
                additionalProperties: false,
              },
              task: {
                type: 'object',
                properties: {
                  present: { type: 'boolean' },
                  score: { type: 'number' },
                  content: { type: 'string' },
                },
                required: ['present', 'score', 'content'],
                additionalProperties: false,
              },
              action: {
                type: 'object',
                properties: {
                  present: { type: 'boolean' },
                  score: { type: 'number' },
                  content: { type: 'string' },
                },
                required: ['present', 'score', 'content'],
                additionalProperties: false,
              },
              result: {
                type: 'object',
                properties: {
                  present: { type: 'boolean' },
                  score: { type: 'number' },
                  content: { type: 'string' },
                },
                required: ['present', 'score', 'content'],
                additionalProperties: false,
              },
            },
            required: ['situation', 'task', 'action', 'result'],
            additionalProperties: false,
          },
          variants: {
            type: 'array',
            description: '3 个不同侧重点的改写变体',
            minItems: 2,
            maxItems: 3,
            items: {
              type: 'object',
              properties: {
                focus: {
                  type: 'string',
                  enum: ['technical_depth', 'business_impact', 'leadership', 'efficiency', 'innovation'],
                },
                rewritten_bullet: { type: 'string' },
                star_mapping: {
                  type: 'string',
                  description: '简短说明该变体的 STAR 结构映射',
                },
                keyword_boost: {
                  type: 'array',
                  items: { type: 'string' },
                  description: '此变体新包含的关键词',
                },
                estimated_score_boost: { type: 'number', description: '0-10' },
              },
              required: ['focus', 'rewritten_bullet', 'star_mapping', 'keyword_boost', 'estimated_score_boost'],
              additionalProperties: false,
            },
          },
          recommended_index: { type: 'number', description: '推荐的变体索引 (0-based)' },
          recommendation_reason: { type: 'string' },
        },
        required: [
          'target_id', 'section', 'sub_path', 'original_bullet',
          'star_analysis', 'variants', 'recommended_index', 'recommendation_reason',
        ],
        additionalProperties: false,
      },
    },
  },
  required: ['star_rewrites'],
  additionalProperties: false,
};

// ============================================================================
// Schema 4: 项目描述优化
// ============================================================================

export const PROJECT_OPTIMIZATION_SCHEMA = {
  type: 'object',
  description: '项目描述优化建议',
  properties: {
    project_optimizations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          project_id: { type: 'string', description: '对应项目 ID' },
          project_name: { type: 'string' },
          optimized_name: {
            type: ['string', 'null'],
            description: '优化后的项目名称 (null=无需修改)',
          },
          optimized_description: { type: 'string' },
          optimized_highlights: {
            type: 'array',
            items: { type: 'string' },
          },
          optimizations: {
            type: 'array',
            description: '具体修改项',
            items: {
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  enum: ['name_enhancement', 'description_enhancement', 'highlight_rewrite', 'tech_highlight', 'impact_highlight'],
                },
                original: { type: 'string' },
                optimized: { type: 'string' },
                reason: { type: 'string' },
              },
              required: ['type', 'original', 'optimized', 'reason'],
              additionalProperties: false,
            },
          },
          injected_keywords: {
            type: 'array',
            items: { type: 'string' },
            description: '从JD注入的新关键词',
          },
        },
        required: [
          'project_id', 'project_name', 'optimized_name',
          'optimized_description', 'optimized_highlights',
          'optimizations', 'injected_keywords',
        ],
        additionalProperties: false,
      },
    },
  },
  required: ['project_optimizations'],
  additionalProperties: false,
};

// ============================================================================
// Schema 5: 工作经历优化
// ============================================================================

export const EXPERIENCE_OPTIMIZATION_SCHEMA = {
  type: 'object',
  description: '工作经历优化建议',
  properties: {
    experience_optimizations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          experience_id: { type: 'string', description: '对应经历 ID' },
          position: { type: 'string', description: '原职位+公司 (用于识别)' },
          optimized_title: {
            type: ['string', 'null'],
            description: '优化后的职位标题 (仅在不实质改变的前提下对齐JD)',
          },
          optimized_description: { type: 'string' },
          optimized_highlights: {
            type: 'array',
            items: { type: 'string' },
          },
          additional_highlights: {
            type: 'array',
            description: '基于JD/技能推断的新增要点',
            items: {
              type: 'object',
              properties: {
                based_on: {
                  type: 'string',
                  enum: ['jd_requirement', 'industry_standard', 'career_projection', 'skill_inference'],
                },
                highlight: { type: 'string' },
                confidence: { type: 'number', description: '0-1 置信度' },
                needs_user_verification: { type: 'boolean' },
              },
              required: ['based_on', 'highlight', 'confidence', 'needs_user_verification'],
              additionalProperties: false,
            },
          },
          removed_highlight_indices: {
            type: 'array',
            items: { type: 'number' },
            description: '建议删除的要点索引 (0-based)',
          },
          relevance_improvement: { type: 'number', description: '0-100 相关性提升预估' },
        },
        required: [
          'experience_id', 'position', 'optimized_title',
          'optimized_description', 'optimized_highlights',
          'additional_highlights', 'removed_highlight_indices',
          'relevance_improvement',
        ],
        additionalProperties: false,
      },
    },
  },
  required: ['experience_optimizations'],
  additionalProperties: false,
};

// ============================================================================
// Schema 6: 完整优化 (aggressive 模式)
// ============================================================================

export const FULL_OPTIMIZATION_SCHEMA = {
  type: 'object',
  description: '完整简历优化结果 (包含优化后的完整简历)',
  properties: {
    missing_skills: MISSING_SKILLS_SCHEMA.properties.missing_skills,
    weak_descriptions: WEAK_DESCRIPTIONS_SCHEMA.properties.weak_descriptions,
    star_rewrites: STAR_REWRITE_SCHEMA.properties.star_rewrites,
    project_optimizations: PROJECT_OPTIMIZATION_SCHEMA.properties.project_optimizations,
    experience_optimizations: EXPERIENCE_OPTIMIZATION_SCHEMA.properties.experience_optimizations,
    optimized_resume: {
      type: 'object',
      description: '应用所有优化建议后的完整简历',
      properties: {
        professional_summary: { type: 'string' },
        work_experience: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              title: { type: 'string' },
              company: { type: 'string' },
              start_date: { type: 'string' },
              end_date: { type: ['string', 'null'] },
              is_current: { type: 'boolean' },
              description: { type: 'string' },
              highlights: { type: 'array', items: { type: 'string' } },
              technologies: { type: 'array', items: { type: 'string' } },
            },
            required: ['id', 'title', 'company', 'start_date', 'end_date', 'is_current', 'description', 'highlights', 'technologies'],
            additionalProperties: false,
          },
        },
        skills: {
          type: 'object',
          properties: {
            technical: { type: 'array', items: { type: 'string' } },
            soft: { type: 'array', items: { type: 'string' } },
            languages: { type: 'array', items: { type: 'string' } },
            certifications: { type: 'array', items: { type: 'string' } },
          },
          required: ['technical', 'soft', 'languages', 'certifications'],
          additionalProperties: false,
        },
        projects: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              technologies: { type: 'array', items: { type: 'string' } },
              highlights: { type: 'array', items: { type: 'string' } },
            },
            required: ['name', 'description', 'technologies', 'highlights'],
            additionalProperties: false,
          },
        },
      },
      required: ['professional_summary', 'work_experience', 'skills', 'projects'],
      additionalProperties: false,
    },
    metadata_summary: {
      type: 'object',
      properties: {
        total_suggestions: { type: 'number' },
        estimated_overall_score_boost: { type: 'number' },
        top_3_actions: {
          type: 'array',
          items: { type: 'string' },
          description: '最能提升ATS得分的3个行动',
        },
      },
      required: ['total_suggestions', 'estimated_overall_score_boost', 'top_3_actions'],
      additionalProperties: false,
    },
  },
  required: [
    'missing_skills', 'weak_descriptions', 'star_rewrites',
    'project_optimizations', 'experience_optimizations',
    'optimized_resume', 'metadata_summary',
  ],
  additionalProperties: false,
};

// ============================================================================
// Schema 注册表
// ============================================================================

/** 5 个专项 Schema 的注册表 */
export const OPTIMIZATION_SCHEMAS = {
  missing_skills: {
    name: 'missing_skills_optimization',
    schema: MISSING_SKILLS_SCHEMA,
    description: '缺失技能补充建议',
  },
  weak_descriptions: {
    name: 'weak_descriptions_optimization',
    schema: WEAK_DESCRIPTIONS_SCHEMA,
    description: '弱描述内容增强',
  },
  star_rewrites: {
    name: 'star_rewrite_optimization',
    schema: STAR_REWRITE_SCHEMA,
    description: 'STAR法则改写建议',
  },
  project_optimizations: {
    name: 'project_optimization',
    schema: PROJECT_OPTIMIZATION_SCHEMA,
    description: '项目描述优化',
  },
  experience_optimizations: {
    name: 'experience_optimization',
    schema: EXPERIENCE_OPTIMIZATION_SCHEMA,
    description: '工作经历优化',
  },
  full: {
    name: 'full_resume_optimization',
    schema: FULL_OPTIMIZATION_SCHEMA,
    description: '完整简历优化 (aggressive)',
  },
} as const;
