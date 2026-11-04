# Hợp đồng dữ liệu và API — Assessment v1

Tài liệu chuẩn: [thiết kế tổng thể](../superpowers/specs/2026-11-03-ai-assisted-assessment-design.md). Mọi đường dẫn dưới đây là route NestJS, chưa có /api của Nginx.

## 1. Quy ước chung

- Dùng UUID cho ID mới; studentId/actorId là integer users.id.
- DB dùng snake_case, DTO dùng camelCase, thời điểm dùng timestamptz/ISO UTC. examDate là date YYYY-MM-DD theo ngữ cảnh trường.
- Mọi bảng mới có id, school_id, created_at; bảng mutable có updated_at và revision integer tăng đơn điệu.
- FK giữa các bảng assessment dùng (school_id, parent_id) → unique (school_id, id). Những liên kết cần cùng assessment còn kiểm tra assessment_id bằng composite FK. UUID không thay kiểm tra tenant.
- Không nhận schoolId, objectKey, finalScore hoặc trạng thái approved từ request không có nghiệp vụ tương ứng.
- Nội dung JSON bất biến có schemaVersion = 1, được kiểm tra schema và domain trước khi lưu.
- Tối đa điểm gốc 1000 điểm/đề; pointScale cố định 1000. Đầu điểm hiện có vẫn 0–10, một số thập phân.
- Class/subject/year của một assessment phải cùng school. Roster giới hạn người thuộc lớp vào ngày được chụp; bổ sung sau đó cần quyền và audit.

## 2. Các bảng

### 2.1 school_assessments

Các cột nghiệp vụ: class_id, subject_id, academic_year_id, owner_id, title, exam_date, term (1|2), test_type (oral|15min|45min|final), coefficient (1|2), max_score_units, context_revision, archived_at.

Index (school_id, class_id, subject_id, created_at). context_revision bao gồm các trường ảnh hưởng publication. Được sửa trước lần công bố đầu; sau đó chỉ sửa title/archive. Sửa ngữ cảnh đầu điểm đã công bố không nằm trong v1.

### 2.2 school_assessment_roster

assessment_id, student_id, display_name_snapshot, student_code_snapshot nullable, membership_id, added_by, added_at. Unique (assessment_id, student_id). student_code_snapshot chỉ có nếu nguồn có thật; không lấy users.id làm số báo danh trên giấy.

Hiển thị tên snapshot trong bài lịch sử; các endpoint kết quả công bố vẫn kiểm tra user/ParentLink hiện tại. Chuyển lớp không loại học sinh khỏi roster lịch sử.

### 2.3 school_assessment_exam_versions

assessment_id, exam_code, version_number, state (draft|approved|superseded), document jsonb, question_content_hash, grading_spec_hash, source_region_ids, draft_source (teacher|ai), approved_by nullable, approved_at nullable.

Unique (assessment_id, exam_code, version_number). Nội dung document và hashes bất biến; sửa tạo bản mới. Bản approved không bị sửa tại chỗ. Superseded vẫn được đọc để giải thích điểm cũ.

Một assessment có thể chứa một hoặc nhiều exam_code. exam_code là mã đề phát cho học sinh; version_number là lần sửa nội dung/đáp án của chính mã đó. Mỗi submission đủ dữ liệu để chấm gắn đúng một exam_version_id; questionKey và answerKey được diễn giải trong phiên bản ấy. Câu I.1 của mã 101 không tự tương đương câu I.1 của mã 102, kể cả khi hai đề chỉ đảo thứ tự câu hoặc lựa chọn. Đổi mã/phiên bản gắn với bài làm phải tăng input_revision và tạo lại kết quả phần bị ảnh hưởng; giữ lịch sử điểm đã công bố theo quy tắc hiện có.

document gồm:

- metadata môn/khối, mã đề, số trang đề được khai báo, maxScoreUnits;
- danh sách câu với questionKey ổn định trong cùng cấu trúc đề;
- đề bài, options/statements, kind, maxUnits;
- answerKey và gradingPolicy cho lựa chọn/Đúng-Sai;
- criteria cho văn bản, bảng, hình; mỗi tiêu chí có id, maxUnits, mô tả, mức đạt và ví dụ chấp nhận;
- policy điểm lỗi kéo theo, làm tròn, phần bỏ trống và phạm vi tài liệu chấm được phép.

