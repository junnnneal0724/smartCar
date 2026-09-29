/**
 * 删除本地 SQLite 数据库文件，回到全新状态。
 * 之所以是"删文件"而不是"清空表"：这样连迁移也会重新跑一遍，
 * 能顺带验证 001_init.sql 是可重复执行的。
 */
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(here, '..');
const dbFile = process.env.DB_FILE ?? path.join(backendRoot, 'data', 'robotaxi.db');

const targets = [dbFile, `${dbFile}-wal`, `${dbFile}-shm`];
let removed = 0;
for (const f of targets) {
  if (existsSync(f)) {
    rmSync(f, { force: true });
    console.log(`已删除 ${path.relative(backendRoot, f)}`);
    removed++;
  }
}
console.log(removed ? `共删除 ${removed} 个文件，下次启动会自动重建并造数据。` : '没有找到数据库文件，本来就干净的。');
