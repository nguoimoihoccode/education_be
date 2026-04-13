import { Injectable } from '@nestjs/common';
import { QuizService } from '../../education/quiz.service';
import { CreateQuizDto } from '../../education/dto/quiz.dto';
import {
  CreateQuizQuestionDto,
  BulkCreateQuizQuestionDto,
} from '../../education/dto/quiz-question.dto';
import { ContentGenerator } from './content-generator.abstract';
import {
  ContentType,
  ParsedDocumentData,
  GeneratedContentDto,
  QuestionType,
} from '../dto/document-conversion.dto';

@Injectable()
export class QuizGenerator extends ContentGenerator {
  constructor(private readonly quizService: QuizService) {
    super();
  }

  getContentType(): ContentType {
    return ContentType.QUIZZES;
  }

  canGenerate(data: ParsedDocumentData, options: any): boolean {
    const qaPairs = data.qaPairs || [];
    return (
      qaPairs.length > 0 && options.contentTypes?.includes(ContentType.QUIZZES)
    );
  }

  async generate(
    userId: number,
    data: ParsedDocumentData,
    options: any,
  ): Promise<GeneratedContentDto> {
    const qaPairs = data.qaPairs || [];
    if (qaPairs.length === 0) {
      return {
        contentType: ContentType.QUIZZES,
        name: 'No Quiz Questions',
        id: '',
        itemCount: 0,
      };
    }

    const topic = options.topic || data.metadata?.detectedTopic;

    const quizDto: CreateQuizDto = {
      name: options.quizName || `Quiz: ${topic || 'Generated'}`,
      description: `Generated from document with ${qaPairs.length} questions`,
      topic,
      questionType: options.quizQuestionType || 'MIXED',
      questionCount: qaPairs.length,
      timeLimit: options.quizTimeLimit || 600,
      passingScore: options.quizPassingScore || 70,
      difficulty: options.quizDifficulty || 'MIXED',
      isPublic: false,
      shuffleQuestions: true,
      shuffleAnswers: true,
      showCorrectAnswer: true,
      allowRetry: true,
      maxRetries: 3,
    };

    const quiz = await this.quizService.createQuiz(userId, quizDto);

    const questionDtos: CreateQuizQuestionDto[] = qaPairs.map((qa, index) => ({
      question: qa.question,
      type:
        qa.type === 'MULTIPLE_CHOICE' ||
        qa.type === 'TRUE_FALSE' ||
        qa.type === 'FILL_BLANK'
          ? qa.type
          : 'MULTIPLE_CHOICE',
      correctAnswer: qa.answer,
      explanation: qa.explanation,
      options: qa.options,
      points: qa.difficulty || 1,
      order: index,
    }));

    await this.quizService.bulkCreateQuizQuestions(userId, quiz.id, {
      questions: questionDtos,
    });

    return {
      contentType: ContentType.QUIZZES,
      name: quizDto.name,
      id: quiz.id,
      itemCount: qaPairs.length,
      createdItems: [],
      details: {
        quizId: quiz.id,
        questionCount: qaPairs.length,
        topic,
      },
    };
  }
}
