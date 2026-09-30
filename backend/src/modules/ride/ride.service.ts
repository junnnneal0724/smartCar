import { Injectable, Logger } from '@nestjs/common';
import { SqliteService } from '../../infra/sqlite.service';
import { MapService } from '../../libs/map/map.service';
import { DomainEvent, DomainEvents } from '../../libs/common/events';
import { BizError, ErrorCode } from '../../libs/common/result';
import {
  ARRIVING_THRESHOLD_M,
  canTransition,
  PHASES,
  PHASE_OF,
  RideStatus,
  STATUS_LABEL,
  type RideStatusValue,
} from '../../libs/common/ride-status';
import { behavior } from '../../libs/common/behaviors';
import { co2SavedG, computeFare, estimateDurationS, makeRideNo, model } from '../../libs/common/pricing';
import { distanceM } from '../../libs/common/geo';
import { FleetService } from '../fleet/fleet.service';

export interface RideRow {
  id: number;
  ride_no: string;
  user_id: number;
  vehicle_id: string;
  model_code: string;
  status: RideStatusValue;
  origin_name: string;
  origin_lng: number;
  origin_lat: number;
  dest_name: string;
  dest_lng: number;
  dest_lat: number;
  dest_category: string;
  passengers: number;
  verify_code: string;
  plan_distance_m: number;
  plan_duration_s: number;
  traveled_m: number;
  fare_total: number;
  fare_discount: number;
  fare_base: number;
  fare_distance: number;
  fare_time: number;
  co2_saved_g: number;
  rating_score: number | null;
  created_at: number;
  aboard_at: number | null;
  started_at: number | null;
  arriving_at: number | null;
  arrived_at: number | null;
  ended_at: number | null;
}

interface CreateRideInput {
  userId: number;
  vehicleId: string;
  originName: string;
  originLng: number;
  originLat: number;
  destName: string;
  destLng: number;
  destLat: number;
  destCategory?: string;
  passengers?: number;
  verifyCode: string;
  status?: RideStatusValue;
}

/** 行程域：行程生命周期、轨迹、事件流、账单、评价。独占 t_ride / t_ride_route / t_ride_event / t_fare / t_rating */
@Injectable()
export class RideService {
  private readonly logger = new Logger('Ride');
  private routeSeq = new Map<number, number>();

  constructor(
    private readonly db: SqliteService,
    private readonly map: MapService,
    private readonly fleet: FleetService,
    private readonly bus: DomainEvents,
  ) {}

  // ---------------------------------------------------------------- 查询

  getRide(id: number): RideRow | undefined {
    return this.db.get<RideRow>('SELECT * FROM t_ride WHERE id = ?', id);
  }

  /** 本终端车辆的进行中行程（车内屏幕唯一关心的行程） */
  getCurrentRide(): RideRow | undefined {
    const v = this.fleet.getTerminalVehicle();
    return this.db.get<RideRow>(
      `SELECT * FROM t_ride WHERE vehicle_id = ? AND status NOT IN ('COMPLETED','CANCELLED')
       ORDER BY id DESC LIMIT 1`,
      v.id,
    );
  }

  getActiveRideForVehicle(vehicleId: string): RideRow | undefined {
    return this.db.get<RideRow>(
      `SELECT * FROM t_ride WHERE vehicle_id = ? AND status NOT IN ('COMPLETED','CANCELLED')
       ORDER BY id DESC LIMIT 1`,
      vehicleId,
    );
  }

  /** 最近一条已结束的行程：小结页在会话失效后仍要能看 */
  lastCompleted(): RideRow | undefined {
    const v = this.fleet.getTerminalVehicle();
    return this.db.get<RideRow>(
      `SELECT * FROM t_ride WHERE vehicle_id = ? AND status IN ('COMPLETED','ARRIVED')
       ORDER BY id DESC LIMIT 1`,
      v.id,
    );
  }

  listActiveRides(): RideRow[] {
    return this.db.all<RideRow>(`SELECT * FROM t_ride WHERE status NOT IN ('COMPLETED','CANCELLED')`);
  }

