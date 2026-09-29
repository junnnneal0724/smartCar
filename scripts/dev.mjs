/**
 * 根目录一键开发：同时拉起后端（网关 + 应用）与前端（Vite）。
 *
 * 子进程一律用 stdio: 'inherit'：
 * 受限环境下用管道捕获子进程输出会被拒绝（EPERM），直通输出也更便于调试。
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const tasks = [
  {
    name: 'backend ',
    color: '\x1b[36m',
    cmd: process.execPath,
    args: [path.join(root, 'backend', 'scripts', 'start-all.mjs')],
    cwd: path.join(root, 'backend'),
  },
  {
    name: 'frontend',
    color: '\x1b[35m',
    cmd: process.execPath,
    args: [path.join(root, 'frontend', 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1'],
    cwd: path.join(root, 'frontend'),
  },
];

const children = tasks.map((t) => {
  const child = spawn(t.cmd, t.args, { cwd: t.cwd, stdio: 'inherit', env: { ...process.env } });
  child.on('exit', (code, signal) => {
    if (signal) return;
    console.log(`${t.color}[${t.name}]\x1b[0m 进程退出 code=${code}`);
  });
  return child;
});

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

console.log('\n\x1b[32m智行 · 车内交互终端 Demo\x1b[0m');
console.log('  车机界面  http://127.0.0.1:5173');
console.log('  网关      http://127.0.0.1:8080');
console.log('  演示控制台 http://127.0.0.1:5173/ops\n');
