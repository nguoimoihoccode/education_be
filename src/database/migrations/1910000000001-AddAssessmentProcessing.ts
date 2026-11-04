import { MigrationInterface, QueryRunner } from 'typeorm';
export class AddAssessmentProcessing1910000000001 implements MigrationInterface {
  name = 'AddAssessmentProcessing1910000000001';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE school_assessment_grading_runs (id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),\nschool_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,\ncreated_at timestamptz NOT NULL DEFAULT now(),\nupdated_at timestamptz NOT NULL DEFAULT now(),\nrevision integer NOT NULL DEFAULT 1 CHECK (revision > 0),\n"assessment_id" uuid NOT NULL,\n"submission_id" uuid NOT NULL,\n"exam_version_id" uuid NOT NULL,\n"input_revision" integer NOT NULL,\n"scope_question_keys" jsonb NOT NULL DEFAULT \'{}\'::jsonb,\n"answer_revision_manifest" jsonb NOT NULL DEFAULT \'{}\'::jsonb,\n"question_fingerprints" jsonb NOT NULL DEFAULT \'{}\'::jsonb,\n"profile_snapshot" jsonb NOT NULL DEFAULT \'{}\'::jsonb,\n"prompt_snapshot_key" text NOT NULL,\n"code_revision" text NOT NULL,\n"status" text NOT NULL,\n"output" jsonb NOT NULL DEFAULT \'{}\'::jsonb,\n"reused_from_run_ids" jsonb NOT NULL DEFAULT \'{}\'::jsonb,\n"usage_summary" jsonb NOT NULL DEFAULT \'{}\'::jsonb,\n"started_at" timestamptz,\n"finished_at" timestamptz,\nUNIQUE(school_id,id),\nUNIQUE(school_id,assessment_id,id))',
    );
    await queryRunner.query(
      'CREATE INDEX school_assessment_grading_runs_tenant ON school_assessment_grading_runs(school_id,created_at)',
    );
    await queryRunner.query(
      'CREATE TABLE school_assessment_review_revisions (id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),\nschool_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,\ncreated_at timestamptz NOT NULL DEFAULT now(),\nupdated_at timestamptz NOT NULL DEFAULT now(),\nrevision integer NOT NULL DEFAULT 1 CHECK (revision > 0),\n"assessment_id" uuid NOT NULL,\n"submission_id" uuid NOT NULL,\n"revision_number" integer NOT NULL,\n"exam_version_id" uuid NOT NULL,\n"input_manifest" jsonb NOT NULL DEFAULT \'{}\'::jsonb,\n"effective_results" jsonb NOT NULL DEFAULT \'{}\'::jsonb,\n"flags" jsonb NOT NULL DEFAULT \'{}\'::jsonb,\n"earned_units" integer,\n"ungraded_max_units" integer NOT NULL,\n"content_hash" text NOT NULL,\n"created_by" integer,\nUNIQUE(school_id,id),\nUNIQUE(school_id,assessment_id,id),\nUNIQUE(submission_id,revision_number),\nCHECK(earned_units IS NULL OR earned_units>=0),\nCHECK(ungraded_max_units>=0))',
    );
    await queryRunner.query(
      'CREATE INDEX school_assessment_review_revisions_tenant ON school_assessment_review_revisions(school_id,created_at)',
    );
    await queryRunner.query(
      'CREATE TABLE school_assessment_review_events (id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),\nschool_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,\ncreated_at timestamptz NOT NULL DEFAULT now(),\nupdated_at timestamptz NOT NULL DEFAULT now(),\nrevision integer NOT NULL DEFAULT 1 CHECK (revision > 0),\n"assessment_id" uuid NOT NULL,\n"submission_id" uuid,\n"actor_id" integer,\n"event_type" text NOT NULL,\n"before_ref" jsonb NOT NULL DEFAULT \'{}\'::jsonb,\n"after_ref" jsonb NOT NULL DEFAULT \'{}\'::jsonb,\n"reason" text,\n"request_id" text NOT NULL,\n"event_payload" jsonb NOT NULL DEFAULT \'{}\'::jsonb,\nUNIQUE(school_id,id),\nUNIQUE(school_id,assessment_id,id))',
    );
    await queryRunner.query(
      'CREATE INDEX school_assessment_review_events_tenant ON school_assessment_review_events(school_id,created_at)',
    );
    await queryRunner.query(
      "CREATE TABLE school_assessment_jobs (id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),\nschool_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,\ncreated_at timestamptz NOT NULL DEFAULT now(),\nupdated_at timestamptz NOT NULL DEFAULT now(),\nrevision integer NOT NULL DEFAULT 1 CHECK (revision > 0),\n\"assessment_id\" uuid NOT NULL,\n\"submission_id\" uuid,\n\"stage\" text NOT NULL,\n\"scope_key\" text NOT NULL,\n\"input_hash\" text NOT NULL,\n\"data\" jsonb NOT NULL DEFAULT '{}'::jsonb,\n\"state\" text NOT NULL DEFAULT 'pending',\n\"dispatch_generation\" integer NOT NULL DEFAULT 0,\n\"lease_token\" uuid,\n\"lease_until\" timestamptz,\n\"lease_owner\" text,\n\"fencing_token\" integer NOT NULL DEFAULT 0,\n\"attempt_count\" integer NOT NULL DEFAULT 0,\n\"next_attempt_at\" timestamptz NOT NULL,\n\"last_error_code\" text,\n\"result_ref\" jsonb NOT NULL DEFAULT '{}'::jsonb,\n\"execution_target\" text NOT NULL DEFAULT 'vps_colocated',\n\"routing_version\" text NOT NULL DEFAULT '1',\n\"routing_policy_hash\" text NOT NULL,\n\"producer_agent\" text NOT NULL,\nUNIQUE(school_id,id),\nUNIQUE(school_id,assessment_id,id),\nUNIQUE(school_id,stage,scope_key,input_hash),\nCHECK(stage IN ('seal','prepare','template','extract','grade','aggregate','export','purge')),\nCHECK(state IN ('pending','dispatched','running','retry_wait','paused','succeeded','failed','cancelled','superseded')),\nCHECK(attempt_count>=0 AND fencing_token>=0))",
    );
    await queryRunner.query(
      'CREATE INDEX school_assessment_jobs_tenant ON school_assessment_jobs(school_id,created_at)',
    );
    await queryRunner.query(
      'CREATE TABLE school_assessment_provider_calls (id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),\nschool_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,\ncreated_at timestamptz NOT NULL DEFAULT now(),\nupdated_at timestamptz NOT NULL DEFAULT now(),\nrevision integer NOT NULL DEFAULT 1 CHECK (revision > 0),\n"job_id" uuid NOT NULL,\n"attempt_number" integer NOT NULL,\n"profile_hash" text NOT NULL,\n"provider" text NOT NULL,\n"model_requested" text NOT NULL,\n"model_reported" text,\n"purpose" text NOT NULL,\n"request_hash" text NOT NULL,\n"response_object_key" text,\n"provider_request_id" text,\n"state" text NOT NULL,\n"input_usage" jsonb NOT NULL DEFAULT \'{}\'::jsonb,\n"output_usage" jsonb NOT NULL DEFAULT \'{}\'::jsonb,\n"reserved_cost_micros" bigint NOT NULL,\n"actual_cost_micros" bigint,\n"latency_ms" integer,\n"error_code" text,\nUNIQUE(school_id,id),\nUNIQUE(job_id,attempt_number,request_hash))',
    );
    await queryRunner.query(
      'CREATE INDEX school_assessment_provider_calls_tenant ON school_assessment_provider_calls(school_id,created_at)',
    );
    await queryRunner.query(
      'CREATE TABLE school_assessment_exports (id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),\nschool_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,\ncreated_at timestamptz NOT NULL DEFAULT now(),\nupdated_at timestamptz NOT NULL DEFAULT now(),\nrevision integer NOT NULL DEFAULT 1 CHECK (revision > 0),\n"assessment_id" uuid NOT NULL,\n"format" text NOT NULL,\n"snapshot_manifest" jsonb NOT NULL DEFAULT \'{}\'::jsonb,\n"state" text NOT NULL DEFAULT \'queued\',\n"output_object_key" text,\n"created_by" integer NOT NULL,\n"expires_at" timestamptz NOT NULL,\n"error_code" text,\nUNIQUE(school_id,id),\nUNIQUE(school_id,assessment_id,id))',
    );
    await queryRunner.query(
      'CREATE INDEX school_assessment_exports_tenant ON school_assessment_exports(school_id,created_at)',
    );
    await queryRunner.query(
      'CREATE TABLE school_assessment_idempotency (id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),\nschool_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,\ncreated_at timestamptz NOT NULL DEFAULT now(),\nupdated_at timestamptz NOT NULL DEFAULT now(),\nrevision integer NOT NULL DEFAULT 1 CHECK (revision > 0),\n"actor_id" integer NOT NULL,\n"route_scope" text NOT NULL,\n"idempotency_key" text NOT NULL,\n"request_hash" text NOT NULL,\n"state" text NOT NULL DEFAULT \'running\',\n"response_status" integer,\n"response_body" jsonb NOT NULL DEFAULT \'{}\'::jsonb,\n"lease_until" timestamptz NOT NULL,\n"expires_at" timestamptz NOT NULL,\nUNIQUE(school_id,id),\nUNIQUE(school_id,actor_id,route_scope,idempotency_key))',
    );
    await queryRunner.query(
      'CREATE INDEX school_assessment_idempotency_tenant ON school_assessment_idempotency(school_id,created_at)',
    );
    await queryRunner.query(
      'ALTER TABLE school_assessment_grading_runs ADD FOREIGN KEY(school_id,assessment_id) REFERENCES school_assessments(school_id,id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'ALTER TABLE school_assessment_grading_runs ADD FOREIGN KEY(school_id,assessment_id,submission_id) REFERENCES school_assessment_submissions(school_id,assessment_id,id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'ALTER TABLE school_assessment_grading_runs ADD FOREIGN KEY(school_id,assessment_id,exam_version_id) REFERENCES school_assessment_exam_versions(school_id,assessment_id,id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'ALTER TABLE school_assessment_review_revisions ADD FOREIGN KEY(school_id,assessment_id) REFERENCES school_assessments(school_id,id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'ALTER TABLE school_assessment_review_revisions ADD FOREIGN KEY(school_id,assessment_id,submission_id) REFERENCES school_assessment_submissions(school_id,assessment_id,id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'ALTER TABLE school_assessment_review_revisions ADD FOREIGN KEY(school_id,assessment_id,exam_version_id) REFERENCES school_assessment_exam_versions(school_id,assessment_id,id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'ALTER TABLE school_assessment_review_events ADD FOREIGN KEY(school_id,assessment_id) REFERENCES school_assessments(school_id,id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'ALTER TABLE school_assessment_review_events ADD FOREIGN KEY(school_id,assessment_id,submission_id) REFERENCES school_assessment_submissions(school_id,assessment_id,id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'ALTER TABLE school_assessment_jobs ADD FOREIGN KEY(school_id,assessment_id) REFERENCES school_assessments(school_id,id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'ALTER TABLE school_assessment_jobs ADD FOREIGN KEY(school_id,assessment_id,submission_id) REFERENCES school_assessment_submissions(school_id,assessment_id,id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'ALTER TABLE school_assessment_provider_calls ADD FOREIGN KEY(school_id,job_id) REFERENCES school_assessment_jobs(school_id,id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'ALTER TABLE school_assessment_exports ADD FOREIGN KEY(school_id,assessment_id) REFERENCES school_assessments(school_id,id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'ALTER TABLE school_assessment_submissions ADD CONSTRAINT assessment_current_review_fk FOREIGN KEY(school_id,assessment_id,current_review_revision_id) REFERENCES school_assessment_review_revisions(school_id,assessment_id,id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'CREATE INDEX assessment_job_claim ON school_assessment_jobs(state,next_attempt_at,lease_until)',
    );
    await queryRunner.query(
      `CREATE FUNCTION assessment_reject_snapshot_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'assessment snapshots are immutable' USING ERRCODE = '23514'; END $$`,
    );
    await queryRunner.query(
      'CREATE TRIGGER assessment_immutable BEFORE UPDATE OR DELETE ON school_assessment_pages FOR EACH ROW EXECUTE FUNCTION assessment_reject_snapshot_mutation()',
    );
    await queryRunner.query(
      'CREATE TRIGGER assessment_immutable BEFORE UPDATE OR DELETE ON school_assessment_regions FOR EACH ROW EXECUTE FUNCTION assessment_reject_snapshot_mutation()',
    );
    await queryRunner.query(
      'CREATE TRIGGER assessment_immutable BEFORE UPDATE OR DELETE ON school_assessment_answer_revisions FOR EACH ROW EXECUTE FUNCTION assessment_reject_snapshot_mutation()',
    );
    await queryRunner.query(
      'CREATE TRIGGER assessment_immutable BEFORE UPDATE OR DELETE ON school_assessment_review_revisions FOR EACH ROW EXECUTE FUNCTION assessment_reject_snapshot_mutation()',
    );
    await queryRunner.query(
      'CREATE TRIGGER assessment_immutable BEFORE UPDATE OR DELETE ON school_assessment_review_events FOR EACH ROW EXECUTE FUNCTION assessment_reject_snapshot_mutation()',
    );
    await queryRunner.query(
      `CREATE FUNCTION assessment_protect_exam_document() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.document IS DISTINCT FROM OLD.document OR NEW.question_content_hash IS DISTINCT FROM OLD.question_content_hash OR NEW.grading_spec_hash IS DISTINCT FROM OLD.grading_spec_hash OR NEW.exam_code IS DISTINCT FROM OLD.exam_code OR NEW.source_region_ids IS DISTINCT FROM OLD.source_region_ids THEN RAISE EXCEPTION 'create a new exam version to edit content' USING ERRCODE = '23514'; END IF; RETURN NEW; END $$`,
    );
    await queryRunner.query(
      'CREATE TRIGGER assessment_exam_content_immutable BEFORE UPDATE ON school_assessment_exam_versions FOR EACH ROW EXECUTE FUNCTION assessment_protect_exam_document()',
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TRIGGER assessment_exam_content_immutable ON school_assessment_exam_versions',
    );
    await queryRunner.query('DROP FUNCTION assessment_protect_exam_document()');
    await queryRunner.query(
      'DROP TRIGGER assessment_immutable ON school_assessment_pages',
    );
    await queryRunner.query(
      'DROP TRIGGER assessment_immutable ON school_assessment_regions',
    );
    await queryRunner.query(
      'DROP TRIGGER assessment_immutable ON school_assessment_answer_revisions',
    );
    await queryRunner.query(
      'DROP TRIGGER assessment_immutable ON school_assessment_review_revisions',
    );
    await queryRunner.query(
      'DROP TRIGGER assessment_immutable ON school_assessment_review_events',
    );
    await queryRunner.query(
      'DROP FUNCTION assessment_reject_snapshot_mutation()',
    );

    await queryRunner.query(
      'ALTER TABLE school_assessment_submissions DROP CONSTRAINT assessment_current_review_fk',
    );
    await queryRunner.query('DROP TABLE school_assessment_idempotency CASCADE');
    await queryRunner.query('DROP TABLE school_assessment_exports CASCADE');
    await queryRunner.query(
      'DROP TABLE school_assessment_provider_calls CASCADE',
    );
    await queryRunner.query('DROP TABLE school_assessment_jobs CASCADE');
    await queryRunner.query(
      'DROP TABLE school_assessment_review_events CASCADE',
    );
    await queryRunner.query(
      'DROP TABLE school_assessment_review_revisions CASCADE',
    );
    await queryRunner.query(
      'DROP TABLE school_assessment_grading_runs CASCADE',
    );
  }
}
