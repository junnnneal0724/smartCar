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

    /**
     * 打开一屏：等真的渲染出内容（而不是靠猜选择器），再断言关键文案。
     *
     * 注意"文字长度 > 24"这条本身不可靠——外壳的状态条加行程卡就有 150 多字，
     * 路由组件（懒加载 chunk）还没挂上来时它就已经成立了，
     * 于是会把一张空页面当成渲染成功。所以必须同时确认主内容区里有东西，
     * 并且把常驻的"返回"按钮排除掉。
     */
    const READY = `(() => {
      const app = document.querySelector('#app');
      if (!app) return false;
      const main = document.querySelector('.shell__main');
      if (main && !main.querySelector(':scope > *:not(.shell__back)')) return false;
      return (app.innerText?.length ?? 0) > 24;
    })()`;
    const goto = async (route, { shot, settle = 900, label, expect, expectRoute, minCanvas = 0 } = {}) => {
      await cdp.send('Page.navigate', { url: `${APP}${route}` });
      const ok = await cdp.waitFor(READY, 14_000);
      await sleep(settle);
      const info = JSON.parse(
        await cdp.eval(`JSON.stringify({
          path: location.pathname,
          canvas: document.querySelectorAll("canvas").length,
          mounted: (() => {
            const main = document.querySelector('.shell__main');
            return main ? !!main.querySelector(':scope > *:not(.shell__back)') : true;
          })(),
          text: (document.querySelector("#app")?.innerText ?? "").replace(/\\s+/g," ")
        })`),
      );
      if (shot) await cdp.screenshot(path.join(OUT, `${shot}.png`));
      const name = label ?? route;
      if (expectRoute) {
        record(`${name} 落到正确路由`, info.path === expectRoute, `实际 ${info.path}`);
      }
      record(
        `${name} 渲染出内容`,
        ok && info.mounted,
        info.mounted ? `${info.text.length} 字` : `${info.text.length} 字，但主内容区是空的（路由组件没挂上来）`,
      );
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
          // 失败时把"当前到底是什么分支"一并打出来：
          // 只看文字长度分不清是走了空状态、还是内容渲染到一半。
          const diag = JSON.parse(
            await cdp.eval(`JSON.stringify({
              path: location.pathname,
              theme: document.documentElement.getAttribute("data-theme"),
              map: !!document.querySelector(".waiting__map, .map"),
              empty: !!document.querySelector(".waiting__empty, .empty"),
              canvases: document.querySelectorAll("canvas").length,
              firstKid: document.querySelector("#app")?.firstElementChild?.className ?? "",
              text: (document.querySelector("#app")?.innerText ?? "").replace(/\\s+/g," ").slice(0, 300)
            })`),
          );
          record(
            `${name} 图表已绘制`,
            false,
            `9 秒内只出现 ${count} 个画布（需 ≥${minCanvas}）；` +
              `路由=${diag.path} 主题=${diag.theme} 地图容器=${diag.map} 空状态=${diag.empty} 外壳=${diag.firstKid}\n` +
              `        页面文本: ${diag.text}`,
          );
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

    // 合成一次拖动手势：真的派发 pointerdown/move/up，页面的拖动逻辑才会走一遍
    // （相机跟着动、视角归属标记也要跟着变），只是不经过浏览器的手势识别。
    const DRAG_MAP = `(() => {
      const c = document.querySelector('.map__canvas');
      if (!c) return false;
      const r = c.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const ev = (t, cx, cy) =>
        c.dispatchEvent(new PointerEvent(t, { clientX: cx, clientY: cy, pointerId: 1, bubbles: true, pointerType: 'mouse' }));
      ev('pointerdown', x, y);
      for (let i = 1; i <= 8; i++) ev('pointermove', x - i * 40, y - i * 6);
      ev('pointerup', x - 320, y - 48);
      return true;
    })()`;
    const hintText = `document.querySelector('.map__hint')?.innerText?.trim() ?? ''`;

    // 地图必须能手动拖动，而且松手之后不能被拽回中心。
    // 相机是否被拉回没法从 DOM 上看出来，所以用画布像素签名来判断：
    // 拖动前后、以及静置一段时间之后，画面都应该显著不同于拖动之前。
    // 必须先暂停仿真，否则车一动画面本来就变，测不出相机有没有回弹。
    {
      const SIG = `(() => {
        const c = document.querySelector('.map__canvas');
        if (!c) return null;
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        const out = [];
        // 采样步长取质数，避免和地图上规则的网格对齐
        for (let i = 0; i < d.length; i += 997 * 4) out.push(d[i], d[i + 1], d[i + 2]);
        return out;
      })()`;
      const ratio = (a, b) => {
        if (!a || !b || a.length !== b.length) return -1;
        let n = 0;
        for (let i = 0; i < a.length; i += 3) {
          if (Math.abs(a[i] - b[i]) > 16 || Math.abs(a[i + 1] - b[i + 1]) > 16 || Math.abs(a[i + 2] - b[i + 2]) > 16) n++;
        }
        return n / (a.length / 3);
      };

      await api('/ops/sim', { method: 'POST', body: JSON.stringify({ paused: true }) });
      await sleep(700);
      const before = await cdp.eval(SIG);
      await cdp.eval(DRAG_MAP);
      await sleep(350);
      const dragged = await cdp.eval(SIG);
      await sleep(2600);
      const settled = await cdp.eval(SIG);
      const moved = ratio(before, dragged);
      const kept = ratio(before, settled);
      record('地图可手动拖动', moved > 0.12, `拖动后画面变化 ${(moved * 100).toFixed(0)}%`);
      record('地图松手后不弹回中心', kept > 0.12, `静置 2.6 秒后仍与拖动前不同 ${(kept * 100).toFixed(0)}%`);
      await cdp.screenshot(path.join(OUT, '07b-trip-panned.png'));
      await api('/ops/sim', { method: 'POST', body: JSON.stringify({ paused: false }) });

      // 拖过之后视角归乘客：角落提示变成"已锁定视角"，并且给出"回到车辆"。
      // 这一条是"状态机不许再收走这一屏"的前置条件，所以要单独断言。
      const locked = await cdp.eval(hintText);
      record('拖动后地图视角归乘客控制', locked.includes('已锁定'), `角落提示「${locked}」`);
      const back = await cdp.eval(`(() => {
        const b = document.querySelector('.map__tools .tool--accent');
        if (!b) return false;
        b.click();
        return true;
      })()`);
      await sleep(500);
      const backHint = await cdp.eval(hintText);
      record('点"回到车辆"能把视角交还出去', back && backHint.includes('跟随'), `角落提示「${backHint}」`);
    }

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

    // 车辆一进入"即将到达"，后端就推状态，/trip 会被接管到 /arriving——
    // 而 /arriving 底部高亮的是"停靠"、文案也全是靠边停靠，所以乘客看到的是
    // "我一拖动地图就跳到停靠页"。真实原因是状态机换屏和拖动撞在了一起：
    // 手指还在图上，页面就没了。拖过地图之后这一屏归乘客，谁也别收走。
    {
      // 冻结仿真：这一段要看的是"状态机有没有越权换屏"，
      // 车要是继续跑就会顺带跑到"已到达"，把两件事混在一起。
      await api('/ops/sim', { method: 'POST', body: JSON.stringify({ paused: true }) });
      await goto('/trip', { settle: 1600, label: '行程地图（手动拖过之后等待到达）', minCanvas: 1 });
      await cdp.eval(DRAG_MAP);
      await sleep(500);
      record('拖动后视角归乘客（为下一步做准备）', (await cdp.eval(hintText)).includes('已锁定'));
      await api('/ops/ride/jump-arriving', { method: 'POST', body: '{}' });
      // 跨过一次 8 秒兜底轮询：状态机有充分机会把这一屏收走
      await sleep(9500);
      const stayed = await cdp.eval('location.pathname');
      record('拖过地图后，"即将到达"不会收走行程页', stayed === '/trip', `实际 ${stayed}`);
      await cdp.screenshot(path.join(OUT, '14a-trip-kept-after-manual-pan.png'));

      // 反过来也要成立：没碰过地图的乘客，仍然由状态机按时带到到达屏。
      // 不然"修好了跳到停靠页"就变成了"永远看不到到达屏"。
      // 用裸导航而不是 goto：这里要看的正是"落在 /trip 之后被接管走"，
      // 走 goto 会把中间过程吃掉。
      await cdp.send('Page.navigate', { url: `${APP}/trip` });
      const handedOff = await cdp.waitFor(
        `location.pathname === '/arriving' || location.pathname === '/alight'`,
        12_000,
      );
      record('没碰地图时状态机照常接管走这一屏', handedOff, `实际 ${await cdp.eval('location.pathname')}`);
      await api('/ops/sim', { method: 'POST', body: JSON.stringify({ paused: false }) });
    }

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

    // 真的把评价提交掉。这一屏以前是"点进去就被弹回校验页"：提交要求有效会话，
    // 而会话在行程结束时已经按隐私要求失效，于是评价永远提交不了。
    {
      // 星级和提交必须分两次点：按钮在 score===0 时是 disabled 的，
      // 同一次同步执行里点完星级，DOM 还没更新，提交按钮点不动。
      const picked = await cdp.eval(`(() => {
        const stars = document.querySelectorAll('.stars__btn');
        if (!stars.length) return false;
        stars[stars.length - 1].click();
        return true;
      })()`);
      await sleep(400);
      const submitted = await cdp.eval(`(() => {
        const b = document.querySelector('.rate__submit');
        if (!b) return false;
        b.click();
        return true;
      })()`);
      const left = await cdp.waitFor(`location.pathname === '/farewell'`, 9000);
      record(
        '评价能提交并进入送别页（没被弹回校验页）',
        picked && submitted && left,
        picked && submitted && left ? '' : `选星=${picked} 提交=${submitted} 当前=${await cdp.eval('location.pathname')}`,
      );
      await cdp.screenshot(path.join(OUT, '17b-rate-submitted.png'));
    }

    // 取件码同样是下车之后才用的，也必须能在会话失效之后拿到
    await goto('/share', { shot: '22-share', settle: 2200, label: '取件码（同步到手机）', expect: ['取件码'] });
    {
      // 取件码是异步取的：页面先渲染骨架屏，接口回来才有码。
      // 这里必须轮询等它出现，不能固定等一个秒数就读一次——读早了会报成
      // "0 行取件码"，看起来像后端出了问题，其实只是断言跑在数据前面
      // （骨架屏那一屏大约 89 字，和"没拿到码"长得几乎一样，光看字数分不出来）。
      const begin = Date.now();
      let info = null;
      while (Date.now() - begin < 10_000) {
        info = JSON.parse(
          await cdp.eval(`JSON.stringify({
            path: location.pathname,
            lines: document.querySelectorAll('.token__line').length,
            skeleton: !!document.querySelector('.sk'),
            alert: (document.querySelector('.page .alert, [role="alert"]')?.innerText ?? '').trim(),
            empty: (document.querySelector('.empty__title')?.innerText ?? '').trim(),
          })`),
        );
        // 拿到码、被弹走、或者明确报错/空状态，都不用再等了
        if (info.lines >= 2 || info.path === '/verify' || info.alert || info.empty) break;
        await sleep(250);
      }
      const waited = Date.now() - begin;
      const ok = info.lines >= 2 && info.path !== '/verify';
      record(
        '会话失效后仍能取到取件码',
        ok,
        `${info.lines} 行取件码｜路由 ${info.path}｜等待 ${waited}ms` +
          `${info.skeleton ? '｜仍停在骨架屏' : ''}` +
          `${info.alert ? `｜提示「${info.alert}」` : ''}${info.empty ? `｜空状态「${info.empty}」` : ''}`,
      );
    }

    await goto('/farewell', { shot: '18-farewell', settle: 1100, label: '送别页', expect: ['清除'] });
    await goto('/idle', { shot: '19-idle', settle: 1400, label: '待机屏（行程结束后不该被弹走）', expectRoute: '/idle' });

    console.log('\n── 浅色下的行车屏 ────────────────────────────────');
    await api('/ops/ride/restart', { method: 'POST', body: '{}' });
    // 必须把仿真停住再测这一屏。重开后倍速还停在上一步的 16 倍，
    // 车会立刻到达上车点，状态机就按设计把页面从 /waiting 弹到 /welcome，
    // 而那一屏没有地图，于是"画布 0 个"——这是测试的竞态，不是页面的缺陷。
    await api('/ops/sim', { method: 'POST', body: JSON.stringify({ multiplier: 1, paused: true }) });
    await cdp.eval(`localStorage.setItem('robotaxi.theme','light');`);
    // 断言必须用只在地图分支里出现的文案：
    // 空状态的说明里也有"上车点"三个字，用它当断言会漏判分支走错。
    await goto('/waiting', { shot: '21-waiting-light', settle: 2400, label: '浅色模式（地图）', expect: ['车辆正在前往上车点'], minCanvas: 1, expectRoute: '/waiting' });
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
