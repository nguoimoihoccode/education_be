import { AddEducationPlatformApis1800000000000 } from './1800000000000-AddEducationPlatformApis';

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
    expect(sql).toContain('ON "edu_social_posts" ("created_at" DESC)');
    expect(sql).toContain('ON "edu_social_posts" ("type", "created_at" DESC)');
    expect(sql).toContain(
      'ON "edu_activity_logs" ("user_id", "created_at" DESC)',
    );
    expect(sql).toContain(
      'ON "edu_data_exports" ("user_id", "created_at" DESC)',
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
