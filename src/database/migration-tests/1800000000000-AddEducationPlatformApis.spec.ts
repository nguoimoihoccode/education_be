import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { getMetadataArgsStorage } from 'typeorm';
import { EducationActivityLog } from '../../modules/activity-log/entities/activity-log.entity';
import { EducationDataExport } from '../../modules/data-export/entities/data-export.entity';
import { EducationSocialComment } from '../../modules/education-social/entities/social-comment.entity';
import { EducationSocialPostBookmark } from '../../modules/education-social/entities/social-post-bookmark.entity';
import { EducationSocialPostLike } from '../../modules/education-social/entities/social-post-like.entity';
import { EducationSocialPost } from '../../modules/education-social/entities/social-post.entity';
import { AddEducationPlatformApis1800000000000 } from '../migrations/1800000000000-AddEducationPlatformApis';

describe('AddEducationPlatformApis1800000000000', () => {
  const createQueryRunner = () => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql.replace(/\s+/g, ' ').trim());
      }),
    };

    return { queries, queryRunner };
  };

  it('keeps Jest specs outside the TypeORM migration glob', () => {
    const migrationFiles = readdirSync(join(__dirname, '../migrations'));

    expect(migrationFiles).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/\.spec\.ts$/)]),
    );
  });

  it('creates education social, activity log, and export tables', async () => {
    const { queries, queryRunner } = createQueryRunner();

    await new AddEducationPlatformApis1800000000000().up(queryRunner as never);

    const sql = queries.join('\n');
    expect(sql).toContain('CREATE TABLE "edu_social_posts"');
    expect(sql).toContain('CREATE TABLE "edu_social_comments"');
    expect(sql).toContain('CREATE TABLE "edu_social_post_likes"');
    expect(sql).toContain('CREATE TABLE "edu_social_post_bookmarks"');
    expect(sql).toContain('CREATE TABLE "edu_activity_logs"');
    expect(sql).toContain('CREATE TABLE "edu_data_exports"');
    expect(
      sql.match(/REFERENCES "users"\("id"\) ON DELETE CASCADE/g),
    ).toHaveLength(6);
    expect(
      sql.match(/REFERENCES "edu_social_posts"\("id"\) ON DELETE CASCADE/g),
    ).toHaveLength(3);
    expect(sql.match(/UNIQUE \("post_id", "user_id"\)/g)).toHaveLength(2);
    expect(sql).toContain('USING GIN ("tags")');
    expect(sql).toContain('ON "edu_social_posts" ("author_id")');
    expect(sql).toContain('ON "edu_social_comments" ("author_id")');
    expect(sql).toContain('ON "edu_social_post_likes" ("user_id")');
    expect(sql).toContain('ON "edu_social_post_bookmarks" ("user_id")');
    expect(sql).toContain(
      'ON "edu_social_posts" ("created_at" DESC, "id" ASC)',
    );
    expect(sql).toContain(
      'ON "edu_social_posts" ("type", "created_at" DESC, "id" ASC)',
    );
    expect(sql).toContain(
      'ON "edu_activity_logs" ("user_id", "created_at" DESC)',
    );
    expect(sql).toContain(
      'ON "edu_data_exports" ("user_id", "created_at" DESC)',
    );
    expect(sql.match(/TIMESTAMPTZ/g)).toHaveLength(8);
    expect(sql).not.toMatch(/\bTIMESTAMP\b/);
  });

  it('aligns entity foreign keys, indexes, and timestamps with the migration', () => {
    const entities = [
      EducationSocialPost,
      EducationSocialComment,
      EducationSocialPostLike,
      EducationSocialPostBookmark,
      EducationActivityLog,
      EducationDataExport,
    ];
    const entitySet = new Set<Function>(entities);
    const metadata = getMetadataArgsStorage();
    const foreignKeys = metadata.joinColumns
      .filter((joinColumn) => entitySet.has(joinColumn.target as Function))
      .map((joinColumn) => joinColumn.foreignKeyConstraintName);
    const indexNames = metadata.indices
      .filter((index) => entitySet.has(index.target as Function))
      .map((index) => index.name);
    const timestampColumns = metadata.columns
      .filter(
        (column) =>
          entitySet.has(column.target as Function) &&
          ['createdAt', 'updatedAt', 'completedAt'].includes(
            column.propertyName,
          ),
      )
      .map((column) => ({
        entity: (column.target as Function).name,
        property: column.propertyName,
        type: column.options.type,
      }));
    const postIndexes = metadata.indices.filter(
      (index) => index.target === EducationSocialPost,
    );
    const createdIndex = postIndexes.find(
      (index) => index.name === 'IDX_edu_social_posts_created',
    );
    const typeCreatedIndex = postIndexes.find(
      (index) => index.name === 'IDX_edu_social_posts_type_created',
    );

    expect(foreignKeys).toEqual(
      expect.arrayContaining([
        'FK_edu_social_posts_author',
        'FK_edu_social_comments_post',
        'FK_edu_social_comments_author',
        'FK_edu_social_post_likes_post',
        'FK_edu_social_post_likes_user',
        'FK_edu_social_post_bookmarks_post',
        'FK_edu_social_post_bookmarks_user',
        'FK_edu_activity_logs_user',
        'FK_edu_data_exports_user',
      ]),
    );
    expect(indexNames).toEqual(
      expect.arrayContaining([
        'IDX_edu_social_posts_author',
        'IDX_edu_social_comments_author',
        'IDX_edu_social_post_likes_user',
        'IDX_edu_social_post_bookmarks_user',
      ]),
    );
    expect(resolveIndexColumns(createdIndex?.columns)).toEqual({
      createdAt: -1,
      id: 1,
    });
    expect(resolveIndexColumns(typeCreatedIndex?.columns)).toEqual({
      type: 1,
      createdAt: -1,
      id: 1,
    });
    expect(timestampColumns).toHaveLength(8);
    expect(timestampColumns.every(({ type }) => type === 'timestamptz')).toBe(
      true,
    );
  });

  it('drops dependent tables before parents and enum types', async () => {
    const { queries, queryRunner } = createQueryRunner();

    await new AddEducationPlatformApis1800000000000().down(
      queryRunner as never,
    );

    const sql = queries.join('\n');
    const positions = [
      'DROP TABLE IF EXISTS "edu_data_exports"',
      'DROP TABLE IF EXISTS "edu_activity_logs"',
      'DROP TABLE IF EXISTS "edu_social_post_bookmarks"',
      'DROP TABLE IF EXISTS "edu_social_post_likes"',
      'DROP TABLE IF EXISTS "edu_social_comments"',
      'DROP TABLE IF EXISTS "edu_social_posts"',
      'DROP TYPE IF EXISTS "public"."edu_export_status_enum"',
      'DROP TYPE IF EXISTS "public"."edu_export_time_range_enum"',
      'DROP TYPE IF EXISTS "public"."edu_export_format_enum"',
      'DROP TYPE IF EXISTS "public"."edu_activity_type_enum"',
      'DROP TYPE IF EXISTS "public"."edu_social_post_type_enum"',
    ].map((statement) => sql.indexOf(statement));

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual(
      [...positions].sort((left, right) => left - right),
    );
    expect(sql).not.toContain('DROP EXTENSION');
  });
});

function resolveIndexColumns(
  columns:
    | string[]
    | ((object?: object) => unknown[] | Record<string, number>)
    | undefined,
): unknown {
  return typeof columns === 'function'
    ? columns({ type: 'type', createdAt: 'createdAt', id: 'id' })
    : columns;
}
