import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { BizError, ErrorCode, fail, type ApiResult } from './result';

/**
 * 统一出口：所有响应（含异常）都是 { code, message, data, traceId }。
 * 前端只认这一种结构，页面里不必为不同形状的错误各写一套处理。
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Http');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();
    const req = ctx.getRequest();
    const traceId = randomBytes(6).toString('hex');

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: ApiResult<null>;

    if (exception instanceof BizError) {
      // 业务异常默认 HTTP 200 + 业务码：车机把"业务被拒绝"和"网络断了"分开处理
      status = exception.httpStatus;
      body = fail(exception.code, exception.message, traceId);
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const r = exception.getResponse();
      const raw = typeof r === 'string' ? r : ((r as { message?: string | string[] })?.message ?? exception.message);
      body = fail(status, Array.isArray(raw) ? raw.join('；') : String(raw), traceId);
    } else {
      const err = exception as Error;
      this.logger.error(`未捕获异常 [${traceId}] ${req?.method} ${req?.url}: ${err?.message}`, err?.stack);
      body = fail(ErrorCode.INTERNAL, '服务开小差了，请稍后重试', traceId);
    }

    res.status(status);
    res.header?.('x-trace-id', traceId);
    res.send(body);
  }
}
