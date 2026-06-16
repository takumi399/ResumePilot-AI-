-- ============================================================================
-- ResumePilot AI — Production-Grade PostgreSQL Schema
-- ============================================================================
-- Target: PostgreSQL 16+
-- Designed for: Multi-tenant SaaS, high concurrency, million-scale users
-- Author: ResumePilot AI Database Architecture Team
-- Version: 2.0.0 | Date: 2026-06-16
-- ============================================================================
--
-- 设计原则:
--   1. UUIDv7 主键 — 时间可排序，B-tree 索引友好，避免 v4 的碎片化
--   2. 审计字段 — 每张核心表包含 created_at / updated_at / deleted_at
--   3. 软删除 — 使用 deleted_at 而非物理删除，支持数据恢复
--   4. JSONB — 分析结果等半结构化数据使用 JSONB，兼顾灵活性与可查询性
--   5. 全文搜索 — 利用 PostgreSQL 原生 tsvector + GIN 索引
--   6. 向量搜索 — pgvector 扩展实现简历-JD 语义匹配
--   7. RLS — Row-Level Security 实现多租户数据隔离
--   8. 分区 — 预期超千万行的大表使用时间范围分区
--
-- 索引策略:
--   - B-tree: 高频查询字段
--   - GIN: JSONB 查询、全文搜索、数组查询
--   - BRIN: 仅追加的日志/审计表
--   - Partial: 仅活跃记录的常用查询
--   - Covering: 覆盖索引消除回表
--   - pgvector IVFFlat/HNSW: 向量嵌入索引
-- ============================================================================

-- ============================================================================
-- 0. 扩展
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";       -- UUID 生成
CREATE EXTENSION IF NOT EXISTS "pgcrypto";         -- 密码哈希、加密函数
CREATE EXTENSION IF NOT EXISTS "pg_trgm";          -- 三元组模糊匹配 (相似搜索)
CREATE EXTENSION IF NOT EXISTS "vector";           -- pgvector 向量存储与搜索
CREATE EXTENSION IF NOT EXISTS "btree_gin";        -- B-tree + GIN 复合索引
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements"; -- 查询性能分析 (监控)

-- ============================================================================
-- 0.1 UUIDv7 生成函数
-- ============================================================================
-- PostgreSQL 17 将原生支持 UUIDv7；在此之前的兼容实现
-- UUIDv7 格式: <48-bit Unix ms timestamp><4-bit version><62-bit random>
CREATE OR REPLACE FUNCTION uuid_generate_v7()
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
    v_time        bigint;
    v_time_hex    text;
    v_random_hex  text;
    v_milliseconds bigint;
BEGIN
    -- 获取 Unix 毫秒时间戳
    v_milliseconds := (extract(epoch FROM clock_timestamp()) * 1000)::bigint;

    -- 构造 48-bit 时间戳 + 4-bit version (0x7)
    v_time_hex := lpad(to_hex((v_milliseconds & x'0000FFFFFFFFFFFF'::bigint)), 12, '0');
    v_time_hex := overlay(v_time_hex placing '7' from 13 for 1);  -- version nibble

    -- 62-bit 随机数据 (variant bits 10xx)
    v_random_hex := lpad(to_hex((floor(random() * (2^62 - 1))::bigint) | x'8000000000000000'::bigint), 16, '0');

    RETURN (v_time_hex || v_random_hex)::uuid;
END;
$$;

-- ============================================================================
-- 0.2 审计触发器函数
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- ============================================================================
-- 1. ENUM 类型定义
-- ============================================================================

-- 用户角色
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('job_seeker', 'recruiter', 'admin', 'super_admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 用户账户状态
DO $$ BEGIN
    CREATE TYPE user_status AS ENUM ('active', 'inactive', 'suspended', 'pending_verification', 'deleted');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 订阅套餐等级
DO $$ BEGIN
    CREATE TYPE subscription_tier AS ENUM ('free', 'pro', 'business', 'enterprise');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 订阅状态
DO $$ BEGIN
    CREATE TYPE subscription_status AS ENUM ('active', 'past_due', 'canceled', 'trialing', 'incomplete', 'paused');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 文件类型
DO $$ BEGIN
    CREATE TYPE resume_file_type AS ENUM ('pdf', 'docx', 'txt', 'linkedin_import');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 简历解析状态
DO $$ BEGIN
    CREATE TYPE parse_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'needs_review');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 版本来源
DO $$ BEGIN
    CREATE TYPE version_source AS ENUM ('upload', 'manual_edit', 'ai_optimization', 'linkedin_import', 'template_apply');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- JD 来源
DO $$ BEGIN
    CREATE TYPE job_source_type AS ENUM ('manual', 'url_import', 'linkedin', 'api_import');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 分析作业状态
