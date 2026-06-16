import { registerAs } from '@nestjs/config';

/**
 * [FIXED #12] 生产环境密钥不再有硬编码默认值
 * 开发环境提供安全的默认值 (仅本地 MinIO/Redis)
 * 生产环境缺失密钥 → 启动时抛出异常 (Fail Fast)
 */

const isProduction = process.env.NODE_ENV === 'production';

export const appConfig = registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001', 10),
  apiPrefix: process.env.API_PREFIX || 'api/v1',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
}));

export const jwtConfig = registerAs('jwt', () => {
  const accessSecret = process.env.JWT_ACCESS_SECRET;
  const refreshSecret = process.env.JWT_REFRESH_SECRET;

  if (isProduction) {
    if (!accessSecret) throw new Error('FATAL: JWT_ACCESS_SECRET 未配置 (生产环境必需)');
    if (!refreshSecret) throw new Error('FATAL: JWT_REFRESH_SECRET 未配置 (生产环境必需)');
    if (accessSecret.length < 32) throw new Error('FATAL: JWT_ACCESS_SECRET 长度不足 (最少 32 字符)');
    if (refreshSecret.length < 32) throw new Error('FATAL: JWT_REFRESH_SECRET 长度不足 (最少 32 字符)');
  }

  return {
    accessSecret: accessSecret || 'dev-access-secret-change-in-production',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshSecret: refreshSecret || 'dev-refresh-secret-change-in-production',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    issuer: process.env.JWT_ISSUER || 'resumepilot-api',
  };
});

export const redisConfig = registerAs('redis', () => ({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  password: process.env.REDIS_PASSWORD || undefined, // [FIXED] 不再默认空密码
  db: parseInt(process.env.REDIS_DB || '0', 10),
}));

export const bcryptConfig = registerAs('bcrypt', () => ({
  saltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10),
}));

export const throttleConfig = registerAs('throttle', () => ({
  ttl: parseInt(process.env.THROTTLE_TTL || '60', 10) * 1000,
  limit: parseInt(process.env.THROTTLE_LIMIT || '100', 10),
}));

export const s3Config = registerAs('s3', () => {
  const accessKey = process.env.S3_ACCESS_KEY;
  const secretKey = process.env.S3_SECRET_KEY;

  if (isProduction) {
    if (!accessKey) throw new Error('FATAL: S3_ACCESS_KEY 未配置 (生产环境必需)');
    if (!secretKey) throw new Error('FATAL: S3_SECRET_KEY 未配置 (生产环境必需)');
  }

  return {
    endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
    region: process.env.S3_REGION || 'us-east-1',
    accessKey: accessKey || 'minioadmin',       // 仅开发环境默认值
    secretKey: secretKey || 'minioadmin',        // 仅开发环境默认值
    bucket: process.env.S3_BUCKET || 'resumepilot-resumes',
    useSSL: process.env.S3_USE_SSL === 'true',
    uploadMaxSizeMB: parseInt(process.env.S3_UPLOAD_MAX_SIZE_MB || '10', 10),
    presignedUrlExpiresSec: parseInt(process.env.S3_PRESIGNED_URL_EXPIRES_SEC || '3600', 10),
  };
});

export const configLoad = [
  appConfig,
  jwtConfig,
  redisConfig,
  bcryptConfig,
  throttleConfig,
  s3Config,
];
