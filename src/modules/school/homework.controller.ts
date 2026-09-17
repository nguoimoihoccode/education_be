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
 * Reads carry no @Roles: `listForStaff` narrows to the classes the caller
 * actually teaches (`teacherClassIds` = homeroom + assignments, so a student
 * gets []) and every denial is a 404 (rule D1). Writes stay role-gated.
 * Học sinh đọc qua GET /me/homework; phụ huynh qua /parent.
 */
@ApiTags('school-homework')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('homework')
export class HomeworkController {
  constructor(private readonly homeworkService: HomeworkService) {}

  @Post()
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
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
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
  @ApiOperation({ summary: 'Xóa BTVN (đầu điểm tự sinh bị cascade theo)' })
  remove(@Req() req: RequestWithUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.homeworkService.remove(requireUserId(req), id);
  }
}
