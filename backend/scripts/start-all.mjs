/**
 * 一键启动后端两个进程：gateway(:8080) + app(:8081)。
 *
 * 流程：先 tsc 编译（含迁移文件拷贝），再用原生 node 启动产物。
 *
 * 说明：子进程一律用 stdio: 'inherit'。受限环境下用管道捕获子进程输出会被
 * 直接拒绝（EPERM），而直通输出本来就更适合开发调试（颜色与 TTY 都保留）。
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { backendRoot, runTsc, copyAssets } from './build.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const watch = process.env.WATCH === '1';

console.log('[dev] 正在编译后端…');
await runTsc();
copyAssets();
console.log('[dev] 编译完成');

const targets = [
  { name: 'app', entry: 'dist/app/main.js' },
  { name: 'gateway', entry: 'dist/gateway/main.js' },
];

/**
 * 进程崩了要自动拉起来。
 *
 * 之前这里只打印一行"进程退出"，然后什么都不做：应用进程一旦崩溃，
 * 网关还在监听 8080，但转发过去全是 502，而且永远好不了——看起来像"服务开着"，
 * 实际上整个页面都是坏的，非常难判断。
 *
 * 连续秒退说明是配置或依赖问题，重启也没用，就停下来把错误留在屏幕上。
 */
const RESTART_DELAY_MS = 1500;
const FAST_EXIT_MS = 5000;
const MAX_FAST_FAILS = 3;

let shuttingDown = false;
const children = [];
const fastFails = new Map();

function launch(t) {
  const entry = path.join(backendRoot, t.entry);
  const startedAt = Date.now();
  const child = spawn(process.execPath, [entry], {
    cwd: backendRoot,
    stdio: 'inherit',
    env: { ...process.env, PROC_NAME: t.name },
  });
  children.push(child);

  child.on('exit', (code, signal) => {
    if (shuttingDown || signal) return;
    const aliveMs = Date.now() - startedAt;

    if (aliveMs < FAST_EXIT_MS) {
      const n = (fastFails.get(t.name) ?? 0) + 1;
      fastFails.set(t.name, n);
      if (n >= MAX_FAST_FAILS) {
        console.error(`[dev] ${t.name} 连续 ${n} 次启动后立刻退出，不再自动重启，请按上面的报错排查`);
        return;
      }
    } else {
      fastFails.set(t.name, 0);
    }

    console.log(`[dev] ${t.name} 进程退出，code=${code}（存活 ${Math.round(aliveMs / 1000)}s），${RESTART_DELAY_MS}ms 后自动重启`);
    setTimeout(() => {
      if (!shuttingDown) launch(t);
    }, RESTART_DELAY_MS);
  });
}

for (const t of targets) launch(t);

function shutdown() {
  shuttingDown = true;
  for (const c of children) {
    try {
      c.kill('SIGTERM');
    } catch {
      /* ignore */
    }
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log(`[dev] 已启动 ${targets.length} 个后端进程${watch ? '（watch 模式）' : ''}`);
