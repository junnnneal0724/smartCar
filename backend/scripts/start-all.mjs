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

const children = [];

for (const t of targets) {
  const entry = path.join(backendRoot, t.entry);
  const child = spawn(process.execPath, [entry], {
    cwd: backendRoot,
    stdio: 'inherit',
    env: { ...process.env, PROC_NAME: t.name },
  });
  child.on('exit', (code, signal) => {
    if (signal) return;
    console.log(`[dev] ${t.name} 进程退出，code=${code}`);
  });
  children.push(child);
}

function shutdown() {
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
