import { MigrationInterface, QueryRunner } from 'typeorm';
export class AddAssessmentPublications1910000000002 implements MigrationInterface {
  name = 'AddAssessmentPublications1910000000002';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE school_assessment_publications (id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),\nschool_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,\ncreated_at timestamptz NOT NULL DEFAULT now(),\nupdated_at timestamptz NOT NULL DEFAULT now(),\nrevision integer NOT NULL DEFAULT 1 CHECK (revision > 0),\n"assessment_id" uuid NOT NULL,\n"submission_id" uuid NOT NULL,\n"student_id" integer NOT NULL,\n"review_revision_id" uuid NOT NULL,\n"context_snapshot" jsonb NOT NULL DEFAULT \'{}\'::jsonb,\n"normalized_score_tenths" integer NOT NULL,\n"state" text NOT NULL DEFAULT \'active\',\n"finalized_by" integer NOT NULL,\n"finalized_at" timestamptz NOT NULL,\n"withdrawn_by" integer,\n"withdrawn_at" timestamptz,\n"withdrawal_reason" text,\nUNIQUE(school_id,id),\nUNIQUE(school_id,assessment_id,id),\nUNIQUE(submission_id),\nUNIQUE(assessment_id,student_id),\nCHECK(normalized_score_tenths BETWEEN 0 AND 100),\nCHECK(state IN (\'active\',\'withdrawn\')))',
    );
    await queryRunner.query(
      'CREATE INDEX school_assessment_publications_tenant ON school_assessment_publications(school_id,created_at)',
    );
    await queryRunner.query(
      'ALTER TABLE school_assessment_publications ADD FOREIGN KEY(school_id,assessment_id) REFERENCES school_assessments(school_id,id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'ALTER TABLE school_assessment_publications ADD FOREIGN KEY(school_id,assessment_id,submission_id) REFERENCES school_assessment_submissions(school_id,assessment_id,id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'ALTER TABLE school_assessment_publications ADD FOREIGN KEY(school_id,assessment_id,review_revision_id) REFERENCES school_assessment_review_revisions(school_id,assessment_id,id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'ALTER TABLE school_grades ADD COLUMN assessment_publication_id uuid NULL',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX assessment_grade_source_unique ON school_grades(assessment_publication_id) WHERE assessment_publication_id IS NOT NULL',
    );
    await queryRunner.query(
      'ALTER TABLE school_grades ADD CONSTRAINT assessment_grade_source_fk FOREIGN KEY(school_id,assessment_publication_id) REFERENCES school_assessment_publications(school_id,id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'ALTER TABLE school_grades ADD CONSTRAINT assessment_grade_source_exclusive CHECK(assessment_publication_id IS NULL OR (quiz_session_id IS NULL AND homework_id IS NULL))',
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE school_grades DROP CONSTRAINT assessment_grade_source_exclusive',
    );
    await queryRunner.query(
      'ALTER TABLE school_grades DROP CONSTRAINT assessment_grade_source_fk',
    );
    await queryRunner.query('DROP INDEX assessment_grade_source_unique');
    await queryRunner.query(
      'ALTER TABLE school_grades DROP COLUMN assessment_publication_id',
    );
    await queryRunner.query(
      'DROP TABLE school_assessment_publications CASCADE',
    );
  }
}
