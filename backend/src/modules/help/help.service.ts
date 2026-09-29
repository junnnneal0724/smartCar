import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { SqliteService } from '../../infra/sqlite.service';
import { BizError, ErrorCode } from '../../libs/common/result';
import { RideService } from '../ride/ride.service';
import { FleetService } from '../fleet/fleet.service';

interface Rule {
  keys: string[];
  reply: string;
}

/**
 * 帮助与安全域：远程协助、客服问答、隐私说明、行程同步到手机。
 *
 * 车内场景的特殊性：没有司机可以问，所以屏幕是唯一的求助通道。
 * 这里用规则引擎模拟"远程安全员"，真实产品是真人客服 + 语音。
 */
@Injectable()
export class HelpService {
  private readonly logger = new Logger('Help');

  private readonly agents = [
    { name: '李工', avatar: '🧑‍✈️', title: '远程安全员' },
    { name: '陈工', avatar: '👩‍✈️', title: '远程安全员' },
    { name: '周工', avatar: '🧑‍🔧', title: '远程安全员' },
  ];

  /** 车内常见问题：必须是"此刻这趟行程"相关的，不是泛泛的 FAQ */
  private readonly topics = [
    {
      key: 'why-stop',
      icon: 'question',
      title: '它为什么突然停车了？',
      detail: '车辆遇到行人、非机动车或前车减速时会主动礼让。左侧行程卡会实时显示车辆当前动作，点开可以看到具体原因。',
    },
    {
      key: 'too-long',
      icon: 'clock',
      title: '为什么比预计时间久？',
      detail: '预计时间按实时路况滚动更新。信号灯等待与车流缓行会延长用时，你可以在「旅程解释」里看到本次行程的时间都花在哪了。',
    },
    {
      key: 'open-door',
      icon: 'door',
      title: '到站后怎么开门？',
      detail: '车辆完全停稳后，屏幕上的开门按钮会亮起。出于安全考虑，车辆还在移动时无法开门。',
    },
    {
      key: 'camera',
      icon: 'camera',
      title: '车里有摄像头吗？',
      detail: '车内有监控摄像头，用于行车安全与事后追溯，状态栏会持续显示「录像中」。麦克风默认关闭，仅在你主动呼叫客服时开启，行程结束后立即停止。',
    },
    {
      key: 'motion-sick',
      icon: 'motion',
      title: '有点晕车怎么办？',
      detail: '建议开启「舒缓」场景：加大新风、调低屏幕亮度。同时尽量看向前方远处，不要长时间盯着屏幕。',
    },
    {
      key: 'change-dest',
      icon: 'route',
      title: '可以中途改目的地吗？',
      detail: '可以。在行程中打开「行程」页的目的地，从常用地点里选一个新的即可，费用会按新路线重新计算。',
    },
    {
      key: 'emergency',
      icon: 'sos',
      title: '遇到紧急情况怎么办？',
      detail: '在「停靠」页选择紧急停车，车辆会立即寻找最近的安全位置靠边停下，同时远程安全员会介入。也可以直接联系在线客服。',
    },
    {
      key: 'lost-item',
      icon: 'bag',
      title: '东西落在车上了？',
      detail: '行程结束后可在手机端「我的行程」里发起失物协查，我们会根据车辆与时间定位到具体座位区域。',
    },
  ];

  private readonly rules: Rule[] = [
    { keys: ['多久', '还有', '多长时间', '什么时候到', '到哪了'], reply: '正在为你查询…左侧行程卡上的剩余时间是按实时路况滚动的，一般比较准。如果需要，我也可以帮你把预计到达时间同步到手机。' },
    { keys: ['为什么', '怎么停', '停车', '不动'], reply: '车辆遇到行人、非机动车或前车减速时会主动停车礼让，属于正常的防御性驾驶。屏幕上的决策气泡会显示当前的具体原因。' },
    { keys: ['空调', '冷', '热', '温度'], reply: '你可以在「环境」页直接调节左右分区温度和风量，也可以一键套用「小憩」「办公」「舒缓」场景。需要我帮你调吗？' },
    { keys: ['晕车', '不舒服', '难受'], reply: '建议开启「舒缓」场景，同时尽量看向前方远处。如果仍然不适，我可以帮你请求在安全位置靠边停车。' },
    { keys: ['下车', '开门', '到站'], reply: '车辆完全停稳后，开门按钮会自动亮起。出于安全考虑，行驶中无法开门。你也可以在「停靠」页请求就近下车。' },
    { keys: ['改', '目的地', '换地方', '去别'], reply: '可以。在「行程」页点目的地就能从常用地点里换一个新的，费用会按新路线重新计算，我会同步告知你差价。' },
    { keys: ['紧急', '危险', '报警', '救命'], reply: '已收到。请优先在「停靠」页使用紧急停车，车辆会立即靠边停下。我现在同时把你这通呼叫升级为紧急事件，远程安全员会直接介入。' },
    { keys: ['发票', '支付', '付款', '扣款', '钱'], reply: '支付和开票都在手机端完成，车内屏幕只展示账单明细。行程结束后你会在手机上收到本次账单。' },
    { keys: ['摄像头', '录像', '隐私', '录音'], reply: '车内摄像头用于行车安全，状态栏会一直显示工作状态。麦克风默认关闭，只有你主动呼叫客服时才会开启。' },
    { keys: ['路线', '绕路', '怎么走'], reply: '当前路线是按"最快到达"规划的。如果因为施工或拥堵需要绕行，我会在决策气泡里说明原因。' },
  ];

  constructor(
    private readonly db: SqliteService,
    private readonly ride: RideService,
    private readonly fleet: FleetService,
  ) {}

  topicsList() {
    return { topics: this.topics };
  }

