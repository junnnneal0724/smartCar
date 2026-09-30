import { Injectable, Logger } from '@nestjs/common';
import { SqliteService } from './sqlite.service';
import { MapService } from '../libs/map/map.service';
import { distanceM } from '../libs/common/geo';
import { MODELS } from '../libs/common/pricing';

/**
 * 演示数据种子。
 *
 * 与其他项目不同的一点：这里会刻意造出「车辆正在来接你的路上」的初始状态，
 * 这样一打开车机就能看到车在动、并且在十几秒后到达上车点，
 * 让 Demo 一开局就有"活着"的感觉。
 */
@Injectable()
export class SeedService {
  private readonly logger = new Logger('Seed');

  private readonly demoUsers = [
    { phone: '13800001234', nickname: '林小满', tier: 'GOLD', temp: 23, light: 'warm', heat: 1, quiet: 1 },
    { phone: '13900005678', nickname: '周叙白', tier: 'STANDARD', temp: 25, light: 'neutral', heat: 0, quiet: 1 },
    { phone: '15000009876', nickname: '苏见月', tier: 'PLATINUM', temp: 22, light: 'cool', heat: 0, quiet: 0 },
  ];

  constructor(
    private readonly db: SqliteService,
    private readonly map: MapService,
  ) {}

  get isEmpty(): boolean {
    return (this.db.get<{ c: number }>('SELECT COUNT(*) AS c FROM t_vehicle')?.c ?? 0) === 0;
  }

  run(): { vehicles: number; pois: number; users: number } {
    const now = Date.now();
    this.seedModels();

    // ---- 乘客与偏好 ----
    for (const u of this.demoUsers) {
      this.db.run(
        `INSERT INTO t_user (phone, nickname, avatar, member_tier, created_at) VALUES (?,?,?,?,?)
         ON CONFLICT(phone) DO NOTHING`,
        u.phone,
        u.nickname,
        '',
        u.tier,
        now,
      );
      const row = this.db.get<{ id: number }>('SELECT id FROM t_user WHERE phone = ?', u.phone)!;
      this.db.run(
        `INSERT INTO t_user_preference (user_id, temperature, music_style, quiet_mode, ambient_light, seat_heat)
         VALUES (?,?,?,?,?,?) ON CONFLICT(user_id) DO NOTHING`,
        row.id,
        u.temp,
        'light',
        u.quiet,
        u.light,
        u.heat,
      );
    }

    // ---- POI ----
    const pois = this.map.pois;
    for (const p of pois) {
      this.db.run(
        `INSERT INTO t_poi (id, name, aliases, category, node_id, lng, lat) VALUES (?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, category = excluded.category,
           lng = excluded.lng, lat = excluded.lat`,
        p.id,
        p.name,
        '',
        p.category,
        p.nodeId ?? null,
        p.lng,
        p.lat,
      );
    }

    // ---- 车辆：本终端车 + 若干陪跑车 ----
    const nodes = this.map.nodes;
    const pick = (i: number) => nodes[(i * 7 + 3) % nodes.length];
    const vehicles = [
      { id: 'V-01', model: 'SOLO', battery: 86 },
      { id: 'V-02', model: 'COMFORT', battery: 72 },
      { id: 'V-03', model: 'SOLO', battery: 91 },
      { id: 'V-04', model: 'SHARE', battery: 64 },
      { id: 'V-05', model: 'COMFORT', battery: 78 },
      { id: 'V-06', model: 'SOLO', battery: 55 },
      { id: 'V-07', model: 'SHARE', battery: 88 },
      { id: 'V-08', model: 'COMFORT', battery: 69 },
    ];
    vehicles.forEach((v, i) => {
      const n = pick(i);
      const seq = String(i + 1).padStart(2, '0');
      this.db.run(
        `INSERT INTO t_vehicle (id, plate_no, cabin_no, model_code, battery, status, lng, lat, heading,
           road_name, odometer_m, camera_on, mic_on, updated_at)
         VALUES (?,?,?,?,?, 'IDLE', ?, ?, 0, '', ?, 1, 0, ?)
         ON CONFLICT(id) DO NOTHING`,
        v.id,
        `京A·${8800 + i}${seq.slice(1)}`,
        `CABIN-${seq}`,
        v.model,
        v.battery,
        n.lng,
        n.lat,
        18600 + i * 2340,
        now,
      );
      this.db.run(`INSERT INTO t_cabin_setting (vehicle_id, updated_at) VALUES (?, ?) ON CONFLICT(vehicle_id) DO NOTHING`, v.id, now);
    });

    this.logger.log(`种子完成：${vehicles.length} 台车 / ${pois.length} 个地点 / ${this.demoUsers.length} 位乘客`);
    return { vehicles: vehicles.length, pois: pois.length, users: this.demoUsers.length };
  }

