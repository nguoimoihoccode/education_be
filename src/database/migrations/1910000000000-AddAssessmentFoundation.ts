import { MigrationInterface, QueryRunner } from 'typeorm';
export class AddAssessmentFoundation1910000000000 implements MigrationInterface {
  name = 'AddAssessmentFoundation1910000000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE school_assessments (id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),\nschool_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,\ncreated_at timestamptz NOT NULL DEFAULT now(),\nupdated_at timestamptz NOT NULL DEFAULT now(),\nrevision integer NOT NULL DEFAULT 1 CHECK (revision > 0),\n"class_id" uuid NOT NULL,\n"subject_id" uuid NOT NULL,\n"academic_year_id" uuid NOT NULL,\n"owner_id" integer NOT NULL,\n"title" text NOT NULL,\n"exam_date" date NOT NULL,\n"term" integer NOT NULL,\n"test_type" text NOT NULL,\n"coefficient" integer NOT NULL,\n"max_score_units" integer NOT NULL,\n"context_revision" integer NOT NULL DEFAULT 1,\n"archived_at" timestamptz,\nUNIQUE(school_id,id),\nCHECK(term IN (1,2)),\nCHECK(coefficient IN (1,2)),\nCHECK(max_score_units BETWEEN 1 AND 1000000),\nCHECK(test_type IN (\'oral\',\'15min\',\'45min\',\'final\')))',
    );
    await queryRunner.query(
      'CREATE INDEX school_assessments_tenant ON school_assessments(school_id,created_at)',
    );
    await queryRunner.query(
      'CREATE TABLE school_assessment_roster (id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),\nschool_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,\ncreated_at timestamptz NOT NULL DEFAULT now(),\nupdated_at timestamptz NOT NULL DEFAULT now(),\nrevision integer NOT NULL DEFAULT 1 CHECK (revision > 0),\n"assessment_id" uuid NOT NULL,\n"student_id" integer NOT NULL,\n"display_name_snapshot" text NOT NULL,\n"student_code_snapshot" text,\n"membership_id" uuid NOT NULL,\n"added_by" integer NOT NULL,\n"added_at" timestamptz NOT NULL,\nUNIQUE(school_id,id),\nUNIQUE(school_id,assessment_id,id),\nUNIQUE(assessment_id,student_id))',
    );
    await queryRunner.query(
      'CREATE INDEX school_assessment_roster_tenant ON school_assessment_roster(school_id,created_at)',
    );
    await queryRunner.query(
      'CREATE TABLE school_assessment_exam_versions (id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),\nschool_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,\ncreated_at timestamptz NOT NULL DEFAULT now(),\nupdated_at timestamptz NOT NULL DEFAULT now(),\nrevision integer NOT NULL DEFAULT 1 CHECK (revision > 0),\n"assessment_id" uuid NOT NULL,\n"exam_code" text NOT NULL,\n"version_number" integer NOT NULL,\n"state" text NOT NULL DEFAULT \'draft\',\n"document" jsonb NOT NULL DEFAULT \'{}\'::jsonb,\n"question_content_hash" text NOT NULL,\n"grading_spec_hash" text NOT NULL,\n"source_region_ids" jsonb NOT NULL DEFAULT \'{}\'::jsonb,\n"draft_source" text NOT NULL DEFAULT \'teacher\',\n"approved_by" integer,\n"approved_at" timestamptz,\nUNIQUE(school_id,id),\nUNIQUE(school_id,assessment_id,id),\nUNIQUE(assessment_id,exam_code,version_number),\nCHECK(state IN (\'draft\',\'approved\',\'superseded\')))',
    );
    await queryRunner.query(
      'CREATE INDEX school_assessment_exam_versions_tenant ON school_assessment_exam_versions(school_id,created_at)',
    );
    await queryRunner.query(
      'CREATE TABLE school_assessment_submissions (id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),\nschool_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,\ncreated_at timestamptz NOT NULL DEFAULT now(),\nupdated_at timestamptz NOT NULL DEFAULT now(),\nrevision integer NOT NULL DEFAULT 1 CHECK (revision > 0),\n"assessment_id" uuid NOT NULL,\n"client_group_id" text NOT NULL,\n"student_id" integer,\n"identity_state" text NOT NULL DEFAULT \'unresolved\',\n"identity_revision" integer NOT NULL DEFAULT 1,\n"exam_version_id" uuid,\n"input_revision" integer NOT NULL DEFAULT 1,\n"processing_state" text NOT NULL DEFAULT \'idle\',\n"current_page_ids" jsonb NOT NULL DEFAULT \'{}\'::jsonb,\n"current_answer_revision_ids" jsonb NOT NULL DEFAULT \'{}\'::jsonb,\n"current_review_revision_id" uuid,\n"deleted_at" timestamptz,\nUNIQUE(school_id,id),\nUNIQUE(school_id,assessment_id,id),\nUNIQUE(assessment_id,client_group_id),\nCHECK(input_revision>0 AND identity_revision>0),\nCHECK(identity_state IN (\'unresolved\',\'proposed\',\'confirmed\',\'conflict\')))',
    );
    await queryRunner.query(
      'CREATE INDEX school_assessment_submissions_tenant ON school_assessment_submissions(school_id,created_at)',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX assessment_submission_student_unique ON school_assessment_submissions(assessment_id,student_id) WHERE student_id IS NOT NULL AND deleted_at IS NULL',
    );
    await queryRunner.query(
      'CREATE TABLE school_assessment_assets (id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),\nschool_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,\ncreated_at timestamptz NOT NULL DEFAULT now(),\nupdated_at timestamptz NOT NULL DEFAULT now(),\nrevision integer NOT NULL DEFAULT 1 CHECK (revision > 0),\n"assessment_id" uuid NOT NULL,\n"submission_id" uuid,\n"purpose" text NOT NULL,\n"original_name" text NOT NULL,\n"declared_mime" text NOT NULL,\n"verified_mime" text,\n"byte_size" bigint NOT NULL,\n"sha256" text,\n"staging_key" text,\n"sealed_key" text,\n"storage_version_id" text,\n"state" text NOT NULL DEFAULT \'uploading\',\n"upload_expires_at" timestamptz NOT NULL,\n"sealed_at" timestamptz,\nUNIQUE(school_id,id),\nUNIQUE(school_id,assessment_id,id),\nCHECK(byte_size BETWEEN 1 AND 52428800),\nCHECK(purpose IN (\'student_work\',\'marking_guide\')),\nCHECK(purpose <> \'student_work\' OR submission_id IS NOT NULL))',
    );
    await queryRunner.query(
      'CREATE INDEX school_assessment_assets_tenant ON school_assessment_assets(school_id,created_at)',
    );
    await queryRunner.query(
      'CREATE TABLE school_assessment_pages (id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),\nschool_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,\ncreated_at timestamptz NOT NULL DEFAULT now(),\nupdated_at timestamptz NOT NULL DEFAULT now(),\nrevision integer NOT NULL DEFAULT 1 CHECK (revision > 0),\n"assessment_id" uuid NOT NULL,\n"submission_id" uuid,\n"asset_id" uuid NOT NULL,\n"source_page_number" integer NOT NULL,\n"analysis_revision" integer NOT NULL,\n"width_px" integer NOT NULL,\n"height_px" integer NOT NULL,\n"analysis_object_key" text NOT NULL,\n"page_role" text NOT NULL,\n"primary_polygon" jsonb NOT NULL DEFAULT \'{}\'::jsonb,\n"transform_to_original" jsonb NOT NULL DEFAULT \'{}\'::jsonb,\n"quality" jsonb NOT NULL DEFAULT \'{}\'::jsonb,\nUNIQUE(school_id,id),\nUNIQUE(school_id,assessment_id,id),\nUNIQUE(asset_id,source_page_number,analysis_revision))',
    );
    await queryRunner.query(
      'CREATE INDEX school_assessment_pages_tenant ON school_assessment_pages(school_id,created_at)',
    );
    await queryRunner.query(
      'CREATE TABLE school_assessment_regions (id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),\nschool_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,\ncreated_at timestamptz NOT NULL DEFAULT now(),\nupdated_at timestamptz NOT NULL DEFAULT now(),\nrevision integer NOT NULL DEFAULT 1 CHECK (revision > 0),\n"assessment_id" uuid NOT NULL,\n"page_id" uuid NOT NULL,\n"region_key" text NOT NULL,\n"role" text NOT NULL,\n"polygon" jsonb NOT NULL DEFAULT \'{}\'::jsonb,\n"text" text,\n"structured_content" jsonb NOT NULL DEFAULT \'{}\'::jsonb,\n"source_token_refs" jsonb NOT NULL DEFAULT \'{}\'::jsonb,\n"parent_region_id" uuid,\n"reader_profile_hash" text NOT NULL,\nUNIQUE(school_id,id),\nUNIQUE(school_id,assessment_id,id),\nUNIQUE(page_id,region_key))',
    );
    await queryRunner.query(
      'CREATE INDEX school_assessment_regions_tenant ON school_assessment_regions(school_id,created_at)',
    );
    await queryRunner.query(
      'CREATE TABLE school_assessment_answer_revisions (id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),\nschool_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,\ncreated_at timestamptz NOT NULL DEFAULT now(),\nupdated_at timestamptz NOT NULL DEFAULT now(),\nrevision integer NOT NULL DEFAULT 1 CHECK (revision > 0),\n"assessment_id" uuid NOT NULL,\n"submission_id" uuid NOT NULL,\n"exam_version_id" uuid NOT NULL,\n"question_key" text NOT NULL,\n"revision_number" integer NOT NULL,\n"observation_state" text NOT NULL,\n"content" jsonb NOT NULL DEFAULT \'{}\'::jsonb,\n"source_region_ids" jsonb NOT NULL DEFAULT \'{}\'::jsonb,\n"origin" text NOT NULL,\n"supersedes_id" uuid,\n"reason" text,\n"content_hash" text NOT NULL,\nUNIQUE(school_id,id),\nUNIQUE(school_id,assessment_id,id),\nUNIQUE(submission_id,question_key,revision_number))',
    );
    await queryRunner.query(
      'CREATE INDEX school_assessment_answer_revisions_tenant ON school_assessment_answer_revisions(school_id,created_at)',
    );
    await queryRunner.query(
      'ALTER TABLE school_assessment_roster ADD FOREIGN KEY(school_id,assessment_id) REFERENCES school_assessments(school_id,id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'ALTER TABLE school_assessment_exam_versions ADD FOREIGN KEY(school_id,assessment_id) REFERENCES school_assessments(school_id,id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'ALTER TABLE school_assessment_submissions ADD FOREIGN KEY(school_id,assessment_id) REFERENCES school_assessments(school_id,id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'ALTER TABLE school_assessment_submissions ADD FOREIGN KEY(school_id,assessment_id,exam_version_id) REFERENCES school_assessment_exam_versions(school_id,assessment_id,id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'ALTER TABLE school_assessment_assets ADD FOREIGN KEY(school_id,assessment_id) REFERENCES school_assessments(school_id,id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'ALTER TABLE school_assessment_assets ADD FOREIGN KEY(school_id,assessment_id,submission_id) REFERENCES school_assessment_submissions(school_id,assessment_id,id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'ALTER TABLE school_assessment_pages ADD FOREIGN KEY(school_id,assessment_id) REFERENCES school_assessments(school_id,id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'ALTER TABLE school_assessment_pages ADD FOREIGN KEY(school_id,assessment_id,submission_id) REFERENCES school_assessment_submissions(school_id,assessment_id,id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'ALTER TABLE school_assessment_pages ADD FOREIGN KEY(school_id,assessment_id,asset_id) REFERENCES school_assessment_assets(school_id,assessment_id,id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'ALTER TABLE school_assessment_regions ADD FOREIGN KEY(school_id,assessment_id) REFERENCES school_assessments(school_id,id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'ALTER TABLE school_assessment_regions ADD FOREIGN KEY(school_id,assessment_id,page_id) REFERENCES school_assessment_pages(school_id,assessment_id,id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'ALTER TABLE school_assessment_answer_revisions ADD FOREIGN KEY(school_id,assessment_id) REFERENCES school_assessments(school_id,id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'ALTER TABLE school_assessment_answer_revisions ADD FOREIGN KEY(school_id,assessment_id,submission_id) REFERENCES school_assessment_submissions(school_id,assessment_id,id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'ALTER TABLE school_assessment_answer_revisions ADD FOREIGN KEY(school_id,assessment_id,exam_version_id) REFERENCES school_assessment_exam_versions(school_id,assessment_id,id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX assessment_class_tenant_id ON school_classes(school_id,id)',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX assessment_subject_tenant_id ON school_subjects(school_id,id)',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX assessment_year_tenant_id ON school_academic_years(school_id,id)',
    );
    await queryRunner.query(
      'ALTER TABLE school_assessments ADD FOREIGN KEY(school_id,class_id) REFERENCES school_classes(school_id,id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'ALTER TABLE school_assessments ADD FOREIGN KEY(school_id,subject_id) REFERENCES school_subjects(school_id,id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'ALTER TABLE school_assessments ADD FOREIGN KEY(school_id,academic_year_id) REFERENCES school_academic_years(school_id,id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'ALTER TABLE school_assessment_roster ADD FOREIGN KEY(student_id) REFERENCES users(id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'ALTER TABLE school_assessment_submissions ADD FOREIGN KEY(assessment_id,student_id) REFERENCES school_assessment_roster(assessment_id,student_id) ON DELETE RESTRICT',
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TABLE school_assessment_answer_revisions CASCADE',
    );
    await queryRunner.query('DROP TABLE school_assessment_regions CASCADE');
    await queryRunner.query('DROP TABLE school_assessment_pages CASCADE');
    await queryRunner.query('DROP TABLE school_assessment_assets CASCADE');
    await queryRunner.query('DROP TABLE school_assessment_submissions CASCADE');
    await queryRunner.query(
      'DROP TABLE school_assessment_exam_versions CASCADE',
    );
    await queryRunner.query('DROP TABLE school_assessment_roster CASCADE');
    await queryRunner.query('DROP TABLE school_assessments CASCADE');
    await queryRunner.query('DROP INDEX IF EXISTS assessment_class_tenant_id');
    await queryRunner.query(
      'DROP INDEX IF EXISTS assessment_subject_tenant_id',
    );
    await queryRunner.query('DROP INDEX IF EXISTS assessment_year_tenant_id');
  }
}
