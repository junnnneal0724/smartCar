/**
 * 独立种子脚本：不启动 HTTP 服务，直接建库 + 造数据。
 * 用法：pnpm -C backend seed          （仅补齐缺失数据）
 *       pnpm -C backend seed --force  （清库重来）
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { backendRoot, runTsc, copyAssets } from './build.mjs';

const force = process.argv.includes('--force');

console.log('[seed] 正在编译…');
await runTsc();
copyAssets();

const args = [path.join(backendRoot, 'dist', 'infra', 'seed.cli.js')];
if (force) args.push('--force');

const child = spawn(process.execPath, args, { cwd: backendRoot, stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));
