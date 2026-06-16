# ResumePilot AI — System Architecture

> **Full-stack AI SaaS Platform for Resume Analysis, Optimization, and Tailoring**
>
> Tech Stack: Next.js 15 · NestJS · PostgreSQL · Redis · AWS S3 · JWT + Refresh Tokens · OpenAI API · Docker · GitHub Actions

---

## Table of Contents

1. [High-Level System Architecture (C4)](#1-high-level-system-architecture)
2. [Frontend Architecture](#2-frontend-architecture)
3. [Backend Architecture](#3-backend-architecture)
4. [Infrastructure Architecture](#4-infrastructure-architecture)
5. [Security Architecture](#5-security-architecture)
6. [AI Pipeline Architecture](#6-ai-pipeline-architecture)

---

## 1. High-Level System Architecture

### 1.1 C4 — System Context Diagram

```mermaid
C4Context
    title ResumePilot AI — System Context

    Person(user, "Job Seeker", "Uploads resume, receives optimized versions tailored to job descriptions")
    Person(admin, "Platform Admin", "Manages users, monitors usage quotas, reviews AI quality")

    System(resumepilot, "ResumePilot AI", "AI-powered resume analysis, scoring, and optimization platform")

    System_Ext(openai, "OpenAI API", "GPT-4o for resume parsing, analysis, and content generation")
    System_Ext(s3, "S3-Compatible Storage", "Resume file storage, template assets, generated PDFs")
    System_Ext(email, "Email Service (Resend/SES)", "Transactional emails, onboarding, notifications")
    System_Ext(payment, "Payment Gateway (Stripe)", "Subscription management and billing")
    System_Ext(linkedin, "LinkedIn API", "Profile import for resume auto-fill")

    Rel(user, resumepilot, "Uploads resume, views analysis, exports optimized PDF", "HTTPS/gRPC")
    Rel(admin, resumepilot, "Manages platform, reviews flagged content", "HTTPS")
    Rel(resumepilot, openai, "Sends resume text + job descriptions for analysis/optimization", "HTTPS/JSON")
    Rel(resumepilot, s3, "Stores uploaded resumes, generated templates, exports", "HTTPS/S3 API")
    Rel(resumepilot, email, "Sends verification, notification, and marketing emails", "SMTP/API")
    Rel(resumepilot, payment, "Processes subscriptions, invoices, payment webhooks", "HTTPS/API")
    Rel(resumepilot, linkedin, "Imports profile data for resume seeding", "OAuth 2.0")

    UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="2")
```

### 1.2 C4 — Container Diagram

```mermaid
C4Container
    title ResumePilot AI — Container Architecture

    Person(user, "Job Seeker", "End user of the platform")

    System_Boundary(resumepilot, "ResumePilot AI Platform") {
        Container(web, "Web Application", "Next.js 15, React 19, Tailwind CSS", "SPA/SSR frontend. Dashboard, resume editor, job matching UI")
        Container(api, "API Gateway", "NestJS, TypeScript", "REST + WebSocket API. Auth, resume CRUD, AI orchestration, billing webhooks")
        Container(worker, "Background Worker", "NestJS + BullMQ", "Async job processing: AI analysis, PDF generation, email dispatch")
        ContainerDb(db, "Primary Database", "PostgreSQL 16 + pgvector", "User accounts, resumes, job descriptions, analysis history, subscriptions")
        ContainerDb(cache, "Cache Layer", "Redis 7", "Session store, rate limiting, AI result caching, job queues (BullMQ)")
        ContainerDb(storage, "Object Storage", "MinIO / AWS S3", "Raw resume files (PDF/DOCX), generated PDFs, template assets")
        ContainerDb(search, "Search Engine", "Meilisearch", "Full-text search across resumes and job descriptions")
    }

    System_Ext(openai, "OpenAI API", "GPT-4o, embeddings")
    System_Ext(stripe, "Stripe", "Payments")
    System_Ext(email_svc, "Resend", "Email delivery")

    Rel(user, web, "Uses", "HTTPS")
    Rel(web, api, "REST/WS calls", "JSON — JWT Bearer")
    Rel(api, db, "Reads/writes", "TCP — Prisma ORM")
    Rel(api, cache, "Reads/writes", "TCP — ioredis")
    Rel(api, storage, "Presigned URLs, object CRUD", "S3 API")
    Rel(api, search, "Indexes/querys", "HTTP")
    Rel(api, openai, "Sends prompts, receives completions", "HTTPS — streaming")
    Rel(api, stripe, "Creates sessions, handles webhooks", "HTTPS")
    Rel(api, email_svc, "Dispatches templates", "HTTP API")
    Rel(worker, db, "Updates analysis results", "TCP")
    Rel(worker, cache, "Dequeues jobs, caches results", "TCP")
    Rel(worker, storage, "Generates and stores PDFs", "S3 API")
    Rel(worker, openai, "Runs AI analysis jobs", "HTTPS")

    UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="2")
```

### 1.3 C4 — Component Diagram (API Core)

```mermaid
C4Component
    title ResumePilot API — Component Architecture

    Container_Boundary(api, "NestJS API Gateway") {
        Component(auth_module, "AuthModule", "NestJS Module", "JWT issuance, refresh rotation, OAuth2 flows, MFA")
        Component(user_module, "UserModule", "NestJS Module", "Profile CRUD, onboarding, preferences, account deletion")
        Component(resume_module, "ResumeModule", "NestJS Module", "Upload, parse, versioning, ATS scoring, export")
        Component(job_module, "JobModule", "NestJS Module", "Job description parsing, keyword extraction, matching")
        Component(ai_module, "AIModule", "NestJS Module", "Prompt orchestration, streaming, fallback, token accounting")
        Component(billing_module, "BillingModule", "NestJS Module", "Stripe integration, plans, usage metering, invoices")
        Component(notification_module, "NotificationModule", "NestJS Module", "Email + in-app + push notification dispatch")
        Component(admin_module, "AdminModule", "NestJS Module", "Dashboard, user management, system health, content moderation")

        Component(mw_auth, "AuthGuard", "Middleware", "Validates JWT, attaches User context")
        Component(mw_rbac, "RBACGuard", "Middleware", "Role + permission enforcement")
        Component(mw_rate, "RateLimiter", "Middleware", "Token-bucket rate limiting per user/IP")
        Component(mw_log, "RequestLogger", "Middleware", "Structured JSON logging with correlation IDs")
        Component(mw_valid, "ValidationPipe", "Middleware", "Zod schema validation on DTOs")
    }

    Rel(mw_auth, auth_module, "Delegates token verification to")
    Rel(mw_rbac, auth_module, "Resolves roles from")
    Rel(mw_rate, cache, "Counts requests in Redis", "TCP")
    Rel(mw_log, db, "Writes audit log entries", "TCP")

    Rel(resume_module, ai_module, "Triggers analysis pipeline", "Internal event")
    Rel(job_module, ai_module, "Triggers matching pipeline", "Internal event")
    Rel(billing_module, user_module, "Reads quota/plan", "Internal call")
    Rel(notification_module, user_module, "Reads preferences", "Internal call")

    UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="2")
```

---

## 2. Frontend Architecture

### 2.1 Component Tree

```mermaid
graph TD
    subgraph "Next.js 15 App Router"
        RootLayout["RootLayout<br/>(providers, fonts, metadata)"]
        AuthProvider["AuthProvider<br/>(JWT context, refresh interceptor)"]
        ThemeProvider["ThemeProvider<br/>(dark/light/system)"]
        QueryProvider["QueryProvider<br/>(TanStack Query, devtools)"]
        Toaster["Toaster<br/>(Sonner notifications)"]

        RootLayout --> AuthProvider
        RootLayout --> ThemeProvider
        RootLayout --> QueryProvider
        RootLayout --> Toaster
    end

    subgraph "Pages (app/ directory)"
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
        AdminOverview["/admin — AdminLayout"]
        AdminUsers["/admin/users — UserManagementPage"]
        AdminAnalytics["/admin/analytics — PlatformAnalyticsPage"]
    end

    subgraph "Shared Components"
        Navbar["Navbar<br/>(user menu, credits, search)"]
        Sidebar["Sidebar<br/>(navigation, workspace switcher)"]
        ResumeUploader["ResumeUploader<br/>(drag-drop, progress, OCR feedback)"]
        AIScoreBadge["AIScoreBadge<br/>(ATS score ring)"]
        KeywordCloud["KeywordCloud<br/>(matched/missing keywords)"]
        DiffViewer["DiffViewer<br/>(original vs optimized side-by-side)"]
        TemplateSelector["TemplateSelector<br/>(preview, apply)"]
        ExportButton["ExportButton<br/>(PDF, DOCX, JSON)"]
        CreditMeter["CreditMeter<br/>(usage bar)"]
        LoadingSkeleton["LoadingSkeleton<br/>(animated placeholders)"]
        ErrorBoundary["ErrorBoundary<br/>(fallback UI, retry)"]
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
    ResumeList --> LoadingSkeleton
    TailoredView --> DiffViewer
    TailoredView --> ExportButton
    RootLayout --> ErrorBoundary
```

### 2.2 State Management Architecture

```mermaid
graph LR
    subgraph "State Layers"
        ServerState["Server State<br/>(TanStack Query v5)"]
        AuthState["Auth State<br/>(Zustand + Persist)"]
        UIState["UI State<br/>(Zustand — selected resume, editor undo stack, theme)"]
        FormState["Form State<br/>(React Hook Form + Zod)"]
        RealTimeState["Real-Time State<br/>(WebSocket via Socket.io-client)"]
    end

    subgraph "Server State Domains"
        ResumesQuery["useResumesQuery"]
        ResumeQuery["useResumeQuery"]
        AnalysisQuery["useAnalysisQuery"]
        JobsQuery["useJobsQuery"]
        TailoredQuery["useTailoredQuery"]
        BillingQuery["useBillingQuery"]
        NotificationsQuery["useNotificationsQuery"]
    end

    subgraph "Auth State Details"
        AccessToken["accessToken<br/>(in-memory only)"]
        RefreshToken["refreshToken<br/>(httpOnly cookie)"]
        UserProfile["userProfile"]
        Permissions["permissions[]"]
        OnboardingStep["onboardingStep"]
    end

    subgraph "UI State Details"
        SelectedResume["selectedResumeId"]
        EditorHistory["editorHistoryStack"]
        SidebarCollapsed["sidebarCollapsed"]
        ThemeMode["theme: light | dark | system"]
        ActiveModal["activeModal"]
        TourProgress["onboardingTourStep"]
    end

    ServerState --> ResumesQuery
    ServerState --> ResumeQuery
    ServerState --> AnalysisQuery
    ServerState --> JobsQuery
    ServerState --> TailoredQuery
    ServerState --> BillingQuery
    ServerState --> NotificationsQuery

    AuthState --> AccessToken
    AuthState --> RefreshToken
    AuthState --> UserProfile
    AuthState --> Permissions

    UIState --> SelectedResume
    UIState --> EditorHistory
    UIState --> SidebarCollapsed
    UIState --> ThemeMode
    UIState --> ActiveModal
    UIState --> TourProgress
```

### 2.3 Routing Design

```mermaid
graph TD
    subgraph "App Router — Route Groups"
        direction TB

        subgraph "Public Routes (marketing)"
            R_LANDING["/ — LP + waitlist"]
            R_LOGIN["/login"]
            R_SIGNUP["/signup"]
            R_VERIFY["/verify-email?token="]
            R_RESET["/reset-password"]
            R_BLOG["/blog/*"]
            R_LEGAL["/privacy, /terms"]
        end

        subgraph "Protected Routes (auth)"
            R_DASH["/dashboard — overview, stats, quick actions"]
            R_RESUMES["/dashboard/resumes — list, search, filter"]
            R_RESUME_ID["/dashboard/resumes/[id] — editor"]
            R_RESUME_ANALYSIS["/dashboard/resumes/[id]/analysis"]
            R_JOBS["/dashboard/jobs — job search + saved"]
            R_JOB_ID["/dashboard/jobs/[id] — JD detail + match"]
            R_TAILORED["/dashboard/tailored/[id] — tailored resume"]
            R_SETTINGS["/dashboard/settings — profile, preferences"]
            R_BILLING["/dashboard/billing — plans, invoices"]
        end

        subgraph "Admin Routes (admin role)"
            R_ADMIN["/admin — platform overview"]
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

---

## 3. Backend Architecture

### 3.1 NestJS Module Structure

```mermaid
graph TD
    subgraph "NestJS Application"
        AppModule["AppModule<br/>(root)"]
        CoreModule["CoreModule<br/>(global providers)"]
        CommonModule["CommonModule<br/>(shared DTOs, decorators, filters)"]

        AppModule --> CoreModule
        AppModule --> CommonModule
    end

    subgraph "Feature Modules"
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
    end

    subgraph "Integration Modules"
        OpenAIModule["OpenAIModule<br/>(GPT client, embeddings, rate limiter)"]
        StorageModule["StorageModule<br/>(S3 client, presigned URLs, multipart upload)"]
        EmailModule["EmailModule<br/>(Resend templates, queue dispatch)"]
        StripeModule["StripeModule<br/>(checkout, portal, webhooks)"]
        LinkedInModule["LinkedInModule<br/>(OAuth, profile import)"]
        MeiliSearchModule["MeiliSearchModule"]
    end

    subgraph "Infrastructure Modules"
        PrismaModule["PrismaModule<br/>(global DB client)"]
        RedisModule["RedisModule<br/>(ioredis, BullMQ)"]
        ConfigModule["ConfigModule<br/>(env validation via Zod)"]
        LoggerModule["LoggerModule<br/>(Pino structured logging)"]
        HealthModule["HealthModule<br/>(/health, /ready endpoints)"]
        MetricsModule["MetricsModule<br/>(Prometheus metrics)"]
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
    UserModule --> LinkedInModule
    SearchModule --> MeiliSearchModule

    CoreModule --> PrismaModule
    CoreModule --> RedisModule
    CoreModule --> ConfigModule
    CoreModule --> LoggerModule
    CoreModule --> HealthModule
    CoreModule --> MetricsModule
```

### 3.2 Middleware Pipeline

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

### 3.3 Service Layer Design

```mermaid
graph TD
    subgraph "Service Layer"
        direction TB

        subgraph "Auth Services"
            AuthSvc["AuthService<br/>login, register, refreshToken, logout, verifyEmail"]
            TokenSvc["TokenService<br/>JWT sign/verify, refresh rotation, blacklist"]
            OAuthSvc["OAuthService<br/>Google, LinkedIn OAuth flows"]
        end

        subgraph "Resume Services"
            ResumeSvc["ResumeService<br/>CRUD, versioning, tagging, sharing"]
            ParseSvc["ResumeParserService<br/>DOCX/PDF text extraction, section classification"]
            ScoreSvc["ATSScoringService<br/>ATS compatibility score, section completeness"]
            TailorSvc["ResumeTailorService<br/>Generate tailored resume against JD"]
        end

        subgraph "AI Services"
            PromptSvc["PromptTemplateService<br/>Prompt library, versioning, A/B testing"]
            OpenAISvc["OpenAIService<br/>Chat completions, streaming, embeddings"]
            TokenSvc2["TokenAccountingService<br/>Track usage, enforce quotas, cost analytics"]
            FallbackSvc["FallbackService<br/>Model failover (GPT-4o → GPT-4o-mini → Claude)"]
        end

        subgraph "Job Services"
            JobSvc["JobService<br/>CRUD, search, save jobs"]
            MatchSvc["JobMatchService<br/>Resume-to-JD matching, skill gap analysis"]
            KeywordSvc["KeywordService<br/>Extract keywords, score relevance, suggest additions"]
        end

        subgraph "Export Services"
            PDFSvc["PDFGenerationService<br/>Puppeteer → styled PDF with selected template"]
            DOCXSvc["DOCXGenerationService<br/>python-docx → editable .docx export"]
            ShareSvc["ShareService<br/>Generate shareable link with expiry"]
        end

        subgraph "Billing Services"
            PlanSvc["PlanService<br/>Plan definitions, feature flags, limits"]
            SubSvc["SubscriptionService<br/>Stripe checkout, portal, webhooks"]
            UsageSvc["UsageService<br/>Credit tracking, overage, reset cron"]
        end
    end

    ResumeSvc --> ParseSvc
    ResumeSvc --> ScoreSvc
    ResumeSvc --> TailorSvc
    TailorSvc --> OpenAISvc
    ScoreSvc --> OpenAISvc
    ParseSvc --> OpenAISvc
    MatchSvc --> OpenAISvc
    MatchSvc --> KeywordSvc
    JobSvc --> MatchSvc
    OpenAISvc --> PromptSvc
    OpenAISvc --> TokenSvc2
    OpenAISvc --> FallbackSvc
    ExportModule --> PDFSvc
    ExportModule --> DOCXSvc
    ResumeSvc --> ShareSvc
    BillingModule --> PlanSvc
    BillingModule --> SubSvc
    BillingModule --> UsageSvc
```

### 3.4 Database Schema (Condensed ERD)

```mermaid
erDiagram
    User {
        uuid id PK
        string email UK
        string passwordHash
        string fullName
        string avatarUrl
        jsonb preferences
        string onboardingStep
        datetime emailVerifiedAt
        datetime createdAt
        datetime updatedAt
    }

    Resume {
        uuid id PK
        uuid userId FK
        string title
        string originalFileName
        string s3Key
        string parsedText
        jsonb sections
        jsonb atsScore
        int version
        boolean isArchived
        datetime createdAt
        datetime updatedAt
    }

    JobDescription {
        uuid id PK
        uuid userId FK
        string title
        string company
        string rawText
        jsonb parsedSections
        jsonb extractedKeywords
        string sourceUrl
        string status
        datetime createdAt
    }

    TailoredResume {
        uuid id PK
        uuid resumeId FK
        uuid jobDescriptionId FK
        uuid userId FK
        jsonb optimizedSections
        jsonb changesSummary
        jsonb matchScore
        string s3Key
        string status
        datetime createdAt
    }

    Analysis {
        uuid id PK
        uuid resumeId FK
        uuid userId FK
        string type
        jsonb result
        int tokensUsed
        int costCents
        string modelUsed
        datetime createdAt
    }

    Subscription {
        uuid id PK
        uuid userId FK
        string stripeCustomerId
        string stripeSubscriptionId
        string planTier
        string status
        datetime currentPeriodEnd
        datetime createdAt
    }

    CreditLedger {
        uuid id PK
        uuid userId FK
        int amount
        string action
        string reference
        int balanceAfter
        datetime createdAt
    }

    RefreshToken {
        uuid id PK
        uuid userId FK
        string tokenHash UK
        string family
        datetime expiresAt
        boolean isRevoked
        datetime createdAt
    }

    AuditLog {
        uuid id PK
        uuid userId FK
        string action
        string resource
        string resourceId
        jsonb metadata
        string ipAddress
        datetime createdAt
    }

    User ||--o{ Resume : owns
    User ||--o{ JobDescription : saves
    User ||--o{ TailoredResume : creates
    User ||--o{ Analysis : runs
    User ||--o{ Subscription : subscribes
    User ||--o{ CreditLedger : consumes
    User ||--o{ RefreshToken : authenticates
    User ||--o{ AuditLog : generates

    Resume ||--o{ TailoredResume : "source for"
    JobDescription ||--o{ TailoredResume : "target for"
    Resume ||--o{ Analysis : "analyzed in"
```

---

## 4. Infrastructure Architecture

### 4.1 Docker Compose — Local Development

```mermaid
graph TD
    subgraph "Docker Compose Stack"
        direction TB

        subgraph "Application Containers"
            Web["resumepilot-web<br/>Next.js 15 (dev mode, HMR)<br/>Port: 3000"]
            API["resumepilot-api<br/>NestJS (dev mode, --watch)<br/>Port: 4000"]
            Worker["resumepilot-worker<br/>NestJS + BullMQ processor<br/>Port: —"]
        end

        subgraph "Data Services"
            PG["postgres<br/>PostgreSQL 16 + pgvector<br/>Port: 5432"]
            RedisSvc["redis<br/>Redis 7 + RedisJSON<br/>Port: 6379"]
            MinIO["minio<br/>MinIO (S3-compatible)<br/>Ports: 9000 (API), 9001 (Console)"]
            Meili["meilisearch<br/>Meilisearch<br/>Port: 7700"]
        end

        subgraph "Dev Tools"
            Mailpit["mailpit<br/>SMTP catcher + web UI<br/>Ports: 1025 (SMTP), 8025 (UI)"]
            StripeCLI["stripe-cli<br/>Webhook forwarding<br/>Port: —"]
            PrismaStudio["prisma-studio<br/>DB browser<br/>Port: 5555"]
        end

        subgraph "Optional — AI Local Dev"
            Ollama["ollama<br/>Local LLM fallback<br/>Port: 11434"]
        end
    end

    subgraph "Networks"
        FrontNet["frontend-network<br/>(web → api)"]
        BackNet["backend-network<br/>(api → pg, redis, minio, meili)"]
    end

    Web -->|"frontend-network"| API
    API -->|"backend-network"| PG
    API -->|"backend-network"| RedisSvc
    API -->|"backend-network"| MinIO
    API -->|"backend-network"| Meili
    Worker -->|"backend-network"| PG
    Worker -->|"backend-network"| RedisSvc
    Worker -->|"backend-network"| MinIO
```

### 4.2 Production Deployment Architecture

```mermaid
graph TD
    subgraph "AWS / VPS"
        subgraph "Edge"
            CF["Cloudflare<br/>(DNS, CDN, WAF, DDoS)"]
        end

        subgraph "Load Balancer"
            LB["Nginx / Traefik<br/>(TLS termination, routing)"]
        end

        subgraph "Compute — Docker Swarm / K8s"
            Web1["resumepilot-web-1"]
            Web2["resumepilot-web-2"]
            API1["resumepilot-api-1"]
            API2["resumepilot-api-2"]
            Worker1["resumepilot-worker-1"]
            Worker2["resumepilot-worker-2"]
        end

        subgraph "Data — Managed Services"
            RDS["AWS RDS PostgreSQL<br/>(Multi-AZ, read replicas)"]
            ElastiCache["AWS ElastiCache Redis<br/>(Cluster mode)"]
            S3["AWS S3<br/>(Resume storage + CloudFront CDN)"]
            MQ["AWS SQS / Redis<br/>(Job queue)"]
        end

        subgraph "Observability"
            Prom["Prometheus<br/>(metrics scrape)"]
            Grafana["Grafana<br/>(dashboards)"]
            Loki["Loki<br/>(log aggregation)"]
            Sentry["Sentry<br/>(error tracking)"]
        end
    end

    CF --> LB
    LB --> Web1
    LB --> Web2
    LB --> API1
    LB --> API2
    API1 --> RDS
    API1 --> ElastiCache
    API1 --> S3
    API2 --> RDS
    API2 --> ElastiCache
    API2 --> S3
    Worker1 --> RDS
    Worker1 --> ElastiCache
    Worker1 --> S3
    Worker2 --> RDS
    Worker2 --> ElastiCache
    Worker2 --> S3
    API1 --> Prom
    API2 --> Prom
    Prom --> Grafana
    API1 --> Loki
    API2 --> Loki
    API1 --> Sentry
    API2 --> Sentry
```

### 4.3 CI/CD Pipeline (GitHub Actions)

```mermaid
graph LR
    subgraph "GitHub Actions — CI/CD"
        direction TB

        subgraph "Pull Request Pipeline"
            PR_Open["PR Opened / Push"]
            Lint["Lint<br/>(ESLint, Prettier, Markdownlint)"]
            TypeCheck["Type Check<br/>(tsc --noEmit)"]
            UnitTest["Unit Tests<br/>(Vitest + Jest)"]
            IntTest["Integration Tests<br/>(Testcontainers: PG, Redis)"]
            Build["Build Check<br/>(next build, nest build)"]
            BundleSize["Bundle Analysis<br/>(next-bundle-analyzer)"]
            SecurityScan["Security Scan<br/>(npm audit, Snyk, Trivy)"]

            PR_Open --> Lint
            PR_Open --> TypeCheck
            Lint --> UnitTest
            TypeCheck --> UnitTest
            UnitTest --> IntTest
            IntTest --> Build
            Build --> BundleSize
            Build --> SecurityScan
        end

        subgraph "Main Branch Pipeline"
            Merge["Merge to main"]
            CI["Full CI Suite"]
            DockerBuild["Build Docker Images<br/>(web, api, worker)"]
            PushRegistry["Push to GHCR / ECR"]
            DeployStaging["Deploy to Staging"]
            E2E["E2E Tests<br/>(Playwright)"]
            Smoke["Smoke Tests"]
            DeployProd["Deploy to Production<br/>(Blue-Green / Rolling)"]
            Migration["Run DB Migrations<br/>(prisma migrate deploy)"]
            HealthCheck["Health Check + Rollback Monitor"]

            Merge --> CI
            CI --> DockerBuild
            DockerBuild --> PushRegistry
            PushRegistry --> DeployStaging
            DeployStaging --> E2E
            E2E --> Smoke
            Smoke --> DeployProd
            DeployProd --> Migration
            Migration --> HealthCheck
        end

        subgraph "Scheduled Pipelines"
            Nightly["Nightly<br/>(full E2E + perf tests)"]
            DependencyBot["Dependabot<br/>(auto-update deps, auto-merge patch)"]
            DBBackup["DB Backup<br/>(pg_dump → S3, daily)"]
        end
    end
```

---

## 5. Security Architecture

### 5.1 Authentication Flow

```mermaid
sequenceDiagram
    participant Browser
    participant NextJS as Next.js Server
    participant API as NestJS API
    participant Redis
    participant DB as PostgreSQL

    Note over Browser,DB: === LOGIN FLOW ===

    Browser->>API: POST /auth/login {email, password}
    API->>DB: SELECT user WHERE email = ?
    DB-->>API: user + passwordHash
    API->>API: bcrypt.compare(password, hash)
    
    alt Invalid credentials
        API-->>Browser: 401 Invalid credentials
    end

    API->>API: Generate accessToken (15min, in-memory)
    API->>API: Generate refreshToken (7d, httpOnly cookie)
    API->>DB: INSERT refreshToken (hash, family, expiry)
    API->>Redis: Cache session {userId, roles, permissions} (15min TTL)
    API-->>Browser: {accessToken} + Set-Cookie: refreshToken

    Note over Browser,DB: === AUTHENTICATED REQUEST ===

    Browser->>API: GET /resumes — Authorization: Bearer <accessToken>
    API->>API: Verify JWT signature + expiry
    API->>Redis: GET session:{userId}
    
    alt Session cached
        Redis-->>API: session data
    else Session miss
        API->>DB: SELECT user + permissions
        API->>Redis: SET session:{userId} (15min TTL)
    end

    API-->>Browser: 200 {resumes[]}

    Note over Browser,DB: === TOKEN REFRESH FLOW ===

    Browser->>API: POST /auth/refresh — Cookie: refreshToken
    API->>DB: SELECT refreshToken WHERE hash = ?
    
    alt Token expired or revoked
        API->>DB: UPDATE refreshToken SET revoked = true (family)
        API-->>Browser: 401 — redirect to login
    end

    API->>API: Generate new accessToken
    API->>API: Generate new refreshToken (rotation)
    API->>DB: DELETE old refreshToken
    API->>DB: INSERT new refreshToken (same family)
    API->>Redis: UPDATE session TTL
    API-->>Browser: {accessToken} + Set-Cookie: new refreshToken

    Note over Browser,DB: === LOGOUT ===

    Browser->>API: POST /auth/logout
    API->>DB: UPDATE refreshToken SET revoked = true (family)
    API->>Redis: DEL session:{userId}
    API-->>Browser: Clear cookie
```

### 5.2 Data Encryption Strategy

```mermaid
graph TD
    subgraph "Encryption Layers"
        direction TB

        Transit["Encryption in Transit"]
        Transit --> TLS13["TLS 1.3 (HTTPS)<br/>HSTS preload, strict-transport-security"]
        Transit --> MTLS["mTLS for internal service mesh<br/>(api ↔ worker ↔ db)"]

        Rest["Encryption at Rest"]
        Rest --> AES256["AES-256-GCM<br/>PII fields: fullName, email, parsedResumeText"]
        Rest --> S3Enc["S3 Server-Side Encryption<br/>(AES-256 / KMS managed keys)"]
        Rest --> DiskEnc["EBS volume encryption<br/>(AWS KMS customer-managed)"]
        Rest --> PGTDE["PostgreSQL TDE<br/>(pg_tde extension, file-level)"]

        App["Application-Level Encryption"]
        App --> FieldEnc["Field-level encryption<br/>(libsodium secretbox)"]
        App --> Resumes["Resume content encrypted at field level<br/>before DB write, decrypted on read"]
        App --> KeyMgmt["Key Management"]
        KeyMgmt --> AWSKMS["AWS KMS / Vault<br/>Master key → Data keys via envelope encryption"]
        KeyMgmt --> KeyRotation["Automatic key rotation<br/>(30-day policy)"]
    end
```

### 5.3 API Security Architecture

```mermaid
graph TD
    subgraph "Security Controls"
        direction TB

        subgraph "Request Protection"
            CSRF["CSRF Protection<br/>(double-submit cookie pattern)"]
            CORS["CORS Policy<br/>(allowlist: app domain only)"]
            CSP["Content-Security-Policy<br/>(strict-dynamic, nonce-based)"]
            HPP["HTTP Parameter Pollution<br/>(first-value wins, strict parsing)"]
        end

        subgraph "Rate Limiting"
            GlobalRL["Global: 100 req/min per IP"]
            AuthRL["Auth endpoints: 5 req/min per IP"]
            AIRL["AI endpoints: configurable per plan tier"]
            BruteRL["Brute-force protection: exponential backoff"]
        end

        subgraph "Input Validation"
            ZodPipes["Zod Validation Pipes<br/>(all DTOs, strict mode, no unknown keys)"]
            Sanitize["HTML/Markdown sanitization<br/>(DOMPurify for user content)"]
            FileScan["File upload scanning<br/>(ClamAV for resumes, type verification)"]
            SQLInj["SQL injection prevention<br/>(Prisma parameterized queries)"]
        end

        subgraph "Output Protection"
            ResHeaders["Security Response Headers<br/>(X-Content-Type-Options, X-Frame-Options, Referrer-Policy)"]
            DataMask["Sensitive data masking<br/>(logs: redact tokens, emails, PII)"]
            MinData["Minimal data exposure<br/>(DTOs exclude internal fields)"]
        end

        subgraph "Auth & Session"
            JWTConfig["JWT Configuration<br/>(RS256, short-lived 15min, issuer + audience check)"]
            RefreshRotation["Refresh Token Rotation<br/>(single-use, family invalidation on theft)"]
            MFATOTP["MFA Support<br/>(TOTP via authenticator app)"]
            SessionMgmt["Session Management<br/>(Redis cached, 15min TTL, force logout)"]
        end
    end
```

---

## 6. AI Pipeline Architecture

### 6.1 Resume Processing Pipeline (End-to-End)

```mermaid
flowchart TD
    subgraph "Phase 1 — INGEST"
        Upload["User uploads resume<br/>(PDF, DOCX, TXT)"]
        Validate["File validation<br/>(size ≤ 10MB, type check, ClamAV scan)"]
        Store["Upload to S3<br/>(encrypted at rest)"]
        Enqueue["Enqueue parse job<br/>(BullMQ → Redis)"]

        Upload --> Validate
        Validate -->|Valid| Store
        Validate -->|Invalid| Reject["Reject with error message"]
        Store --> Enqueue
    end

    subgraph "Phase 2 — PARSE"
        Dequeue["Worker dequeues job"]
        Extract["Extract raw text<br/>(pdf-parse / mammoth.js / textract)"]
        OCR["OCR fallback for image-based PDFs<br/>(Tesseract.js)"]
        Structure["AI Structure Classification<br/>(GPT-4o-mini: identify sections)"]

        Dequeue --> Extract
        Extract -->|Text extracted| Structure
        Extract -->|No text (scanned)| OCR
        OCR --> Structure
    end

    subgraph "Phase 2b — SECTION CLASSIFICATION"
        Sections["Classify sections:<br/>Contact, Summary, Experience,<br/>Education, Skills, Projects, Certs"]
        EntityExtract["Named Entity Extraction<br/>(dates, companies, titles, degrees)"]
        Normalize["Normalize & clean text<br/>(whitespace, encoding, bullet points)"]

        Structure --> Sections
        Sections --> EntityExtract
        EntityExtract --> Normalize
    end

    subgraph "Phase 3 — ANALYZE"
        ATSCheck["ATS Compatibility Check<br/>(formatting, keywords, section presence)"]
        GrammarCheck["Grammar & Readability<br/>(language-tool / GPT)"]
        ImpactScore["Impact Scoring<br/>(quantified achievements, action verbs)"]
        GapAnalysis["Skills Gap Analysis<br/>(vs industry benchmarks)"]
        KeywordDensity["Keyword Density & Optimization"]

        Normalize --> ATSCheck
        Normalize --> GrammarCheck
        Normalize --> ImpactScore
        Normalize --> GapAnalysis
        Normalize --> KeywordDensity
    end

    subgraph "Phase 4 — MATCH (if JD provided)"
        JDParse["Parse Job Description<br/>(same pipeline as resume)"]
        EmbedResume["Generate resume embedding<br/>(text-embedding-3-large → pgvector)"]
        EmbedJD["Generate JD embedding"]
        CosineSim["Cosine similarity match score"]
        SkillMatrix["Skill requirement matrix<br/>(must-have vs nice-to-have vs missing)"]
        CultureFit["Culture & soft skills alignment"]

        JDParse --> EmbedJD
        Normalize --> EmbedResume
        EmbedResume --> CosineSim
        EmbedJD --> CosineSim
        CosineSim --> SkillMatrix
        SkillMatrix --> CultureFit
    end

    subgraph "Phase 5 — OPTIMIZE"
        Strategy["Select optimization strategy<br/>(tailor / enhance / rewrite / format)"]
        PromptBuild["Build structured prompt<br/>(template + resume + JD + instructions)"]
        StreamGen["Stream GPT-4o generation<br/>(SSE → real-time preview)"]
        QualityCheck["Quality validation<br/>(hallucination check, format preservation)"]
        HumanLoop["Human-in-the-loop review<br/>(accept/reject/edit each section)"]

        Strategy --> PromptBuild
        PromptBuild --> StreamGen
        StreamGen --> QualityCheck
        QualityCheck -->|Pass| HumanLoop
        QualityCheck -->|Fail| PromptBuild
    end

    subgraph "Phase 6 — EXPORT"
        TemplateApply["Apply selected template<br/>(LaTeX / HTML/CSS)"]
        PDFGen["Generate PDF<br/>(Puppeteer / Typst)"]
        DOCXGen["Generate DOCX<br/>(python-docx via microservice)"]
        JSONExport["JSON export<br/>(structured data, ATS format)"]
        StoreExport["Store export in S3<br/>(presigned URL, 24h expiry)"]

        HumanLoop --> TemplateApply
        TemplateApply --> PDFGen
        TemplateApply --> DOCXGen
        TemplateApply --> JSONExport
        PDFGen --> StoreExport
        DOCXGen --> StoreExport
        JSONExport --> StoreExport
    end
```

### 6.2 AI Prompt Orchestration

```mermaid
sequenceDiagram
    participant Client
    participant API
    participant PromptSvc as PromptTemplateService
    participant TokenSvc as TokenAccountingService
    participant OpenAI
    participant Cache as Redis Cache

    Client->>API: POST /ai/analyze {resumeId, type: "full_analysis"}

    API->>TokenSvc: checkQuota(userId, "full_analysis")
    
    alt Insufficient credits
        TokenSvc-->>API: {allowed: false, remaining: 0}
        API-->>Client: 402 Payment Required
    end

    TokenSvc-->>API: {allowed: true, remaining: 42}

    API->>Cache: GET analysis:{resumeId}:{type}:v2
    
    alt Cache hit (same resume + same analysis type)
        Cache-->>API: cached analysis result
        API-->>Client: 200 {result, source: "cache"}
    end

    API->>PromptSvc: buildPrompt("full_analysis", {resume, context})
    PromptSvc->>PromptSvc: Load template from prompt library
    PromptSvc->>PromptSvc: Inject resume sections, job context
    PromptSvc->>PromptSvc: Apply system prompt + safety guardrails
    PromptSvc-->>API: {messages: [...], config: {model, temp, maxTokens}}

    API->>OpenAI: chat.completions.create({stream: true, ...})
    
    Note over API,OpenAI: SSE Streaming

    loop Stream tokens
        OpenAI-->>API: data: {"choices":[{"delta":{"content":"..."}}]}
        API->>TokenSvc: countTokens(delta)
        API-->>Client: SSE: {"type": "token", "content": "..."}
    end

    OpenAI-->>API: data: [DONE]

    API->>TokenSvc: deductCredits(userId, totalTokens)
    TokenSvc->>Cache: SET usage:{userId}:{date} (decrement)
    TokenSvc->>DB: INSERT creditLedger (deduction)

    API->>API: Parse & validate AI response (Zod schema)
    
    alt Validation failed
        API->>OpenAI: Retry with stricter prompt (max 1 retry)
    end

    API->>DB: INSERT analysis record
    API->>Cache: SET analysis:{resumeId}:{type}:v2 (TTL: 24h)
    API-->>Client: SSE: {"type": "complete", "analysisId": "..."}
```

### 6.3 AI Model Fallback Strategy

```mermaid
graph TD
    Request["AI Request Received"]

    subgraph "Primary Path"
        CheckQuota["Check user quota & plan tier"]
        SelectModel["Select model by plan:<br/>Free: gpt-4o-mini<br/>Pro: gpt-4o<br/>Enterprise: gpt-4o + fine-tuned"]
        CallPrimary["Call primary model<br/>(with timeout: 60s)"]
    end

    subgraph "Fallback Decision Tree"
        Timeout{Timeout?}
        RateLimit{Rate limited?}
        ContentFilter{Content filter?}
        ServerError{5xx error?}
    end

    subgraph "Fallback Actions"
        Retry1["Retry with backoff<br/>(1s, 2s, 4s — max 3 retries)"]
        DegradeModel["Degrade model tier<br/>(gpt-4o → gpt-4o-mini)"]
        UseCache["Serve cached response<br/>(if available + similar)"]
        QueueLater["Queue for later + notify user"]
        FailGracefully["Return error with suggestion<br/>(try again later / rephrase)"]
    end

    Request --> CheckQuota
    CheckQuota --> SelectModel
    SelectModel --> CallPrimary

    CallPrimary --> Timeout
    CallPrimary --> RateLimit
    CallPrimary --> ContentFilter
    CallPrimary --> ServerError

    Timeout -->|Yes| Retry1
    RateLimit -->|Yes| DegradeModel
    ContentFilter -->|Yes| FailGracefully
    ServerError -->|Yes| Retry1

    Retry1 -->|Exhausted| DegradeModel
    DegradeModel -->|Still failing| UseCache
    UseCache -->|No cache| QueueLater
    QueueLater -->|Queue full| FailGracefully
```

### 6.4 Token Accounting & Cost Control

```mermaid
graph LR
    subgraph "Token Metering"
        PreFlight["Pre-flight estimate<br/>(tiktoken: count input tokens)"]
        RealTime["Real-time tracking<br/>(stream token counter)"]
        PostHoc["Post-hoc reconciliation<br/>(actual usage vs estimate)"]
    end

    subgraph "Cost Allocation"
        PerUser["Per-user daily/monthly cap"]
        PerRequest["Per-request budget<br/>(max_tokens enforcement)"]
        PerModel["Per-model pricing<br/>(gpt-4o: $2.50/1M in, $10/1M out)"]
        MarkupCalc["Platform markup<br/>(30% margin on AI costs)"]
    end

    subgraph "Quota Enforcement"
        HardLimit["Hard limit: block when quota reached"]
        SoftLimit["Soft limit: warn at 80%, 90%, 100%"]
        OverageBilling["Overage billing:<br/>auto top-up or invoice"]
        PlanUpgrade["Plan upgrade prompt<br/>(inline upsell)"]
    end

    subgraph "Monitoring"
        Dashboard["Usage dashboard<br/>(real-time, per-endpoint)"]
        Alerts["Anomaly alerts<br/>(spike detection, abuse prevention)"]
        WeeklyReport["Weekly cost report<br/>(per user, per model, total)"]
    end

    PreFlight --> RealTime
    RealTime --> PostHoc
    PostHoc --> PerUser
    PerUser --> HardLimit
    PerUser --> SoftLimit
    SoftLimit --> OverageBilling
    SoftLimit --> PlanUpgrade
    PerUser --> Dashboard
    PerUser --> Alerts
    PerUser --> WeeklyReport
```

---

## Appendix A — Technology Stack Summary

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | Next.js 15 (App Router) | SSR/SSG/ISR, React Server Components |
| | React 19 | UI component library |
| | Tailwind CSS + shadcn/ui | Styling system |
| | TanStack Query v5 | Server state, caching, mutations |
| | Zustand | Client state (auth, UI) |
| | React Hook Form + Zod | Form handling + validation |
| | TipTap / Plate | Rich text resume editor |
| | react-pdf | Client-side PDF preview |
| **Backend** | NestJS 11 | Modular API framework |
| | Prisma ORM | Type-safe database access |
| | BullMQ | Job queue (Redis-backed) |
| | Zod | Runtime validation |
| | Pino | Structured logging |
| | Swagger/OpenAPI | API documentation |
| **Data** | PostgreSQL 16 + pgvector | Primary DB + vector search |
| | Redis 7 | Cache, sessions, queues |
| | MinIO / AWS S3 | Object storage |
| | Meilisearch | Full-text search |
| **AI** | OpenAI GPT-4o / GPT-4o-mini | Text generation |
| | OpenAI text-embedding-3-large | Semantic embeddings |
| | LangChain / Vercel AI SDK | Prompt chaining, streaming |
| | tiktoken | Token counting |
| **DevOps** | Docker + Docker Compose | Containerization |
| | GitHub Actions | CI/CD |
| | Traefik / Nginx | Reverse proxy |
| | Prometheus + Grafana | Monitoring |
| | Sentry | Error tracking |
| | Loki | Log aggregation |

---

## Appendix B — Environment Variables Schema

```env
# === Application ===
NODE_ENV=production
APP_URL=https://resumepilot.ai
API_URL=https://api.resumepilot.ai

# === Database ===
DATABASE_URL=postgresql://user:pass@host:5432/resumepilot?schema=public
DATABASE_URL_REPLICA=postgresql://user:pass@replica:5432/resumepilot

# === Redis ===
REDIS_URL=redis://:pass@host:6379/0
REDIS_CACHE_URL=redis://:pass@host:6379/1
REDIS_QUEUE_URL=redis://:pass@host:6379/2

# === Storage (S3) ===
S3_ENDPOINT=https://s3.amazonaws.com
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=AKIA...
S3_SECRET_ACCESS_KEY=...
S3_BUCKET=resumepilot-prod
S3_PUBLIC_BUCKET=resumepilot-public

# === Auth ===
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

# === Email ===
RESEND_API_KEY=re_...
EMAIL_FROM=noreply@resumepilot.ai

# === LinkedIn ===
LINKEDIN_CLIENT_ID=...
LINKEDIN_CLIENT_SECRET=...

# === Meilisearch ===
MEILISEARCH_URL=https://search.resumepilot.ai
MEILISEARCH_API_KEY=...

# === Monitoring ===
SENTRY_DSN=https://...@sentry.io/...
```

---

> **Document Version:** 1.0.0 | **Last Updated:** 2026-06-16 | **Author:** ResumePilot AI Architecture Team
