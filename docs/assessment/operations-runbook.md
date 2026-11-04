# Assessment VPS operations

Assessment is disabled by default. The `assessment` Compose profile adds a separate worker and durable Redis; it does not activate API commands. There are no GPU, local model, Mac, or self-hosted object-storage requirements. Do not enable real student uploads before storage, privacy, budget and recovery acceptance passes.

## Deployment inputs

Use Docker Compose 2.24+ (optional dedicated worker env file support). Root `docker-compose.yml` builds from `education_be`; root production manifest also builds the worker from `education_be`; backend `docker-compose.prod.yml` builds it from `.`. Run from the matching checkout directory. Production API/frontend retain their existing image workflow. The backend release workflow now builds/pushes the worker image separately with the same commit SHA; an explicit VPS build from the matching reviewed checkout is an alternative. Set `ASSESSMENT_WORKER_IMAGE` and `IMAGE_TAG` to the matching immutable release when pulling a published image. The API image and worker image remain separate artifacts.

Copy the appropriate `.env.prod.example` to a private runtime env file outside version control; preserve current database/API settings. Compose uses `--env-file` for interpolation. Production API also reads `.env.prod`; development API reads `education_be/.env.docker`. Set assessment settings in the Compose env file, and provider keys only in the dedicated worker env file; API job creation validates routing without requiring model secrets. Never use `printenv`, resolved `docker compose config`, `docker inspect` environment dumps, signed URLs, student bytes, or raw provider responses in shared logs.

Provision a private external S3-compatible bucket first. Configure `ASSESSMENT_S3_ENDPOINT` as HTTPS, region, bucket, restricted access key and secret. Browser and VPS must reach the endpoint; configure exact frontend CORS origins, POST/read support and staging/sealed/derivative/report prefix permissions. Block public reads/listing and client writes to sealed prefixes. Configure lifecycle for abandoned staging and product retention, versioning/backup as appropriate, and prove upload–seal–read and restore. No MinIO service is started by these manifests.

Put the private routing JSON at `ASSESSMENT_CONFIG_DIR/routing.json`, accessible to UID 1001, with `ASSESSMENT_ROUTING_CONFIG_PATH=/app/assessment-config/routing.json`. This directory is mounted read-only into API and worker. Keep provider keys out of JSON and job payloads; set exact `credentialRef` names in a separate `.env.assessment-worker` (or `ASSESSMENT_WORKER_ENV_FILE`) containing worker provider secrets and a stable `ASSESSMENT_AUDIT_SEED`. Template `.env.assessment-worker.example` shows the example profile names. Protect secret files with mode 600, routing directory with suitable restricted permissions, and keep both out of git. The documentation's example routing file is `design_only`: it is not an approved pilot configuration. Supply benchmark-backed quality gates, deployment state `pilot`, and daily call/cost limits before activation. API and worker must use the same routing snapshot; preserve snapshots required by pending jobs.

## Readiness and activation

1. Keep `ASSESSMENT_ENABLED=false`. Review/apply the assessment database migration explicitly using the established production migration procedure and a tested backup. Never enable schema synchronization.
2. Measure host CPU/RAM, API/DB baseline latency, disk and inodes. Confirm worker budget leaves headroom. Initial limits are 1 CPU/2 GiB worker, one job and two provider calls; these are pilot limits, not proven capacity. Queue Redis has 256 MiB noeviction memory budget and a 512 MiB container ceiling; account for AOF/rewrite overhead and tune from measurements.
3. Build/publish the dedicated worker image in a controlled environment, or from the matching VPS checkout: `docker compose --env-file .env.prod -f docker-compose.prod.yml --profile assessment build assessment-worker`. Verify Poppler and sharp using the built image before pilot. This runbook does not deploy or run commands automatically.
4. Validate syntax without emitting secrets: `docker compose --env-file .env.prod -f docker-compose.prod.yml --profile assessment config --quiet`. Confirm queue has no published host port and cache Redis remains disposable/allkeys-lru.
5. On a synthetic authorized pilot only, set `ASSESSMENT_ENABLED=true` and explicitly `ASSESSMENT_QUEUE_REDIS_URL=redis://assessment-redis:6379` in the Compose env file. Start the services with `docker compose --env-file .env.prod -f docker-compose.prod.yml --profile assessment up -d assessment-redis assessment-worker backend`. If deploying prebuilt images, pull the reviewed worker tag first and use `--no-build`. A profile flag alone leaves the feature disabled; enabling only the API env without starting the profile leaves commands unready.
6. Verify `docker compose --env-file .env.prod -f docker-compose.prod.yml --profile assessment ps` and health state. Verify effective limits with `docker stats --no-stream` and host monitoring. Docker marks a failed healthcheck unhealthy; it does not automatically restart a live unhealthy worker. Alert and investigate it.
7. Exercise real image/PDF rendering within limits, browser upload/seal/read, malformed-file rejection, revision fencing, budget exhaustion, graceful stop/restart, Redis restart and DB-based replay. Prove paid-call checkpoint reuse and no duplicate publication, no stale review replacement, and private evidence absent from offline/PWA caches after logout (A33). Readiness must fail closed until required checks pass. Do not infer OCR quality from infrastructure health.

## Disk, temporary workspace and logs

