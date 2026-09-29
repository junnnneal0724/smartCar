import { Module, type OnApplicationBootstrap } from '@nestjs/common';
import { CoreModule } from '../infra/core.module';
import { SeedService } from '../infra/seed.service';
import { FleetModule } from '../modules/fleet/fleet.module';
import { RideModule } from '../modules/ride/ride.module';
import { CabinModule } from '../modules/cabin/cabin.module';
import { HelpModule } from '../modules/help/help.module';
import { NotifyModule } from '../modules/notify/notify.module';
import { SimulationModule } from '../modules/simulation/simulation.module';
import { OpsModule } from '../modules/ops/ops.module';

/**
 * 车内交互终端 · 应用聚合层。
 *
 * 说明：本地 Demo 没有高并发，所以用「单进程聚合 + 领域模块」而不是微服务多进程。
 * 模块边界依然按微服务的方式划分（各自独占数据表、只通过服务与事件交互），
 * 将来要拆成独立进程，只需把对应 Module 搬到一个新的 main.ts。
 */
@Module({
  imports: [
    CoreModule,
    FleetModule,
    RideModule,
    CabinModule,
    HelpModule,
    NotifyModule,
    SimulationModule,
    OpsModule,
  ],
})
export class AppModule implements OnApplicationBootstrap {
  constructor(private readonly seed: SeedService) {}

  /** 空库首次启动时自动造数据，保证 clone 下来 pnpm dev 就能看到东西 */
  onApplicationBootstrap(): void {
    if (this.seed.isEmpty) {
      this.seed.run();
      this.seed.createDemoRide();
    }
  }
}
