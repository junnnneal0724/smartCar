/**
 * 界面体检（在真实渲染的页面上量尺寸，而不是靠肉眼看截图）。
 *
 * 这类检查用来自动化"好不好看"里可以被量化的那部分：
 *   1. 横向溢出 / 内容被裁掉          —— 车机上出现横向滚动条是明显的事故
 *   2. 触控目标尺寸                    —— 车内是触摸屏，小于 56px 一定有误触
 *   3. 文本与背景的对比度              —— 深色车机最常见的毛病是灰字看不清
 *   4. 圆角是否只用令牌里的四档        —— 圆角一乱，界面立刻显脏
 *   5. 画布是否真的画出了东西          —— 自绘地图/图表白屏时 DOM 看起来是正常的
 *   6. 配色的收敛度                    —— 数一数全页到底用了几种颜色
 *
 * 用法：
 *   node scripts/ui-audit.mjs            # 打印体检报告
 *   node scripts/ui-audit.mjs --json     # 只输出 JSON，便于对比两次改动
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const API = 'http://127.0.0.1:8080/api';
const APP = 'http://127.0.0.1:5173';
const CDP_PORT = 9444;
const JSON_ONLY = process.argv.includes('--json');

const CHROME = [
  `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
].find((c) => c && fs.existsSync(c));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(pathname, init = {}) {
  const res = await fetch(`${API}${pathname}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    body: init.body ?? undefined,
  });
  const json = JSON.parse(await res.text());
  if (json.code !== 0) throw new Error(`${pathname} code=${json.code} ${json.message}`);
  return json.data;
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.seq = 0;
    this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? reject(new Error(m.error.message)) : resolve(m.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.seq;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  }
  async waitFor(expr, timeoutMs = 12_000) {
    const end = Date.now() + timeoutMs;
    for (;;) {
      try {
        if (await this.eval(expr)) return true;
      } catch {
        /* 上下文切换 */
      }
      if (Date.now() > end) return false;
      await sleep(180);
    }
  }
}

