# Assessment VPS operations

Assessment is disabled by default. The `assessment` Compose profile adds private workers, a Python inference service and durable Redis. Provision the internal model separately to run image reading. Its hardware depends on the model you benchmark. Enable real student uploads only after the storage, privacy, budget and recovery checks pass.

## Deployment inputs

Use Docker Compose 2.24+ from the backend checkout with `education_be/docker-compose.prod.yml`. It defines the isolated production networks. Use the workspace root manifests for local development with synthetic data. The release workflow publishes the API, workers and Python inference images with the same commit SHA. Set `ASSESSMENT_WORKER_IMAGE`, `ASSESSMENT_INFERENCE_IMAGE` and `IMAGE_TAG` when pulling a published release.

Add the assessment variables from `.env.prod.example` to the private runtime env file, preserving database and API settings. Compose uses `--env-file` for interpolation. Production API also reads `.env.prod`. The dedicated external gateway file holds the public model key. Omit credentials, resolved environment dumps, signed URLs, student content and raw model responses from shared logs.

Provision a private S3-compatible bucket reachable at its HTTPS hostname from the internal `assessment-data-net` used by both workers. The API and browser must also reach that HTTPS hostname for signed uploads; staff evidence and report reads are proxied through authenticated NestJS content endpoints. A storage endpoint served on the private network with controlled HTTPS ingress can satisfy both requirements. Test DNS and certificate validation on each path. Configure the exact frontend CORS origin, staging and sealed prefix permissions, lifecycle and backups. Prove upload, seal, read and restore. These manifests do not provision storage. Public cloud S3 endpoints require a separately verified storage-only network path from the workers.

Put the routing JSON at `ASSESSMENT_CONFIG_DIR/routing.json`, accessible to UID 1001, with `ASSESSMENT_ROUTING_CONFIG_PATH=/app/assessment-config/routing.json`. This directory is mounted read-only into API and worker. Generate a token with `openssl rand -hex 32` and set the same `ASSESSMENT_INFERENCE_TOKEN` in both `.env.assessment-worker` and `.env.assessment-inference`. Keep `ASSESSMENT_AUDIT_SEED` in the worker file and keep both files at mode 600. Remove public model keys from both files. The worker calls `http://assessment-inference:8000` on a private network. Supply benchmark-backed quality gates, deployment state `pilot` and appropriate limits before activation. API and worker must use the same routing snapshot. Preserve snapshots required by pending jobs.

Deploy the internal OpenAI-compatible model independently. Attach it only to the Compose project's internal `assessment-inference-net` with network alias `assessment-local-model`, with no published port. Set `ASSESSMENT_LOCAL_MODEL_URL=http://assessment-local-model:<port>`, `ASSESSMENT_LOCAL_MODEL_NAME` and the optional `ASSESSMENT_LOCAL_MODEL_TOKEN` in `.env.assessment-inference`. The URL is an origin with no path. The inference image does not install or download model weights. Benchmark Vietnamese handwriting on synthetic examples before enabling the route for student submissions.

## Optional text-only external gateway

Leave this route disabled during the default deployment. The `assessment-external` profile runs a separate entry point from the same published Python image. The gateway has no host port, storage credentials, workspace mount or database network.

1. Use `.env.assessment-external-grading.example` to prepare the private gateway env file. Fix the approved provider and model, and put the API key in this file only. Generate an internal token and signing key independently and match them in `.env.assessment-worker`. Set the policy version and comma-separated assessment allowlist in `.env.prod` so the API and worker receive the same nonsecret policy. Match the gateway's policy version to `.env.prod`.
2. Configure a default-deny host egress policy for `assessment-external-egress-net` covering IPv4, IPv6 and host-local routes. Allow only the approved provider endpoint and the DNS path it requires. Compose isolates the worker-to-gateway network. The egress bridge alone does not enforce the provider allowlist. Confirm that the gateway cannot reach the database, object storage or other destinations and that private workers cannot reach public endpoints directly.
3. Test with synthetic input. Inspect the provider mock's received fields to verify only one answer and rubric leave the gateway. Exercise disabled policy, invalid payload, replay and model errors. Keep a single gateway process because nonce claims are held in process memory.
4. After release and school approval, enable the route in `.env.prod` and the dedicated gateway env file. With the reviewed release tag, run `docker compose --env-file .env.prod -f docker-compose.prod.yml --profile assessment --profile assessment-external up -d --no-build --wait assessment-external-grading assessment-worker backend`. The gateway liveness probe verifies the process only. Verify policy and actual network routes separately.
5. To close the route, stop `assessment-external-grading` with `--profile assessment-external`, reset both enable flags and recreate the API and worker. On subsequent backend deploys the release workflow stops any old gateway. Reopen after verifying the new release and egress policy.