Trong schema thiết kế, gradingDefaults chứa blankScoreUnits=0, carryForwardErrorPolicy và quy tắc half-up khi đưa vào thang 10. Mỗi rubric criterion có levels để mô tả mức đạt; các mức này hướng dẫn chấm, điểm vẫn phải nằm trong miền integer units và giới hạn đã duyệt. Phạm vi tài liệu được gắn bằng source refs của ExamVersion, không phải URL tùy ý trong model output.

Chỉ tiêu chí lá tạo điểm. Tổng maxUnits của các câu bằng maxScoreUnits. Với nhóm Đúng/Sai, bốn mệnh đề là thành phần của một câu; không cộng thêm điểm nhóm lần thứ hai.

Các kind: single_choice, true_false_group, rubric_text, rubric_table, rubric_drawing. Bảng/hình là cách thể hiện đáp án, vẫn có rubric và bằng chứng. acceptedAnswerForms ghi những dạng trả lời hợp lệ; câu so sánh có thể nhận text hoặc table, không tự trừ điểm vì học sinh không lập bảng khi đề không yêu cầu.

### 2.4 school_assessment_submissions

assessment_id, client_group_id, student_id nullable, identity_state (unresolved|proposed|confirmed|conflict), identity_revision, exam_version_id nullable, input_revision, processing_state, current_page_ids jsonb, current_answer_revision_ids jsonb, current_review_revision_id nullable, deleted_at nullable.

Unique (assessment_id, client_group_id). Partial unique (assessment_id, student_id) WHERE student_id IS NOT NULL AND deleted_at IS NULL. Một học sinh chỉ có một bài đang hoạt động trong đợt ở v1.

Danh tính proposed có thể được xác nhận chung khi chốt nếu request lặp đúng studentId/identityRevision đang hiển thị. conflict/unresolved không được xác nhận ngầm.

Upload thêm, đổi thứ tự ngữ nghĩa, đổi vùng tờ chính hoặc remap câu làm tăng input_revision; identity có revision riêng. Khi một thay đổi ảnh hưởng kết quả, current_review_revision_id bị thay hoặc đánh dấu stale, không xóa lịch sử.

### 2.5 school_assessment_assets

assessment_id, submission_id nullable, purpose (student_work|marking_guide), original_name, declared_mime, verified_mime, byte_size, sha256, staging_key nullable, sealed_key nullable, storage_version_id nullable, state (uploading|verifying|sealed|rejected|purged), upload_expires_at, sealed_at nullable.

submission_id bắt buộc với student_work; marking_guide thuộc assessment. Tên file chỉ là metadata. Sealed key do server tạo, không phải key đã cấp quyền upload cho client. Checksum phải được storage xác thực hoặc worker tự tính, không tin chuỗi do client gửi.

Sau sealed không ghi đè bytes. Thay file tạo asset mới và revision mới. Duplicate content là gợi ý xử lý trùng trong phạm vi tenant, không tự ghép chủ bài.

### 2.6 school_assessment_pages

assessment_id, submission_id nullable, asset_id, source_page_number (1-based), analysis_revision, width_px, height_px, analysis_object_key, page_role, primary_polygon, transform_to_original jsonb, quality jsonb.

Unique (asset_id, source_page_number, analysis_revision). page_role: printed_exam, written_answer, mixed, marking_guide, unknown. Một ảnh JPEG có source_page_number = 1; page number in trên đề là metadata khác.

Một page row là một bản phân tích bất biến. Sửa crop tạo page row mới; current_page_ids chọn bản có hiệu lực. transform_to_original cho phép đưa vùng crop/ảnh đã chỉnh phối cảnh về đúng file gốc.

### 2.7 school_assessment_regions

assessment_id, page_id, region_key, role, polygon, text nullable, structured_content jsonb, source_token_refs jsonb, parent_region_id nullable, reader_profile_hash.

Unique (page_id, region_key). role: identity, exam_question, student_choice, student_text, student_table, student_drawing, teacher_mark, background. Vùng background không làm nguồn chấm hoặc nguồn danh tính chính.

structured_content của bảng giữ row/column/span/cell; của hình giữ mô tả quan sát được và vị trí nhãn. Không đưa kết luận đúng/sai vào raw observation. Ghi phiên bản bố cục mới thay vì sửa region cũ.

### 2.8 school_assessment_answer_revisions

assessment_id, submission_id, exam_version_id, question_key, revision_number, observation_state, content jsonb, source_region_ids jsonb, origin (reader|teacher), supersedes_id nullable, reason nullable, content_hash.

