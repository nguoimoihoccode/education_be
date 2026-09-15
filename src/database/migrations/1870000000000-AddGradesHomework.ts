import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 4 of docs/SCHOOL_PLATFORM_PLAN.md — grades + homework.
 * school_homework: BTVN giao cho lớp, trỏ tới quiz/deck có sẵn của
 *   Learning Hub qua (target_type, target_id) — không FK vì bảng nguồn
 *   thuộc module education. counts_as_grade bật thì hoàn thành quiz
 *   tự sinh đầu điểm 15 phút.
 * school_grades: một đầu điểm sổ điểm (test_type oral|15min|45min|final,
 *   coefficient 1|2, score numeric(4,1) 0..10). quiz_session_id là cầu
 *   nối Learning Hub — unique partial để 1 session chỉ sinh 1 đầu điểm;
 *   homework_id FK CASCADE (xóa bài giao kéo theo điểm tự sinh).
 */
export class AddGradesHomework1870000000000 implements MigrationInterface {
  name = 'AddGradesHomework1870000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "school_homework" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "school_id" uuid NOT NULL,
        "class_id" uuid NOT NULL,
        "subject_id" uuid NOT NULL,
        "teacher_id" integer NOT NULL,
        "title" character varying(200) NOT NULL,
        "due_date" TIMESTAMP NOT NULL,
        "target_type" character varying(10) NOT NULL,
        "target_id" uuid NOT NULL,
        "counts_as_grade" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_school_homework_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_homework_school" FOREIGN KEY ("school_id")
          REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_homework_class" FOREIGN KEY ("class_id")
          REFERENCES "school_classes"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_homework_subject" FOREIGN KEY ("subject_id")
          REFERENCES "school_subjects"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_homework_teacher" FOREIGN KEY ("teacher_id")
          REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_homework_school"
      ON "school_homework" ("school_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_homework_class_due"
      ON "school_homework" ("class_id", "due_date")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_homework_teacher"
      ON "school_homework" ("teacher_id")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "school_grades" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "school_id" uuid NOT NULL,
        "class_id" uuid NOT NULL,
        "subject_id" uuid NOT NULL,
        "student_id" integer NOT NULL,
        "test_type" character varying(20) NOT NULL,
        "coefficient" smallint NOT NULL DEFAULT 1,
        "score" numeric(4,1) NOT NULL,
        "date" date NOT NULL,
        "term" smallint NOT NULL DEFAULT 1,
        "quiz_session_id" uuid,
        "homework_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_school_grades_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_grades_school" FOREIGN KEY ("school_id")
          REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_grades_class" FOREIGN KEY ("class_id")
          REFERENCES "school_classes"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_grades_subject" FOREIGN KEY ("subject_id")
          REFERENCES "school_subjects"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_grades_student" FOREIGN KEY ("student_id")
          REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_grades_homework" FOREIGN KEY ("homework_id")
          REFERENCES "school_homework"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_grades_school"
      ON "school_grades" ("school_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_grades_student_subject"
      ON "school_grades" ("student_id", "subject_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_grades_class_subject_term"
      ON "school_grades" ("class_id", "subject_id", "term")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_grades_quiz_session"
      ON "school_grades" ("quiz_session_id")
      WHERE "quiz_session_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "school_grades"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "school_homework"`);
  }
}