/** 注入到页面里的体检函数。写成字符串是因为它要在浏览器上下文里跑。 */
const AUDIT_FN = `
window.__audit = function () {
  const out = {
    viewport: { w: innerWidth, h: innerHeight },
    overflowX: null,
    clipped: [],
    small: [],
    offscreen: [],
    lowContrast: [],
    radii: {},
    palette: {},
    canvases: [],
  };

  const sel = 'button, a[href], [role="button"], [role="checkbox"], [role="tab"], input, select, textarea';
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
  };
  const describe = (el) => {
    const cls = typeof el.className === 'string' ? el.className.split(/\\s+/).filter(Boolean)[0] : '';
    const txt = (el.innerText || el.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim().slice(0, 24);
    return el.tagName.toLowerCase() + (cls ? '.' + cls : '') + (txt ? ' "' + txt + '"' : '');
  };

  // 1. 横向溢出：车机上出现横向滚动条基本等于布局事故
  const de = document.scrollingElement;
  if (de.scrollWidth > innerWidth + 2) out.overflowX = { scrollWidth: de.scrollWidth, innerWidth };

  // 2. 触控目标：默认要求 56x56；标了 data-touch="compact" 的次要控件放宽到 44
  for (const el of document.querySelectorAll(sel)) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    const compact = el.closest('[data-touch="compact"]') !== null;
    const min = compact ? 44 : 56;
    if (r.width + 0.5 < min || r.height + 0.5 < min) {
      out.small.push({ el: describe(el), w: Math.round(r.width), h: Math.round(r.height), min });
    }
  }

  // 3. 内容被裁：overflow 为 hidden 却有溢出，说明文字被切掉了
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    const text = (el.textContent || '').trim();
    if (!text) continue;
    if (el.children.length > 0 && !/^(hidden|clip)$/.test(cs.overflowY) === false) { /* keep */ }
    const clipY = cs.overflowY === 'hidden' || cs.overflowY === 'clip';
    const clipX = cs.overflowX === 'hidden' || cs.overflowX === 'clip';
    if (clipY && el.scrollHeight > el.clientHeight + 3 && el.clientHeight > 0) {
      // 允许"可滚动区域"（这类元素通常 overflow:auto），只报 hidden 且差得多的
      out.clipped.push({ el: describe(el), axis: 'y', scrollH: el.scrollHeight, clientH: el.clientHeight });
    }
    if (clipX && el.scrollWidth > el.clientWidth + 3 && el.clientWidth > 0 && cs.textOverflow !== 'ellipsis') {
      out.clipped.push({ el: describe(el), axis: 'x', scrollW: el.scrollWidth, clientW: el.clientWidth });
    }
  }
  out.clipped = out.clipped.slice(0, 20);

  // 4. 元素跑到视口外
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > innerWidth + 4 || r.left < -4) {
      out.offscreen.push({ el: describe(el), left: Math.round(r.left), right: Math.round(r.right) });
    }
  }
  out.offscreen = out.offscreen.slice(0, 15);

  // 5. 文本对比度（只查直接承载文字的叶子节点）
  const lum = (rgb) => {
    const f = rgb.map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
  };
  const parse = (s) => {
    const m = String(s).match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const p = m[1].split(',').map((x) => parseFloat(x));
    return { rgb: [p[0], p[1], p[2]], a: p.length > 3 ? p[3] : 1 };
  };
  const bgOf = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0.8) return c.rgb;
      n = n.parentElement;
    }
    const root = parse(getComputedStyle(document.documentElement).backgroundColor);
    return root ? root.rgb : [15, 19, 25];
  };
  const ratio = (a, b) => {
    const l1 = lum(a), l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el)) continue;
    const hasOwnText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!hasOwnText) continue;
    const cs = getComputedStyle(el);
    const fg = parse(cs.color);
    if (!fg) continue;
    // 半透明的文字（例如 0.7 opacity 的次要说明）要按合成后的颜色算
    const alpha = fg.a * parseFloat(cs.opacity || '1');
    const bg = bgOf(el);
    const blended = fg.rgb.map((v, i) => v * alpha + bg[i] * (1 - alpha));
    const size = parseFloat(cs.fontSize);
    const bold = parseInt(cs.fontWeight, 10) >= 600;
    const large = size >= 24 || (bold && size >= 19);
    const need = large ? 3 : 4.5;
    const r = ratio(blended, bg);
    if (r < need) {
      out.lowContrast.push({
        el: describe(el),
        ratio: Math.round(r * 100) / 100,
        need,
        size: Math.round(size),
        color: cs.color,
        bg: 'rgb(' + bg.join(',') + ')',
      });
    }
  }
  out.lowContrast.sort((a, b) => a.ratio - b.ratio);
  out.lowContrast = out.lowContrast.slice(0, 18);

  // 6. 圆角收敛度：只允许令牌里的四档（外加胶囊与圆形）
  const tokens = ['--r-btn', '--r-card', '--r-panel', '--r-input', '--r-chip']
    .map((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim())
    .filter(Boolean);
  const allowed = new Set(tokens.concat(['0px', '50%', '9999px', '999px']));
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    for (const v of [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomLeftRadius, cs.borderBottomRightRadius]) {
      if (v === '0px') continue;
      const key = v;
      out.radii[key] = out.radii[key] || [];
      if (out.radii[key].length < 3 && !allowed.has(key)) out.radii[key].push(describe(el));
    }
  }
  const offToken = Object.entries(out.radii).filter(([v]) => !allowed.has(v));
  out.radii = Object.fromEntries(offToken);

  // 7. 配色收敛度：数一数实际渲染出来多少种颜色
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    for (const prop of ['color', 'backgroundColor', 'borderTopColor']) {
      const v = cs[prop];
      if (!v || v === 'rgba(0, 0, 0, 0)') continue;
      out.palette[v] = (out.palette[v] || 0) + 1;
    }
  }
  out.palette = Object.entries(out.palette).sort((a, b) => b[1] - a[1]).slice(0, 14);

  // 8. 画布是否真的画了东西：采样像素，全是同一个颜色说明是白屏
  for (const c of document.querySelectorAll('canvas')) {
    const r = c.getBoundingClientRect();
    let painted = false;
    let note = '';
    try {
      const ctx = c.getContext('2d');
      if (ctx && c.width > 0 && c.height > 0) {
        const data = ctx.getImageData(0, 0, c.width, c.height).data;
        const seen = new Set();
        for (let i = 0; i < data.length; i += 4 * 97) seen.add(data[i] + ',' + data[i + 1] + ',' + data[i + 2]);
        painted = seen.size > 3;
        note = seen.size + ' 种采样色';
      } else {
        note = '非 2D 上下文';
        painted = true;
      }
    } catch (e) {
      note = '取不到像素: ' + e.message;
      painted = true;
    }
    out.canvases.push({ w: Math.round(r.width), h: Math.round(r.height), painted, note });
  }

  return out;
};
true;
`;

