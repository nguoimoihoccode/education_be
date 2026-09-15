import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RequestWithUser } from '../../common/types/auth.types';
import { requireUserId } from './school-http.util';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/roles.enum';
import { HomeworkService } from './homework.service';

/**
 * GET /me/* cho học sinh (docs/SCHOOL_PLATFORM_PLAN.md Phase 4).
 * Không có @Controller('me') nào khác trong app — đường dẫn này an toàn.
 */
@ApiTags('school-me')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(UserRole.STUDENT)
@Controller('me')
export class MeController {
  constructor(private readonly homeworkService: HomeworkService) {}

  @Get('homework')
  @ApiOperation({
    summary: 'BTVN của tôi (mọi lớp đang học) + đầu điểm tự sinh',
  })
  myHomework(@Req() req: RequestWithUser) {
    return this.homeworkService.listForStudent(requireUserId(req));
  }
}
