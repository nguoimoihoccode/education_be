import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Quiz, QuizQuestion, Flashcard } from '../entities';
import { CreateQuizQuestionDto, GenerateQuizFromFlashcardsDto } from '../dto';
import { AiService } from '../../ai/ai.service';

@Injectable()
export class QuizGenerationService {
  constructor(
    @InjectRepository(Quiz)
    private readonly quizRepository: Repository<Quiz>,
    @InjectRepository(QuizQuestion)
    private readonly quizQuestionRepository: Repository<QuizQuestion>,
    @InjectRepository(Flashcard)
    private readonly flashcardRepository: Repository<Flashcard>,
    private readonly aiService: AiService,
  ) {}

  // ==================== Generate Quiz from Flashcards ====================

  async generateQuizFromFlashcards(
    userId: number,
    dto: GenerateQuizFromFlashcardsDto,
  ) {
    // Get flashcards based on topic and deck
    const flashcards = await this.getRandomFlashcards(
      userId,
      dto.topic,
      dto.deckId,
      dto.questionCount || 10,
      dto.difficulty,
    );

    if (flashcards.length === 0) {
      throw new BadRequestException(
        'No flashcards found matching the criteria',
      );
    }

    // Create quiz
    const quiz = this.quizRepository.create({
      name: dto.name,
      topic: dto.topic,
      questionType: dto.questionType || 'MIXED',
      questionCount: flashcards.length,
      timeLimit: dto.timeLimit || 60,
      difficulty: dto.difficulty || 'MIXED',
      userId,
      isPublic: false,
      shuffleQuestions: true,
      shuffleAnswers: true,
      showCorrectAnswer: false,
      allowRetry: true,
      maxRetries: 3,
    });

    const savedQuiz = await this.quizRepository.save(quiz);

    // Generate questions from flashcards
    const created = [];
    for (let i = 0; i < flashcards.length; i++) {
      const flashcard = flashcards[i];
      const questionType = this.getQuestionType(
        dto.questionType || 'MIXED',
        i,
        flashcards.length,
      );

      let questionData: Partial<CreateQuizQuestionDto>;

      switch (questionType) {
        case 'MULTIPLE_CHOICE':
          questionData = await this.generateMultipleChoiceQuestion(flashcard);
          break;
        case 'TRUE_FALSE':
          questionData = await this.generateTrueFalseQuestion(flashcard);
          break;
        case 'FILL_BLANK':
          questionData = this.generateFillBlankQuestion(flashcard);
          break;
        default:
          questionData = await this.generateMultipleChoiceQuestion(flashcard);
      }

      const question = this.quizQuestionRepository.create({
        ...questionData,
        quizId: savedQuiz.id,
        order: i,
        flashcardId: flashcard.id,
      });

      const saved = await this.quizQuestionRepository.save(question);
      created.push(saved);
    }

    return {
      quiz: savedQuiz,
      questions: created,
      total: created.length,
    };
  }

  async generateMultipleChoiceQuestion(
    flashcard: Flashcard,
  ): Promise<Partial<CreateQuizQuestionDto>> {
    const aiResult = await this.tryAiMcqDistractors(flashcard);
    const wrongAnswers =
      aiResult?.distractors ??
      (await this.getRandomWrongAnswers(flashcard.back, 3));
    const options = this.shuffleArray([flashcard.back, ...wrongAnswers]);
    const explanation =
      aiResult?.explanation ||
      flashcard.example ||
      `The correct answer is "${flashcard.back}"`;

    return {
      question: `What is the meaning of "${flashcard.front}"?`,
      type: 'MULTIPLE_CHOICE',
      options,
      correctAnswer: flashcard.back,
      explanation,
      points: 1,
    };
  }

