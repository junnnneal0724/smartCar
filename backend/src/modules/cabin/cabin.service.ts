import { Injectable, Logger } from '@nestjs/common';
import { SqliteService } from '../../infra/sqlite.service';
import { DomainEvent, DomainEvents } from '../../libs/common/events';
import { BizError, ErrorCode } from '../../libs/common/result';
import { FleetService } from '../fleet/fleet.service';
import { RideStatus } from '../../libs/common/ride-status';

export interface CabinSetting {
  vehicle_id: string;
  temp_left: number;
  temp_right: number;
  fan_level: number;
  seat_heat: number;
  seat_vent: number;
  ambient_light: string;
  brightness: number;
  volume: number;
  curtain: number;
  scene: string;
  updated_at: number;
}

export interface ScenePreset {
  key: string;
  name: string;
  desc: string;
  icon: string;
  patch: Partial<Pick<CabinSetting, 'temp_left' | 'temp_right' | 'fan_level' | 'seat_heat' | 'seat_vent' | 'ambient_light' | 'brightness' | 'volume' | 'curtain'>>;
}

/**
 * 座舱域：温度、风量、座椅、氛围灯、亮度、音量、遮阳帘。
 * 独占 t_cabin_setting / t_vehicle_command。
 *
 * 说明：真实车机上这些是 CAN 总线指令，这里是本地模拟，
 * 但保留了"指令记录"（t_vehicle_command），便于 /ops 观察与将来对接。
 */
@Injectable()
export class CabinService {
  private readonly logger = new Logger('Cabin');

  /** 预设场景：车内终端最实用的功能之一，一键把座舱调到合适状态 */
  private readonly scenes: ScenePreset[] = [
    {
      key: 'standard',
      name: '标准',
      desc: '默认舒适的乘车环境',
      icon: 'standard',
      patch: { temp_left: 24, temp_right: 24, fan_level: 2, seat_heat: 0, seat_vent: 0, ambient_light: 'warm', brightness: 60, volume: 30, curtain: 0 },
    },
    {
      key: 'sleep',
      name: '小憩',
      desc: '调暗灯光、降低风量，适合闭眼休息',
      icon: 'sleep',
      patch: { temp_left: 25, temp_right: 25, fan_level: 1, seat_heat: 1, seat_vent: 0, ambient_light: 'off', brightness: 15, volume: 0, curtain: 1 },
    },
    {
      key: 'work',
      name: '办公',
      desc: '灯光提亮、温度偏凉，适合处理事情',
      icon: 'work',
      patch: { temp_left: 23, temp_right: 23, fan_level: 2, seat_heat: 0, seat_vent: 0, ambient_light: 'neutral', brightness: 80, volume: 15, curtain: 0 },
    },
    {
      key: 'relax',
      name: '放松',
      desc: '暖光与轻音乐，适合看风景',
      icon: 'relax',
      patch: { temp_left: 24, temp_right: 24, fan_level: 3, seat_heat: 0, seat_vent: 0, ambient_light: 'warm', brightness: 55, volume: 40, curtain: 0 },
    },
    {
      key: 'motion',
      name: '舒缓',
      desc: '针对容易晕车：加大新风、降低屏幕亮度',
      icon: 'motion',
      patch: { temp_left: 22, temp_right: 22, fan_level: 3, seat_heat: 0, seat_vent: 1, ambient_light: 'cool', brightness: 35, volume: 0, curtain: 0 },
    },
  ];

  constructor(
    private readonly db: SqliteService,
    private readonly fleet: FleetService,
    private readonly events: DomainEvents,
  ) {
    // 乘客确认开始行程时，自动套用其历史偏好（"我的偏好一键应用"）
    this.events.on<{ rideId: number; to: string; vehicleId: string }>(DomainEvent.RIDE_STATUS_CHANGED, (p) => {
      if (p?.to !== RideStatus.ONGOING || !p.vehicleId) return;
      try {
        this.applyUserPreference(p.rideId, p.vehicleId);
      } catch (e) {
        this.logger.warn(`套用乘客偏好失败: ${(e as Error).message}`);
      }
    });
  }

  getScenes() {
    return this.scenes.map(({ key, name, desc, icon }) => ({ key, name, desc, icon }));
  }

  getSetting(vehicleId?: string): CabinSetting {
    const id = vehicleId ?? this.fleet.terminalVehicleId;
    let row = this.db.get<CabinSetting>('SELECT * FROM t_cabin_setting WHERE vehicle_id = ?', id);
    if (!row) {
      this.db.run(
        `INSERT INTO t_cabin_setting (vehicle_id, updated_at) VALUES (?, ?)`,
        id,
        Date.now(),
      );
      row = this.db.get<CabinSetting>('SELECT * FROM t_cabin_setting WHERE vehicle_id = ?', id)!;
    }
    return row;
  }

