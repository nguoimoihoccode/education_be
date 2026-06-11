import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Between, MoreThanOrEqual } from 'typeorm';
import { Quiz, QuizQuestion, QuizSession, QuizAnswer } from './entities';
import {
  CreateQuizDto,
  UpdateQuizDto,
  CreateQuizQuestionDto,
  BulkCreateQuizQuestionDto,
  UpdateQuizQuestionDto,
  StartQuizSessionDto,
  SubmitQuizAnswerDto,
  CompleteQuizSessionDto,
  GenerateQuizFromFlashcardsDto,
} from './dto';
import { Flashcard, FlashcardDeck } from './entities';
import {
  calculateFinalQuizScore,
  gradeQuizAnswer,
} from './domain/quiz-grading.policy';

@Injectable()
export class QuizService {
  constructor(
    @InjectRepository(Quiz)
    private readonly quizRepository: Repository<Quiz>,
    @InjectRepository(QuizQuestion)
    private readonly quizQuestionRepository: Repository<QuizQuestion>,
    @InjectRepository(QuizSession)
    private readonly quizSessionRepository: Repository<QuizSession>,
    @InjectRepository(Flashcard)
    private readonly flashcardRepository: Repository<Flashcard>,
    @InjectRepository(FlashcardDeck)
    private readonly flashcardDeckRepository: Repository<FlashcardDeck>,
  ) {}

  // ==================== Quiz Management ====================

  async createQuiz(userId: number, dto: CreateQuizDto) {
    const quiz = this.quizRepository.create({
      ...dto,
      userId,
    });
    return this.quizRepository.save(quiz);
  }