  /** 给屏幕用的聚合视图：行程 + 车辆 + 进度 + 当前行为 */
  currentView() {
    const ride = this.getCurrentRide();
    if (!ride) return { ride: null, phases: PHASES };
    const v = this.fleet.getVehicle(ride.vehicle_id)!;
    const remain = Math.max(0, ride.plan_distance_m - ride.traveled_m);
    const remainTimeS = this.estimateRemainTimeS(ride, v.speed_kph);
    const currentBehavior = this.currentBehavior(ride.id);
    return {
      ride: this.serialize(ride, remain, remainTimeS),
      vehicle: {
        id: v.id,
        plateNo: v.plate_no,
        cabinNo: v.cabin_no,
        modelCode: v.model_code,
        modelName: model(v.model_code).name,
        battery: v.battery,
        speedKph: Math.round(v.speed_kph),
        roadName: v.road_name,
        odometerKm: +(v.odometer_m / 1000).toFixed(1),
        cameraOn: !!v.camera_on,
        micOn: !!v.mic_on,
        lng: v.lng,
        lat: v.lat,
        heading: v.heading,
      },
      phases: PHASES,
      behavior: currentBehavior ? this.mapBehavior(currentBehavior) : null,
    };
  }

  serialize(ride: RideRow, remainM?: number, remainTimeS?: number) {
    const remain = remainM ?? Math.max(0, ride.plan_distance_m - ride.traveled_m);
    const progress = ride.plan_distance_m > 0 ? Math.min(1, ride.traveled_m / ride.plan_distance_m) : 0;
    const fare = computeFare(ride.model_code, ride.plan_distance_m, ride.plan_duration_s, ride.fare_discount);
    return {
      id: ride.id,
      rideNo: ride.ride_no,
      status: ride.status,
      statusLabel: STATUS_LABEL[ride.status] ?? ride.status,
      phase: PHASE_OF[ride.status] ?? 0,
      origin: { name: ride.origin_name, lng: ride.origin_lng, lat: ride.origin_lat },
      dest: { name: ride.dest_name, lng: ride.dest_lng, lat: ride.dest_lat, category: ride.dest_category },
      passengers: ride.passengers,
      modelCode: ride.model_code,
      planDistanceM: ride.plan_distance_m,
      planDurationS: ride.plan_duration_s,
      traveledM: Math.round(ride.traveled_m),
      remainDistanceM: Math.round(remain),
      remainTimeS: remainTimeS ?? this.estimateRemainTimeS(ride),
      progress: +progress.toFixed(4),
      fare,
      co2SavedG: ride.co2_saved_g,
      ratingScore: ride.rating_score,
      createdAt: ride.created_at,
      startedAt: ride.started_at,
      arrivingAt: ride.arriving_at,
      arrivedAt: ride.arrived_at,
      endedAt: ride.ended_at,
      /** 校验码不直接下发，前端只显示提示文案 */
      verifyHint: `手机号后 4 位`,
    };
  }

  /** 剩余时间：按剩余里程与当前车速估算，车速过低时回落到路网平均速度 */
  estimateRemainTimeS(ride: RideRow, currentSpeedKph?: number): number {
    const remain = Math.max(0, ride.plan_distance_m - ride.traveled_m);
    const speed = currentSpeedKph && currentSpeedKph > 8 ? currentSpeedKph : 26;
    return Math.round((remain / 1000 / speed) * 3600);
  }

  // ---------------------------------------------------------------- 创建

