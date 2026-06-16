<p align="center">
  <h1 align="center">🎯 ResumePilot AI</h1>
  <p align="center">AI 驱动的简历分析与优化平台</p>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-15-black?logo=next.js" />
  <img src="https://img.shields.io/badge/NestJS-11-red?logo=nestjs" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-blue?logo=postgresql" />
  <img src="https://img.shields.io/badge/DeepSeek-V4-536DFE?logo=openai" />
  <img src="https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker" />
  <img src="https://img.shields.io/badge/license-MIT-green" />
  <img src="https://img.shields.io/github/actions/workflow/status/takumi399/ResumePilot-AI-/ci.yml?label=CI" />
</p>

---

## ✨ 功能

- 🔐 **JWT 双令牌认证** — Access Token + Refresh Token 轮换，HttpOnly Cookie 防 XSS
- 📄 **简历上传** — 支持 PDF / DOCX / TXT，SHA-256 去重 + Magic Bytes 安全校验
- 🤖 **AI 评分引擎** — 三层架构：规则引擎 + LLM 语义分析 + 自适应评分融合
- 📊 **ATS 评分报告** — 6 维度评分（技能匹配/关键词覆盖/经验相关性/项目质量/教育/格式）
- 💡 **AI 优化建议** — 缺失技能补充 / STAR 改写 / 弱描述增强
- 🗄️ **多版本管理** — 简历版本历史，差异对比，一键恢复
- 🌐 **URL 抓取** — 粘贴招聘链接自动提取 JD 内容

## 🏗️ 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Next.js 15 · React 19 · Tailwind CSS · shadcn/ui · TanStack Query · Zustand |
| 后端 | NestJS 11 · TypeScript · Prisma ORM · BullMQ |
| 数据库 | PostgreSQL 16 + pgvector |
| 缓存 | Redis 7 |
| 存储 | AWS S3 兼容 (MinIO) |
| AI | DeepSeek V4 / OpenAI · Structured Outputs |
| 部署 | Docker · GitHub Actions CI |

## 🚀 快速开始

### 前置条件

- Node.js >= 20
- pnpm >= 9
- Docker Desktop

### 本地开发

```bash
# 1. 安装依赖
pnpm install

# 2. 启动基础设施 (PostgreSQL + Redis + MinIO)
docker compose up -d postgres redis minio minio-init

# 3. 初始化数据库
cd apps/api
cp .env.example .env   # 编辑填入配置
npx prisma db push
cd ../..

# 4. 启动后端 (端口 3001)
pnpm --filter @resumepilot/api dev

# 5. 启动前端 (端口 3002)
pnpm --filter @resumepilot/web dev
```

打开 `http://localhost:3002` 即可使用。Swagger 文档在 `http://localhost:3001/api/docs`。

### 配置 AI

编辑 `.env`，填入你的 API Key：

```bash
# DeepSeek (推荐，国内可用，极低价格)
AI_BASE_URL=https://api.deepseek.com/v1
AI_API_KEY=sk-your-key-here
AI_MODEL=deepseek-chat

# 或者 OpenAI
# AI_BASE_URL=https://api.openai.com/v1
# AI_API_KEY=sk-your-key-here
# AI_MODEL=gpt-4o-mini
```

### Docker 一键部署

```bash
# 开发环境
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# 生产环境
cp .env.production .env  # 编辑生产密钥
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

## 📁 项目结构

```
ResumePilot AI/
├── apps/
│   ├── api/                  # NestJS 后端
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── auth/         # JWT 认证 + Token 轮换
│   │   │   │   ├── resumes/      # 简历 CRUD + 文件上传
│   │   │   │   ├── jobs/         # 岗位 JD 管理
│   │   │   │   ├── ats/          # ATS 评分引擎
│   │   │   │   ├── optimizer/    # AI 简历优化
│   │   │   │   ├── dashboard/    # 仪表盘统计
│   │   │   │   └── analysis/     # 分析历史
│   │   │   └── common/           # Guards / Filters / Interceptors
│   │   └── prisma/               # 数据库 Schema
│   └── web/                  # Next.js 前端
│       └── src/
│           ├── app/              # App Router 页面
│           ├── components/       # shadcn/ui 组件
│           ├── hooks/            # React Query Hooks
│           ├── stores/           # Zustand Stores
│           └── lib/              # API Client / 工具函数
├── database/                 # 数据库设计文档 + SQL
├── docker/                   # Nginx 配置
├── test-data/                # 测试用简历和 JD
└── docker-compose.yml        # 基础设施编排
```

## 📊 评分引擎架构

```
输入: 简历 + JD
  │
  ├─ Layer 1: 规则引擎 (0ms，确定性)
  │   ├─ 精确关键词匹配 + Levenshtein 模糊匹配
  │   ├─ TF-IDF 关键词提取
  │   ├─ STAR 法则检测 + 行为动词分析
  │   └─ 格式兼容性检查
  │
  ├─ Layer 2: LLM 语义分析 (1-3s，语义理解)
  │   ├─ 技能上下文验证
  │   ├─ 经验深度评估
  │   └─ 职业轨迹分析
  │
  └─ Layer 3: 自适应评分融合
      └─ final = α×rule_score + (1-α)×llm_score
```

## 📝 License

MIT
