import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { RideService } from './ride.service';
import { MapService } from '../../libs/map/map.service';
import { SessionGuard } from './session.guard';
import { BizError, ErrorCode } from '../../libs/common/result';

@Controller('api/ride')
export class RideController {
  constructor(
    private readonly ride: RideService,
    private readonly map: MapService,
  ) {}

  /** 屏幕主数据：行程 + 车辆 + 进度 + 当前车辆行为 */
  @Get('current')
  current() {
    return this.ride.currentView();
  }

  @Get('events')
  events(@Query('limit') limit?: string) {
    const r = this.ride.getCurrentRide();
    if (!r) return [];
    return this.ride.rideEvents(r.id, limit ? Number(limit) : 30);
  }

  @Get('route')
  route() {
    const r = this.ride.getCurrentRide();
    if (!r) return [];
    return this.ride.routePoints(r.id);
  }

  /** 乘客点「开始行程」 */
  @Post('start')
  @UseGuards(SessionGuard)
  start(@Req() req: any) {
    const r = this.ride.startRide(req.rideId);
    return this.ride.currentView();
  }

  /** 修改目的地 / 加经停（常用地点快捷选择） */
  @Post('destination')
  @UseGuards(SessionGuard)
  destination(@Req() req: any, @Body() body: { name: string; lng: number; lat: number; category?: string; poiId?: string }) {
    if (!body?.name) throw new BizError(ErrorCode.BAD_REQUEST, '请选择目的地');
    let { name, lng, lat, category } = body;
    if (body.poiId) {
      const poi = this.map.poi(body.poiId);
      if (!poi) throw new BizError(ErrorCode.NOT_FOUND, '地点不存在');
      name = poi.name;
      lng = poi.lng;
      lat = poi.lat;
      category = poi.category;
    }
    if (typeof lng !== 'number' || typeof lat !== 'number') {
      throw new BizError(ErrorCode.BAD_REQUEST, '目的地坐标不合法');
    }
    this.ride.changeDestination(req.rideId, { name, lng, lat, category });
    return this.ride.currentView();
  }

  /** 分级停靠：NORMAL（前方下车）/ EMERGENCY（紧急停车） */
  @Post('stop')
  @UseGuards(SessionGuard)
  stop(@Req() req: any, @Body() body: { kind: 'NORMAL' | 'EMERGENCY'; poiId?: string; name?: string; lng?: number; lat?: number; note?: string }) {
    if (body?.kind !== 'NORMAL' && body?.kind !== 'EMERGENCY') {
      throw new BizError(ErrorCode.BAD_REQUEST, '停靠类型不合法');
    }
    let target: { name: string; lng: number; lat: number } | undefined;
    if (body.poiId) {
      const poi = this.map.poi(body.poiId);
      if (poi) target = { name: poi.name, lng: poi.lng, lat: poi.lat };
    } else if (body.name && typeof body.lng === 'number' && typeof body.lat === 'number') {
      target = { name: body.name, lng: body.lng, lat: body.lat };
    }
    return this.ride.requestStop(req.rideId, body.kind, target, body.note ?? '');
  }

  @Post('stop/:stopId/cancel')
  @UseGuards(SessionGuard)
  cancelStop(@Req() req: any, @Param('stopId') stopId: string) {
    return this.ride.cancelStop(req.rideId, Number(stopId));
  }

  @Get('stops')
  stops() {
    const r = this.ride.getCurrentRide();
    if (!r) return [];
    return this.ride.listStopRequests(r.id);
  }

  /** 下车开门（车未停稳会被拒绝，并把原因返回给屏幕） */
  @Post('open-door')
  @UseGuards(SessionGuard)
  openDoor(@Req() req: any) {
    return this.ride.openDoor(req.rideId);
  }

  /** 结束行程会话：写账单 + 会话失效 + 数据清理 */
  @Post('complete')
  @UseGuards(SessionGuard)
  complete(@Req() req: any) {
    const r = this.ride.complete(req.rideId);
    return this.ride.currentView();
  }

  /** 行程小结（ECharts 数据源） */
  @Get('summary')
  summary() {
    const target = this.ride.getCurrentRide() ?? this.ride.lastCompleted();
    if (!target) throw new BizError(ErrorCode.NOT_FOUND, '没有可展示的行程');
    return this.ride.summary(target.id);
  }

  /** 旅程解释：时间都花在哪了 */
  @Get('explain')
  explain() {
    const target = this.ride.getCurrentRide() ?? this.ride.lastCompleted();
    if (!target) throw new BizError(ErrorCode.NOT_FOUND, '没有可展示的行程');
    return this.ride.explain(target.id);
  }

  /** 评价：只做星级 + 标签（车机无键盘） */
  @Post('rate')
  @UseGuards(SessionGuard)
  rate(@Req() req: any, @Body() body: { score: number; tags?: string[] }) {
    if (!body?.score) throw new BizError(ErrorCode.BAD_REQUEST, '请选择评分');
    return this.ride.rate(req.rideId, Number(body.score), body.tags ?? []);
  }
}
