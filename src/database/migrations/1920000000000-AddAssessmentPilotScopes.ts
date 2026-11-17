import { MigrationInterface, QueryRunner } from 'typeorm';
/**
 * Pilot gate per school × class × subject (design §4). A missing row means
 * closed: nothing is processed until operations opens the scope.
 */
export class AddAssessmentPilotScopes1920000000000 implements MigrationInterface {
  name = 'AddAssessmentPilotScopes1920000000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE school_assessment_pilot_scopes (id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
class_id uuid NOT NULL REFERENCES school_classes(id) ON DELETE RESTRICT,
subject_id uuid NOT NULL REFERENCES school_subjects(id) ON DELETE RESTRICT,
state text NOT NULL DEFAULT 'closed',
reason text NOT NULL,
updated_by integer NOT NULL,
UNIQUE(school_id,id),
UNIQUE(school_id,class_id,subject_id),
CHECK(state IN ('closed','active','paused')),
CHECK(length(btrim(reason)) BETWEEN 3 AND 500))`,
    );
    await queryRunner.query(
      `CREATE TABLE school_assessment_pilot_scope_events (id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
school_id uuid NOT NULL,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
scope_id uuid NOT NULL,
from_state text NULL,
to_state text NOT NULL,
scope_revision integer NOT NULL,
actor_id integer NOT NULL,
reason text NOT NULL,
FOREIGN KEY(school_id,scope_id) REFERENCES school_assessment_pilot_scopes(school_id,id) ON DELETE RESTRICT)`,
    );
    await queryRunner.query(
      'CREATE INDEX school_assessment_pilot_scope_events_scope ON school_assessment_pilot_scope_events(scope_id,created_at)',
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE school_assessment_pilot_scope_events');
    await queryRunner.query('DROP TABLE school_assessment_pilot_scopes');
  }
}
