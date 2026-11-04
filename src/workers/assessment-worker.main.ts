import 'reflect-metadata';
import { mkdir, rm, writeFile, readdir, lstat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import db from '../database/data-source';
import { loadRouting } from '../modules/assessment/runtime/routing';
import { AssessmentEngine } from '../modules/assessment/runtime/engine';

async function main() {
  if (process.env.ASSESSMENT_ENABLED !== 'true')
    throw new Error('assessment_disabled');
  const workspace = resolve(
    process.env.ASSESSMENT_WORKSPACE_PATH || '/app/workspace',
  );
  const heartbeat = resolve(
    process.env.ASSESSMENT_WORKER_HEARTBEAT_PATH ||
      join(workspace, 'heartbeat'),
  );
  if (!heartbeat.startsWith(`${workspace}/`))
    throw new Error('heartbeat_path_invalid');
  await mkdir(workspace, { recursive: true, mode: 0o700 });
  await rm(heartbeat, { force: true });
  // Old abandoned process directories only. Active work is never removed by a timer.
  for (const entry of await readdir(workspace)) {
    if (!entry.startsWith('assessment-')) continue;
    const path = join(workspace, entry);
    const stat = await lstat(path);
    if (
      stat.isDirectory() &&
      !stat.isSymbolicLink() &&
      Date.now() - stat.mtimeMs > 86400000
    )
      await rm(path, { recursive: true, force: true });
  }
  const cfg = loadRouting();
  if (!process.env[cfg.policy.auditSeedRef])
    throw new Error('audit_seed_required');
  for (const agent of Object.values(cfg.agents))
    for (const id of [
      agent.primaryProfileId,
      agent.fallbackProfileId,
      agent.escalationProfileId,
      agent.visionProfileId,
    ])
      if (id && !process.env[cfg.profiles[id].credentialRef])
        throw new Error('provider_credentials_required');
  if (
    !process.env.ASSESSMENT_QUEUE_REDIS_URL ||
    process.env.ASSESSMENT_QUEUE_REDIS_URL === process.env.REDIS_URL
  )
    throw new Error('dedicated_queue_required');
  await db.initialize();
  const engine = new AssessmentEngine(db, cfg, workspace);
  let stopping = false;
  let healthTimer: NodeJS.Timeout | undefined;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    if (healthTimer) clearInterval(healthTimer);
    await rm(heartbeat, { force: true });
    await engine.stop();
    await db.destroy();
  };
  process.once('SIGTERM', () => {
    void stop().catch(() => {
      process.exitCode = 1;
    });
  });
  process.once('SIGINT', () => {
    void stop().catch(() => {
      process.exitCode = 1;
    });
  });
  try {
    await engine.start();
    const health = async () => {
      try {
        await engine.health();
        await writeFile(heartbeat, new Date().toISOString(), { mode: 0o600 });
      } catch {
        await rm(heartbeat, { force: true });
      }
    };
    await health();
    healthTimer = setInterval(() => {
      void health();
    }, 30000);
  } catch (error) {
    await stop();
    throw error;
  }
}
void main().catch(() => {
  console.error(
    'Assessment worker failed readiness; check configured dependencies and release gates.',
  );
  process.exitCode = 1;
});