DO $$ BEGIN
    CREATE TYPE analysis_status AS ENUM ('queued', 'processing', 'completed', 'failed', 'canceled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AI 模型
DO $$ BEGIN
    CREATE TYPE ai_model AS ENUM ('gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'claude-opus-4-8', 'claude-sonnet-4-6');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 激进级别
DO $$ BEGIN
    CREATE TYPE optimization_level AS ENUM ('conservative', 'moderate', 'aggressive');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 事件类型 (审计日志)
DO $$ BEGIN
    CREATE TYPE audit_event_type AS ENUM (
        'user.created', 'user.login', 'user.password_changed', 'user.email_verified',
        'resume.uploaded', 'resume.parsed', 'resume.deleted',
        'version.created', 'version.restored',
        'job.created', 'job.deleted',
        'analysis.requested', 'analysis.completed', 'analysis.failed',
        'subscription.created', 'subscription.updated', 'subscription.canceled',
        'api_key.created', 'api_key.revoked',
        'admin.user_suspended', 'admin.user_reactivated'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================================
-- 2. 核心表: 用户与认证
-- ============================================================================

-- 2.1 用户表
CREATE TABLE users (
    -- 主键
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v7(),

    -- 认证信息
    email           text NOT NULL,
    password_hash   text NOT NULL,           -- Argon2id 哈希
    email_verified_at timestamptz,           -- NULL = 未验证

    -- 基本信息
    name            text,                     -- 显示名称
    avatar_url      text,                     -- 头像 S3 URL
    phone           text,                     -- 电话 (可选)
    locale          text DEFAULT 'zh-CN',     -- 语言区域

    -- 角色与状态
    role            user_role NOT NULL DEFAULT 'job_seeker',
    status          user_status NOT NULL DEFAULT 'pending_verification',

    -- 安全
    failed_login_attempts  integer NOT NULL DEFAULT 0,
    locked_until           timestamptz,       -- 账户锁定到期时间
    password_changed_at    timestamptz,       -- 最后修改密码时间
    mfa_enabled            boolean NOT NULL DEFAULT false,
    mfa_secret             text,              -- TOTP 密钥 (加密存储)

    -- 偏好设置 (JSONB)
    preferences     jsonb NOT NULL DEFAULT '{}'::jsonb,
    -- 示例: {
    --   "theme": "system",
    --   "default_export_format": "pdf",
    --   "default_optimization_level": "moderate",
    --   "notifications": { "email": true, "in_app": true }
    -- }

    -- 订阅
    stripe_customer_id   text,                -- Stripe 客户 ID

    -- 功能使用配额 (免费版限制，JSONB便于扩展)
    usage_quota     jsonb NOT NULL DEFAULT '{
        "max_resumes": 3,
        "max_analyses_per_month": 10,
        "max_versions_per_resume": 5
    }'::jsonb,

    -- 审计字段
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    deleted_at      timestamptz,              -- 软删除
    last_login_at   timestamptz,
    last_active_at  timestamptz,

    -- 约束
    CONSTRAINT chk_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT chk_password_hash_not_empty CHECK (length(password_hash) > 0)
);

-- 2.2 用户会话 / Refresh Token 表
CREATE TABLE user_sessions (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
    user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Token 管理
    refresh_token_hash  text NOT NULL,        -- SHA-256(token)
    access_token_jti    text,                 -- 当前 access token JWT ID (用于撤销)

    -- 设备与位置
    device_info     jsonb NOT NULL DEFAULT '{}'::jsonb,
    -- { "os": "Windows 11", "browser": "Chrome 126", "device_type": "desktop" }
    ip_address      inet,                     -- 登录 IP
    user_agent      text,                     -- User-Agent 头
    location        jsonb,                    -- GeoIP 结果 { "country": "CN", "city": "Beijing" }

    -- 生命周期
    expires_at      timestamptz NOT NULL,     -- 刷新令牌过期时间
    revoked_at      timestamptz,              -- NULL = 活跃
    revoked_reason  text,                     -- 'user_logout', 'password_change', 'theft_detected', 'admin_action'
    replaced_by     uuid,                     -- 自引用: 轮换链 (新令牌ID)
    rotation_count  integer NOT NULL DEFAULT 0, -- 此链的轮换次数

    -- 审计
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT fk_session_replaced_by FOREIGN KEY (replaced_by) REFERENCES user_sessions(id) ON DELETE SET NULL
);

-- 2.3 OAuth 关联表
CREATE TABLE user_oauth_accounts (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
    user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider        text NOT NULL,            -- 'google', 'github', 'linkedin'
    provider_user_id text NOT NULL,           -- 第三方用户 ID
    access_token    text,                     -- 加密存储
    refresh_token   text,                     -- 加密存储
    token_expires_at timestamptz,
    provider_data   jsonb NOT NULL DEFAULT '{}'::jsonb, -- 第三方返回的原始数据
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_oauth_provider_user UNIQUE (provider, provider_user_id)
);

-- 2.4 用户 API 密钥表 (供 API 访问)
CREATE TABLE user_api_keys (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
    user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            text NOT NULL,            -- 用户定义的密钥名称 "My CLI Tool"
    key_prefix      text NOT NULL,            -- 密钥前 7 字符 (用于 UI 显示: "rspk_Ab3...")
    key_hash        text NOT NULL,            -- SHA-256(完整密钥)
    scopes          text[] NOT NULL DEFAULT '{read}', -- {read, write, admin}
    last_used_at    timestamptz,
    expires_at      timestamptz,
    revoked_at      timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);


-- ============================================================================
-- 3. 核心表: 简历系统
-- ============================================================================

-- 3.1 技能分类表 (参考数据)
CREATE TABLE skill_categories (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
    name            text NOT NULL UNIQUE,      -- 'Programming Languages', 'Cloud Platforms'
    slug            text NOT NULL UNIQUE,      -- 'programming-languages'
    display_order   integer NOT NULL DEFAULT 0,
    icon            text,                      -- Lucide icon name
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- 3.2 技能表 (标准化技能名称)
CREATE TABLE skills (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
    category_id     uuid REFERENCES skill_categories(id) ON DELETE SET NULL,
    name            text NOT NULL,             -- 'Python', 'Kubernetes', 'Agile'
    canonical_name  text NOT NULL,             -- 标准化名称: 'python', 'kubernetes'
    aliases         text[] DEFAULT '{}',       -- 别名: {'py', 'python3'}
    embedding       vector(1536),              -- OpenAI text-embedding-3-small 嵌入
    popularity      integer NOT NULL DEFAULT 0, -- 使用热度 (去标准化)
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_skill_canonical_name UNIQUE (canonical_name)
);

-- 3.3 简历主表
CREATE TABLE resumes (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
    user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- 文件信息
    title           text NOT NULL,             -- 用户定义的标题 "我的后端工程师简历"
    original_file_name text NOT NULL,          -- "ZhangSan_Resume_2026.pdf"
    original_file_type  resume_file_type NOT NULL,
    file_size_bytes     bigint NOT NULL,       -- 文件大小
    storage_key     text NOT NULL,             -- S3/MinIO 对象键
    page_count      integer,                   -- 页数

    -- 解析结果
    parsed_text     text,                      -- 从 PDF/DOCX 提取的原始文本
    structured_data jsonb,                     -- AI 提取的结构化数据
    -- structured_data 的 JSON Schema:
    -- {
    --   "personal_info": {
    --     "full_name": "张三", "email": "...", "phone": "...",
    --     "location": "北京", "linkedin": "...", "portfolio": "...", "github": "..."
    --   },
    --   "professional_summary": "...",
    --   "work_experience": [
    --     {
    --       "id": "uuid", "title": "高级后端工程师", "company": "ABC科技",
    --       "start_date": "2023-03", "end_date": "2026-06", "is_current": true,
    --       "description": "...",
    --       "highlights": ["主导微服务架构迁移，降低延迟40%", ...],
    --       "technologies": ["Go", "Kubernetes", "PostgreSQL", "gRPC"]
    --     }
    --   ],
    --   "education": [
    --     { "degree": "计算机科学学士", "institution": "清华大学", "year": "2019", "gpa": "3.8" }
    --   ],
    --   "skills": { "technical": [...], "soft": [...], "languages": [...], "certifications": [...] },
    --   "projects": [...],
    --   "publications": [...],
    --   "awards": [...]
    -- }

    -- 解析状态
    parse_status    parse_status NOT NULL DEFAULT 'pending',
    parse_error     text,                     -- 解析失败时的错误信息
    parse_model     ai_model,                 -- 使用的 AI 模型
    parse_confidence numeric(3,2),            -- AI 解析置信度 0.00-1.00

    -- 语言
    language        text DEFAULT 'zh',        -- 'zh', 'en', 'bilingual'

    -- 状态标记
    is_primary      boolean NOT NULL DEFAULT false,  -- 是否为主要简历
    is_archived     boolean NOT NULL DEFAULT false,
    is_template     boolean NOT NULL DEFAULT false,  -- 是否保存为模板

    -- 全文搜索 (自动生成列)
    search_vector   tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(parsed_text, '')), 'B')
    ) STORED,

    -- 审计
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    deleted_at      timestamptz
);