  private async tryAiMcqDistractors(
    flashcard: Flashcard,
  ): Promise<{ distractors: string[]; explanation: string } | null> {
    try {
      const data = await this.aiService.completeJson<{
        distractors: string[];
        explanation: string;
      }>({
        system:
          'You write multiple-choice language quiz items. Return JSON {"distractors":[string,string,string],"explanation":string}. Distractors must be plausible wrong answers of similar type/length, not the correct answer.',
        user: JSON.stringify({
          term: flashcard.front,
          correctMeaning: flashcard.back,
          example: flashcard.example,
        }),
      });

      const correct = (flashcard.back || '').trim().toLowerCase();
      const distractors = (
        Array.isArray(data?.distractors) ? data.distractors : []
      )
        .map((d) => (typeof d === 'string' ? d.trim() : ''))
        .filter((d) => d.length > 0 && d.toLowerCase() !== correct);

      if (distractors.length !== 3) {
        return null;
      }

      const explanation =
        typeof data?.explanation === 'string' ? data.explanation.trim() : '';

      return {
        distractors,
        explanation,
      };
    } catch {
      return null;
    }
  }

  private async generateTrueFalseQuestion(
    flashcard: Flashcard,
  ): Promise<Partial<CreateQuizQuestionDto>> {
    const isCorrect = Math.random() > 0.5;
    const wrongAnswer = await this.getRandomWrongAnswer(flashcard.back);
    const statement = isCorrect
      ? `"${flashcard.front}" means "${flashcard.back}"`
      : `"${flashcard.front}" means "${wrongAnswer}"`;

    return {
      question: `True or False: ${statement}?`,
      type: 'TRUE_FALSE',
      options: ['True', 'False'],
      correctAnswer: isCorrect ? 'True' : 'False',
      explanation: flashcard.example,
      points: 1,
    };
  }

  private generateFillBlankQuestion(
    flashcard: Flashcard,
  ): Partial<CreateQuizQuestionDto> {
    const example =
      flashcard.example || `This is a ${flashcard.front} example.`;
    const blankedExample = example.replace(flashcard.front, '_____');

    return {
      question: `Fill in the blank: ${blankedExample}`,
      type: 'FILL_BLANK',
      options: [],
      correctAnswer: flashcard.front,
      explanation: `The correct word is "${flashcard.front}"`,
      points: 2,
    };
  }

  private getQuestionType(
    quizType: string,
    index: number,
    total: number,
  ): 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'FILL_BLANK' {
    if (quizType !== 'MIXED') {
      return quizType as any;
    }

    // Distribute question types evenly
    const types: ('MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'FILL_BLANK')[] = [
      'MULTIPLE_CHOICE',
      'TRUE_FALSE',
      'FILL_BLANK',
    ];
    return types[index % types.length];
  }

  private async getRandomFlashcards(
    userId: number,
    topic?: string,
    deckId?: string,
    count: number = 10,
    difficulty?: string,
  ): Promise<Flashcard[]> {
    const queryBuilder = this.flashcardRepository
      .createQueryBuilder('f')
      .innerJoin('f.deck', 'd')
      .where('f.userId = :userId', { userId });

    if (topic) {
      queryBuilder.andWhere('d.topic = :topic', { topic });
    }

    if (deckId) {
      queryBuilder.andWhere('f.deckId = :deckId', { deckId });
    }

    if (difficulty && difficulty !== 'MIXED') {
      const difficultyMap: { [key: string]: number[] } = {
        EASY: [1, 2],
        MEDIUM: [3],
        HARD: [4, 5],
      };
      queryBuilder.andWhere('f.difficulty IN (:...difficulties)', {
        difficulties: difficultyMap[difficulty],
      });
    }

    const flashcards = await queryBuilder
      .orderBy('RANDOM()')
      .limit(count * 2) // Get extra for wrong answers
      .getMany();

    return this.shuffleArray(flashcards).slice(0, count);
  }

  private async getRandomWrongAnswers(
    correctAnswer: string,
    count: number,
  ): Promise<string[]> {
    const wrongAnswers = await this.flashcardRepository
      .createQueryBuilder('f')
      .select('f.back', 'answer')
      .where('f.back != :correctAnswer', { correctAnswer })
      .orderBy('RANDOM()')
      .limit(count)
      .getRawMany();

    return wrongAnswers.map((item) => item.answer);
  }

  private async getRandomWrongAnswer(correctAnswer: string): Promise<string> {
    const wrongAnswers = await this.getRandomWrongAnswers(correctAnswer, 1);
    return wrongAnswers[0] || 'incorrect meaning';
  }

  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
}