Unique (submission_id, question_key, revision_number). observation_state: readable, confirmed_blank, unreadable, not_found.

content là tagged union:

- single_choice: selectedOptionId nullable, observedMarks, ambiguityCodes;
- true_false_group: statementId → true|false|null, dấu sửa và ambiguityCodes;
- rubric_text: text và lineRefs;
- rubric_table: rows/cells và references;
- rubric_drawing: sourceRegionIds và observations; văn bản không thay ảnh hình.

confirmed_blank cần vùng trả lời đủ quan sát hoặc xác nhận có lý do của giáo viên. not_found/unreadable không tạo điểm 0. Revision do giáo viên sửa giữ nguyên raw revision trước đó.

### 2.9 school_assessment_grading_runs

assessment_id, submission_id, exam_version_id, input_revision, scope_question_keys jsonb, answer_revision_manifest jsonb, question_fingerprints jsonb, profile_snapshot jsonb, prompt_snapshot_key, code_revision, status, output jsonb, reused_from_run_ids jsonb, usage_summary jsonb, started_at, finished_at.

status: queued, running, succeeded, failed, stale. Manifest đầu vào bất biến; output chỉ được ghi hoàn tất một lần bởi lease đang có hiệu lực. Kết quả stale giữ lịch sử nhưng không làm current.

Fingerprint từng câu gồm tenant, nội dung câu/rubric và policy chung ảnh hưởng câu, revision bài làm/bằng chứng, profile/model, prompt hash và code revision. Có thể tái sử dụng kết quả đúng fingerprint; run mới ghi rõ provenance.

output model chỉ là đề xuất. Backend tính lại tổng từ tiêu chí hợp lệ, kiểm tra allowed ids, giới hạn và nguồn. Backend tạo điểm cho rule grader; không nhận tổng điểm model làm giá trị chính thức.

### 2.10 school_assessment_review_revisions

assessment_id, submission_id, revision_number, exam_version_id, input_manifest jsonb, effective_results jsonb, flags jsonb, earned_units nullable, ungraded_max_units, content_hash, created_by nullable.

Unique (submission_id, revision_number). Nội dung snapshot bất biến. created_by null khi aggregate tự tạo; sửa bằng giáo viên tạo snapshot tiếp theo.

Mỗi điểm có source = rule|ai|teacher, runId/answerRevisionId, tiêu chí và bằng chứng. Override cần lý do; override cũ trở thành stale nếu đầu vào liên quan đổi. Điểm đã công bố vẫn trỏ snapshot cũ trong khi có bản mới.

earned_units chỉ là tổng phần đã đánh giá. Chỉ được gọi là tổng điểm đầy đủ khi ungraded_max_units = 0 và không có lỗi chặn.

### 2.11 school_assessment_review_events

assessment_id, submission_id nullable, actor_id nullable, event_type, before_ref jsonb, after_ref jsonb, reason nullable, request_id, event_payload jsonb.

Append-only. Các event: identity_confirmed, primary_page_changed, answer_corrected, key_approved, score_overridden, flag_resolved, finalized, withdrawn, archived, retention_purged. Event chốt/rút và bản điểm phải commit trong cùng transaction.

Actor có thể bị ẩn/xóa theo nghiệp vụ tài khoản; event vẫn giữ định danh kỹ thuật và thời điểm, không cần sao chép email/mật khẩu.

### 2.12 school_assessment_jobs

assessment_id, submission_id nullable, stage, scope_key, input_hash, data jsonb, state, dispatch_generation, lease_token, lease_until, attempt_count, next_attempt_at, last_error_code nullable, result_ref jsonb.

Unique (school_id, stage, scope_key, input_hash). Chính row này là transactional outbox cho công việc, không cần bảng outbox thứ hai ở v1.

stage: seal, prepare, template, extract, grade, aggregate, export, purge.

state: pending, dispatched, running, retry_wait, succeeded, failed, cancelled, superseded. Không lưu bytes ảnh hoặc credentials trong data.

### 2.13 school_assessment_provider_calls

job_id, attempt_number, profile_hash, provider, model_requested, model_reported nullable, purpose, request_hash, response_object_key nullable, provider_request_id nullable, state, input_usage jsonb, output_usage jsonb, reserved_cost_micros, actual_cost_micros nullable, latency_ms nullable, error_code nullable.

