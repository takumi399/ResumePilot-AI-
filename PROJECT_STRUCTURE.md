# ResumePilot AI — Monorepo Structure Specification
## Next.js 15 + NestJS · TypeScript · Tailwind · shadcn/ui · Docker · GitHub Actions

---

## 1. COMPLETE MONOREPO DIRECTORY TREE

```
resumepilot/
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                          # Pull-request checks (lint, typecheck, test)
│   │   ├── cd-staging.yml                  # Deploy to staging on merge to main
│   │   └── cd-production.yml               # Deploy to production on release tag
│   ├── dependabot.yml                      # Auto-dependency bumps
│   └── PULL_REQUEST_TEMPLATE.md
│
├── apps/
│   ├── web/                                # Next.js 15 frontend
│   │   ├── public/
│   │   │   ├── favicon.ico
│   │   │   ├── robots.txt
│   │   │   └── images/
│   │   │       ├── logo.svg
│   │   │       ├── og-image.png
│   │   │       └── illustrations/
│   │   ├── src/
│   │   │   ├── app/                        # App Router (Next.js 15)
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── page.tsx
│   │   │   │   ├── not-found.tsx
│   │   │   │   ├── error.tsx
│   │   │   │   ├── loading.tsx
│   │   │   │   ├── global-error.tsx
│   │   │   │   ├── providers.tsx
│   │   │   │   ├── (auth)/                 # Route group — public auth pages
│   │   │   │   │   ├── layout.tsx
│   │   │   │   │   ├── login/
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   └── register/
│   │   │   │   │       └── page.tsx
│   │   │   │   ├── (dashboard)/            # Route group — authenticated pages
│   │   │   │   │   ├── layout.tsx
│   │   │   │   │   ├── dashboard/
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   ├── resumes/
│   │   │   │   │   │   ├── page.tsx
│   │   │   │   │   │   ├── [resumeId]/
│   │   │   │   │   │   │   ├── page.tsx
│   │   │   │   │   │   │   └── edit/
│   │   │   │   │   │   │       └── page.tsx
│   │   │   │   │   │   └── new/
│   │   │   │   │   │       └── page.tsx
│   │   │   │   │   ├── jobs/
│   │   │   │   │   │   ├── page.tsx
│   │   │   │   │   │   └── [jobId]/
│   │   │   │   │   │       └── page.tsx
│   │   │   │   │   ├── analysis/
│   │   │   │   │   │   ├── page.tsx
│   │   │   │   │   │   └── [analysisId]/
│   │   │   │   │   │       └── page.tsx
│   │   │   │   │   ├── settings/
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   └── billing/
│   │   │   │   │       └── page.tsx
│   │   │   │   └── api/                    # Next.js API routes (BFF layer)
│   │   │   │       ├── auth/
│   │   │   │       │   └── [...nextauth]/
│   │   │   │       │       └── route.ts
│   │   │   │       └── webhooks/
│   │   │   │           └── stripe/
│   │   │   │               └── route.ts
│   │   │   ├── components/
│   │   │   │   ├── ui/                     # shadcn/ui primitives (auto-generated)
│   │   │   │   │   ├── button.tsx
│   │   │   │   │   ├── input.tsx
│   │   │   │   │   ├── dialog.tsx
│   │   │   │   │   ├── dropdown-menu.tsx
│   │   │   │   │   ├── card.tsx
│   │   │   │   │   ├── toast.tsx
│   │   │   │   │   ├── form.tsx
│   │   │   │   │   ├── skeleton.tsx
│   │   │   │   │   ├── tabs.tsx
│   │   │   │   │   ├── tooltip.tsx
│   │   │   │   │   ├── badge.tsx
│   │   │   │   │   ├── avatar.tsx
│   │   │   │   │   ├── separator.tsx
│   │   │   │   │   └── ...
│   │   │   │   ├── layout/
│   │   │   │   │   ├── app-shell.tsx
│   │   │   │   │   ├── sidebar.tsx
│   │   │   │   │   ├── topbar.tsx
│   │   │   │   │   ├── footer.tsx
│   │   │   │   │   └── page-container.tsx
│   │   │   │   ├── auth/
│   │   │   │   │   ├── login-form.tsx
│   │   │   │   │   ├── register-form.tsx
│   │   │   │   │   └── auth-guard.tsx
│   │   │   │   ├── resumes/
│   │   │   │   │   ├── resume-list.tsx
│   │   │   │   │   ├── resume-card.tsx
│   │   │   │   │   ├── resume-editor.tsx
│   │   │   │   │   ├── resume-preview.tsx
│   │   │   │   │   ├── section-editor.tsx
│   │   │   │   │   └── ats-score-badge.tsx
│   │   │   │   ├── jobs/
│   │   │   │   │   ├── job-list.tsx
│   │   │   │   │   ├── job-card.tsx
│   │   │   │   │   ├── job-description-parser.tsx
│   │   │   │   │   └── skill-match-chart.tsx
│   │   │   │   ├── analysis/
│   │   │   │   │   ├── match-score.tsx
│   │   │   │   │   ├── gap-analysis.tsx
│   │   │   │   │   ├── keyword-radar.tsx
│   │   │   │   │   └── improvement-plan.tsx
│   │   │   │   ├── shared/
│   │   │   │   │   ├── empty-state.tsx
│   │   │   │   │   ├── error-state.tsx
│   │   │   │   │   ├── loading-state.tsx
│   │   │   │   │   ├── confirm-dialog.tsx
│   │   │   │   │   ├── pagination.tsx
│   │   │   │   │   └── search-input.tsx
│   │   │   │   └── charts/
│   │   │   │       ├── radar-chart.tsx
│   │   │   │       ├── bar-chart.tsx
│   │   │   │       └── donut-chart.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── use-auth.ts
│   │   │   │   ├── use-resumes.ts
│   │   │   │   ├── use-resume-mutations.ts
│   │   │   │   ├── use-jobs.ts
│   │   │   │   ├── use-analysis.ts
│   │   │   │   ├── use-billing.ts
│   │   │   │   ├── use-debounce.ts
│   │   │   │   └── use-media-query.ts
│   │   │   ├── services/
│   │   │   │   ├── api-client.ts            # Fetch wrapper (base URL, auth header, error norm)
│   │   │   │   ├── auth.service.ts
│   │   │   │   ├── resumes.service.ts
│   │   │   │   ├── jobs.service.ts
│   │   │   │   ├── analysis.service.ts
│   │   │   │   └── billing.service.ts
│   │   │   ├── stores/                       # Zustand or Jotai atoms
│   │   │   │   ├── auth-store.ts
│   │   │   │   ├── ui-store.ts
│   │   │   │   └── resume-draft-store.ts
│   │   │   ├── lib/
│   │   │   │   ├── utils.ts
│   │   │   │   ├── constants.ts
│   │   │   │   ├── validators.ts
│   │   │   │   ├── format.ts
│   │   │   │   └── analytics.ts
│   │   │   ├── types/
│   │   │   │   └── index.ts                  # Re-exports from @resumepilot/shared
│   │   │   └── styles/
│   │   │       ├── globals.css
│   │   │       └── tokens.css
│   │   ├── tailwind.config.ts
│   │   ├── postcss.config.mjs
│   │   ├── next.config.ts
│   │   ├── tsconfig.json
│   │   ├── components.json                   # shadcn/ui config
│   │   ├── .env.local.example
│   │   └── package.json
│   │
│   └── api/                                  # NestJS backend
│       ├── src/
│       │   ├── main.ts                       # Bootstrap, global pipes, Swagger, CORS
│       │   ├── app.module.ts                 # Root module — imports all feature modules
│       │   ├── common/
│       │   │   ├── decorators/
│       │   │   │   ├── current-user.decorator.ts
│       │   │   │   ├── public.decorator.ts
│       │   │   │   ├── roles.decorator.ts
│       │   │   │   └── api-paginated-response.decorator.ts
│       │   │   ├── filters/
│       │   │   │   ├── http-exception.filter.ts
│       │   │   │   └── validation-exception.filter.ts
│       │   │   ├── guards/
│       │   │   │   ├── jwt-auth.guard.ts
│       │   │   │   ├── roles.guard.ts
│       │   │   │   └── throttle.guard.ts
│       │   │   ├── interceptors/
│       │   │   │   ├── response-transform.interceptor.ts
│       │   │   │   ├── logging.interceptor.ts
│       │   │   │   └── cache.interceptor.ts
│       │   │   ├── pipes/
│       │   │   │   ├── parse-object-id.pipe.ts
│       │   │   │   └── validation.pipe.ts    # Global Zod validation pipe
│       │   │   ├── middleware/
│       │   │   │   ├── request-id.middleware.ts
│       │   │   │   └── cors.middleware.ts
│       │   │   └── dto/
│       │   │       ├── pagination.dto.ts
│       │   │       └── api-response.dto.ts
│       │   ├── config/
│       │   │   ├── configuration.ts          # Typed config loader (env → typed object)
│       │   │   ├── database.config.ts
│       │   │   ├── auth.config.ts
│       │   │   ├── ai.config.ts
│       │   │   ├── storage.config.ts
│       │   │   └── redis.config.ts
│       │   ├── modules/
│       │   │   ├── auth/
│       │   │   │   ├── auth.module.ts
│       │   │   │   ├── auth.controller.ts
│       │   │   │   ├── auth.service.ts
│       │   │   │   ├── strategies/
│       │   │   │   │   ├── jwt.strategy.ts
│       │   │   │   │   └── google.strategy.ts
│       │   │   │   └── dto/
│       │   │   │       ├── login.dto.ts
│       │   │   │       ├── register.dto.ts
│       │   │   │       └── token-response.dto.ts
│       │   │   ├── users/
│       │   │   │   ├── users.module.ts
│       │   │   │   ├── users.controller.ts
│       │   │   │   ├── users.service.ts
│       │   │   │   ├── users.repository.ts
│       │   │   │   ├── schemas/
│       │   │   │   │   └── user.schema.ts
│       │   │   │   └── dto/
│       │   │   │       ├── create-user.dto.ts
│       │   │   │       └── update-user.dto.ts
│       │   │   ├── resumes/
│       │   │   │   ├── resumes.module.ts
│       │   │   │   ├── resumes.controller.ts
│       │   │   │   ├── resumes.service.ts
│       │   │   │   ├── resumes.repository.ts
│       │   │   │   ├── schemas/
│       │   │   │   │   └── resume.schema.ts
│       │   │   │   └── dto/
│       │   │   │       ├── create-resume.dto.ts
│       │   │   │       ├── update-resume.dto.ts
│       │   │   │       └── export-resume.dto.ts
│       │   │   ├── jobs/
│       │   │   │   ├── jobs.module.ts
│       │   │   │   ├── jobs.controller.ts
│       │   │   │   ├── jobs.service.ts
│       │   │   │   ├── jobs.repository.ts
│       │   │   │   ├── schemas/
│       │   │   │   │   └── job.schema.ts
│       │   │   │   └── dto/
│       │   │   │       ├── create-job.dto.ts
│       │   │   │       └── update-job.dto.ts
│       │   │   ├── analysis/
│       │   │   │   ├── analysis.module.ts
│       │   │   │   ├── analysis.controller.ts
│       │   │   │   ├── analysis.service.ts
│       │   │   │   ├── analysis.repository.ts
│       │   │   │   ├── schemas/
│       │   │   │   │   └── analysis.schema.ts
│       │   │   │   └── dto/
│       │   │   │       ├── analyze-request.dto.ts
│       │   │   │       └── analyze-response.dto.ts
│       │   │   ├── ai/
│       │   │   │   ├── ai.module.ts
│       │   │   │   ├── ai.service.ts          # LLM abstraction (OpenAI / Claude / local)
│       │   │   │   ├── ai.controller.ts       # (optional) direct streaming endpoints
│       │   │   │   ├── providers/
│       │   │   │   │   ├── openai.provider.ts
│       │   │   │   │   ├── claude.provider.ts
│       │   │   │   │   └── mock.provider.ts   # For e2e / cost-free dev
│       │   │   │   ├── prompts/
│       │   │   │   │   ├── resume-optimizer.prompt.ts
│       │   │   │   │   ├── ats-scorer.prompt.ts
│       │   │   │   │   └── cover-letter.prompt.ts
│       │   │   │   └── dto/
│       │   │   │       ├── completion.dto.ts
│       │   │   │       └── stream.dto.ts
│       │   │   ├── billing/
│       │   │   │   ├── billing.module.ts
│       │   │   │   ├── billing.controller.ts
│       │   │   │   ├── billing.service.ts
│       │   │   │   ├── billing.repository.ts
│       │   │   │   ├── schemas/
│       │   │   │   │   └── subscription.schema.ts
│       │   │   │   └── dto/
│       │   │   │       ├── create-checkout.dto.ts
│       │   │   │       └── portal-session.dto.ts
│       │   │   └── health/
│       │   │       ├── health.module.ts
│       │   │       └── health.controller.ts
│       │   ├── database/
│       │   │   ├── database.module.ts
│       │   │   ├── database.service.ts
│       │   │   └── migrations/
│       │   └── queue/
│       │       ├── queue.module.ts
│       │       ├── processors/
│       │       │   ├── analysis.processor.ts
│       │       │   └── export.processor.ts
│       │       └── jobs/
│       │           └── job-names.enum.ts
│       ├── test/
│       │   ├── e2e/
│       │   │   ├── auth.e2e-spec.ts
│       │   │   ├── resumes.e2e-spec.ts
│       │   │   └── jest-e2e.json
│       │   └── helpers/
│       │       ├── test-db.ts
│       │       └── fixtures.ts
│       ├── nest-cli.json
│       ├── tsconfig.json
│       ├── tsconfig.build.json
│       ├── .env.example
│       └── package.json
│
├── packages/
│   └── shared/                               # @resumepilot/shared
│       ├── src/
│       │   ├── index.ts                      # Barrel export
│       │   ├── types/
│       │   │   ├── user.types.ts
│       │   │   ├── resume.types.ts
│       │   │   ├── job.types.ts
│       │   │   ├── analysis.types.ts
│       │   │   ├── billing.types.ts
│       │   │   ├── auth.types.ts
│       │   │   └── api.types.ts              # Pagination, error envelope, etc.
│       │   ├── enums/
│       │   │   ├── user-role.enum.ts
│       │   │   ├── resume-status.enum.ts
│       │   │   ├── subscription-tier.enum.ts
│       │   │   └── analysis-type.enum.ts
│       │   ├── constants/
│       │   │   ├── limits.ts                 # Max file sizes, rate limits, etc.
│       │   │   ├── error-codes.ts
│       │   │   └── ai-prompts.ts
│       │   ├── validators/
│       │   │   ├── auth.validator.ts
│       │   │   ├── resume.validator.ts
│       │   │   └── common.validator.ts
│       │   └── utils/
│       │       ├── date.ts
│       │       ├── string.ts
│       │       └── scoring.ts
│       ├── tsconfig.json
│       └── package.json
│
├── docker/
│   ├── docker-compose.yml
│   ├── docker-compose.dev.yml
│   ├── docker-compose.prod.yml
│   ├── Dockerfile.web                        # Multi-stage Next.js build
│   ├── Dockerfile.api                        # Multi-stage NestJS build
│   └── nginx/
│       ├── nginx.conf
│       └── default.conf.template
│
├── scripts/
│   ├── setup.sh                              # First-run: install deps, copy .env, seed
│   ├── dev.sh                                # Start all services in dev
│   ├── clean.sh                              # Nuke node_modules, dist, Docker artifacts
│   └── db-migrate.sh                         # Run Prisma / TypeORM migrations
│
├── .vscode/
│   ├── settings.json
│   └── extensions.json
│
├── .gitignore
├── .prettierrc
├── .prettierignore
├── .eslintrc.js
├── .eslintignore
├── .markdownlint.json
├── .nvmrc
├── turbo.json                                # Turborepo pipeline
├── package.json                              # Root workspace package.json
├── pnpm-workspace.yaml                       # pnpm workspace definition
├── tsconfig.base.json                        # Shared TS compiler options
├── commitlint.config.js
├── README.md
└── LICENSE
```

