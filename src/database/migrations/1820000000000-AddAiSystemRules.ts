import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAiSystemRules1820000000000 implements MigrationInterface {
  name = 'AddAiSystemRules1820000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "ai_provider_settings"
      ADD COLUMN "system_rules" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "ai_provider_settings"
      DROP COLUMN IF EXISTS "system_rules"
    `);
  }
}
