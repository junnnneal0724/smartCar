import { Controller, Get, Query, Sse, type MessageEvent } from '@nestjs/common';
import { interval, map, merge, type Observable } from 'rxjs';
import { RealtimeService } from './realtime.service';

@Controller('api/realtime')
export class RealtimeController {
  constructor(private readonly realtime: RealtimeService) {}

  /**
   * SSE 长连接。
   * 事件格式：{ topic, data, ts }
   * 可用 topics=vehicle.position,ride.progress 过滤；不传则订阅全部。
   */
  @Sse('subscribe')
  subscribe(@Query('topics') topics?: string): Observable<MessageEvent> {
    const allow = topics ? new Set(topics.split(',').map((s) => s.trim()).filter(Boolean)) : null;

    const data$ = this.realtime.stream$.pipe(
      map((m) => ({ data: JSON.stringify(m) }) as MessageEvent),
    );

    // 注释帧心跳：某些代理会在长连接静默时断开
    const keepAlive$ = interval(20000).pipe(
      map(() => ({ data: JSON.stringify({ topic: 'ping', data: {}, ts: Date.now() }) }) as MessageEvent),
    );

    if (!allow) return merge(data$, keepAlive$);
    return merge(
      this.realtime.stream$.pipe(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        map((m: any) => m as { topic: string; data: unknown; ts: number }),
        // 过滤在前端做也可，但服务端过滤能显著降低弱终端的解析压力
        map((m) => (allow.has(m.topic) || m.topic === 'heartbeat' ? ({ data: JSON.stringify(m) } as MessageEvent) : null)),
      ) as unknown as Observable<MessageEvent>,
      keepAlive$,
    );
  }

  @Get('stats')
  stats() {
    return this.realtime.stats;
  }
}
