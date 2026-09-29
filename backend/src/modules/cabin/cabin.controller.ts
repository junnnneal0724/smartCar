import { Body, Controller, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { CabinService } from './cabin.service';
import { SessionGuard } from '../ride/session.guard';
import { FleetService } from '../fleet/fleet.service';

@Controller('api/cabin')
export class CabinController {
  constructor(
    private readonly cabin: CabinService,
    private readonly fleet: FleetService,
  ) {}

  /** 只读：屏幕上要显示当前座舱状态 */
  @Get()
  get() {
    return this.cabin.view();
  }

  /** 写操作需要行程会话，避免"未校验的乘客"乱调座舱 */
  @Patch()
  @UseGuards(SessionGuard)
  update(@Req() req: any, @Body() body: Record<string, unknown>) {
    return this.cabin.update(this.fleet.terminalVehicleId, body, 'screen');
  }

  @Post('scene')
  @UseGuards(SessionGuard)
  scene(@Body() body: { key: string }) {
    return this.cabin.applyScene(this.fleet.terminalVehicleId, body?.key);
  }

  @Get('commands')
  commands() {
    return this.cabin.recentCommands();
  }
}
