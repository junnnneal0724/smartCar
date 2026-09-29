/**
 * 独立种子脚本：不启动 HTTP 服务，直接建库 + 造数据。
 * 用法：pnpm -C backend seed         （仅补齐缺失数据）
 *       pnpm -C backend seed --force （清库重来）
 */
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { CoreModule } from './core.module';
import { SeedService } from './seed.service';

async function main() {
  const force = process.argv.includes('--force');
  const app = await NestFactory.createApplicationContext(CoreModule, { logger: ['warn', 'error', 'log'] });
  const seed = app.get(SeedService);

  if (force) {
    seed.truncateAll();
  }
  seed.run();
  const rideId = seed.createDemoRide();
  Logger.log(`种子数据已就绪，演示行程 id=${rideId}`, 'SeedCLI');
  await app.close();
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
