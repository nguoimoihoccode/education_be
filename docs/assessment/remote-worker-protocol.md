# Worker trên Mac nhận việc qua HTTPS — Assessment v1.1

Trạng thái từ 2026-11-04: phương án tham khảo đã được thay thế bởi [triển khai VPS v1.2](vps-deployment.md). Không triển khai remote endpoints, WorkerOnly JWT, bootstrap keys hoặc worker Mac trong phạm vi hiện tại. W01–W12 chỉ áp dụng nếu mở lại phương án remote trong tương lai.

Tài liệu bổ sung [pipeline](pipeline-and-operations.md) và [multi-agent routing](multi-agent-model-routing.md). Chưa triển khai endpoint hoặc cài worker trên máy người dùng.

## 1. Phân công VPS và Mac

VPS là nguồn dữ liệu chuẩn: job state, tenant, routing snapshot, budget, dữ liệu chấm/review, điểm công bố và audit. Mac là executor có thể tắt/mất mạng; nó chỉ nhận những công việc được cấp và gửi artifacts về.

Kết nối do Mac chủ động mở qua HTTPS. Không cần IP tĩnh của Mac, NAT forwarding, public PostgreSQL/Redis hoặc quyền truy cập DB trên Mac.

Mode co-located VPS vẫn có thể dùng coordinator DB trực tiếp theo thiết kế v1. Với mode remote_mac_https, các thao tác claim/lease/ghi kết quả trong tài liệu pipeline được thực hiện tại API VPS thay cho executor ghi DB trực tiếp.

Một stage chỉ có một execution target có hiệu lực. Không để cả Redis consumer cũ và remote poller thực thi cùng job mà không dùng chung fencing/lease.

## 2. Runtime

Remote entrypoint riêng trong repository backend: src/workers/assessment-remote-worker.main.ts và assessment-remote-worker.module.ts. Chỉ import provider adapters, image/PDF tools, contracts và HTTPS coordinator; không import AppModule, SchoolModule hoặc TypeORM runtime.

Worker chạy Node ARM64 native trên Mac. Không yêu cầu Docker hoặc local LLM ở pilot. Nếu sau này dùng local model, nó là provider adapter riêng với capability/benchmark/budget như các provider khác.

Thư mục cục bộ dự kiến: ~/Library/Caches/EducationAssessmentWorker, quyền thư mục 0700 và file 0600. Cache cap 2 GiB, TTL 24 giờ, xóa artifact riêng sau khi server xác nhận lưu thành công. Không lưu vào thư mục đồng bộ cloud hoặc thư mục public.

Admission: tối thiểu 15 GiB trống khi nhận job; pause dưới 10 GiB, resume khi trên 15 GiB. Một job cùng lúc, tối đa hai calls provider nếu ngân sách/profile cho phép. Áp timeout từng subprocess và kiểm tra memory pressure của macOS; không dùng chỉ số RAM free thô làm chỉ báo duy nhất.

## 3. Worker registry

Bổ sung một bảng vào [data contract](data-and-api-contract.md): school_assessment_workers.

Các trường: id UUID, school_id, name, bootstrap_key_digest, key_version, allowed_stages jsonb, allowed_profile_ids jsonb, max_concurrent_jobs, state (active|paused|revoked), last_seen_at, created_by, created_at, updated_at.

Một registration thuộc một trường. Muốn một máy phục vụ nhiều trường thì dùng registration/credential riêng; không gửi schoolId tùy ý để mở scope.

Bootstrap key ngẫu nhiên đủ mạnh, hiện một lần cho operator; server chỉ lưu digest và so sánh constant-time. Trên Mac dùng Keychain hoặc secret file quyền 0600, không commit hoặc in token ra log.

Operator cấp/revoke registration qua API admin có quyền; chính worker không tự đăng ký thêm scope hoặc mở ngân sách.

## 4. Authentication

Bootstrap key đổi lấy worker access JWT TTL 15 phút. Token có aud=assessment-worker, workerId, school scope, keyVersion và allowed stage/profile scopes. Không dùng user JWT, tài khoản giáo viên hoặc ADMIN token.

