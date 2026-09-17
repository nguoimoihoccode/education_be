import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
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
import { SCHOOL_ADMIN_ROLES } from '../../common/enums/roles.enum';
import { TimetableService } from './timetable.service';
import {
  CreateTimetableSlotDto,
  ValidateTimetableDto,
} from './dto/timetable.dto';

/**
 * Time table (Phase 3). Roles are per-handler. Reads carry no @Roles: the
 * service gates them by relationship instead — `getTimetableForClass` allows
 * only staff of that class, and `getMyTimetable` returns the default grid for
 * a teacher whose school does not resolve and 404s for a caller with no
 * membership — so the relationship is what confines the data. Writes stay
 * principal/ADMIN (plan §3.3). Cross-tenant and unauthorized access both
 * surface as 404 from the service (rule D1).
 */
@ApiTags('school-timetable')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('timetable')
export class TimetableController {
  constructor(private readonly timetableService: TimetableService) {}

  @Get()
  @ApiOperation({ summary: 'Weekly grid of one class (staff of that class)' })
  @ApiQuery({ name: 'classId', required: true })
  forClass(@Req() req: RequestWithUser, @Query('classId') classId: string) {
    return this.timetableService.getTimetableForClass(
      requireUserId(req),
      classId,
    );
  }

  @Get('me')
  @ApiOperation({ summary: 'My timetable (teacher slots / student class)' })
  me(@Req() req: RequestWithUser) {
    return this.timetableService.getMyTimetable(requireUserId(req));
  }

  @Post('slots')
  @Roles(...SCHOOL_ADMIN_ROLES)
  @ApiOperation({ summary: 'Add a slot (409 on teacher/room/class conflict)' })
  createSlot(@Req() req: RequestWithUser, @Body() dto: CreateTimetableSlotDto) {
    return this.timetableService.createSlot(requireUserId(req), dto);
  }

  @Delete('slots/:id')
  @Roles(...SCHOOL_ADMIN_ROLES)
  @ApiOperation({ summary: 'Remove a slot' })
  async removeSlot(@Req() req: RequestWithUser, @Param('id') id: string) {
    await this.timetableService.deleteSlot(requireUserId(req), id);
    return { success: true };
  }

  @Post('validate')
  @Roles(...SCHOOL_ADMIN_ROLES)
  @ApiOperation({ summary: 'Conflict-check a proposed grid without saving' })
  validate(@Req() req: RequestWithUser, @Body() dto: ValidateTimetableDto) {
    return this.timetableService.validate(requireUserId(req), dto);
  }
}
