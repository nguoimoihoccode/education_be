import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddQuizSessionQuestionOrder1780000000000 implements MigrationInterface {
  name = 'AddQuizSessionQuestionOrder1780000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "edu_quiz_sessions" ADD "questionOrder" json`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "edu_quiz_sessions" DROP COLUMN "questionOrder"`,
    );
  }
}
