import { Module } from '@nestjs/common';
import { FleetService } from './fleet.service';
import { VehicleController } from './vehicle.controller';

@Module({
  controllers: [VehicleController],
  providers: [FleetService],
  exports: [FleetService],
})
export class FleetModule {}
