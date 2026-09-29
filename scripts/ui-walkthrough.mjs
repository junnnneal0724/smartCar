/**
 * 车机界面渲染走查（无头 Chrome + CDP）。
 *
 * 为什么值得写这个脚本：
 *   1. 类型检查与打包只能证明"能编译"，证明不了"能跑起来"。
 *      Vue 模板里写错一个 store 字段名，tsc 不一定报，但一渲染就白屏。
 *   2. 这个产品的核心是"看得见的实时感"，必须真的把 19 屏渲染一遍并截图。
 *   3. 它同时是一份可执行的验收清单：改完代码重跑即可。
 *
 * 关键点：**走查必须按后端状态机来驱动**。
 * 后端状态决定车机该显示哪一屏，所以脚本先把后端推到对应状态，再访问对应页面，
 * 否则会被状态机接走（这本身就是被测行为之一）。
 *
 * 实现上用 Node 24 内置的 WebSocket 直连 CDP，不引入 puppeteer 之类的依赖。
 *
 * 用法：
 *   node scripts/ui-walkthrough.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, '.walkthrough');
const API = 'http://127.0.0.1:8080/api';
const APP = 'http://127.0.0.1:5173';
const CDP_PORT = 9222;

const CHROME_CANDIDATES = [
  `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
  `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findBrowser() {
  for (const c of CHROME_CANDIDATES) if (c && fs.existsSync(c)) return c;
  throw new Error('找不到 Chrome 或 Edge，无法做渲染走查');
}

async function api(pathname, init = {}) {
  const res = await fetch(`${API}${pathname}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    body: init.body ?? undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${pathname} 返回的不是 JSON: ${text.slice(0, 120)}`);
  }
  if (json.code !== 0) throw new Error(`${pathname} 业务失败 code=${json.code} ${json.message}`);
  return json.data;
}

/* ------------------------------------------------------------------ CDP */

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.seq = 0;
    this.pending = new Map();
    this.listeners = [];
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
        return;
      }
      for (const fn of this.listeners) fn(msg);
    });
  }

  on(fn) {
    this.listeners.push(fn);
  }

  send(method, params = {}) {
    const id = ++this.seq;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      throw new Error(`页面内执行出错: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    }
    return r.result.value;
  }

  async waitFor(expression, timeoutMs = 12_000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      try {
        if (await this.eval(expression)) return true;
      } catch {
        /* 页面正在切换上下文 */
      }
      if (Date.now() > deadline) return false;
      await sleep(180);
    }
  }

  async screenshot(file) {
    const r = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
  }
}

/* ------------------------------------------------------------------ 走查 */

const results = [];
function record(name, ok, note = '') {
  results.push({ name, ok, note });
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${note ? `  ${note}` : ''}`);
}