---

## 2. FRONTEND STRUCTURE (`apps/web`)

### Page organization (Next.js 15 App Router)

| Route group    | Path pattern              | Auth required | Purpose                        |
|----------------|---------------------------|---------------|--------------------------------|
| `(auth)`       | `/login`, `/register`     | No            | Public authentication pages    |
| `(dashboard)`  | `/dashboard`              | Yes           | Main dashboard                 |
| `(dashboard)`  | `/resumes`                | Yes           | Resume list                    |
| `(dashboard)`  | `/resumes/[id]`           | Yes           | Resume detail / preview        |
| `(dashboard)`  | `/resumes/[id]/edit`      | Yes           | Resume editor                  |
| `(dashboard)`  | `/resumes/new`            | Yes           | New resume wizard              |
| `(dashboard)`  | `/jobs`                   | Yes           | Job listing                    |
| `(dashboard)`  | `/jobs/[id]`              | Yes           | Job detail + match analysis    |
| `(dashboard)`  | `/analysis/[id]`          | Yes           | Detailed analysis report       |
| `(dashboard)`  | `/settings`               | Yes           | Account settings               |
| `(dashboard)`  | `/billing`                | Yes           | Subscription management        |

### Component categorization

```
components/
├── ui/             ← shadcn/ui primitives. Never hand-edit; use `npx shadcn-ui add`
├── layout/         ← Structural components (sidebar, shell, topbar)
├── auth/           ← Authentication forms and guards
├── resumes/        ← Domain components for the resume feature
├── jobs/           ← Domain components for job descriptions
├── analysis/       ← Domain components for match analysis / ATS scoring
├── shared/         ← Cross-domain reusable components
└── charts/         ← Recharts / D3 wrappers (radar, bar, donut)
```

