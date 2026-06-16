# ResumePilot AI — 生产部署清单

## 部署前必做 (缺一不可)

### 1. 生成安全密钥
```bash
openssl rand -hex 64  # JWT_ACCESS_SECRET
openssl rand -hex 64  # JWT_REFRESH_SECRET
```

### 2. 配置 .env.production
复制 `.env.production` 并填入真实值：
- [ ] `JWT_ACCESS_SECRET` + `JWT_REFRESH_SECRET`
- [ ] `OPENAI_API_KEY=sk-prod-...`
- [ ] `S3_ACCESS_KEY` + `S3_SECRET_KEY` (AWS S3 或 Cloudflare R2)
- [ ] `COOKIE_DOMAIN=.你的域名.com`
- [ ] `NEXT_PUBLIC_API_URL=https://api.你的域名.com`
- [ ] 数据库密码 (`DB_PASSWORD`)

### 3. SSL 证书
```bash
# 用 Certbot 自动获取
certbot certonly --standalone -d resumepilot.ai -d api.resumepilot.ai
# 证书放入 docker/ssl/
```

### 4. 部署
```bash
# 复制生产配置
cp .env.production .env

# 构建 + 启动
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# 验证
curl https://你的域名.com/health
# → {"status":"ready","checks":{"database":"ok","redis":"ok"}}
```

## 已修复的问题

| 问题 | 状态 |
|------|------|
| Cookie 生产环境 secure + domain | ✅ 通过 `COOKIE_DOMAIN` 环境变量配置 |
| JWT 密钥验证 (生产环境缺失→启动报错) | ✅ `configuration.ts` 启动时校验 |
| 数据库连接池 (Prisma connection_limit) | ✅ `schema.prisma` 支持 `DIRECT_URL` |
| 前端 API URL (构建时注入) | ✅ Dockerfile `ARG NEXT_PUBLIC_API_URL` |
| 生产环境变量模板 | ✅ `.env.production` |
| 健康检查端点 | ✅ `/health` (liveness) + `/ready` (readiness) |

## CI/CD (GitHub Actions)

推送代码到 `main` 分支后自动执行：
1. `lint` + `type-check`
2. `test`
3. `docker build` (API + Web)

## 推荐托管方案

小规模起步: 1 台 4vCPU/8GB VPS + Docker Compose
- Hetzner CX41 (~$10/月) / Vultr (~$24/月)
- 或 Railway (PostgreSQL + Redis 托管 ~$30/月) + Vercel (前端免费)