  privacy() {
    const v = this.fleet.getTerminalVehicle();
    return {
      camera: { on: !!v.camera_on, purpose: '行车安全与事后追溯', retention: '加密存储 30 天' },
      microphone: { on: !!v.mic_on, purpose: '仅在你主动呼叫客服时开启', retention: '行程结束后立即停止' },
      location: { purpose: '用于行程导航与到站提醒', retention: '行程结束后不再持续采集' },
      session: { cleared: true, note: '你下车后，本次行程的个人标识会从这块屏幕上清除' },
    };
  }

  /** 呼叫远程协助 */
  callAssist(topic = '') {
    const ride = this.ride.getCurrentRide();
    if (!ride) throw new BizError(ErrorCode.NOT_FOUND, '当前没有进行中的行程');

    const existing = this.db.get<{ id: number }>(
      `SELECT id FROM t_assist_session WHERE ride_id = ? AND status = 'ACTIVE' ORDER BY id DESC LIMIT 1`,
      ride.id,
    );
    if (existing) return this.assistView(existing.id);

    const agent = this.agents[Math.floor(Math.random() * this.agents.length)];
    const r = this.db.run(
      `INSERT INTO t_assist_session (ride_id, agent_name, agent_avatar, topic, status, created_at)
       VALUES (?,?,?,?, 'ACTIVE', ?)`,
      ride.id,
      agent.name,
      agent.avatar,
      topic,
      Date.now(),
    );
    const id = r.lastInsertRowid;
    this.push(id, 'AGENT', `你好，我是远程安全员${agent.name}。我现在能看到你这辆车的位置和车内状态，有什么可以帮你的？`);
    this.ride.recordEvent(ride.id, 'SAFETY', 'ASSIST_STARTED', '已接通远程安全员', `远程安全员${agent.name}已接入`);
    this.logger.log(`行程 ${ride.ride_no} 接通远程协助（${agent.name}）`);
    return this.assistView(id);
  }

  get currentAssist() {
    const ride = this.ride.getCurrentRide();
    if (!ride) return null;
    const s = this.db.get<{ id: number }>(
      `SELECT id FROM t_assist_session WHERE ride_id = ? AND status = 'ACTIVE' ORDER BY id DESC LIMIT 1`,
      ride.id,
    );
    return s ? this.assistView(s.id) : null;
  }

  /** 发消息给远程安全员（车机无键盘，这里主要是预置问题按钮触发的消息） */
  send(sessionId: number, content: string) {
    const s = this.db.get<{ id: number; ride_id: number; status: string }>(
      'SELECT id, ride_id, status FROM t_assist_session WHERE id = ?',
      sessionId,
    );
    if (!s || s.status !== 'ACTIVE') throw new BizError(ErrorCode.NOT_FOUND, '会话已结束');
    this.push(sessionId, 'USER', content);

    const reply = this.reply(content);
    // 稍作延迟，让"对方正在回复"的过程可感知
    setTimeout(() => {
      try {
        this.push(sessionId, 'AGENT', reply);
      } catch {
        /* 会话可能已结束 */
      }
    }, 900 + Math.random() * 700);

    return { ok: true, pending: true, reply };
  }

  private reply(input: string): string {
    const text = String(input ?? '');
    for (const rule of this.rules) {
      if (rule.keys.some((k) => text.includes(k))) return rule.reply;
    }
    return '收到，我已经记录下来了。如果情况紧急，建议直接使用「停靠」页的紧急停车，车辆会立刻寻找安全位置停下。';
  }

  endAssist(sessionId: number) {
    this.db.run(`UPDATE t_assist_session SET status = 'ENDED', ended_at = ? WHERE id = ?`, Date.now(), sessionId);
    this.push(sessionId, 'SYSTEM', '本次协助已结束。如需帮助可以随时再次呼叫。');
    return { ok: true };
  }

  private push(sessionId: number, role: string, content: string) {
    this.db.run(
      `INSERT INTO t_assist_message (session_id, role, content, created_at) VALUES (?,?,?,?)`,
      sessionId,
      role,
      content,
      Date.now(),
    );
  }

  private assistView(sessionId: number) {
    const s = this.db.get<Record<string, unknown>>('SELECT * FROM t_assist_session WHERE id = ?', sessionId)!;
    const messages = this.db.all(
      'SELECT id, role, content, created_at FROM t_assist_message WHERE session_id = ? ORDER BY id',
      sessionId,
    );
    return {
      session: {
        id: s.id,
        agentName: s.agent_name,
        agentAvatar: s.agent_avatar,
        topic: s.topic,
        status: s.status,
        createdAt: s.created_at,
      },
      messages,
      quickReplies: ['我有点晕车', '它为什么停车了', '还要多久到', '我想改目的地', '帮我联系紧急停车'],
    };
  }

  /** 把本次行程同步到手机（车内不分享，只做扫码带走） */
  syncToPhone() {
    const ride = this.ride.getCurrentRide() ?? this.ride.lastCompleted();
    if (!ride) throw new BizError(ErrorCode.NOT_FOUND, '没有可同步的行程');
    const exist = this.db.get<{ token: string }>('SELECT token FROM t_share_link WHERE ride_id = ? ORDER BY created_at DESC LIMIT 1', ride.id);
    const token = exist?.token ?? randomBytes(8).toString('hex');
    if (!exist) {
      this.db.run(
        `INSERT INTO t_share_link (token, ride_id, expire_at, view_count, created_at) VALUES (?,?,?,0,?)`,
        token,
        ride.id,
        Date.now() + 7 * 24 * 3600 * 1000,
        Date.now(),
      );
    }
    return { token, url: `/m/ride/${token}`, rideNo: ride.ride_no, expireAt: Date.now() + 7 * 24 * 3600 * 1000 };
  }
}