### Data-flow layers

```
Page (server component when possible)
  └── Feature component (client component)
        ├── useFeatureQuery()     ← React Query hook
        │     └── service.api.ts  ← Plain fetch wrapper
        └── useMutation()         ← React Query mutation
              └── service.api.ts
```

- **Server Components** fetch data directly when possible (no client JS for static / non-interactive sections).
- **Client Components** use React Query hooks that call thin service functions. Services use a shared `api-client.ts` that injects the auth token, normalizes errors, and sets a configurable base URL.

---

## 3. BACKEND STRUCTURE (`apps/api`)

### Module anatomy

Every feature module follows the same convention:

```
modules/<feature>/
├── <feature>.module.ts        ← NestJS module definition
├── <feature>.controller.ts   ← Route handlers (thin — delegate to service)
├── <feature>.service.ts      ← Business logic
├── <feature>.repository.ts   ← Data-access layer (Prisma / TypeORM / Mongoose)
├── schemas/
│   └── <entity>.schema.ts    ← DB model / entity definition
└── dto/
    ├── create-<feature>.dto.ts
    ├── update-<feature>.dto.ts
    └── query-<feature>.dto.ts
```

### Cross-cutting concerns in `common/`

| Directory       | Purpose                                          |
|-----------------|--------------------------------------------------|
| `decorators/`   | `@CurrentUser()`, `@Public()`, `@Roles()`        |
| `filters/`      | Global exception → standardized error envelope   |
| `guards/`       | JWT validation, RBAC, rate-limit                 |
| `interceptors/` | Wrap responses in `{ data, meta }` envelope, log |
| `pipes/`        | Zod / class-validator pipelines                  |
| `middleware/`   | Request ID injection, CORS                       |

