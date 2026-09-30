/**
 * 接口自测脚本：把一趟行程从「车辆来接」跑到「行程小结」。
 *
 * 用法：先启动后端（pnpm dev:backend），另开一个终端执行
 *       node scripts/smoke.mjs
 *
 * 这个脚本本身就是一份可执行的接口文档：每一步都对应车机上的一次交互。
 */
const BASE = process.env.BASE ?? 'http://127.0.0.1:8080';
let token = '';
let passed = 0;
let failed = 0;

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (json.code !== 0) {
    const err = new Error(`[${json.code}] ${json.message}`);
    err.payload = json;
    throw err;
  }
  return json.data;
}

function check(name, cond, extra = '') {
  if (cond) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}${extra ? '  ' + extra : ''}`);
  } else {
    failed++;
    console.log(`  \x1b[31m✗\x1b[0m ${name}${extra ? '  ' + extra : ''}`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, { timeoutMs = 90000, everyMs = 800, label = '' } = {}) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) throw new Error(`等待超时：${label}`);
    await sleep(everyMs);
  }
}

console.log(`\n\x1b[1m智行 · 车内终端 · 接口自测\x1b[0m  (${BASE})\n`);

// ---------------------------------------------------------------- 0. 重置
console.log('[0] 重置演示数据');
await api('/api/ops/ride/restart', { method: 'POST' });
let boot = await api('/api/session/bootstrap');
check('车机启动接口可用', !!boot.vehicle, `车辆 ${boot.vehicle.plateNo} / ${boot.vehicle.cabinNo}`);
check('生成了待上车的行程', boot.ride?.status === 'PENDING', `${boot.ride?.origin?.name} → ${boot.ride?.dest?.name}`);
check('屏幕状态为 WAITING（车辆前往上车点）', boot.state === 'WAITING');

// ---------------------------------------------------------------- 1. 车辆来接
console.log('\n[1] 等待车辆到达上车点（仿真推进）');
const before = await api('/api/vehicle/current');
const aboard = await waitFor(async () => {
  const b = await api('/api/session/bootstrap');
  return b.ride?.status === 'ABOARD' ? b : null;
}, { label: '车辆到达上车点' });
const after = await api('/api/vehicle/current');
check('车辆位置发生了变化（仿真在跑）', before.lng !== after.lng || before.lat !== after.lat,
  `(${before.lng.toFixed(4)},${before.lat.toFixed(4)}) → (${after.lng.toFixed(4)},${after.lat.toFixed(4)})`);
check('行程进入 ABOARD', aboard.ride.status === 'ABOARD');
check('屏幕提示需要身份校验', aboard.needVerify === true);
check('屏幕状态为 WELCOME（欢迎页）', aboard.state === 'WELCOME');

// ---------------------------------------------------------------- 2. 校验
console.log('\n[2] 上车身份校验（手机号后 4 位）');
const rideRow = (await api('/api/ops/table/t_ride?limit=1')).rows[0];
const code = rideRow.verify_code;
check('取到校验码（真实产品不会下发，测试用）', /^\d{4}$/.test(code), `尾号 ${code}`);

try {
  await api('/api/session/verify', { method: 'POST', body: { code: '0000' === code ? '1111' : '0000' } });
  check('错误校验码应被拒绝', false);
} catch (e) {
  check('错误校验码被拒绝', String(e.message).includes('42003'), e.message);
}

const verified = await api('/api/session/verify', { method: 'POST', body: { code } });
token = verified.token;
check('校验通过并拿到行程会话 token', !!token && token.length > 20);
check('行程进入 READY（待出发）', verified.ride.status === 'READY');

// ---------------------------------------------------------------- 3. 未校验不能动车
console.log('\n[3] 会话守卫');
const saved = token;
token = '';
try {
  await api('/api/cabin/scene', { method: 'POST', body: { key: 'sleep' } });
  check('无 token 时写操作应被拒绝', false);
} catch (e) {
  check('无 token 时写操作被拒绝', String(e.message).includes('40100'), e.message);
}
token = saved;

// ---------------------------------------------------------------- 4. 开始行程
console.log('\n[4] 乘客确认开始行程');
const started = await api('/api/ride/start', { method: 'POST' });
check('行程进入 ONGOING', started.ride.status === 'ONGOING');
check('屏幕状态为 TRIP', (await api('/api/session/bootstrap')).state === 'TRIP');
check('车辆状态变为 ON_TRIP', (await api('/api/vehicle/current')).status === 'ON_TRIP');

// ---------------------------------------------------------------- 5. 座舱
console.log('\n[5] 座舱控制');
const scene = await api('/api/cabin/scene', { method: 'POST', body: { key: 'motion' } });
check('切换「舒缓」场景生效', scene.setting.scene === 'motion', `温度 ${scene.setting.tempLeft}° 风量 ${scene.setting.fanLevel}`);
const cabin = await api('/api/cabin', { method: 'PATCH', body: { tempLeft: 23.5, fanLevel: 3 } });
check('单项调节生效', cabin.setting.tempLeft === 23.5 && cabin.setting.fanLevel === 3);
try {
  await api('/api/cabin', { method: 'PATCH', body: { tempLeft: 99 } });
  check('超出范围的温度应被拒绝', false);
} catch (e) {
  check('超出范围的温度被拒绝', String(e.message).includes('40000'), e.message);
}

// ---------------------------------------------------------------- 6. 决策可视化
console.log('\n[6] 决策可视化（车辆行为事件流）');
await api('/api/ops/ride/behavior', { method: 'POST', body: { type: 'YIELD_PEDESTRIAN' } });
await sleep(600);
const evts = await api('/api/ride/events?limit=10');
const behavior = evts.find((e) => e.kind === 'BEHAVIOR');
check('产生了车辆行为事件', !!behavior, behavior ? `${behavior.title}：${behavior.detail.slice(0, 24)}…` : '');
check('事件带有人话解释', (behavior?.detail?.length ?? 0) > 20);

// ---------------------------------------------------------------- 7. 推进
console.log('\n[7] 行程推进（等待里程增长）');
const p0 = (await api('/api/ride/current')).ride.traveledM;
await sleep(4000);
const p1 = (await api('/api/ride/current')).ride.traveledM;
check('已行驶里程在增长', p1 > p0, `${p0}m → ${p1}m`);
check('剩余时间已估算', (await api('/api/ride/current')).ride.remainTimeS > 0);

// 行程还没结束就不该能评价，否则"结束之后才能评价"这条约束形同虚设
try {
  await api('/api/ride/rate', { method: 'POST', body: { score: 5 } });
  check('行程进行中不能评价', false);
} catch (e) {
  check('行程进行中不能评价', String(e.message).includes('行程结束之后才能评价'), e.message);
}

// ---------------------------------------------------------------- 8. 改目的地与停靠
console.log('\n[8] 改目的地 / 分级停靠');
// 这一节的每条断言都对应曾经真实存在的缺陷，别删：
//  - 只传 poiId 改目的地：控制器原先先校验 name 再查 POI，前端只传 poiId，于是必定被拒
//  - 停靠要真的改变车辆行为：接口原先只落库 + 广播，仿真从不订阅事件，车照旧开往原目的地
//  - 取消要真的回滚：否则界面写"已取消"、车还在往停靠点开
const pois = (await api('/api/ops/table/t_poi?limit=200')).rows;
let cur = (await api('/api/ride/current')).ride;

const destPoi = pois.find((p) => p.name !== cur.origin.name && p.name !== cur.dest.name);
const destBefore = cur.dest.name;
await api('/api/ride/destination', { method: 'POST', body: { poiId: destPoi.id } });
let afterDest = (await api('/api/ride/current')).ride;
check('只传 poiId 也能改目的地', afterDest.dest.name === destPoi.name, `${destBefore} → ${afterDest.dest.name}`);
check('改目的地后规划里程已重算', afterDest.planDistanceM > 0, `${afterDest.planDistanceM} m`);

const stopPoi = pois.find((p) => ![cur.origin.name, afterDest.dest.name].includes(p.name));
const stop = await api('/api/ride/stop', { method: 'POST', body: { kind: 'NORMAL', poiId: stopPoi.id } });
check('普通停靠请求已受理', !!stop.id, stopPoi.name);
const afterStop = (await api('/api/ride/current')).ride;
check('受理停靠后终点改为停靠点', afterStop.dest.name === stopPoi.name, `→ ${afterStop.dest.name}`);
check('受理停靠后行程转入 ARRIVING', afterStop.status === 'ARRIVING', afterStop.status);
check('停靠请求状态转为 ACCEPTED', (await api('/api/ride/stops')).some((s) => s.id === stop.id && s.status === 'ACCEPTED'));

await api(`/api/ride/stop/${stop.id}/cancel`, { method: 'POST' });
const reverted = (await api('/api/ride/current')).ride;
check('取消停靠后终点回滚', reverted.dest.name === afterDest.dest.name, `→ ${reverted.dest.name}`);
check('取消停靠后状态回到 ONGOING', reverted.status === 'ONGOING', reverted.status);
check('停靠请求状态转为 CANCELLED', (await api('/api/ride/stops')).some((s) => s.id === stop.id && s.status === 'CANCELLED'));

const sos = await api('/api/ride/stop', { method: 'POST', body: { kind: 'EMERGENCY', note: '乘客不适' } });
check('紧急停车已受理并联动安全事件', sos.kind === 'EMERGENCY');
check('紧急停车联动写入 SOS 记录', (await api('/api/ops/table/t_sos_record?limit=5')).rows.length > 0);

// ---------------------------------------------------------------- 9. 到达流程
console.log('\n[9] 到达流程');
// 上一步的紧急停车已经把终点改成"前方安全位置"，车会自己开过去停稳。
// 这里不再用 jump-arriving：它是运营侧的演示捷径，此时行程已不在 ONGOING。
await api('/api/ops/sim', { method: 'POST', body: { multiplier: 16, paused: false } });
const arrived = await waitFor(async () => {
  const b = await api('/api/session/bootstrap');
  return b.ride?.status === 'ARRIVED' ? b : null;
}, { label: '车辆靠边停稳' });
check('紧急停靠后车辆自行停稳', true, arrived.ride.statusLabel);
check('停靠请求已完结（DONE）', (await api('/api/ride/stops')).some((s) => s.kind === 'EMERGENCY' && s.status === 'DONE'));
await api('/api/ops/sim', { method: 'POST', body: { multiplier: 4, paused: false } });
const door = await api('/api/ride/open-door', { method: 'POST' });
check('停稳后可以开门', door.ok === true);

// ---------------------------------------------------------------- 10. 小结
console.log('\n[10] 行程小结与旅程解释');
const summary = await api('/api/ride/summary');
check('小结返回账单明细', summary.fare.total > 0, `合计 ¥${(summary.fare.total / 100).toFixed(2)}`);
check('小结返回速度曲线数据', Array.isArray(summary.speedCurve) && summary.speedCurve.length > 0, `${summary.speedCurve.length} 个采样点`);
check('小结返回轨迹', Array.isArray(summary.route) && summary.route.length > 0, `${summary.route.length} 个轨迹点`);
check('统计含平均车速', summary.stats.avgSpeedKph >= 0, `${summary.stats.avgSpeedKph} km/h`);
check('统计含减碳量', summary.stats.co2SavedG > 0, `${summary.stats.co2SavedG} g`);

const explain = await api('/api/ride/explain');
check('旅程解释返回时间分配', Array.isArray(explain.segments), explain.segments.map((s) => `${s.label}×${s.count}`).join(' '));
check('旅程解释给出一句人话结论', typeof explain.conclusion === 'string' && explain.conclusion.length > 8, explain.conclusion);

// ---------------------------------------------------------------- 11. 帮助
console.log('\n[11] 帮助与安全');
const topics = await api('/api/help/topics');
check('车内高频问题清单可用', topics.topics.length >= 6, `${topics.topics.length} 条`);
const privacy = await api('/api/help/privacy');
check('隐私与设备状态可查', privacy.camera.purpose.length > 0);
const assist = await api('/api/help/assist', { method: 'POST', body: { topic: '行程疑问' } });
check('可接通远程安全员', !!assist.session.agentName, `${assist.session.agentName}`);
await api(`/api/help/assist/${assist.session.id}/message`, { method: 'POST', body: { content: '我有点晕车' } });
await sleep(1800);
const assist2 = await api('/api/help/assist');
check('客服按规则给出回复', assist2.messages.length >= 3, `共 ${assist2.messages.length} 条消息`);

// ---------------------------------------------------------------- 12. 评价与结束
console.log('\n[12] 评价、取件码与结束会话');
await api('/api/ride/complete', { method: 'POST' });
check('行程已结束，屏幕转入小结', (await api('/api/session/bootstrap')).state === 'SUMMARY');
try {
  await api('/api/session/current');
  check('行程结束后会话应失效', false);
} catch (e) {
  check('行程结束后会话失效（隐私要求）', String(e.message).includes('40100'));
}

// 下面两件事都发生在行程结束、会话按隐私要求失效之后——这正是乘客的真实时序。
// 之前测试把它们放在 complete() 之前，所以"评分和取件码在真实时序下根本打不开"
// 这个问题一直没被发现：接口要求有效会话，而会话偏偏在这时候刚失效。
const rate = await api('/api/ride/rate', { method: 'POST', body: { score: 5, tags: ['车内整洁', '驾驶平稳'] } });
check('会话失效后仍能评价', rate.ok === true);
check('评分已记录', (await api('/api/ride/summary')).rating?.score === 5);
const sync = await api('/api/help/sync', { method: 'POST' });
check('会话失效后仍能取到取件码', !!sync.token, sync.url);
check('取件码可查看行程', /^\/m\/ride\/.+/.test(sync.url), sync.url);
check('结束后仍可查看小结', (await api('/api/ride/summary')).fare.total > 0);

// ---------------------------------------------------------------- 结果
console.log(`\n\x1b[1m结果：${passed} 通过 / ${failed} 失败\x1b[0m\n`);
process.exit(failed ? 1 : 0);
