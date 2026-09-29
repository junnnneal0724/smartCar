import { Module } from '@nestjs/common';
import { HelpService } from './help.service';
import { HelpController } from './help.controller';
import { FleetModule } from '../fleet/fleet.module';
import { RideModule } from '../ride/ride.module';

@Module({
  imports: [FleetModule, RideModule],
  controllers: [HelpController],
  providers: [HelpService],
  exports: [HelpService],
})
export class HelpModule {}