### AI module design

```
modules/ai/
├── ai.service.ts            ← Single interface: complete(prompt, model?) → stream
├── providers/
│   ├── openai.provider.ts
│   ├── claude.provider.ts
│   └── mock.provider.ts     ← Deterministic responses for testing
└── prompts/
    ├── resume-optimizer.prompt.ts
    ├── ats-scorer.prompt.ts
    └── cover-letter.prompt.ts
```

The `ai.service.ts` exposes a provider-agnostic interface. The active provider is determined by env config (`AI_PROVIDER=openai|claude|mock`). Prompt files export functions that build messages from typed inputs (from `@resumepilot/shared`).

---

## 4. SHARED PACKAGE (`packages/shared`)

### Exports (via `package.json` `exports` field)

| Export path                    | Contents                                   |
|--------------------------------|--------------------------------------------|
| `@resumepilot/shared`          | All types, enums, constants, validators    |
| `@resumepilot/shared/types`    | TypeScript interfaces / type aliases only  |
| `@resumepilot/shared/enums`    | Enum definitions only                      |
| `@resumepilot/shared/validators` | Zod schemas only                         |
| `@resumepilot/shared/constants` | Magic numbers, error codes, limits       |

### Why a shared package

- Single source of truth for DTO shapes, preventing frontend/backend drift.
- Zod schemas used on both sides: backend validates incoming requests, frontend validates forms before submission.
- Enums (e.g., `SubscriptionTier`, `ResumeStatus`) stay in sync across the stack.
- AI prompt templates live here so they can be unit-tested in isolation.

