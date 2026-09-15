import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 3 of docs/SCHOOL_PLATFORM_PLAN.md — timetable + attendance.
 * school_time_slots: 1 ô TKK (class+subject+teacher tại weekday/period).
 *   unique (class_id, weekday, period_number) — 1 lớp không học 2 môn
 *   cùng tiết; clash teacher/room giữa các lớp do policy chặn trước ghi.
 * school_attendance: điểm danh theo tiết; unique
 *   (class_id, date, period_number, student_id) = upsert cả lớp 1 lệnh.
 * schools.period_config đã có từ 1840 (Phase 1) — dùng luôn, không ALTER.
 */
export class AddTimetableAttendance1860000000000 implements MigrationInterface {
  name = 'AddTimetableAttendance1860000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "school_time_slots" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "school_id" uuid NOT NULL,
        "class_id" uuid NOT NULL,
        "subject_id" uuid NOT NULL,
        "teacher_id" integer NOT NULL,
        "academic_year_id" uuid NOT NULL,
        "weekday" smallint NOT NULL,
        "period_number" smallint NOT NULL,
        "room" character varying(50),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_school_time_slots_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_time_slots_class_weekday_period"
          UNIQUE ("class_id", "weekday", "period_number"),
        CONSTRAINT "FK_time_slots_school" FOREIGN KEY ("school_id")
          REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_time_slots_class" FOREIGN KEY ("class_id")
          REFERENCES "school_classes"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_time_slots_subject" FOREIGN KEY ("subject_id")
          REFERENCES "school_subjects"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_time_slots_teacher" FOREIGN KEY ("teacher_id")
          REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_time_slots_academic_year" FOREIGN KEY ("academic_year_id")
          REFERENCES "school_academic_years"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_time_slots_school"
      ON "school_time_slots" ("school_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_time_slots_teacher_slot"
      ON "school_time_slots" ("teacher_id", "weekday", "period_number")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "school_attendance" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "school_id" uuid NOT NULL,
        "class_id" uuid NOT NULL,
        "student_id" integer NOT NULL,
        "date" date NOT NULL,
        "period_number" smallint NOT NULL,
        "status" character varying(20) NOT NULL,
        "note" character varying(255),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_school_attendance_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_attendance_class_date_period_student"
          UNIQUE ("class_id", "date", "period_number", "student_id"),
        CONSTRAINT "FK_attendance_school" FOREIGN KEY ("school_id")
          REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_attendance_class" FOREIGN KEY ("class_id")
          REFERENCES "school_classes"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_attendance_student" FOREIGN KEY ("student_id")
          REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_attendance_school"
      ON "school_attendance" ("school_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_attendance_class_date"
      ON "school_attendance" ("class_id", "date")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_attendance_student_date"
      ON "school_attendance" ("student_id", "date")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "school_attendance"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "school_time_slots"`);
  }
}
