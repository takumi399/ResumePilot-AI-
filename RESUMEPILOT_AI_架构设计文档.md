# ResumePilot AI — 全栈架构设计文档

> **AI驱动的简历分析与优化SaaS平台**
>
> 技术栈: Next.js 15 · NestJS 11 · PostgreSQL 16 + pgvector · Redis 7 · AWS S3 · BullMQ · OpenAI API · Docker · GitHub Actions
>
> 文档版本: v2.0.0 | 更新日期: 2026-06-16 | 作者: ResumePilot AI 架构团队

---

## 目录

1. [产品功能模块拆分](#1-产品功能模块拆分)
2. [系统架构设计](#2-系统架构设计)
3. [前后端架构图](#3-前后端架构图)
4. [数据流设计](#4-数据流设计)
5. [微服务与单体架构对比](#5-微服务与单体架构对比)
6. [为什么选择NestJS而不是Express](#6-为什么选择nestjs而不是express)
7. [为什么选择PostgreSQL而不是MongoDB](#7-为什么选择postgresql而不是mongodb)
8. [数据库实体设计概览](#8-数据库实体设计概览)
9. [API设计原则](#9-api设计原则)
10. [项目目录结构](#10-项目目录结构)
11. [MVP版本开发路线图](#11-mvp版本开发路线图)
12. [后续可扩展功能](#12-后续可扩展功能)

---

## 1. 产品功能模块拆分

### 1.1 架构总览

ResumePilot AI 平台由 **10个核心模块** 组成，按三层架构组织：

- **输入层 (Ingestion Layer)**: 简历摄入、职位描述处理
- **分析层 (Analysis Layer)**: ATS评分引擎、技能差距分析、AI优化引擎
- **体验层 (Experience Layer)**: 简历编辑器、版本管理、仪表盘、用户账户、导出与分享

### 1.2 模块一: 简历摄入模块 (Resume Ingestion)

| ID | 功能 | 描述 | 优先级 |
|----|------|------|--------|
| 1.1 | PDF简历上传 | 拖拽或文件选择上传 .pdf 简历文件, 限制10MB | P0 |
| 1.2 | DOCX简历上传 | 拖拽或文件选择上传 .docx 简历文件, 限制10MB | P0 |
| 1.3 | 纯文本粘贴 | 无文件候选人的手动文本粘贴入口 | P0 |
| 1.4 | 批量上传 | 同时上传最多5份简历进行对比 | P1 |
| 1.5 | 智能简历解析 | 提取结构化数据: 各部分(概述/经历/教育/技能/证书)、联系方式、日期 | P0 |
| 1.6 | 解析校验UI | 高亮已解析字段供用户审核, 支持内联修正 | P0 |
| 1.7 | OCR回退 | 针对图像型PDF和扫描文档的OCR处理 | P1 |
| 1.8 | 自动检测简历语言 | 识别英文/中文/双语简历并路由到对应解析器 | P1 |
| 1.9 | LinkedIn资料导入 | 粘贴LinkedIn URL以预填简历数据 | P2 |

**用户流程:**

```
首页 → 上传简历 → 解析进度指示器 → 审核解析字段 → 确认/保存 → 仪表盘
                                          ↓
                                   内联修正错误 → 保存
```

**依赖关系:** 依赖用户账户模块(保存解析后的简历); 被ATS评分引擎、AI优化引擎、版本管理器依赖。

### 1.3 模块二: 职位描述处理模块 (Job Description Processing)

| ID | 功能 | 描述 | 优先级 |
|----|------|------|--------|
| 2.1 | JD文本输入 | 自由文本域用于粘贴职位描述 | P0 |
| 2.2 | JD URL导入 | 粘贴职位发布URL以自动抓取JD | P1 |
| 2.3 | JD解析引擎 | 提取: 必备技能、优先技能、资格要求、职责、公司信息、级别 | P0 |
| 2.4 | 多JD比较 | 并排比较最多3个JD以制定定向策略 | P1 |
| 2.5 | JD关键词提取器 | 按频率和隐含重要性提取并加权关键词 | P0 |
| 2.6 | JD类别自动标记 | 按角色类型(SWE/PM/DA等)和行业自动标记JD | P1 |
| 2.7 | JD保存与库 | 保存JD到个人库以便复用 | P1 |

### 1.4 模块三: ATS评分引擎 (ATS Scoring Engine)

| ID | 功能 | 描述 | 优先级 |
|----|------|------|--------|
| 3.1 | 总体ATS兼容性评分 | 0-100分, 附百分位排名 | P0 |
| 3.2 | 关键词匹配评分 | JD关键词在简历中的密度和分布 | P0 |
| 3.3 | 格式/结构评分 | ATS可读性: 无表格/列、标准标题、可解析字体 | P0 |
| 3.4 | 各部分完整性评分 | 所有预期简历部分的存在和质量 | P0 |
| 3.5 | 动作动词密度评分 | 以强力动作动词开头的要点百分比 | P1 |
| 3.6 | 可量化成就评分 | 含指标/数字/百分比的要点百分比 | P1 |
| 3.7 | 评分分解可视化 | 显示评分组成的雷达图或堆叠条形图 | P0 |
| 3.8 | 行业基准对比 | 与同角色/行业同行比较评分 | P1 |
| 3.9 | 实时重新评分 | 用户在编辑器中编辑简历时重新评分 | P0 |

### 1.5 模块四: AI优化引擎 (AI Optimization Engine)

| ID | 功能 | 描述 | 优先级 |
|----|------|------|--------|
| 5.1 | 逐部分重写建议 | 针对每个简历部分的可接受/拒绝AI建议 | P0 |
| 5.2 | 关键词注入 | 在简历中策略性地插入缺失的JD关键词 | P0 |
| 5.3 | 要点增强 | 将弱要点转化为STAR格式的可量化成就 | P0 |
| 5.4 | 三个激进级别 | 保守/中等/激进优化模式 | P1 |
| 5.5 | 生成前后对比 | 并排对比原始版本与优化版本 | P0 |
| 5.6 | 预估评分提升 | 在接受建议前预览ATS评分变化 | P1 |
| 5.7 | LinkedIn导入 | 粘贴LinkedIn URL预填简历数据 | P2 |

### 1.6 模块五: 简历编辑器与模板 (Resume Builder & Templates)

| ID | 功能 | 描述 | 优先级 |
|----|------|------|--------|
| 6.1 | 分块编辑器 | 为每个简历部分提供独立编辑器 | P0 |
| 6.2 | 富文本编辑 | TipTap/Plate编辑器, 支持加粗/斜体/列表 | P1 |
| 6.3 | 模板选择器 | 5+个ATS友好的专业模板(含缩略图预览) | P0 |
| 6.4 | 实时预览 | 用户在编辑器中输入时实时PDF预览 | P1 |
| 6.5 | 拖拽重排 | 拖拽重排各部分顺序 | P1 |
| 6.6 | 拼写/语法检查 | 内联语法和可读性建议 | P2 |

### 1.7 剩余模块概览

| 模块 | 核心功能 | 优先级 |
|------|---------|--------|
| **版本管理器** | 自动版本控制(PUT时创建新版本)、版本间差异对比、无损恢复、活动历史 | P0 |
| **导出与分享** | PDF/DOCX/TXT/JSON导出、预签名URL下载(24h过期)、可分享链接、ATS格式导出 | P0 |
| **仪表盘与历史** | 使用统计、最近分析、评分趋势图、快速操作、全局活动订阅 | P0 |
| **用户账户与设置** | 注册/登录(JWT + 刷新令牌轮换)、Google OAuth、个人资料、偏好设置 | P0 |
| **订阅与计费** | Stripe集成、免费/专业版/企业版、基于积分的AI操作、发票历史 | P1 |

---

## 2. 系统架构设计

### 2.1 C4 — 系统上下文图 (System Context)

```mermaid
C4Context
    title ResumePilot AI — 系统上下文图

    Person(user, "求职者", "上传简历, 接收针对职位描述优化的版本")
    Person(admin, "平台管理员", "管理用户, 监控使用配额, 审核AI质量")

    System(resumepilot, "ResumePilot AI", "AI驱动的简历分析、评分与优化平台")

    System_Ext(openai, "OpenAI API", "GPT-4o用于简历解析、分析和内容生成")
    System_Ext(s3, "S3兼容存储", "简历文件存储、模板资源、生成的PDF")
    System_Ext(email, "邮件服务 (Resend/SES)", "事务邮件、引导流程、通知")
    System_Ext(payment, "支付网关 (Stripe)", "订阅管理和计费")
    System_Ext(linkedin, "LinkedIn API", "用于简历自动填充的资料导入")

    Rel(user, resumepilot, "上传简历、查看分析、导出优化PDF", "HTTPS")
    Rel(admin, resumepilot, "管理平台、审核标记内容", "HTTPS")
    Rel(resumepilot, openai, "发送简历文本+JD进行分析/优化", "HTTPS/JSON")
    Rel(resumepilot, s3, "存储上传的简历、生成的模板、导出", "HTTPS/S3 API")
    Rel(resumepilot, email, "发送验证邮件、通知、营销邮件", "SMTP/API")
    Rel(resumepilot, payment, "处理订阅、发票、支付Webhook", "HTTPS/API")
    Rel(resumepilot, linkedin, "导入资料数据用于简历填充", "OAuth 2.0")

    UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="2")
```

### 2.2 C4 — 容器架构图 (Container Diagram)

```mermaid
C4Container
    title ResumePilot AI — 容器架构图

    Person(user, "求职者", "平台的最终用户")

    System_Boundary(resumepilot, "ResumePilot AI 平台") {
        Container(web, "Web应用", "Next.js 15, React 19, Tailwind CSS", "SPA/SSR前端。仪表盘、简历编辑器、职位匹配UI")
        Container(api, "API网关", "NestJS, TypeScript", "REST + WebSocket API。认证、简历CRUD、AI编排、计费Webhook")
        Container(worker, "后台Worker", "NestJS + BullMQ", "异步作业处理: AI分析、PDF生成、邮件派发")
        ContainerDb(db, "主数据库", "PostgreSQL 16 + pgvector", "用户账户、简历、JD、分析历史、订阅")
        ContainerDb(cache, "缓存层", "Redis 7", "会话存储、速率限制、AI结果缓存、作业队列(BullMQ)")
        ContainerDb(storage, "对象存储", "MinIO / AWS S3", "原始简历文件(PDF/DOCX)、生成的PDF、模板资源")
        ContainerDb(search, "搜索引擎", "Meilisearch", "简历和JD的全文搜索")
    }

    System_Ext(openai, "OpenAI API", "GPT-4o, Embeddings")
    System_Ext(stripe, "Stripe", "支付")
    System_Ext(email_svc, "Resend", "邮件派发")

    Rel(user, web, "使用", "HTTPS")
    Rel(web, api, "REST/WS调用", "JSON — JWT Bearer")
    Rel(api, db, "读写", "TCP — Prisma ORM")
    Rel(api, cache, "读写", "TCP — ioredis")
    Rel(api, storage, "预签名URL, 对象CRUD", "S3 API")
    Rel(api, search, "索引/查询", "HTTP")
    Rel(api, openai, "发送提示词, 接收补全", "HTTPS — 流式")
    Rel(api, stripe, "创建会话, 处理Webhook", "HTTPS")
    Rel(api, email_svc, "派发模板邮件", "HTTP API")
    Rel(worker, db, "更新分析结果", "TCP")
    Rel(worker, cache, "出队作业, 缓存结果", "TCP")
    Rel(worker, storage, "生成并存储PDF", "S3 API")
    Rel(worker, openai, "运行AI分析作业", "HTTPS")

    UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="2")
```

### 2.3 C4 — 组件架构图 (API核心)

```mermaid
C4Component
    title ResumePilot API — 组件架构图

    Container_Boundary(api, "NestJS API Gateway") {
        Component(auth_module, "AuthModule", "NestJS Module", "JWT签发、刷新轮换、OAuth2流程、MFA")
        Component(user_module, "UserModule", "NestJS Module", "个人资料CRUD、引导流程、偏好设置、账户删除")
        Component(resume_module, "ResumeModule", "NestJS Module", "上传、解析、版本控制、ATS评分、导出")
        Component(job_module, "JobModule", "NestJS Module", "JD解析、关键词提取、匹配")
        Component(ai_module, "AIModule", "NestJS Module", "提示词编排、流式、回退、Token计费")
        Component(billing_module, "BillingModule", "NestJS Module", "Stripe集成、套餐、使用计量、发票")
        Component(notification_module, "NotificationModule", "NestJS Module", "邮件+站内+推送通知派发")
        Component(admin_module, "AdminModule", "NestJS Module", "仪表盘、用户管理、系统健康、内容审核")

        Component(mw_auth, "AuthGuard", "Middleware", "验证JWT, 附加User上下文")
        Component(mw_rbac, "RBACGuard", "Middleware", "角色+权限执行")
        Component(mw_rate, "RateLimiter", "Middleware", "按用户/IP的令牌桶速率限制")
        Component(mw_log, "RequestLogger", "Middleware", "带关联ID的结构化JSON日志")
        Component(mw_valid, "ValidationPipe", "Middleware", "对DTO进行Zod模式校验")
    }

    Rel(mw_auth, auth_module, "委托令牌验证给")
    Rel(mw_rbac, auth_module, "从AuthModule解析角色")
    Rel(mw_rate, cache, "在Redis中计数请求", "TCP")

    Rel(resume_module, ai_module, "触发分析管线", "Internal event")
    Rel(job_module, ai_module, "触发匹配管线", "Internal event")
    Rel(billing_module, user_module, "读取配额/套餐", "Internal call")
    Rel(notification_module, user_module, "读取偏好设置", "Internal call")

    UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="2")
```

### 2.4 技术栈总结

| 层级 | 技术 | 选型理由 |
|------|------|---------|
| **前端** | Next.js 15 (App Router) | SSR/SSG/ISR, React Server Components, 内建路由 |
|  | React 19 | UI组件库, 并发渲染特性 |
|  | Tailwind CSS + shadcn/ui | 实用优先的样式系统, 可访问的组件原语 |
|  | TanStack Query v5 | 服务端状态管理, 缓存, 乐观更新 |
|  | Zustand | 认证和UI客户端状态管理 |
|  | React Hook Form + Zod | 前后端共享校验的表单处理 |
| **后端** | NestJS 11 | 模块化、DI驱动的API框架 |
|  | Prisma ORM | 类型安全的ORM, 迁移, 内建pgvector支持 |
|  | BullMQ | Redis支持的作业队列, 用于异步AI处理 |
|  | Zod | 运行时校验(端点输入+AI响应) |
|  | Pino | 结构化JSON日志(生产环境高性能) |
| **数据** | PostgreSQL 16 + pgvector | 关系型数据 + 向量嵌入用于语义搜索 |
|  | Redis 7 | 缓存、会话、队列、速率限制 |
|  | MinIO / AWS S3 | 文件的对象存储 |
|  | Meilisearch | 简历和JD的全文搜索 |
| **AI** | OpenAI GPT-4o / GPT-4o-mini | 文本生成(按套餐分级) |
|  | text-embedding-3-large | 用于匹配的语义嵌入(3072维) |
|  | Vercel AI SDK | 跨提供商的统一流式API |
|  | tiktoken | 精确的Token计数用于成本控制 |
| **DevOps** | Docker + Docker Compose | 本地开发容器化 |
|  | GitHub Actions | 自动化CI/CD管线 |
|  | Traefik / Nginx | 反向代理, TLS终止 |
|  | Prometheus + Grafana | 指标收集和仪表盘 |
|  | Sentry | 错误追踪和性能监控 |
|  | Loki | 日志聚合(兼容Grafana) |

---

## 3. 前后端架构图

### 3.1 前端组件树

```mermaid
graph TD
    subgraph "Next.js 15 App Router"
        RootLayout["RootLayout<br/>(providers, fonts, metadata)"]
        AuthProvider["AuthProvider<br/>(JWT上下文, 刷新拦截器)"]
        ThemeProvider["ThemeProvider<br/>(dark/light/system)"]
        QueryProvider["QueryProvider<br/>(TanStack Query, devtools)"]
        Toaster["Toaster<br/>(Sonner通知)"]

        RootLayout --> AuthProvider
        RootLayout --> ThemeProvider
        RootLayout --> QueryProvider
        RootLayout --> Toaster
    end

    subgraph "页面 (app/ 目录)"
        Landing["/ — LandingPage"]
        Login["/login — LoginPage"]
        Signup["/signup — SignupPage"]
        Dashboard["/dashboard — DashboardLayout"]
        ResumeList["/dashboard/resumes — ResumeListPage"]
        ResumeEditor["/dashboard/resumes/[id] — ResumeEditorPage"]
        ResumeAnalysis["/dashboard/resumes/[id]/analysis — AnalysisPage"]
        JobSearch["/dashboard/jobs — JobSearchPage"]
        JobDetail["/dashboard/jobs/[id] — JobDetailPage"]
        TailoredView["/dashboard/tailored/[id] — TailoredResumePage"]
        Settings["/dashboard/settings — SettingsPage"]
        Billing["/dashboard/billing — BillingPage"]
    end

    subgraph "共享组件"
        Navbar["Navbar<br/>(用户菜单, 积分, 搜索)"]
        Sidebar["Sidebar<br/>(导航, 工作区切换)"]
        ResumeUploader["ResumeUploader<br/>(拖拽, 进度, OCR反馈)"]
        AIScoreBadge["AIScoreBadge<br/>(ATS评分环)"]
        KeywordCloud["KeywordCloud<br/>(匹配/缺失关键词)"]
        DiffViewer["DiffViewer<br/>(原始vs优化并排对比)"]
        TemplateSelector["TemplateSelector<br/>(预览, 应用)"]
        ExportButton["ExportButton<br/>(PDF, DOCX, JSON)"]
        CreditMeter["CreditMeter<br/>(用量条)"]
    end

    Dashboard --> Navbar
    Dashboard --> Sidebar
    ResumeEditor --> ResumeUploader
    ResumeEditor --> AIScoreBadge
    ResumeEditor --> KeywordCloud
    ResumeEditor --> DiffViewer
    ResumeEditor --> TemplateSelector
    ResumeEditor --> ExportButton
    Dashboard --> CreditMeter
    TailoredView --> DiffViewer
    TailoredView --> ExportButton
```

### 3.2 前端路由设计

```mermaid
graph TD
    subgraph "App Router — 路由分组"
        direction TB

        subgraph "Public Routes (marketing)"
            R_LANDING["/ — 落地页 + 等候名单"]
            R_LOGIN["/login"]
            R_SIGNUP["/signup"]
            R_VERIFY["/verify-email?token="]
            R_RESET["/reset-password"]
            R_BLOG["/blog/*"]
            R_LEGAL["/privacy, /terms"]
        end

        subgraph "Protected Routes (auth)"
            R_DASH["/dashboard — 概览, 统计, 快捷操作"]
            R_RESUMES["/dashboard/resumes — 列表, 搜索, 筛选"]
            R_RESUME_ID["/dashboard/resumes/[id] — 编辑器"]
            R_RESUME_ANALYSIS["/dashboard/resumes/[id]/analysis"]
            R_JOBS["/dashboard/jobs — 职位搜索 + 已保存"]
            R_JOB_ID["/dashboard/jobs/[id] — JD详情 + 匹配"]
            R_TAILORED["/dashboard/tailored/[id] — 定制简历"]
            R_SETTINGS["/dashboard/settings — 个人资料, 偏好"]
            R_BILLING["/dashboard/billing — 套餐, 发票"]
        end

        subgraph "Admin Routes (admin role)"
            R_ADMIN["/admin — 平台概览"]
            R_ADMIN_USERS["/admin/users"]
            R_ADMIN_ANALYTICS["/admin/analytics"]
            R_ADMIN_LOGS["/admin/audit-logs"]
        end
    end

    subgraph "Middleware (middleware.ts)"
        MW_AUTH["Auth check — redirect /dashboard/* to /login"]
        MW_REFRESH["Silent refresh — 401 interceptor retries with refresh token"]
        MW_RBAC["Role check — /admin/* requires admin role"]
        MW_ONBOARD["Onboarding — redirect to /onboarding if incomplete"]
        MW_CSRF["CSRF token validation on mutating requests"]
    end

    R_DASH --> MW_AUTH
    R_RESUMES --> MW_AUTH
    R_ADMIN --> MW_RBAC
```

### 3.3 前端状态管理架构

```mermaid
graph LR
    subgraph "状态层"
        ServerState["服务端状态<br/>(TanStack Query v5)"]
        AuthState["认证状态<br/>(Zustand + Persist)"]
        UIState["UI状态<br/>(Zustand)"]
        FormState["表单状态<br/>(React Hook Form + Zod)"]
        RealTimeState["实时状态<br/>(WebSocket via Socket.io-client)"]
    end

    subgraph "服务端状态域"
        ResumesQuery["useResumesQuery"]
        ResumeQuery["useResumeQuery"]
        AnalysisQuery["useAnalysisQuery"]
        JobsQuery["useJobsQuery"]
        TailoredQuery["useTailoredQuery"]
        BillingQuery["useBillingQuery"]
    end

    subgraph "认证状态详情"
        AccessToken["accessToken<br/>(仅内存)"]
        RefreshToken["refreshToken<br/>(httpOnly cookie)"]
        UserProfile["userProfile"]
        Permissions["permissions[]"]
    end

    subgraph "UI状态详情"
        SelectedResume["selectedResumeId"]
        EditorHistory["editorHistoryStack"]
        SidebarCollapsed["sidebarCollapsed"]
        ThemeMode["theme: light | dark | system"]
        ActiveModal["activeModal"]
    end

    ServerState --> ResumesQuery
    ServerState --> ResumeQuery
    ServerState --> AnalysisQuery
    ServerState --> JobsQuery
    ServerState --> TailoredQuery
    ServerState --> BillingQuery

    AuthState --> AccessToken
    AuthState --> RefreshToken
    AuthState --> UserProfile
    AuthState --> Permissions

    UIState --> SelectedResume
    UIState --> EditorHistory
    UIState --> SidebarCollapsed
    UIState --> ThemeMode
    UIState --> ActiveModal
```

**状态管理设计原则:**

- **TanStack Query v5** 管理所有服务端状态。通过 `staleTime: 30s` 和 `gcTime: 5min` 实现自动缓存失效。乐观更新用于即时UI反馈(如接受AI建议)。
- **Zustand** 管理纯客户端状态。认证Store(带 `zustand/middleware/persist`)存储访问令牌(仅内存)和用户资料。UI Store处理侧边栏折叠、主题、活动弹窗等瞬态状态。
- **React Hook Form + Zod** 处理所有表单状态。前后端共享Zod模式(通过`@resumepilot/shared`), 输入时即时校验。
- **Socket.io-client** 维护与NestJS后端的WebSocket连接, 用于AI分析进度的实时更新(AI分析、导出作业状态)。

### 3.4 后端模块结构

```mermaid
graph TD
    subgraph "NestJS Application"
        AppModule["AppModule<br/>(root)"]
        CoreModule["CoreModule<br/>(全局providers)"]
        CommonModule["CommonModule<br/>(共享DTOs, decorators, filters)"]

        AppModule --> CoreModule
        AppModule --> CommonModule
    end

    subgraph "Feature Modules (13个)"
        AuthModule["AuthModule"]
        UserModule["UserModule"]
        ResumeModule["ResumeModule"]
        JobModule["JobModule"]
        AIModule["AIModule"]
        BillingModule["BillingModule"]
        NotificationModule["NotificationModule"]
        AdminModule["AdminModule"]
        SearchModule["SearchModule"]
        ExportModule["ExportModule"]
        WebhookModule["WebhookModule"]
        TemplateModule["TemplateModule"]
        CoverLetterModule["CoverLetterModule"]
    end

    subgraph "Integration Modules (5个)"
        OpenAIModule["OpenAIModule<br/>(GPT client, embeddings, rate limiter)"]
        StorageModule["StorageModule<br/>(S3 client, presigned URLs)"]
        EmailModule["EmailModule<br/>(Resend templates, queue dispatch)"]
        StripeModule["StripeModule<br/>(checkout, portal, webhooks)"]
        MeiliSearchModule["MeiliSearchModule"]
    end

    subgraph "Infrastructure Modules (7个)"
        PrismaModule["PrismaModule<br/>(global DB client)"]
        RedisModule["RedisModule<br/>(ioredis, BullMQ)"]
        ConfigModule["ConfigModule<br/>(Zod-based env validation)"]
        LoggerModule["LoggerModule<br/>(Pino structured logging)"]
        HealthModule["HealthModule<br/>(/health, /ready endpoints)"]
        MetricsModule["MetricsModule<br/>(Prometheus metrics)"]
        QueueModule["QueueModule<br/>(BullMQ processors)"]
    end

    AppModule --> AuthModule
    AppModule --> UserModule
    AppModule --> ResumeModule
    AppModule --> JobModule
    AppModule --> AIModule
    AppModule --> BillingModule
    AppModule --> NotificationModule
    AppModule --> AdminModule
    AppModule --> SearchModule
    AppModule --> ExportModule
    AppModule --> WebhookModule

    AIModule --> OpenAIModule
    ResumeModule --> StorageModule
    ExportModule --> StorageModule
    NotificationModule --> EmailModule
    BillingModule --> StripeModule
    SearchModule --> MeiliSearchModule

    CoreModule --> PrismaModule
    CoreModule --> RedisModule
    CoreModule --> ConfigModule
    CoreModule --> LoggerModule
    CoreModule --> HealthModule
    CoreModule --> MetricsModule
```

### 3.5 后端中间件管道

```mermaid
sequenceDiagram
    participant Client
    participant Nginx
    participant Helmet
    participant CORS
    participant ReqID as RequestId
    participant Logger as LoggerMiddleware
    participant RateLimit as RateLimiter
    participant CSRF as CsrfGuard
    participant Auth as AuthGuard
    participant RBAC as RolesGuard
    participant Validate as ValidationPipe
    participant Controller
    participant Service
    participant DB

    Client->>Nginx: HTTPS Request
    Nginx->>Helmet: Forward (security headers)
    Helmet->>CORS: Apply CORS policy
    CORS->>ReqID: Attach X-Request-Id
    ReqID->>Logger: Log {method, path, ip, userAgent}
    Logger->>RateLimit: Check rate limit (Redis token bucket)

    alt Rate limit exceeded
        RateLimit-->>Client: 429 Too Many Requests
    end

    RateLimit->>CSRF: Verify CSRF token (mutating requests)
    CSRF->>Auth: Extract & validate JWT

    alt Invalid / Expired Token
        Auth-->>Client: 401 Unauthorized
    end

    Auth->>RBAC: Check required roles + permissions

    alt Insufficient permissions
        RBAC-->>Client: 403 Forbidden
    end

    RBAC->>Validate: Validate DTO (Zod schema)

    alt Validation failure
        Validate-->>Client: 422 Unprocessable Entity
    end

    Validate->>Controller: Route to handler
    Controller->>Service: Call service method
    Service->>DB: Query / Mutation
    DB-->>Service: Result
    Service-->>Controller: DTO / Entity
    Controller-->>Client: 200/201 JSON Response

    Note over Controller,Client: ExceptionFilter catches unhandled errors → 500
```

**中间件设计决策:** 该管道遵循NestJS执行顺序 — 全局中间件最先执行, 然后是Guards, 然后是Interceptors, 最后是Pipes。每个层都处理单一关注点, 可以独立进行单元测试。请求生存周期遵循: Helmet(安全头) → CORS(来源检查) → RequestId(追踪UUID) → Logger(结构化日志) → RateLimiter(Redis令牌桶) → CSRF(双重提交Cookie) → AuthGuard(JWT验证) → RolesGuard(基于声明的RBAC) → ValidationPipe(Zod模式) → Controller(路由处理)。

---

## 4. 数据流设计

### 4.1 AI简历分析 — 完整数据流

```mermaid
sequenceDiagram
    participant Client as 浏览器
    participant API as NestJS API
    participant Worker as BullMQ Worker
    participant OpenAI
    participant Cache as Redis
    participant DB as PostgreSQL
    participant S3

    Note over Client,S3: === PHASE 1: 上传 ===

    Client->>API: POST /v1/resumes/parse (multipart/form-data)
    API->>API: 文件验证 (大小≤10MB, 类型: PDF/DOCX/TXT)
    API->>S3: 上传原始文件 (加密)
    API->>DB: INSERT resume (status: pending)
    API->>Client: 201 {resumeId, status: "pending"}

    Note over Client,S3: === PHASE 2: 解析 (异步) ===

    API->>Worker: Enqueue parse job (BullMQ → Redis)
    Worker->>S3: 下载原始文件
    Worker->>Worker: pdf-parse / mammoth 提取原始文本

    alt 无文本 (扫描件PDF)
        Worker->>Worker: Tesseract.js OCR 回退
    end

    Worker->>OpenAI: GPT-4o-mini: 解析为结构化JSON
    OpenAI-->>Worker: {sections, contact, skills, experience, education}
    Worker->>Worker: Zod schema 验证AI响应结构
    Worker->>DB: UPDATE resume (status: parsed, sections: jsonb)
    Worker->>Cache: SET resume:{id}:parsed (TTL: 24h)

    Note over Client,S3: === PHASE 3: ATS分析 ===

    Client->>API: POST /v1/resumes/{id}/analyze {jdId}
    API->>Cache: GET analysis:{resumeId}:{jdId}:v2

    alt 缓存命中 (24h内相同简历+JD)
        Cache-->>API: 缓存的分析结果
        API-->>Client: 200 {result, source: "cache"}
    end

    API->>API: 检查用户配额 (TokenAccountingService)
    API->>Worker: Enqueue analysis job
    Worker->>DB: SELECT resume + job_description
    Worker->>OpenAI: text-embedding-3-large (两份文本)
    OpenAI-->>Worker: 嵌入向量 (3072维)
    Worker->>DB: 存储向量, 计算余弦相似度
    Worker->>OpenAI: GPT-4o: ATS分析 (5个维度)
    OpenAI-->>Worker: 流式分析结果
    Worker->>Worker: Zod schema 验证 + 幻觉检测
    Worker->>DB: INSERT analysis (result: jsonb)
    Worker->>DB: INSERT credit_ledger (扣除)
    Worker->>Cache: SET analysis:{resumeId}:{jdId}:v2 (TTL: 24h)
    Worker->>API: WebSocket emit: "analysis.complete"
    API-->>Client: WS: {type: "analysis.complete", analysisId}

    Note over Client,S3: === PHASE 4: 优化 ===

    Client->>API: POST /v1/resumes/{id}/optimize {jdId, aggressiveness}
    API->>Worker: Enqueue optimization job
    Worker->>API: SSE streaming generation (逐section)
    loop 每个section
        Worker->>OpenAI: GPT-4o: 生成优化内容
        OpenAI-->>Worker: 流式token
        Worker-->>Client: SSE: {section, content_delta}
    end
    Worker->>DB: INSERT optimization_session
    Worker->>DB: INSERT opt_suggestions (逐条建议)
    Worker-->>Client: SSE: {type: "complete", optimizationId}
```

### 4.2 认证数据流 (JWT + 刷新令牌轮换)

```mermaid
sequenceDiagram
    participant Browser
    participant API as NestJS API
    participant Redis
    participant DB as PostgreSQL

    Note over Browser,DB: === 登录流程 ===

    Browser->>API: POST /auth/login {email, password}
    API->>DB: SELECT user WHERE email = ?
    DB-->>API: user + passwordHash
    API->>API: bcrypt.compare(password, hash)

    alt 无效凭证
        API-->>Browser: 401 Invalid credentials
    end

    API->>API: 生成 accessToken (15min, in-memory)
    API->>API: 生成 refreshToken (7d, httpOnly cookie)
    API->>DB: INSERT refresh_token (hash, family, expiry)
    API->>Redis: 缓存 session {userId, roles, permissions} (15min TTL)
    API-->>Browser: {accessToken} + Set-Cookie: refreshToken

    Note over Browser,DB: === 令牌刷新流程 ===

    Browser->>API: POST /auth/refresh — Cookie: refreshToken
    API->>DB: SELECT refresh_token WHERE hash = ?

    alt 令牌过期或已撤销
        API->>DB: UPDATE refresh_token SET revoked = true (整个family)
        API-->>Browser: 401 — redirect to login
    end

    API->>API: 生成新的 accessToken + refreshToken (轮换)
    API->>DB: DELETE old refresh_token
    API->>DB: INSERT new refresh_token (相同family)
    API->>Redis: UPDATE session TTL
    API-->>Browser: {accessToken} + Set-Cookie: new refreshToken
```

### 4.3 支付Webhook数据流 (Stripe集成)

```mermaid
sequenceDiagram
    participant Stripe
    participant API as NestJS API
    participant DB as PostgreSQL
    participant Email as Resend
    participant Cache as Redis

    Stripe->>API: POST /webhooks/stripe (signature header)
    API->>API: Stripe-Signature HMAC-SHA256 验证

    alt 签名不匹配
        API-->>Stripe: 400 Invalid signature
    end

    API->>DB: INSERT webhook_event (idempotency: stripe_event_id)

    alt checkout.session.completed
        API->>DB: UPDATE subscription (status: active)
        API->>DB: INSERT credit_ledger (initial credits)
        API->>Cache: DEL user:{id}:quota (invalidate)
        API->>Email: 发送欢迎邮件
    else invoice.payment_succeeded
        API->>DB: UPDATE subscription period_end + 30d
        API->>DB: INSERT billing_invoice
    else invoice.payment_failed
        API->>DB: UPDATE subscription (status: past_due)
        API->>Email: 发送支付失败通知
    else customer.subscription.deleted
        API->>DB: UPDATE subscription (status: canceled)
        API->>Cache: SET user:{id}:quota → free tier
    end

    API-->>Stripe: 200 OK
```

---

## 5. 微服务与单体架构对比

### 5.1 架构对比矩阵

| 维度 | 模块化单体 (Modular Monolith) | 微服务 (Microservices) |
|------|------------------------------|------------------------|
| **部署复杂度** | 单个部署单元; 一个 `docker compose up` 即可启动 | 每个服务独立部署; 需要Kubernetes或服务网格 |
| **开发速度** | 极快 — 单仓库、单一语言(TS)、共享类型 | 较慢 — 服务间契约、独立管道、多语言协调 |
| **调试/可观测性** | 简单 — 单个进程、单一日志流 | 复杂 — 分布式追踪强制要求(OpenTelemetry) |
| **数据一致性** | 强一致性(PostgreSQL事务) | 最终一致性(Saga编排、发件箱模式) |
| **扩展性** | 垂直扩展(更大的实例) + 水平扩展(多个副本) | 每服务独立水平扩展 |
| **团队扩展** | 最多约20名工程师, 之后模块边界开始模糊 | 支持100+工程师, 团队拥有独立服务 |
| **弹性/故障隔离** | 一个内存泄漏可能影响所有功能 | 服务故障是隔离的(断路器、舱壁) |
| **初始基础设施成本** | 低 — 2-3个容器 + 托管数据库 | 高 — K8s集群、服务网格、消息代理、服务发现 |
| **认知负荷** | 低 — 一个代码库, 一致的内部模式 | 高 — 多个仓库、不同的内部模式、IPC失败模式 |

### 5.2 架构决策: 从模块化单体起步

**ResumePilot AI选择模块化单体作为MVP架构, 并设计了清晰的微服务演进路径。**

#### 选择模块化单体的理由

1. **团队规模适配** — 初始团队3-5名工程师时, 模块化单体提供清晰的领域边界(NestJS模块), 无需分布式系统的运维开销。

2. **开发速度** — 单仓库Turborepo + pnpm workspace提供共享类型(`@resumepilot/shared`)和统一CI/CD。所有功能可以端到端开发, 无需服务间契约。

3. **数据库事务优势** — ATS分析流程跨越多个领域(简历 → JD → 分析 → 积分账本)。模块化单体中PostgreSQL事务确保数据一致性 — 如果AI调用失败, 不会扣除积分。

4. **延迟最小化** — 单体中进程内模块之间的通信是函数调用(微秒级), 而微服务间是网络调用(毫秒级)。对于实时SSE流式分析, 这种延迟差异至关重要。

5. **成本控制** — MVP阶段无需Kubernetes集群、服务网格或分布式追踪基础设施。单个应用容器加托管PostgreSQL/Redis即可满足前1000名用户的需求。

#### 模块化单体中的模块边界

尽管部署为单体, 代码库通过NestJS模块保持微服务级别的边界:

```typescript
// 每个模块只通过明确定义的接口与其他模块通信
@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [ResumeController],
  providers: [ResumeService, ResumeRepository],
  exports: [ResumeService], // 只导出Service, 不导出Repository
})
export class ResumeModule {}
```

**不允许跨模块Repository调用** — AI模块只能通过ResumeService访问简历数据, 不能直接访问ResumeRepository。这强制执行了与物理服务边界相同的契约纪律。

#### 拆分触发器 — 何时提取微服务

| 触发器 | 提取的服务 | 理由 |
|--------|-----------|------|
| AI推理延迟开始阻塞API线程 | **AI Worker Service** (BullMQ后端已设计为独立worker) | 通过Redis队列将AI处理与API解耦 |
| PDF生成在高峰期消耗过多CPU | **PDF Generation Service** (无服务器函数或专用容器) | Puppeteer/Chromium密集型; 扩展与API无关 |
| 邮件发送需要独立速率限制 | **Notification Service** | 与Resend的独立集成; 自带重试策略 |
| 多个租户请求更高的搜索吞吐量 | **Search Indexing Service** (Meilisearch已逻辑分离) | 独立扩展搜索操作而无需扩展整个API |
| 企业客户要求数据驻留 | **Data Processing Service** (按区域) | 特定区域的S3 + DB操作 |

### 5.3 演进架构图

```mermaid
graph LR
    subgraph "Phase 0 — 模块化单体 (MVP)"
        Monolith["NestJS API Gateway<br/>(所有模块在进程中)"]
        Monolith --> DB[(PostgreSQL)]
        Monolith --> Cache[(Redis)]
    end

    subgraph "Phase 1 — 提取后台处理 (V1)"
        API1["NestJS API Gateway<br/>(CRUD, 认证, 计费)"]
        Worker1["BullMQ Worker<br/>(AI分析, PDF生成, 邮件)"]
        API1 --> Queue[Redis Queue]
        Queue --> Worker1
        Worker1 --> DB1[(PostgreSQL)]
    end

    subgraph "Phase 2 — 混合架构 (V2+)"
        API2["NestJS API Gateway"]
        Worker2["AI Worker Service"]
        PDF2["PDF Generation Service<br/>(无服务器/容器)"]
        Notify2["Notification Service"]
        API2 --> MQ[消息代理 (SQS/NATS)]
        MQ --> Worker2
        MQ --> PDF2
        MQ --> Notify2
    end

    Monolith --> API1
    API1 --> API2
```

**关键要点:** 模块化单体并非反对微服务 — 它是一种故意推迟的决策。通过执行模块内契约(不跨Repository调用、通过Service接口通信、事件驱动的模块间通信), 代码库已经为提取做好了准备。基础设施成本和团队规模将决定何时拆分。

---

## 6. 为什么选择NestJS而不是Express

### 6.1 对比总结

| 维度 | NestJS | Express |
|------|--------|---------|
| **架构模式** | 自带装饰器模式的DI容器、模块系统、守卫/拦截器/管道 | 最简HTTP Request → Response中间件管道 |
| **可测试性** | 内建测试模块 — 单行实现服务Mock | 手动实例化 — 需要 `jest.mock()` 或猴子补丁 |
| **团队标准** | 约定优于配置 — 每个模块结构一致 | 完全自由 — 无标准结构 |
| **TypeScript支持** | 原生 — 装饰器、泛型providers、类型安全的请求管道 | 需手动类型化 — @types/express, 自定义req/response类型 |
| **多租户SaaS** | 内置请求作用域(`Scope.REQUEST`), 每个租户实例 | 必须手动实现(自定义中间件 + 工厂) |
| **性能** | 默认Express适配器(~相同吞吐量)。可选Fastify适配器(高30-50%吞吐量) | 原始吞吐量(最小开销) |
| **生态** | 利用完整的Express/Fastify生态。内建OpenAPI、GraphQL、微服务传输 | 最大中间件生态, 但无框架约束 |
| **学习曲线** | 较高 — Angular风格概念(DI、装饰器、模块) | 较低 — 简单函数链 |
| **代码行数** | 给定5个模块, 更多结构文件 — 但每个文件更小、更专注 | 更少文件, 但随着增长每个文件变得更大 |

### 6.2 选择NestJS的核心原因

#### 6.2.1 依赖注入 — 可测试架构的基石

这是选择NestJS的最重要原因。内建的IoC容器使得编写测试变得简单, 且无需任何Mock库:

```typescript
// NestJS — 声明式DI, 测试时一行替换
@Injectable()
export class AnalysisService {
  constructor(
    private readonly openAI: OpenAIService,        // 测试中替换
    private readonly resumeRepo: ResumeRepository,  // 测试中替换
    private readonly tokenAcct: TokenAccountingService,
  ) {}

  async analyzeResume(resumeId: string, jdId: string) {
    const resume = await this.resumeRepo.findById(resumeId);
    return this.openAI.analyze(resume.parsedText);
  }
}

// 测试 — 零Mock开销
const moduleRef = await Test.createTestingModule({
  providers: [
    AnalysisService,
    { provide: OpenAIService, useClass: MockOpenAIService },      // 替换实际API
    { provide: ResumeRepository, useClass: MockResumeRepository }, // 替换DB
    TokenAccountingService,  // 使用实际实现进行集成测试
  ],
}).compile();
```

Express等价实现需要手动装配全部依赖:

```javascript
// Express — 手动装配, 随增长而恶化
const db = new Database(config);
const redis = new Redis(config.redis);
const openAI = new OpenAIService(config.openai);
const resumeRepo = new ResumeRepository(db);
const tokenAcct = new TokenAccountingService(redis);
const analysisService = new AnalysisService(openAI, resumeRepo, tokenAcct);

// 每个路由处理器都需要访问这些实例 — 必须通过闭包或全局变量传递
app.post('/analyze', (req, res) => analysisService.analyze(req.body));
```

当服务增长到50+模块和200+依赖时, 手动装配成为每日都要支付的维护税。NestJS完全消除了它。

#### 6.2.2 请求作用域Provider — 对多租户SaaS至关重要

NestJS支持请求作用域providers, 每个HTTP请求获得独立实例:

```typescript
@Injectable({ scope: Scope.REQUEST })
export class TenantContext {
  tenantId: string;
  constructor(@Inject(REQUEST) private request: Request) {
    this.tenantId = request.headers['x-tenant-id'] as string;
  }
}

// 用于数据隔离 — 所有查询自动限定范围
@Injectable()
export class ResumeRepository {
  constructor(
    private prisma: PrismaService,
    private tenant: TenantContext,
  ) {}

  async findAll() {
    return this.prisma.resume.findMany({
      where: { tenantId: this.tenant.tenantId }, // 永远不跨租户泄漏数据
    });
  }
}
```

Express没有作用域生命周期的概念 — 你必须为每个请求手动传递租户上下文, 增加了跨租户数据泄漏的风险。

#### 6.2.3 模块系统 — 在单体中强制执行边界

每个NestJS模块定义了一个清晰的公共API(通过 `exports` 数组)并封装其内部实现:

```typescript
@Module({
  imports: [PrismaModule, AIModule],
  controllers: [ResumeController],
  providers: [ResumeService, ResumeRepository],
  exports: [ResumeService], // 只有ResumeService公开 — 不公开Repository
})
export class ResumeModule {}
```

其他模块无法直接访问ResumeRepository — 它们必须通过ResumeService。这强制执行了为未来微服务提取所需的相同契约纪律。

#### 6.2.4 守卫/拦截器/管道模式 — 声明式横切关注点

```typescript
@Controller('resumes')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(LoggingInterceptor, CacheInterceptor)
export class ResumeController {
  @Get()
  @Roles('user', 'admin')
  @UsePipes(new ZodValidationPipe(resumeQuerySchema))
  async findAll(@CurrentUser() user: User, @Query() query: ResumeQueryDto) {
    return this.resumeService.findAll(user.id, query);
  }
}
```

每个装饰器声明了横切关注点: 认证(`JwtAuthGuard`)、授权(`RolesGuard`)、日志(`LoggingInterceptor`)、缓存(`CacheInterceptor`)、校验(`ZodValidationPipe`)。控制器代码只处理业务逻辑。在Express中, 这些关注点可能混在路由处理器中, 或分布在中间件函数中, 没有明确的可见性。

### 6.3 性能说明

NestJS默认使用Express适配器。对于ResumePilot, 性能影响可以忽略不计:

- 瓶颈是AI API延迟(3-15秒), 而非框架开销(微秒级)。
- 在AI响应期间, NestJS使用SSE(Server-Sent Events)流式传输, 最小化内存使用。
- 对于需要更高吞吐量的特定端点, NestJS允许通过环境变量切换到Fastify适配器, 无需更改代码:

```bash
# 切换到Fastify以获得30-50%更高吞吐量
NEST_HTTP_ADAPTER=fastify
```

**结论:** 对于像ResumePilot AI这样有50+个领域服务、强测试需求、多租户数据隔离和清晰演进路径到微服务的SaaS产品, NestJS不是一种奢侈 — 它是一种架构必需品。

---

## 7. 为什么选择PostgreSQL而不是MongoDB

### 7.1 对比总结

| 维度 | PostgreSQL 16 | MongoDB |
|------|---------------|---------|
| **数据模型** | 关系型 — 表、行、列, 具有强制模式 | 文档 — BSON文档, 集合, 灵活模式 |
| **Schema** | 编译时(Prisma) + 运行时(NOT NULL, CHECK, FOREIGN KEY) | 灵活 — 可选验证(Mongoose schema, JSON Schema) |
| **查询语言** | SQL — 标准化, 声明式, 强大的JOIN和聚合 | MQL — 专有, 嵌套文档的丰富查询 |
| **ACID事务** | 内建 — SERIALIZABLE隔离级别, 跨多表事务 | 多文档事务(4.0+) — 有性能开销 |
| **向量搜索** | pgvector扩展 — 同一查询中的`<=>`操作符 + SQL | Atlas Vector Search — 独立服务, 非核心DB部分 |
| **扩展** | 垂直(更大的实例), 水平(读取副本, Citus用于分片) | 原生水平(分片), 副本集 |
| **全文搜索** | `tsvector` + GIN索引 — 够用但功能有限 | Atlas Search (Lucene) — 强大但独立服务 |
| **JSON支持** | `JSONB` — 索引、部分更新、二进制存储、快速查询 | 原生BSON — 存储和索引针对嵌套文档优化 |
| **生态** | Prisma、Drizzle ORM、TypeORM、Knex — 成熟的TS生态 | Mongoose(事实标准ODM) — 成熟但有自身复杂性 |
| **托管选项** | AWS RDS、GCP Cloud SQL、Supabase、Neon(无服务器) | MongoDB Atlas、自托管 |
| **许可** | PostgreSQL许可(MIT风格) | SSPL(服务端公共许可) — 对SaaS有争议 |

### 7.2 选择PostgreSQL的核心原因

#### 7.2.1 简历数据本质上是关系型的

简历包含明确的关系:

- 用户 **拥有** 简历 (1:N)
- 简历 **包含** 工作经历 (1:N)
- 简历 **列出** 技能 (1:N)
- 简历 **被评分** 在不同JD上 (N:M 通过ATS分析)
- 简历 **被优化** 为定制版本 (1:N)

这些关系通过 JOIN、外键和参照完整性来自然地建模 — 这些都是PostgreSQL擅长的。在MongoDB中, 通过嵌入或引用对同一份数据建模时, 决策("这份经历应该嵌入在简历文档中, 还是放在单独的集合中?")会对查询性能和一致性产生持久影响。

```sql
-- 获取一份简历及所有相关数据 — 一次优化的查询
SELECT r.*,
       json_agg(DISTINCT re.*) as experience,
       json_agg(DISTINCT rs.skill_name) as skills,
       json_agg(DISTINCT a.*) as analyses
FROM resumes r
LEFT JOIN resume_experiences re ON r.id = re.resume_id
LEFT JOIN resume_skills rs ON r.id = rs.resume_id
LEFT JOIN analyses a ON r.id = a.resume_id
WHERE r.id = $1
GROUP BY r.id;
```

#### 7.2.2 单一数据库, 双用途 — OLTP + 向量搜索

pgvector将向量搜索功能直接引入PostgreSQL。ResumePilot使用此功能进行简历与JD的语义匹配:

```sql
-- 在单个查询中: 结合关系筛选 + 向量相似度 + 关键字匹配
SELECT r.id, r.title,
       1 - (r.embedding <=> $1) AS similarity,  -- 余弦相似度
       ts_rank(r.search_vector, to_tsquery('english', $2)) AS keyword_rank
FROM resumes r
WHERE r.user_id = $3
  AND r.is_archived = false
  AND 1 - (r.embedding <=> $1) > 0.7  -- 仅 > 70% 相似度匹配
ORDER BY similarity DESC
LIMIT 10;
```

这结合了:
- **关系筛选** (user_id, is_archived)
- **向量相似度** (embedding <=> query_embedding)
- **全文搜索** (ts_rank, 用于关键词密度)

在MongoDB中, 实现相同功能需要Atlas Vector Search(独立服务, 独立计费)和Atlas Search。数据在两种不同的索引管道中, 无法在单个原子查询中组合。

#### 7.2.3 刚性Schema作为安全网

简历数据的完整性至关重要 — 解析错误可能意味着错失工作机会。PostgreSQL的刚性Schema在插入时强制执行:

- `email VARCHAR(320) NOT NULL UNIQUE` — 防止重复注册
- `ats_score INTEGER CHECK (ats_score >= 0 AND ats_score <= 100)` — 防止无效评分
- `parse_status VARCHAR(20) CHECK (parse_status IN ('pending','parsing','parsed','parse_failed'))` — 只允许有效状态
- `FOREIGN KEY (user_id) REFERENCES identity.users(id) ON DELETE CASCADE` — 确保参照完整性

这些约束在数据库层面捕获错误, 提供比仅依赖应用层验证更强的保障。在MongoDB中, 你需要实现Mongoose中间件或数据库触发器(Change Streams)来实现等效的约束 — 增加更多故障点。

#### 7.2.4 JSONB用于灵活元数据

虽然核心实体是关系型的, 但简历的**内部**结构是半结构化的(不同行业有不同的部分, 不同的格式)。PostgreSQL的JSONB列完美地处理了这一点:

```sql
-- 存储灵活的简历部分, 同时保持引用完整性
CREATE TABLE resume.resumes (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES identity.users(id),
  title VARCHAR(300) NOT NULL,
  sections JSONB NOT NULL,  -- 半结构化: {contact:{}, summary:{}, experience:[], ...}
  metadata JSONB,           -- 灵活元数据: {ats_score: 87, word_count: 548, ...}
  ...
);

-- 在JSONB上高效查询 — 使用GIN索引
CREATE INDEX idx_resume_sections ON resume.resumes USING GIN (sections jsonb_path_ops);

-- 跨所有简历查找特定技能
SELECT id, title
FROM resume.resumes
WHERE sections @> '{"skills": {"languages": ["TypeScript"]}}';
```

这提供了关系型数据库中两全其美的优势: 核心实体之间的外键强制执行数据完整性, 而JSONB提供需要灵活Schema的部分内部存储。

#### 7.2.5 Prisma ORM — TypeScript开发者体验

Prisma的PostgreSQL集成是同类中最好的。它与pgvector原生集成, 并生成完全类型化的查询构建器:

```typescript
const resume = await prisma.resume.findUnique({
  where: { id },
  include: {
    sections: true,
    skills: true,
    experiences: { orderBy: { startDate: 'desc' } },
    analyses: { orderBy: { createdAt: 'desc' }, take: 5 },
  },
});
// resume 是完全类型化的 — 推断为 Resumes & { sections: ResumeSection[], ... }
```

对于MongoDB, Prisma支持仍在成熟中(截至2025年)。Mongoose是MongoDB成熟度最高的选项, 但失去了Prisma的类型安全和Schema管理功能。

#### 7.2.6 事务优势 — AI管线的一致性

ATS分析管线跨越多个表(简历、JD、分析、积分账本)。PostgreSQL的事务边界确保这些操作原子性地成功或回滚:

```typescript
await this.prisma.$transaction(async (tx) => {
  await tx.analysis.create({ data: analysisData });
  await tx.creditLedger.create({
    data: { userId, amount: -2, action: 'analysis', reference: analysisId },
  });
  await tx.usageLog.create({
    data: { userId, endpoint: '/analyze', tokensUsed, costCents },
  });
});
```

如果三个写操作中的任何一个失败(例如积分扣除违反CHECK约束), 则整个事务回滚 — 不会留下孤立的分析记录或重复的积分扣除。

**结论:** PostgreSQL对于像ResumePilot AI这样的SaaS来说是正确的选择, 因为它同时提供了数据完整性(关系型+约束)、灵活性(JSONB)、向量搜索(pgvector)和开发者体验(Prisma)。对于每个维度都选择最佳工具并不增加运维复杂性 — 一个数据库即可满足所有需求。

---

## 8. 数据库实体设计概览

### 8.1 实体关系图 (ERD)

```mermaid
erDiagram
    User {
        uuid id PK
        varchar email UK
        varchar passwordHash
        varchar fullName
        varchar avatarUrl
        jsonb preferences
        varchar onboardingStep
        timestamptz emailVerifiedAt
        varchar role "user|admin|superadmin"
        boolean isActive
        timestamptz lastLoginAt
        timestamptz createdAt
        timestamptz updatedAt
    }

    RefreshToken {
        uuid id PK
        uuid userId FK
        varchar tokenHash UK
        varchar family
        timestamptz expiresAt
        boolean isRevoked
        timestamptz createdAt
    }

    Resume {
        uuid id PK
        uuid userId FK
        varchar title
        varchar originalFileName
        varchar s3Key
        text parsedText
        jsonb sections "contact, summary, experience, education, skills"
        vector embedding "3072维"
        jsonb atsScore
        int version
        boolean isArchived
        varchar parseStatus "pending|parsing|parsed|parse_failed"
        varchar source "upload|manual|linkedin_import"
        timestamptz createdAt
        timestamptz updatedAt
    }

    ResumeVersion {
        uuid id PK
        uuid resumeId FK
        int versionNumber
        jsonb snapshot "完整简历快照"
        varchar changeSummary
        jsonb changes
        int atsScore
        timestamptz createdAt
    }

    JobDescription {
        uuid id PK
        uuid userId FK
        varchar title
        varchar company
        varchar location
        text rawText
        jsonb parsedSections "requirements, responsibilities, qualifications"
        jsonb extractedKeywords
        vector embedding "3072维"
        varchar sourceUrl
        varchar source "manual|url|linkedin"
        varchar status
        timestamptz createdAt
        timestamptz updatedAt
    }

    Analysis {
        uuid id PK
        uuid resumeId FK
        uuid jobDescriptionId FK
        uuid userId FK
        varchar type "ats_score|skill_gap|full_analysis"
        jsonb result "详细分析结果JSON"
        int tokensUsed
        int costCents
        varchar modelUsed
        varchar status "queued|processing|complete|failed"
        text errorMessage
        timestamptz createdAt
        timestamptz completedAt
    }

    AtsScoreDetail {
        uuid id PK
        uuid analysisId FK
        varchar category "keyword_match|format|completeness|readability|achievements"
        int score
        jsonb details
    }

    OptimizationSession {
        uuid id PK
        uuid resumeId FK
        uuid jobDescriptionId FK
        uuid userId FK
        varchar aggressiveness "conservative|moderate|aggressive"
        jsonb changes "逐条建议列表"
        jsonb estimatedImprovement
        boolean isApplied
        timestamptz createdAt
    }

    TailoredResume {
        uuid id PK
        uuid sourceResumeId FK
        uuid jobDescriptionId FK
        uuid userId FK
        jsonb optimizedSections
        jsonb changesSummary
        jsonb matchScore
        varchar s3Key
        varchar status "draft|reviewed|exported"
        timestamptz createdAt
    }

    Subscription {
        uuid id PK
        uuid userId FK
        varchar stripeCustomerId
        varchar stripeSubscriptionId
        varchar planTier "free|pro|enterprise"
        varchar status "active|past_due|canceled|trialing"
        timestamptz currentPeriodStart
        timestamptz currentPeriodEnd
        timestamptz canceledAt
        timestamptz createdAt
        timestamptz updatedAt
    }

    CreditLedger {
        uuid id PK
        uuid userId FK
        int amount
        varchar action "analysis|optimization|export|purchase|refund"
        varchar reference
        int balanceAfter
        timestamptz createdAt
    }

    ApiKey {
        uuid id PK
        uuid userId FK
        varchar keyHash UK
        varchar keyPrefix
        varchar name
        text[] scopes
        timestamptz lastUsedAt
        timestamptz expiresAt
        timestamptz revokedAt
        timestamptz createdAt
    }

    AuditLog {
        uuid id PK
        uuid userId FK "可为null(匿名操作)"
        varchar action
        varchar resourceType
        varchar resourceId
        jsonb metadata
        inet ipAddress
        varchar userAgent
        timestamptz createdAt
    }

    WebhookSubscription {
        uuid id PK
        uuid userId FK
        varchar url
        varchar[] events
        varchar secretHash
        varchar description
        boolean isActive
        timestamptz createdAt
        timestamptz updatedAt
    }

    CoverLetter {
        uuid id PK
        uuid userId FK
        uuid resumeId FK
        uuid jobDescriptionId FK
        varchar title
        text content
        jsonb metadata
        timestamptz createdAt
        timestamptz updatedAt
    }

    User ||--o{ Resume : "拥有"
    User ||--o{ JobDescription : "上传"
    User ||--o{ Analysis : "运行"
    User ||--o{ OptimizationSession : "创建"
    User ||--o{ TailoredResume : "生成"
    User ||--o{ Subscription : "订阅"
    User ||--o{ CreditLedger : "消耗"
    User ||--o{ RefreshToken : "认证"
    User ||--o{ ApiKey : "拥有"
    User ||--o{ AuditLog : "生成"
    User ||--o{ WebhookSubscription : "注册"
    User ||--o{ CoverLetter : "创建"

    Resume ||--o{ ResumeVersion : "版本化"
    Resume ||--o{ Analysis : "被评分"
    Resume ||--o{ OptimizationSession : "被优化"
    Resume ||--o{ TailoredResume : "来源"

    JobDescription ||--o{ Analysis : "用于分析"
    JobDescription ||--o{ OptimizationSession : "驱动优化"
    JobDescription ||--o{ TailoredResume : "目标"

    Analysis ||--o{ AtsScoreDetail : "分解"

    Resume ||--o{ CoverLetter : "引用"
    JobDescription ||--o{ CoverLetter : "引用"
```

### 8.2 Schema设计要点

#### 8.2.1 UUID主键 — 无信息泄漏

所有表使用 `UUID` (通过 `gen_random_uuid()`) 作为主键。这防止了:
- 攻击者通过递增ID枚举资源
- 前端需要暴露数据库内部ID
- 跨环境的数据合并冲突

#### 8.2.2 软删除 — GDPR合规

关键用户数据(简历、JD、分析)实现30天宽限期的软删除:

```sql
ALTER TABLE resume.resumes ADD COLUMN deleted_at TIMESTAMPTZ;
CREATE INDEX idx_resumes_active ON resume.resumes (user_id, created_at DESC)
    WHERE deleted_at IS NULL;  -- 部分索引, 省略已删除数据
```

#### 8.2.3 JSONB + 关系型的混合方法

每个实体都有关系型列用于查询和索引, 以及JSONB列用于灵活的内部结构:

| 实体 | 关系型列 | JSONB列 |
|------|---------|---------|
| Resume | id, userId, title, file_name, atsScore | sections, metadata, keywords |
| JobDescription | id, userId, title, company, rawText | parsedSections, extractedKeywords |
| Analysis | id, resumeId, jdId, type, tokensUsed, costCents | result |

这样可以实现针对关系型列的索引优化查询(`WHERE user_id = ? ORDER BY created_at DESC`), 同时JSONB中的半结构化内容保持灵活性。

#### 8.2.4 pgvector嵌入

简历和JD实体都包含一个 `embedding vector(1536)` 列(针对OpenAI的 `text-embedding-3-small`)用于语义相似度搜索。查询:

```sql
SELECT id, title,
       1 - (embedding <=> $query_embedding) AS similarity
FROM resume.resumes
WHERE user_id = $user_id
  AND 1 - (embedding <=> $query_embedding) > 0.6
ORDER BY similarity DESC
LIMIT 10;
```

`<=>` 是pgvector的余弦距离算子。IVFFlat索引支持近似最近邻(ANN)搜索, 实现了对10万+简历的亚秒级查询。

---

## 9. API设计原则

### 9.1 RESTful约定

| 原则 | 规则 |
|------|------|
| **资源命名** | 复数名词, 多词资源用kebab-case (`/resume-versions`, `/job-descriptions`) |
| **HTTP方法** | `GET`(读取), `POST`(创建), `PUT`(完整替换), `PATCH`(部分更新), `DELETE`(删除) |
| **幂等性** | `GET`, `PUT`, `DELETE` 是幂等的。`POST`不是。对需要重试安全的变更型`POST`请求使用幂等键。 |
| **无状态** | 每个请求携带自己的认证上下文(无服务端会话)。 |
| **HATEOAS** | 响应包含带有相关资源URL的 `_links` 对象。对内部消费者非强制, 但在面向公众的响应中存在。 |
| **内容协商** | `Accept` / `Content-Type` 头。JSON是唯一支持格式(`application/json`)。 |
| **压缩** | 支持 `gzip`, `br` (Brotli)。客户端通过 `Accept-Encoding` 发出信号。 |

### 9.2 版本控制策略

**URL路径版本控制** (选择优先于基于头的版本控制, 原因是可发现性和简洁性):

```
https://api.resumepilot.ai/v1/resumes
https://api.resumepilot.ai/v2/resumes   (未来)
```

**理由:** URL版本控制使API版本在日志、cURL命令和浏览器开发者工具中立即可见。它防止了负载均衡环境中可能出现头剥离导致意外版本不匹配的问题。

**废弃政策:** 新主版本发布后, 旧版本支持12个月。废弃版本返回 `Sunset` HTTP头:

```
Sunset: Sat, 01 Jan 2027 00:00:00 GMT
```

### 9.3 认证与授权

**JWT双令牌模式:**
- **访问令牌:** 15分钟到期, RS256签名, 通过 `Authorization: Bearer <token>` 传递
- **刷新令牌:** 30天到期, 不透明字符串(数据库哈希), httpOnly/Secure/SameSite=Strict cookie
- **令牌轮换:** 每次刷新使前一个刷新令牌失效(检测被盗令牌 — 如果被盗令牌被重放, 整个家族被撤销)

**API密钥认证** (用于程序化/简历解析管道):
- `X-API-Key: rp_<random_32_chars>` 头
- 范围为单个用户或团队
- 每个密钥可配置IP允许列表
- 速率限制基于每个密钥

### 9.4 标准响应格式

**成功响应:**
```json
{
  "data": { ... },
  "meta": {
    "requestId": "req_a1b2c3d4",
    "timestamp": "2026-06-16T12:00:00Z"
  },
  "_links": {
    "self": "/v1/resumes/res_8a7b6c5d",
    "versions": "/v1/resumes/res_8a7b6c5d/versions"
  }
}
```

**错误响应:**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "请求包含无效参数。",
    "request_id": "req_a1b2c3d4e5f6",
    "timestamp": "2026-06-16T12:00:00Z",
    "details": [
      {
        "field": "email",
        "code": "invalid_format",
        "message": "必须为有效邮箱地址"
      }
    ],
    "documentation_url": "https://docs.resumepilot.ai/errors#VALIDATION_ERROR"
  }
}
```

### 9.5 错误码参考

| 错误码 | HTTP状态 | 描述 |
|--------|---------|------|
| `VALIDATION_ERROR` | 400 | 输入验证失败 |
| `AUTHENTICATION_REQUIRED` | 401 | 无有效凭证 |
| `INVALID_TOKEN` | 401 | JWT过期或格式错误 |
| `INSUFFICIENT_PERMISSIONS` | 403 | 范围/角色不足 |
| `RESOURCE_NOT_FOUND` | 404 | ID不存在 |
| `EMAIL_ALREADY_EXISTS` | 409 | 重复注册 |
| `PLAN_LIMIT_REACHED` | 403 | 免费套餐限制超限 |
| `FILE_TOO_LARGE` | 413 | 上传超过最大大小 |
| `UNSUPPORTED_FILE_FORMAT` | 415 | 不支持的文件类型 |
| `PARSE_FAILED` | 422 | 简历解析失败 |
| `ANALYSIS_FAILED` | 422 | AI分析无法完成 |
| `RATE_LIMIT_EXCEEDED` | 429 | 请求过多 |
| `AI_SERVICE_UNAVAILABLE` | 502 | AI提供商故障 |
| `MAINTENANCE_MODE` | 503 | 计划维护中 |

### 9.6 速率限制设计

实现方式: Redis有序集(滑动窗口), 毫秒精度时间戳。

| 套餐 | Auth端点 | 读取端点 | 写入端点 | AI/分析端点 | 解析/上传 |
|------|---------|---------|---------|------------|----------|
| Free | 10/min | 60/min | 20/min | 5/min | 5/min |
| Pro | 30/min | 300/min | 100/min | 30/min | 20/min |
| Enterprise | 100/min | 1000/min | 500/min | 100/min | 100/min |

**信用额度消耗 (AI操作):**

| 操作 | 消耗信用 |
|-----------|---------|
| 解析简历 | 1 |
| ATS分析 | 2 |
| 技能差距分析 | 2 |
| AI优化 | 3 |
| 定制简历 | 5 |
| 生成求职信 | 2 |
| 导出(PDF) | 0 (免费) |

速率限制头返回在每个响应中:
```
X-RateLimit-Limit: 300
X-RateLimit-Remaining: 287
X-RateLimit-Reset: 1686921660
Retry-After: 42
```

### 9.7 完整端点索引 (75+端点)

```
# 认证
POST   /v1/auth/register
POST   /v1/auth/login
POST   /v1/auth/refresh
POST   /v1/auth/logout
POST   /v1/auth/forgot-password
POST   /v1/auth/reset-password
POST   /v1/auth/verify-email

# 用户
GET    /v1/users/me
PATCH  /v1/users/me
PUT    /v1/users/me/password
POST   /v1/users/me/avatar
DELETE /v1/users/me
GET    /v1/users/me/api-keys
POST   /v1/users/me/api-keys
DELETE /v1/users/me/api-keys/{key_id}

# 简历
GET    /v1/resumes
POST   /v1/resumes
GET    /v1/resumes/{resume_id}
PUT    /v1/resumes/{resume_id}
PATCH  /v1/resumes/{resume_id}
DELETE /v1/resumes/{resume_id}
POST   /v1/resumes/{resume_id}/duplicate
GET    /v1/resumes/{resume_id}/export
POST   /v1/resumes/compare

# 简历解析
POST   /v1/resumes/parse
POST   /v1/resumes/parse/url
POST   /v1/resumes/parse/linkedin
GET    /v1/resumes/{resume_id}/parse-status
GET    /v1/resumes/parse/supported-formats

# 职位描述
GET    /v1/job-descriptions
POST   /v1/job-descriptions
POST   /v1/job-descriptions/parse
GET    /v1/job-descriptions/{jd_id}
PUT    /v1/job-descriptions/{jd_id}
PATCH  /v1/job-descriptions/{jd_id}
DELETE /v1/job-descriptions/{jd_id}
GET    /v1/job-descriptions/{jd_id}/match

# 分析
POST   /v1/resumes/{resume_id}/analyze
GET    /v1/analyses/{analysis_id}
POST   /v1/analyses/skill-gap
POST   /v1/analyses/bulk
GET    /v1/analyses/batches/{batch_id}

# 优化
POST   /v1/resumes/{resume_id}/optimize
POST   /v1/resumes/{resume_id}/optimize/{optimization_id}/apply

# 定制
POST   /v1/resumes/{resume_id}/tailor

# 版本
GET    /v1/resumes/{resume_id}/versions
GET    /v1/resumes/{resume_id}/versions/{version_id}
GET    /v1/resumes/{resume_id}/versions/{version_id}/diff
POST   /v1/resumes/{resume_id}/versions/{version_id}/restore

# 历史
GET    /v1/resumes/{resume_id}/history
GET    /v1/history

# 模板
GET    /v1/templates
GET    /v1/templates/{template_id}
GET    /v1/templates/{template_id}/preview

# 求职信
GET    /v1/cover-letters
POST   /v1/cover-letters/generate
GET    /v1/cover-letters/{cl_id}
PUT    /v1/cover-letters/{cl_id}
PATCH  /v1/cover-letters/{cl_id}
DELETE /v1/cover-letters/{cl_id}
GET    /v1/cover-letters/{cl_id}/export

# 套餐和计费
GET    /v1/plans
GET    /v1/subscriptions/me
POST   /v1/subscriptions
POST   /v1/subscriptions/me/cancel
GET    /v1/payment-methods
POST   /v1/payment-methods
DELETE /v1/payment-methods/{pm_id}
GET    /v1/billing/invoices
GET    /v1/usage

# Webhooks
POST   /v1/webhooks
GET    /v1/webhooks
GET    /v1/webhooks/{webhook_id}
PATCH  /v1/webhooks/{webhook_id}
DELETE /v1/webhooks/{webhook_id}
GET    /v1/webhooks/{webhook_id}/deliveries
POST   /v1/webhooks/{webhook_id}/deliveries/{delivery_id}/retry

# 健康
GET    /v1/health
GET    /v1/health/detailed
GET    /v1/openapi.json

# 管理员
GET    /v1/admin/stats
GET    /v1/admin/users
GET    /v1/admin/users/{user_id}
POST   /v1/admin/users/{user_id}/suspend
POST   /v1/admin/users/{user_id}/unsuspend
POST   /v1/admin/users/{user_id}/impersonate
GET    /v1/admin/config
PUT    /v1/admin/config
GET    /v1/admin/audit-logs
```

---

## 10. 项目目录结构

### 10.1 单体仓库顶层结构

```
resumepilot/
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                    # PR检查 (lint, typecheck, test)
│   │   ├── cd-staging.yml            # 部署到staging
│   │   └── cd-production.yml         # 部署到production
│   ├── dependabot.yml
│   └── PULL_REQUEST_TEMPLATE.md
│
├── apps/
│   ├── web/                          # Next.js 15 前端
│   │   ├── public/
│   │   ├── src/
│   │   │   ├── app/                  # App Router
│   │   │   ├── components/           # UI组件
│   │   │   ├── hooks/                # React Query hooks
│   │   │   ├── services/             # API客户端服务
│   │   │   ├── stores/               # Zustand stores
│   │   │   ├── lib/                  # 工具函数
│   │   │   └── styles/               # CSS
│   │   ├── tailwind.config.ts
│   │   ├── next.config.ts
│   │   └── package.json
│   │
│   └── api/                          # NestJS 后端
│       ├── src/
│       │   ├── main.ts
│       │   ├── app.module.ts
│       │   ├── common/               # 横切关注点
│       │   ├── config/               # 配置
│       │   ├── modules/              # 特性模块
│       │   │   ├── auth/
│       │   │   ├── users/
│       │   │   ├── resumes/
│       │   │   ├── jobs/
│       │   │   ├── analysis/
│       │   │   ├── ai/
│       │   │   ├── billing/
│       │   │   ├── notification/
│       │   │   ├── admin/
│       │   │   ├── templates/
│       │   │   ├── cover-letters/
│       │   │   └── health/
│       │   ├── database/
│       │   └── queue/
│       ├── test/
│       └── package.json
│
├── packages/
│   └── shared/                       # @resumepilot/shared
│       ├── src/
│       │   ├── types/                # 共享TypeScript类型
│       │   ├── enums/                # 共享枚举
│       │   ├── constants/            # 限制、错误码
│       │   ├── validators/           # Zod schema
│       │   └── utils/                # 纯函数工具
│       └── package.json
│
├── docker/
│   ├── docker-compose.yml
│   ├── docker-compose.dev.yml
│   ├── docker-compose.prod.yml
│   ├── Dockerfile.web
│   ├── Dockerfile.api
│   └── nginx/
│       └── nginx.conf
│
├── scripts/
│   ├── setup.sh
│   ├── dev.sh
│   └── db-migrate.sh
│
├── turbo.json                        # Turborepo pipeline
├── pnpm-workspace.yaml               # pnpm workspace definition
├── tsconfig.base.json                # 共享TS配置
├── .eslintrc.js
├── .prettierrc
├── commitlint.config.js
├── .nvmrc
├── package.json                      # 根workspace
├── README.md
└── LICENSE
```

### 10.2 后端模块结构 (每个特性的标准模块结构)

```
modules/<feature>/
├── <feature>.module.ts        # NestJS模块定义
├── <feature>.controller.ts   # 路由处理器 (薄层 — 委托给service)
├── <feature>.service.ts      # 业务逻辑
├── <feature>.repository.ts   # 数据访问层 (Prisma查询)
├── schemas/
│   └── <entity>.schema.ts    # Zod运行时验证schema
└── dto/
    ├── create-<feature>.dto.ts
    ├── update-<feature>.dto.ts
    └── query-<feature>.dto.ts
```

### 10.3 命名规范

| 规则 | 示例 |
|------|------|
| 目录: **kebab-case** | `resume-editor/`, `job-description-parser.tsx` |
| 组件文件: **kebab-case** | `ats-score-badge.tsx`, `match-score.tsx` |
| Hook文件: `use-` 前缀, **kebab-case** | `use-resumes.ts`, `use-debounce.ts` |
| Service文件: `<domain>.service.ts` | `resumes.service.ts` |
| DTO文件: `<action>-<entity>.dto.ts` | `create-resume.dto.ts` |
| Schema文件: `<entity>.schema.ts` | `resume.schema.ts` |
| 数据库表: **snake_case** 复数 | `resumes`, `job_descriptions` |
| 组件: **PascalCase** | `ResumeEditor`, `AtsScoreBadge` |
| 环境变量: **SCREAMING_SNAKE_CASE** | `DATABASE_URL`, `JWT_SECRET` |

### 10.4 文件组织原则

1. **就近原则而非分类** — 将经常一起修改的文件放在一起。特性的组件、hooks和类型放在同一目录, 而非顶层 `components/`、`hooks/`、`types/` 文件夹。
2. **每个边界使用桶导出** — 每个被外部导入的目录都有 `index.ts`, 重新导出其公共API。
3. **DTO是契约** — NestJS控制器的请求/响应形状定义在 `dto/` 中, 并与共享类型镜像。
4. **一个模块, 一个职责** — 一个NestJS模块拥有且仅拥有一个领域聚合。如果模块增长超过7-10个文件, 拆分它或提取子模块。
5. **瘦控制器, 胖服务** — 控制器仅处理HTTP关注点(解析参数, 调用服务, 映射到响应DTO)。业务逻辑存在于服务中。数据访问存在于仓库中。
6. **环境无关配置** — 所有配置值通过 `apps/api/src/config/configuration.ts` 读取, 该文件在启动时验证环境变量并导出类型化配置对象。决不在 `config/` 之外直接读取 `process.env`。

---

## 11. MVP版本开发路线图

### 11.1 Phase 0 — MVP (第1-8周)

**目标:** 发布一个最小可用产品, 展示核心价值: 上传简历、粘贴职位描述、接收ATS评分和基础建议、下载优化后的简历。

| 功能 | 范围 | 工作量估算 |
|------|------|-----------|
| 用户注册/登录 | 邮箱/密码 + Google OAuth | 1周 |
| 简历上传 | PDF、DOCX; 10MB限制; 单文件 | 1周 |
| JD输入 | 自由文本粘贴; 最大5000字符 | 0.5周 |
| AI分析 | ATS兼容性评分(0-100), 关键词匹配%, 格式问题标记 | 2周 |
| 优化输出 | AI改写简历含关键词注入, 可下载PDF | 1.5周 |
| 历史仪表盘 | 过往分析列表, 含日期、JD标题、ATS评分; 点击回顾 | 1周 |
| 基础个人资料 | 姓名、邮箱、账户设置(修改密码、删除账户) | 0.5周 |
| 落地页 | 营销页面含注册和登录CTAs | 0.5周 |

**总工作量: 8周**

**MVP技术栈 (简化版):**
- 前端: Next.js 15 (App Router) + Tailwind CSS + shadcn/ui
- 后端: NestJS API (单体部署)
- 数据库: PostgreSQL 16 (Supabase / Neon)
- 认证: JWT + bcrypt (自定义), Google OAuth
- AI: OpenAI GPT-4o-mini (MVP期间成本高效)
- 文件解析: pdf-parse + mammoth (DOCX)
- PDF生成: Puppeteer/Playwright渲染
- 托管: Vercel (前端+API), Supabase/Neon (DB)
- 存储: Cloudflare R2 (S3兼容)
- 监控: Sentry (错误), PostHog (分析)

### 11.2 Phase 1 — V1 (第9-20周, ~3个月)

| 功能 | 范围 |
|------|------|
| 多格式JD输入 | URL粘贴(自动爬取)、LinkedIn职位链接、文件上传 |
| 高级AI分析 | 分部分反馈(概述、经历、技能、教育); 语法/风格检查; 可量化影响检测 |
| 多简历管理 | 每个用户保存多份简历; 比较分析 |
| ATS模拟 | 针对真实ATS引擎模拟(解析Lever、Greenhouse、Workday的解析模式) |
| 求职信生成 | AI生成搭配简历的求职信 |
| 支付集成 | Stripe — 免费套餐(3次分析/月), Pro套餐(不限, $19/月) |
| 导出格式 | PDF、DOCX、纯文本 |
| 引荐系统 | 分享链接, 追踪注册 |

### 11.3 Phase 2 — V2 (第21-36周, ~6个月)

| 功能 | 范围 |
|------|------|
| 职位看板集成 | LinkedIn/Indeed API自动填充JD |
| 实时协作 | 与导师/招聘人员分享分析; 评论线程 |
| 面试准备模块 | 从简历要点生成AI STAR答案; 模拟面试题 |
| 行业基准 | 与同行业/角色同行的百分位排名 |
| 多语言支持 | 5+语言的简历优化 |
| 企业套餐 | 团队仪表盘、批量分析、基于角色的访问 |
| 自定义AI模型 | 按行业微调模型(科技、金融、医疗) |
| 公共API | 面向合作伙伴/HR平台的开放REST API |

### 11.4 Phase 3 — 平台扩展 (第37周+)

- AI驱动的职业路径规划
- 面试模拟(AI面试官, 语音交互)
- 薪资谈判助手
- 与主流招聘平台(LinkedIn、Indeed、Glassdoor)深度集成
- 简历审查市场(按需人工专家审查)
- 白标解决方案(有HR产品团队的银行客户)

---

## 12. 后续可扩展功能

### 12.1 AI能力扩展

| 功能 | 描述 | 所需基础设施 |
|------|------|------------|
| **AI面试模拟** | 从简历+JD生成角色特定的行为面试问题; 语音交互的AI面试官; 对回答评分并提供反馈 | 语音转文字(Whisper API)、文字转语音、对话AI管线 |
| **薪资谈判助手** | 根据市场数据分析薪资范围; 生成谈判脚本; 总薪酬(股权+奖金)对比工具 | Levels.fyi/Glassdoor数据聚合、市场数据分析 |
| **职业路径规划** | 分析当前技能并Gap到目标角色; 推荐学习资源、认证和时间线; 技能获取进度追踪 | 技能图谱数据库、学习资源API集成 |
| **AI简历审查市场** | 将用户与经过审核的人工专家连接; AI进行首次筛选, 人工进行最终审查; 评分和评价系统 | 双向市场基础设施、支付分账、专家审核 |

### 12.2 平台扩展

| 功能 | 描述 | 优先级 |
|------|------|--------|
| **企业SSO** | SAML 2.0 / OpenID Connect集成用于企业客户 | 中 |
| **白标** | 自定义域名、自定义模板、品牌邮箱, 面向HR SaaS合作伙伴 | 低 |
| **公共API** | 面向第三方集成的REST API: 解析即服务、评分即服务 | 中 |
| **简历审查即服务** | 嵌入到职位看板的Widget — 实时评分和反馈 | 低 |
| **移动应用** | React Native应用用于移动端简历编辑和快速分析 | 中 |

### 12.3 数据与分析

| 功能 | 描述 |
|------|------|
| **匿名化分析** | 聚合数据和分析趋势洞察 — "该行业平均ATS评分: 72/100" — 数据匿名化, 仅通过明确同意选择加入 |
| **招聘市场洞察** | 汇总JD数据以显示: 新兴技能需求、薪资趋势、招聘量 |

### 12.4 基础设施扩展

| 功能 | 描述 |
|------|------|
| **多区域部署** | 美国(`us-east`)、欧洲(`eu-west`)、亚太(`ap-southeast`)用于数据驻留和延迟优化 |
| **自定义AI模型** | 按行业对开源模型进行微调(科技、金融、医疗), 以降低对OpenAI的依赖并降低推理成本 |
| **本地部署** | 针对严格数据驻留要求的企业客户提供VPC内部署选项 |

---

## 附录 A — 环境变量Schema

```env
# === 应用 ===
NODE_ENV=production
APP_URL=https://resumepilot.ai
API_URL=https://api.resumepilot.ai

# === 数据库 ===
DATABASE_URL=postgresql://user:pass@host:5432/resumepilot?schema=public
DATABASE_URL_REPLICA=postgresql://user:pass@replica:5432/resumepilot

# === Redis ===
REDIS_URL=redis://:pass@host:6379/0
REDIS_CACHE_URL=redis://:pass@host:6379/1
REDIS_QUEUE_URL=redis://:pass@host:6379/2

# === 存储 (S3) ===
S3_ENDPOINT=https://s3.amazonaws.com
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=AKIA...
S3_SECRET_ACCESS_KEY=...
S3_BUCKET=resumepilot-prod
S3_PUBLIC_BUCKET=resumepilot-public

# === 认证 ===
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
JWT_ISSUER=resumepilot-api
JWT_AUDIENCE=resumepilot-web

# === OpenAI ===
OPENAI_API_KEY=sk-...
OPENAI_DEFAULT_MODEL=gpt-4o
OPENAI_FAST_MODEL=gpt-4o-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-large
OPENAI_MAX_RETRIES=3
OPENAI_TIMEOUT_MS=60000

# === Stripe ===
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRO_PLAN_ID=price_...
STRIPE_ENTERPRISE_PLAN_ID=price_...

# === 邮件 ===
RESEND_API_KEY=re_...
EMAIL_FROM=noreply@resumepilot.ai

# === Meilisearch ===
MEILISEARCH_URL=https://search.resumepilot.ai
MEILISEARCH_API_KEY=...

# === 监控 ===
SENTRY_DSN=https://...@sentry.io/...
```

## 附录 B — 关键架构决策记录 (ADR)

### ADR-001: 模块化单体优于微服务 (MVP)

**决策:** 从模块化单体开始, 并设计清晰的演进路径到微服务。
**理由:** 团队规模(3-5)、开发速度、事务一致性、基础设施成本。
**约束:** 强制执行模块边界 — 不跨模块Repository调用。如果违反边界, 切换到微服务。

### ADR-002: PostgreSQL + pgvector 优于 MongoDB

**决策:** 对关系型数据(用户、简历、JD)使用PostgreSQL作为主数据库并使用pgvector进行向量搜索。
**理由:** 单一数据库用于OLTP和向量搜索, ACID事务, JSONB提供灵活性, Prisma ORM支持, 无供应商锁定。

### ADR-003: NestJS 优于 Express

**决策:** 使用NestJS作为API框架。
**理由:** 依赖注入用于可测试性, 请求作用域providers用于多租户, 模块系统强制执行边界, 使用装饰器的声明式横切关注点。

### ADR-004: JWT访问令牌 + 刷新令牌轮换

**决策:** 短生命周期JWT访问令牌(15min, 仅内存) + 长生命周期刷新令牌(7d, httpOnly cookie, 轮换)。
**理由:** 无状态授权, 被盗令牌检测(刷新轮换+家族失效), 与OpenID Connect兼容用于未来企业SSO。

### ADR-005: OpenAI作为AI提供商(具有回退能力)

**决策:** 对GPT-4o进行标准化, 回退到GPT-4o-mini, 然后缓存, 最后优雅降级。
**理由:** 市场最佳的指令遵循能力, 具有最大上下文的流式API, tiktoken库的精确Token计数。通过 `AI_PROVIDER` 环境变量提供多提供商抽象, 可在不更改代码的情况下切换。

---

> **文档版本:** 2.0.0 | **最后更新:** 2026-06-16 | **作者:** ResumePilot AI 架构团队
>
> 本架构设计文档是ResumePilot AI平台的权威技术参考。它综合了竞争分析、技术选型研究、API设计规范、数据库Schema设计和项目结构规划, 形成了一份可直接用于工作作品集的完整、生产级别的C级架构文档。