---

## 5. CONFIGURATION FILE OVERVIEW

| File                         | Scope            | Purpose                                        |
|------------------------------|------------------|------------------------------------------------|
| `turbo.json`                 | Monorepo         | Turborepo pipeline (build, lint, test, dev)    |
| `pnpm-workspace.yaml`        | Monorepo         | Defines workspace packages (`apps/*`, `packages/*`) |
| `tsconfig.base.json`         | Monorepo         | Shared TS compiler settings extended by all    |
| `package.json` (root)        | Monorepo         | Workspace scripts (`dev`, `build`, `lint`, `test`) |
| `.eslintrc.js`               | Monorepo         | Shared ESLint config (flat config optional)    |
| `.prettierrc`                | Monorepo         | Formatting rules (single quotes, trailing commas) |
| `commitlint.config.js`       | Monorepo         | Conventional commits enforced                  |
| `.nvmrc`                     | Monorepo         | Pin Node.js version (LTS)                     |
| `next.config.ts`             | Frontend         | Image domains, redirects, env, output          |
| `tailwind.config.ts`         | Frontend         | Theme tokens, content paths, plugins           |
| `components.json`            | Frontend         | shadcn/ui paths and style config               |
| `nest-cli.json`              | Backend          | NestJS CLI — source root, compiler options    |
| `docker-compose.yml`         | Infrastructure   | Local dev services (DB, Redis, MinIO)          |
| `docker-compose.prod.yml`    | Infrastructure   | Production overrides                           |
| `Dockerfile.web`             | Infrastructure   | Multi-stage Next.js image (deps → build → runner) |
| `Dockerfile.api`             | Infrastructure   | Multi-stage NestJS image                       |

