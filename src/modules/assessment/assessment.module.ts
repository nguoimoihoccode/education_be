import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ASSESSMENT_ENTITIES } from './entities/assessment.entities';
import { AssessmentController } from './assessment.controller';
import { AssessmentService } from './assessment.service';
import { AssessmentRuntimeModule } from './runtime/assessment-runtime.module';
import { SchoolModule } from '../school/school.module';
import { RolesGuard } from '../../common/guards/roles.guard';
@Module({
  imports: [
    SchoolModule,
    AssessmentRuntimeModule,
    TypeOrmModule.forFeature(ASSESSMENT_ENTITIES),
  ],
  controllers: [AssessmentController],
  providers: [AssessmentService, RolesGuard],
  exports: [AssessmentService],
})
export class AssessmentModule {}
