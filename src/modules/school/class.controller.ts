import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
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
import { ClassService } from './school-class.service';
import {
  CreateClassDto,
  UpdateClassDto,
  AddStudentsDto,
} from './dto/class.dto';

/**
 * Classes and rosters. Keeps @Roles at the CLASS level on purpose, unlike the
 * read-open controllers: `ClassService.getClass` resolves the caller's school
 * and then looks the class up by `{ id, schoolId }` with no per-object
 * relationship check, so relaxing this would let any member of the school read
 * any class -- and `GET /school/classes/:id/students` returns the roster
 * including every student's email (school-class.service.ts listStudents).
 * Do NOT relax this to match the read-open controllers.
 */
@ApiTags('school-classes')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(...SCHOOL_ADMIN_ROLES)
@Controller('school/classes')
export class ClassController {
  constructor(private readonly classService: ClassService) {}

  @Get()
  list(@Req() req: RequestWithUser) {
    return this.classService.listClasses(requireUserId(req));
  }

  @Post()
  create(@Req() req: RequestWithUser, @Body() dto: CreateClassDto) {
    return this.classService.createClass(requireUserId(req), dto);
  }

  @Get(':id')
  detail(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.classService.getClass(requireUserId(req), id);
  }

  @Patch(':id')
  update(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateClassDto,
  ) {
    return this.classService.updateClass(requireUserId(req), id, dto);
  }

  @Delete(':id')
  async remove(@Req() req: RequestWithUser, @Param('id') id: string) {
    await this.classService.deleteClass(requireUserId(req), id);
    return { success: true };
  }

  // ---------- roster ----------

  @Get(':id/students')
  @ApiOperation({ summary: 'Active students of the class' })
  students(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.classService.listStudents(requireUserId(req), id);
  }

  @Post(':id/students')
  @ApiOperation({
    summary:
      'Bulk add students by email (creates temporary STUDENT accounts for unknown emails)',
  })
  addStudents(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: AddStudentsDto,
  ) {
    return this.classService.addStudents(requireUserId(req), id, dto);
  }

  @Delete(':id/students/:studentId')
  async removeStudent(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Param('studentId', ParseIntPipe) studentId: number,
  ) {
    await this.classService.removeStudent(requireUserId(req), id, studentId);
    return { success: true };
  }
}
