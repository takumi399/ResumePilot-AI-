import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';
import { Request, Response } from 'express';

/**
 * LoggingInterceptor — 请求/响应日志拦截器
 *
 * 职责:
 *   1. 为每个请求注入 X-Request-ID (追踪分布式调用链)
 *   2. 记录请求开始 (method, url, userId)
 *   3. 记录请求完成 (status code, 耗时)
 *   4. 记录请求失败 (异常信息)
 *
 * 日志格式:
 *   [requestId] → POST /api/v1/auth/login | user=xxx
 *   [requestId] ← POST /api/v1/auth/login | 200 | 45ms
 *   [requestId] ✗ POST /api/v1/auth/login | 401 | 12ms | Invalid credentials
 *
 * RxJS 操作符选用理由:
 *   - tap: 在 Observable 流中执行副作用 (日志)，不改变数据流
 *   - catchError: 捕获流中的错误，记录后重新抛出 (让 GlobalExceptionFilter 处理响应)
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    // 生成请求追踪 ID
    const requestId = uuidv4();
    (request as unknown as Record<string, unknown>).requestId = requestId;
    response.setHeader('X-Request-ID', requestId);

    const { method, url } = request;
    const reqUser = (request as unknown as Record<string, unknown>).user as { sub: string } | undefined;
    const userId = reqUser?.sub ?? 'anonymous';
    const now = Date.now();

    // 记录请求开始
    this.logger.log(`[${requestId}] → ${method} ${url} | user=${userId}`);

    return next.handle().pipe(
      tap({
        next: () => {
          const elapsed = Date.now() - now;
          this.logger.log(
            `[${requestId}] ← ${method} ${url} | ${response.statusCode} | ${elapsed}ms`,
          );
        },
        error: (error: Error) => {
          const elapsed = Date.now() - now;
          // 异常日志由 GlobalExceptionFilter 记录详细信息，此处仅记录摘要
          this.logger.warn(
            `[${requestId}] ✗ ${method} ${url} | ${elapsed}ms | ${error.message}`,
          );
        },
      }),
      catchError((error) => {
        // 重新抛出异常，让 GlobalExceptionFilter 处理 HTTP 响应
        return throwError(() => error);
      }),
    );
  }
}
