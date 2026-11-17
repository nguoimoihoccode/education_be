import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/roles.enum';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CostOverviewService } from './cost-overview.service';

@ApiTags('Costs')
@ApiBearerAuth('JWT-auth')
@Controller('costs')
export class CostOverviewController {
  constructor(private readonly costs: CostOverviewService) {}

  @Get('schools')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.EDUCATION_ADMIN)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'List schools for admin cost filtering' })
  async schools() {
    return { items: await this.costs.listSchools() };
  }

  /** Spend per source (grading, tutor, quiz…) and their combined total. */
  @Get('overview')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.EDUCATION_ADMIN)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Model spend per usage source (admin)' })
  overview(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('schoolId') schoolId?: string,
  ) {
    return this.costs.overview(from, to, schoolId || undefined);
  }
}
