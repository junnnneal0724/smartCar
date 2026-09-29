import { Module } from '@nestjs/common';
import { CabinService } from './cabin.service';
import { CabinController } from './cabin.controller';
import { FleetModule } from '../fleet/fleet.module';
import { RideModule } from '../ride/ride.module';

@Module({
  imports: [FleetModule, RideModule],
  controllers: [CabinController],
  providers: [CabinService],
  exports: [CabinService],
})
export class CabinModule {}