  createRide(input: CreateRideInput): RideRow {
    const seq = (this.db.get<{ c: number }>('SELECT COUNT(*) AS c FROM t_ride')?.c ?? 0) + 1;
    const rideNo = makeRideNo(seq);

    const vehicle = this.fleet.getVehicle(input.vehicleId);
    if (!vehicle) throw new BizError(ErrorCode.NOT_FOUND, `车辆 ${input.vehicleId} 不存在`);
    const modelCode = vehicle.model_code;

    // 用真实路网算一次路径，得出规划里程与时长（一口价的基础）
    const fromNode = this.map.nearestNode({ lng: input.originLng, lat: input.originLat });
    const toNode = this.map.nearestNode({ lng: input.destLng, lat: input.destLat });
    const legs = this.map.findPath(fromNode.id, toNode.id);
    const planDistanceM =
      legs.reduce((s, l) => s + l.lengthM, 0) ||
      Math.round(distanceM({ lng: input.originLng, lat: input.originLat }, { lng: input.destLng, lat: input.destLat }));
    const planDurationS = estimateDurationS(planDistanceM);
    const fare = computeFare(modelCode, planDistanceM, planDurationS);

    const status = input.status ?? RideStatus.PENDING;
    const r = this.db.run(
      `INSERT INTO t_ride (ride_no, user_id, vehicle_id, model_code, status,
        origin_name, origin_lng, origin_lat, dest_name, dest_lng, dest_lat, dest_category,
        passengers, verify_code, plan_distance_m, plan_duration_s, traveled_m,
        fare_total, fare_discount, fare_base, fare_distance, fare_time, co2_saved_g, created_at, aboard_at)
       VALUES (?,?,?,?,?, ?,?,?,?,?,?,?, ?,?,?,?,?, ?,?,?,?,?,?,?,?)`,
      rideNo,
      input.userId,
      input.vehicleId,
      modelCode,
      status,
      input.originName,
      input.originLng,
      input.originLat,
      input.destName,
      input.destLng,
      input.destLat,
      input.destCategory ?? 'other',
      input.passengers ?? 1,
      input.verifyCode,
      planDistanceM,
      planDurationS,
      0,
      fare.total,
      fare.discount,
      fare.base,
      fare.distance,
      fare.time,
      co2SavedG(planDistanceM),
      Date.now(),
      status === RideStatus.PENDING ? null : Date.now(),
    );

    const rideId = r.lastInsertRowid;
    this.fleet.setCurrentRide(input.vehicleId, rideId);
    this.recordEvent(rideId, 'SYSTEM', 'RIDE_CREATED', '行程已创建', `${input.originName} → ${input.destName}`);
    this.logger.log(`行程已创建 ${rideNo} (${planDistanceM}m / 约 ${Math.round(planDurationS / 60)} 分钟)`);
    return this.getRide(rideId)!;
  }

  // ---------------------------------------------------------------- 状态机

  setStatus(id: number, to: RideStatusValue, message: string): RideRow {
    const ride = this.getRide(id);
    if (!ride) throw new BizError(ErrorCode.NOT_FOUND, '行程不存在');
    if (ride.status === to) return ride;
    if (!canTransition(ride.status, to)) {
      throw new BizError(
        ErrorCode.RIDE_STATE_INVALID,
        `行程状态不允许从「${STATUS_LABEL[ride.status]}」变更为「${STATUS_LABEL[to]}」`,
      );
    }

    const now = Date.now();
    const cols: string[] = ['status = ?'];
    const vals: unknown[] = [to];
    const stamp: Partial<Record<RideStatusValue, string>> = {
      ABOARD: 'aboard_at',
      ONGOING: 'started_at',
      ARRIVING: 'arriving_at',
      ARRIVED: 'arrived_at',
      COMPLETED: 'ended_at',
    };
    const col = stamp[to];
    if (col) {
      cols.push(`${col} = ?`);
      vals.push(now);
    }
    if (to === RideStatus.COMPLETED) {
      cols.push('traveled_m = ?');
      vals.push(ride.traveled_m);
    }
    vals.push(id);
    this.db.run(`UPDATE t_ride SET ${cols.join(', ')} WHERE id = ?`, ...vals);

    // 车辆状态同步
    const vehicleStatus: Partial<Record<RideStatusValue, string>> = {
      PENDING: 'TO_PICKUP',
      ABOARD: 'WAITING',
      READY: 'WAITING',
      ONGOING: 'ON_TRIP',
      ARRIVING: 'ON_TRIP',
      ARRIVED: 'WAITING',
      COMPLETED: 'IDLE',
      CANCELLED: 'IDLE',
    };
    const vs = vehicleStatus[to];
    if (vs) this.fleet.setStatus(ride.vehicle_id, vs);
    if (to === RideStatus.COMPLETED || to === RideStatus.CANCELLED) {
      this.fleet.setCurrentRide(ride.vehicle_id, null);
    }

    this.recordEvent(id, 'STATUS', to, STATUS_LABEL[to] ?? to, message);
    this.bus.emit(DomainEvent.RIDE_STATUS_CHANGED, {
      rideId: id,
      rideNo: ride.ride_no,
      from: ride.status,
      to,
      message,
      vehicleId: ride.vehicle_id,
      at: now,
    });
    return this.getRide(id)!;
  }

