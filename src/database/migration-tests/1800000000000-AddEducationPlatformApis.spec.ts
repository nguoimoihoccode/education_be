import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { getMetadataArgsStorage } from 'typeorm';
import { EducationActivityLog } from '../../modules/activity-log/entities/activity-log.entity';
import { EducationDataExport } from '../../modules/data-export/entities/data-export.entity';
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

  it('creates activity log and export tables', async () => {
    const { queries, queryRunner } = createQueryRunner();

    await new AddEducationPlatformApis1800000000000().up(queryRunner as never);

    const sql = queries.join('\n');
    expect(sql).toContain('CREATE TABLE "edu_activity_logs"');
    expect(sql).toContain('CREATE TABLE "edu_data_exports"');
    expect(sql).not.toContain('edu_social');
    expect(
      sql.match(/REFERENCES "users"\("id"\) ON DELETE CASCADE/g),
    ).toHaveLength(2);
    expect(sql).toContain(
      'ON "edu_activity_logs" ("user_id", "created_at" DESC)',
    );
    expect(sql).toContain(
      'ON "edu_data_exports" ("user_id", "created_at" DESC)',
    );
    expect(sql.match(/TIMESTAMPTZ/g)).toHaveLength(3);
    expect(sql).not.toMatch(/\bTIMESTAMP\b/);
  });

  it('aligns entity foreign keys, indexes, and timestamps with the migration', () => {
    const entities = [EducationActivityLog, EducationDataExport];
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

    expect(foreignKeys).toEqual(
      expect.arrayContaining([
        'FK_edu_activity_logs_user',
        'FK_edu_data_exports_user',
      ]),
    );
    expect(timestampColumns).toHaveLength(3);
    expect(timestampColumns.every(({ type }) => type === 'timestamptz')).toBe(
      true,
    );
  });

  it('drops dependent tables before enum types', async () => {
    const { queries, queryRunner } = createQueryRunner();

    await new AddEducationPlatformApis1800000000000().down(
      queryRunner as never,
    );

    const sql = queries.join('\n');
    const positions = [
      'DROP TABLE IF EXISTS "edu_data_exports"',
      'DROP TABLE IF EXISTS "edu_activity_logs"',
      'DROP TYPE IF EXISTS "public"."edu_export_status_enum"',
      'DROP TYPE IF EXISTS "public"."edu_export_time_range_enum"',
      'DROP TYPE IF EXISTS "public"."edu_export_format_enum"',
      'DROP TYPE IF EXISTS "public"."edu_activity_type_enum"',
    ].map((statement) => sql.indexOf(statement));

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual(
      [...positions].sort((left, right) => left - right),
    );
    expect(sql).not.toContain('DROP EXTENSION');
  });
});
