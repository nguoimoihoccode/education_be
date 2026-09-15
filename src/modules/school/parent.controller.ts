import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RequestWithUser } from '../../common/types/auth.types';
import { requireUserId } from './school-http.util';
import { ParentLinkService } from './parent-link.service';
import { TimetableService } from './timetable.service';
import { AttendanceService } from './attendance.service';
import { GradesService } from './grades.service';
import { HomeworkService } from './homework.service';
import { ClaimInviteDto } from './dto/parent-link.dto';

/**
 * Parent portal (Phase 2, read side of design D5).
 * Intentionally WITHOUT @Roles: the invite code itself is the authorization —
 * a fresh account that only selected "phụ huynh" at registration has no
 * role yet. Every handler scopes strictly by the caller's own user id, so no
 * role is needed to prevent cross-user reads; `claimInvite` grants PARENT.
 */
@ApiTags('school-parent')
@ApiBearerAuth()
@Controller('parent')
export class ParentController {
  constructor(
    private readonly parentLinkService: ParentLinkService,
    private readonly timetableService: TimetableService,
    private readonly attendanceService: AttendanceService,
    private readonly gradesService: GradesService,
    private readonly homeworkService: HomeworkService,
  ) {}

  @Post('claim')
  @ApiOperation({ summary: 'Redeem an invite code from the class teacher' })
  claim(@Req() req: RequestWithUser, @Body() dto: ClaimInviteDto) {
    return this.parentLinkService.claimInvite(requireUserId(req), dto.code);
  }

  @Get('children')
  @ApiOperation({ summary: 'My children (pending + approved links)' })
  children(@Req() req: RequestWithUser) {
    return this.parentLinkService.listMyChildren(requireUserId(req));
  }

  @Get('children/:studentId')
  @ApiOperation({ summary: 'Child profile (approved links only)' })
  childProfile(
    @Req() req: RequestWithUser,
    @Param('studentId', ParseIntPipe) studentId: number,
  ) {
    return this.parentLinkService.getMyChildProfile(
      requireUserId(req),
      studentId,
    );
  }

  // ---------- Phase 3: what the parent may see about the child ----------

  @Get('children/:studentId/timetable')
  @ApiOperation({ summary: "Child's class timetable (approved links only)" })
  childTimetable(
    @Req() req: RequestWithUser,
    @Param('studentId', ParseIntPipe) studentId: number,
  ) {
    return this.timetableService.getChildTimetable(
      requireUserId(req),
      studentId,
    );
  }

  @Get('children/:studentId/attendance')
  @ApiOperation({ summary: "Child's attendance rows + rate (approved only)" })
  childAttendance(
    @Req() req: RequestWithUser,
    @Param('studentId', ParseIntPipe) studentId: number,
  ) {
    return this.attendanceService.getChildAttendance(
      requireUserId(req),
      studentId,
    );
  }

  // ---------- Phase 4: điểm + BTVN ----------

  @Get('children/:studentId/grades')
  @ApiOperation({ summary: "Child's gradebook (subject × term + averages)" })
  childGrades(
    @Req() req: RequestWithUser,
    @Param('studentId', ParseIntPipe) studentId: number,
  ) {
    return this.gradesService.getChildGrades(requireUserId(req), studentId);
  }

  @Get('children/:studentId/homework')
  @ApiOperation({ summary: "Child's homework list (approved links only)" })
  childHomework(
    @Req() req: RequestWithUser,
    @Param('studentId', ParseIntPipe) studentId: number,
  ) {
    return this.homeworkService.getChildHomework(requireUserId(req), studentId);
  }
}