  // ---------------------------------------------------------------- 乘客操作

  /** 乘客点「开始行程」 */
  startRide(id: number): RideRow {
    const ride = this.getRide(id);
    if (!ride) throw new BizError(ErrorCode.NOT_FOUND, '行程不存在');
    if (ride.status === RideStatus.ONGOING) return ride;
    if (ride.status !== RideStatus.READY && ride.status !== RideStatus.ABOARD) {
      throw new BizError(ErrorCode.RIDE_STATE_INVALID, '当前状态无法开始行程');
    }
    if (ride.status === RideStatus.ABOARD) this.setStatus(id, RideStatus.READY, '身份校验通过，等待乘客确认出发');
    return this.setStatus(id, RideStatus.ONGOING, '乘客已确认出发，行程开始');
  }

  /** 行进中修改目的地（常用地点快捷选择，无全量搜索） */
  changeDestination(id: number, dest: { name: string; lng: number; lat: number; category?: string }): RideRow {
    const ride = this.getRide(id);
    if (!ride) throw new BizError(ErrorCode.NOT_FOUND, '行程不存在');
    if (ride.status !== RideStatus.ONGOING && ride.status !== RideStatus.ARRIVING) {
      throw new BizError(ErrorCode.DEST_NOT_ALLOWED, '仅行程中可以修改目的地');
    }
    const fromNode = this.map.nearestNode({ lng: ride.origin_lng, lat: ride.origin_lat });
    const toNode = this.map.nearestNode({ lng: dest.lng, lat: dest.lat });
    const legs = this.map.findPath(fromNode.id, toNode.id);
    const planDistanceM = legs.reduce((s, l) => s + l.lengthM, 0);
    const planDurationS = estimateDurationS(planDistanceM);
    const fare = computeFare(ride.model_code, planDistanceM, planDurationS, ride.fare_discount);

    this.db.run(
      `UPDATE t_ride SET dest_name = ?, dest_lng = ?, dest_lat = ?, dest_category = ?,
        plan_distance_m = ?, plan_duration_s = ?, fare_total = ?, fare_base = ?, fare_distance = ?, fare_time = ?,
        co2_saved_g = ? WHERE id = ?`,
      dest.name,
      dest.lng,
      dest.lat,
      dest.category ?? 'other',
      planDistanceM,
      planDurationS,
      fare.total,
      fare.base,
      fare.distance,
      fare.time,
      co2SavedG(planDistanceM),
      id,
    );
    this.recordEvent(
      id,
      'SYSTEM',
      'DEST_CHANGED',
      '目的地已更新',
      `新的目的地：${dest.name}，预计里程 ${(planDistanceM / 1000).toFixed(1)} 公里`,
    );
    // 状态没变（还是 ONGOING/ARRIVING），但目的地变了，前端要刷新行程卡。
    this.bus.emit(DomainEvent.RIDE_STATUS_CHANGED, {
      rideId: id,
      rideNo: ride.ride_no,
      from: ride.status,
      to: ride.status,
      message: `目的地已改为 ${dest.name}`,
      vehicleId: ride.vehicle_id,
      at: Date.now(),
    });
    // 单独再发一个事件，专门给仿真用：它必须按新终点重新规划路线。
    // 只改库里的 dest_* 是不够的，仿真只在"模式或行程变了"时才重规划，
    // 于是车会继续沿旧路线开向旧终点，而屏幕上写的已经是新目的地。
    this.bus.emit(DomainEvent.RIDE_DEST_CHANGED, {
      rideId: id,
      vehicleId: ride.vehicle_id,
      dest,
    });
    return this.getRide(id)!;
  }

