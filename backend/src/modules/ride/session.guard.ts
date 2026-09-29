import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { BizError, ErrorCode } from '../../libs/common/result';
import { bearer } from '../../libs/common/jwt';
import { SessionService, type SessionRow } from './session.service';

/**
 * 行程会话守卫：保护"会改变车辆状态"的操作。
 * 只读接口（车辆状态、行程概览、地图）不需要校验。
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const token = bearer(req.headers?.authorization) ?? req.query?.token;
    if (!token) throw new BizError(ErrorCode.UNAUTHORIZED, '请先完成上车校验');
    const session: SessionRow | undefined = this.sessions.getSession(String(token));
    if (!session) throw new BizError(ErrorCode.UNAUTHORIZED, '行程会话已失效，请重新校验');
    req.session = session;
    req.rideId = session.ride_id;
    return true;
  }
}
