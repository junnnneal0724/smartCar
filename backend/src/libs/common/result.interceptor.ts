import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map, type Observable } from 'rxjs';
import { ok } from './result';

/**
 * 统一响应包装：成功响应也走 { code: 0, message, data }。
 * SSE 流必须是裸的 MessageEvent，所以遇到 text/event-stream 直接放过。
 */
@Injectable()
export class ResultInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest();
    const accept: string = req?.headers?.accept ?? '';
    if (accept.includes('text/event-stream')) return next.handle();
    return next.handle().pipe(
      map((data) => {
        // 已经是标准结构（例如手工构造过）就不重复包
        if (data && typeof data === 'object' && 'code' in data && 'traceId' in data) return data;
        return ok(data ?? null);
      }),
    );
  }
}
