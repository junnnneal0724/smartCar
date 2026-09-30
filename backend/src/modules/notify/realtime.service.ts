import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Subject } from 'rxjs';
import { DomainEvent, DomainEvents } from '../../libs/common/events';

export interface RealtimeMessage {
  topic: string;
  data: unknown;
  ts: number;
}

/**
 * 实时推送：车机屏幕需要"车在动"的连续感，所以用 SSE 单向推送。
 * 之所以不用 WebSocket：车内场景是"服务端持续推、客户端只读"，
 * SSE 更简单（原生 EventSource、自动重连、走 HTTP 便于网关统一鉴权）。
 */
@Injectable()
export class RealtimeService implements OnModuleDestroy {
  private readonly logger = new Logger('Realtime');
  private readonly subject = new Subject<RealtimeMessage>();
  private heartbeat: NodeJS.Timeout;
  private peak = 0;

  constructor(private readonly events: DomainEvents) {
    const topics = [
      DomainEvent.VEHICLE_POSITION,
      DomainEvent.RIDE_STATUS_CHANGED,
      DomainEvent.RIDE_PROGRESS,
      DomainEvent.RIDE_BEHAVIOR,
      DomainEvent.RIDE_STOP_REQUESTED,
      DomainEvent.CABIN_CHANGED,
      DomainEvent.NOTICE,
    ];
    for (const t of topics) {
      this.events.on(t, (payload) => this.subject.next({ topic: t, data: payload, ts: Date.now() }));
    }
    // 心跳：既保活，也让前端能判断连接是否健康
    this.heartbeat = setInterval(() => {
      this.subject.next({ topic: 'heartbeat', data: { sim: Date.now() }, ts: Date.now() });
      this.watchMemory();
    }, 15000);
  }

  /**
   * 自查：SSE 是永不结束的流，一旦有连接没被正确销毁，业务进程会一直往
   * 没人读的缓冲区里推事件，最后以堆溢出收场（而且崩一次就是几小时之后，
   * 完全看不出是这个原因）。这里把苗头提前写进日志。
   */
  private lastWarnAt = 0;
  private watchMemory(): void {
    const { subscribers, rssMb, heapUsedMb } = this.stats;
    const now = Date.now();
    if (now - this.lastWarnAt < 5 * 60 * 1000) return;
    if (subscribers > 12 || heapUsedMb > 512) {
      this.lastWarnAt = now;
      this.logger.warn(
        `实时推送连接数 ${subscribers}（历史峰值 ${this.peak}）、堆占用 ${heapUsedMb}MB、常驻 ${rssMb}MB，` +
          `如果这些数字只涨不跌，多半是有 SSE 连接没被销毁`,
      );
    }
  }

  get stream$() {
    return this.subject.asObservable();
  }

  push(topic: string, data: unknown) {
    this.subject.next({ topic, data, ts: Date.now() });
  }

  get stats() {
    const count = this.subject.observers.length;
    this.peak = Math.max(this.peak, count);
    const mem = process.memoryUsage();
    return {
      subscribers: count,
      peak: this.peak,
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      rssMb: Math.round(mem.rss / 1024 / 1024),
    };
  }

  onModuleDestroy(): void {
    clearInterval(this.heartbeat);
    this.subject.complete();
  }
}