async function main() {
  try {
    await api('/session/bootstrap');
  } catch {
    console.error('后端没起来，先执行 pnpm dev:backend');
    process.exit(1);
  }
  if (!CHROME) {
    console.error('找不到 Chrome 或 Edge');
    process.exit(1);
  }

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'robotaxi-audit-'));
  const child = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${CDP_PORT}`,
      '--remote-allow-origins=*',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  const report = {};
  try {
    let target = null;
    for (let i = 0; i < 60 && !target; i++) {
      await sleep(300);
      try {
        const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
        target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      } catch {
        /* 等 */
      }
    }
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r, j) => {
      ws.addEventListener('open', r, { once: true });
      ws.addEventListener('error', () => j(new Error('ws')), { once: true });
    });
    const cdp = new CDP(ws);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });

    // 把后端推到"行程中"，这样乘客能到的所有页面都可以体检。
    // 必须按状态机的顺序推进：重开 -> 等车到（ABOARD）-> 校验 -> 开始行程。
    await api('/ops/ride/restart', { method: 'POST', body: '{}' });
    await api('/ops/sim', { method: 'POST', body: JSON.stringify({ multiplier: 16, paused: false }) });
    let state = '';
    for (let i = 0; i < 90; i++) {
      state = (await api('/session/bootstrap')).state;
      if (state === 'WELCOME' || state === 'READY') break;
      await sleep(400);
    }
    if (state !== 'WELCOME' && state !== 'READY') throw new Error(`等不到上车状态，当前 state=${state}`);

    const row = (await api('/ops/table/t_ride?limit=1')).rows[0];
    const token = (await api('/session/verify', { method: 'POST', body: JSON.stringify({ code: String(row.verify_code) }) })).token;
    await api('/ride/start', { method: 'POST', body: '{}', headers: { authorization: `Bearer ${token}` } });
    // 先让车真的跑一小段，累积轨迹点，这样 /summary 的速度曲线才有数据可画；
    // 然后冻住仿真，避免体检期间布局一直在变。
    await api('/ops/sim', { method: 'POST', body: JSON.stringify({ multiplier: 16, paused: false }) });
    await new Promise((r) => setTimeout(r, 6000));
    await api('/ops/sim', { method: 'POST', body: JSON.stringify({ multiplier: 2, paused: true }) });

    await cdp.send('Page.navigate', { url: `${APP}/trip` });
    await cdp.waitFor('(document.querySelector("#app")?.innerText?.length ?? 0) > 24', 12_000);
    await cdp.eval(`sessionStorage.setItem('robotaxi.ride.token', ${JSON.stringify(token)}); ${AUDIT_FN}`);

    const routes = process.argv.slice(2).filter((a) => a.startsWith('/'));
    const targets = routes.length
      ? routes
      : ['/trip', '/cabin', '/stop', '/destination', '/help', '/preferences', '/trip/explain', '/summary', '/rate', '/idle'];

    for (const route of targets) {
      await cdp.send('Page.navigate', { url: `${APP}${route}` });
      await cdp.waitFor('(document.querySelector("#app")?.innerText?.length ?? 0) > 24', 12_000);
      await sleep(2200);
      await cdp.eval(AUDIT_FN);
      report[route] = JSON.parse(await cdp.eval(`JSON.stringify(window.__audit())`));
    }

    // 浅色主题只抽查两屏：深色是默认，浅色是强光环境下的备选，
    // 但对比度这条在浅色下更容易出问题，必须真的量过。
    await cdp.eval(`localStorage.setItem('robotaxi.theme','light');`);
    for (const route of ['/trip', '/summary']) {
      if (!targets.includes(route) && routes.length) continue;
      await cdp.send('Page.navigate', { url: `${APP}${route}` });
      await cdp.waitFor('(document.querySelector("#app")?.innerText?.length ?? 0) > 24', 12_000);
      await sleep(2000);
      await cdp.eval(AUDIT_FN);
      report[`${route} (浅色)`] = JSON.parse(await cdp.eval(`JSON.stringify(window.__audit())`));
    }
    await cdp.eval(`localStorage.setItem('robotaxi.theme','dark');`);
    ws.close();
  } finally {
    child.kill();
    await sleep(250);
    try {
      fs.rmSync(profile, { recursive: true, force: true });
    } catch {
      /* 忽略 */
    }
  }

  if (JSON_ONLY) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log('\n界面体检报告');
  console.log('='.repeat(64));
  let issues = 0;
  for (const [route, d] of Object.entries(report)) {
    const problems = [];
    if (d.overflowX) problems.push(`横向溢出 ${d.overflowX.scrollWidth} > ${d.overflowX.innerWidth}`);
    if (d.clipped.length) problems.push(`内容被裁 ${d.clipped.length}`);
    if (d.small.length) problems.push(`触控过小 ${d.small.length}`);
    if (d.offscreen.length) problems.push(`元素出界 ${d.offscreen.length}`);
    if (d.lowContrast.length) problems.push(`对比度不足 ${d.lowContrast.length}`);
    const offToken = Object.keys(d.radii).length;
    if (offToken) problems.push(`圆角非令牌 ${offToken}`);
    const blank = d.canvases.filter((c) => !c.painted);
    if (blank.length) problems.push(`画布空白 ${blank.length}`);

    console.log(`\n${route}  ${problems.length ? '⚠ ' + problems.join(' | ') : '✓ 无问题'}`);
    console.log(`  配色种类（前 8）：${d.palette.slice(0, 8).map(([c, n]) => `${c}×${n}`).join('  ')}`);
    if (d.canvases.length) console.log(`  画布：${d.canvases.map((c) => `${c.w}x${c.h} ${c.painted ? 'ok' : '空白'} (${c.note})`).join(' | ')}`);
    for (const s of d.small.slice(0, 6)) console.log(`   · 触控 ${s.w}x${s.h} < ${s.min}  ${s.el}`);
    for (const c of d.clipped.slice(0, 4)) console.log(`   · 裁切[${c.axis}] ${c.el}  ${c.scrollW ?? c.scrollH} > ${c.clientW ?? c.clientH}`);
    for (const c of d.lowContrast.slice(0, 5)) console.log(`   · 对比 ${c.ratio}:1 < ${c.need}  ${c.size}px  ${c.el}  ${c.color} on ${c.bg}`);
    for (const [rad, els] of Object.entries(d.radii)) console.log(`   · 圆角 ${rad} 非令牌  ${els.join(', ')}`);
    issues += problems.length;
  }
  console.log(`\n${'='.repeat(64)}`);
  console.log(`共 ${Object.keys(report).length} 屏，${issues} 项待处理`);
  process.exit(0);
}

main().catch((e) => {
  console.error(`体检中断：${e.message}\n${e.stack}`);
  process.exit(1);
});
