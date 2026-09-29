import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { SessionService } from './session.service';
import { SessionGuard } from './session.guard';
import { BizError, ErrorCode } from '../../libs/common/result';

@Controller('api/session')
export class SessionController {
  constructor(private readonly sessions: SessionService) {}

  /**
   * 车机启动接口：返回「现在该显示哪一屏」。
   * 无登录，因为车机是公共设备；身份校验在 /verify。
   */
  @Get('bootstrap')
  bootstrap() {
    return this.sessions.bootstrap();
  }

  /** 上车校验：手机号后 4 位 */
  @Post('verify')
  verify(@Body() body: { code: string; rideId?: number }) {
    if (!body?.code) throw new BizError(ErrorCode.BAD_REQUEST, '请输入手机号后 4 位');
    const { token, ride } = this.sessions.verify(body.code, body.rideId);
    return { token, ride: this.sessions.bootstrap().ride, state: 'READY' };
  }

  @Get('current')
  @UseGuards(SessionGuard)
  current(@Req() req: any) {
    return { valid: true, rideId: req.rideId, verifiedAt: req.session?.verified_at ?? null };
  }

  /** 行程结束时的会话清理 */
  @Post('end')
  @UseGuards(SessionGuard)
  end(@Req() req: any) {
    return this.sessions.endSession(req.rideId);
  }
}
