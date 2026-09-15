import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RequestWithUser } from '../../common/types/auth.types';
import { requireUserId } from './school-http.util';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { SCHOOL_ADMIN_ROLES } from '../../common/enums/roles.enum';
import { SchoolService } from './school.service';
import { ClassService } from './school-class.service';
import {
  CreateSchoolDto,
  UpdateSchoolDto,
  CreateAcademicYearDto,
  UpdateAcademicYearDto,
  CreateSubjectDto,
  UpdateSubjectDto,
  UpdatePeriodConfigDto,
} from './dto/school-config.dto';
import { CreateAssignmentDto } from './dto/class.dto';

@ApiTags('school')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(...SCHOOL_ADMIN_ROLES)
@Controller('school')
export class SchoolController {
  constructor(
    private readonly schoolService: SchoolService,
    private readonly classService: ClassService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a school (caller becomes principal)' })
  createSchool(@Req() req: RequestWithUser, @Body() dto: CreateSchoolDto) {
    return this.schoolService.createSchool(dto, requireUserId(req));
  }

  @Get('me')
  @ApiOperation({ summary: 'School of the current user' })
  getMySchool(@Req() req: RequestWithUser) {
    return this.schoolService.getMySchool(requireUserId(req));
  }

  @Patch('me')
  updateSchool(@Req() req: RequestWithUser, @Body() dto: UpdateSchoolDto) {
    return this.schoolService.updateSchool(requireUserId(req), dto);
  }

  @Patch('period-config')
  @ApiOperation({ summary: 'Timetable grid shape: periods/day + days/week' })
  updatePeriodConfig(
    @Req() req: RequestWithUser,
    @Body() dto: UpdatePeriodConfigDto,
  ) {
    return this.schoolService.updatePeriodConfig(requireUserId(req), dto);
  }

  @Get('stats')
  getStats(@Req() req: RequestWithUser) {
    return this.schoolService.getStats(requireUserId(req));
  }

  @Get('teachers')
  listTeachers(@Req() req: RequestWithUser) {
    return this.schoolService.listTeachers(requireUserId(req));
  }

  // ---------- academic years ----------

  @Get('academic-years')
  listAcademicYears(@Req() req: RequestWithUser) {
    return this.schoolService.listAcademicYears(requireUserId(req));
  }

  @Post('academic-years')
  createAcademicYear(
    @Req() req: RequestWithUser,
    @Body() dto: CreateAcademicYearDto,
  ) {
    return this.schoolService.createAcademicYear(requireUserId(req), dto);
  }

  @Patch('academic-years/:id')
  updateAcademicYear(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateAcademicYearDto,
  ) {
    return this.schoolService.updateAcademicYear(requireUserId(req), id, dto);
  }

  @Post('academic-years/:id/activate')
  activateAcademicYear(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.schoolService
      .resolveSchoolIdForUser(requireUserId(req))
      .then((schoolId) =>
        this.schoolService.setActiveAcademicYear(schoolId, id),
      );
  }

  // ---------- subjects ----------

  @Get('subjects')
  listSubjects(@Req() req: RequestWithUser) {
    return this.schoolService.listSubjects(requireUserId(req));
  }

  @Post('subjects')
  createSubject(@Req() req: RequestWithUser, @Body() dto: CreateSubjectDto) {
    return this.schoolService.createSubject(requireUserId(req), dto);
  }

  @Patch('subjects/:id')
  updateSubject(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateSubjectDto,
  ) {
    return this.schoolService.updateSubject(requireUserId(req), id, dto);
  }

  @Delete('subjects/:id')
  async deleteSubject(@Req() req: RequestWithUser, @Param('id') id: string) {
    await this.schoolService.deleteSubject(requireUserId(req), id);
    return { success: true };
  }

  // ---------- teaching assignments ----------

  @Get('assignments')
  listAssignments(@Req() req: RequestWithUser) {
    return this.classService.listAssignments(requireUserId(req));
  }

  @Post('assignments')
  createAssignment(
    @Req() req: RequestWithUser,
    @Body() dto: CreateAssignmentDto,
  ) {
    return this.classService.createAssignment(requireUserId(req), dto);
  }

  @Delete('assignments/:id')
  async deleteAssignment(@Req() req: RequestWithUser, @Param('id') id: string) {
    await this.classService.deleteAssignment(requireUserId(req), id);
    return { success: true };
  }
}