Auth boundary phải được đưa vào global guard có kiểm tra loại principal rõ ràng. Route worker được đánh dấu WorkerOnly, guard xác minh worker token; route user vẫn chạy quy tắc user hiện tại. Không gắn Public rồi bỏ quên auth cho endpoint worker.

Bootstrap session endpoint dùng bootstrap authenticator riêng, rate limit và không log body/header secret. Chữ ký JWT dùng key được quản lý phía server; kiểm tra exp/aud/iss/keyVersion và trạng thái revoked ở mọi command.

Revoke ngăn claim/call permit mới; lease đang chạy được xử lý theo policy cancel. Link file đã ký chỉ còn hiệu lực tới TTL hiện có, không hứa revoke URL tức thì.

## 5. Endpoints

Route NestJS ở /internal/assessment-workers; ngoài frontend proxy có thể là /api/internal/assessment-workers.

| Method | Route | Chức năng |
|---|---|---|
| POST | /internal/assessment-workers/session | Bootstrap credential → JWT ngắn hạn |
| POST | /internal/assessment-workers/heartbeat | Liveness, capacity, disk/memory summary không có danh sách file cá nhân |
| POST | /internal/assessment-workers/jobs/claim | Claim một job phù hợp capability/routing; 200 có lease hoặc 204 khi chưa có việc |
| POST | /internal/assessment-workers/leases/:leaseId/heartbeat | Gia hạn lease nếu worker/keyVersion vẫn hợp lệ |
| POST | /internal/assessment-workers/leases/:leaseId/provider-calls | Xin permit có reserve budget cho requestHash/profile/purpose cụ thể |
| POST | /internal/assessment-workers/provider-calls/:callId/result | Usage và response artifact, có idempotency; không quyết định điểm chính thức |
| POST | /internal/assessment-workers/leases/:leaseId/artifact-uploads | Cấp upload staging scoped đúng job và loại output |
| POST | /internal/assessment-workers/leases/:leaseId/complete | Gửi output refs/hashes để server validate và commit |
| POST | /internal/assessment-workers/leases/:leaseId/fail | Phân loại lỗi, giữ checkpoint và budget |
| POST | /internal/assessment-workers/leases/:leaseId/release | Dừng an toàn khi thiếu disk hoặc shutdown |

Mỗi command ghi có Idempotency-Key hoặc natural call/job key. Authentication chạy trước khi trả dữ liệu idempotency đã cache. Không cho worker gọi finalizations, approve key, exports của lớp hoặc API user bằng worker token.

## 6. Claim envelope

~~~json
{
  "jobId": "77777777-7777-4777-8777-777777777777",
  "leaseId": "88888888-8888-4888-8888-888888888888",
  "fencingToken": 4,
  "leaseExpiresAt": "2026-11-03T11:03:00Z",
  "stage": "extract",
  "producerAgent": "image_reader",
  "submissionId": "33333333-3333-4333-8333-333333333333",
  "inputRevision": 3,
  "routingVersion": "2026-11-03.v1.1",
  "routingPolicyHash": "sha256-of-pinned-routing",
  "profileId": "gemini25_reader",
  "inputArtifactIds": ["asset-page-1"],
  "outputSchemaId": "reader-observation-v1"
}
~~~

Ví dụ chỉ mô tả wire shape. Server trả thêm scoped access descriptor và profile snapshot; không trả provider secret hoặc DB URL. Bytes được tải qua link ngắn hạn. Hết hạn tải lại access descriptor cùng artifact, không tạo submission/call mới.

Server lựa chọn job từ DB theo tenant, capabilities, lifecycle, budget và execution target. Mac không chọn tùy ý ID của bài chưa được cấp.

## 7. Call permits và kết quả

