import { Global, Module } from '@nestjs/common';
import { SqliteService } from './sqlite.service';
import { SeedService } from './seed.service';
import { MapService } from '../libs/map/map.service';
import { DomainEvents } from '../libs/common/events';

/**
 * 基础设施层，全局可见：
 *  - SqliteService  零安装的本地库（Node 内置 node:sqlite）
 *  - MapService     自绘路网（地图数据的唯一来源）
 *  - DomainEvents   进程内事件总线
 *  - SeedService    演示数据种子
 */
@Global()
@Module({
  providers: [SqliteService, MapService, DomainEvents, SeedService],
  exports: [SqliteService, MapService, DomainEvents, SeedService],
})
export class CoreModule {}
