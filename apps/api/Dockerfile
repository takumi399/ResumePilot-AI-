# ============================================================================
# ResumePilot AI — NestJS API Dockerfile
# ============================================================================
# 多阶段构建: deps → build → production
# 最终镜像仅包含生产依赖和构建产物 (~200MB)
# ============================================================================

# ============================================================================
# Stage 1: 依赖安装
# ============================================================================
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# 复制 workspace 配置
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY apps/api/package.json ./apps/api/

# 安装依赖 (仅 prod，减少体积)
RUN pnpm install --frozen-lockfile --prod --filter @resumepilot/api

# ============================================================================
# Stage 2: 构建
# ============================================================================
FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# 复制依赖
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules

# 复制源码并构建
COPY apps/api ./apps/api
RUN pnpm --filter @resumepilot/api exec pnpm prisma:generate
RUN pnpm --filter @resumepilot/api build

# ============================================================================
# Stage 3: 生产运行
# ============================================================================
FROM node:22-alpine AS production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

WORKDIR /app

# 复制生产依赖
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY apps/api/package.json ./apps/api/

# 切换到非 root 用户
USER nestjs

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

# Prisma migrate + 启动
CMD ["sh", "-c", "cd apps/api && npx prisma migrate deploy && node dist/main.js"]
