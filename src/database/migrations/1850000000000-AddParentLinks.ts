import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 2 of docs/SCHOOL_PLATFORM_PLAN.md — parent links (invite flow D5).
 * school_parent_links: GVCN generates invite_code (parent_id NULL) →
 * parent claims it → GVCN approves/revokes. Rows are never hard-deleted;
 * `revoked` keeps the audit trail.
 */
export class AddParentLinks1850000000000 implements MigrationInterface {
  name = 'AddParentLinks1850000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "school_parent_links" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "school_id" uuid NOT NULL,
        "parent_id" integer,
        "student_id" integer NOT NULL,
        "relation" character varying(20) NOT NULL,
        "parent_name" character varying(100),
        "parent_phone" character varying(30),
        "invite_code" character varying(20) NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'pending',
        "approved_by" integer,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_school_parent_links_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_parent_links_code" UNIQUE ("invite_code"),
        CONSTRAINT "FK_parent_links_school" FOREIGN KEY ("school_id")
          REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_parent_links_parent" FOREIGN KEY ("parent_id")
          REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_parent_links_student" FOREIGN KEY ("student_id")
          REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_parent_links_approver" FOREIGN KEY ("approved_by")
          REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_parent_links_school"
      ON "school_parent_links" ("school_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_parent_links_parent"
      ON "school_parent_links" ("parent_id", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_parent_links_student"
      ON "school_parent_links" ("student_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "school_parent_links"`);
  }
}
