import { Injectable, Logger } from '@nestjs/common';
import { SqliteService } from '../../infra/sqlite.service';
import { MODELS, type VehicleModelDef } from '../../libs/common/pricing';

export interface VehicleRow {
  id: string;
  plate_no: string;
  cabin_no: string;
  model_code: string;
  battery: number;
  status: string;
  lng: number;
  lat: number;
  heading: number;
  speed_kph: number;
  road_name: string;
  edge_id: string | null;
  edge_progress: number;
  edge_dir: 1 | -1;
  current_ride_id: number | null;
  odometer_m: number;
  camera_on: number;
  mic_on: number;
  updated_at: number;
}

/** 车队域：车辆档案与状态。只操作 t_vehicle / t_vehicle_model。 */
@Injectable()
export class FleetService {
  private readonly logger = new Logger('Fleet');

  constructor(private readonly db: SqliteService) {}

  /** 本终端绑定的车辆（车机与车辆是一一绑定的物理关系） */
  get terminalVehicleId(): string {
    return process.env.TERMINAL_VEHICLE_ID ?? 'V-01';
  }

  getVehicle(id: string): VehicleRow | undefined {
    return this.db.get<VehicleRow>('SELECT * FROM t_vehicle WHERE id = ?', id);
  }

  getTerminalVehicle(): VehicleRow {
    const v = this.getVehicle(this.terminalVehicleId);
    if (!v) throw new Error(`终端车辆 ${this.terminalVehicleId} 不存在，请先执行种子脚本`);
    return v;
  }

  listVehicles(): VehicleRow[] {
    return this.db.all<VehicleRow>('SELECT * FROM t_vehicle ORDER BY id');
  }

  updatePosition(
    id: string,
    p: {
      lng: number;
      lat: number;
      heading: number;
      speedKph: number;
      roadName: string;
      edgeId?: string | null;
      edgeProgress?: number;
      edgeDir?: 1 | -1;
    },
  ): void {
    this.db.run(
      `UPDATE t_vehicle SET lng = ?, lat = ?, heading = ?, speed_kph = ?, road_name = ?,
        edge_id = COALESCE(?, edge_id), edge_progress = COALESCE(?, edge_progress),
        edge_dir = COALESCE(?, edge_dir), updated_at = ?
       WHERE id = ?`,
      p.lng,
      p.lat,
      p.heading,
      p.speedKph,
      p.roadName,
      p.edgeId ?? null,
      p.edgeProgress ?? null,
      p.edgeDir ?? null,
      Date.now(),
      id,
    );
  }

  setStatus(id: string, status: string): void {
    this.db.run('UPDATE t_vehicle SET status = ?, updated_at = ? WHERE id = ?', status, Date.now(), id);
  }

  setCurrentRide(id: string, rideId: number | null): void {
    this.db.run('UPDATE t_vehicle SET current_ride_id = ?, updated_at = ? WHERE id = ?', rideId, Date.now(), id);
  }

  /** 里程与电量随行驶推进（电量消耗做得很慢，仅为演示"电量"指标存在） */
  consume(id: string, meters: number): void {
    const v = this.getVehicle(id);
    if (!v) return;
    const odometer = v.odometer_m + Math.round(meters);
    const batteryDrop = meters / 1000 / 4; // 约 400km 满电
    const battery = Math.max(6, Math.round(v.battery - batteryDrop));
    this.db.run('UPDATE t_vehicle SET odometer_m = ?, battery = ?, updated_at = ? WHERE id = ?', odometer, battery, Date.now(), id);
  }

  setPrivacy(id: string, cameraOn: boolean, micOn: boolean): void {
    this.db.run(
      'UPDATE t_vehicle SET camera_on = ?, mic_on = ?, updated_at = ? WHERE id = ?',
      cameraOn ? 1 : 0,
      micOn ? 1 : 0,
      Date.now(),
      id,
    );
  }

  models(): VehicleModelDef[] {
    return MODELS;
  }

  seedModels(): void {
    for (const m of MODELS) {
      this.db.run(
        `INSERT INTO t_vehicle_model (code, name, tagline, seats, accent, features)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(code) DO UPDATE SET name = excluded.name, tagline = excluded.tagline,
           seats = excluded.seats, accent = excluded.accent, features = excluded.features`,
        m.code,
        m.name,
        m.tagline,
        m.seats,
        m.accent,
        JSON.stringify(m.features),
      );
    }
    this.logger.log(`车型已写入：${MODELS.length} 条`);
  }
}
