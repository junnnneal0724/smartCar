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

/**
 * 子进程崩了要自动拉起来，理由同 backend/scripts/start-all.mjs：
 * 只打印一行"进程退出"的话，前端还活着、后端已经死了，页面上全是报错，
 * 但从外面看"服务是开着的"，最难判断。
 */
const RESTART_DELAY_MS = 1500;

let shuttingDown = false;
const children = [];

function launch(t) {
  const child = spawn(t.cmd, t.args, { cwd: t.cwd, stdio: 'inherit', env: { ...process.env } });
  children.push(child);
  child.on('exit', (code, signal) => {
    if (signal || shuttingDown) return;
    console.log(`${t.color}[${t.name}]\x1b[0m 进程退出 code=${code}，${RESTART_DELAY_MS}ms 后自动重启`);
    setTimeout(() => {
      if (!shuttingDown) launch(t);
    }, RESTART_DELAY_MS);
  });
}

for (const t of tasks) launch(t);

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

console.log('\n\x1b[32m智行 · 车内交互终端 Demo\x1b[0m');
console.log('  车机界面  http://127.0.0.1:5173');
console.log('  网关      http://127.0.0.1:8080');
console.log('  演示控制台 http://127.0.0.1:5173/ops\n');
