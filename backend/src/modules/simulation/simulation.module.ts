import { Module } from '@nestjs/common';
import { SimulationService } from './simulation.service';
import { FleetModule } from '../fleet/fleet.module';
import { RideModule } from '../ride/ride.module';

@Module({
  imports: [FleetModule, RideModule],
  // MapService 由全局的 CoreModule 提供，这里不再重复 provide，避免加载两份地图
  providers: [SimulationService],
  exports: [SimulationService],
})
export class SimulationModule {}
