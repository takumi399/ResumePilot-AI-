# ResumePilot AI — 数据库设计文档

> **PostgreSQL 16+ · 生产级 · 百万用户规模 · 高并发**
>
> 版本: v2.0.0 | 日期: 2026-06-16

---

## 目录

1. [ER 图 (Mermaid)](#1-er-图-mermaid)
2. [数据库设计思路](#2-数据库设计思路)
3. [核心表字段说明](#3-核心表字段说明)
4. [主键设计](#4-主键设计)
5. [外键设计](#5-外键设计)
6. [索引设计策略](#6-索引设计策略)
7. [性能优化建议](#7-性能优化建议)
8. [安全与合规](#8-安全与合规)

---

## 1. ER 图 (Mermaid)

> **注意**: Mermaid 中 `VECTOR(1536)` 和 `int4range` 等类型可能无法完全渲染。ER 图聚焦于实体关系结构。在 Mermaid 渲染器中查看以获得最佳效果。

```mermaid
erDiagram
    users ||--o{ user_sessions : "has"
    users ||--o{ user_oauth_accounts : "links"
    users ||--o{ user_api_keys : "owns"
    users ||--o{ resumes : "creates"
    users ||--o{ jobs : "creates"
    users ||--o{ analysis_results : "requests"
    users ||--o{ subscriptions : "subscribes"
    users ||--o{ usage_logs : "generates"
    users ||--o{ notifications : "receives"

    resumes ||--o{ resume_versions : "versioned"
    resumes ||--o{ resume_skills : "tagged"
    resumes ||--o{ analysis_results : "analyzed"

    resume_versions ||--o| resume_versions : "parent_version_id"
    resume_versions ||--o{ analysis_results : "analyzed"

    skill_categories ||--o{ skills : "categorizes"
    skills ||--o{ resume_skills : "matched"
    skills ||--o{ job_skills : "requires"

    jobs ||--o{ job_skills : "requires"
    jobs ||--o{ analysis_results : "analyzed"

    analysis_results ||--o{ analysis_suggestions : "contains"

    subscription_plans ||--o{ subscriptions : "defines"

    %% === USERS ===
    users {
        uuid id PK "UUIDv7"
        text email UK "登录邮箱"
        text password_hash "Argon2id哈希"
        timestamptz email_verified_at "邮箱验证时间"
        text name "显示名称"
        text avatar_url "头像URL"
        user_role role "job_seeker | recruiter | admin | super_admin"
        user_status status "active | inactive | suspended | pending_verification | deleted"
        jsonb preferences "主题/通知/默认偏好"
        timestamptz last_login_at "最后登录时间"
        timestamptz created_at "创建时间"
        timestamptz updated_at "更新时间"
        timestamptz deleted_at "软删除时间"
    }

    user_sessions {
        uuid id PK "UUIDv7"
        uuid user_id FK "引用 users.id"
        text refresh_token_hash UK "SHA-256(refresh_token)"
        inet ip_address "登录IP"
        jsonb device_info "设备OS/浏览器/类型"
        timestamptz expires_at "过期时间"
        timestamptz revoked_at "撤销时间 (NULL=活跃)"
        uuid replaced_by FK "自引用: 新令牌ID"
        integer rotation_count "轮换次数"
    }

    %% === RESUMES ===
    resumes {
        uuid id PK "UUIDv7"
        uuid user_id FK "引用 users.id"
        text title "用户定义标题"
        text original_file_name "原始文件名"
        resume_file_type original_file_type "pdf | docx | txt | linkedin_import"
        bigint file_size_bytes "文件大小"
        text storage_key "S3对象键"
        text parsed_text "提取的原始文本"
        jsonb structured_data "AI提取的结构化简历数据"
        parse_status parse_status "pending | processing | completed | failed | needs_review"
        boolean is_primary "主简历标记"
        tsvector search_vector "全文搜索向量 (自动生成)"
        timestamptz deleted_at "软删除时间"
        timestamptz created_at updated_at
    }

    resume_versions {
        uuid id PK "UUIDv7"
        uuid resume_id FK "引用 resumes.id"
        uuid user_id FK "引用 users.id"
        integer version_number "递增版本号 1,2,3..."
        text version_label "用户版本标签"
        version_source source "upload | manual_edit | ai_optimization"
        jsonb structured_data "版本快照"
        uuid parent_version_id FK "父版本 (自引用)"
        jsonb diff_from_parent "差异数据"
        timestamptz created_at updated_at
    }

    resume_skills {
        uuid id PK "UUIDv7"
        uuid resume_id FK "引用 resumes.id"
        uuid skill_id FK "引用 skills.id"
        text skill_name "冗余技能名称 (加速查询)"
        text source_section "出处: skills_section | experience"
        numeric years_experience "经验年数"
        text proficiency "beginner | intermediate | advanced | expert"
        boolean is_verified "上下文验证标记"
    }

    %% === SKILLS ===
    skill_categories {
        uuid id PK "UUIDv7"
        text name UK "分类名 e.g. Programming Languages"
        text slug UK "URL友好标识符"
        integer display_order "UI排序"
        text icon "Lucide图标名"
    }

    skills {
        uuid id PK "UUIDv7"
        uuid category_id FK "引用 skill_categories.id"
        text name "技能名 e.g. Python"
        text canonical_name UK "标准名 e.g. python"
        text[] aliases "别名 e.g. {py, python3}"
        vector embedding "向量(1536) 语义搜索"
        integer popularity "使用热度"
    }

    %% === JOBS ===
    jobs {
        uuid id PK "UUIDv7"
        uuid user_id FK "引用 users.id"
        text title "职位名称"
        text company "公司名"
        text location "工作地点"
        text raw_text "原始JD文本"
        jsonb structured_data "AI解析的结构化JD数据"
        job_source_type source_type "manual | url_import | linkedin"
        tsvector search_vector "全文搜索向量 (自动生成)"
        timestamptz deleted_at "软删除时间"
        timestamptz created_at updated_at
    }

    job_skills {
        uuid id PK "UUIDv7"
        uuid job_id FK "引用 jobs.id"
        uuid skill_id FK "引用 skills.id"
        text skill_name "冗余技能名称"
        text importance "must_have | preferred | nice_to_have"
        numeric years_required "要求年限"
        numeric weight "关键词权重 0.00-1.00"
    }

    %% === ANALYSIS ===
    analysis_results {
        uuid id PK "UUIDv7"
        uuid user_id FK "引用 users.id"
        uuid resume_id FK "引用 resumes.id"
        uuid resume_version_id FK "引用 resume_versions.id"
        uuid job_id FK "引用 jobs.id"
        numeric ats_score_total "ATS综合分数 0-100"
        jsonb score_breakdown "五维度评分分解"
        jsonb section_scores "各部分评分"
        jsonb keyword_analysis "关键词匹配/缺失/过度使用"
        jsonb skill_gap_analysis "技能差距分析"
        jsonb ai_suggestions "AI优化建议"
        jsonb ai_optimized_resume "优化后的完整简历"
        vector resume_embedding "简历向量(1536)"
        vector job_embedding "JD向量(1536)"
        numeric semantic_similarity "余弦相似度"
        optimization_level optimization_level "conservative | moderate | aggressive"
        analysis_status status "queued | processing | completed | failed | canceled"
        ai_model model_used "使用的AI模型"
        integer tokens_used "Token消耗量"
        integer cost_cents "API成本(美分)"
        integer processing_time_ms "处理耗时(ms)"
        timestamptz completed_at created_at updated_at
    }

    analysis_suggestions {
        uuid id PK "UUIDv7"
        uuid analysis_id FK "引用 analysis_results.id"
        uuid user_id FK "引用 users.id"
        text section "目标简历部分"
        text suggestion_type "rewrite | add_bullet | keyword_injection..."
        text severity "critical | high | medium | low"
        text original_text "原始文本"
        text suggested_text "建议文本"
        text explanation "AI解释"
        text[] keywords_added "添加的关键词"
        jsonb impact_estimate "预估分数提升"
        boolean is_applied "用户已接受?"
        boolean is_dismissed "用户已拒绝?"
        smallint user_rating "用户评分 1-5"
    }

    %% === SUBSCRIPTIONS ===
    subscription_plans {
        uuid id PK "UUIDv7"
        text stripe_price_id UK "Stripe Price ID"
        subscription_tier tier "free | pro | business | enterprise"
        text name "套餐名称"
        integer price_monthly_cents "月付价格(美分)"
        jsonb features "功能限制"
    }

    subscriptions {
        uuid id PK "UUIDv7"
        uuid user_id FK "引用 users.id"
        uuid plan_id FK "引用 subscription_plans.id"
        text stripe_subscription_id UK "Stripe订阅ID"
        subscription_status status "active | past_due | canceled..."
        timestamptz current_period_start "当前周期开始"
        timestamptz current_period_end "当前周期结束"
    }

    %% === LOGS ===
    usage_logs {
        uuid id PK "UUIDv7"
        uuid user_id FK "引用 users.id"
        text event_type "analysis_requested | resume_uploaded"
        integer quantity "数量"
        jsonb metadata "附加元数据"
        timestamptz created_at "事件时间"
    }

    audit_logs {
        uuid id PK "UUIDv7"
        uuid user_id "操作用户"
        audit_event_type event_type "事件类型枚举"
        text action "create | update | delete | login"
        jsonb changes "变更内容 {old, new}"
        inet ip_address "操作IP"
        timestamptz created_at "事件时间"
    }

    notifications {
        uuid id PK "UUIDv7"
        uuid user_id FK "引用 users.id"
        text type "analysis_complete | subscription_expiring"
        text title "通知标题"
        text body "通知内容"
        boolean is_read "已读标记"
        timestamptz created_at "创建时间"
    }
```

---

## 2. 数据库设计思路

### 2.1 架构哲学: 关系型为主、文档型为辅、向量搜索赋能

```
┌─────────────────────────────────────────────────────┐
│              ResumePilot AI 数据架构                 │
├─────────────────────────────────────────────────────┤
│                                                     │
│   ┌─────────────┐  关系型数据 (70%)                 │
│   │ users       │  · 用户、简历、版本、订阅          │
│   │ resumes     │  · 技能关联 (多对多)               │
│   │ versions    │  · 严格的外键约束和数据完整性       │
│   │ sessions    │  · ACID 事务保证                   │
│   │ jobs        │                                    │
│   │ skills      │                                    │
│   └──────┬──────┘                                    │
│          │                                           │
│   ┌──────┴──────┐  JSONB 半结构化数据 (20%)         │
│   │ JSONB 字段   │  · 分析结果 (score_breakdown)     │
│   │             │  · AI 建议 (ai_suggestions)        │
│   │             │  · 结构化简历 (structured_data)    │
│   │             │  · 套餐配置 (features)             │
│   │             │  · GIN 索引支持高效查询             │
│   └──────┬──────┘                                    │
│          │                                           │
│   ┌──────┴──────┐  向量数据 (10%)                    │
│   │ pgvector    │  · 简历嵌入 (resume_embedding)      │
│   │             │  · JD 嵌入 (job_embedding)         │
│   │             │  · 技能嵌入 (skills.embedding)     │
│   │             │  · HNSW 索引实现近似最近邻搜索      │
│   └─────────────┘                                    │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 2.2 为什么这样设计?

| 设计决策 | 理由 |
|---------|------|
| **UUIDv7 主键** | 相比 UUIDv4: 时间可排序 → B-tree 索引碎片减少 80%；相比自增 ID: 无中心化序列竞争；无需 Snowflake 基础设施；暴露给 API 不泄露记录总数 |
| **JSONB 而非 EAV** | AI 分析结果结构多变。EAV (Entity-Attribute-Value) 导致查询复杂度爆炸 (每个属性需要 JOIN 一次)。JSONB + GIN 索引在保持查询能力的同时支持灵活 Schema |
| **pgvector 而非独立向量数据库** | 单一数据库运维成本低；在同一个事务中即可完成关系查询 + 向量搜索；避免数据同步延迟 |
| **分区而非单表** | usage_logs 和 audit_logs 每月可达千万级。时间范围分区使查询始终只扫描相关月份，同时支持高效 DROP 过期分区 |
| **物化视图** | Dashboard 聚合查询扫描海量数据。物化视图预计算，查询变为 O(1)，定时刷新 (每5分钟) 对用户感知延迟远低于实时聚合 |
| **软删除** | 简历数据对用户有情感价值。deleted_at 允许无时间限制的恢复窗口；Partial Index `WHERE deleted_at IS NULL` 保证活跃查询性能不受影响 |
| **去标准化 (skill_name 冗余)** | resume_skills.skill_name = skills.name 的副本。避免每次列表查询都 JOIN skills 表。PostgreSQL 的 MVCC 机制使这种可控冗余成为合理权衡 |

### 2.3 表分类

| 分类 | 表名 | 预计数据量 (百万用户) | 读写比 | 分区 |
|------|------|---------------------|--------|------|
| **核心** | `users` | ~1M | 1:50 | 否 |
| **核心** | `user_sessions` | ~5M | 1:200 | 否 |
| **核心** | `resumes` | ~3M | 1:10 | 否 |
| **核心** | `resume_versions` | ~10M | 1:5 | 否 |
| **核心** | `jobs` | ~2M | 1:8 | 否 |
| **核心** | `analysis_results` | ~15M | 1:20 | 推荐 |
| **关联** | `resume_skills` | ~30M | 1:5 | 否 |
| **关联** | `job_skills` | ~8M | 1:5 | 否 |
| **关联** | `analysis_suggestions` | ~100M | 1:3 | 推荐 |
| **参考** | `skills` | ~10K | 100:1 | 否 |
| **参考** | `skill_categories` | ~20 | 1000:1 | 否 |
| **业务** | `subscriptions` | ~1M | 1:20 | 否 |
| **业务** | `subscription_plans` | ~10 | 1000:1 | 否 |
| **日志** | `usage_logs` | ~500M | 1:10000 | **是** (按月) |
| **日志** | `audit_logs` | ~200M | 1:10000 | **是** (按月) |
| **辅助** | `notifications` | ~50M | 1:5 | 推荐 |

---

## 3. 核心表字段说明

### 3.1 users — 用户表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | `uuid` | PK, DEFAULT uuid_generate_v7() | UUIDv7 — 时间可排序，B-tree 友好 |
| `email` | `text` | NOT NULL, UNIQUE (partial) | 登录邮箱，仅活跃用户唯一 |
| `password_hash` | `text` | NOT NULL | Argon2id 哈希 (推荐参数: m=19456, t=2, p=1) |
| `email_verified_at` | `timestamptz` | NULL | NULL = 未验证；非 NULL = 已验证 |
| `name` | `text` | | 用户显示名称 |
| `avatar_url` | `text` | | S3 URL，头像图片 |
| `role` | `user_role` | NOT NULL, DEFAULT 'job_seeker' | RBAC 角色枚举 |
| `status` | `user_status` | NOT NULL, DEFAULT 'pending_verification' | 账户生命周期状态 |
| `failed_login_attempts` | `integer` | NOT NULL DEFAULT 0 | 暴力破解防护计数器 |
| `locked_until` | `timestamptz` | | 超过5次失败后锁定账户的截止时间 |
| `mfa_enabled` | `boolean` | NOT NULL DEFAULT false | 双因素认证开关 |
| `preferences` | `jsonb` | NOT NULL DEFAULT '{}' | UI 偏好、通知设置、默认导出格式等 |
| `stripe_customer_id` | `text` | | Stripe 客户 ID，用于计费 |
| `usage_quota` | `jsonb` | NOT NULL | 按套餐的功能限制 (去标准化副本) |
| `last_login_at` | `timestamptz` | | 最后登录时间 (用于流失分析) |
| `last_active_at` | `timestamptz` | | 最后活跃时间 (用于 DAU 统计) |
| `created_at` | `timestamptz` | NOT NULL DEFAULT now() | 注册时间 |
| `updated_at` | `timestamptz` | NOT NULL DEFAULT now() | 自动触发器更新 |
| `deleted_at` | `timestamptz` | | 软删除标记 (NULL = 活跃) |

**设计要点:**
- `email` 唯一约束使用 Partial Index (`WHERE deleted_at IS NULL`)，已删除用户的邮箱可被新注册复用
- `usage_quota` 是 `subscription_plans.features` 的去标准化副本，避免每次鉴权都 JOIN 订阅表
- `password_hash` 使用 Argon2id (比 bcrypt 更抗 GPU 攻击)

### 3.2 user_sessions — 会话管理表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | `uuid` | PK | 会话 ID |
| `user_id` | `uuid` | FK → users(id) ON DELETE CASCADE | 所属用户 |
| `refresh_token_hash` | `text` | NOT NULL, UNIQUE (partial) | SHA-256(refresh_token_string) — 从不存储原始令牌 |
| `access_token_jti` | `text` | | 当前 Access Token 的 JWT ID，用于单个令牌撤销 |
| `device_info` | `jsonb` | NOT NULL DEFAULT '{}' | `{os, browser, device_type}` |
| `ip_address` | `inet` | | 登录 IP (支持 IPv4/IPv6) |
| `user_agent` | `text` | | 原始 User-Agent 请求头 |
| `expires_at` | `timestamptz` | NOT NULL | 刷新令牌过期时间 (7天) |
| `revoked_at` | `timestamptz` | | NULL = 活跃；非 NULL = 已撤销 |
| `revoked_reason` | `text` | | 'user_logout', 'password_change', 'theft_detected', 'admin_action' |
| `replaced_by` | `uuid` | FK → user_sessions(id) | 令牌轮换链: 旧令牌 → 新令牌 |
| `rotation_count` | `integer` | NOT NULL DEFAULT 0 | 此令牌链上的轮换次数 |

**设计要点:**
- **令牌复用检测**: 当已撤销的 refresh token 再次被使用时，立即撤销该用户所有活跃会话(安全告警)
- **轮换链**: `replaced_by` 形成链表结构，支持审计追踪。每次轮换递增 `rotation_count`
- **`access_token_jti`**: 允许在不撤销整个会话的情况下撤销单个 Access Token (例如角色变更时)

### 3.3 resumes — 简历主表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | `uuid` | PK | 简历 ID |
| `user_id` | `uuid` | FK → users(id) ON DELETE CASCADE | 所有者 |
| `title` | `text` | NOT NULL | "张三四面字节跳动后端岗" |
| `original_file_name` | `text` | NOT NULL | 上传时的原始文件名 |
| `original_file_type` | `resume_file_type` | NOT NULL | pdf / docx / txt / linkedin_import |
| `file_size_bytes` | `bigint` | NOT NULL | 文件大小 (字节) |
| `storage_key` | `text` | NOT NULL | S3/MinIO 对象键: `resumes/{user_id}/{uuid}.pdf` |
| `page_count` | `integer` | | 页数 |
| `parsed_text` | `text` | | 从文件提取的原始文本 (用于全文搜索) |
| `structured_data` | `jsonb` | | AI 提取的结构化数据 (见 JSON Schema 注释) |
| `parse_status` | `parse_status` | NOT NULL DEFAULT 'pending' | 解析生命周期状态 |
| `parse_error` | `text` | | 失败时的错误详情 |
| `parse_model` | `ai_model` | | 用于解析的 AI 模型 |
| `parse_confidence` | `numeric(3,2)` | | AI 解析置信度 0.00-1.00 |
| `language` | `text` | DEFAULT 'zh' | 'zh', 'en', 'bilingual' |
| `is_primary` | `boolean` | NOT NULL DEFAULT false | 用户的主要简历 (仪表盘默认显示) |
| `is_archived` | `boolean` | NOT NULL DEFAULT false | 用户主动归档 |
| `is_template` | `boolean` | NOT NULL DEFAULT false | 保存为可复用模板 |
| `search_vector` | `tsvector` | GENERATED ALWAYS AS ... STORED | 自动生成列，包含标题(A权重) + 内容(B权重) |

**设计要点:**
- `structured_data` 使用 JSONB 而非独立的 experience/education 表。理由: (1) 每个简历的经验/教育条目数量差异大 (0-20+); (2) 仅在分析时需要结构化查询; (3) 避免大量小表的 JOIN 复杂度
- `search_vector` 是 GENERATED 列，`parsed_text` 更新时自动同步，无需触发器
- `parse_confidence` 用于在前端提示用户 "AI 解析置信度低，请手动检查"

### 3.4 resume_versions — 简历版本表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | `uuid` | PK | 版本 ID |
| `resume_id` | `uuid` | FK → resumes(id) ON DELETE CASCADE | 所属简历 |
| `user_id` | `uuid` | FK → users(id) ON DELETE CASCADE | 操作者 (去标准化，加速查询) |
| `version_number` | `integer` | NOT NULL, UNIQUE(resume_id, version_number) | 递增版本号 |
| `version_label` | `text` | | 用户标签: "针对字节跳动优化版" |
| `source` | `version_source` | NOT NULL | upload / manual_edit / ai_optimization / linkedin_import / template_apply |
| `change_summary` | `text` | | 人类可读的变化摘要 |
| `structured_data` | `jsonb` | NOT NULL | 此版本的完整结构化数据快照 |
| `parsed_text` | `text` | | 对应版本的原始文本 |
| `storage_key` | `text` | | 此版本的导出 PDF S3 键 |
| `parent_version_id` | `uuid` | FK → resume_versions(id) | 差异计算的父版本 |
| `diff_from_parent` | `jsonb` | | 与父版本的差异 (添加/删除/修改) |
| `created_at` | `timestamptz` | NOT NULL DEFAULT now() | 版本创建时间 |

**设计要点:**
- `version_number` 是整数而非时间戳，用户可以理解"版本 3"而非"2026-06-16T..."
- `structured_data` 完整快照保证版本独立性，即使后续 `resumes.structured_data` 被修改也不影响历史版本
- `parent_version_id` 支持差异链: v1 → v2 → v3 (可追溯完整修改历史)

### 3.5 jobs — 岗位 JD 表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | `uuid` | PK | 岗位 ID |
| `user_id` | `uuid` | FK → users(id) ON DELETE CASCADE | 创建者 |
| `title` | `text` | NOT NULL | 职位名称 |
| `company` | `text` | | 公司名称 |
| `location` | `text` | | 工作地点 |
| `job_type` | `text` | | full-time / part-time / contract / internship |
| `experience_level` | `text` | | entry / mid / senior / lead / executive |
| `salary_range` | `text` | | 薪资范围 (文本，非结构化) |
| `raw_text` | `text` | NOT NULL | 原始 JD 文本 |
| `source_url` | `text` | | JD 来源 URL |
| `source_type` | `job_source_type` | NOT NULL DEFAULT 'manual' | 数据来源 |
| `structured_data` | `jsonb` | | AI 解析的结构化要求 |
| `status` | `text` | NOT NULL DEFAULT 'active' | active / archived / expired |
| `search_vector` | `tsvector` | GENERATED ALWAYS AS ... STORED | 全文搜索 |
| `deleted_at` | `timestamptz` | | 软删除 |

### 3.6 analysis_results — ATS 分析结果表

这是数据库中最复杂的表。每条记录代表一次完整的简历-岗位匹配分析。

| 字段组 | 字段 | 类型 | 说明 |
|--------|------|------|------|
| **标识** | `id` | `uuid` PK | 分析 ID |
| **关联** | `user_id` | `uuid` FK | 请求者 |
|  | `resume_id` | `uuid` FK | 被分析的简历 |
|  | `resume_version_id` | `uuid` FK | 分析的特定版本 (可选) |
|  | `job_id` | `uuid` FK | 目标岗位 |
| **评分** | `ats_score_total` | `numeric(5,2)` | 综合 ATS 分数 0-100 |
|  | `ats_score_percentile` | `integer` | 全局百分位排名 |
|  | `score_breakdown` | `jsonb` | 五维度评分分解 (含权重) |
|  | `section_scores` | `jsonb` | 各简历部分的详细评分 |
| **分析** | `keyword_analysis` | `jsonb` | 关键词匹配/缺失/密度地图 |
|  | `skill_gap_analysis` | `jsonb` | 技能差距、关键缺口、提升建议 |
| **AI 结果** | `ai_suggestions` | `jsonb` | AI 逐条建议数组 |
|  | `ai_optimized_resume` | `jsonb` | 完整的 AI 优化后简历 |
|  | `optimization_level` | `optimization_level` | conservative / moderate / aggressive |
| **向量** | `resume_embedding` | `vector(1536)` | 简历的语义嵌入向量 |
|  | `job_embedding` | `vector(1536)` | JD 的语义嵌入向量 |
|  | `semantic_similarity` | `numeric(5,4)` | 余弦相似度 |
| **元数据** | `status` | `analysis_status` | 作业生命周期 |
|  | `model_used` | `ai_model` | 使用的 AI 模型 |
|  | `tokens_used` | `integer` | 消耗 Token 数 |
|  | `cost_cents` | `integer` | API 成本 (美分) |
|  | `processing_time_ms` | `integer` | 处理耗时 (毫秒) |
|  | `retry_count` | `integer` | 重试次数 |

**设计要点:**
- `score_breakdown` 包含权重和加权分数，允许 ATS 算法迭代时追踪评分变化
- `ai_suggestions` 在主表中存储摘要，详细建议拆分到 `analysis_suggestions` 表（支持逐条追踪应用状态）
- embedding 向量存储在主表中而非独立表，避免额外的 JOIN 开销

---

## 4. 主键设计

### 4.1 UUIDv7 的选择理由

```
UUIDv4:  f47ac10b-58cc-4372-a567-0e02b2c3d479  (完全随机)
UUIDv7:  018f9a2c-4b7e-7d1a-8000-a1b2c3d4e5f6  (前缀=时间戳)
                                               ^^^^^^^^^^^^
                                               48-bit 时间戳 (毫秒)
```

| 特性 | UUIDv7 | UUIDv4 | 自增 BIGINT | Snowflake |
|------|--------|--------|------------|-----------|
| **B-tree 索引碎片** | 低 (单调递增) | **极高** (随机) | 零 | 低 |
| **写入放大** | 低 | **高** (页分裂) | 低 | 低 |
| **分布式生成** | ✅ 无协调 | ✅ 无协调 | ❌ 需要序列 | ✅ 无协调 |
| **暴露安全性** | ✅ 不泄露行数 | ✅ 不泄露行数 | ❌ 泄露行数 | ⚠️ 泄露时间戳 |
| **排序能力** | ✅ 时间可排序 | ❌ 不可排序 | ✅ 自然排序 | ✅ 时间可排序 |
| **存储大小** | 16 bytes | 16 bytes | 8 bytes | 8 bytes |

**结论**: UUIDv7 是分布式友好、安全、高性能三者的平衡点。额外的 8 字节存储成本相对于其带来的架构收益可以忽略不计。

### 4.2 实现细节

```sql
-- UUIDv7 格式规范:
-- 第 1-12 位:  Unix 时间戳毫秒 (48-bit, big-endian)
-- 第 13 位:    版本号 0x7
-- 第 14-32 位: 随机数 (62-bit, 变体位 10xx)
-- 第 33-36 位: 随机数

-- 性能基准 (单表 1 亿行):
-- UUIDv7: INSERT ~45,000 rows/sec, 索引大小 ~3.2 GB
-- UUIDv4: INSERT ~35,000 rows/sec, 索引大小 ~4.8 GB (碎片导致)
-- BIGINT:  INSERT ~50,000 rows/sec, 索引大小 ~2.1 GB
```

---

## 5. 外键设计

### 5.1 外键约束矩阵

```
┌────────────────────┬──────────────────┬──────────────┬───────────┐
│ 子表               │ 父表             │ 删除行为     │ 理由      │
├────────────────────┼──────────────────┼──────────────┼───────────┤
│ user_sessions      │ users            │ CASCADE      │ 用户删除 │
│ resumes            │ users            │ CASCADE      │ → 删除所 │
│ resume_versions    │ resumes          │ CASCADE      │ 有关联   │
│ resume_versions    │ users            │ CASCADE      │ 数据     │
│ resume_skills      │ resumes          │ CASCADE      │          │
│ jobs               │ users            │ CASCADE      │          │
│ job_skills         │ jobs             │ CASCADE      │          │
│ analysis_results   │ users/resumes/jobs│ CASCADE     │          │
│ analysis_suggestions│ analysis_results │ CASCADE      │          │
├────────────────────┼──────────────────┼──────────────┼───────────┤
│ resume_versions    │ resume_versions   │ SET NULL     │ 父版本删│
│                    │ (parent_version)  │              │ 除不断链 │
│ user_sessions      │ user_sessions     │ SET NULL     │ 令牌轮换│
│                    │ (replaced_by)     │              │ 链不断   │
├────────────────────┼──────────────────┼──────────────┼───────────┤
│ resume_skills      │ skills            │ CASCADE      │ 技能从   │
│ job_skills         │ skills            │ CASCADE      │ 目录删除 │
│                    │                   │              │ 时清理关联│
└────────────────────┴──────────────────┴──────────────┴───────────┘
```

### 5.2 为什么使用 CASCADE 删除?

1. **数据一致性**: 用户注销时，其所有简历、分析、版本应一起删除
2. **GDPR 合规**: 用户有权要求完全删除个人数据，CASCADE 确保无残留
3. **性能**: 在 FK 列上有索引时，CASCADE 删除性能良好 (O(log n) 查找关联行)

### 5.3 为什么自引用使用 SET NULL?

`resume_versions.parent_version_id` 和 `user_sessions.replaced_by` 使用 `ON DELETE SET NULL`:
- 删除链中的某个节点时，不应破坏整个链表
- 例如: 删除旧会话记录时，`replaced_by` 也应变为 NULL，但保留审计日志

---

## 6. 索引设计策略

### 6.1 索引类型选择指南

| 索引类型 | 适用场景 | ResumePilot 中的使用 |
|---------|---------|---------------------|
| **B-tree** | 等值查询、范围查询、排序 | 主键、外键、状态字段、时间戳排序 |
| **GIN** | 全文搜索、JSONB 查询、数组查询、三元组匹配 | search_vector、JSONB 字段、trigram 名称搜索 |
| **BRIN** | 物理存储顺序与值的顺序相关的大型表 | usage_logs.created_at、audit_logs.created_at、jobs.posted_date |
| **HNSW** (pgvector) | 高维向量的近似最近邻搜索 | resume_embedding、job_embedding、skills.embedding |
| **Partial** | 仅查询行的子集 | `WHERE deleted_at IS NULL`、`WHERE revoked_at IS NULL`、`WHERE status = 'active'` |

### 6.2 索引大小与查询性能分析

以下是百万用户规模下关键索引的预估大小和加速比:

| 索引 | 类型 | 预估值 (百万用户) | 加速比 | 写入开销 |
|------|------|-------------------|--------|---------|
| `idx_users_email` | Partial Unique B-tree | ~40 MB | 1000x | +5% |
| `idx_sessions_token_hash` | Partial Unique B-tree | ~200 MB | 10000x | +3% |
| `idx_resumes_user` | B-tree (user_id, created_at) | ~150 MB | 500x | +8% |
| `idx_resumes_search` | GIN (tsvector) | ~500 MB | 100x | +15% |
| `idx_analysis_user` | B-tree (user_id, created_at) | ~600 MB | 300x | +10% |
| `idx_analysis_status` | Partial B-tree | ~50 MB | 200x | +3% |
| `idx_usage_user_time` | BRIN | ~5 MB | 50x | +0.5% |
| `idx_skills_name_trgm` | GIN (trgm) | ~3 MB | 100x | +2% |
| HNSW (embedding) | pgvector HNSW | ~500 MB | 1000x | +40% |

### 6.3 索引设计原则

1. **Partial Index 优先于 Full Index**: 如果 90% 的查询只关心活跃记录，Partial Index 比 Full Index 小 50-90%，写入更快
2. **BRIN 用于仅追加表**: usage_logs 和 audit_logs 仅追加、按时间查询。BRIN 索引大小仅为 B-tree 的 1/1000
3. **覆盖索引**: 高频查询列放在索引中包含，避免回表 (例如 `idx_resumes_user(user_id, created_at DESC)`)
4. **避免过度索引**: 索引数量超过 5-7 个时，每次 INSERT/UPDATE 的写入放大超过 20%
5. **HNSW 延迟创建**: 向量索引应在批量数据加载后创建，否则每次 INSERT 更新图结构导致极慢的写入

---

## 7. 性能优化建议

### 7.1 百万用户规模下的优化策略

#### 7.1.1 连接池 — PgBouncer

```
应用层 (NestJS)                数据库层
┌────────────┐              ┌──────────────┐
│ 50 pods    │──────────────│ PgBouncer    │──── PostgreSQL
│ x 20 conn  │  (1000 连接)  │ (50 连接池)  │    (50 实际连接)
└────────────┘  事务模式    └──────────────┘
```

- PostgreSQL 最佳并发连接数: **CPU 核心数 × 2-4** (通常 20-50)
- PgBouncer 事务池模式: 1000+ 应用连接 → 50 数据库连接
- 查询排队时间: < 1ms (非峰值)

#### 7.1.2 表分区 — 大表自动分区

```sql
-- 使用 pg_partman 自动创建月度分区 (推荐生产环境)
-- SELECT partman.create_parent(
--     p_parent_table := 'public.usage_logs',
--     p_control := 'created_at',
--     p_type := 'native',
--     p_interval := '1 month',
--     p_premake := 3    -- 提前创建未来3个月的分区
-- );

-- 自动删除过期分区 (保留12个月)
-- UPDATE partman.part_config
-- SET retention = '12 months',
--     retention_keep_table = false
-- WHERE parent_table = 'public.usage_logs';
```

#### 7.1.3 查询优化

```sql
-- ❌ 差: 全表扫描 + JOIN 爆炸
SELECT * FROM analysis_results ar
JOIN resumes r ON ar.resume_id = r.id
WHERE ar.user_id = '...';

-- ✅ 好: 覆盖索引 + 仅选择需要的列
SELECT ar.ats_score_total, ar.created_at, r.title
FROM analysis_results ar
JOIN resumes r ON ar.resume_id = r.id
WHERE ar.user_id = '...'
ORDER BY ar.created_at DESC
LIMIT 20;

-- ✅ 最佳: 使用覆盖索引的子查询
SELECT ar.ats_score_total, ar.created_at,
       (SELECT title FROM resumes WHERE id = ar.resume_id) AS resume_title
FROM analysis_results ar
WHERE ar.user_id = '...'
ORDER BY ar.created_at DESC
LIMIT 20;
-- 利用 idx_analysis_user(user_id, created_at DESC)
-- 回表前就已截断到 20 行
```

#### 7.1.4 PostgreSQL 配置调优

```ini
# postgresql.conf 生产环境推荐值 (64GB RAM, 16 vCPU)

# 内存
shared_buffers = 16GB                    # 25% of RAM
effective_cache_size = 48GB              # 75% of RAM
work_mem = 256MB                         # 排序/哈希操作 (每操作)
maintenance_work_mem = 2GB               # VACUUM, CREATE INDEX

# 写入
wal_level = replica
max_wal_size = 16GB
min_wal_size = 4GB
wal_buffers = 64MB

# 查询计划
random_page_cost = 1.1                   # SSD 优化 (默认 4.0 是为 HDD)
effective_io_concurrency = 200           # NVMe SSD
default_statistics_target = 500          # 更好的查询计划 (默认 100)

# 连接
max_connections = 200                    # 配合 PgBouncer 使用

# 自动清理
autovacuum_max_workers = 4
autovacuum_naptime = 30s
autovacuum_vacuum_scale_factor = 0.05    # 更频繁 (5%)
autovacuum_analyze_scale_factor = 0.02   # 更频繁 (2%)
```

### 7.2 读写分离策略

```
主库 (Primary)                    只读副本 (Read Replica)
┌──────────────────┐           ┌──────────────────────┐
│ 所有写入          │   WAL     │ Dashboard 统计查询    │
│ 实时读取          │───复制──→│ 历史分析列表          │
│ 认证/会话管理     │  异步     │ 报表生成              │
│ 订阅/计费        │           │ 数据导出              │
└──────────────────┘           └──────────────────────┘
```

- NestJS 中使用 Prisma 的读/写客户端分离
- 只读副本的数量: 读/写比 > 10:1 时考虑扩展

### 7.3 缓存策略

```
请求层          应用缓存 (Redis)           数据库
───────         ──────────────             ──────
用户 Dashboard  → 缓存 5分钟 → 失效 → 查询 mv_user_stats
分析详情        → 缓存 30分钟 → 失效 → 查询 analysis_results
技能列表        → 缓存 1小时  → 失效 → 查询 skills
套餐配置        → 缓存 1小时  → 失效 → 查询 subscription_plans
```

### 7.4 定时维护

```sql
-- 每天凌晨 3:00 执行

-- 1. 刷新物化视图
SELECT refresh_materialized_views();

-- 2. VACUUM ANALYZE 高频更新表
VACUUM ANALYZE user_sessions;
VACUUM ANALYZE usage_logs;

-- 3. 重新计算表统计信息 (查询计划优化)
ANALYZE analysis_results;
ANALYZE resumes;

-- 4. 清理过期会话
DELETE FROM user_sessions
WHERE revoked_at IS NOT NULL
  AND revoked_at < now() - INTERVAL '30 days';

-- 5. 清理已读通知
DELETE FROM notifications
WHERE is_read = true
  AND created_at < now() - INTERVAL '90 days';

-- 6. 更新技能热度
UPDATE skills s SET popularity = (
    SELECT COUNT(*) FROM resume_skills rs WHERE rs.skill_id = s.id
) + (
    SELECT COUNT(*) FROM job_skills js WHERE js.skill_id = s.id
);
```

---

## 8. 安全与合规

### 8.1 数据加密

| 层级 | 方法 | 覆盖范围 |
|------|------|---------|
| **传输中** | TLS 1.3 | 客户端 ↔ Nginx ↔ API ↔ PostgreSQL |
| **静态** | PostgreSQL TDE (pg_tde) 或磁盘级加密 | 所有数据和 WAL |
| **敏感字段** | pgcrypto + 应用层加密 | password_hash (Argon2id)、refresh_token_hash (SHA-256)、api_key_hash (SHA-256) |
| **文件** | S3 SSE (AES-256) | 上传的简历文件 |

### 8.2 PII 数据处理

```
PII 字段清单:
- users.email          → 必须加密传输，可查询 (Partial Unique Index)
- users.name           → 可搜索 (GIN trigram)
- users.password_hash  → 仅哈希存储，不可逆
- resumes.parsed_text  → 包含个人身份信息，需按 GDPR 处理
- user_sessions.ip_address → 用于安全审计，30天后删除
```

### 8.3 审计日志

每条 `audit_logs` 记录包含:
- **谁**: `user_id` + `session_id`
- **做了什么**: `event_type` + `action`
- **对什么资源**: `resource_type` + `resource_id`
- **具体变更**: `changes` (JSONB — 旧值/新值对比)
- **从哪里**: `ip_address` + `user_agent`
- **何时**: `created_at`

---

## 附录 A: 关键 SQL 查询模板

### A.1 用户 Dashboard (物化视图替代方案)

```sql
-- 不使用物化视图时的实时查询 (中小规模)
SELECT
    COUNT(DISTINCT r.id) FILTER (WHERE r.deleted_at IS NULL) AS resume_count,
    COUNT(DISTINCT j.id) FILTER (WHERE j.deleted_at IS NULL) AS job_count,
    COUNT(DISTINCT ar.id) FILTER (WHERE ar.status = 'completed') AS analysis_count,
    COALESCE(AVG(ar.ats_score_total) FILTER (WHERE ar.status = 'completed'), 0) AS avg_score,
    COUNT(DISTINCT ar.id) FILTER (
        WHERE ar.status = 'completed'
          AND ar.created_at >= date_trunc('month', now())
    ) AS analyses_this_month
FROM users u
LEFT JOIN resumes r ON u.id = r.user_id
LEFT JOIN jobs j ON u.id = j.user_id
LEFT JOIN analysis_results ar ON u.id = ar.user_id
WHERE u.id = '...';
```

### A.2 相似简历推荐 (pgvector)

```sql
-- 基于简历嵌入的相似度搜索
SELECT r.id, r.title, r.structured_data->'personal_info'->>'full_name' AS name,
       1 - (ar.resume_embedding <=> $1::vector) AS similarity
FROM analysis_results ar
JOIN resumes r ON ar.resume_id = r.id
WHERE ar.resume_embedding IS NOT NULL
  AND ar.status = 'completed'
  AND ar.resume_id != $2  -- 排除当前简历
ORDER BY ar.resume_embedding <=> $1::vector
LIMIT 10;
```

### A.3 全文本搜索 + 语义搜索混合

```sql
-- 在已保存的 JD 中搜索关键词
SELECT j.id, j.title, j.company,
       ts_rank(j.search_vector, plainto_tsquery('simple', 'senior backend engineer python')) AS text_rank,
       j.created_at
FROM jobs j
WHERE j.user_id = '...'
  AND j.deleted_at IS NULL
  AND j.search_vector @@ plainto_tsquery('simple', 'senior backend engineer python')
ORDER BY text_rank DESC
LIMIT 20;
```

---

## 附录 B: 数据迁移计划

### Phase 1: 初始部署
```
1. 创建所有表和索引 → schema.sql
2. 插入参考数据 (skill_categories, subscription_plans)
3. 注册第一个管理员用户
```

### Phase 2: MVP 上线后
```
1. 启用 pg_stat_statements 监控慢查询
2. 根据实际查询模式调优索引
3. 为 usage_logs 配置自动分区
4. 创建 HNSW 索引 (数据量 > 10K 分析结果后)
```

### Phase 3: 百万用户规模
```
1. 实现读写分离 (只读副本)
2. 部署 PgBouncer 连接池
3. analysis_results 表分区
4. 归档超过12个月的数据到冷存储
5. 考虑 Citus 水平分片 (如多租户隔离需要)
```

---

> **文档维护者**: ResumePilot AI 数据库架构团队
> **相关文件**: `database/schema.sql`
