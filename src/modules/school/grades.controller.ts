import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  ParseIntPipe,
  Patch,
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
import {
  GradesService,
  ListGradesQuery,
  ClassRankingQuery,
} from './grades.service';
import { CreateGradeDto, UpdateGradeDto } from './dto/grade.dto';

/**
 * Sổ điểm (Phase 4). Guard liệt kê các role có thể vào; service check theo
 * lớp × môn (GVCN / GV được phân công môn đó / hiệu trưởng / ADMIN) và mọi
 * denial là 404 (rule D1). Parent đọc qua /parent/children/:id/grades.
 */
@ApiTags('school-grades')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(UserRole.TEACHER, UserRole.STUDENT, ...SCHOOL_ADMIN_ROLES)
@Controller('grades')
export class GradesController {
  constructor(private readonly gradesService: GradesService) {}

  @Post()
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
  @ApiOperation({ summary: 'Thêm một đầu điểm vào sổ điểm' })
  create(@Req() req: RequestWithUser, @Body() dto: CreateGradeDto) {
    return this.gradesService.create(requireUserId(req), dto);
  }

  @Patch(':id')
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
  @ApiOperation({ summary: 'Sửa một đầu điểm' })
  update(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGradeDto,
  ) {
    return this.gradesService.update(requireUserId(req), id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
  @ApiOperation({ summary: 'Xóa một đầu điểm' })
  remove(@Req() req: RequestWithUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.gradesService.remove(requireUserId(req), id);
  }

  @Get()
  @ApiOperation({ summary: 'Danh sách đầu điểm (scope theo role)' })
  @ApiQuery({ name: 'classId', required: false })
  @ApiQuery({ name: 'subjectId', required: false })
  @ApiQuery({ name: 'studentId', required: false, type: Number })
  @ApiQuery({ name: 'term', required: false, type: Number })
  list(
    @Req() req: RequestWithUser,
    @Query('classId') classId?: string,
    @Query('subjectId') subjectId?: string,
    @Query('studentId', new ParseIntPipe({ optional: true }))
    studentId?: number,
    @Query('term', new ParseIntPipe({ optional: true })) term?: number,
  ) {
    const query: ListGradesQuery = {};
    if (classId) query.classId = classId;
    if (subjectId) query.subjectId = subjectId;
    if (studentId !== undefined && studentId !== null)
      query.studentId = studentId;
    if (term !== undefined && term !== null) query.term = term;
    return this.gradesService.list(requireUserId(req), query);
  }

  @Get('ranking')
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
  @ApiOperation({
    summary:
      'Xếp hạng điểm học sinh trong lớp (subjectId bỏ trống = xếp hạng toàn lớp)',
  })
  @ApiQuery({ name: 'classId', required: true })
  @ApiQuery({ name: 'subjectId', required: false })
  @ApiQuery({ name: 'term', required: false, type: Number })
  ranking(
    @Req() req: RequestWithUser,
    @Query('classId', new ParseUUIDPipe({ optional: true }))
    classId?: string,
    @Query('subjectId', new ParseUUIDPipe({ optional: true }))
    subjectId?: string,
    @Query('term', new ParseIntPipe({ optional: true })) term?: number,
  ) {
    if (!classId) throw new BadRequestException('classId is required');
    const query: ClassRankingQuery = { classId };
    if (subjectId) query.subjectId = subjectId;
    if (term !== undefined && term !== null) query.term = term;
    return this.gradesService.getClassRanking(requireUserId(req), query);
  }

  @Get('report')
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
  @ApiOperation({ summary: 'Bảng điểm lớp × môn: HS × đầu điểm + TB' })
  @ApiQuery({ name: 'classId', required: true })
  @ApiQuery({ name: 'subjectId', required: true })
  @ApiQuery({ name: 'term', required: false, type: Number })
  report(
    @Req() req: RequestWithUser,
    @Query('classId') classId: string,
    @Query('subjectId') subjectId: string,
    @Query('term', new ParseIntPipe({ optional: true })) term?: number,
  ) {
    return this.gradesService.getReport(
      requireUserId(req),
      classId,
      subjectId,
      term ?? undefined,
    );
  }

  @Get('me')
  @ApiOperation({ summary: 'Điểm của chính mình (học sinh)' })
  me(@Req() req: RequestWithUser) {
    return this.gradesService.getMyGrades(requireUserId(req));
  }
}