Unique (job_id, attempt_number, request_hash). state: reserved, started, succeeded, failed, unknown. unknown thể hiện timeout/mất kết nối mà chưa biết provider đã tính phí hay chưa. Usage/cost chưa biết là null, không phải 0.

### 2.14 school_assessment_publications

assessment_id, submission_id, student_id, review_revision_id, context_snapshot jsonb, normalized_score_tenths, state (active|withdrawn), revision, finalized_by, finalized_at, withdrawn_by nullable, withdrawn_at nullable, withdrawal_reason nullable.

Unique (submission_id); unique (assessment_id, student_id). context_snapshot giữ examDate, term, testType, coefficient, classId, subjectId, yearId và rubric/input hashes.

school_grades thêm assessment_publication_id UUID nullable, unique, FK ON DELETE RESTRICT. Khi trường này có giá trị, quiz_session_id và homework_id phải null. Không có FK cascade từ asset/submission/archive sang đầu điểm.

Không cần import AssessmentModule vào SchoolModule. GradeEntry giữ scalar source ID; FK được tạo bằng migration. GradebookWriter nhận EntityManager để tham gia transaction bên gọi.

### 2.15 school_assessment_exports

assessment_id, format (xlsx|pdf), snapshot_manifest jsonb, state (queued|running|completed|failed), output_object_key nullable, created_by, expires_at, error_code nullable.

Chỉ xuất snapshot đã công bố, có thời điểm/version trên báo cáo. Trong lúc điểm được sửa, báo cáo đã yêu cầu vẫn đại diện snapshot ban đầu, không trộn phiên bản. Quyền download được kiểm tra tại lúc xin link; báo cáo cả lớp chỉ dành cho staff có quyền.

### 2.16 school_assessment_idempotency

actor_id, route_scope, idempotency_key, request_hash, state (running|completed), response_status nullable, response_body jsonb, lease_until, expires_at.

Unique (school_id, actor_id, route_scope, idempotency_key). TTL 7 ngày; ràng buộc publication/job vẫn bảo vệ sau TTL. Cùng key khác request_hash trả 409. Row running hết lease được tiếp tục an toàn từ các hiệu ứng miền đã commit.

### 2.17 school_assessment_workers — tùy chọn tương lai, ngoài phạm vi VPS v1.2

Chỉ tạo khi mở lại remote worker; không đưa bảng này vào migrations bắt buộc của VPS v1.2.

name, bootstrap_key_digest, key_version, allowed_stages jsonb, allowed_profile_ids jsonb, max_concurrent_jobs, state (active|paused|revoked), last_seen_at, created_by. Các cột id/school_id/timestamps theo quy ước chung. Mỗi worker registration chỉ thuộc một trường.

Không lưu bootstrap secret dạng rõ. Worker JWT có audience riêng, không dùng user JWT. Lease/auth/endpoint chi tiết ở [remote-worker-protocol.md](remote-worker-protocol.md).

V1.2 jobs dùng execution_target = vps_colocated, routing_version, routing_policy_hash và producer_agent; lease owner là ID tiến trình worker với fencing token. assigned_worker_id FK tới remote registry được hoãn cùng remote mode; không tạo FK tới bảng chưa triển khai. Profile/usage snapshots phân biệt inferenceProfileHash với billingProfileHash để đổi giá không làm vô hiệu cache inference. Không cần bảng riêng cho từng agent hoặc model.

## 3. Policy tính điểm chuẩn

Với earnedUnits và maxUnits là integer không âm, maxUnits > 0:

~~~text
normalizedScoreTenths =
  floor((2 * earnedUnits * 100 + maxUnits) / (2 * maxUnits))
GradeEntry.score = normalizedScoreTenths / 10
~~~

Điều kiện trước khi tính: earnedUnits <= maxUnits <= 1_000_000, mọi tiêu chí là integer và đã đầy đủ. Giới hạn này giữ phép tính trong miền integer an toàn của JavaScript.

Ví dụ: 7250 / 10000 units → 73 tenths → 7.3; 250 / 1000 → 25 tenths → 2.5. Không làm tròn từng tiêu chí trước khi cộng.

Lựa chọn đơn chỉ có điểm khi xác định một lựa chọn cuối cùng. Nhóm Đúng/Sai có policy per_statement hoặc count_map đã duyệt. count_map có n+1 phần tử, không giảm, trong [0,maxUnits]; nếu còn ô chưa đọc được thì điểm nhóm vẫn chưa xác định.

