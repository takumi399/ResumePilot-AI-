import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * API 标准错误响应结构
 * 所有异常通过此 filter 统一格式化输出
 */
interface ErrorResponse {
  statusCode: number;
  message: string | string[];
  error: string;
  timestamp: string;
  path: string;
  requestId?: string;
  /** 仅开发环境返回 */
  stack?: string;
}

/**
 * GlobalExceptionFilter — 全局异常过滤器
 *
 * 职责:
 *   1. 捕获所有未处理的异常 (包含 HttpException 和非 HTTP 异常)
 *   2. 统一错误响应格式 → 前端只需处理一种错误结构
 *   3. 记录完整的错误日志 (含 requestId、stack trace)
 *   4. 生产环境隐藏敏感的错误细节 (stack trace)
 *
 * NestJS 异常处理执行顺序:
 *   Controller 抛出异常
 *     → Method-level filter (离 Controller 最近)
 *       → Controller-level filter
 *         → Global filter (此处) ← 最终兜底
 *
 * 为什么自定义而不是用 NestJS 内置的:
 *   - 统一格式: 所有错误返回相同的 JSON schema
 *   - 日志集成: 自动记录到 Pino/控制台
 *   - 环境感知: 生产/开发环境返回不同的错误详情
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // 提取 requestId (由 LoggingInterceptor 注入)
    const requestId = (request as unknown as Record<string, unknown>).requestId as string | undefined;

    let statusCode: number;
    let message: string | string[];
    let error: string;

    // ================================================================
    // 处理 HttpException (NestJS 内置异常 + 自定义异常)
    // ================================================================
    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
        error = HttpStatus[statusCode] || 'Error';
      } else {
        const resp = exceptionResponse as Record<string, unknown>;
        message = (resp.message as string | string[]) || exception.message;
        error = (resp.error as string) || HttpStatus[statusCode] || 'Error';
      }
    }
    // ================================================================
    // 处理非 HTTP 异常 (未预期的运行时错误)
    // ================================================================
    else if (exception instanceof Error) {
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Internal Server Error';
      error = 'Internal Server Error';
      this.logger.error(
        `未处理的异常 [${requestId}] ${request.method} ${request.url}`,
        exception.stack,
      );
    }
    // ================================================================
    // 处理完全未知的异常 (理论上不应到达)
    // ================================================================
    else {
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Internal Server Error';
      error = 'Internal Server Error';
      this.logger.error(
        `未知异常类型 [${requestId}] ${request.method} ${request.url}`,
        String(exception),
      );
    }

    // ================================================================
    // 构建标准错误响应
    // ================================================================
    const errorResponse: ErrorResponse = {
      statusCode,
      message,
      error,
      timestamp: new Date().toISOString(),
      path: request.url,
      requestId,
    };

    // 开发环境添加 stack trace (方便调试)
    if (process.env.NODE_ENV !== 'production' && exception instanceof Error) {
      errorResponse.stack = exception.stack;
    }

    // 记录 5xx 错误 (需要告警处理的)
    if (statusCode >= 500) {
      this.logger.error(
        `[${requestId}] ${request.method} ${request.url} → ${statusCode} ${error}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }
    // 记录 4xx 错误 (仅 warn 级别，属于客户端错误)
    else if (statusCode >= 400) {
      this.logger.warn(
        `[${requestId}] ${request.method} ${request.url} → ${statusCode} ${JSON.stringify(message)}`,
      );
    }

    response.status(statusCode).json(errorResponse);
  }
}
