import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRefreshTokenSessionMetadata1790000000000 implements MigrationInterface {
  name = 'AddRefreshTokenSessionMetadata1790000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "refresh_tokens" ADD "last_used_at" timestamp NULL',
    );
    await queryRunner.query(
      'ALTER TABLE "refresh_tokens" ADD "revoked_at" timestamp NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "refresh_tokens" DROP COLUMN "revoked_at"',
    );
    await queryRunner.query(
      'ALTER TABLE "refresh_tokens" DROP COLUMN "last_used_at"',
    );
  }
}