-- 3.4 简历-技能关联表
CREATE TABLE resume_skills (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
    resume_id       uuid NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
    skill_id        uuid REFERENCES skills(id) ON DELETE CASCADE,
    skill_name      text NOT NULL,             -- 去标准化的技能名称 (冗余存储，加速查询)
    source_section  text,                      -- 技能出处: 'skills_section', 'experience', 'education'
    years_experience numeric(4,1),             -- 相关经验年数
    proficiency     text,                      -- 'beginner', 'intermediate', 'advanced', 'expert'
    is_verified     boolean NOT NULL DEFAULT false, -- 是否通过上下文验证
    created_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_resume_skill UNIQUE (resume_id, skill_id)
);

-- 3.5 简历版本表
CREATE TABLE resume_versions (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
    resume_id       uuid NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
    user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- 版本元数据
    version_number  integer NOT NULL,          -- 递增版本号 (1, 2, 3, ...)
    version_label   text,                      -- 用户定义的标签 "针对字节跳动优化版"
    source          version_source NOT NULL,
    change_summary  text,                      -- 用户/系统生成的变化描述

    -- 版本快照数据
    structured_data jsonb NOT NULL,            -- 此版本的完整结构化简历数据
    parsed_text     text,                      -- 对应版本的原始文本
    storage_key     text,                      -- 此版本导出的 PDF 文件 S3 键

    -- 差异数据
    parent_version_id uuid REFERENCES resume_versions(id) ON DELETE SET NULL,
    diff_from_parent  jsonb,                  -- 与父版本的差异
    -- diff 结构: { "added": [...], "removed": [...], "modified": [...] }

    -- 文件信息
    file_size_bytes bigint,
    file_type       resume_file_type,

    -- 审计
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_resume_version UNIQUE (resume_id, version_number)
);

-- ============================================================================
-- 4. 核心表: 岗位 JD 系统
-- ============================================================================

-- 4.1 岗位描述表
CREATE TABLE jobs (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
    user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- 基本信息
    title           text NOT NULL,             -- 职位名称
    company         text,                      -- 公司名称
    location        text,                      -- 工作地点
    job_type        text,                      -- 'full-time', 'part-time', 'contract', 'internship'
    experience_level text,                     -- 'entry', 'mid', 'senior', 'lead', 'executive'
    salary_range    text,                      -- 薪资范围 (文本，非结构化)
    department      text,                      -- 部门

    -- 原始数据
    raw_text        text NOT NULL,             -- 用户粘贴的原始 JD 文本
    source_url      text,                      -- JD 来源 URL
    source_type     job_source_type NOT NULL DEFAULT 'manual',

    -- AI 解析的结构化数据
    structured_data jsonb,
    -- structured_data 的 JSON Schema:
    -- {
    --   "required_skills": [
    --     { "name": "Python", "level": "expert", "years_required": 3, "importance": "must_have" }
    --   ],
    --   "preferred_skills": [ ... ],
    --   "responsibilities": [ "设计和实现微服务架构", ... ],
    --   "qualifications": [ "计算机科学或相关专业本科及以上学历", ... ],
    --   "keywords_weighted": { "python": 0.9, "microservices": 0.8, "postgresql": 0.7 },
    --   "industry": "FinTech",
    --   "company_culture": [ "敏捷", "数据驱动" ]
    -- }

    -- 状态
    status          text NOT NULL DEFAULT 'active',  -- 'active', 'archived', 'expired'
    posted_date     date,                      -- 职位发布日期
    expires_at      timestamptz,               -- JD 过期时间

    -- 全文搜索
    search_vector   tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(company, '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(raw_text, '')), 'C')
    ) STORED,

    -- 审计
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    deleted_at      timestamptz
);

