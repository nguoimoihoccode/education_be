import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Language,
  Course,
  Lesson,
  Vocabulary,
  Exercise,
  CourseLevel,
  LessonType,
  ExerciseType,
} from './entities';

@Injectable()
export class EducationSeederService implements OnModuleInit {
  private readonly logger = new Logger(EducationSeederService.name);

  constructor(
    @InjectRepository(Language)
    private languageRepository: Repository<Language>,
    @InjectRepository(Course)
    private courseRepository: Repository<Course>,
    @InjectRepository(Lesson)
    private lessonRepository: Repository<Lesson>,
    @InjectRepository(Vocabulary)
    private vocabularyRepository: Repository<Vocabulary>,
    @InjectRepository(Exercise)
    private exerciseRepository: Repository<Exercise>,
  ) {}

  async onModuleInit() {
    await this.seedLanguages();
    await this.seedCourses();
    await this.seedLessons();
  }

  private async seedLanguages() {
    const existingCount = await this.languageRepository.count();
    if (existingCount > 0) {
      this.logger.log('Languages already seeded, skipping...');
      return;
    }

    const languages = [
      {
        code: 'en',
        name: 'English',
        nativeName: 'English',
        flag: '🇺🇸',
        order: 1,
      },
      {
        code: 'ja',
        name: 'Japanese',
        nativeName: '日本語',
        flag: '🇯🇵',
        order: 2,
      },
      {
        code: 'ko',
        name: 'Korean',
        nativeName: '한국어',
        flag: '🇰🇷',
        order: 3,
      },
      { code: 'zh', name: 'Chinese', nativeName: '中文', flag: '🇨🇳', order: 4 },
      {
        code: 'vi',
        name: 'Vietnamese',
        nativeName: 'Tiếng Việt',
        flag: '🇻🇳',
        order: 5,
      },
    ];

    await this.languageRepository.save(languages);
    this.logger.log('Languages seeded successfully!');
  }

  private async seedCourses() {
    const existingCount = await this.courseRepository.count();
    if (existingCount > 0) {
      this.logger.log('Courses already seeded, skipping...');
      return;
    }

    const english = await this.languageRepository.findOne({
      where: { code: 'en' },
    });
    const japanese = await this.languageRepository.findOne({
      where: { code: 'ja' },
    });

    if (!english || !japanese) {
      this.logger.warn('Languages not found, skipping course seeding');
      return;
    }

    const courses = [
      // English Courses
      {
        title: 'English for Beginners',
        description:
          'Start your English journey with basic vocabulary and grammar. Perfect for absolute beginners.',
        shortDescription: 'Learn basic English from scratch',
        level: CourseLevel.BEGINNER,
        estimatedHours: 20,
        languageId: english.id,
        free: true,
        order: 1,
      },
      {
        title: 'Everyday English Conversations',
        description:
          'Master common phrases and expressions used in daily conversations.',
        shortDescription: 'Speak English confidently in daily life',
        level: CourseLevel.ELEMENTARY,
        estimatedHours: 15,
        languageId: english.id,
        free: true,
        order: 2,
      },
      {
        title: 'Business English',
        description:
          'Professional English for workplace communication, meetings, and presentations.',
        shortDescription: 'English for professional settings',
        level: CourseLevel.INTERMEDIATE,
        estimatedHours: 25,
        languageId: english.id,
        free: false,
        price: 29.99,
        order: 3,
      },
      // Japanese Courses
      {
        title: 'Hiragana & Katakana Mastery',
        description:
          'Learn to read and write Japanese syllabaries. Essential foundation for Japanese learning.',
        shortDescription: 'Master Japanese writing systems',
        level: CourseLevel.BEGINNER,
        estimatedHours: 10,
        languageId: japanese.id,
        free: true,
        order: 1,
      },
      {
        title: 'JLPT N5 Preparation',
        description:
          'Comprehensive preparation for JLPT N5 exam with vocabulary, grammar, and practice tests.',
        shortDescription: 'Pass JLPT N5 with confidence',
        level: CourseLevel.BEGINNER,
        estimatedHours: 40,
        languageId: japanese.id,
        free: false,
        price: 49.99,
        order: 2,
      },
    ];

    await this.courseRepository.save(courses);
    this.logger.log('Courses seeded successfully!');
  }