## 4. API và quyền

Success responses là JSON trực tiếp như school API hiện tại; list dùng {items,total,page,limit}. limit mặc định 25, tối đa 100. Progress/detail không cache; server gửi Cache-Control: private, no-store.

Mọi endpoint staff dùng JWT, role TEACHER/PRINCIPAL/ADMIN ở method và shared class-subject authorization ở service. /context không có classId chỉ liệt kê những lớp/môn actor có quyền. Endpoint lookup ID sai quyền/tenant trả 404.

| Method | Route | Hợp đồng |
|---|---|---|
| GET | /assessments/context | Lớp/môn có thể chấm; không trả roster toàn trường. |
| GET | /assessments/context/roster?classId=&subjectId= | Roster tối thiểu id, displayName, studentCode nếu có. |
| POST | /assessments | Tạo đợt và roster snapshot; 201. |
| GET | /assessments?classId=&subjectId=&page=&limit= | Danh sách theo quyền. |
| GET | /assessments/:assessmentId | Metadata, capabilities và tóm tắt đợt. |
| PATCH | /assessments/:assessmentId | Sửa metadata với expectedContextRevision; quy tắc freeze sau công bố. |
| POST | /assessments/:assessmentId/roster | Thêm thành viên có kiểm tra, expectedContextRevision; có audit. |
| POST | /assessments/:assessmentId/submissions | Tạo nhóm {clientGroupId,studentId?}; 201, replay trả cùng submission. |
| GET | /assessments/:assessmentId/submissions | Bảng kết quả; filter needsAttention, processingState, publicationState. |
| GET | /assessments/:assessmentId/submissions/:submissionId | Trang, câu, currentReview, publishedReview và flags. |
| PATCH | /assessments/:assessmentId/submissions/:submissionId/identity | Chọn studentId trong roster với expectedIdentityRevision. |
| POST | /assessments/:assessmentId/uploads | {submissionId?,purpose,name,mime,byteSize,sha256?}; trả assetId, upload {method,url,fields,requiredHeaders}, expiresAt. |
| POST | /assessments/:assessmentId/assets/:assetId/complete | Xác nhận upload xong; 202 {jobId,assetId,state:"verifying"}. |
| GET | /assessments/:assessmentId/assets/:assetId/access | Staff-only: cấp URL GET có hạn sau kiểm tra quyền; không nhận objectKey từ client. |
| PATCH | /assessments/:assessmentId/pages/:pageId/selection | {expectedInputRevision,primaryPolygon}; tạo bản phân tích mới và job; 202. |
| POST | /assessments/:assessmentId/process | {submissionIds?,expectedInputRevisions}; 202 {jobIds}; chỉ nhóm trong assessment. |
| GET | /assessments/:assessmentId/progress | Counts theo công đoạn, cảnh báo, jobs lỗi; không mang raw provider response. |
| GET | /assessments/:assessmentId/exam-versions/:versionId | Đề/rubric cùng evidence và trạng thái duyệt. |
| POST | /assessments/:assessmentId/exam-versions | Tạo draft từ version trước hoặc marking guide; 201/202 theo có gọi AI hay không. |
| GET | /assessments/:assessmentId/exam-versions/:versionId/impact | Số bài/câu bị ảnh hưởng trước khi áp dụng. |
| POST | /assessments/:assessmentId/exam-versions/:versionId/approve | {expectedVersionHash,applyTo:"unpublished" hoặc submissionIds}; kiểm tra schema/domain, lưu audit, tạo jobs. |
| PATCH | /assessments/:assessmentId/submissions/:submissionId/answers/:questionKey | {expectedInputRevision,expectedAnswerRevisionId,content,reason}; tạo answer revision và job; 202. |
| POST | /assessments/:assessmentId/submissions/:submissionId/reviews | Tạo review revision từ expectedReviewRevisionId, overrides và typed flag resolutions; 201. |
| POST | /assessments/:assessmentId/finalizations | Tối đa 50 mục; Idempotency-Key bắt buộc; 200 kết quả từng mục. |
| POST | /assessments/:assessmentId/publications/:publicationId/withdraw | expectedPublicationRevision và reason; transaction, 200. |
| POST | /assessments/:assessmentId/jobs/:jobId/retry | Lỗi được phép retry, giữ budget/idempotency; 202. |
| POST | /assessments/:assessmentId/exports | {format,submissionIds?}; snapshot published; 202 {exportId,jobId}. |
| GET | /assessments/:assessmentId/exports/:exportId | Trạng thái, snapshot date và metadata. |
| GET | /assessments/:assessmentId/exports/:exportId/access | Link download staff-only có hạn. |
| POST | /assessments/:assessmentId/archive | Chỉ archive; không xóa GradeEntry hoặc lịch sử. |
| GET | /assessments/published/:publicationId | View tối thiểu của kết quả active; chủ bài hoặc ParentLink approved hoặc staff. |