-- 4.2 岗位-技能关联表
CREATE TABLE job_skills (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
    job_id          uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    skill_id        uuid REFERENCES skills(id) ON DELETE CASCADE,
    skill_name      text NOT NULL,             -- 去标准化技能名称
    importance      text NOT NULL DEFAULT 'preferred', -- 'must_have', 'preferred', 'nice_to_have'
    years_required  numeric(4,1),
    proficiency     text,                      -- 期望的水平
    weight          numeric(3,2) DEFAULT 0.5,  -- 关键词权重 0.00-1.00
    context         text,                      -- 此技能在 JD 中的上下文
    created_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_job_skill UNIQUE (job_id, skill_id)
);


-- ============================================================================
-- 5. 核心表: ATS 分析系统 (多版本分析结果)
-- ============================================================================

-- 5.1 分析结果表
CREATE TABLE analysis_results (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
    user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- 关联
    resume_id       uuid NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
    resume_version_id uuid REFERENCES resume_versions(id) ON DELETE SET NULL,
    job_id          uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,

    -- ==========================================
    -- ATS 综合评分 (0-100)
    -- ==========================================
    ats_score_total     numeric(5,2) NOT NULL,   -- 综合分数
    ats_score_percentile integer,                 -- 百分位排名 (在所有分析中)

    -- 评分分解 (JSONB 存储维度评分)
    score_breakdown     jsonb NOT NULL,
    -- score_breakdown 结构:
    -- {
    --   "keyword_match":       { "score": 85, "weight": 0.35, "weighted": 29.75 },
    --   "semantic_similarity": { "score": 72, "weight": 0.30, "weighted": 21.60 },
    --   "experience_relevance":{ "score": 68, "weight": 0.20, "weighted": 13.60 },
    --   "education_match":     { "score": 90, "weight": 0.10, "weighted": 9.00  },
    --   "ats_formatting":      { "score": 60, "weight": 0.05, "weighted": 3.00  }
    -- }

    -- 各部分评分
    section_scores      jsonb,
    -- {
    --   "professional_summary": { "score": 70, "issues": [...], "suggestions": [...] },
    --   "work_experience":      { "score": 65, "issues": [...], "suggestions": [...] },
    --   "skills":               { "score": 80, "issues": [...], "suggestions": [...] },
    --   "education":            { "score": 90, "issues": [...], "suggestions": [...] }
    -- }

    -- ==========================================
    -- 关键词分析
    -- ==========================================
    keyword_analysis    jsonb,
    -- {
    --   "matched":    [{ "keyword": "微服务", "type": "hard_skill", "weight": 0.9, "found_in": "experience" }],
    --   "partial":    [{ "keyword": "分布式系统", "matched_to": "分布式架构", "similarity": 0.85 }],
    --   "missing":    [{ "keyword": "gRPC", "type": "hard_skill", "weight": 0.7, "importance": "must_have" }],
    --   "overused":   [{ "keyword": "团队合作", "count": 8, "threshold": 3 }],
    --   "density_map": { "overall": 0.65, "target": 0.75 }
    -- }

    -- ==========================================
    -- 技能差距分析
    -- ==========================================
    skill_gap_analysis  jsonb,
    -- {
    --   "critical_gaps":     [{ "skill": "Kubernetes", "importance": "must_have", "suggestion": "..." }],
    --   "moderate_gaps":     [...],
    --   "strength_areas":    [...],
    --   "gap_severity_score": 65,
    --   "upskilling_suggestions": [...],
    --   "estimated_time_to_close": "3-6 months"
    -- }

    -- ==========================================
    -- AI 优化建议
    -- ==========================================
    ai_suggestions      jsonb,
    -- 顶级结构: 按简历各部分组织的建议数组
    -- [
    --   {
    --     "id": "uuid-v7",
    --     "section": "work_experience",
    --     "target_index": 0,            -- structured_data.work_experience[0]
    --     "type": "bullet_enhancement",  -- 'rewrite', 'add_bullet', 'remove_bullet',
    --                                     -- 'keyword_injection', 'reorder', 'formatting'
    --     "severity": "high",            -- 'critical', 'high', 'medium', 'low'
    --     "category": "量化成果缺失",     -- 中文分类
    --     "original_text": "负责后端API开发",
    --     "suggested_text": "设计并实现了20+ RESTful API端点，支撑日均100万+请求，P99延迟从200ms降至45ms",
    --     "explanation": "原描述过于笼统。建议使用STAR法则并添加量化指标，突出技术影响力和规模。",
    --     "keywords_added": ["RESTful API", "P99延迟", "高并发"],
    --     "impact_estimate": { "ats_score_boost": 3, "section_score_boost": 8 },
    --     "is_applied": false            -- 用户是否已应用此建议
    --   }
    -- ]

    -- ==========================================
    -- AI 优化后的简历 (完整结构化数据)
    -- ==========================================
    ai_optimized_resume jsonb,
    -- 结构与 resumes.structured_data 完全一致，但内容为优化版本
    -- 用户可以预览此优化结果，然后选择保存为新版本

    -- ==========================================
    -- 优化配置
    -- ==========================================
    optimization_level  optimization_level NOT NULL DEFAULT 'moderate',

    -- ==========================================
    -- 语义嵌入 (用于相似度搜索和聚类)
    -- ==========================================
    resume_embedding    vector(1536),           -- 简历的 embedding 向量
    job_embedding       vector(1536),           -- JD 的 embedding 向量
    semantic_similarity numeric(5,4),           -- 余弦相似度 (-1.0 到 1.0)

    -- ==========================================
    -- 作业元数据
    -- ==========================================
    status          analysis_status NOT NULL DEFAULT 'queued',
    error_message   text,
    model_used      ai_model,                   -- 使用的 AI 模型
    model_version   text,                       -- 模型版本号
    tokens_used     integer,                    -- 消耗的 Token 数
    cost_cents      integer,                    -- AI 调用成本 (美分)
    processing_time_ms integer,                 -- 处理耗时
    retry_count     integer NOT NULL DEFAULT 0,

    -- 审计
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    completed_at    timestamptz
);

