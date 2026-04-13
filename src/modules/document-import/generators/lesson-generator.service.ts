import { Injectable } from '@nestjs/common';
import { EducationService } from '../../education/education.service';
import { CreateCourseDto } from '../../education/dto/course.dto';
import { CreateLessonDto } from '../../education/dto/lesson.dto';
import { CreateExerciseDto } from '../../education/dto/exercise.dto';
import { CourseLevel } from '../../education/entities/course.entity';
import { LessonType } from '../../education/entities/lesson.entity';
import { ExerciseType } from '../../education/entities/exercise.entity';
import { ContentGenerator } from './content-generator.abstract';
import {
  ContentType,
  ParsedDocumentData,
  GeneratedContentDto,
} from '../dto/document-conversion.dto';

@Injectable()
export class LessonGenerator extends ContentGenerator {
  constructor(private readonly educationService: EducationService) {
    super();
  }

  getContentType(): ContentType {
    return ContentType.LESSONS;
  }

  canGenerate(data: ParsedDocumentData, options: any): boolean {
    const lessons = data.lessons || [];
    return (
      lessons.length > 0 &&
      (options.contentTypes?.includes(ContentType.LESSONS) ||
        options.contentTypes?.includes(ContentType.COURSES))
    );
  }

  async generate(
    userId: number,
    data: ParsedDocumentData,
    options: any,
  ): Promise<GeneratedContentDto> {
    const lessons = data.lessons || [];
    if (lessons.length === 0) {
      return {
        contentType: ContentType.LESSONS,
        name: 'No Lessons',
        id: '',
        itemCount: 0,
      };
    }

    const courseName =
      options.courseName || data.courseOutline?.title || 'Generated Course';

    const courseDto: CreateCourseDto = {
      title: courseName,
      description:
        data.courseOutline?.description ||
        'Automatically generated from document',
      level: CourseLevel.BEGINNER,
      languageId: '1',
    };

    const course = await this.educationService.createCourse(courseDto);

    const lessonIds: string[] = [];

    for (const parsedLesson of lessons) {
      const lessonDto: CreateLessonDto = {
        title: parsedLesson.title,
        content: parsedLesson.content,
        courseId: course.id,
        type: LessonType.VOCABULARY,
      };

      const lesson = await this.educationService.createLesson(lessonDto);
      lessonIds.push(lesson.id);

      if (parsedLesson.exercises && parsedLesson.exercises.length > 0) {
        for (const ex of parsedLesson.exercises) {
          const exerciseDto: CreateExerciseDto = {
            lessonId: lesson.id,
            type:
              ex.type === 'TRUE_FALSE'
                ? ExerciseType.TRUE_FALSE
                : ex.type === 'FILL_BLANK'
                  ? ExerciseType.FILL_BLANK
                  : ExerciseType.MULTIPLE_CHOICE,
            question: ex.question,
            answer: ex.answer,
            explanation: ex.explanation,
            options: ex.options,
            points: ex.difficulty || 1,
          };
          await this.educationService.createExercise(exerciseDto);
        }
      }
    }

    return {
      contentType: ContentType.LESSONS,
      name: courseName,
      id: course.id,
      itemCount: lessons.length,
      createdItems: lessonIds,
      details: {
        courseId: course.id,
        courseName: course.title,
        lessonCount: lessons.length,
      },
    };
  }
}
