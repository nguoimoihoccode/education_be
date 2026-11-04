import { Module } from '@nestjs/common';
import { ASSESSMENT_STORAGE } from '../assessment.ports';
import { AssessmentStorage } from './storage';
@Module({
  providers: [
    AssessmentStorage,
    { provide: ASSESSMENT_STORAGE, useExisting: AssessmentStorage },
  ],
  exports: [ASSESSMENT_STORAGE, AssessmentStorage],
})
export class AssessmentRuntimeModule {}