1. Worker dựng payload từ input artifacts/routing snapshot; tính requestHash.
2. Xin call permit. Server kiểm tra lease, stage, allowed profile, ngày model/giá, cap attempts và reserve chi phí. Server tự tính từ mức giới hạn/payload manifest; không tin chi phí 0 do client khai.
3. Worker gọi provider bằng credentialRef đã được operator cấu hình cục bộ. Không lấy key từ bài làm hoặc request người dùng.
4. Gửi response/usage về server theo callId; response nhỏ có thể upload qua API giới hạn 1 MiB, artifact lớn dùng staging/seal.
5. Server chuẩn hóa usage và lưu response artifact trước khi aggregate. Worker hoàn thành stage bằng refs/hashes và fencingToken.
6. Server kiểm tra schema, tenant, region IDs, inputRevision, profile/routing manifest rồi mới ghi current result.

Hash do worker đưa lên được kiểm tra lại từ bytes. Worker là processing principal được tin cậy trong phạm vi đã cấp, không phải cơ chế chứng minh model đã chấm đúng; teacher review và các quality gates vẫn áp dụng.

Response đến sau lease hết có thể được nhận vào lịch sử/billing nếu call thuộc worker hợp lệ, nhưng không được cập nhật current result hoặc GradeEntry. Báo cáo usage không bị bỏ chỉ vì job đã stale.

## 8. Lease, retry và mất kết nối

- Lease 180 giây, heartbeat 30 giây như thiết kế cơ sở.
- Worker mất mạng: ngừng nhận job mới; giữ artifact chưa gửi trong quota để gửi lại.
- VPS không nhận heartbeat và hết lease: có thể cấp job lại bằng fencingToken cao hơn.
- Worker cũ quay lại: late result chỉ giữ lịch sử khi token đã cũ; không ghi đè kết quả mới.
- Call thành công đã có response artifact: retry stage dùng lại artifact, không gọi provider lại.
- Call timeout không biết đã tính phí: state unknown, giữ reservation; cap toàn pipeline vẫn áp dụng.
- Mac tắt: công việc còn DB. Fallback executor trên VPS chỉ được dùng nếu đã cấu hình/đủ tài nguyên; không tự phát sinh một lần gọi trả phí thứ hai ngay khi worker im lặng.

Provider Batch submissions dùng external batch ID bền vững. API có thể theo dõi batch độc lập với Mac, không cần Mac online suốt 24 giờ. Mất worker sau khi submit không được submit lại cả batch.

## 9. Thay đổi dữ liệu tối thiểu

Không cần bảng riêng cho mỗi agent. Dùng jobs + provider_calls + grading/review artifacts hiện có.

Thêm vào job: execution_target, assigned_worker_id nullable, routing_version, routing_policy_hash, producer_agent. Lưu profile snapshots/functional hashes ở manifest của job/call. assigned_worker_id FK cùng tenant.

Worker registration được thêm ở migration xử lý; các trường mới có default execution_target=vps cho compatibility. Khi bật remote mode, dispatcher chọn đúng target và chỉ server quản lý lease.

Mọi model call là một row ProviderCall cho mỗi attempt có phí; không gom ba agent thành một usage “ước chừng”. Không nhân cap attempts theo số agent.

## 10. Nghiệm thu giao thức

- W01: User JWT/khách không truy cập endpoint worker.
- W02: Worker token không vào endpoint giáo viên/finalize.
- W03: Worker trường A không claim/read/upload artifact trường B.
- W04: Revoke key dừng claim/permit, kể cả access token chưa hết exp.
- W05: Hai máy claim cùng job chỉ một lease hợp lệ.
- W06: Worker cũ complete sau lease reclaim không làm current.
- W07: Restart sau provider response không gọi lại nếu artifact đã có.
- W08: Model/giá hết hạn được server chặn trước call permit.
- W09: Mất mạng/retry complete không nhân kết quả hoặc phí đã ghi.
- W10: Disk thấp → release/pause, không xóa dữ liệu cá nhân để cố chạy.
- W11: Actor giáo viên vẫn phải có quyền hiện hành khi chốt; worker không thay thế quyết định đó.
- W12: Old/new executor không cùng commit một stage; response đến muộn vẫn đối soát usage.

Protocol chưa được chạy trên VPS/Mac trong bước thiết kế. Chỉ mở worker thật sau khi cấp credential, qua auth/lease tests và giải phóng đủ disk.