## Readiness and activation

1. Keep `ASSESSMENT_ENABLED=false`. Review/apply the assessment database migration explicitly using the established production migration procedure and a tested backup. Never enable schema synchronization.
2. Measure host CPU/RAM, API/DB baseline latency, disk and inodes. Confirm worker budget leaves headroom. Initial limits are 1 CPU/2 GiB worker, one job and two provider calls; these are pilot limits, not proven capacity. Queue Redis has 256 MiB noeviction memory budget and a 512 MiB container ceiling; account for AOF/rewrite overhead and tune from measurements.
3. Build/publish the worker and inference images in a controlled environment, or from the matching VPS checkout: `docker compose --env-file .env.prod -f docker-compose.prod.yml --profile assessment build assessment-worker assessment-inference`. Verify Poppler and sharp using the built image before pilot. This runbook does not deploy or run commands automatically.
4. Validate syntax without emitting secrets: `docker compose --env-file .env.prod -f docker-compose.prod.yml --profile assessment config --quiet`. Confirm queue has no published host port and cache Redis remains disposable/allkeys-lru.
5. On a synthetic authorized pilot only, set `ASSESSMENT_ENABLED=true` and explicitly `ASSESSMENT_QUEUE_REDIS_URL=redis://assessment-redis:6379` in the Compose env file. Start the services with `docker compose --env-file .env.prod -f docker-compose.prod.yml --profile assessment up -d --wait assessment-redis assessment-inference assessment-worker backend`. If deploying prebuilt images, pull the reviewed worker and inference tags first and use `--no-build`. A profile flag alone leaves the feature disabled; enabling only the API env without starting the profile leaves commands unready.
6. Verify `docker compose --env-file .env.prod -f docker-compose.prod.yml --profile assessment ps` and health state. Verify effective limits with `docker stats --no-stream` and host monitoring. Docker marks a failed healthcheck unhealthy; it does not automatically restart a live unhealthy worker. Alert and investigate it.
7. Exercise real image/PDF rendering within limits, browser upload/seal/read, malformed-file rejection, revision fencing, budget exhaustion, graceful stop/restart, Redis restart and DB-based replay. Prove paid-call checkpoint reuse and no duplicate publication, no stale review replacement, and private evidence absent from offline/PWA caches after logout (A33). Readiness must fail closed until required checks pass. Do not infer OCR quality from infrastructure health.

## Disk, temporary workspace and logs

`assessment-workspace` is a disk-backed named volume owned by non-root UID/GID 1001. `/tmp` is capped at 64 MiB for incidental process files; PDFs/images go under `/app/workspace`. The volume itself is not a quota: before activation provision a host/filesystem quota or dedicated capacity and verify application admission and per-job allocation guards. Required policies are at least 15 GiB free to admit work, pause below 10 GiB, per-job byte/page/pixel/time limits, cache cap 2 GiB and TTL 24 hours. If these guards are not implemented/verified, keep processing disabled. Cache quotas do not include the whole job workspace. Do not fill the API/DB filesystem to satisfy a render request.

Clean only expired temporary data without valid leases, at startup and on a schedule. Never blindly `rm -rf` the volume while jobs may be active. Monitor filesystem free bytes/inodes, PostgreSQL/WAL, queue AOF/rewrite space and object-store lifecycle failures. Compose rotates assessment logs at 10 MiB × 3 files per container. Log only technical identifiers and error codes; exclude raw prompts, student names/images, credentials and signed URLs.

## Health, shutdown and recovery

Worker health is an mtime heartbeat at `/app/workspace/heartbeat`. Runtime must refresh it only while bootstrap and worker lifecycle are healthy and remove a stale marker at startup. Health checks run every 30 seconds with a 120-second freshness window. Alert if heartbeats are absent for 2 minutes with pending jobs, the oldest pending job exceeds 10 minutes, budget nears the cap, or disk crosses admission thresholds. A heartbeat alone does not prove stage progress. Monitor job ages, leases and stage errors as well.