`assessment-workspace` is a disk-backed named volume owned by non-root UID/GID 1001. `/tmp` is capped at 64 MiB for incidental process files; PDFs/images go under `/app/workspace`. The volume itself is not a quota: before activation provision a host/filesystem quota or dedicated capacity and verify application admission and per-job allocation guards. Required policies are at least 15 GiB free to admit work, pause below 10 GiB, per-job byte/page/pixel/time limits, cache cap 2 GiB and TTL 24 hours. If these guards are not implemented/verified, keep processing disabled. Cache quotas do not include the whole job workspace. Do not fill the API/DB filesystem to satisfy a render request.

Clean only expired temporary data without valid leases, at startup and on a schedule. Never blindly `rm -rf` the volume while jobs may be active. Monitor filesystem free bytes/inodes, PostgreSQL/WAL, queue AOF/rewrite space and object-store lifecycle failures. Compose rotates assessment logs at 10 MiB × 3 files per container. Log only technical identifiers and error codes; exclude raw prompts, student names/images, credentials and signed URLs.

## Health, shutdown and recovery

Worker health is an mtime heartbeat at `/app/workspace/heartbeat`, not an HTTP port. Runtime must refresh it only while bootstrap/worker lifecycle is healthy and remove or invalidate a stale marker at startup. Health checks run every 30 seconds with a 120-second freshness window. Alert if heartbeats are absent for 2 minutes with pending jobs, oldest pending exceeds 10 minutes, provider auth fails, budget nears cap, or disk crosses admission thresholds. A heartbeat alone does not prove stage progress: monitor job ages, leases and stage errors too.

Use Compose stop (120-second worker grace) so SIGTERM reaches the independent Node bootstrap via `init`. Runtime stops claiming, closes BullMQ/DB and allows bounded active work to settle. DB job state, current lease token and revision fencing control recovery; Redis is only delivery. Default job lease is 180 seconds and heartbeat 30 seconds, dispatcher 2 seconds and reconciler 30 seconds. Do not start another independent dispatcher owner unintentionally.

- API restart: pending DB jobs remain. Worker restart: wait for lease expiry/reconciliation; never edit completed results manually to replay a job.
- Redis restart: AOF `appendfsync everysec` can lose the latest second on failure. Reconciler must redispatch unfinished DB jobs. Never flush the queue or remove `assessment-redis-data` as routine recovery. Noeviction rejects writes under pressure: alert, pause admission, restore headroom and reconcile from DB.
- Provider timeout/outage: bounded retry only; a timed-out request may already have incurred cost. Preserve unknown-call reservations/checkpoints and pause new calls on auth/budget failure.
- DB/storage outage: pause new work and preserve historical results; missing evidence becomes an explicit flag. Restore DB and object versions/manifests consistently and test recovery before reopening processing.

To disable, set `ASSESSMENT_ENABLED=false`, recreate backend, stop worker gracefully and leave database, queue AOF and workspace intact for diagnosis. Do not use `down -v`. Before re-enabling after a release rollback, verify schema compatibility, pending routing snapshots and leases. Backup DB plus private object storage and prove restore with manifests; Redis AOF is not the business backup.

No production deployment, migration execution, paid provider call, storage purchase or render benchmark is performed by adding these files.

## CI/CD và giữ image trên VPS

Pipeline backend build/push cả API và assessment-worker với cùng commit SHA. Khi ASSESSMENT_ENABLED=true, deploy mở Compose profile assessment, pull worker, chạy queue/worker và đợi worker healthy; lỗi readiness không được ghi nhận là deploy thành công. Khi tính năng tắt, worker được dừng. CI kiểm tra build image worker và kiểm thử script retention.

Sau deploy thành công, `scripts/retain-docker-images.py --keep 3` giữ ba image ID mới nhất cho từng repository backend, worker, database và frontend theo pipeline tương ứng. Nhiều tag cùng một image chỉ tính một bản. Image được bất kỳ container nào tham chiếu hoặc có tag rollback/previous được bảo vệ, nên có thể vượt ba bản nếu còn tham chiếu cần giữ. Không dùng force, không xóa container/volume và không xóa phiên bản trên GHCR. Host cần Python 3; script có `--dry-run` để xem trước. Chính sách chưa được chạy dọn dữ liệu trên VPS trong phiên triển khai mã nguồn này.

## Kiểm thử tích hợp không dùng production

`ASSESSMENT_TEST_PG=true npm test -- --runInBand --runTestsByPath src/modules/assessment/assessment.integration.spec.ts` chỉ kết nối 127.0.0.1:5432/database postgres, user mặc định là user hệ điều hành; có thể đặt ASSESSMENT_TEST_PG_USER/PASSWORD cho tài khoản test. Test tạo schema UUID trong một transaction, dùng bảng legacy giả lập và migrations thật, rollback toàn bộ khi kết thúc. CI cấp PostgreSQL service riêng với credential test. Không dùng DB_HOST/DB_PASSWORD production cho bộ này.

Các ca hiện có kiểm tra publication+grade+audit, replay idempotency, rollback khi audit lỗi, ảnh tổng hợp→rule score→review và duplicate delivery/retry với DB job thật. Provider được giả lập; chưa chứng minh OCR/model đọc được bài thật. Worker image vẫn cần build/render Poppler và kiểm tra Redis AOF/recovery trên môi trường staging trước khi mở pilot.

## Chế độ hiện tại: chỉ chuẩn bị cấu hình

Người dùng chưa có S3 và API keys: giữ tính năng tắt, không khởi động worker/queue và không gọi provider. [Bộ cấu hình mẫu](../../assessment-config/README.md) liệt kê các trường cần điền sau. Không ghi đè toàn bộ .env.prod đang có bằng file mẫu.
