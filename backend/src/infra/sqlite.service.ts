import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

export type SqlParam = string | number | bigint | null | Uint8Array;

/**
 * SQLite 访问层（Node 24 内置 node:sqlite，零依赖零编译）。
 * 只做三件事：连接管理、参数归一化、事务。
 * 业务侧的建表归属见 src/infra/migrations/*.sql。
 */
@Injectable()
export class SqliteService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Sqlite');
  private db!: DatabaseSync;
  private txDepth = 0;

  onModuleInit(): void {
    const file = process.env.DB_FILE ?? 'data/robotaxi.db';
    const abs = path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
    mkdirSync(path.dirname(abs), { recursive: true });

    this.db = new DatabaseSync(abs);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.db.exec('PRAGMA synchronous = NORMAL;');

    this.migrate();
    this.logger.log(`已连接 ${abs}`);
  }

  onModuleDestroy(): void {
    try {
      this.db?.close();
    } catch {
      /* ignore */
    }
  }

  /** 按文件名顺序应用未执行的迁移 */
  private migrate(): void {
    this.db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL
    )`);

    const dir = path.join(__dirname, 'migrations');
    if (!existsSync(dir)) {
      this.logger.warn(`未找到迁移目录 ${dir}`);
      return;
    }
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    const applied = new Set(
      (this.db.prepare('SELECT name FROM schema_migrations').all() as { name: string }[]).map((r) => r.name),
    );

    for (const f of files) {
      if (applied.has(f)) continue;
      const sql = readFileSync(path.join(dir, f), 'utf8');
      this.db.exec('BEGIN');
      try {
        this.db.exec(sql);
        this.db.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)').run(f, Date.now());
        this.db.exec('COMMIT');
        this.logger.log(`迁移已应用: ${f}`);
      } catch (e) {
        this.db.exec('ROLLBACK');
        throw new Error(`迁移失败 ${f}: ${(e as Error).message}`);
      }
    }
  }

  private normalize(params: unknown[]): SqlParam[] {
    return params.map((p) => {
      if (p === undefined || p === null) return null;
      if (typeof p === 'boolean') return p ? 1 : 0;
      if (typeof p === 'number' || typeof p === 'string' || typeof p === 'bigint') return p;
      if (p instanceof Uint8Array) return p;
      if (p instanceof Date) return p.getTime();
      return JSON.stringify(p);
    });
  }

  prepare(sql: string): StatementSync {
    return this.db.prepare(sql);
  }

  run(sql: string, ...params: unknown[]): { changes: number; lastInsertRowid: number } {
    const r = this.prepare(sql).run(...this.normalize(params));
    return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
  }

  get<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T | undefined {
    return this.prepare(sql).get(...this.normalize(params)) as T | undefined;
  }

  all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T[] {
    return this.prepare(sql).all(...this.normalize(params)) as T[];
  }

  /** 只在最外层开启事务，内部嵌套调用自动降级为无操作 */
  tx<T>(fn: () => T): T {
    const outermost = this.txDepth === 0;
    if (outermost) this.db.exec('BEGIN IMMEDIATE');
    this.txDepth++;
    try {
      const out = fn();
      this.txDepth--;
      if (outermost) this.db.exec('COMMIT');
      return out;
    } catch (e) {
      this.txDepth--;
      if (outermost) {
        try {
          this.db.exec('ROLLBACK');
        } catch {
          /* ignore */
        }
      }
      throw e;
    }
  }

  /** 仅供 /ops 只读浏览用 */
  listTables(): { name: string; rows: number }[] {
    const tables = this.all<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
    );
    return tables.map((t) => {
      const c = this.get<{ c: number }>(`SELECT COUNT(*) AS c FROM "${t.name}"`);
      return { name: t.name, rows: Number(c?.c ?? 0) };
    });
  }

  /** 清空全部业务表（保留 schema 与迁移记录） */
  truncateAll(): void {
    const tables = this.all<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table'
       AND name NOT LIKE 'sqlite_%' AND name <> 'schema_migrations'`,
    );
    this.tx(() => {
      this.db.exec('PRAGMA foreign_keys = OFF');
      for (const t of tables) this.db.exec(`DELETE FROM "${t.name}"`);
      this.db.exec(`DELETE FROM sqlite_sequence WHERE 1=1`);
      this.db.exec('PRAGMA foreign_keys = ON');
    });
  }
}
