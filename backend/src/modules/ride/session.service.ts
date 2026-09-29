import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { SqliteService } from '../../infra/sqlite.service';
import { BizError, ErrorCode } from '../../libs/common/result';
import { RideStatus, PHASES } from '../../libs/common/ride-status';
import { RideService } from './ride.service';
import { FleetService } from '../fleet/fleet.service';

/** 行程结束后，小结页在车机上保留多久 */
const SUMMARY_WINDOW_MS = 15 * 60 * 1000;

export interface SessionRow {
  token: string;
  ride_id: number;
  vehicle_id: string;
  user_id: number | null;
  status: 'PENDING' | 'ACTIVE' | 'ENDED';
  verified_at: number | null;
  ended_at: number | null;
  created_at: number;
  last_seen: number;
}

/**
 * 行程会话：车机是公共设备，不做登录注册。
 * 乘客上车后通过「手机号后 4 位」校验身份，换取一个只在本段行程有效的 token。
 * 行程结束 → 会话失效 → 本次个人数据不再可访问（对应真实车机的隐私要求）。
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger('Session');

  constructor(
    private readonly db: SqliteService,
    private readonly ride: RideService,
    private readonly fleet: FleetService,
  ) {}

  /** 车机启动时调用：告诉我现在该显示什么 */
  bootstrap() {
    const ride = this.ride.getCurrentRide();

    if (!ride) {
      // 刚结束的行程要能继续看到小结；隔得太久（默认 15 分钟）则视为"下一位乘客"，回到空闲态
      const last = this.ride.lastCompleted();
      const fresh = !!last?.ended_at && Date.now() - last.ended_at < SUMMARY_WINDOW_MS;
      return {
        vehicle: this.vehicleBrief(),
        ride: last ? this.ride.serialize(last, 0, 0) : null,
        phases: PHASES,
        behavior: null,
        needVerify: false,
        state: fresh ? ('SUMMARY' as const) : ('IDLE' as const),
        message: fresh ? '' : '当前没有进行中的行程',
      };
    }

    const view = this.ride.currentView();
    return {
      vehicle: this.vehicleBrief(),
      ride: view.ride,
      phases: view.phases,
      behavior: view.behavior,
      needVerify: ride.status === RideStatus.ABOARD,
      state: this.screenState(ride.status),
      message: '',
    };
  }

  /** 把行程状态映射为「屏幕该进入哪个页面」 */
  private screenState(status: string): 'WAITING' | 'WELCOME' | 'READY' | 'TRIP' | 'ARRIVING' | 'ARRIVED' | 'SUMMARY' {
    switch (status) {
      case RideStatus.PENDING:
        return 'WAITING';
      case RideStatus.ABOARD:
        return 'WELCOME';
      case RideStatus.READY:
        return 'READY';
      case RideStatus.ONGOING:
        return 'TRIP';
      case RideStatus.ARRIVING:
        return 'ARRIVING';
      case RideStatus.ARRIVED:
        return 'ARRIVED';
      case RideStatus.COMPLETED:
        return 'SUMMARY';
      default:
        return 'WAITING';
    }
  }

  private vehicleBrief() {
    const v = this.fleet.getTerminalVehicle();
    return {
      id: v.id,
      plateNo: v.plate_no,
      cabinNo: v.cabin_no,
      modelCode: v.model_code,
      battery: v.battery,
      cameraOn: !!v.camera_on,
      micOn: !!v.mic_on,
    };
  }

  /** 上车校验：手机号后 4 位 */
  verify(code: string, rideId?: number) {
    const ride = rideId ? this.ride.getRide(rideId) : this.ride.getCurrentRide();
    if (!ride) throw new BizError(ErrorCode.NOT_FOUND, '当前没有进行中的行程');
    if (ride.status !== RideStatus.ABOARD && ride.status !== RideStatus.READY) {
      throw new BizError(ErrorCode.RIDE_STATE_INVALID, '当前行程状态无需校验');
    }

    const input = String(code ?? '').trim();
    if (!/^\d{4}$/.test(input)) throw new BizError(ErrorCode.BAD_REQUEST, '请输入手机号后 4 位数字');
    if (input !== ride.verify_code) {
      this.ride.recordEvent(ride.id, 'SAFETY', 'VERIFY_FAILED', '身份校验失败', '输入的手机尾号与订单不一致');
      throw new BizError(ErrorCode.UNLOCK_CODE_WRONG, '手机尾号与订单不匹配，请核对后重试');
    }

    // 复用同一行程未失效的会话，避免刷新页面就多出一条记录
    const existing = this.db.get<SessionRow>(
      `SELECT * FROM t_ride_session WHERE ride_id = ? AND status = 'ACTIVE' ORDER BY created_at DESC LIMIT 1`,
      ride.id,
    );
    let token: string;
    if (existing) {
      token = existing.token;
      this.db.run('UPDATE t_ride_session SET last_seen = ? WHERE token = ?', Date.now(), token);
    } else {
      token = randomBytes(24).toString('hex');
      this.db.run(
        `INSERT INTO t_ride_session (token, ride_id, vehicle_id, user_id, status, verified_at, created_at, last_seen)
         VALUES (?,?,?,?, 'ACTIVE', ?, ?, ?)`,
        token,
        ride.id,
        ride.vehicle_id,
        ride.user_id,
        Date.now(),
        Date.now(),
        Date.now(),
      );
    }

    if (ride.status === RideStatus.ABOARD) {
      this.ride.setStatus(ride.id, RideStatus.READY, '乘客身份校验通过');
    }
    this.logger.log(`行程 ${ride.ride_no} 校验通过`);
    return { token, ride: this.ride.getRide(ride.id)! };
  }

  getSession(token: string): SessionRow | undefined {
    const s = this.db.get<SessionRow>('SELECT * FROM t_ride_session WHERE token = ?', token);
    if (!s || s.status !== 'ACTIVE') return undefined;
    // 会话与行程绑定：行程结束则会话自然失效
    const ride = this.ride.getRide(s.ride_id);
    if (!ride || ride.status === RideStatus.COMPLETED || ride.status === RideStatus.CANCELLED) return undefined;
    this.db.run('UPDATE t_ride_session SET last_seen = ? WHERE token = ?', Date.now(), token);
    return s;
  }

  /** 行程结束：清除本次会话（对应车机交给下一位乘客前的数据清理） */
  endSession(rideId: number) {
    this.db.run(
      `UPDATE t_ride_session SET status = 'ENDED', ended_at = ? WHERE ride_id = ? AND status = 'ACTIVE'`,
      Date.now(),
      rideId,
    );
    return { ok: true };
  }

  current(token: string) {
    const s = this.getSession(token);
    if (!s) return { valid: false };
    return { valid: true, rideId: s.ride_id, verifiedAt: s.verified_at };
  }
}
