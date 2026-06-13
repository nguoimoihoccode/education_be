import { getMetadataArgsStorage } from 'typeorm';
import { QuizSession } from '../../modules/education/entities/quiz-session.entity';
import { UserLesson } from '../../modules/education/entities/user-lesson.entity';
import { AddLeaderboardAggregateIndexes1800000000001 } from '../migrations/1800000000001-AddLeaderboardAggregateIndexes';

describe('AddLeaderboardAggregateIndexes1800000000001', () => {
  const lessonIndexName = 'IDX_edu_user_lessons_completed_at_user';
  const quizIndexName = 'IDX_edu_quiz_sessions_completed_at_user';

  const createQueryRunner = () => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql.replace(/\s+/g, ' ').trim());
      }),
    };

    return { queries, queryRunner };
  };

  it('creates partial composite indexes for completed leaderboard rows', async () => {
    const { queries, queryRunner } = createQueryRunner();

    await new AddLeaderboardAggregateIndexes1800000000001().up(
      queryRunner as never,
    );

    expect(queries).toEqual([
      `CREATE INDEX "${lessonIndexName}" ON "edu_user_lessons" ("completed_at", "user_id") WHERE "completed" = true`,
      `CREATE INDEX "${quizIndexName}" ON "edu_quiz_sessions" ("completedAt", "userId") WHERE "completed" = true`,
    ]);
    expect(lessonIndexName.length).toBeLessThanOrEqual(63);
    expect(quizIndexName.length).toBeLessThanOrEqual(63);
  });

  it('drops both indexes in reverse order', async () => {
    const { queries, queryRunner } = createQueryRunner();

    await new AddLeaderboardAggregateIndexes1800000000001().down(
      queryRunner as never,
    );

    expect(queries).toEqual([
      `DROP INDEX IF EXISTS "${quizIndexName}"`,
      `DROP INDEX IF EXISTS "${lessonIndexName}"`,
    ]);
  });

  it('keeps entity index metadata aligned with the migration', () => {
    const metadata = getMetadataArgsStorage();
    const lessonIndex = metadata.indices.find(
      (index) => index.target === UserLesson && index.name === lessonIndexName,
    );
    const quizIndex = metadata.indices.find(
      (index) => index.target === QuizSession && index.name === quizIndexName,
    );

    expect(lessonIndex?.columns).toEqual(['completedAt', 'userId']);
    expect(lessonIndex?.where).toBe('"completed" = true');
    expect(quizIndex?.columns).toEqual(['completedAt', 'userId']);
    expect(quizIndex?.where).toBe('"completed" = true');
  });
});
