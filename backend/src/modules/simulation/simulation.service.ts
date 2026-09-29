import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { MapService, type PathLeg } from '../../libs/map/map.service';
import { DomainEvent, DomainEvents } from '../../libs/common/events';
import { RideStatus } from '../../libs/common/ride-status';
import { pickBehavior, BEHAVIORS, type BehaviorDef } from '../../libs/common/behaviors';
import { FleetService } from '../fleet/fleet.service';
import { RideService, type RideRow } from '../ride/ride.service';

const TICK_MS = 500;

type Mode = 'CRUISE' | 'APPROACH' | 'WAIT' | 'TRIP' | 'PARKED';

interface BehaviorState {
  def: BehaviorDef;
  endsAtSimMs: number;
}

interface VehicleRuntime {
  vehicleId: string;
  mode: Mode;
  rideId?: number;
  path: PathLeg[];
  legIndex: number;
  legProgressM: number;
  speedKph: number;
  behavior: BehaviorState | null;
  simClockMs: number;
  nextBehaviorAtSimMs: number;
  traveledM: number;
  lastProgressEmitSimMs: number;
  lastRoutePointSimMs: number;
}

/**
 * 车辆仿真引擎 —— 让 Demo「活起来」的核心。
 *
 * 职责：
 *  1. 维护仿真时钟（可调速、可暂停），按固定步长推进
 *  2. 驱动车辆沿真实路网（A* 最短路）行驶
 *  3. 推进行程状态机：PENDING→ABOARD→READY→ONGOING→ARRIVING→ARRIVED
 *  4. 生成「车辆行为」事件，供车内屏幕做决策可视化
 *
 * 与业务模块解耦：只通过领域事件对外广播，通过 RideService/FleetService 落库。
 */