  /**
   * 把停靠点落成新的终点。
   *
   * 停靠之后行程就在这个点结束，所以它本质上就是"把终点改成这里"：
   * 复用 dest_* 与 plan_* 这套字段，到站、开门、小结、结算全都走现成的流程，
   * 不用为停靠另开一条分支。planDistanceM 由仿真按真实路网算好传进来
   * （= 已行驶里程 + 当前位置到停靠点的距离），这样进度条和到达判定都是对的。
   */
  applyStopPoint(
    id: number,
    stopId: number,
    target: { name: string; lng: number; lat: number },
    planDistanceM: number,
  ): RideRow {
    const ride = this.getRide(id);
    if (!ride) throw new BizError(ErrorCode.NOT_FOUND, '行程不存在');

    const planDurationS = estimateDurationS(planDistanceM);
    this.db.run(
      `UPDATE t_ride SET dest_name = ?, dest_lng = ?, dest_lat = ?, dest_category = 'other',
        plan_distance_m = ?, plan_duration_s = ? WHERE id = ?`,
      target.name,
      target.lng,
      target.lat,
      Math.max(1, Math.round(planDistanceM)),
      planDurationS,
      id,
    );
    this.db.run(
      `UPDATE t_stop_request SET status = 'ACCEPTED', target_name = ?, target_lng = ?, target_lat = ? WHERE id = ? AND ride_id = ?`,
      target.name,
      target.lng,
      target.lat,
      stopId,
      id,
    );
    return this.getRide(id)!;
  }

  /** 停靠请求已处理完（乘客下车 / 行程结束） */
  resolveStopRequest(rideId: number, stopId: number, status: 'DONE' | 'CANCELLED' = 'DONE'): void {
    this.db.run(
      `UPDATE t_stop_request SET status = ?, resolved_at = ? WHERE id = ? AND ride_id = ?`,
      status,
      Date.now(),
      stopId,
      rideId,
    );
  }

  /** 停靠请求：普通（前方下车）或紧急停车 */
  requestStop(id: number, kind: 'NORMAL' | 'EMERGENCY', target?: { name: string; lng: number; lat: number }, note = '') {
    const ride = this.getRide(id);
    if (!ride) throw new BizError(ErrorCode.NOT_FOUND, '行程不存在');
    if (ride.status !== RideStatus.ONGOING && ride.status !== RideStatus.ARRIVING) {
      throw new BizError(ErrorCode.RIDE_STATE_INVALID, '当前状态无法请求停靠');
    }
    const r = this.db.run(
      `INSERT INTO t_stop_request (ride_id, kind, target_name, target_lng, target_lat, note, status, created_at)
       VALUES (?,?,?,?,?,?, 'PENDING', ?)`,
      id,
      kind,
      target?.name ?? '',
      target?.lng ?? null,
      target?.lat ?? null,
      note,
      Date.now(),
    );

    if (kind === 'EMERGENCY') {
      this.db.run(`INSERT INTO t_sos_record (ride_id, user_id, reason, status, created_at) VALUES (?,?,?, 'HANDLING', ?)`, id, ride.user_id, note || '乘客触发紧急停车', Date.now());
      this.recordEvent(id, 'SAFETY', 'EMERGENCY_STOP', '紧急停车已受理', '车辆正在寻找最近的安全位置靠边停车，远程安全员已同步收到通知');
      this.bus.emit(DomainEvent.NOTICE, {
        rideId: id,
        kind: 'warn',
        title: '紧急停车已受理',
        detail: '车辆正在靠边停车，远程安全员已介入',
      });
    } else {
      this.recordEvent(id, 'SYSTEM', 'STOP_REQUEST', '停靠请求已提交', target?.name ? `将在「${target.name}」附近靠边停车` : '车辆将在安全位置靠边停车');
    }

    this.bus.emit(DomainEvent.RIDE_STOP_REQUESTED, { id: r.lastInsertRowid, rideId: id, kind, target });
    return { id: r.lastInsertRowid, kind, status: 'PENDING' };
  }