Use Compose stop (120-second worker grace) so SIGTERM reaches the independent Node bootstrap via `init`. Runtime stops claiming, closes BullMQ/DB and allows bounded active work to settle. DB job state, current lease token and revision fencing control recovery; Redis is only delivery. Default job lease is 180 seconds and heartbeat 30 seconds, dispatcher 2 seconds and reconciler 30 seconds. Do not start another independent dispatcher owner unintentionally.

- API restart: pending DB jobs remain. Worker restart: wait for lease expiry/reconciliation; never edit completed results manually to replay a job.
- Redis restart: AOF `appendfsync everysec` can lose the latest second on failure. Reconciler must redispatch unfinished DB jobs. Never flush the queue or remove `assessment-redis-data` as routine recovery. Noeviction rejects writes under pressure: alert, pause admission, restore headroom and reconcile from DB.
- Provider timeout/outage: bounded retry only; a timed-out request may already have incurred cost. Preserve unknown-call reservations/checkpoints and pause new calls on auth/budget failure.
- DB/storage outage: pause new work and preserve historical results; missing evidence becomes an explicit flag. Restore DB and object versions/manifests consistently and test recovery before reopening processing.

To disable, set `ASSESSMENT_ENABLED=false`, recreate backend, stop worker and inference gracefully and leave database, queue AOF and workspace intact for diagnosis. Do not use `down -v`. Before re-enabling after a release rollback, verify schema compatibility, pending routing snapshots and leases. Backup DB plus private object storage and prove restore with manifests; Redis AOF is not the business backup.

No production deployment, migration execution, paid provider call, storage purchase or render benchmark is performed by adding these files.

## CI/CD và giữ image trên VPS

Pipeline backend build/push API, assessment-worker và assessment-inference với cùng commit SHA. Khi ASSESSMENT_ENABLED=true, deploy mở profile assessment, chạy Redis, Python và worker rồi đợi các service sẵn sàng. Khi chỉ xem trước, worker và Python không cần chạy. CI build image Python và chạy test với provider giả lập.

Sau deploy thành công, `scripts/retain-docker-images.py --keep 3` giữ ba image ID mới nhất cho từng repository backend, worker, inference, database và frontend theo pipeline tương ứng. Nhiều tag cùng một image chỉ tính một bản. Image được bất kỳ container nào tham chiếu hoặc có tag rollback/previous được bảo vệ, nên có thể vượt ba bản nếu còn tham chiếu cần giữ. Không dùng force, không xóa container/volume và không xóa phiên bản trên GHCR. Host cần Python 3; script có `--dry-run` để xem trước. Chính sách chưa được chạy dọn dữ liệu trên VPS trong phiên triển khai mã nguồn này.

## Kiểm thử tích hợp không dùng production

`ASSESSMENT_TEST_PG=true npm test -- --runInBand --runTestsByPath src/modules/assessment/assessment.integration.spec.ts` chỉ kết nối 127.0.0.1:5432/database postgres, user mặc định là user hệ điều hành; có thể đặt ASSESSMENT_TEST_PG_USER/PASSWORD cho tài khoản test. Test tạo schema UUID trong một transaction, dùng bảng legacy giả lập và migrations thật, rollback toàn bộ khi kết thúc. CI cấp PostgreSQL service riêng với credential test. Không dùng DB_HOST/DB_PASSWORD production cho bộ này.

Các ca hiện có kiểm tra publication+grade+audit, replay idempotency, rollback khi audit lỗi, ảnh tổng hợp→rule score→review và duplicate delivery/retry với DB job thật. Provider được giả lập; chưa chứng minh OCR/model đọc được bài thật. Worker image vẫn cần build/render Poppler và kiểm tra Redis AOF/recovery trên môi trường staging trước khi mở pilot.

## Chế độ hiện tại: chỉ chuẩn bị cấu hình

Người dùng chưa có S3 và API keys: giữ tính năng tắt, không khởi động worker/queue và không gọi provider. [Bộ cấu hình mẫu](../../assessment-config/README.md) liệt kê các trường cần điền sau. Không ghi đè toàn bộ .env.prod đang có bằng file mẫu.