questionKey truyền trong path phải URL-encode; parser áp pattern ký tự chữ/số, dấu chấm, gạch dưới/gạch ngang, không chấp nhận slash. Route tĩnh /context và /published đăng ký trước route tham số khi cần.

Idempotency-Key áp dụng thêm cho create assessment, complete upload, process, approve version, retry, withdraw và exports. Các command này có hiệu ứng ghi hoặc gọi provider; FE retry không tạo công việc mới ngoài ý muốn.

### 4.1 Finalize request

~~~json
{
  "items": [
    {
      "submissionId": "33333333-3333-4333-8333-333333333333",
      "expectedInputRevision": 3,
      "expectedReviewRevisionId": "44444444-4444-4444-8444-444444444444",
      "expectedReviewHash": "sha256-of-the-rendered-review",
      "expectedContextRevision": 1,
      "expectedPublicationRevision": null,
      "identityAcknowledgement": {
        "studentId": 101,
        "expectedIdentityRevision": 2
      }
    }
  ]
}
~~~

Client không truyền final score. Server kiểm tra content hash, giáo viên đã được cung cấp dữ liệu để duyệt và các lỗi chặn đã được giải quyết bằng typed command. proposed identity chỉ được confirm nếu trùng acknowledgement, không phải conflict. expectedPublicationRevision là null khi chưa có publication; nếu đã có thì là revision hiện hành, kể cả withdrawn, để một màn hình cũ không tự công bố lại điểm đã rút.

### 4.2 Finalize response

~~~json
{
  "items": [
    {
      "submissionId": "33333333-3333-4333-8333-333333333333",
      "outcome": "finalized",
      "publicationId": "55555555-5555-4555-8555-555555555555",
      "gradeEntryId": "66666666-6666-4666-8666-666666666666",
      "score": 7.3
    }
  ]
}
~~~

Điểm trong ví dụ là dữ liệu tổng hợp để minh họa contract, không phải điểm của bài học sinh đã gửi. outcome: finalized, already_finalized, blocked, conflict, not_found. Item lỗi có errorCode và message; không lộ item thuộc trường khác.

### 4.3 Error envelope

Dùng AllExceptionsFilter hiện có: {statusCode,message,error,timestamp,path}. Mã máy đọc đặt ở trường error bằng HttpException response; không thêm field bị filter hiện tại loại bỏ.

| HTTP | error |
|---|---|
| 400 | ASSESSMENT_INVALID_INPUT |
| 404 | ASSESSMENT_NOT_FOUND |
| 409 | ASSESSMENT_STALE_REVISION |
| 409 | ASSESSMENT_IDEMPOTENCY_CONFLICT |
| 409 | ASSESSMENT_IDENTITY_CONFLICT |
| 409 | ASSESSMENT_FINALIZATION_BLOCKED |
| 409 | ASSESSMENT_SOURCE_GRADE_LOCKED |
| 413 | ASSESSMENT_UPLOAD_TOO_LARGE |
| 415 | ASSESSMENT_UNSUPPORTED_FILE |
| 429 | ASSESSMENT_BUDGET_EXCEEDED |
| 503 | ASSESSMENT_NOT_READY |

## 5. Lỗi chặn và gợi ý kiểm tra

Flag gồm code, severity (blocking|advisory), questionKey nullable, sourceRegionIds, message, resolutionState và resolutionEventId.

Các lỗi chặn mặc định: identity_unresolved, identity_conflict, exam_code_conflict, answer_key_unapproved, answer_not_found, answer_unreadable, choice_ambiguous, missing_evidence, invalid_grading_output, score_limit_violation, stale_manual_override, drawing_review_required (pilot).

