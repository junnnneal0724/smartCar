// 生成城市路网 + POI 数据（确定性，可重复生成）
// 输出：robotaxi-demo/assets/map.json —— 前后端共用同一份
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 相对脚本位置解析，项目整体挪目录后不用改这里
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'assets', 'map.json');

// ---- 确定性随机（mulberry32），保证每次生成同一张图 ----
function rng(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20260926);

// ---- 城市基准 ----
const CENTER = { lng: 116.404, lat: 39.915 };
const COLS = 6;
const ROWS = 6;
const DLNG = 0.0092; // 约 780m
const DLAT = 0.0073; // 约 810m

const AVENUES = ['人民大道', '中山路', '建设大街', '解放路', '和平大道', '长江路'];
const STREETS = ['复兴街', '新华路', '文化街', '幸福路', '光明街', '振兴路'];

const R_EARTH = 6371008.8;
const toRad = (d) => (d * Math.PI) / 180;
function distM(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.sqrt(h));
}

// ---- 节点：网格 + 抖动，避免"方格纸"观感 ----
const nodes = [];
const idx = (c, r) => r * COLS + c;
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const jx = (rand() - 0.5) * DLNG * 0.26;
    const jy = (rand() - 0.5) * DLAT * 0.26;
    nodes.push({
      id: `N${String(idx(c, r) + 1).padStart(2, '0')}`,
      col: c,
      row: r,
      lng: +(CENTER.lng + (c - (COLS - 1) / 2) * DLNG + jx).toFixed(6),
      lat: +(CENTER.lat + (r - (ROWS - 1) / 2) * DLAT + jy).toFixed(6),
      name: `${STREETS[c]} · ${AVENUES[r]}`,
    });
  }
}

// ---- 边：横向（avenue）+ 纵向（street）；随机挖掉几条制造不规则感 ----
const edges = [];
const removed = new Set(['h-2-1', 'v-1-3', 'h-4-3', 'v-3-0']); // 固定挖空，形成断头路/小区块
const pick = (level) => {
  if (level === 1) return { speedKph: 50 + Math.floor(rand() * 11), lanes: 3 };
  return { speedKph: 30 + Math.floor(rand() * 11), lanes: 2 };
};

for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS - 1; c++) {
    if (removed.has(`h-${c}-${r}`)) continue;
    const a = nodes[idx(c, r)];
    const b = nodes[idx(c + 1, r)];
    const lv = r === 0 || r === ROWS - 1 || r === 2 ? 1 : 2;
    const p = pick(lv);
    edges.push({
      id: `E${edges.length + 1}`,
      a: a.id,
      b: b.id,
      road: AVENUES[r],
      level: lv,
      oneway: false,
      ...p,
      lengthM: Math.round(distM(a, b)),
    });
  }
}
for (let c = 0; c < COLS; c++) {
  for (let r = 0; r < ROWS - 1; r++) {
    if (removed.has(`v-${c}-${r}`)) continue;
    const a = nodes[idx(c, r)];
    const b = nodes[idx(c, r + 1)];
    const lv = c === 0 || c === COLS - 1 || c === 2 ? 1 : 2;
    const p = pick(lv);
    edges.push({
      id: `E${edges.length + 1}`,
      a: a.id,
      b: b.id,
      road: STREETS[c],
      level: lv,
      oneway: false,
      ...p,
      lengthM: Math.round(distM(a, b)),
    });
  }
}

// ---- 面元素：公园 / 水系，用于地图底色层次 ----
const node = (c, r) => nodes[idx(c, r)];
const rect = (c1, r1, c2, r2) => {
  const a = node(c1, r1);
  const b = node(c2, r2);
  const lngs = [a.lng, b.lng].sort((x, y) => x - y);
  const lats = [a.lat, b.lat].sort((x, y) => x - y);
  const pad = 0.22;
  const w = lngs[1] - lngs[0];
  const h = lats[1] - lats[0];
  return [
    [lngs[0] + w * pad, lats[0] + h * pad],
    [lngs[1] - w * pad, lats[0] + h * pad],
    [lngs[1] - w * pad, lats[1] - h * pad],
    [lngs[0] + w * pad, lats[1] - h * pad],
  ].map(([x, y]) => [+x.toFixed(6), +y.toFixed(6)]);
};

const areas = [
  { id: 'A1', kind: 'park', name: '中央公园', polygon: rect(1, 1, 2, 2) },
  { id: 'A2', kind: 'park', name: '滨河绿地', polygon: rect(4, 4, 5, 5) },
  { id: 'A3', kind: 'water', name: '清河', polygon: rect(3, 0, 4, 5) },
  { id: 'A4', kind: 'park', name: '青年湖公园', polygon: rect(0, 4, 1, 5) },
];

