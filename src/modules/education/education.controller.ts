import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { EducationService } from './education.service';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '../../common/enums/roles.enum';
import { Pagination } from '../../common/decorators/pagination.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import {
  GetCoursesDto,
  CreateCourseDto,
  UpdateCourseDto,
  CreateLessonDto,
  CompleteLessonDto,
  CreateVocabularyDto,
  ReviewVocabularyDto,
  CreateExerciseDto,
  SubmitExercisesDto,
} from './dto';

@Controller('education')
@UseGuards(RolesGuard)
export class EducationController {
  constructor(private readonly educationService: EducationService) {}

  // ==================== LANGUAGES (PUBLIC) ====================
  @Public()
  @Get('languages')
  async getLanguages() {
    return this.educationService.getLanguages();
  }

  @Public()
  @Get('languages/:id')
  async getLanguageById(@Param('id') id: string) {
    return this.educationService.getLanguageById(id);
  }

  // ==================== COURSES ====================
  @Public()
  @Get('courses')
  async getCourses(@Query() dto: GetCoursesDto) {
    return this.educationService.getCourses(dto);
  }

  @Public()
  @Get('courses/:id')
  async getCourseById(@Param('id') id: string) {
    return this.educationService.getCourseById(id);
  }

  // Teacher only: Create course
  @Post('courses')
  @Roles(UserRole.TEACHER, UserRole.EDUCATION_ADMIN, UserRole.ADMIN)
  async createCourse(@Body() dto: CreateCourseDto) {
    return this.educationService.createCourse(dto);
  }

  // Teacher only: Update course
  @Put('courses/:id')
  @Roles(UserRole.TEACHER, UserRole.EDUCATION_ADMIN, UserRole.ADMIN)
  async updateCourse(@Param('id') id: string, @Body() dto: UpdateCourseDto) {
    return this.educationService.updateCourse(id, dto);
  }

  // ==================== ENROLLMENT (STUDENT) ====================
  @Post('courses/:id/enroll')
  @Roles(UserRole.STUDENT, UserRole.USER)
  async enrollCourse(@Request() req: any, @Param('id') courseId: string) {
    return this.educationService.enrollCourse(req.user.id, courseId);
  }

  @Get('my-courses')
  async getMyCourses(@Request() req: any) {
    return this.educationService.getUserCourses(req.user.id);
  }

  // ==================== LESSONS ====================
  @Get('courses/:courseId/lessons')
  async getLessonsByCourse(
    @Param('courseId') courseId: string,
    @Pagination() pagination?: PaginationDto,
  ) {
    return this.educationService.getLessonsByCourse(
      courseId,
      pagination?.page,
      pagination?.limit,
    );
  }

  @Get('lessons/:id')
  async getLessonById(@Param('id') id: string) {
    return this.educationService.getLessonById(id);
  }

  // Teacher only: Create lesson
  @Post('lessons')
  @Roles(UserRole.TEACHER, UserRole.EDUCATION_ADMIN, UserRole.ADMIN)
  async createLesson(@Body() dto: CreateLessonDto) {
    return this.educationService.createLesson(dto);
  }

  // Student: Complete lesson
  @Post('lessons/:id/complete')
  async completeLesson(
    @Request() req: any,
    @Param('id') lessonId: string,
    @Body() dto: CompleteLessonDto,
  ) {
    return this.educationService.completeLesson(req.user.id, lessonId, dto);
  }

  // ==================== VOCABULARY ====================
  @Get('lessons/:lessonId/vocabulary')
  async getVocabularyByLesson(
    @Param('lessonId') lessonId: string,
    @Pagination() pagination?: PaginationDto,
  ) {
    return this.educationService.getVocabularyByLesson(
      lessonId,
      pagination?.page,
      pagination?.limit,
    );
  }

  // Teacher only: Create vocabulary
  @Post('vocabulary')
  @Roles(UserRole.TEACHER, UserRole.EDUCATION_ADMIN, UserRole.ADMIN)
  async createVocabulary(@Body() dto: CreateVocabularyDto) {
    return this.educationService.createVocabulary(dto);
  }

  // Student: Get vocabulary to review (SRS)
  @Get('vocabulary/review')
  async getVocabularyToReview(
    @Request() req: any,
    @Query('limit') limit?: number,
  ) {
    return this.educationService.getVocabularyToReview(req.user.id, limit);
  }

  // Student: Review vocabulary
  @Post('vocabulary/:id/review')
  async reviewVocabulary(
    @Request() req: any,
    @Param('id') vocabularyId: string,
    @Body() dto: ReviewVocabularyDto,
  ) {
    return this.educationService.reviewVocabulary(
      req.user.id,
      vocabularyId,
      dto,
    );
  }

  // ==================== EXERCISES ====================
  @Get('lessons/:lessonId/exercises')
  async getExercisesByLesson(@Param('lessonId') lessonId: string) {
    return this.educationService.getExercisesByLesson(lessonId);
  }

  // Teacher only: Create exercise
  @Post('exercises')
  @Roles(UserRole.TEACHER, UserRole.EDUCATION_ADMIN, UserRole.ADMIN)
  async createExercise(@Body() dto: CreateExerciseDto) {
    return this.educationService.createExercise(dto);
  }

  // Student: Submit exercises
  @Post('lessons/:lessonId/exercises/submit')
  async submitExercises(
    @Request() req: any,
    @Param('lessonId') lessonId: string,
    @Body() dto: SubmitExercisesDto,
  ) {
    return this.educationService.submitExercises(req.user.id, lessonId, dto);
  }

  // ==================== PROGRESS & STREAK ====================
  @Get('progress')
  async getUserProgress(@Request() req: any) {
    return this.educationService.getUserProgress(req.user.id);
  }

  @Get('streak')
  async getUserStreak(@Request() req: any) {
    return this.educationService.getUserStreak(req.user.id);
  }
}