async function main() {
  if (fs.existsSync(OUT)) fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  try {
    await api('/session/bootstrap');
  } catch (e) {
    console.error(`\n后端没起来，先执行 pnpm dev:backend\n  ${e.message}\n`);
    process.exit(1);
  }
  try {
    const res = await fetch(APP, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    console.error(`\n前端没起来，先执行 pnpm dev:frontend\n  ${e.message}\n`);
    process.exit(1);
  }

  const browser = findBrowser();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'robotaxi-walk-'));
  const child = spawn(
    browser,
    [
      '--headless=new',
      `--remote-debugging-port=${CDP_PORT}`,
      '--remote-allow-origins=*',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  try {
    let target = null;
    for (let i = 0; i < 60 && !target; i++) {
      await sleep(300);
      try {
        const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
        target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      } catch {
        /* 还没起来 */
      }
    }
    if (!target) throw new Error('无法连接无头浏览器的调试端口');

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', () => reject(new Error('CDP WebSocket 连接失败')), { once: true });
    });
    const cdp = new CDP(ws);

    let bucket = [];
    cdp.on((msg) => {
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        const frames = (d.stackTrace?.callFrames ?? [])
          .slice(0, 5)
          .map((f) => `${f.functionName || '(anon)'} @ ${(f.url || '').replace(APP, '')}:${f.lineNumber + 1}`)
          .join(' <- ');
        bucket.push(`${d.exception?.description ?? d.text}  ${frames}`);
      }
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        bucket.push(`console.error: ${msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
      }
      if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
        bucket.push(`浏览器错误: ${msg.params.entry.text}`);
      }
    });

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });

    /** 打开一屏：等真的渲染出内容（而不是靠猜选择器），再断言关键文案 */
    const goto = async (route, { shot, settle = 900, label, expect, expectRoute, minCanvas = 0 } = {}) => {
      await cdp.send('Page.navigate', { url: `${APP}${route}` });
      const ok = await cdp.waitFor('(document.querySelector("#app")?.innerText?.length ?? 0) > 24', 14_000);
      await sleep(settle);
      const info = JSON.parse(
        await cdp.eval(`JSON.stringify({
          path: location.pathname,
          canvas: document.querySelectorAll("canvas").length,
          text: (document.querySelector("#app")?.innerText ?? "").replace(/\\s+/g," ")
        })`),
      );
      if (shot) await cdp.screenshot(path.join(OUT, `${shot}.png`));
      const name = label ?? route;
      if (expectRoute) {
        record(`${name} 落到正确路由`, info.path === expectRoute, `实际 ${info.path}`);
      }
      record(`${name} 渲染出内容`, ok, `${info.text.length} 字`);
      // 光看文字长度是不够的：图表走了空状态时页面照样有文字，
      // 只有数一数 canvas 才能确认图真的画出来了。
      // 这里用轮询而不是固定 sleep：ECharts 是在数据到位后的下一帧才建画布，
      // 固定等待既可能太短（误报）也可能太长（拖慢走查）。
      if (minCanvas > 0) {
        const begin = Date.now();
        let count = info.canvas;
        while (count < minCanvas && Date.now() - begin < 9000) {
          await sleep(300);
          count = await cdp.eval('document.querySelectorAll("canvas").length');
        }
        const waited = Date.now() - begin;
        if (count >= minCanvas) {
          record(`${name} 图表已绘制`, true, `画布 ${count} 个（${waited}ms）`);
        } else {
          const shown = await cdp.eval('(document.querySelector("#app")?.innerText ?? "").replace(/\\s+/g," ").slice(0, 90)');
          record(`${name} 图表已绘制`, false, `9 秒内只出现 ${count} 个画布（需 ≥${minCanvas}）；页面文字: ${shown}`);
        }
      }
      if (expect) {
        const missing = expect.filter((t) => !info.text.includes(t));
        record(`${name} 关键内容`, missing.length === 0, missing.length ? `缺少: ${missing.join(' / ')}` : '');
      }
      return info;
    };

    console.log('\n── 启动与工具屏 ──────────────────────────────────');
    // 启动屏会立刻按后端状态分流，所以要等"路由变了"而不是等固定时间
    await cdp.send('Page.navigate', { url: `${APP}/boot` });
    await cdp.waitFor('(document.querySelector("#app")?.innerText?.length ?? 0) > 8', 8000);
    await cdp.screenshot(path.join(OUT, '01-boot.png'));
    const booted = await cdp.waitFor('location.pathname !== "/boot"', 12_000);
    record('启动分流屏 自动分流到对应页面', booted, `落到 ${await cdp.eval('location.pathname')}`);
    await goto('/ops', { shot: '02-ops', settle: 1600, label: '演示控制台', expect: ['仿真', '倍速'] });

    // 重置成一趟"车辆正在赶来"的新行程
    await api('/ops/ride/restart', { method: 'POST', body: '{}' });
    await api('/ops/sim', { method: 'POST', body: JSON.stringify({ multiplier: 8, paused: false }) });

    console.log('\n── 上车流程 ──────────────────────────────────────');
    await goto('/waiting', { shot: '03-waiting', settle: 2200, label: '车辆前往上车点', expect: ['上车点'] });

    let state = '';
    for (let i = 0; i < 80; i++) {
      state = (await api('/session/bootstrap')).state;
      if (state === 'WELCOME' || state === 'READY') break;
      await sleep(500);
    }
    record('车辆抵达并进入欢迎流程', state === 'WELCOME' || state === 'READY', `state=${state}`);

    await goto('/welcome', { shot: '04-welcome', settle: 900, label: '欢迎上车', expect: ['这是我叫的车'] });
    await goto('/verify', { shot: '05-verify', settle: 900, label: '上车校验', expect: ['后 4 位'] });

    const rideRow = (await api('/ops/table/t_ride?limit=1')).rows[0];
    const code = String(rideRow.verify_code);
    const token = (await api('/session/verify', { method: 'POST', body: JSON.stringify({ code }) })).token;
    record('上车校验换取会话 token', !!token);
    await cdp.eval(`sessionStorage.setItem('robotaxi.ride.token', ${JSON.stringify(token)})`);

    await goto('/ready', { shot: '06-ready', settle: 900, label: '出发前确认', expect: ['开始行程'] });

    await api('/ride/start', { method: 'POST', body: '{}', headers: { authorization: `Bearer ${token}` } });
    await api('/ops/sim', { method: 'POST', body: JSON.stringify({ multiplier: 6 }) });

    console.log('\n── 行程中（功能条必须真的能跳转） ────────────────');
    await goto('/trip', { shot: '07-trip', settle: 3600, label: '行程主屏（自绘地图）', expect: ['目的地', '预计还需'], minCanvas: 1 });
    await goto('/cabin', { shot: '08-cabin', settle: 1500, label: '座舱环境控制', expect: ['舒缓'] });
    await goto('/stop', { shot: '09-stop', settle: 1300, label: '分级停靠', expect: ['紧急停车'] });
    await goto('/destination', { shot: '10-destination', settle: 1300, label: '改目的地', expect: ['目的地'] });
    await goto('/help', { shot: '11-help', settle: 1500, label: '帮助与安全', expect: ['安全员'] });
    await goto('/preferences', { shot: '12-preferences', settle: 1100, label: '我的偏好', expect: ['偏好'] });
    await goto('/trip/explain', { shot: '13-explain', settle: 2400, label: '旅程解释（图表）', expect: ['经历'], minCanvas: 1 });

    console.log('\n── 到达与收尾 ────────────────────────────────────');
    // 先让车真的跑一段再抄近路。否则轨迹采样点太少，
    // 行程小结里的速度曲线会走空状态，截图就不能代表真实演示效果。
    await api('/ops/sim', { method: 'POST', body: JSON.stringify({ multiplier: 16 }) });
    await sleep(9000);
    await api('/ops/ride/jump-arriving', { method: 'POST', body: '{}' });
    await sleep(1200);
    await goto('/arriving', { shot: '14-arriving', settle: 1800, label: '即将到达', expect: ['下车'] });

    let arrived = false;
    for (let i = 0; i < 60; i++) {
      if ((await api('/session/bootstrap')).state === 'ARRIVED') {
        arrived = true;
        break;
      }
      await sleep(500);
    }
    record('车辆停稳进入到达状态', arrived);
    await goto('/alight', { shot: '15-alight', settle: 1500, label: '下车（开门按钮）', expect: ['车门'] });

    await api('/ride/open-door', { method: 'POST', body: '{}', headers: { authorization: `Bearer ${token}` } });
    await api('/ride/complete', { method: 'POST', body: '{}', headers: { authorization: `Bearer ${token}` } });
    await sleep(700);

    await goto('/summary', { shot: '16-summary', settle: 3000, label: '行程小结（图表）', expect: ['合计'], minCanvas: 2 });

    // 无障碍主题必须在行程数据还在的时候测。
    // 后面的待机屏会按隐私要求清除上一位乘客的数据（页面上写着"上一位乘客的行程数据已从本屏幕清除"），
    // 一旦清掉，再回 /summary 就只剩空状态，测不到图表在浅色/大字/高对比下是否正常。
    console.log('\n── 主题与无障碍覆盖 ──────────────────────────────');
    await cdp.eval(`localStorage.setItem('robotaxi.theme','light'); localStorage.setItem('robotaxi.font','large'); localStorage.setItem('robotaxi.contrast','high');`);
    await goto('/summary', { shot: '20-summary-light-large', settle: 2600, label: '浅色 + 大字 + 高对比（图表）', minCanvas: 2 });
    await cdp.eval(`localStorage.setItem('robotaxi.theme','dark'); localStorage.setItem('robotaxi.font','standard'); localStorage.setItem('robotaxi.contrast','normal');`);
    await goto('/summary', { shot: '20b-summary-dark-restored', settle: 1800, label: '恢复深色后的小结', expect: ['合计'], minCanvas: 2 });

    await goto('/rate', { shot: '17-rate', settle: 1100, label: '行程评价', expect: ['提交'] });
    await goto('/farewell', { shot: '18-farewell', settle: 1100, label: '送别页', expect: ['清除'] });
    await goto('/idle', { shot: '19-idle', settle: 1400, label: '待机屏（行程结束后不该被弹走）', expectRoute: '/idle' });

    console.log('\n── 浅色下的行车屏 ────────────────────────────────');
    await api('/ops/ride/restart', { method: 'POST', body: '{}' });
    await cdp.eval(`localStorage.setItem('robotaxi.theme','light');`);
    await goto('/waiting', { shot: '21-waiting-light', settle: 2400, label: '浅色模式（地图）', expect: ['上车点'], minCanvas: 1 });
    await cdp.eval(`localStorage.setItem('robotaxi.theme','dark');`);

    console.log('\n── 控制台 ────────────────────────────────────────');
    const noise = [/favicon/i, /\[vite\] connect/i, /Download the Vue Devtools/i];
    const real = bucket.filter((e) => !noise.some((re) => re.test(e)));
    record('页面无控制台报错', real.length === 0, real.length ? `${real.length} 条` : '');
    for (const e of [...new Set(real)].slice(0, 20)) console.log(`        · ${e.slice(0, 260)}`);

    ws.close();
  } finally {
    child.kill();
    await sleep(300);
    try {
      fs.rmSync(profile, { recursive: true, force: true });
    } catch {
      /* 忽略 */
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${'─'.repeat(58)}`);
  console.log(`渲染走查：${results.length - failed.length} 通过 / ${failed.length} 失败`);
  console.log(`截图目录：${OUT}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(`\n走查中断：${e.message}\n${e.stack}`);
  process.exit(1);
});
