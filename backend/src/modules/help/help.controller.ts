import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { HelpService } from './help.service';
import { SessionGuard } from '../ride/session.guard';
import { BizError, ErrorCode } from '../../libs/common/result';

@Controller('api/help')
export class HelpController {
  constructor(private readonly help: HelpService) {}

  /** 车内高频问题：内容都是「此刻这趟行程」相关的 */
  @Get('topics')
  topics() {
    return this.help.topicsList();
  }

  /** 隐私与设备状态：车内用户最关心的透明化信息 */
  @Get('privacy')
  privacy() {
    return this.help.privacy();
  }

  /** 呼叫远程安全员 */
  @Post('assist')
  @UseGuards(SessionGuard)
  callAssist(@Body() body: { topic?: string }) {
    return this.help.callAssist(body?.topic ?? '');
  }

  @Get('assist')
  current() {
    return this.help.currentAssist;
  }

  /** 车机没有键盘，消息主要由预置问题按钮触发 */
  @Post('assist/:id/message')
  @UseGuards(SessionGuard)
  send(@Param('id') id: string, @Body() body: { content: string }) {
    if (!body?.content) throw new BizError(ErrorCode.BAD_REQUEST, '消息不能为空');
    return this.help.send(Number(id), body.content);
  }

  @Post('assist/:id/end')
  @UseGuards(SessionGuard)
  end(@Param('id') id: string) {
    return this.help.endAssist(Number(id));
  }

  /**
   * 把行程同步到手机带走。
   *
   * 同样不加会话守卫：取件码是给下车之后用的，而行程结束会话就失效了，
   * 加守卫会让这屏永远拿不到码。syncToPhone 内部已经兜底到"最近一趟已结束的行程"。
   */
  @Post('sync')
  sync() {
    return this.help.syncToPhone();
  }
}