// ---- POI：挂在节点上，带拼音别名，供搜索 ----
const POI_DEFS = [
  ['首都国际机场 T3', 'airport', 5, 5, ['机场', 'jichang', 'T3']],
  ['新城高铁站', 'station', 0, 0, ['高铁站', '火车站', 'gaotiezhan']],
  ['中央公园', 'park', 1, 1, ['公园', 'gongyuan']],
  ['滨河绿地', 'park', 5, 4, ['绿地', 'binhe']],
  ['青年湖公园', 'park', 0, 4, ['青年湖', 'qingnianhu']],
  ['万象城购物中心', 'mall', 2, 2, ['万象城', '商场', 'wanxiangcheng']],
  ['新天地广场', 'mall', 3, 1, ['新天地', 'xintiandi']],
  ['国贸中心', 'office', 2, 3, ['国贸', '写字楼', 'guomao']],
  ['金融街 A 座', 'office', 3, 3, ['金融街', 'jinrongjie']],
  ['科技创新园', 'office', 5, 1, ['科技园', 'kejiyuan']],
  ['市第一人民医院', 'hospital', 1, 3, ['医院', 'yiyuan']],
  ['妇幼保健院', 'hospital', 4, 2, ['妇幼', 'fuyou']],
  ['新城大学', 'school', 0, 2, ['大学', 'daxue']],
  ['第三中学', 'school', 4, 4, ['中学', 'zhongxue']],
  ['实验幼儿园', 'school', 2, 1, ['幼儿园', 'youeryuan']],
  ['阳光里小区', 'residence', 1, 0, ['阳光里', 'yangguangli']],
  ['翡翠公馆', 'residence', 3, 4, ['翡翠', 'feicui']],
  ['清河家园', 'residence', 4, 3, ['清河', 'qinghe']],
  ['梧桐苑', 'residence', 0, 3, ['梧桐', 'wutong']],
  ['云栖公寓', 'residence', 5, 2, ['云栖', 'yunqi']],
  ['市民体育中心', 'sports', 2, 4, ['体育馆', 'tiyu']],
  ['大剧院', 'culture', 3, 2, ['剧院', 'juyuan']],
  ['市图书馆', 'culture', 1, 2, ['图书馆', 'tushuguan']],
  ['博物馆', 'culture', 2, 0, ['博物馆', 'bowuguan']],
  ['美食街', 'food', 3, 0, ['小吃', 'meishi']],
  ['老街茶馆', 'food', 0, 1, ['茶馆', 'chaguan']],
  ['江畔咖啡', 'food', 5, 3, ['咖啡', 'kafei']],
  ['新城会展中心', 'venue', 5, 0, ['会展', 'huizhan']],
  ['奥体公园', 'sports', 4, 0, ['奥体', 'aoti']],
  ['智慧出行体验店', 'shop', 1, 5, ['体验店', 'tiyandian']],
  ['跨境电商产业园', 'office', 0, 5, ['电商', 'dianshang']],
  ['滨江路夜市', 'food', 5, 5, ['夜市', 'yeshi']],
];

const pois = POI_DEFS.map(([name, category, c, r, aliases], i) => {
  const n = node(c, r);
  // POI 落在路口附近的小偏移处，避免与节点完全重叠
  const off = () => (rand() - 0.5) * 0.0016;
  return {
    id: `P${String(i + 1).padStart(3, '0')}`,
    name,
    category,
    aliases,
    nodeId: n.id,
    lng: +(n.lng + off()).toFixed(6),
    lat: +(n.lat + off()).toFixed(6),
  };
});

// ---- 校验：连通性（BFS），避免生成出孤岛 ----
const adj = new Map();
for (const n of nodes) adj.set(n.id, []);
for (const e of edges) {
  adj.get(e.a).push(e.b);
  adj.get(e.b).push(e.a);
}
const seen = new Set([nodes[0].id]);
const queue = [nodes[0].id];
while (queue.length) {
  const cur = queue.shift();
  for (const nx of adj.get(cur)) {
    if (!seen.has(nx)) {
      seen.add(nx);
      queue.push(nx);
    }
  }
}
const connected = seen.size === nodes.length;

const lngs = nodes.map((n) => n.lng);
const lats = nodes.map((n) => n.lat);
const map = {
  meta: {
    name: '示范新城',
    center: CENTER,
    bounds: {
      minLng: +Math.min(...lngs).toFixed(6),
      maxLng: +Math.max(...lngs).toFixed(6),
      minLat: +Math.min(...lats).toFixed(6),
      maxLat: +Math.max(...lats).toFixed(6),
    },
    note: '合成路网，仅供本地 Demo 使用',
  },
  nodes: nodes.map(({ id, lng, lat, name }) => ({ id, lng, lat, name })),
  edges,
  areas,
  pois,
};

await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(map, null, 2), 'utf8');

console.log(`节点 ${nodes.length} / 路段 ${edges.length} / POI ${pois.length} / 面 ${areas.length}`);
console.log(`连通性: ${connected ? '通过（无孤岛）' : '失败！存在孤立节点'}`);
console.log(`总路网长度: ${(edges.reduce((s, e) => s + e.lengthM, 0) / 1000).toFixed(1)} km`);
console.log(`bounds: ${JSON.stringify(map.meta.bounds)}`);
console.log(`written -> ${OUT}`);
