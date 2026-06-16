# ============================================================================
# ResumePilot AI — Next.js Web Dockerfile
# ============================================================================
# 多阶段构建: deps → build → production
# 使用 Next.js standalone 模式减小镜像体积
# ============================================================================

FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile --filter @resumepilot/web

# ============================================================================
# Stage 2: 构建
# ============================================================================
FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY apps/web/package.json apps/web/next.config.ts apps/web/tsconfig.json ./
COPY apps/web ./apps/web
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules

RUN pnpm --filter @resumepilot/web build

# ============================================================================
# Stage 3: 生产运行 (standalone)
# ============================================================================
FROM node:22-alpine AS production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

WORKDIR /app

# 复制 standalone 输出
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public

USER nextjs

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "apps/web/server.js"]
