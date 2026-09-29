import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { OpsService } from './ops.service';

@Controller('api/ops')
export class OpsController {
  constructor(private readonly ops: OpsService) {}

  @Get('overview')
  overview() {
    return this.ops.overview();
  }

  @Post('sim')
  sim(@Body() body: { multiplier?: number; paused?: boolean }) {
    return this.ops.setSim(body ?? {});
  }

  @Post('ride/restart')
  restart() {
    return this.ops.restart();
  }

  @Post('ride/jump-arriving')
  jumpArriving() {
    return this.ops.jumpArriving();
  }

  @Post('ride/behavior')
  behavior(@Body() body: { type?: string }) {
    return this.ops.injectBehavior(body?.type);
  }

  @Get('table/:name')
  table(@Param('name') name: string, @Query('limit') limit?: string) {
    return this.ops.table(name, limit ? Number(limit) : 50);
  }

  @Get('vehicle/runtime')
  runtime(@Query('id') id?: string) {
    return this.ops.vehicleRuntime(id);
  }
}
