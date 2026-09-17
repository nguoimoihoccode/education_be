import {
  Body,
  Controller,
  Get,
  ParseIntPipe,
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
import { AttendanceService } from './attendance.service';
import { TakeAttendanceDto } from './dto/timetable.dto';

/**
 * Attendance (Phase 3). Reads carry no @Roles on purpose: the service confines
 * them per class via `assertManageAccess` (GVCN / assigned teacher / principal
 * / ADMIN) and every denial is a 404 (rule D1), so the caller's *relationship*
 * to the class is the gate, not their role. Writes stay role-gated because
 * taking attendance is a staff action. Parents read via
 * /parent/children/:id/attendance.
 */
@ApiTags('school-attendance')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post('take')
  @Roles(UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES)
  @ApiOperation({ summary: 'Bulk upsert one session = whole class' })
  take(@Req() req: RequestWithUser, @Body() dto: TakeAttendanceDto) {
    return this.attendanceService.takeAttendance(requireUserId(req), dto);
  }

  @Get('session')
  @ApiOperation({ summary: 'Attendance sheet: roster + existing statuses' })
  @ApiQuery({ name: 'classId', required: true })
  @ApiQuery({ name: 'date', required: true, example: '2026-09-14' })
  @ApiQuery({ name: 'periodNumber', required: true, type: Number })
  session(
    @Req() req: RequestWithUser,
    @Query('classId') classId: string,
    @Query('date') date: string,
    @Query('periodNumber', ParseIntPipe) periodNumber: number,
  ) {
    return this.attendanceService.getSession(
      requireUserId(req),
      classId,
      date,
      periodNumber,
    );
  }

  @Get()
  @ApiOperation({ summary: 'Class history + rate summary over a date range' })
  @ApiQuery({ name: 'classId', required: true })
  @ApiQuery({ name: 'from', required: true, example: '2026-09-01' })
  @ApiQuery({ name: 'to', required: true, example: '2026-09-30' })
  history(
    @Req() req: RequestWithUser,
    @Query('classId') classId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.attendanceService.getClassHistory(
      requireUserId(req),
      classId,
      from,
      to,
    );
  }
}
