import { getMetadataArgsStorage } from 'typeorm';
import { UserVocabulary } from '../../modules/education/entities/user-vocabulary.entity';
import { AddUserVocabularyReviewIndex1880000000000 } from '../migrations/1880000000000-AddUserVocabularyReviewIndex';

describe('AddUserVocabularyReviewIndex1880000000000', () => {
  const indexName = 'IDX_edu_user_vocabularies_user_next_review';

  const createQueryRunner = () => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql.replace(/\s+/g, ' ').trim());
      }),
    };

    return { queries, queryRunner };
  };

  it('creates the composite review index for user vocabularies', async () => {
    const { queries, queryRunner } = createQueryRunner();

    await new AddUserVocabularyReviewIndex1880000000000().up(
      queryRunner as never,
    );

    expect(queries).toEqual([
      `CREATE INDEX IF NOT EXISTS "${indexName}" ON "edu_user_vocabularies" ("user_id", "next_review")`,
    ]);
    expect(indexName.length).toBeLessThanOrEqual(63);
  });

  it('drops the index on revert', async () => {
    const { queries, queryRunner } = createQueryRunner();

    await new AddUserVocabularyReviewIndex1880000000000().down(
      queryRunner as never,
    );

    expect(queries).toEqual([`DROP INDEX IF EXISTS "${indexName}"`]);
  });

  it('keeps entity index metadata aligned with the migration', () => {
    const metadata = getMetadataArgsStorage();
    const index = metadata.indices.find(
      (candidate) =>
        candidate.target === UserVocabulary && candidate.name === indexName,
    );

    expect(index?.columns).toEqual(['userId', 'nextReview']);
  });
});
