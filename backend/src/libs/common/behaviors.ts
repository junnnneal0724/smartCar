/**
 * 车辆行为库 —— 「旅程解释器」的数据源。
 *
 * 这是车内终端最重要的功能：乘客坐在一台没有司机的车里，
 * 屏幕必须持续回答「车在干什么、为什么」，否则会焦虑。
 */

export interface BehaviorDef {
  type: string;
  /** 左侧行程卡上的短动作文案，≤ 8 字 */
  short: string;
  /** 决策气泡标题 */
  title: string;
  /** 展开后的解释，要讲人话 */
  detail: string;
  icon: string;
  /** 是否会让车辆减速/等待（影响进度与费用提示） */
  slowsDown: boolean;
  /** 触发权重 */
  weight: number;
  minDurationS: number;
  maxDurationS: number;
}

export const BEHAVIORS: BehaviorDef[] = [
  {
    type: 'YIELD_PEDESTRIAN',
    short: '礼让行人',
    title: '正在礼让行人',
    detail: '前方人行横道有行人正在通过，车辆已减速停车让行。行人通过后会自动继续行驶。',
    icon: 'pedestrian',
    slowsDown: true,
    weight: 14,
    minDurationS: 6,
    maxDurationS: 14,
  },
  {
    type: 'TRAFFIC_LIGHT',
    short: '等待信号灯',
    title: '正在等待信号灯',
    detail: '当前路口为红灯，车辆已停稳等待。信号灯转绿后会自动起步。',
    icon: 'traffic-light',
    slowsDown: true,
    weight: 20,
    minDurationS: 8,
    maxDurationS: 22,
  },
  {
    type: 'CONGESTION',
    short: '前方车流缓行',
    title: '前方车流缓行',
    detail: '检测到前方车辆排队，车辆已自动降低车速并保持安全车距。预计通过后恢复正常速度。',
    icon: 'traffic-jam',
    slowsDown: true,
    weight: 12,
    minDurationS: 12,
    maxDurationS: 30,
  },
  {
    type: 'SLOW_DOWN',
    short: '减速通过',
    title: '减速通过复杂路段',
    detail: '前方为学校/小区出入口路段，车辆按限速要求主动降低车速。',
    icon: 'speed',
    slowsDown: true,
    weight: 10,
    minDurationS: 8,
    maxDurationS: 18,
  },
  {
    type: 'LANE_CHANGE',
    short: '变道中',
    title: '正在变更车道',
    detail: '为了按规划路线行驶，车辆正在向相邻车道变道，已确认目标车道安全。',
    icon: 'lane',
    slowsDown: false,
    weight: 10,
    minDurationS: 4,
    maxDurationS: 8,
  },
  {
    type: 'CROSSWALK',
    short: '通过路口',
    title: '正在通过路口',
    detail: '车辆已确认路口信号与两侧来车，正常通过中。',
    icon: 'crosswalk',
    slowsDown: false,
    weight: 16,
    minDurationS: 4,
    maxDurationS: 8,
  },
  {
    type: 'TURN',
    short: '转弯中',
    title: '正在转弯',
    detail: '车辆已提前打转向灯，并确认转弯半径内无障碍物。',
    icon: 'turn',
    slowsDown: true,
    weight: 14,
    minDurationS: 4,
    maxDurationS: 9,
  },
  {
    type: 'AVOID_OBSTACLE',
    short: '绕行障碍物',
    title: '绕行前方障碍物',
    detail: '前方有临停车辆/施工围挡，车辆已规划轻微借道绕行，绕过后会回到原车道。',
    icon: 'obstacle',
    slowsDown: true,
    weight: 8,
    minDurationS: 5,
    maxDurationS: 12,
  },
  {
    type: 'CRUISE',
    short: '平稳巡航',
    title: '平稳巡航中',
    detail: '当前路段路况良好，车辆以限速范围内速度平稳行驶。',
    icon: 'cruise',
    slowsDown: false,
    weight: 22,
    minDurationS: 10,
    maxDurationS: 26,
  },
];

const byType = new Map(BEHAVIORS.map((b) => [b.type, b]));
export function behavior(type: string): BehaviorDef | undefined {
  return byType.get(type);
}

const totalWeight = BEHAVIORS.reduce((s, b) => s + b.weight, 0);

/** 按权重随机挑一个行为，避免与当前行为重复 */
export function pickBehavior(exclude?: string): BehaviorDef {
  const pool = BEHAVIORS.filter((b) => b.type !== exclude);
  const sum = pool.reduce((s, b) => s + b.weight, 0);
  let r = Math.random() * sum;
  for (const b of pool) {
    r -= b.weight;
    if (r <= 0) return b;
  }
  return pool[pool.length - 1];
}

export { totalWeight };