Không có endpoint “bỏ qua mọi cảnh báo”. Resolve phải là hành động cụ thể: sửa câu đọc, xác nhận lựa chọn, xác nhận bỏ trống có lý do, chọn lại học sinh, duyệt rubric hoặc xác nhận câu hình. Các invariant tenant/điểm/schema/revision không được override bằng lời nhắn.

Model self-confidence là metadata; không đủ để đóng flag. Advisory như chữ hơi mờ nhưng đã đọc được không tự chặn cả bài nếu không ảnh hưởng kết quả; vẫn mở kiểm tra được.

## 6. Transaction chốt, sửa và rút điểm

Thứ tự khóa nhất quán: assessment context → submission → publication → GradeEntry. Batch xử lý từng item độc lập theo thứ tự ổn định; không giữ khóa trong khi gọi provider.

1. Kiểm tra quyền lại trong transaction bằng cùng EntityManager; kiểm tra roster lịch sử và ngữ cảnh lớp/môn.
2. Kiểm tra expected revisions/hashes, rubric approved và current review phù hợp manifest hiện hành.
3. Nếu publication active đã trỏ đúng review/context/identity, trả cùng gradeEntryId cho thao tác lặp tương ứng. Publication withdrawn hoặc revision mới khác phải khớp expectedPublicationRevision; không tự tái công bố từ request cũ.
4. Xác nhận danh tính proposed đúng acknowledgement; mọi thay đổi khác làm conflict.
5. Tính normalizedScoreTenths bằng policy; tạo/update publication, upsert GradeEntry theo assessmentPublicationId.
6. Lưu finalized ReviewEvent gồm before/after source refs và điểm; commit.

Unique constraints là hàng rào cuối cho hai request đồng thời. Bắt 23505 rồi đọc lại cùng source và kiểm tra revision, không dùng catch chung để báo thành công.

Rút điểm ghi withdrawn event và xóa GradeEntry trong cùng transaction; giữ publication/review. /grades PATCH/DELETE không sửa nguồn assessment trực tiếp. Chỉnh sửa qua review rồi chốt lại cập nhật cùng đầu điểm nếu chưa rút.

Không dùng ActivityLog.recordBestEffort làm audit duy nhất. Sau commit có thể ghi activity log cho giao diện, lỗi log không đảo ngược điểm đã chốt.

## 7. Read models và cache

GET bảng bài nộp chỉ trả tóm tắt; mở bài mới lấy regions/answer details. Progress poll theo assessment, không poll từng ảnh/từng câu. List/detail trả cả currentReview và publishedReview khi khác nhau.

GradeEntryView thêm source nullable {kind:"assessment",publicationId}; đầu điểm thủ công/quiz giữ shape cũ hợp lệ. Student/parent API hiện tại vẫn chỉ thấy các row school_grades đã công bố.

Published-result view chỉ trả câu hỏi, rubric được công bố, kết quả và evidence đã che nền của đúng học sinh. Không trả sourceRegionIds của template lấy từ bài học sinh khác, raw asset URL, internal review notes hoặc provider metadata. Nếu chưa tạo được evidence an toàn thì chưa cấp ảnh; staff vẫn có thể kiểm tra original trong màn hình nội bộ.

FE dùng cache:false cho assessment đang xử lý/duyệt và cho grade report cần đọc ngay sau finalize. Khi mutation thành công, invalidate assessment detail/list/progress, GRADES và CHILD_GRADES liên quan; đồng thời loại/bypass cache Axios tương ứng. Không chỉ invalidate TanStack rồi đọc lại cache HTTP cũ.

## 8. Migrations

Tách ba migration có thể kiểm tra độc lập:

1. AddAssessmentFoundation: assessment, roster, exam versions, submission, assets, pages, regions, answer revisions.
2. AddAssessmentProcessing: grading/review runs, events, jobs, provider calls, idempotency, exports, lease/fencing và routing metadata cho worker VPS; hoãn worker registry và remote auth metadata.
3. AddAssessmentPublications: publications, nullable source column/unique/FK/check trên school_grades.

Các FK trỏ bảng tạo ở migration sau, như current_review_revision_id, được gắn sau khi bảng đích tồn tại; không tham chiếu bảng chưa tạo trong migration nền.

Timestamp cụ thể của migration chọn lớn hơn mọi migration đang có lúc triển khai. Không bật synchronize để tạo schema. Down chỉ dùng ở database test hoặc khi chưa có dữ liệu assessment; production rollback ứng dụng giữ nguyên schema và dữ liệu đã chốt.