  private async seedLessons() {
    const existingCount = await this.lessonRepository.count();
    if (existingCount > 0) {
      this.logger.log('Lessons already seeded, skipping...');
      return;
    }

    const beginnerEnglish = await this.courseRepository.findOne({
      where: { title: 'English for Beginners' },
    });

    if (!beginnerEnglish) {
      this.logger.warn(
        'Beginner English course not found, skipping lesson seeding',
      );
      return;
    }

    const lessons = [
      {
        title: 'Greetings & Introductions',
        description:
          'Learn how to greet people and introduce yourself in English.',
        content: `
# Greetings & Introductions

## Common Greetings
- **Hello** - A formal greeting
- **Hi** - An informal greeting
- **Good morning** - Used before noon
- **Good afternoon** - Used after noon until evening
- **Good evening** - Used in the evening

## Introducing Yourself
- "My name is [name]."
- "I'm [name]."
- "Nice to meet you!"

## Practice
Try saying these phrases out loud!
        `,
        type: LessonType.VOCABULARY,
        estimatedMinutes: 15,
        courseId: beginnerEnglish.id,
        orderIndex: 1,
      },
      {
        title: 'Numbers 1-20',
        description: 'Learn to count from 1 to 20 in English.',
        content: `
# Numbers 1-20

## Basic Numbers
| Number | Word |
|--------|------|
| 1 | One |
| 2 | Two |
| 3 | Three |
| 4 | Four |
| 5 | Five |
| 6 | Six |
| 7 | Seven |
| 8 | Eight |
| 9 | Nine |
| 10 | Ten |

## Teens
| Number | Word |
|--------|------|
| 11 | Eleven |
| 12 | Twelve |
| 13 | Thirteen |
| 14 | Fourteen |
| 15 | Fifteen |
| 16 | Sixteen |
| 17 | Seventeen |
| 18 | Eighteen |
| 19 | Nineteen |
| 20 | Twenty |
        `,
        type: LessonType.VOCABULARY,
        estimatedMinutes: 20,
        courseId: beginnerEnglish.id,
        orderIndex: 2,
      },
      {
        title: 'Days of the Week',
        description: 'Learn the days of the week in English.',
        type: LessonType.VOCABULARY,
        estimatedMinutes: 10,
        courseId: beginnerEnglish.id,
        orderIndex: 3,
      },
    ];

    const savedLessons = await this.lessonRepository.save(lessons);

    // Update course total lessons
    await this.courseRepository.update(beginnerEnglish.id, {
      totalLessons: savedLessons.length,
    });

    // Seed vocabulary for first lesson
    const greetingsLesson = savedLessons[0];
    const vocabularies = [
      {
        word: 'Hello',
        meaning: 'Xin chào',
        pronunciation: '/həˈloʊ/',
        partOfSpeech: 'interjection',
        example: 'Hello, how are you?',
        exampleTranslation: 'Xin chào, bạn khỏe không?',
        lessonId: greetingsLesson.id,
        orderIndex: 1,
      },
      {
        word: 'Goodbye',
        meaning: 'Tạm biệt',
        pronunciation: '/ˌɡʊdˈbaɪ/',
        partOfSpeech: 'interjection',
        example: 'Goodbye, see you tomorrow!',
        exampleTranslation: 'Tạm biệt, hẹn gặp lại ngày mai!',
        lessonId: greetingsLesson.id,
        orderIndex: 2,
      },
      {
        word: 'Thank you',
        meaning: 'Cảm ơn',
        pronunciation: '/θæŋk juː/',
        partOfSpeech: 'phrase',
        example: 'Thank you for your help.',
        exampleTranslation: 'Cảm ơn bạn đã giúp đỡ.',
        lessonId: greetingsLesson.id,
        orderIndex: 3,
      },
      {
        word: 'Please',
        meaning: 'Làm ơn',
        pronunciation: '/pliːz/',
        partOfSpeech: 'adverb',
        example: 'Please sit down.',
        exampleTranslation: 'Làm ơn ngồi xuống.',
        lessonId: greetingsLesson.id,
        orderIndex: 4,
      },
      {
        word: 'Excuse me',
        meaning: 'Xin lỗi (để hỏi)',
        pronunciation: '/ɪkˈskjuːz miː/',
        partOfSpeech: 'phrase',
        example: 'Excuse me, where is the station?',
        exampleTranslation: 'Xin lỗi, nhà ga ở đâu?',
        lessonId: greetingsLesson.id,
        orderIndex: 5,
      },
    ];

    await this.vocabularyRepository.save(vocabularies);

    // Seed exercises for first lesson
    const exercises = [
      {
        type: ExerciseType.MULTIPLE_CHOICE,
        question: 'What does "Hello" mean in Vietnamese?',
        options: ['Tạm biệt', 'Xin chào', 'Cảm ơn', 'Xin lỗi'],
        answer: 'Xin chào',
        explanation: '"Hello" là lời chào thông dụng trong tiếng Anh.',
        points: 10,
        lessonId: greetingsLesson.id,
        orderIndex: 1,
      },
      {
        type: ExerciseType.MULTIPLE_CHOICE,
        question: 'Which phrase means "Thank you"?',
        options: ['Please', 'Hello', 'Thank you', 'Goodbye'],
        answer: 'Thank you',
        explanation: '"Thank you" nghĩa là "Cảm ơn".',
        points: 10,
        lessonId: greetingsLesson.id,
        orderIndex: 2,
      },
      {
        type: ExerciseType.FILL_BLANK,
        question: 'Complete: "_____, how are you?"',
        options: null,
        answer: 'Hello',
        explanation: 'Câu chào hỏi thông dụng: "Hello, how are you?"',
        points: 15,
        lessonId: greetingsLesson.id,
        orderIndex: 3,
      },
    ];

    await this.exerciseRepository.save(exercises);

    this.logger.log(
      'Lessons, vocabularies, and exercises seeded successfully!',
    );
  }
}
