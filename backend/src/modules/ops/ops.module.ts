import { Module } from '@nestjs/common';
import { OpsService } from './ops.service';
import { OpsController } from './ops.controller';
import { SimulationModule } from '../simulation/simulation.module';
import { NotifyModule } from '../notify/notify.module';
import { RideModule } from '../ride/ride.module';
import { FleetModule } from '../fleet/fleet.module';

@Module({
  imports: [SimulationModule, NotifyModule, RideModule, FleetModule],
  controllers: [OpsController],
  providers: [OpsService],
})
export class OpsModule {}
