/** 计价与车型配置（Demo 常量，真实项目应来自配置中心/计价服务） */

export interface VehicleModelDef {
  code: string;
  name: string;
  tagline: string;
  seats: number;
  accent: string;
  features: string[];
  /** 起步价（分） */
  basePrice: number;
  /** 每公里（分） */
  perKm: number;
  /** 每分钟（分） */
  perMin: number;
}

export const MODELS: VehicleModelDef[] = [
  {
    code: 'SOLO',
    name: '独享舱',
    tagline: '一人一舱，全程私密',
    seats: 2,
    accent: '#6E9BFF',
    features: ['独立音区', '可平躺座椅', '隐私隔断'],
    basePrice: 1200,
    perKm: 260,
    perMin: 50,
  },
  {
    code: 'COMFORT',
    name: '舒适舱',
    tagline: '宽敞座舱，适合结伴',
    seats: 4,
    accent: '#3DD6B5',
    features: ['四人座', '分区空调', '后备厢空间大'],
    basePrice: 1000,
    perKm: 220,
    perMin: 40,
  },
  {
    code: 'SHARE',
    name: '共享舱',
    tagline: '顺路同行，价格更省',
    seats: 4,
    accent: '#C9A6FF',
    features: ['拼车出行', '价格更低', '可中途拼入'],
    basePrice: 800,
    perKm: 170,
    perMin: 30,
  },
];

const modelByCode = new Map(MODELS.map((m) => [m.code, m]));
export function model(code: string): VehicleModelDef {
  return modelByCode.get(code) ?? MODELS[1];
}

export interface FareBreakdown {
  base: number;
  distance: number;
  time: number;
  discount: number;
  total: number;
}

/** 一口价：起步价 + 里程费 + 时长费，会员/活动抵扣 discount */
export function computeFare(code: string, distanceM: number, durationS: number, discount = 0): FareBreakdown {
  const m = model(code);
  const km = distanceM / 1000;
  const min = durationS / 60;
  const base = m.basePrice;
  const distance = Math.round(km * m.perKm);
  const time = Math.round(min * m.perMin);
  const raw = base + distance + time;
  const total = Math.max(0, raw - discount);
  return { base, distance, time, discount, total };
}

/** 电动车相对燃油车的减碳量（克），约 150 g/km */
export function co2SavedG(distanceM: number): number {
  return Math.round((distanceM / 1000) * 150);
}

/** 生成可读行程号，如 RX2609-0417 */
export function makeRideNo(seq: number): string {
  const d = new Date();
  const y = String(d.getFullYear()).slice(2);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `RX${y}${m}${day}-${String(seq).padStart(4, '0')}`;
}

/** 依据平均车速估算时长（秒） */
export function estimateDurationS(distanceM: number, avgSpeedKph = 28): number {
  return Math.max(60, Math.round((distanceM / 1000 / avgSpeedKph) * 3600));
}