  async getQuizzes(
    userId: number,
    page: number = 1,
    limit: number = 10,
    topic?: string,
  ) {
    const skip = (page - 1) * limit;

    const where: any = { userId };
    if (topic) {
      where.topic = topic;
    }

    const [quizzes, total] = await this.quizRepository.findAndCount({
      where,
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    const totalPages = Math.ceil(total / limit);

    return {
      quizzes,
      total,
      page,
      limit,
      totalPages,
    };
  }

  async getQuizById(quizId: string, userId: number) {
    const quiz = await this.quizRepository.findOne({
      where: { id: quizId },
    });

    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }

    if (!quiz.isPublic && quiz.userId !== userId) {
      throw new NotFoundException('Quiz not found');
    }

    return quiz;
  }

  async updateQuiz(quizId: string, userId: number, dto: UpdateQuizDto) {
    const quiz = await this.getOwnedQuizById(quizId, userId);
    Object.assign(quiz, dto);
    return this.quizRepository.save(quiz);
  }

  async deleteQuiz(quizId: string, userId: number) {
    const quiz = await this.getOwnedQuizById(quizId, userId);
    await this.quizRepository.remove(quiz);
    return { message: 'Quiz deleted successfully' };
  }

  async getPublicQuizzes(page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [quizzes, total] = await this.quizRepository.findAndCount({
      where: { isPublic: true },
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    const totalPages = Math.ceil(total / limit);

    return {
      quizzes,
      total,
      page,
      limit,
      totalPages,
    };
  }

  // ==================== Quiz Question Management ====================

  async createQuizQuestion(
    userId: number,
    quizId: string,
    dto: CreateQuizQuestionDto,
  ) {
    const quiz = await this.getOwnedQuizById(quizId, userId);

    const question = this.quizQuestionRepository.create({
      ...dto,
      quizId,
      order: quiz.questionCount,
    });

    const savedQuestion = await this.quizQuestionRepository.save(question);

    // Update quiz question count
    await this.quizRepository.increment({ id: quizId }, 'questionCount', 1);

    return savedQuestion;
  }

  private async getOwnedQuizById(quizId: string, userId: number) {
    const quiz = await this.quizRepository.findOne({
      where: { id: quizId, userId },
    });

    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }

    return quiz;
  }

  async bulkCreateQuizQuestions(
    userId: number,
    quizId: string,
    dto: BulkCreateQuizQuestionDto,
  ) {
    const quiz = await this.getQuizById(quizId, userId);

    const created = [];
    for (let i = 0; i < dto.questions.length; i++) {
      const question = this.quizQuestionRepository.create({
        ...dto.questions[i],
        quizId,
        order: quiz.questionCount + i,
      });
      const saved = await this.quizQuestionRepository.save(question);
      created.push(saved);
    }

    // Update quiz question count
    await this.quizRepository.increment(
      { id: quizId },
      'questionCount',
      created.length,
    );

    return {
      created,
      total: created.length,
    };
  }

  async getQuizQuestions(quizId: string, userId: number) {
    const quiz = await this.getQuizById(quizId, userId);

    const questions = await this.quizQuestionRepository.find({
      where: { quizId },
      order: { order: 'ASC' },
    });

    return {
      quiz,
      questions,
    };
  }

  async updateQuizQuestion(
    questionId: string,
    userId: number,
    dto: UpdateQuizQuestionDto,
  ) {
    const question = await this.quizQuestionRepository.findOne({
      where: { id: questionId },
      relations: ['quiz'],
    });

    if (!question) {
      throw new NotFoundException('Question not found');
    }

    if (question.quiz.userId !== userId) {
      throw new BadRequestException(
        'You do not have permission to update this question',
      );
    }

    Object.assign(question, dto);
    return this.quizQuestionRepository.save(question);
  }

  async deleteQuizQuestion(questionId: string, userId: number) {
    const question = await this.quizQuestionRepository.findOne({
      where: { id: questionId },
      relations: ['quiz'],
    });

    if (!question) {
      throw new NotFoundException('Question not found');
    }

    if (question.quiz.userId !== userId) {
      throw new BadRequestException(
        'You do not have permission to delete this question',
      );
    }

    const quizId = question.quizId;
    await this.quizQuestionRepository.remove(question);

    // Update quiz question count
    await this.quizRepository.decrement({ id: quizId }, 'questionCount', 1);

    return { message: 'Question deleted successfully' };
  }

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

  private async generateMultipleChoiceQuestion(
    flashcard: Flashcard,
  ): Promise<Partial<CreateQuizQuestionDto>> {
    const wrongAnswers = await this.getRandomWrongAnswers(flashcard.back, 3);
    const options = this.shuffleArray([flashcard.back, ...wrongAnswers]);

    return {
      question: `What is the meaning of "${flashcard.front}"?`,
      type: 'MULTIPLE_CHOICE',
      options,
      correctAnswer: flashcard.back,
      explanation:
        flashcard.example || `The correct answer is "${flashcard.back}"`,
      points: 1,
    };
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

  // ==================== Quiz Session Management ====================

  async startQuizSession(userId: number, dto: StartQuizSessionDto) {
    const quiz = await this.quizRepository.findOne({
      where: { id: dto.quizId },
    });

    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }

    if (!quiz.isPublic && quiz.userId !== userId) {
      throw new NotFoundException('Quiz not found');
    }

    const completedAttempts = await this.quizSessionRepository.count({
      where: { userId, quizId: dto.quizId, completed: true },
    });

    if (!quiz.allowRetry && completedAttempts > 0) {
      throw new BadRequestException('Quiz does not allow retries');
    }

    if (
      quiz.allowRetry &&
      quiz.maxRetries > 0 &&
      completedAttempts >= quiz.maxRetries
    ) {
      throw new BadRequestException('Quiz retry limit reached');
    }

    // Get questions
    let questions = await this.quizQuestionRepository.find({
      where: { quizId: dto.quizId },
      order: { order: 'ASC' },
    });

    // Shuffle if enabled
    if (quiz.shuffleQuestions) {
      questions = this.shuffleArray(questions);
    }

    // Limit question count
    if (dto.questionCount && dto.questionCount < questions.length) {
      questions = questions.slice(0, dto.questionCount);
    }

    // Shuffle answers if enabled
    if (quiz.shuffleAnswers) {
      questions = questions.map((q) => ({
        ...q,
        options: q.options ? this.shuffleArray(q.options) : q.options,
      }));
    }

    const totalPoints = questions.reduce((sum, q) => sum + q.points, 0);

    const session = this.quizSessionRepository.create({
      quizId: dto.quizId,
      userId,
      totalPoints,
      answers: [],
      questionOrder: buildQuizSessionQuestionOrder(questions),
      attemptNumber: await this.getNextAttemptNumber(userId, dto.quizId),
      startedAt: new Date(),
    });

    return this.quizSessionRepository.save(session);
  }

  async submitQuizAnswer(
    userId: number,
    sessionId: string,
    dto: SubmitQuizAnswerDto,
  ) {
    const session = await this.getQuizSession(sessionId, userId);

    if (session.completed) {
      throw new BadRequestException('Quiz session already completed');
    }

    const question = await this.quizQuestionRepository.findOne({
      where: { id: dto.questionId },
    });

    if (!question) {
      throw new NotFoundException('Question not found');
    }

    if (question.quizId !== session.quizId) {
      throw new BadRequestException(
        'Question does not belong to this quiz session',
      );
    }

    if (!isQuestionInSessionOrder(session.questionOrder, dto.questionId)) {
      throw new BadRequestException(
        'Question is not part of this quiz session',
      );
    }

    if (hasAnsweredQuestion(session.answers, dto.questionId)) {
      throw new BadRequestException(
        'Question already answered in this session',
      );
    }

    const gradedAnswer = gradeQuizAnswer({
      correctAnswer: question.correctAnswer,
      userAnswer: dto.answer,
      points: question.points,
    });
    const { isCorrect, points } = gradedAnswer;

    // Update session
    const answers = session.answers || [];
    answers.push({
      questionId: dto.questionId,
      userAnswer: dto.answer,
      isCorrect,
      timeSpent: dto.timeSpent || 0,
      points,
    });

    session.answers = answers;
    session.earnedPoints = answers.reduce((sum, a) => sum + a.points, 0);
    session.correctAnswers = answers.filter((a) => a.isCorrect).length;
    session.wrongAnswers = answers.filter((a) => !a.isCorrect).length;

    await this.quizSessionRepository.save(session);

    // Get quiz to check showCorrectAnswer setting
    const quiz = await this.quizRepository.findOne({
      where: { id: session.quizId },
    });

    return {
      isCorrect,
      points,
      correctAnswer: quiz?.showCorrectAnswer
        ? question.correctAnswer
        : undefined,
      explanation: quiz?.showCorrectAnswer ? question.explanation : undefined,
    };
  }

  async completeQuizSession(userId: number, dto: CompleteQuizSessionDto) {
    const session = await this.getQuizSession(dto.sessionId, userId);

    if (session.completed) {
      throw new BadRequestException('Quiz session already completed');
    }

    session.completed = true;
    session.completedAt = new Date();

    session.score = calculateFinalQuizScore({
      earnedPoints: session.earnedPoints,
      totalPoints: session.totalPoints,
    });

    // Calculate time spent
    const startedAt = new Date(session.startedAt);
    const completedAt = new Date();
    session.timeSpent = Math.floor(
      (completedAt.getTime() - startedAt.getTime()) / 1000,
    );

    // Check if passed
    const quiz = await this.quizRepository.findOne({
      where: { id: session.quizId },
    });
    session.passed = session.score >= (quiz?.passingScore || 0);

    await this.quizSessionRepository.save(session);

    return session;
  }

  async getQuizSession(sessionId: string, userId: number) {
    const session = await this.quizSessionRepository.findOne({
      where: { id: sessionId, userId },
      relations: ['quiz'],
    });

    if (!session) {
      throw new NotFoundException('Quiz session not found');
    }

    return session;
  }

  async getQuizSessionQuestions(sessionId: string, userId: number) {
    const session = await this.getQuizSession(sessionId, userId);
    const questionIds = session.questionOrder || [];

    if (questionIds.length === 0) {
      return [];
    }

    const questions = await this.quizQuestionRepository.find({
      where: { id: In(questionIds) },
    });
    const questionsById = new Map(
      questions.map((question) => [question.id, question]),
    );

    return questionIds
      .map((questionId) => questionsById.get(questionId))
      .filter((question): question is QuizQuestion => Boolean(question))
      .map((question) => this.toSessionQuestion(question));
  }

  private toSessionQuestion(question: QuizQuestion) {
    return {
      id: question.id,
      question: question.question,
      type: question.type,
      options: question.options,
      points: question.points,
      flashcardId: question.flashcardId,
      quizId: question.quizId,
      createdAt: question.createdAt,
      updatedAt: question.updatedAt,
    };
  }

  async getQuizSessions(
    userId: number,
    quizId?: string,
    page: number = 1,
    limit: number = 10,
  ) {
    const skip = (page - 1) * limit;

    const where: any = { userId };
    if (quizId) {
      where.quizId = quizId;
    }

    const [sessions, total] = await this.quizSessionRepository.findAndCount({
      where,
      relations: ['quiz'],
      skip,
      take: limit,
      order: { startedAt: 'DESC' },
    });

    const totalPages = Math.ceil(total / limit);

    return {
      sessions,
      total,
      page,
      limit,
      totalPages,
    };
  }

  private async getNextAttemptNumber(
    userId: number,
    quizId: string,
  ): Promise<number> {
    const count = await this.quizSessionRepository.count({
      where: { userId, quizId },
    });
    return count + 1;
  }

  // ==================== Statistics & Progress ====================

  async getQuizStats(userId: number) {
    const totalQuizzes = await this.quizRepository.count({
      where: { userId },
    });

    const totalSessions = await this.quizSessionRepository.count({
      where: { userId, completed: true },
    });

    const scoreStats = await this.quizSessionRepository
      .createQueryBuilder('s')
      .select('AVG(s.score)', 'average')
      .addSelect('MAX(s.score)', 'highest')
      .addSelect('MIN(s.score)', 'lowest')
      .addSelect(
        'AVG(s.timeSpent::float / NULLIF(s.correctAnswers + s.wrongAnswers + s.skippedAnswers, 0))',
        'averageTimePerQuestion',
      )
      .where('s.userId = :userId', { userId })
      .andWhere('s.completed = :completed', { completed: true })
      .getRawOne();

    const passedSessions = await this.quizSessionRepository.count({
      where: { userId, completed: true, passed: true },
    });

    const passRate =
      totalSessions > 0 ? (passedSessions / totalSessions) * 100 : 0;

    const quizzes = await this.quizRepository.find({ where: { userId } });

    return buildQuizStatsResult({
      totalQuizzes,
      totalSessions,
      averageScore: parseNumericStat(scoreStats?.average),
      highestScore: parseNumericStat(scoreStats?.highest),
      lowestScore: parseNumericStat(scoreStats?.lowest),
      averageTimePerQuestion: parseNumericStat(
        scoreStats?.averageTimePerQuestion,
      ),
      passRate: Math.round(passRate),
      watchedTopics: uniqueNonEmpty(quizzes.map((quiz) => quiz.topic)),
    });
  }

  async getQuizStatsByTopic(userId: number, topic: string) {
    const quizzes = await this.quizRepository.find({
      where: { userId, topic },
    });

    const quizIds = quizzes.map((q) => q.id);

    if (quizIds.length === 0) {
      return buildTopicQuizStatsResult({
        topic,
        totalQuizzes: 0,
        totalSessions: 0,
        averageScore: 0,
        highestScore: 0,
        lowestScore: 0,
        passRate: 0,
        favoriteQuestionTypes: [],
      });
    }

    const totalSessions = await this.quizSessionRepository.count({
      where: { userId, quizId: In(quizIds), completed: true },
    });

    const scoreStats = await this.quizSessionRepository
      .createQueryBuilder('s')
      .select('AVG(s.score)', 'average')
      .addSelect('MAX(s.score)', 'highest')
      .addSelect('MIN(s.score)', 'lowest')
      .where('s.userId = :userId', { userId })
      .andWhere('s.quizId IN (:...quizIds)', { quizIds })
      .andWhere('s.completed = :completed', { completed: true })
      .getRawOne();

    const passedSessions = await this.quizSessionRepository.count({
      where: { userId, quizId: In(quizIds), completed: true, passed: true },
    });

    const passRate =
      totalSessions > 0 ? (passedSessions / totalSessions) * 100 : 0;

    return buildTopicQuizStatsResult({
      topic,
      totalQuizzes: quizzes.length,
      totalSessions,
      averageScore: parseNumericStat(scoreStats?.average),
      highestScore: parseNumericStat(scoreStats?.highest),
      lowestScore: parseNumericStat(scoreStats?.lowest),
      passRate: Math.round(passRate),
      favoriteQuestionTypes: uniqueNonEmpty(
        quizzes.map((quiz) => quiz.questionType),
      ),
    });
  }

  async getQuizHistory(userId: number, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [sessions, total] = await this.quizSessionRepository.findAndCount({
      where: { userId, completed: true },
      relations: ['quiz'],
      skip,
      take: limit,
      order: { completedAt: 'DESC' },
    });

    const totalPages = Math.ceil(total / limit);

    return {
      sessions,
      total,
      page,
      limit,
      totalPages,
    };
  }

  async getWrongAnswers(userId: number, sessionId?: string) {
    const where: any = { userId, completed: true };

    if (sessionId) {
      where.id = sessionId;
    }

    const sessions = await this.quizSessionRepository.find({
      where,
      relations: ['quiz'],
    });

    const wrongAnswers: any[] = [];

    for (const session of sessions) {
      if (session.answers) {
        for (const answer of session.answers) {
          if (!answer.isCorrect) {
            const question = await this.quizQuestionRepository.findOne({
              where: { id: answer.questionId },
            });
            if (question) {
              wrongAnswers.push({
                sessionId: session.id,
                quizName: session.quiz.name,
                question: question.question,
                userAnswer: answer.userAnswer,
                correctAnswer: question.correctAnswer,
                explanation: question.explanation,
                timeSpent: answer.timeSpent,
              });
            }
          }
        }
      }
    }

    return {
      wrongAnswers,
      total: wrongAnswers.length,
    };
  }

  async getLeaderboard(quizId: string, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [sessions, total] = await this.quizSessionRepository.findAndCount({
      where: { quizId, completed: true },
      relations: ['user'],
      skip,
      take: limit,
      order: { score: 'DESC', timeSpent: 'ASC' },
    });

    const totalPages = Math.ceil(total / limit);

    const leaderboard = sessions.map((session, index) => ({
      rank: skip + index + 1,
      userId: session.userId,
      username: session.user.email,
      score: session.score,
      timeSpent: session.timeSpent,
      completedAt: session.completedAt,
    }));

    return {
      leaderboard,
      total,
      page,
      limit,
      totalPages,
    };
  }
}

export function buildQuizSessionQuestionOrder(
  questions: Array<{ id: string }>,
): string[] {
  return questions.map((question) => question.id);
}

export const isQuestionInSessionOrder = (
  questionOrder: string[] | null | undefined,
  questionId: string,
): boolean => (questionOrder ?? []).includes(questionId);

export const hasAnsweredQuestion = (
  answers: Array<{ questionId: string }> | null | undefined,
  questionId: string,
): boolean =>
  (answers ?? []).some((answer) => answer.questionId === questionId);

export function calculateQuizSessionProgress(input: {
  questionOrder?: string[] | null;
  answers?: Array<{ questionId: string }> | null;
}) {
  const totalQuestions = input.questionOrder?.length ?? 0;
  const answeredQuestions = input.answers?.length ?? 0;

  return {
    totalQuestions,
    answeredQuestions,
    currentQuestionIndex: Math.min(answeredQuestions, totalQuestions),
  };
}

export interface QuizStatsResultInput {
  totalQuizzes: number;
  totalSessions: number;
  averageScore: number;
  highestScore: number;
  lowestScore: number;
  averageTimePerQuestion: number;
  passRate: number;
  watchedTopics: string[];
}

export function buildQuizStatsResult(input: QuizStatsResultInput) {
  return {
    totalQuizzes: input.totalQuizzes,
    totalSessions: input.totalSessions,
    averageScore: input.averageScore,
    highestScore: input.highestScore,
    lowestScore: input.lowestScore,
    averageTimePerQuestion: input.averageTimePerQuestion,
    passRate: input.passRate,
    watchedTopics: input.watchedTopics,
    passedQuizzes: Math.round((input.totalSessions * input.passRate) / 100),
  };
}

export interface TopicQuizStatsResultInput {
  topic: string;
  totalQuizzes: number;
  totalSessions: number;
  averageScore: number;
  highestScore: number;
  lowestScore: number;
  passRate: number;
  favoriteQuestionTypes: string[];
}

export function buildTopicQuizStatsResult(input: TopicQuizStatsResultInput) {
  return {
    topic: input.topic,
    totalQuizzes: input.totalQuizzes,
    totalSessions: input.totalSessions,
    averageScore: input.averageScore,
    highestScore: input.highestScore,
    lowestScore: input.lowestScore,
    passRate: input.passRate,
    favoriteQuestionTypes: input.favoriteQuestionTypes,
    strengths: input.averageScore >= 70 ? input.favoriteQuestionTypes : [],
    weaknesses: input.averageScore < 70 ? input.favoriteQuestionTypes : [],
  };
}

function parseNumericStat(value: unknown): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value))),
  ];
}
