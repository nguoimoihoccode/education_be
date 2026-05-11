import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDailyLearningTasks1780000000001 implements MigrationInterface {
  name = 'AddDailyLearningTasks1780000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "edu_daily_learning_tasks" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" character varying NOT NULL,
        "date" date NOT NULL,
        "task_id" character varying NOT NULL,
        "task_type" character varying NOT NULL,
        "target_url" character varying NOT NULL,
        "completed" boolean NOT NULL DEFAULT false,
        "completed_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_edu_daily_learning_tasks_user_date_task" UNIQUE ("user_id", "date", "task_id"),
        CONSTRAINT "PK_edu_daily_learning_tasks" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_edu_daily_learning_tasks_user" ON "edu_daily_learning_tasks" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_edu_daily_learning_tasks_date" ON "edu_daily_learning_tasks" ("date")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_edu_daily_learning_tasks_date"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_edu_daily_learning_tasks_user"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "edu_daily_learning_tasks"`);
  }
}
