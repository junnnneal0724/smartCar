/**
 * 领域事件总线：进程内解耦各业务模块。
 * 语义与 MQ 一致，将来换成 Redis Streams / NATS 只需替换此实现。
 */
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter } from 'node:events';

export const DomainEvent = {
  RIDE_STATUS_CHANGED: 'ride.status_changed',
  RIDE_PROGRESS: 'ride.progress',
  RIDE_BEHAVIOR: 'ride.behavior',
  RIDE_STOP_REQUESTED: 'ride.stop_requested',
  VEHICLE_POSITION: 'vehicle.position',
  VEHICLE_TELEMETRY: 'vehicle.telemetry',
  CABIN_CHANGED: 'cabin.changed',
  NOTICE: 'notify.notice',
  SIM_TICK: 'sim.tick',
} as const;

export type DomainEventName = (typeof DomainEvent)[keyof typeof DomainEvent];

export interface VehiclePositionPayload {
  vehicleId: string;
  lng: number;
  lat: number;
  heading: number;
  speedKph: number;
  status: string;
  roadName: string;
  rideId?: number | null;
}

export interface RideStatusPayload {
  rideId: number;
  rideNo: string;
  from: string;
  to: string;
  message: string;
  vehicleId: string;
  at: number;
}

export interface RideProgressPayload {
  rideId: number;
  traveledM: number;
  remainDistanceM: number;
  remainTimeS: number;
  progress: number;
  speedKph: number;
  currentFare: number;
}

export interface RideBehaviorPayload {
  rideId: number;
  type: string;
  short: string;
  title: string;
  detail: string;
  icon: string;
  slowsDown: boolean;
  endsAt: number;
}

export interface VehicleTelemetryPayload {
  vehicleId: string;
  battery: number;
  speedKph: number;
  roadName: string;
  odometerM: number;
  cameraOn: boolean;
  micOn: boolean;
}

export interface CabinChangedPayload {
  vehicleId: string;
  setting: Record<string, unknown>;
  source: string;
}

export interface NoticePayload {
  rideId: number;
  kind: 'info' | 'warn' | 'success';
  title: string;
  detail?: string;
}

@Injectable()
export class DomainEvents implements OnModuleDestroy {
  private readonly logger = new Logger('Events');
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(200);
  }

  emit(name: DomainEventName, payload: unknown): void {
    try {
      this.emitter.emit(name, payload);
    } catch (e) {
      // 单个监听器异常不影响主流程
      this.logger.error(`事件处理异常 ${name}: ${(e as Error).message}`);
    }
  }

  on<T = unknown>(name: DomainEventName, handler: (payload: T) => void): () => void {
    const wrapped = (p: unknown) => {
      try {
        handler(p as T);
      } catch (e) {
        this.logger.error(`监听器异常 ${name}: ${(e as Error).message}`);
      }
    };
    this.emitter.on(name, wrapped);
    return () => this.emitter.off(name, wrapped);
  }

  onModuleDestroy(): void {
    this.emitter.removeAllListeners();
  }
}