---

## 6. NAMING CONVENTIONS

### Files & directories

| Rule                        | Example                                  |
|-----------------------------|------------------------------------------|
| Directories: **kebab-case** | `resume-editor/`, `job-description-parser.tsx` |
| Component files: **kebab-case** | `ats-score-badge.tsx`, `match-score.tsx` |
| Hook files: `use-` prefix, **kebab-case** | `use-resumes.ts`, `use-debounce.ts` |
| Service files: `<domain>.service.ts` | `resumes.service.ts` |
| DTO files: `<action>-<entity>.dto.ts` | `create-resume.dto.ts` |
| Schema files: `<entity>.schema.ts` | `resume.schema.ts` |
| Test files: `<name>.spec.ts` (unit) or `<name>.e2e-spec.ts` (e2e) | `auth.service.spec.ts` |
| Type files: `<entity>.types.ts` | `resume.types.ts` |
| Enum files: `<name>.enum.ts` | `subscription-tier.enum.ts` |

### Code

| Rule                          | Example                                      |
|-------------------------------|----------------------------------------------|
| Components: **PascalCase**    | `ResumeEditor`, `AtsScoreBadge`             |
| Hooks: `use` prefix, **camelCase** | `useResumes`, `useDebounce`            |
| Services/classes: **PascalCase** | `ResumesService`, `AuthService`          |
| Functions: **camelCase**      | `getResumeById`, `parseJobDescription`       |
| Variables: **camelCase**      | `resumeList`, `isLoading`                    |
| Constants: **SCREAMING_SNAKE_CASE** | `MAX_FILE_SIZE`, `API_BASE_URL`       |
| Enums/Enum members: **PascalCase** / **SCREAMING_SNAKE_CASE** | `SubscriptionTier.PRO` |
| Interfaces: **PascalCase**, no `I` prefix | `Resume`, `JobAnalysis`           |
| Types: **PascalCase**, no `T` prefix | `ResumeStatus`, `ApiResponse<T>`       |
| Database tables/collections: **snake_case** plural | `resumes`, `job_descriptions` |
| Environment variables: **SCREAMING_SNAKE_CASE** | `DATABASE_URL`, `JWT_SECRET`        |
| Git branches: `feature/`, `fix/`, `chore/` prefix, **kebab-case** | `feature/resume-editor` |