-- 5.2 分析建议详情表 (独立存储每条建议, 便于追踪应用状态)
CREATE TABLE analysis_suggestions (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
    analysis_id     uuid NOT NULL REFERENCES analysis_results(id) ON DELETE CASCADE,
    user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- 建议内容
    section         text NOT NULL,              -- 'professional_summary', 'work_experience[0]', etc.
    suggestion_type text NOT NULL,              -- 'rewrite', 'add_bullet', 'remove_bullet', 'keyword_injection', 'reorder', 'formatting'
    severity        text NOT NULL DEFAULT 'medium', -- 'critical', 'high', 'medium', 'low'
    category        text,                      -- 中文分类

    -- 内容
    original_text   text,                      -- 原始文本
    suggested_text  text,                      -- 建议替换文本
    explanation     text,                      -- AI 解释为什么这样修改
    keywords_added  text[],                    -- 新增的关键词

    -- 预估影响
    impact_estimate jsonb,                     -- { "ats_score_boost": 3, "section_score_boost": 8 }

    -- 用户反馈
    is_applied      boolean NOT NULL DEFAULT false, -- 用户是否已接受
    is_dismissed    boolean NOT NULL DEFAULT false, -- 用户是否拒绝
    applied_at      timestamptz,
    user_rating     smallint,                  -- 用户评分 1-5 (建议质量)
    user_note       text,                      -- 用户备注

    -- 审计
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT chk_user_rating_range CHECK (user_rating IS NULL OR (user_rating >= 1 AND user_rating <= 5))
);


-- ============================================================================
-- 6. 核心表: 订阅与计费
-- ============================================================================

