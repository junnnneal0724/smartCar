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
    }, 15000);
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
    return { subscribers: count, peak: this.peak };
  }

  onModuleDestroy(): void {
    clearInterval(this.heartbeat);
    this.subject.complete();
  }
}