  /**
   * 生成一段新的演示行程。
   * 车辆会被放在离上车点约 500~900 米的位置，仿真会把它开过来。
   */
  createDemoRide(): number {
    const vehicleId = process.env.TERMINAL_VEHICLE_ID ?? 'V-01';
    const pois = this.map.pois;
    if (pois.length < 2) throw new Error('地图 POI 不足，请先执行 pnpm gen:map');

    // 上车点取「离城市中心最近的地标」：这样地图上的行程一定在可视区中间，
    // 不会出现"车在机场、地图却停在市中心"的割裂感。
    const center = this.map.raw.meta.center;
    const origin = pois.reduce(
      (best, p) => (distanceM(center, p) < distanceM(center, best) ? p : best),
      pois[0],
    );
    const candidates = pois.filter((p) => {
      if (p.id === origin.id) return false;
      const d = distanceM({ lng: origin.lng, lat: origin.lat }, { lng: p.lng, lat: p.lat });
      return d > 3000 && d < 8000;
    });
    const dest = candidates[Math.floor(Math.random() * candidates.length)] ?? pois[pois.length - 1];

    const user = this.db.get<{ id: number }>('SELECT id FROM t_user ORDER BY id LIMIT 1')!;

    /**
     * 乘车校验码，演示里固定成 1234。
     *
     * 车机是公共设备，乘客凭什么证明"这一单是我的"？靠一个只有他知道、
     * 同车其他人不知道的数字，所以校验页的文案写的是"手机号后 4 位"。
     * 这里固定住是刻意的：演示时不用再去 /ops 里翻 t_ride 表抄随机码，
     * 观众也能一次记住。它正好等于播种的默认乘客（林小满 13800001234）
     * 的手机尾号，所以那句文案依然是真的。
     * 注意：换了默认乘客（改了 t_user 的种子手机号）就要一起改这里，
     * 否则界面提示会与实际校验值对不上。
     */
    const DEMO_VERIFY_CODE = '1234';
    const verifyCode = DEMO_VERIFY_CODE;

    // 车辆起点：离上车点 ~700 米的另一个节点
    const originNode = this.map.nearestNode({ lng: origin.lng, lat: origin.lat });
    const originNeighbors = this.map.neighbors(originNode.id);
    const startNode = originNeighbors.length
      ? this.map.node(originNeighbors[Math.floor(Math.random() * originNeighbors.length)].to)!
      : originNode;
    this.db.run(
      'UPDATE t_vehicle SET lng = ?, lat = ?, status = ?, road_name = ?, speed_kph = 0, updated_at = ? WHERE id = ?',
      startNode.lng,
      startNode.lat,
      'TO_PICKUP',
      '前往上车点',
      Date.now(),
      vehicleId,
    );

    const seq = (this.db.get<{ c: number }>('SELECT COUNT(*) AS c FROM t_ride')?.c ?? 0) + 1;
    const modelCode = this.db.get<{ model_code: string }>('SELECT model_code FROM t_vehicle WHERE id = ?', vehicleId)!.model_code;
    const fromNode = originNode;
    const toNode = this.map.nearestNode({ lng: dest.lng, lat: dest.lat });
    const legs = this.map.findPath(fromNode.id, toNode.id);
    const planDistanceM = legs.reduce((s, l) => s + l.lengthM, 0) || 4000;
    const planDurationS = Math.max(120, Math.round((planDistanceM / 1000 / 28) * 3600));

    const m = MODELS.find((x) => x.code === modelCode)!;
    const base = m.basePrice;
    const distanceFare = Math.round((planDistanceM / 1000) * m.perKm);
    const timeFare = Math.round((planDurationS / 60) * m.perMin);

    const d = new Date();
    const rideNo = `RX${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(seq).padStart(4, '0')}`;

    const r = this.db.run(
      `INSERT INTO t_ride (ride_no, user_id, vehicle_id, model_code, status,
        origin_name, origin_lng, origin_lat, dest_name, dest_lng, dest_lat, dest_category,
        passengers, verify_code, plan_distance_m, plan_duration_s, traveled_m,
        fare_total, fare_discount, fare_base, fare_distance, fare_time, co2_saved_g, created_at)
       VALUES (?,?,?,?, 'PENDING', ?,?,?,?,?,?,?, 1,?, ?,?, 0, ?,0,?,?,?,?, ?)`,
      rideNo,
      user.id,
      vehicleId,
      modelCode,
      origin.name,
      origin.lng,
      origin.lat,
      dest.name,
      dest.lng,
      dest.lat,
      dest.category,
      verifyCode,
      planDistanceM,
      planDurationS,
      base + distanceFare + timeFare,
      base,
      distanceFare,
      timeFare,
      Math.round((planDistanceM / 1000) * 150),
      Date.now(),
    );
    const rideId = r.lastInsertRowid;
    this.db.run('UPDATE t_vehicle SET current_ride_id = ? WHERE id = ?', rideId, vehicleId);
    this.db.run(
      `INSERT INTO t_ride_event (ride_id, kind, type, title, detail, icon, payload, created_at)
       VALUES (?, 'SYSTEM', 'RIDE_CREATED', '行程已创建', ?, '', '{}', ?)`,
      rideId,
      `${origin.name} → ${dest.name}`,
      Date.now(),
    );
    this.logger.log(`演示行程已生成：${rideNo} ${origin.name} → ${dest.name}（${(planDistanceM / 1000).toFixed(1)}km，尾号 ${verifyCode}）`);
    return rideId;
  }

  private seedModels() {
    for (const m of MODELS) {
      this.db.run(
        `INSERT INTO t_vehicle_model (code, name, tagline, seats, accent, features) VALUES (?,?,?,?,?,?)
         ON CONFLICT(code) DO UPDATE SET name = excluded.name, tagline = excluded.tagline, features = excluded.features`,
        m.code,
        m.name,
        m.tagline,
        m.seats,
        m.accent,
        JSON.stringify(m.features),
      );
    }
  }

  /** 清空全部业务数据（保留表结构），用于 /ops 一键重来 */
  truncateAll(): void {
    this.db.truncateAll();
    this.logger.warn('已清空全部业务表');
  }
}