-- 6.1 订阅套餐
CREATE TABLE subscription_plans (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
    stripe_price_id text NOT NULL UNIQUE,       -- Stripe Price ID
    tier            subscription_tier NOT NULL,
    name            text NOT NULL,              -- '免费版', '专业版', '商业版', '企业版'
    description     text,
    price_monthly_cents  integer NOT NULL,      -- 月付价格 (美分)
    price_yearly_cents   integer,               -- 年付价格 (美分)

    -- 功能限制 (JSONB)
    features        jsonb NOT NULL,
    -- {
    --   "max_resumes": 3,
    --   "max_analyses_per_month": 50,
    --   "max_versions_per_resume": 10,
    --   "ai_models": ["gpt-4o-mini"],
    --   "export_formats": ["pdf"],
    --   "templates": ["basic1", "basic2"],
    --   "priority_support": false,
    --   "custom_branding": false,
    --   "api_access": false,
    --   "team_accounts": 1
    -- }

    is_active       boolean NOT NULL DEFAULT true,
    sort_order      integer NOT NULL DEFAULT 0, -- UI 显示顺序
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- 6.2 用户订阅
CREATE TABLE subscriptions (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
    user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id         uuid NOT NULL REFERENCES subscription_plans(id),
    stripe_subscription_id text UNIQUE,         -- Stripe Subscription ID

    status          subscription_status NOT NULL DEFAULT 'active',
    current_period_start timestamptz NOT NULL,
    current_period_end   timestamptz NOT NULL,
    canceled_at     timestamptz,
    trial_ends_at   timestamptz,

    -- 用量追踪
    analyses_used_this_period integer NOT NULL DEFAULT 0,
    resumes_created          integer NOT NULL DEFAULT 0,
    storage_bytes_used       bigint NOT NULL DEFAULT 0,

    -- 审计
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);


-- ============================================================================
-- 7. 支持表: 使用日志、审计日志、通知
-- ============================================================================

-- 7.1 使用日志 (用量追踪与计费审计)
CREATE TABLE usage_logs (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
    user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subscription_id uuid REFERENCES subscriptions(id) ON DELETE SET NULL,

    event_type      text NOT NULL,             -- 'analysis_requested', 'resume_uploaded', 'export_generated'
    resource_type   text,                      -- 'resume', 'analysis', 'export'
    resource_id     uuid,                      -- 关联资源 ID
    quantity        integer NOT NULL DEFAULT 1,
    metadata        jsonb,                     -- 附加元数据

    -- 成本追踪
    ai_model_used   ai_model,
    tokens_consumed integer,
    cost_cents      integer,

    -- 时间戳
    created_at      timestamptz NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);

-- 为使用日志创建默认分区 (按月分区)
CREATE TABLE usage_logs_2026_06 PARTITION OF usage_logs
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE usage_logs_2026_07 PARTITION OF usage_logs
    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE usage_logs_2026_08 PARTITION OF usage_logs
    FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE usage_logs_default PARTITION OF usage_logs DEFAULT;

-- 7.2 审计日志 (安全与合规)
CREATE TABLE audit_logs (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
    user_id         uuid,                       -- 可为空 (系统事件)
    event_type      audit_event_type NOT NULL,
    severity        text NOT NULL DEFAULT 'info', -- 'debug', 'info', 'warning', 'error', 'critical'

    -- 资源
    resource_type   text,                      -- 'user', 'resume', 'analysis', 'subscription'
    resource_id     uuid,

    -- 变更
    action          text NOT NULL,              -- 'create', 'update', 'delete', 'login', 'export'
    changes         jsonb,                      -- { "field": { "old": "val1", "new": "val2" } }
    ip_address      inet,
    user_agent      text,

    -- 请求上下文
    request_id      text,                      -- X-Request-ID
    session_id      uuid REFERENCES user_sessions(id) ON DELETE SET NULL,

    -- 时间戳
    created_at      timestamptz NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);

-- 审计日志默认分区
CREATE TABLE audit_logs_2026_06 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE audit_logs_2026_07 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE audit_logs_default PARTITION OF audit_logs DEFAULT;

-- 7.3 通知表
CREATE TABLE notifications (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
    user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type            text NOT NULL,              -- 'analysis_complete', 'subscription_expiring', 'system_announcement'
    title           text NOT NULL,
    body            text,
    data            jsonb,                      -- 用于前端路由的导航数据
    is_read         boolean NOT NULL DEFAULT false,
    read_at         timestamptz,
    action_url      text,                      -- 点击通知后的跳转链接
    created_at      timestamptz NOT NULL DEFAULT now()
);


-- ============================================================================
-- 8. 索引设计
-- ============================================================================

-- ============================================================================
-- 8.1 users 表索引
-- ============================================================================
-- 邮箱登录查询 (最频繁)
CREATE UNIQUE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;
-- 角色筛选
CREATE INDEX idx_users_role ON users(role) WHERE deleted_at IS NULL;
-- 状态筛选 (管理员查询)
CREATE INDEX idx_users_status ON users(status) WHERE deleted_at IS NULL;
-- Stripe 客户查找
CREATE INDEX idx_users_stripe_customer ON users(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
-- 全文搜索用户名
CREATE INDEX idx_users_name_trgm ON users USING gin (name gin_trgm_ops);
-- 活跃用户排序
CREATE INDEX idx_users_created_active ON users(created_at DESC) WHERE deleted_at IS NULL;

-- ============================================================================
-- 8.2 user_sessions 表索引
-- ============================================================================
-- Refresh Token 查找 (最高频查询)
CREATE UNIQUE INDEX idx_sessions_token_hash ON user_sessions(refresh_token_hash) WHERE revoked_at IS NULL;
-- 用户活跃会话列表
CREATE INDEX idx_sessions_user_active ON user_sessions(user_id, created_at DESC) WHERE revoked_at IS NULL;
-- 过期会话清理
CREATE INDEX idx_sessions_expired ON user_sessions(expires_at) WHERE revoked_at IS NULL;
-- 令牌轮换链查找
CREATE INDEX idx_sessions_replaced_by ON user_sessions(replaced_by) WHERE replaced_by IS NOT NULL;

-- ============================================================================
-- 8.3 resumes 表索引
-- ============================================================================
-- 用户简历列表 (最频繁)
CREATE INDEX idx_resumes_user ON resumes(user_id, created_at DESC) WHERE deleted_at IS NULL;
-- 解析状态过滤
CREATE INDEX idx_resumes_parse_status ON resumes(parse_status, created_at) WHERE deleted_at IS NULL;
-- 主简历快速查找
CREATE INDEX idx_resumes_primary ON resumes(user_id) WHERE is_primary = true AND deleted_at IS NULL;
-- 全文搜索 GIN 索引
CREATE INDEX idx_resumes_search ON resumes USING gin(search_vector);
-- 按语言筛选
CREATE INDEX idx_resumes_language ON resumes(language) WHERE deleted_at IS NULL;
-- 软删除列表 (管理后台)
CREATE INDEX idx_resumes_deleted ON resumes(deleted_at) WHERE deleted_at IS NOT NULL;

-- ============================================================================
-- 8.4 resume_versions 表索引
-- ============================================================================
-- 简历版本列表 (按版本号排序)
CREATE INDEX idx_versions_resume ON resume_versions(resume_id, version_number DESC);
-- 按用户查询所有版本
CREATE INDEX idx_versions_user ON resume_versions(user_id, created_at DESC);
-- 版本来源分析
CREATE INDEX idx_versions_source ON resume_versions(source) WHERE source = 'ai_optimization';

-- ============================================================================
-- 8.5 resume_skills 表索引
-- ============================================================================
-- 简历技能查找
CREATE INDEX idx_resume_skills_resume ON resume_skills(resume_id);
-- 技能-简历反向查找 (统计技能热门度)
CREATE INDEX idx_resume_skills_skill ON resume_skills(skill_id) WHERE skill_id IS NOT NULL;
-- 技能名称搜索
CREATE INDEX idx_resume_skills_name ON resume_skills USING gin (skill_name gin_trgm_ops);

-- ============================================================================
-- 8.6 jobs 表索引
-- ============================================================================
-- 用户 JD 列表
CREATE INDEX idx_jobs_user ON jobs(user_id, created_at DESC) WHERE deleted_at IS NULL;
-- 公司筛选
CREATE INDEX idx_jobs_company ON jobs(company) WHERE company IS NOT NULL AND deleted_at IS NULL;
-- 状态筛选
CREATE INDEX idx_jobs_status ON jobs(status, created_at DESC) WHERE deleted_at IS NULL;
-- 全文搜索
CREATE INDEX idx_jobs_search ON jobs USING gin(search_vector);
-- 职位发布日期 (BRIN 适用于自然有序数据)
CREATE INDEX idx_jobs_posted_date ON jobs USING brin(posted_date);
-- 三元组模糊搜索 (职位标题)
CREATE INDEX idx_jobs_title_trgm ON jobs USING gin (title gin_trgm_ops);

-- ============================================================================
-- 8.7 job_skills 表索引
-- ============================================================================
CREATE INDEX idx_job_skills_job ON job_skills(job_id);
CREATE INDEX idx_job_skills_skill ON job_skills(skill_id) WHERE skill_id IS NOT NULL;
CREATE INDEX idx_job_skills_importance ON job_skills(job_id, importance);

-- ============================================================================
-- 8.8 analysis_results 表索引
-- ============================================================================
-- 用户分析历史 (Dashboard)
CREATE INDEX idx_analysis_user ON analysis_results(user_id, created_at DESC);
-- 简历维度的分析结果
CREATE INDEX idx_analysis_resume ON analysis_results(resume_id, created_at DESC);
-- 岗位维度的分析结果
CREATE INDEX idx_analysis_job ON analysis_results(job_id, created_at DESC);
-- 状态过滤 (Worker 拉取待处理作业)
CREATE INDEX idx_analysis_status ON analysis_results(status, created_at) WHERE status IN ('queued', 'processing');
-- ATS 评分排序 (排行榜/基准)
CREATE INDEX idx_analysis_score ON analysis_results(ats_score_total DESC) WHERE status = 'completed';
-- 模型-成本分析
CREATE INDEX idx_analysis_model ON analysis_results(model_used, created_at) WHERE status = 'completed';
-- 语义相似度排序 (最佳匹配)
CREATE INDEX idx_analysis_similarity ON analysis_results(semantic_similarity DESC) WHERE status = 'completed';

-- pgvector HNSW 索引 (高维向量近似最近邻搜索)
-- 先插入数据后再创建，否则影响写入性能
-- CREATE INDEX idx_analysis_resume_embedding ON analysis_results
--     USING hnsw (resume_embedding vector_cosine_ops) WITH (m = 16, ef_construction = 200);
-- CREATE INDEX idx_analysis_job_embedding ON analysis_results
--     USING hnsw (job_embedding vector_cosine_ops) WITH (m = 16, ef_construction = 200);

-- ============================================================================
-- 8.9 analysis_suggestions 表索引
-- ============================================================================
CREATE INDEX idx_suggestions_analysis ON analysis_suggestions(analysis_id);
CREATE INDEX idx_suggestions_user_unapplied ON analysis_suggestions(user_id, is_applied, is_dismissed)
    WHERE is_applied = false AND is_dismissed = false;
CREATE INDEX idx_suggestions_section ON analysis_suggestions(analysis_id, section);

-- ============================================================================
-- 8.10 subscriptions 表索引
-- ============================================================================
CREATE UNIQUE INDEX idx_subscriptions_user_active ON subscriptions(user_id) WHERE status = 'active';
CREATE INDEX idx_subscriptions_stripe ON subscriptions(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;
CREATE INDEX idx_subscriptions_period_end ON subscriptions(current_period_end) WHERE status = 'active';

-- ============================================================================
-- 8.11 usage_logs 表索引 (BRIN 适用于分区表)
-- ============================================================================
CREATE INDEX idx_usage_user_time ON usage_logs USING brin(user_id, created_at);
CREATE INDEX idx_usage_event_type ON usage_logs(event_type, created_at);
CREATE INDEX idx_usage_subscription ON usage_logs(subscription_id) WHERE subscription_id IS NOT NULL;

-- ============================================================================
-- 8.12 audit_logs 表索引
-- ============================================================================
CREATE INDEX idx_audit_user_time ON audit_logs USING brin(user_id, created_at);
CREATE INDEX idx_audit_event_type ON audit_logs(event_type, created_at);
CREATE INDEX idx_audit_resource ON audit_logs(resource_type, resource_id);

-- ============================================================================
-- 8.13 notifications 表索引
-- ============================================================================
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, created_at DESC) WHERE is_read = false;
CREATE INDEX idx_notifications_user_all ON notifications(user_id, created_at DESC);

-- ============================================================================
-- 8.14 skills 表索引
-- ============================================================================
CREATE INDEX idx_skills_category ON skills(category_id);
CREATE INDEX idx_skills_canonical ON skills(canonical_name);
CREATE INDEX idx_skills_popularity ON skills(popularity DESC);
CREATE INDEX idx_skills_name_trgm ON skills USING gin (name gin_trgm_ops);
CREATE INDEX idx_skills_aliases ON skills USING gin (aliases);

-- ============================================================================
-- 8.15 user_oauth_accounts 表索引
-- ============================================================================
CREATE INDEX idx_oauth_user ON user_oauth_accounts(user_id);

-- ============================================================================
-- 8.16 user_api_keys 表索引
-- ============================================================================
CREATE INDEX idx_api_keys_user ON user_api_keys(user_id) WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX idx_api_keys_hash ON user_api_keys(key_hash) WHERE revoked_at IS NULL;


-- ============================================================================
-- 9. 触发器: 自动更新 updated_at
-- ============================================================================

-- 为所有包含 updated_at 的核心表创建触发器
DO $$
DECLARE
    tbl text;
BEGIN
    FOR tbl IN
        SELECT table_name
        FROM information_schema.columns
        WHERE column_name = 'updated_at'
          AND table_schema = 'public'
          AND table_name NOT LIKE '%_logs'       -- 日志表不需要 updated_at
          AND table_name NOT IN ('usage_logs', 'audit_logs') -- 仅追加表
    LOOP
        EXECUTE format('
            CREATE TRIGGER trg_%I_updated_at
                BEFORE UPDATE ON %I
                FOR EACH ROW
                EXECUTE FUNCTION update_updated_at_column();
        ', tbl, tbl);
    END LOOP;
END $$;


-- ============================================================================
-- 10. 物化视图: Dashboard 聚合
-- ============================================================================

-- 10.1 用户 Dashboard 统计
CREATE MATERIALIZED VIEW mv_user_stats AS
SELECT
    u.id AS user_id,
    COUNT(DISTINCT r.id) FILTER (WHERE r.deleted_at IS NULL) AS total_resumes,
    COUNT(DISTINCT j.id) FILTER (WHERE j.deleted_at IS NULL) AS total_jobs,
    COUNT(DISTINCT ar.id) FILTER (WHERE ar.status = 'completed') AS total_analyses,
    COALESCE(AVG(ar.ats_score_total) FILTER (WHERE ar.status = 'completed'), 0) AS avg_ats_score,
    MAX(ar.ats_score_total) FILTER (WHERE ar.status = 'completed') AS best_ats_score,
    COUNT(DISTINCT ar.id) FILTER (
        WHERE ar.status = 'completed' AND ar.created_at >= date_trunc('month', now())
    ) AS analyses_this_month,
    COALESCE(SUM(ar.cost_cents) FILTER (WHERE ar.status = 'completed'), 0) AS total_cost_cents,
    MIN(u.created_at) AS member_since
FROM users u
LEFT JOIN resumes r ON u.id = r.user_id
LEFT JOIN jobs j ON u.id = j.user_id
LEFT JOIN analysis_results ar ON u.id = ar.user_id
WHERE u.deleted_at IS NULL
GROUP BY u.id;

CREATE UNIQUE INDEX idx_mv_user_stats_user ON mv_user_stats(user_id);

-- 10.2 平台全局统计 (管理员)
CREATE MATERIALIZED VIEW mv_platform_stats AS
SELECT
    date_trunc('day', created_at) AS day,
    COUNT(*) AS analyses_count,
    COUNT(DISTINCT user_id) AS active_users,
    AVG(ats_score_total) AS avg_score,
    SUM(tokens_used) AS total_tokens,
    SUM(cost_cents) AS total_cost_cents,
    COUNT(*) FILTER (WHERE status = 'failed') AS failed_count
FROM analysis_results
WHERE status = 'completed' OR status = 'failed'
GROUP BY date_trunc('day', created_at)
ORDER BY day DESC;

CREATE UNIQUE INDEX idx_mv_platform_stats_day ON mv_platform_stats(day);


-- ============================================================================
-- 11. 刷新物化视图的函数
-- ============================================================================
CREATE OR REPLACE FUNCTION refresh_materialized_views()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_user_stats;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_platform_stats;
END;
$$;


-- ============================================================================
-- 12. 数据保留与清理策略
-- ============================================================================

-- 12.1 清理过期会话 (每天执行)
-- DELETE FROM user_sessions
-- WHERE expires_at < now() - INTERVAL '30 days'
--   AND revoked_at IS NOT NULL;

-- 12.2 清理已删除用户数据 (GDPR 合规, 90天后永久删除)
-- DELETE FROM users WHERE deleted_at < now() - INTERVAL '90 days';

-- 12.3 清理旧分区 (保留12个月)
-- DROP TABLE IF EXISTS usage_logs_2025_06;
-- DROP TABLE IF EXISTS audit_logs_2025_06;

-- 12.4 清理旧通知 (保留90天)
-- DELETE FROM notifications WHERE created_at < now() - INTERVAL '90 days';


-- ============================================================================
-- 13. 默认数据: 技能分类
-- ============================================================================
INSERT INTO skill_categories (name, slug, display_order, icon) VALUES
    ('编程语言', 'programming-languages', 1, 'code-2'),
    ('框架与库', 'frameworks-libraries', 2, 'layers'),
    ('数据库', 'databases', 3, 'database'),
    ('云平台', 'cloud-platforms', 4, 'cloud'),
    ('DevOps 工具', 'devops-tools', 5, 'terminal'),
    ('软技能', 'soft-skills', 6, 'users'),
    ('设计工具', 'design-tools', 7, 'pen-tool'),
    ('认证', 'certifications', 8, 'award'),
    ('语言能力', 'language-proficiency', 9, 'languages'),
    ('其他', 'others', 99, 'ellipsis')
ON CONFLICT (slug) DO NOTHING;


-- ============================================================================
-- 14. 默认数据: 订阅套餐
-- ============================================================================
INSERT INTO subscription_plans (stripe_price_id, tier, name, description, price_monthly_cents, price_yearly_cents, features, sort_order) VALUES
(
    'price_free_placeholder',
    'free',
    '免费版',
    '适合体验基础功能',
    0,
    0,
    '{
        "max_resumes": 3,
        "max_analyses_per_month": 10,
        "max_versions_per_resume": 5,
        "ai_models": ["gpt-4o-mini"],
        "export_formats": ["pdf"],
        "templates": ["basic_clean", "basic_modern"],
        "priority_support": false,
        "custom_branding": false,
        "api_access": false,
        "team_accounts": 1
    }'::jsonb,
    1
),
(
    'price_pro_monthly_placeholder',
    'pro',
    '专业版',
    '适合积极求职者',
    9900,
    79000,
    '{
        "max_resumes": 10,
        "max_analyses_per_month": 50,
        "max_versions_per_resume": 20,
        "ai_models": ["gpt-4o-mini", "gpt-4o"],
        "export_formats": ["pdf", "docx", "json"],
        "templates": ["all"],
        "priority_support": true,
        "custom_branding": false,
        "api_access": false,
        "team_accounts": 1
    }'::jsonb,
    2
),
(
    'price_business_monthly_placeholder',
    'business',
    '商业版',
    '适合职业顾问和招聘机构',
    29900,
    239000,
    '{
        "max_resumes": 50,
        "max_analyses_per_month": 200,
        "max_versions_per_resume": 50,
        "ai_models": ["gpt-4o-mini", "gpt-4o", "claude-sonnet-4-6"],
        "export_formats": ["pdf", "docx", "json", "txt"],
        "templates": ["all_premium"],
        "priority_support": true,
        "custom_branding": true,
        "api_access": true,
        "team_accounts": 5
    }'::jsonb,
    3
),
(
    'price_enterprise_placeholder',
    'enterprise',
    '企业版',
    '适合大规模招聘和HR平台',
    99900,
    799000,
    '{
        "max_resumes": -1,
        "max_analyses_per_month": -1,
        "max_versions_per_resume": -1,
        "ai_models": ["all"],
        "export_formats": ["all"],
        "templates": ["all_premium_plus_custom"],
        "priority_support": true,
        "custom_branding": true,
        "api_access": true,
        "team_accounts": -1,
        "sso": true,
        "dedicated_support": true,
        "sla": "99.9%"
    }'::jsonb,
    4
)
ON CONFLICT (stripe_price_id) DO NOTHING;


-- ============================================================================
-- 完成
-- ============================================================================
-- 后续步骤:
-- 1. 用实际 Stripe Price ID 替换 subscription_plans 中的占位符
-- 2. 在生产数据就绪后创建 HNSW 索引 (analysis_results.resume_embedding)
-- 3. 配置 PgBouncer 连接池
-- 4. 为 usage_logs 和 audit_logs 设置自动分区创建 (pg_partman 或 cron job)
-- 5. 配置 pg_stat_statements 扩展以进行查询性能监控
-- 6. 针对具体查询模式进行 EXPLAIN ANALYZE 调优

-- EOF
