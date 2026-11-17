import { Module } from '@nestjs/common';
import { CostOverviewController } from './cost-overview.controller';
import { CostOverviewService } from './cost-overview.service';

@Module({
  controllers: [CostOverviewController],
  providers: [CostOverviewService],
})
export class CostOverviewModule {}
