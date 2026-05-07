import { Injectable } from '@nestjs/common';
import { EducationService } from '../../education/education.service';
import { CreateVocabularyDto } from '../../education/dto/vocabulary.dto';
import { CreateCourseDto } from '../../education/dto/course.dto';
import { CreateLessonDto } from '../../education/dto/lesson.dto';
import { CourseLevel } from '../../education/entities/course.entity';
import { LessonType } from '../../education/entities/lesson.entity';
import { ContentGenerator } from './content-generator.abstract';
import {
  ContentType,
  ParsedDocumentData,
  GeneratedContentDto,
} from '../dto/document-conversion.dto';

@Injectable()
export class VocabularyGenerator extends ContentGenerator {
  constructor(private readonly educationService: EducationService) {
    super();
  }

  getContentType(): ContentType {
    return ContentType.VOCABULARY;
  }

  canGenerate(data: ParsedDocumentData, options: any): boolean {
    const vocabItems = data.vocabulary || [];
    return (
      vocabItems.length > 0 &&
      options.contentTypes?.includes(ContentType.VOCABULARY)
    );
  }

  async generate(
    userId: number,
    data: ParsedDocumentData,
    options: any,
  ): Promise<GeneratedContentDto> {
    void userId;
    const vocabItems = data.vocabulary || [];
    if (vocabItems.length === 0) {
      return {
        contentType: ContentType.VOCABULARY,
        name: 'No Vocabulary',
        id: '',
        itemCount: 0,
      };
    }

    const maxItems = options.maxVocabulary || vocabItems.length;
    const itemsToCreate = vocabItems.slice(0, maxItems);
    const languageId = await this.educationService.resolveLanguageId(
      options.language,
    );

    // Create a default course to hold the vocabulary lesson
    const courseDto: CreateCourseDto = {
      title:
        options.courseName ||
        `Vocabulary Course - ${data.metadata?.detectedTopic || 'General'}`,
      description: 'Auto-generated course for vocabulary',
      level: CourseLevel.BEGINNER,
      languageId,
    };
    const course = await this.educationService.createCourse(courseDto);

    // Create a lesson within the course
    const lessonDto: CreateLessonDto = {
      title: `Vocabulary - ${data.metadata?.detectedTopic || 'General'}`,
      content: '',
      courseId: course.id,
      type: LessonType.VOCABULARY,
    };
    const lesson = await this.educationService.createLesson(lessonDto);
    const lessonId = lesson.id;

    // Map vocabulary items to DTOs
    const dtos: CreateVocabularyDto[] = itemsToCreate.map((item) => ({
      word: item.word,
      meaning: item.definition || '',
      pronunciation: item.pronunciation,
      example: item.example,
      exampleTranslation: item.exampleTranslation,
      partOfSpeech: item.partOfSpeech,
      difficulty: item.difficulty || 1,
      tags: item.tags,
      lessonId,
    }));

    // Create vocabulary items
    const createdVocabulary = [];
    for (const dto of dtos) {
      const vocab = await this.educationService.createVocabulary(dto);
      createdVocabulary.push(vocab);
    }

    return {
      contentType: ContentType.VOCABULARY,
      name: `Vocabulary - ${data.metadata?.detectedTopic || 'General'}`,
      id: course.id,
      itemCount: createdVocabulary.length,
      createdItems: createdVocabulary.map((v) => v.id),
      details: {
        totalRequested: vocabItems.length,
        totalCreated: createdVocabulary.length,
        courseId: course.id,
        lessonId: lesson.id,
      },
    };
  }
}
