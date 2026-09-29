/**
 * 后端构建：tsc 编译 + 拷贝非 TS 资源。
 *
 * 为什么不用 tsx/esbuild 直接跑 TS：
 *   NestJS 的依赖注入依赖 TypeScript 的 emitDecoratorMetadata 产出
 *   design:paramtypes，而 esbuild（tsx 的底层）明确不支持该能力，
 *   结果是所有构造器注入都会拿到 undefined。所以这里回到 tsc 正统路线：
 *   编译一次，之后用原生 node 跑产物，启动更快也更接近生产形态。
 */
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const backendRoot = path.resolve(here, '..');

export function runTsc() {
  return new Promise((resolve, reject) => {
    const tsc = path.join(backendRoot, 'node_modules', 'typescript', 'bin', 'tsc');
    const child = spawn(process.execPath, [tsc, '-p', 'tsconfig.json'], {
      cwd: backendRoot,
      stdio: 'inherit',
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`tsc 退出码 ${code}`))));
    child.on('error', reject);
  });
}

/** 迁移文件是运行时读取的，必须跟着产物一起走 */
export function copyAssets() {
  const from = path.join(backendRoot, 'src', 'infra', 'migrations');
  const to = path.join(backendRoot, 'dist', 'infra', 'migrations');
  if (!existsSync(from)) return 0;
  mkdirSync(to, { recursive: true });
  const files = readdirSync(from).filter((f) => f.endsWith('.sql'));
  for (const f of files) cpSync(path.join(from, f), path.join(to, f));
  return files.length;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const t0 = Date.now();
  await runTsc();
  const n = copyAssets();
  console.log(`[build] 编译完成，拷贝 ${n} 个迁移文件，用时 ${Date.now() - t0}ms`);
}
