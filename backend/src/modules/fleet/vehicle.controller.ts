import { Controller, Get } from '@nestjs/common';
import { FleetService } from './fleet.service';

@Controller('api/vehicle')
export class VehicleController {
  constructor(private readonly fleet: FleetService) {}

  /**
   * 车机状态栏与「车辆状态透明化」用：电量、车速、所在道路、里程、隐私设备状态。
   * 无鉴权依赖（车机与车辆是绑定的物理关系），但需要会话 token 才能拿到完整行程。
   */
  @Get('current')
  current() {
    const v = this.fleet.getTerminalVehicle();
    const model = this.fleet.models().find((m) => m.code === v.model_code);
    return {
      id: v.id,
      plateNo: v.plate_no,
      cabinNo: v.cabin_no,
      modelCode: v.model_code,
      modelName: model?.name ?? v.model_code,
      battery: v.battery,
      status: v.status,
      speedKph: Math.round(v.speed_kph),
      roadName: v.road_name,
      odometerKm: +(v.odometer_m / 1000).toFixed(1),
      cameraOn: !!v.camera_on,
      micOn: !!v.mic_on,
      lng: v.lng,
      lat: v.lat,
      heading: v.heading,
    };
  }

  @Get('models')
  models() {
    return this.fleet.models();
  }
}