  cancelStop(id: number, stopId: number) {
    // 只允许撤还没落地的请求。已经 DONE 的那条再撤销会改写历史。
    this.db.run(
      `UPDATE t_stop_request SET status = 'CANCELLED', resolved_at = ? WHERE id = ? AND ride_id = ? AND status IN ('PENDING','ACCEPTED')`,
      Date.now(),
      stopId,
      id,
    );
    // 通知仿真：如果撤的正是当前生效的那条，必须把终点和路线改回去，
    // 否则界面说"已取消"、车却还在往停靠点开。
    this.bus.emit(DomainEvent.RIDE_STOP_CANCELLED, { id: stopId, rideId: id });
    return { ok: true };
  }

  listStopRequests(id: number) {
    return this.db.all(`SELECT * FROM t_stop_request WHERE ride_id = ? ORDER BY id DESC LIMIT 10`, id);
  }

  /** 下车开门（车辆必须已停稳） */
  openDoor(id: number) {
    const ride = this.getRide(id);
    if (!ride) throw new BizError(ErrorCode.NOT_FOUND, '行程不存在');
    const v = this.fleet.getVehicle(ride.vehicle_id)!;
    if (ride.status !== RideStatus.ARRIVED || Math.round(v.speed_kph) > 1) {
      throw new BizError(ErrorCode.DOOR_NOT_ALLOWED, '车辆尚未停稳，出于安全考虑暂不可开门');
    }
    this.db.run(
      `INSERT INTO t_vehicle_command (vehicle_id, ride_id, target, action, value, status, created_at)
       VALUES (?,?,?,?,?, 'DONE', ?)`,
      v.id,
      id,
      'door',
      'OPEN',
      'right',
      Date.now(),
    );
    this.recordEvent(id, 'SYSTEM', 'DOOR_OPEN', '车门已开启', '请确认随身物品，注意后方来车');
    return { ok: true, openedAt: Date.now() };
  }

  /** 结束会话：写入账单、标记完成、清理本次会话数据 */
  complete(id: number) {
    const ride = this.getRide(id);
    if (!ride) throw new BizError(ErrorCode.NOT_FOUND, '行程不存在');
    if (ride.status === RideStatus.COMPLETED) return this.getRide(id)!;

    if (ride.status !== RideStatus.ARRIVED) {
      this.db.run(`UPDATE t_ride SET status = 'ARRIVED', arrived_at = ? WHERE id = ?`, Date.now(), id);
    }

    // 按实际行驶里程结算（真实里程比规划更诚实）
    const actualDistance = Math.max(ride.traveled_m, Math.round(ride.plan_distance_m * 0.96));
    // 时长必须用"仿真意义上的行程用时"，不能用墙上时钟。
    // 演示时仿真可能跑在 16 倍速，一趟 4.7 公里的路墙上只过了 11 秒，
    // 用它结算会把平均车速算成 1539 km/h、总时长显示成 1 分钟，账单里的时长费也是错的。
    // 行程始终按 plan 推进（剩余里程 = 计划里程 - 已行驶里程），
    // 所以用时按里程占比折算即可，跑完全程时正好等于计划用时。
    const actualDuration =
      ride.plan_distance_m > 0
        ? Math.max(1, Math.round(ride.plan_duration_s * (actualDistance / ride.plan_distance_m)))
        : ride.plan_duration_s;
    const fare = computeFare(ride.model_code, actualDistance, actualDuration, ride.fare_discount);
    this.db.run(
      `UPDATE t_ride SET plan_distance_m = ?, plan_duration_s = ?, fare_total = ?, fare_base = ?, fare_distance = ?, fare_time = ?, co2_saved_g = ? WHERE id = ?`,
      actualDistance,
      actualDuration,
      fare.total,
      fare.base,
      fare.distance,
      fare.time,
      co2SavedG(actualDistance),
      id,
    );
    this.db.run(
      `INSERT INTO t_fare (ride_id, base_fare, distance_fare, time_fare, discount, total, paid_channel, paid, paid_at)
       VALUES (?,?,?,?,?,?, 'APP', 1, ?)
       ON CONFLICT(ride_id) DO UPDATE SET base_fare = excluded.base_fare, distance_fare = excluded.distance_fare,
         time_fare = excluded.time_fare, discount = excluded.discount, total = excluded.total, paid_at = excluded.paid_at`,
      id,
      fare.base,
      fare.distance,
      fare.time,
      fare.discount,
      fare.total,
      Date.now(),
    );

    return this.setStatus(id, RideStatus.COMPLETED, '行程已结束，账单已同步至手机端');
  }

