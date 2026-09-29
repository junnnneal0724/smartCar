import { Module } from '@nestjs/common';
import { RideService } from './ride.service';
import { SessionService } from './session.service';
import { SessionGuard } from './session.guard';
import { RideController } from './ride.controller';
import { SessionController } from './session.controller';
import { FleetModule } from '../fleet/fleet.module';

@Module({
  imports: [FleetModule],
  controllers: [RideController, SessionController],
  providers: [RideService, SessionService, SessionGuard],
  exports: [RideService, SessionService, SessionGuard],
})
export class RideModule {}
