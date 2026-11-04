import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ASSESSMENT_ENTITIES } from './entities/assessment.entities';
import { AssessmentController } from './assessment.controller';
import { AssessmentService } from './assessment.service';
import { AssessmentRuntimeModule } from './runtime/assessment-runtime.module';
import { SchoolModule } from '../school/school.module';
import { UsersModule } from '../users/users.module';
import { RolesGuard } from '../../common/guards/roles.guard';
@Module({
  imports: [
    SchoolModule,
    // RolesGuard injects UsersService, so the module that provides the guard
    // must be able to resolve it. Without this Nest fails at bootstrap.
    UsersModule,
    AssessmentRuntimeModule,
    TypeOrmModule.forFeature(ASSESSMENT_ENTITIES),
  ],
  controllers: [AssessmentController],
  providers: [AssessmentService, RolesGuard],
  exports: [AssessmentService],
})
export class AssessmentModule {}
