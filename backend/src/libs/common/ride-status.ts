/**
 * 行程状态机（车内终端场景）。
 * 与手机端不同：没有「匹配中/派单」概念，乘客已经上车。
 * 前端保留同名副本，保证两端语义一致。
 */
export const RideStatus = {
  /** 行程已创建，乘客尚未上车（车辆在来接的路上） */
  PENDING: 'PENDING',
  /** 乘客已上车，等待身份校验 */
  ABOARD: 'ABOARD',
  /** 校验通过，等待乘客确认出发 */
  READY: 'READY',
  /** 行程中 */
  ONGOING: 'ONGOING',
  /** 即将到达（剩余距离小于阈值） */
  ARRIVING: 'ARRIVING',
  /** 车辆已停稳在目的地 */
  ARRIVED: 'ARRIVED',
  /** 行程已结束（会话将失效） */
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

export type RideStatusValue = (typeof RideStatus)[keyof typeof RideStatus];

const TRANSITIONS: Record<RideStatusValue, RideStatusValue[]> = {
  PENDING: ['ABOARD', 'CANCELLED'],
  ABOARD: ['READY', 'CANCELLED'],
  READY: ['ONGOING', 'CANCELLED'],
  ONGOING: ['ARRIVING', 'CANCELLED'],
  // ARRIVING 可以退回 ONGOING：乘客撤销了停靠请求，或者改了目的地之后
  // 行程其实还没到终点，"即将到达"就不再成立了，得回到"行程中"。
  ARRIVING: ['ONGOING', 'ARRIVED', 'CANCELLED'],
  ARRIVED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransition(from: RideStatusValue, to: RideStatusValue): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export const STATUS_LABEL: Record<string, string> = {
  PENDING: '车辆前往上车点',
  ABOARD: '等待开始行程',
  READY: '准备出发',
  ONGOING: '行程中',
  ARRIVING: '即将到达',
  ARRIVED: '已到达目的地',
  COMPLETED: '行程已结束',
  CANCELLED: '行程已取消',
};

/** 屏幕主视图应当渲染的阶段（用于左侧常驻行程卡的进度轴） */
export const PHASE_OF: Record<string, number> = {
  PENDING: 0,
  ABOARD: 1,
  READY: 1,
  ONGOING: 2,
  ARRIVING: 3,
  ARRIVED: 4,
  COMPLETED: 5,
  CANCELLED: 5,
};

export const PHASES = ['前往上车点', '准备出发', '行程中', '即将到达', '到达', '结束'];

/** 剩余距离小于该值时进入「即将到达」 */
export const ARRIVING_THRESHOLD_M = 600;
