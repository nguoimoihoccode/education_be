import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { RequestWithUser } from '../../common/types/auth.types';
import { requireUserId } from './school-http.util';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { SCHOOL_ADMIN_ROLES, UserRole } from '../../common/enums/roles.enum';
import { HomeworkService } from './homework.service';
import { CreateHomeworkDto } from './dto/homework.dto';

/**
 * BTVN (Phase 4) — giáo viên giao quiz/deck có sẵn cho lớp kèm deadline.
 * Service check quyền theo lớp × môn, denial = 404 (rule D1).
 * Học sinh đọc qua GET /me/homework; phụ huynh qua /parent.
 */
@ApiTags('school-homework')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
@Controller('homework')
export class HomeworkController {
  constructor(private readonly homeworkService: HomeworkService) {}

  @Post()
  @ApiOperation({ summary: 'Giao bài (quiz/deck) cho lớp kèm deadline' })
  create(@Req() req: RequestWithUser, @Body() dto: CreateHomeworkDto) {
    return this.homeworkService.create(requireUserId(req), dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Danh sách BTVN (scope theo lớp của GV / cả school)',
  })
  @ApiQuery({ name: 'classId', required: false })
  @ApiQuery({ name: 'subjectId', required: false })
  list(
    @Req() req: RequestWithUser,
    @Query('classId') classId?: string,
    @Query('subjectId') subjectId?: string,
  ) {
    return this.homeworkService.listForStaff(
      requireUserId(req),
      classId,
      subjectId,
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Xóa BTVN (đầu điểm tự sinh bị cascade theo)' })
  remove(@Req() req: RequestWithUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.homeworkService.remove(requireUserId(req), id);
  }
}