---

## 7. FILE ORGANIZATION PRINCIPLES

1. **Colocation over classification** — Keep files that change together close together. A feature's components, hooks, and types live in the same directory rather than in top-level `components/`, `hooks/`, `types/` folders. The exception is `components/ui/` (shadcn) and `components/shared/` which are genuinely cross-cutting.

2. **Barrel exports at every boundary** — Every directory that is imported externally has an `index.ts` that re-exports its public API. Internal files never import sibling files directly; they go through the barrel.

3. **DTOs are the contract** — The NestJS controller's request/response shapes are defined in `dto/` and mirror the shared types. Backend-only validation logic stays in the DTO; shared validation lives in `@resumepilot/shared/validators`.

4. **One module, one responsibility** — A NestJS module owns exactly one domain aggregate. If a module grows beyond 7-10 files, split it or extract a sub-module.

5. **Thin controllers, fat services** — Controllers handle HTTP concerns only (parse params, call service, map to response DTO). Business logic lives in services. Data access lives in repositories.

6. **Environment-agnostic config** — All config values are read through `apps/api/src/config/configuration.ts` which validates env vars at startup and exports a typed config object. Never read `process.env` directly outside of `config/`.

7. **Shared package is runtime-agnostic** — `@resumepilot/shared` must never import Node.js or browser-specific APIs. It runs in both environments.

8. **Tests mirror source structure** — Unit tests sit next to the file they test (`<name>.spec.ts`). E2E tests live in `test/e2e/` and follow the module naming convention.

9. **Docker dev-prod parity** — `docker-compose.dev.yml` extends `docker-compose.yml` with hot-reload mounts and debug ports. Production uses the standalone `docker-compose.prod.yml` with no volume mounts and locked image tags.

10. **Migrations are source-controlled** — Database migrations live in the backend package (`apps/api/src/database/migrations/`) and are run as part of the CI/CD pipeline, never by hand in production.
