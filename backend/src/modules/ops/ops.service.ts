import { Injectable } from '@nestjs/common';
import { SqliteService } from '../../infra/sqlite.service';
import { SeedService } from '../../infra/seed.service';
import { SimulationService } from '../simulation/simulation.service';
import { RealtimeService } from '../notify/realtime.service';
import { RideService } from '../ride/ride.service';
import { FleetService } from '../fleet/fleet.service';
import { BizError, ErrorCode } from '../../libs/common/result';

/**
 * 演示控制台（/ops）。
 *
 * 严格来说这不是"产品功能"，而是让 Demo 可被反复演示的开关：
 * 调仿真倍速、一键重开一趟行程、手动触发某个决策行为、看数据落库情况。
 * 因为它天然是工具属性，所以视觉上允许偏"控制台"，但依然不复用后台模板。
 */
@Injectable()
export class OpsService {
  constructor(
    private readonly db: SqliteService,
    private readonly seed: SeedService,
    private readonly sim: SimulationService,
    private readonly realtime: RealtimeService,
    private readonly ride: RideService,
    private readonly fleet: FleetService,
  ) {}

  overview() {
    const mem = process.memoryUsage();
    const ride = this.ride.getCurrentRide();
    return {
      process: {
        pid: process.pid,
        node: process.version,
        uptimeS: Math.round(process.uptime()),
        rssMb: +(mem.rss / 1024 / 1024).toFixed(1),
      },
      sim: this.sim.status,
      realtime: this.realtime.stats,
      terminalVehicle: this.fleet.terminalVehicleId,
      ride: ride
        ? {
            id: ride.id,
            rideNo: ride.ride_no,
            status: ride.status,
            origin: ride.origin_name,
            dest: ride.dest_name,
            progress: ride.plan_distance_m > 0 ? +(ride.traveled_m / ride.plan_distance_m).toFixed(3) : 0,
            planDistanceM: ride.plan_distance_m,
            traveledM: Math.round(ride.traveled_m),
          }
        : null,
      tables: this.db.listTables(),
      runtime: this.sim.getRuntime(this.fleet.terminalVehicleId),
    };
  }

  /** 一键重来：清库 → 重新种子 → 生成一段新行程 → 重置仿真时钟 */
  restart() {
    this.seed.truncateAll();
    this.seed.run();
    const rideId = this.seed.createDemoRide();
    this.sim.resetRuntime();
    return { ok: true, rideId, overview: this.overview() };
  }

  setSim(body: { multiplier?: number; paused?: boolean }) {
    if (typeof body?.multiplier === 'number') this.sim.setMultiplier(body.multiplier);
    if (typeof body?.paused === 'boolean') this.sim.setPaused(body.paused);
    return this.sim.status;
  }

  jumpArriving() {
    return this.sim.jumpToArriving();
  }

  injectBehavior(type?: string) {
    return this.sim.injectBehavior(type);
  }

  /** 只读浏览某张表，表名必须在白名单内（防注入） */
  table(name: string, limit = 50) {
    const tables = this.db.listTables().map((t) => t.name);
    if (!tables.includes(name)) throw new BizError(ErrorCode.BAD_REQUEST, `表 ${name} 不在白名单内`);
    const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
    return {
      name,
      rows: this.db.all(`SELECT * FROM "${name}" ORDER BY rowid DESC LIMIT ${safeLimit}`),
    };
  }

  vehicleRuntime(id?: string) {
    return this.sim.getRuntime(id ?? this.fleet.terminalVehicleId);
  }
}