@Injectable()
export class SimulationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Sim');
  private timer: NodeJS.Timeout | null = null;
  private runtimes = new Map<string, VehicleRuntime>();
  private simClockMs = 0;
  private multiplier = 4;
  private paused = false;
  private lastTickAt = 0;

  constructor(
    private readonly map: MapService,
    private readonly fleet: FleetService,
    private readonly ride: RideService,
    private readonly events: DomainEvents,
  ) {}

  onModuleInit(): void {
    this.lastTickAt = Date.now();
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.logger.log(`仿真时钟已启动（${TICK_MS}ms/步，默认倍速 ${this.multiplier}x）`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  // ------------------------------------------------------------ 对外控制

  get status() {
    return { multiplier: this.multiplier, paused: this.paused, simClockMs: this.simClockMs, tickMs: TICK_MS, vehicles: this.runtimes.size };
  }

  setMultiplier(x: number) {
    this.multiplier = Math.max(0.5, Math.min(32, x));
    return this.status;
  }

  setPaused(p: boolean) {
    this.paused = p;
    return this.status;
  }

  /** 立刻把当前行程推到「即将到达」，用于演示 */
  jumpToArriving(): { ok: boolean } {
    const ride = this.ride.getCurrentRide();
    if (!ride || ride.status !== RideStatus.ONGOING) return { ok: false };
    const rt = this.runtimes.get(ride.vehicle_id);
    if (rt) {
      const total = rt.path.reduce((s, l) => s + l.lengthM, 0);
      const target = total - 350;
      // 先补齐被快进掉那段的轨迹采样，再挪位置。
      // 只改 traveledM 的话，行程小结里的速度曲线会是空的，
      // 而那是全项目唯一展示图表的地方，演示时最不该空。
      this.backfillRouteSamples(rt, ride.id, Math.max(0, target));
      this.seekTo(rt, Math.max(0, target));
      this.ride.setTraveled(ride.id, Math.round(rt.traveledM));
    }
    this.ride.setStatus(ride.id, RideStatus.ARRIVING, '即将到达目的地');
    return { ok: true };
  }

  /**
   * 为「被快进掉的那段路」补轨迹采样。
   *
   * 按每 120 米一个采样点，时间戳按各路段限速反推，让速度曲线看起来
   * 是真实走过的一段路，而不是一条直线或一片空白。
   */
  private backfillRouteSamples(rt: VehicleRuntime, rideId: number, targetM: number): void {
    const fromM = rt.traveledM;
    if (targetM <= fromM) return;

    const stepM = 120;
    const samples: { lng: number; lat: number; speed: number; elapsedS: number }[] = [];
    let acc = fromM;
    let elapsedS = 0;

    while (acc < targetM) {
      // 定位 acc 落在 rt.path 的哪一段
      let walk = 0;
      let leg = rt.path[rt.path.length - 1];
      let legStart = 0;
      for (const l of rt.path) {
        if (walk + l.lengthM > acc) {
          leg = l;
          legStart = walk;
          break;
        }
        walk += l.lengthM;
      }
      const progress = leg.lengthM > 0 ? Math.min(1, (acc - legStart) / leg.lengthM) : 1;
      const { at } = this.map.interpolate(leg.edgeId, leg.dir, progress);
      const speed = leg.speedKph || 30;
      samples.push({ lng: at.lng, lat: at.lat, speed, elapsedS });
      const advance = Math.min(stepM, targetM - acc);
      elapsedS += advance / (speed / 3.6);
      acc += advance;
    }

    const now = Date.now();
    for (const s of samples) {
      this.ride.recordRoutePoint(rideId, s.lng, s.lat, s.speed, now - Math.round((elapsedS - s.elapsedS) * 1000));
    }
  }

  /** 手动注入一个车辆行为，用于演示决策可视化 */
  injectBehavior(type?: string): { ok: boolean; type?: string } {
    const ride = this.ride.getCurrentRide();
    if (!ride) return { ok: false };
    const rt = this.runtimes.get(ride.vehicle_id);
    if (!rt) return { ok: false };
    const def = (type ? BEHAVIORS.find((b) => b.type === type) : undefined) ?? pickBehavior(rt.behavior?.def.type);
    this.applyBehavior(rt, def, ride);
    return { ok: true, type: def.type };
  }

  /** 重置运行时（配合数据重置使用） */
  resetRuntime(): void {
    this.runtimes.clear();
    this.simClockMs = 0;
    this.paused = false;
    this.multiplier = 4;
  }

  getRuntime(vehicleId: string) {
    const rt = this.runtimes.get(vehicleId);
    if (!rt) return null;
    const { path, ...rest } = rt;
    return { ...rest, pathLegs: path.length, behavior: rt.behavior?.def.type ?? null };
  }

  // ------------------------------------------------------------ 主循环

  private tick(): void {
    const now = Date.now();
    const dtRealMs = Math.min(2000, now - this.lastTickAt);
    this.lastTickAt = now;
    if (this.paused) return;

    const dtSimMs = dtRealMs * this.multiplier;
    this.simClockMs += dtSimMs;
    const dtSimS = dtSimMs / 1000;

    for (const v of this.fleet.listVehicles()) {
      const rt = this.ensureRuntime(v.id);
      rt.simClockMs = this.simClockMs;

      const ride = this.ride.getActiveRideForVehicle(v.id);
      try {
        if (ride) {
          this.driveRide(v.id, ride, rt, dtSimS);
        } else {
          this.cruise(v.id, rt, dtSimS);
        }
      } catch (e) {
        this.logger.error(`车辆 ${v.id} 推进异常: ${(e as Error).message}`);
      }
    }
  }

  private ensureRuntime(vehicleId: string): VehicleRuntime {
    let rt = this.runtimes.get(vehicleId);
    if (!rt) {
      rt = {
        vehicleId,
        mode: 'CRUISE',
        path: [],
        legIndex: 0,
        legProgressM: 0,
        speedKph: 0,
        behavior: null,
        simClockMs: this.simClockMs,
        nextBehaviorAtSimMs: this.simClockMs + 4000,
        traveledM: 0,
        lastProgressEmitSimMs: 0,
        lastRoutePointSimMs: 0,
      };
      this.runtimes.set(vehicleId, rt);
    }
    return rt;
  }

  // ------------------------------------------------------------ 行程推进

  private driveRide(vehicleId: string, ride: RideRow, rt: VehicleRuntime, dtSimS: number) {
    const v = this.fleet.getVehicle(vehicleId)!;

    // 1) 待上车：车辆前往乘客所在位置
    if (ride.status === RideStatus.PENDING) {
      if (rt.mode !== 'APPROACH' || rt.rideId !== ride.id || rt.path.length === 0) {
        rt.mode = 'APPROACH';
        rt.rideId = ride.id;
        rt.path = this.planFrom(v.lng, v.lat, ride.origin_lng, ride.origin_lat);
        rt.legIndex = 0;
        rt.legProgressM = 0;
        rt.traveledM = 0;
      }
      const arrived = this.step(rt, vehicleId, dtSimS, '载客前往上车点');
      if (arrived) {
        rt.mode = 'WAIT';
        this.ride.setStatus(ride.id, RideStatus.ABOARD, '车辆已到达上车点，等待乘客上车');
        this.events.emit(DomainEvent.NOTICE, {
          rideId: ride.id,
          kind: 'success',
          title: '车辆已到达',
          detail: '请确认车牌与车内编号后上车',
        });
      }
      return;
    }

    // 2) 已上车 / 待出发：车辆原地等待，不移动
    if (ride.status === RideStatus.ABOARD || ride.status === RideStatus.READY) {
      rt.mode = 'WAIT';
      rt.speedKph = 0;
      this.fleet.updatePosition(vehicleId, { lng: v.lng, lat: v.lat, heading: v.heading, speedKph: 0, roadName: v.road_name || '上车点' });
      this.emitPosition(vehicleId, v.lng, v.lat, v.heading, 0, ride.id);
      return;
    }

    // 3) 行程中 / 即将到达：沿行程路线行驶
    if (ride.status === RideStatus.ONGOING || ride.status === RideStatus.ARRIVING) {
      if (rt.mode !== 'TRIP' || rt.rideId !== ride.id || rt.path.length === 0) {
        rt.mode = 'TRIP';
        rt.rideId = ride.id;
        // 从车辆当前位置到目的地的路径（改目的地后会重新规划）
        rt.path = this.planFrom(v.lng, v.lat, ride.dest_lng, ride.dest_lat);
        rt.legIndex = 0;
        rt.legProgressM = 0;
        rt.traveledM = ride.traveled_m;
        this.ride.recordEvent(ride.id, 'SYSTEM', 'ROUTE_PLANNED', '路线已规划', `全程约 ${(rt.path.reduce((s, l) => s + l.lengthM, 0) / 1000).toFixed(1)} 公里`);
      }

      const done = this.step(rt, vehicleId, dtSimS, `前往 ${ride.dest_name}`);

      // 累计实际里程 + 记录轨迹
      if (rt.simClockMs - rt.lastRoutePointSimMs > 3000) {
        rt.lastRoutePointSimMs = rt.simClockMs;
        this.ride.recordRoutePoint(ride.id, v.lng, v.lat, rt.speedKph);
      }
      if (rt.simClockMs - rt.lastProgressEmitSimMs > 1000) {
        rt.lastProgressEmitSimMs = rt.simClockMs;
        this.ride.setTraveled(ride.id, Math.round(rt.traveledM));
        this.emitProgress(ride);
      }

      const remain = Math.max(0, ride.plan_distance_m - rt.traveledM);
      if (remain <= this.ride.arrivingThresholdM && ride.status === RideStatus.ONGOING) {
        this.ride.setStatus(ride.id, RideStatus.ARRIVING, '即将到达目的地');
        this.events.emit(DomainEvent.NOTICE, {
          rideId: ride.id,
          kind: 'info',
          title: '即将到达',
          detail: `还有约 ${Math.round(remain)} 米，请在车辆停稳后再解开安全带`,
        });
      }
      if (done) {
        this.ride.setStatus(ride.id, RideStatus.ARRIVED, '车辆已停稳在目的地');
        rt.mode = 'PARKED';
        // 必须在"到达的这一刻"就把车速归零并广播出去。
        // 否则会有一个"状态已 ARRIVED、车速还停在巡航值"的窗口，
        // 而开门的后端校验要求车速为 0，乘客会看到"已到达"却打不开门；
        // 如果仿真恰好在这一刻被暂停，这个窗口永远不会关闭。
        rt.speedKph = 0;
        this.fleet.updatePosition(vehicleId, { lng: v.lng, lat: v.lat, heading: v.heading, speedKph: 0, roadName: v.road_name });
        this.emitPosition(vehicleId, v.lng, v.lat, v.heading, 0, ride.id);
        this.events.emit(DomainEvent.NOTICE, {
          rideId: ride.id,
          kind: 'success',
          title: '已到达目的地',
          detail: '车辆已停稳，请确认随身物品后开门下车',
        });
      }
      return;
    }

    // 4) 已到达 / 结束：停住
    rt.mode = 'PARKED';
    rt.speedKph = 0;
    this.fleet.updatePosition(vehicleId, { lng: v.lng, lat: v.lat, heading: v.heading, speedKph: 0, roadName: v.road_name });
    this.emitPosition(vehicleId, v.lng, v.lat, v.heading, 0, ride.id);
  }

  /** 空闲车在路网上随机巡航，让地图"活"起来 */
  private cruise(vehicleId: string, rt: VehicleRuntime, dtSimS: number) {
    if (rt.mode !== 'CRUISE' || rt.path.length === 0) {
      const { edgeId, dir } = this.map.randomEdgeDir();
      const e = this.map.edge(edgeId)!;
      rt.mode = 'CRUISE';
      rt.rideId = undefined;
      rt.path = [{ edgeId, dir, from: dir === 1 ? e.a : e.b, to: dir === 1 ? e.b : e.a, lengthM: e.lengthM, speedKph: e.speedKph }];
      rt.legIndex = 0;
      rt.legProgressM = 0;
    }
    const done = this.step(rt, vehicleId, dtSimS, '空闲巡航');
    if (done) {
      // 到达边的末端后，从该节点随机选下一条边继续巡航
      const last = rt.path[rt.path.length - 1];
      const nexts = this.map.neighbors(last.to);
      if (nexts.length) {
        const nb = nexts[Math.floor(Math.random() * nexts.length)];
        rt.path = [{ edgeId: nb.edgeId, dir: nb.dir, from: last.to, to: nb.to, lengthM: nb.lengthM, speedKph: nb.speedKph }];
        rt.legIndex = 0;
        rt.legProgressM = 0;
      } else {
        rt.path = [];
      }
    }
  }

  /**
   * 推进一个仿真步：沿 path 前进 dtSimS 秒，写库并广播位置。
   * 返回 true 表示已走完整条路径。
   */
  private step(rt: VehicleRuntime, vehicleId: string, dtSimS: number, roadName: string): boolean {
    if (rt.path.length === 0) return true;

    const leg = rt.path[rt.legIndex];
    // 目标速度：受车辆行为影响
    let targetKph = leg.speedKph;
    if (rt.behavior && this.simClockMs < rt.behavior.endsAtSimMs) {
      const d = rt.behavior.def;
      if (d.type === 'YIELD_PEDESTRIAN' || d.type === 'TRAFFIC_LIGHT') targetKph = 0;
      else if (d.slowsDown) targetKph = Math.max(6, leg.speedKph * 0.3);
    } else if (rt.behavior) {
      rt.behavior = null;
    }

    // 加减速限制（4 km/h 每秒），避免速度跳变
    const maxDelta = 4 * dtSimS;
    if (rt.speedKph < targetKph) rt.speedKph = Math.min(targetKph, rt.speedKph + maxDelta);
    else rt.speedKph = Math.max(targetKph, rt.speedKph - maxDelta);

    // 里程推进
    const advanceM = (rt.speedKph / 3.6) * dtSimS;
    rt.legProgressM += advanceM;
    if (rt.mode === 'TRIP') rt.traveledM += advanceM;

    let finished = false;
    if (rt.legProgressM >= leg.lengthM) {
      rt.legIndex++;
      rt.legProgressM = 0;
      if (rt.legIndex >= rt.path.length) {
        finished = true;
        rt.legIndex = rt.path.length - 1;
        rt.legProgressM = rt.path[rt.path.length - 1].lengthM;
      }
    }

    const curLeg = rt.path[Math.min(rt.legIndex, rt.path.length - 1)];
    const progress = curLeg.lengthM > 0 ? Math.min(1, rt.legProgressM / curLeg.lengthM) : 1;
    const { at, heading } = this.map.interpolate(curLeg.edgeId, curLeg.dir, progress);
    const road = this.map.edge(curLeg.edgeId)?.road ?? roadName;

    // 每步（500ms）写一次位置：SQLite 完全扛得住，且保证 /ops 里数据是活的
    this.fleet.updatePosition(vehicleId, {
      lng: at.lng,
      lat: at.lat,
      heading,
      speedKph: rt.speedKph,
      roadName: road,
      edgeId: curLeg.edgeId,
      edgeProgress: progress,
      edgeDir: curLeg.dir,
    });
    if (advanceM > 0) this.fleet.consume(vehicleId, advanceM);
    this.emitPosition(vehicleId, at.lng, at.lat, heading, rt.speedKph, rt.rideId);

    // 行为调度：行驶中每隔一段时间换个「车辆行为」
    if (rt.mode === 'TRIP' && rt.rideId && this.simClockMs >= rt.nextBehaviorAtSimMs) {
      const def = pickBehavior(rt.behavior?.def.type);
      const ride = this.ride.getRide(rt.rideId);
      if (ride) this.applyBehavior(rt, def, ride);
    }

    return finished;
  }

  private applyBehavior(rt: VehicleRuntime, def: BehaviorDef, ride: RideRow) {
    const durSimS = def.minDurationS + Math.random() * (def.maxDurationS - def.minDurationS);
    rt.behavior = { def, endsAtSimMs: this.simClockMs + durSimS * 1000 };
    rt.nextBehaviorAtSimMs = rt.behavior.endsAtSimMs + (2000 + Math.random() * 6000);

    // 只在关键行为上写入事件流，避免刷屏
    if (def.type !== 'CRUISE') {
      this.ride.recordEvent(ride.id, 'BEHAVIOR', def.type, def.title, def.detail, def.icon, {
        slowsDown: def.slowsDown,
        durationS: Math.round(durSimS),
      });
      this.events.emit(DomainEvent.RIDE_BEHAVIOR, {
        rideId: ride.id,
        type: def.type,
        short: def.short,
        title: def.title,
        detail: def.detail,
        icon: def.icon,
        slowsDown: def.slowsDown,
        endsAt: Date.now() + durSimS * 1000,
      });
    }
  }

  /** 把 runtime 快进到「已行驶 meters 米」的位置（用于演示跳转） */
  private seekTo(rt: VehicleRuntime, meters: number) {
    let acc = 0;
    for (let i = 0; i < rt.path.length; i++) {
      const leg = rt.path[i];
      if (acc + leg.lengthM >= meters) {
        rt.legIndex = i;
        rt.legProgressM = meters - acc;
        rt.traveledM = meters;
        return;
      }
      acc += leg.lengthM;
    }
    rt.legIndex = rt.path.length - 1;
    rt.legProgressM = rt.path[rt.path.length - 1]?.lengthM ?? 0;
    rt.traveledM = meters;
  }

  private planFrom(fromLng: number, fromLat: number, toLng: number, toLat: number): PathLeg[] {
    const a = this.map.nearestNode({ lng: fromLng, lat: fromLat });
    const b = this.map.nearestNode({ lng: toLng, lat: toLat });
    return this.map.findPath(a.id, b.id);
  }

  private emitPosition(vehicleId: string, lng: number, lat: number, heading: number, speedKph: number, rideId?: number | null) {
    const v = this.fleet.getVehicle(vehicleId);
    this.events.emit(DomainEvent.VEHICLE_POSITION, {
      vehicleId,
      lng,
      lat,
      heading,
      speedKph: +speedKph.toFixed(1),
      status: v?.status ?? 'IDLE',
      roadName: v?.road_name ?? '',
      rideId: rideId ?? null,
    });
  }

  private emitProgress(ride: RideRow) {
    const cur = this.ride.getRide(ride.id)!;
    const remain = Math.max(0, cur.plan_distance_m - cur.traveled_m);
    const v = this.fleet.getVehicle(ride.vehicle_id);
    const speed = v?.speed_kph ?? 26;
    this.events.emit(DomainEvent.RIDE_PROGRESS, {
      rideId: ride.id,
      traveledM: Math.round(cur.traveled_m),
      remainDistanceM: Math.round(remain),
      remainTimeS: this.ride.estimateRemainTimeS(cur, speed),
      progress: cur.plan_distance_m > 0 ? +(cur.traveled_m / cur.plan_distance_m).toFixed(4) : 0,
      speedKph: Math.round(speed),
      currentFare: cur.fare_total,
    });
  }
}