  rate(id: number, score: number, tags: string[] = []) {
    if (!(score >= 1 && score <= 5)) throw new BizError(ErrorCode.BAD_REQUEST, '评分需在 1 到 5 之间');
    this.db.run(
      `INSERT INTO t_rating (ride_id, score, tags, created_at) VALUES (?,?,?,?)
       ON CONFLICT(ride_id) DO UPDATE SET score = excluded.score, tags = excluded.tags, created_at = excluded.created_at`,
      id,
      score,
      tags.join(','),
      Date.now(),
    );
    this.db.run('UPDATE t_ride SET rating_score = ? WHERE id = ?', score, id);
    this.db.run(`INSERT INTO t_vehicle_command (vehicle_id, ride_id, target, action, value, status, created_at)
      SELECT vehicle_id, id, 'rating', 'SUBMIT', ?, 'DONE', ? FROM t_ride WHERE id = ?`, String(score), Date.now(), id);
    return { ok: true };
  }

  // ---------------------------------------------------------------- 轨迹与事件

  recordRoutePoint(rideId: number, lng: number, lat: number, speed: number, ts = Date.now()): void {
    const seq = (this.routeSeq.get(rideId) ?? this.db.get<{ c: number }>('SELECT COUNT(*) AS c FROM t_ride_route WHERE ride_id = ?', rideId)?.c ?? 0) + 1;
    this.routeSeq.set(rideId, seq);
    this.db.run('INSERT OR REPLACE INTO t_ride_route (ride_id, seq, lng, lat, speed, ts) VALUES (?,?,?,?,?,?)', rideId, seq, lng, lat, speed, ts);
  }

  /** 由仿真引擎高频调用，只更新一个字段 */
  setTraveled(rideId: number, meters: number): void {
    this.db.run('UPDATE t_ride SET traveled_m = ? WHERE id = ?', Math.round(meters), rideId);
  }

  routePoints(rideId: number) {
    return this.db.all<{ seq: number; lng: number; lat: number; speed: number; ts: number }>(
      'SELECT seq, lng, lat, speed, ts FROM t_ride_route WHERE ride_id = ? ORDER BY seq',
      rideId,
    );
  }

