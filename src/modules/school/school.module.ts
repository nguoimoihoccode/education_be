import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SchoolController } from './school.controller';
import { ClassController } from './class.controller';
import { TeacherController } from './teacher.controller';
import { ParentController } from './parent.controller';
import { TimetableController } from './timetable.controller';
import { AttendanceController } from './attendance.controller';
import { GradesController } from './grades.controller';
import { HomeworkController } from './homework.controller';
import { MeController } from './me.controller';
import { SchoolService } from './school.service';
import { ClassService } from './school-class.service';
import { ParentLinkService } from './parent-link.service';
import { TimetableService } from './timetable.service';
import { AttendanceService } from './attendance.service';
import { GradesService } from './grades.service';
import { HomeworkService } from './homework.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UsersModule } from '../users/users.module';
import { ActivityLogModule } from '../activity-log/activity-log.module';
import { User } from '../users/entities/user.entity';
import { Quiz } from '../education/entities/quiz.entity';
import { FlashcardDeck } from '../education/entities/flashcard-deck.entity';
import {
  School,
  AcademicYear,
  Subject,
  SchoolClass,
  TeachingAssignment,
  ClassMembership,
  ParentLink,
  TimeSlot,
  AttendanceRecord,
  GradeEntry,
  HomeworkAssignment,
} from './entities';

@Module({
  imports: [
    UsersModule,
    ActivityLogModule,
    TypeOrmModule.forFeature([
      School,
      AcademicYear,
      Subject,
      SchoolClass,
      TeachingAssignment,
      ClassMembership,
      ParentLink,
      TimeSlot,
      AttendanceRecord,
      GradeEntry,
      HomeworkAssignment,
      User,
      // read-only: kiểm tra BTVN trỏ tới quiz/deck TỒN TẠI (không có
      // EducationModule import → không vòng tròn module)
      Quiz,
      FlashcardDeck,
    ]),
  ],
  controllers: [
    SchoolController,
    ClassController,
    TeacherController,
    ParentController,
    TimetableController,
    AttendanceController,
    GradesController,
    HomeworkController,
    MeController,
  ],
  providers: [
    SchoolService,
    ClassService,
    ParentLinkService,
    TimetableService,
    AttendanceService,
    GradesService,
    HomeworkService,
    RolesGuard,
  ],
  // HomeworkService được QuizSessionCompletionService (EducationModule)
  // inject cho cầu nối quiz→điểm; chiều ngược lại SchoolModule không
  // import EducationModule nên không có cycle.
  exports: [SchoolService, GradesService, HomeworkService],
})
export class SchoolModule {}