  /** 提供给屏幕的视图（含可读的单位与范围，前端不再硬编码） */
  view(vehicleId?: string) {
    const s = this.getSetting(vehicleId);
    return {
      setting: {
        tempLeft: s.temp_left,
        tempRight: s.temp_right,
        fanLevel: s.fan_level,
        seatHeat: s.seat_heat,
        seatVent: s.seat_vent,
        ambientLight: s.ambient_light,
        brightness: s.brightness,
        volume: s.volume,
        curtain: s.curtain,
        scene: s.scene,
      },
      scenes: this.getScenes(),
      ranges: {
        temp: { min: 16, max: 30, step: 0.5 },
        fan: { min: 0, max: 3 },
        seat: { min: 0, max: 3 },
        brightness: { min: 10, max: 100 },
        volume: { min: 0, max: 100 },
      },
      ambientOptions: [
        { key: 'off', name: '关闭', color: '#3A4049' },
        { key: 'warm', name: '暖光', color: '#FFB877' },
        { key: 'neutral', name: '自然光', color: '#E8EEF7' },
        { key: 'cool', name: '冷光', color: '#7FB4FF' },
      ],
      updatedAt: s.updated_at,
    };
  }

  /** 局部更新：屏幕上的每个控件都是独立指令 */
  update(vehicleId: string, patch: Record<string, unknown>, source = 'screen') {
    const s = this.getSetting(vehicleId);
    const set: string[] = [];
    const vals: unknown[] = [];

    const num = (key: string, value: number, min: number, max: number, col: string) => {
      if (value === undefined || value === null) return;
      if (typeof value !== 'number' || Number.isNaN(value)) throw new BizError(ErrorCode.BAD_REQUEST, `${key} 必须是数字`);
      if (value < min || value > max) throw new BizError(ErrorCode.BAD_REQUEST, `${key} 需在 ${min} 到 ${max} 之间`);
      set.push(`${col} = ?`);
      vals.push(value);
    };

    num('tempLeft', patch.tempLeft as number, 16, 30, 'temp_left');
    num('tempRight', patch.tempRight as number, 16, 30, 'temp_right');
    num('fanLevel', patch.fanLevel as number, 0, 3, 'fan_level');
    num('seatHeat', patch.seatHeat as number, 0, 3, 'seat_heat');
    num('seatVent', patch.seatVent as number, 0, 3, 'seat_vent');
    num('brightness', patch.brightness as number, 10, 100, 'brightness');
    num('volume', patch.volume as number, 0, 100, 'volume');
    num('curtain', patch.curtain as number, 0, 1, 'curtain');

    if (patch.ambientLight !== undefined) {
      const valid = ['off', 'warm', 'neutral', 'cool'];
      if (!valid.includes(String(patch.ambientLight))) throw new BizError(ErrorCode.BAD_REQUEST, '氛围灯取值不合法');
      set.push('ambient_light = ?');
      vals.push(String(patch.ambientLight));
    }

    if (!set.length) return this.view(vehicleId);

    set.push('scene = ?', 'updated_at = ?');
    vals.push('custom', Date.now(), vehicleId);
    this.db.run(`UPDATE t_cabin_setting SET ${set.join(', ')} WHERE vehicle_id = ?`, ...vals);

    const changed = Object.keys(patch).filter((k) => patch[k] !== undefined);
    for (const key of changed) {
      this.db.run(
        `INSERT INTO t_vehicle_command (vehicle_id, ride_id, target, action, value, status, created_at)
         VALUES (?,?, 'cabin', ?, ?, 'DONE', ?)`,
        vehicleId,
        this.currentRideId(vehicleId),
        key,
        String(patch[key]),
        Date.now(),
      );
    }

    const next = this.view(vehicleId);
    this.events.emit(DomainEvent.CABIN_CHANGED, { vehicleId, setting: next.setting, source });
    return next;
  }

  /** 一键套用预设场景 */
  applyScene(vehicleId: string, key: string) {
    const scene = this.scenes.find((s) => s.key === key);
    if (!scene) throw new BizError(ErrorCode.NOT_FOUND, '场景不存在');
    this.update(vehicleId, { ...scene.patch, scene: key } as Record<string, unknown>, 'scene');
    this.db.run('UPDATE t_cabin_setting SET scene = ? WHERE vehicle_id = ?', key, vehicleId);
    return this.view(vehicleId);
  }

  /** 行程开始时套用乘客的历史偏好 */
  private applyUserPreference(rideId: number, vehicleId: string) {
    const ride = this.db.get<{ user_id: number }>('SELECT user_id FROM t_ride WHERE id = ?', rideId);
    if (!ride) return;
    const pref = this.db.get<{ temperature: number; ambient_light: string; seat_heat: number; quiet_mode: number }>(
      'SELECT temperature, ambient_light, seat_heat, quiet_mode FROM t_user_preference WHERE user_id = ?',
      ride.user_id,
    );
    if (!pref) return;
    this.update(
      vehicleId,
      {
        tempLeft: pref.temperature,
        tempRight: pref.temperature,
        ambientLight: pref.ambient_light,
        seatHeat: pref.seat_heat,
        volume: pref.quiet_mode ? 0 : 30,
      },
      'preference',
    );
    this.logger.log(`已按乘客偏好初始化座舱（行程 ${rideId}）`);
  }

  private currentRideId(vehicleId: string): number | null {
    const row = this.db.get<{ id: number }>(
      `SELECT id FROM t_ride WHERE vehicle_id = ? AND status NOT IN ('COMPLETED','CANCELLED') ORDER BY id DESC LIMIT 1`,
      vehicleId,
    );
    return row?.id ?? null;
  }

  /** 由仿真/ops 用来演示"车辆自检调整" */
  recentCommands(limit = 20) {
    return this.db.all(
      `SELECT id, target, action, value, status, created_at FROM t_vehicle_command ORDER BY id DESC LIMIT ?`,
      limit,
    );
  }
}