  recordEvent(rideId: number, kind: string, type: string, title: string, detail: string, icon = '', payload: unknown = {}) {
    this.db.run(
      `INSERT INTO t_ride_event (ride_id, kind, type, title, detail, icon, payload, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      rideId,
      kind,
      type,
      title,
      detail,
      icon,
      JSON.stringify(payload),
      Date.now(),
    );
  }

  /** 行程事件流（决策可视化的历史记录） */
  rideEvents(rideId: number, limit = 30) {
    return this.db.all<{
      id: number;
      kind: string;
      type: string;
      title: string;
      detail: string;
      icon: string;
      created_at: number;
    }>('SELECT id, kind, type, title, detail, icon, created_at FROM t_ride_event WHERE ride_id = ? ORDER BY id DESC LIMIT ?', rideId, limit);
  }

  currentBehavior(rideId: number) {
    return this.db.get<{ type: string; title: string; detail: string; icon: string; created_at: number }>(
      `SELECT type, title, detail, icon, created_at FROM t_ride_event
       WHERE ride_id = ? AND kind = 'BEHAVIOR' ORDER BY id DESC LIMIT 1`,
      rideId,
    );
  }

  private mapBehavior(row: { type: string; title: string; detail: string; icon: string; created_at: number }) {
    const def = behavior(row.type);
    return {
      type: row.type,
      short: def?.short ?? row.title,
      title: row.title,
      detail: row.detail,
      icon: row.icon || def?.icon || 'cruise',
      slowsDown: def?.slowsDown ?? false,
      at: row.created_at,
    };
  }

  // ---------------------------------------------------------------- 小结与解释

  /** 行程小结：ECharts 的数据源 */
  summary(rideId: number) {
    const ride = this.getRide(rideId);
    if (!ride) throw new BizError(ErrorCode.NOT_FOUND, '行程不存在');
    const fare = this.db.get<Record<string, number>>('SELECT * FROM t_fare WHERE ride_id = ?', rideId);
    const route = this.routePoints(rideId);
    // 用 plan_duration_s 而不是 ended_at - started_at：
    // 后者是墙上时钟，在倍速仿真下会被压缩到几秒，见 complete() 的说明。
    const durationS = ride.plan_duration_s > 0 ? ride.plan_duration_s : Math.round(Math.max(0, (ride.ended_at ?? Date.now()) - (ride.started_at ?? Date.now())) / 1000);

    // 速度曲线（抽样，避免点太密）
    const step = Math.max(1, Math.floor(route.length / 40));
    const speedCurve = route
      .filter((_, i) => i % step === 0)
      .map((p) => ({ t: p.ts, v: +p.speed.toFixed(1) }));

    // 平均车速用"实际里程 / 实际时长"。实际里程还没落库时（例如刚上车就查小结）
    // 回落到计划里程，否则会显示成 0 km/h，看起来像是个 bug。
    const distanceM = ride.traveled_m > 0 ? ride.traveled_m : ride.plan_distance_m;
    const avgSpeed = durationS > 0 ? distanceM / 1000 / (durationS / 3600) : 0;

    return {
      ride: this.serialize(ride, 0, 0),
      fare: {
        base: fare?.base_fare ?? ride.fare_base,
        distance: fare?.distance_fare ?? ride.fare_distance,
        time: fare?.time_fare ?? ride.fare_time,
        discount: fare?.discount ?? ride.fare_discount,
        total: fare?.total ?? ride.fare_total,
        paidChannel: '手机端已支付',
      },
      stats: {
        distanceM: ride.plan_distance_m,
        durationS,
        avgSpeedKph: +avgSpeed.toFixed(1),
        maxSpeedKph: route.length ? +Math.max(...route.map((p) => p.speed)).toFixed(1) : 0,
        co2SavedG: ride.co2_saved_g,
        points: route.length,
      },
      speedCurve,
      route,
      rating: this.db.get('SELECT score, tags FROM t_rating WHERE ride_id = ?', rideId) ?? null,
    };
  }

  /** 旅程解释：本次行程的时间都花在哪了（堆叠条数据） */
  explain(rideId: number) {
    const ride = this.getRide(rideId);
    if (!ride) throw new BizError(ErrorCode.NOT_FOUND, '行程不存在');
    const rows = this.db.all<{ type: string; c: number }>(
      `SELECT type, COUNT(*) AS c FROM t_ride_event WHERE ride_id = ? AND kind = 'BEHAVIOR' GROUP BY type ORDER BY c DESC`,
      rideId,
    );
    const total = rows.reduce((s, r) => s + Number(r.c), 0) || 1;
    const segments = rows.map((r) => {
      const def = behavior(r.type);
      return {
        type: r.type,
        label: def?.short ?? r.type,
        detail: def?.detail ?? '',
        count: Number(r.c),
        ratio: +(Number(r.c) / total).toFixed(3),
      };
    });
    // 同 summary()：时长取计划用时，不用被倍速压缩过的墙上时钟
    const durationS = ride.plan_duration_s > 0 ? ride.plan_duration_s : Math.round(Math.max(0, (ride.ended_at ?? Date.now()) - (ride.started_at ?? Date.now())) / 1000);
    const slowed = segments.filter((s) => behavior(s.type)?.slowsDown).reduce((a, s) => a + s.ratio, 0);
    return {
      rideId,
      durationS,
      segments,
      slowedRatio: +slowed.toFixed(3),
      conclusion:
        slowed > 0.4
          ? '本次行程有较多时间花在等待与礼让上，属于城市道路的正常情况。'
          : '本次行程整体顺畅，大部分时间都在平稳行驶。',
      timeline: this.rideEvents(rideId, 40).filter((e) => e.kind === 'BEHAVIOR'),
    };
  }

  /** 到达阈值判定用的常量，供仿真模块使用 */
  get arrivingThresholdM() {
    return ARRIVING_THRESHOLD_M;
  }
}
