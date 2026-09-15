import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * School platform foundation — docs/SCHOOL_PLATFORM_PLAN.md Phase 1.
 * Creates: schools, academic years, subjects, classes, teaching
 * assignments, class memberships. All tenant-scoped by school_id.
 * (users.roles needs no change: stored as simple-array text.)
 */
export class AddSchoolFoundation1840000000000 implements MigrationInterface {
  name = 'AddSchoolFoundation1840000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // New activity type for school administration audit trail
    await queryRunner.query(`
      ALTER TYPE "public"."edu_activity_type_enum"
      ADD VALUE IF NOT EXISTS 'school'
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "schools" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "code" character varying(50) NOT NULL,
        "name" character varying(255) NOT NULL,
        "address" text,
        "phone" character varying(30),
        "current_academic_year_id" uuid,
        "principal_id" integer,
        "period_config" jsonb DEFAULT '{"periodsPerDay": 5, "days": [2, 3, 4, 5, 6, 7]}',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_schools_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_schools_code" UNIQUE ("code"),
        CONSTRAINT "FK_schools_principal" FOREIGN KEY ("principal_id")
          REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "school_academic_years" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(50) NOT NULL,
        "start_date" date NOT NULL,
        "end_date" date NOT NULL,
        "is_active" boolean NOT NULL DEFAULT false,
        "school_id" uuid NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_school_academic_years_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_school_academic_years_school_name" UNIQUE ("school_id", "name"),
        CONSTRAINT "FK_school_academic_years_school" FOREIGN KEY ("school_id")
          REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_school_academic_years_school_active"
      ON "school_academic_years" ("school_id", "is_active")
    `);

    // schools.current_academic_year_id → academic years (added after table exists)
    await queryRunner.query(`
      ALTER TABLE "schools"
      DROP CONSTRAINT IF EXISTS "FK_schools_current_academic_year"
    `);
    await queryRunner.query(`
      ALTER TABLE "schools"
      ADD CONSTRAINT "FK_schools_current_academic_year"
      FOREIGN KEY ("current_academic_year_id")
      REFERENCES "school_academic_years"("id") ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "school_subjects" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(150) NOT NULL,
        "code" character varying(30) NOT NULL,
        "color" character varying(7),
        "description" text,
        "active" boolean NOT NULL DEFAULT true,
        "school_id" uuid NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_school_subjects_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_school_subjects_school_code" UNIQUE ("school_id", "code"),
        CONSTRAINT "FK_school_subjects_school" FOREIGN KEY ("school_id")
          REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_school_subjects_school"
      ON "school_subjects" ("school_id")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "school_classes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(50) NOT NULL,
        "grade" smallint NOT NULL,
        "academic_year_id" uuid NOT NULL,
        "homeroom_teacher_id" integer,
        "max_students" smallint,
        "room" character varying(50),
        "active" boolean NOT NULL DEFAULT true,
        "school_id" uuid NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_school_classes_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_school_classes_name_year" UNIQUE ("school_id", "name", "academic_year_id"),
        CONSTRAINT "FK_school_classes_academic_year" FOREIGN KEY ("academic_year_id")
          REFERENCES "school_academic_years"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_school_classes_homeroom_teacher" FOREIGN KEY ("homeroom_teacher_id")
          REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
        CONSTRAINT "FK_school_classes_school" FOREIGN KEY ("school_id")
          REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_school_classes_school"
      ON "school_classes" ("school_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_school_classes_homeroom"
      ON "school_classes" ("homeroom_teacher_id")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "school_teaching_assignments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "teacher_id" integer NOT NULL,
        "subject_id" uuid NOT NULL,
        "class_id" uuid NOT NULL,
        "school_id" uuid NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_school_teaching_assignments_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_assignment_teacher_subject_class" UNIQUE ("teacher_id", "subject_id", "class_id"),
        CONSTRAINT "FK_assignments_teacher" FOREIGN KEY ("teacher_id")
          REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_assignments_subject" FOREIGN KEY ("subject_id")
          REFERENCES "school_subjects"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_assignments_class" FOREIGN KEY ("class_id")
          REFERENCES "school_classes"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_assignments_school" FOREIGN KEY ("school_id")
          REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_assignments_school"
      ON "school_teaching_assignments" ("school_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_assignments_teacher"
      ON "school_teaching_assignments" ("teacher_id")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "school_class_memberships" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "class_id" uuid NOT NULL,
        "student_id" integer NOT NULL,
        "school_id" uuid NOT NULL,
        "joined_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "left_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_school_class_memberships_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_membership_class_student" UNIQUE ("class_id", "student_id"),
        CONSTRAINT "FK_memberships_class" FOREIGN KEY ("class_id")
          REFERENCES "school_classes"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_memberships_student" FOREIGN KEY ("student_id")
          REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_memberships_school" FOREIGN KEY ("school_id")
          REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_memberships_school"
      ON "school_class_memberships" ("school_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_memberships_student_active"
      ON "school_class_memberships" ("student_id", "left_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Note: the 'school' enum value stays in edu_activity_type_enum —
    // PostgreSQL cannot remove a single enum value without recreating the type.
    await queryRunner.query(`DROP TABLE IF EXISTS "school_class_memberships"`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "school_teaching_assignments"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "school_classes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "school_subjects"`);
    await queryRunner.query(
      `ALTER TABLE "schools" DROP CONSTRAINT IF EXISTS "FK_schools_current_academic_year"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "school_academic_years"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "schools"`);
  }
}
