# Pipeline, worker và vận hành — Assessment v1

Tham chiếu [thiết kế](../superpowers/specs/2026-11-03-ai-assisted-assessment-design.md) và [hợp đồng dữ liệu/API](data-and-api-contract.md). Các mức giới hạn ở đây là mặc định thiết kế cho pilot, chưa phải kết quả load test.

V1.1 bổ sung [agent/model router](multi-agent-model-routing.md) và [giao thức worker Mac](remote-worker-protocol.md). Những đoạn worker claim/ghi DB trực tiếp bên dưới mô tả mode co-located; mode remote dùng API coordinator trên VPS với cùng fencing và validation.

## 1. Bố cục mã nguồn dự kiến

Các đường dẫn sau là file cần tạo/sửa lúc triển khai, không phải file đã tồn tại.

~~~text
src/modules/assessment/
  assessment.module.ts
  assessment.controller.ts
  assessment-context.service.ts
  submission.controller.ts
  submission.service.ts
  exam-version.controller.ts
  exam-version.service.ts
  review.controller.ts
  review.service.ts
  finalization.service.ts
  published-result.controller.ts
  assessment-export.service.ts
  dto/                         DTO command/query, không chứa tính điểm
  entities/                    Các entity đã liệt kê trong data contract
  domain/
    score.policy.ts            Units, tổng tiêu chí, chuẩn hóa thang 10
    objective-grading.policy.ts Lựa chọn đơn, Đúng/Sai theo policy
    finalization.policy.ts     Điều kiện đủ để chốt
    revision.policy.ts         Stale results và override bị ảnh hưởng
    evidence.policy.ts         Nguồn hợp lệ, background và cùng tenant
    fingerprint.policy.ts      Hash canonical đầu vào và scope
  contracts/                   JSON Schema, types, adapter output validators
  providers/
    assessment-provider.port.ts
    assessment-provider.registry.ts
    layout-reader.adapter.ts
    answer-reader.adapter.ts
    key-drafting.adapter.ts
    rubric-grader.adapter.ts
    drawing-grader.adapter.ts
  processing/
    page-preparation.service.ts
    answer-extraction.service.ts
    grading-orchestrator.service.ts
    result-validation.service.ts
    review-aggregation.service.ts
  infrastructure/
    assessment-storage.port.ts
    s3-assessment-storage.adapter.ts
    assessment-job.service.ts
    assessment-dispatcher.service.ts
    assessment-provider-call.service.ts
    assessment-idempotency.service.ts
src/workers/
  assessment-worker.module.ts
  assessment-worker.main.ts
src/modules/school/
  school-class-subject-access.service.ts
  gradebook-writer.service.ts
~~~

API module và worker module dùng cùng domain/contracts/entities nhưng không cùng bootstrap. Tách module hạ tầng nếu cần để API không đăng ký Worker và worker không đăng ký HTTP controller. Một file policy có test colocated cùng tên .spec.ts.

Worker entrypoint tạo application context, đóng queue/DB có graceful shutdown. Script dự kiến start:assessment-worker chạy dist/workers/assessment-worker.main.js; đường dẫn build phải được kiểm tra với cấu hình Nest thực tế trước khi ghi Docker command.

## 2. Hợp đồng các adapter

Không chốt nhà cung cấp/model bằng tên marketing. Registry chỉ nhận những profile vượt capability test và được cấu hình phía server.

| Port | Input bắt buộc | Output bắt buộc |
|---|---|---|
| AssetStorage | Asset ID đã được authorize, byte stream và giới hạn | Key/version/checksum do server kiểm chứng, không trả credential |
| LayoutReader | Ảnh phân tích + kích thước + vùng tờ chính | Regions có polygon, role, text/cell observations và cảnh báo |
| TemplateReader | Chỉ vùng câu hỏi/điểm/hình đề đã phân loại | Câu hỏi, phần/ý, loại, điểm tối đa, sourceRegionIds; không lấy dấu chọn làm key |
| AnswerReader | Câu hỏi để ghép + vùng bài làm liên quan; không có đáp án đúng | Observation theo kind, sourceRegionIds, ambiguityCodes |
| KeyDraftingProvider | Đề chuẩn hóa, marking guide được phép | Đáp án/rubric nháp và các điểm chưa xác định; không nhận bài học sinh |
| RubricGrader | Câu hỏi, rubric, AnswerRevision và evidence liên quan | Điểm từng criterionId, giải thích ngắn và evidenceRegionIds |
| DrawingGrader | Câu hỏi, rubric hình, ảnh vùng hình và quan hệ trang | Quan sát hình, điểm từng tiêu chí, giới hạn quan sát và evidence |

Kết quả phải qua schema, kiểm tra ID, miền điểm, manifest và tenant. Trả JSON parse được chưa đủ. Không dùng chat history, memory của AI Tutor hoặc tìm kiếm web tự do trong lúc chấm.

Khi cần tài liệu môn học để soạn key, chỉ sử dụng nguồn giáo viên/admin đã đưa vào phạm vi đợt; lưu phiên bản nguồn. Đây không phải RAG ngầm từ mọi khóa học trong hệ thống.

Model self-confidence không điều khiển việc công bố. Refusal, output thiếu, model không hỗ trợ ảnh, hoặc vượt context phải được biểu diễn bằng lỗi/cảnh báo rõ.

## 3. Các stage và dependency

| Stage | Scope | Hoàn thành khi |
|---|---|---|
| seal | asset | Định dạng, kích thước, checksum và sealed key được xác thực |
| prepare | asset/page | Đã render, có vùng tờ chính, chất lượng và phép biến đổi |
| template | mã đề trong assessment | Có cấu trúc đề/rubric draft hoặc nhận ra phiên bản đã duyệt phù hợp |
| extract | page/nhóm vùng của submission | Có observations và ánh xạ câu; phần thiếu được ghi nhận |
| grade | nhóm câu độc lập | Có điểm rule/model đã qua validation hoặc lỗi có scope rõ |
| aggregate | submission revision | Có ReviewRevision nhất quán với các câu, flags và tổng phần đã chấm |
| export | export snapshot | File báo cáo hoàn chỉnh được lưu vào kho riêng |
| purge | asset/report đã hết hạn | Bytes được xóa theo retention; audit/hash còn đúng quy tắc |

prepare/extract có thể chạy song song theo trang. Chỉ grade sau khi question mapping và inputs cần thiết đã có. Template/rubric draft có thể cho điểm nháp; finalize luôn yêu cầu bản được duyệt tương ứng.

Không đợi tất cả học sinh xong mới hiển thị bài đã hoàn thành. Một câu unreadable không làm mất điểm đã chấm của câu khác. Khi aggregate, mọi câu dự kiến đều xuất hiện, kể cả observation not_found.

## 4. Chọn tờ chính và đọc ảnh

1. Kiểm tra signature file, số trang, kích thước ảnh sau decode; không chỉ tin extension/MIME.
2. Giữ nguyên bản gốc. Render PDF trong worker bằng tiến trình có giới hạn, dùng argument array không shell. PDF có text layer được tận dụng nhưng phần viết tay và dấu chọn vẫn phải đọc từ ảnh.
3. Tạo ảnh bố cục và vùng tờ chính. Nhiều giấy chồng nhau được giữ thành các candidate, không mặc định mọi chữ trong khung ảnh thuộc một bài.
4. Phân loại regions. Thông tin trên background chỉ tạo cảnh báo xung đột, không thay header chính.
5. Đọc vùng cần thiết từ độ phân giải gốc/đủ rõ. Crop bảng phải giữ nhãn hàng/cột; crop hình giữ nhãn kích thước và vị trí tương quan.
6. Lưu transform giữa ảnh phân tích và original. Khi vẽ overlay trên UI, dùng cùng hệ tọa độ, kiểm tra round-trip với điểm mốc.

Mỗi ảnh có thể chứa nhiều loại vùng. Không ép “một trang = chỉ đề” hoặc “một trang = chỉ bài làm”.

MVP dùng thư viện xử lý ảnh Node và renderer PDF trong container worker; lựa chọn triển khai gợi ý là sharp và Poppler. Đây là dependency mới cần thêm rõ ràng khi triển khai; không cho rằng pdf-parse hiện tại render được trang hoặc đọc được nét viết tay.

## 5. Ghép bài, ghép câu

Ưu tiên nhóm upload có ngữ cảnh do giáo viên tạo. Trong nhóm, dùng header trên tờ chính, lớp, mã đề, số trang đề và tính tiếp nối câu để đề xuất thứ tự. Không dựa riêng tên file hoặc thời điểm upload.

Khi class có hai tên trùng nhau, yêu cầu chọn roster member. Nếu tên trên tờ chính khác nhóm đã chọn, giữ input trong nhóm tạm có flag; không tự chuyển bài đã có điểm sang học sinh khác.

Nhận diện mã đề phải kèm nội dung đề. Mã 102 trong đợt khác không phải cùng template. Một vùng câu có thể có nhiều source regions và nhiều pages.

Nếu không tìm thấy II.1.a, tra lại tất cả vùng trong submission một lần theo câu hỏi và các trang chưa ghép. Nếu vẫn không tìm thấy, tạo answer_not_found. Không dùng trang nền hoặc câu của học sinh khác để “điền đủ”.

## 6. Chấm chuyên biệt

### Lựa chọn và Đúng/Sai

Tách việc đọc dấu khoanh/Đ/S khỏi việc so đáp án. Ghi dấu sửa, nhiều lựa chọn, không chọn hoặc mơ hồ. Ký hiệu Đ/S được chuẩn hóa bằng policy có kiểm tra ký hiệu gốc.

Rule grader không gọi LLM cho phép so đáp án/cộng điểm. Một ô chưa đọc được trong nhóm Đúng/Sai giữ điểm nhóm chưa xác định nếu policy cần toàn bộ nhóm.

### Văn bản và bảng

Chấm từng criterion, chấp nhận cách diễn đạt tương đương theo rubric. Lỗi kéo theo chỉ được trừ theo policy đã duyệt, tránh trừ lặp. Bảng so sánh giữ cấu trúc khi đưa vào grader; không phạt chỉ vì thứ tự các ý khác nếu rubric không yêu cầu.

Grader nhận text cùng crop liên quan để đối chiếu. Khi text và ảnh không nhất quán, cần đọc lại hoặc review, không chọn một bản thuận với đáp án.

### Hình vẽ

Rubric hình xác định các tiêu chí độc lập: số hình chiếu, dạng hình/kích thước biểu diễn, bố trí tương quan, nhãn/ghi kích thước và quy cách trình bày nếu được yêu cầu. Điểm phân bổ do giáo viên duyệt, không tự đặt thành quy chế.

Trong bộ mẫu: đề cho L=40 mm, W=20 mm, H=30 mm và yêu cầu hình chiếu theo phương pháp nêu trong đề. Evidence cần chứa toàn bộ hình liên quan để đánh giá bố trí; crop từng nhãn riêng không đủ kết luận bố trí đúng.

Không đo milimét vật lý từ pixel ảnh chụp chưa hiệu chuẩn. Nét gạch sửa ở kích thước phải được giữ trong observation. drawing_review_required là flag chặn ở pilot; giáo viên xem và xác nhận câu hình trong UI. Chỉ thay policy này bằng một quyết định sản phẩm mới sau đánh giá riêng nhánh hình.

## 7. Công việc bền vững và chống chạy trùng

1. Command ghi thay đổi nghiệp vụ và job pending trong cùng transaction PostgreSQL.
2. Dispatcher claim job bằng SELECT ... FOR UPDATE SKIP LOCKED, tạo generation và gửi BullMQ bằng ID gồm UUID-gạch ngang-generation; không dùng dấu hai chấm trong custom job ID.
3. Nếu gửi queue thành công nhưng chưa cập nhật DB, dispatch lại vẫn an toàn. Nếu queue mất dữ liệu, reconciler tìm công việc chưa hoàn thành để gửi lại.
4. Worker claim lease trong DB. Chỉ lease_token hiện hành được ghi kết quả; worker cũ hết lease không commit current result.
5. Trước một cuộc gọi có phí, kiểm tra result đã có cho input hash, reserve budget và ghi ProviderCall.
6. Lưu response riêng tư và trạng thái call trước khi aggregate. Nếu worker dừng sau đó, thử lại đọc response đã lưu.
7. Khi commit, so input_revision/manifest hiện hành. Input đã đổi → run stale; không ghi đè currentReview hoặc điểm giáo viên.
8. Job succeeded là bằng chứng hoàn thành; TTL xóa BullMQ job không xóa dữ liệu nghiệp vụ.

At-least-once được chấp nhận cho delivery; hiệu ứng DB phải idempotent. Không tuyên bố exactly-once với provider bên ngoài: timeout có thể đã tạo phí. unknown calls được tính vào số lần gọi và reservation, không tự coi miễn phí.

Dispatcher poll 2 giây; reconciler 30 giây. Lease công việc 180 giây, heartbeat 30 giây, chỉ reclaim sau khi lease hết. Đây là mặc định vận hành, kiểm tra lại khi benchmark.

## 8. Retry và dừng

Tổng tối đa ba lần thử tự động cho cùng công việc với cùng input. Provider adapter không tự retry ngầm bên trong; mỗi lần gọi được ghi riêng. Backoff 2 giây, 10 giây, có jitter; 429 tôn trọng Retry-After và rate limiter dùng chung theo profile/key.

- Retry: mất kết nối, timeout, 429, 5xx, lỗi storage/DB tạm thời.
- Một lần đọc/sinh lại có kiểm soát cho output hỏng schema, vẫn nằm trong budget/tổng attempt; không lặp vô hạn để lấy điểm “hợp lý”.
- Không retry tự động: 401/403 provider, profile không có capability, file hỏng/quá giới hạn, cấu trúc đề mâu thuẫn, hết ngân sách.
- Lỗi dữ liệu bài: tạo flag có scope, cho phần khác tiếp tục.
- Cancel/supersede: kiểm tra trước mỗi side effect; request AI đang bay có thể không hủy được nhưng kết quả không làm current.

Worker lưu error code có thể xử lý, không trả raw prompt, response có dữ liệu học sinh hoặc secret ra client/log. Lỗi cần retry phải ném Error sau khi ghi trạng thái; không trả object failed rồi để BullMQ coi là thành công.

## 9. Storage, upload và giới hạn

S3-compatible storage là mặc định cho pilot có nhiều process. Local-private adapter chỉ phục vụ dev có volume dùng chung; không dùng thư mục avatar public.

Upload flow: API tạo asset/staging key → cấp presigned POST policy với key chính xác, MIME và content-length-range → client upload → complete → seal job kiểm tra bytes → copy sang sealed key mới → prepare. Client không có quyền upload cho sealed prefix. Nếu storage có versioning, ghi version ID bên cạnh checksum.

Seal phải dùng đúng bytes đã kiểm tra: pin version của staging rồi copy đúng version đó; nếu storage không có versioning, stream bytes một lần vào sealed key mới đồng thời tính checksum và chỉ chuyển asset sang sealed khi hoàn tất. Không verify một key rồi copy lại key mutable sau đó vì client còn có thể ghi đè staging.

GET link TTL 5 phút; upload policy TTL 15 phút. Capability còn dùng được tới khi hết hạn; không hứa thu hồi tức thì. Không ghi URL/policy đã ký vào log, DB lâu dài hoặc activity metadata. Storage thiếu POST policy có thể dùng endpoint upload streaming qua API với cùng giới hạn; không thay bằng upload không giới hạn kích thước. Nginx chỉ tăng body limit tới 64 MiB cho endpoint streaming này khi bật, không tăng toàn bộ API.

| Tài nguyên | Mặc định pilot |
|---|---|
| File ảnh | JPEG, PNG, WebP; tối đa 20 MiB/file |
| PDF | Tối đa 50 MiB/file; chỉ PDF đọc/render được, không password |
| Ảnh sau decode | Tối đa 40 megapixel; vượt giới hạn yêu cầu xuất/chụp lại phù hợp |
| Trang/bài | Tối đa 30 trang, tính cả các asset sealed đang có hiệu lực |
| Roster/đợt | Tối đa 200 học sinh |
| Upload trình duyệt | Tối đa 3 file đồng thời; có retry/resume theo asset |
| Render/prepare | Concurrency 1 mỗi worker, subprocess timeout 30 giây/trang |
| Đọc/chấm qua provider | Concurrency toàn cục ban đầu 2/profile |
| Timeout provider | 90 giây/request, tách connect timeout 10 giây |
| Calls có phí | Tối đa 24 attempts/submission revision; tối đa 12 attempts/template draft |
| Batch finalize | Tối đa 50 bài/request |
| Poll UI | 3 giây khi active, 10 giây khi tab nền, dừng khi kết thúc |

Quota lớp/đợt được kiểm tra trên tổng asset đã có và đang upload, không chỉ từng request. Rate limit và ngân sách còn áp theo tenant/actor để một đợt không chiếm hết provider.

Một vùng khó có thể dùng escalation model được cấu hình; vẫn trong call/cost budget, lưu model mới trong provenance. Không upscale/biến đổi để tự tạo nét viết không có trong ảnh.

Staging bỏ dở xóa sau 24 giờ. Mặc định raw/derived images và raw provider outputs lưu 365 ngày sau lần công bố gần nhất; báo cáo tải xuống hết hạn sau 7 ngày. Unpublished draft không hoạt động 90 ngày được cảnh báo trước và xóa bytes theo retention job. Điểm/review/audit không bị xóa chỉ vì queue hoặc file TTL hết. Retention là cấu hình sản phẩm của trường, không phải tuyên bố về nghĩa vụ pháp lý.

Sau purge, UI báo evidence đã hết hạn; không tự chấm lại từ dữ liệu ảnh đã xóa. Upload bổ sung tạo đầu vào mới; điểm đã công bố vẫn giữ nguyên tới khi giáo viên chốt bản mới.

## 10. Cấu hình và readiness

Biến cấu hình mới được thêm vào config.validation.ts khi triển khai, không đọc fallback từ AI Tutor:

- ASSESSMENT_ENABLED mặc định false.
- ASSESSMENT_ROUTING_CONFIG_PATH trỏ cấu hình agent/model có phiên bản; khi có file này, đây là nguồn routing chuẩn thay cho ánh xạ profile đơn giản ban đầu.
- ASSESSMENT_QUEUE_REDIS_URL bắt buộc khi enabled; khác REDIS_URL cache.
- ASSESSMENT_STORAGE_DRIVER = s3 trong pilot; bucket, endpoint, region, credential refs qua biến môi trường/secret.
- ASSESSMENT_READ_PROFILE, ASSESSMENT_GRADE_PROFILE và ASSESSMENT_DRAWING_PROFILE trỏ cấu hình server có provider/model/base URL/key reference/capabilities.
- Ba profile đơn giản trên là chế độ chuyển tiếp khi chưa có routing file; remote worker luôn dùng snapshot do server cấp, không tự đổi profile từ env. Credential references được resolve cục bộ, không chuyển secret qua job payload.
- Profile OCR riêng là tùy chọn nếu reader tổng hợp đã đủ; cấu hình rõ khi chọn adapter.
- ASSESSMENT_DAILY_COST_LIMIT_MICROS và bảng đơn giá/profile do operator đặt, bắt buộc ở pilot có gọi provider; đây là giới hạn vận hành, không phải billing.
- Các giới hạn ở mục 9 được validator chặn giá trị âm/vô hạn; profile có max output, timeout và rate quota rõ.

Readiness kiểm tra DB schema, storage sealed/staging permissions, queue persistence/noeviction và khả năng profile. Không sẵn sàng thì command process trả 503; vẫn cho đọc kết quả đã lưu. Không fallback sang in-memory queue cho chấm chính thức.

Reserve ngân sách trước call bằng transaction; đối soát sau call bằng usage thực. Khi giá/usage không xác định, lưu null, giữ reservation bảo thủ và dừng call mới nếu không còn budget. Không suy chi phí = 0. Tất cả cost dùng integer micros cùng currency được cấu hình.

Ngân sách ngày của trường tính theo Asia/Ho_Chi_Minh; lưu timestamps UTC. Không tự đổi currency theo tỷ giá runtime. Profile phải có đơn giá quy về currency ngân sách trước khi được bật.

Redis queue bật AOF appendfsync everysec, volume bền vững và noeviction. Cấu hình allkeys-lru/appendonly no/tmpfs của cache giữ riêng. PostgreSQL jobs và reconciler chịu trách nhiệm khôi phục cả khi Redis restart làm mất một phần dữ liệu.

## 11. Quan sát và khôi phục

Metrics: job age/latency/error theo stage; submission completion time; OCR/read ambiguity; số flag cần giáo viên; calls/tokens/pages/cost thực và reserved; provider rate limit; stale results bị loại; duplicate finalization; lease reclaim; export errors.

Không dùng tên học sinh làm nhãn metric hoặc log. Dùng traceId/jobId/submissionId kỹ thuật. Log request HTTP mới phải kiểm tra để không in multipart body hoặc signed URL.

Alert khi không có worker heartbeat 2 phút trong lúc có pending jobs, pending age vượt 10 phút, provider auth failure hoặc budget gần hết. Các con số là ngưỡng pilot để điều chỉnh từ số đo.

API restart: pending jobs còn DB. Worker restart: lease/reconciler phục hồi. Redis mất dữ liệu: dispatch lại từ DB. Provider outage: retry giới hạn rồi paused/failed rõ. DB outage: không cho finalize hoặc tự báo thành công. Object mất: giữ điểm lịch sử, flag evidence_missing và dừng chấm mới phần đó.

Backup DB và object storage phải được kiểm tra phục hồi cùng manifest. Không claim backup thành công chỉ vì có lịch chạy. Quyền worker chỉ đủ đọc source và tạo derivative/report; không cấp quyền duyệt rubric/chốt điểm qua một model output.

## 12. Frontend

Tạo assessment.api.ts và assessment.types.ts riêng; route:

- /teaching/assessments
- /teaching/classes/:classId/assessments (alias cùng trang danh sách, chọn sẵn lớp)
- /teaching/assessments/:assessmentId
- /teaching/assessments/:assessmentId/submissions/:submissionId

Pages gợi ý AssessmentListPage, AssessmentWorkspacePage, SubmissionReviewPage. Components gồm UploadGroups, BatchResults, ExamKeyReview, EvidenceViewer, QuestionReview và FinalizeSummary. Sidebar Chấm bài role-gated trỏ /teaching/assessments; danh sách lớp/môn lấy /assessments/context để giáo viên bộ môn không phải có quyền GVCN hoặc quản trị roster.

Chỉ hiển thị dữ liệu giáo viên cần quyết định: học sinh/mã đề/điểm/cảnh báo, không hiển thị queue IDs, token counts hoặc profile hashes trong luồng chính. Đợt đã có key approved không bắt xác nhận key lần nữa.

TanStack query keys gồm assessment, submission, progress và exports; chứa school/session context khi cần. Các GET trong lúc xử lý dùng cache:false, staleTime:0. Không persist ảnh/bản đọc/điểm nháp vào localStorage hoặc service-worker cache. Trong ../education_fe/vite.config.ts, loại origin/path storage riêng tư và assessment evidence khỏi rule CacheFirst cho ảnh; chỉ navigateFallbackDenylist /api hiện tại chưa đủ. Khi logout xóa cache theo session-cleanup hiện có.

Sau finalize/withdraw, invalidation áp cả cache server-state và cache Axios grade reads. Chỉnh sửa optimistic chỉ dùng cho UI an toàn; điểm đã chốt phải dựa vào response server, không tự cộng trên client.

## 13. Nguồn kỹ thuật

- [BullMQ production](https://docs.bullmq.io/guide/going-to-production) — persistence/noeviction, kết nối producer/worker.
- [BullMQ idempotent jobs](https://docs.bullmq.io/patterns/idempotent-jobs) — thiết kế chạy lại an toàn.
- [Document AI response](https://docs.cloud.google.com/document-ai/docs/handle-response) — regions, text anchors và tọa độ.
- [S3 presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html) — TTL, khả năng dùng lại và ghi đè cùng key.
- [S3 POST policy](https://docs.aws.amazon.com/AmazonS3/latest/developerguide/sigv4-HTTPPOSTConstructPolicy.html) — điều kiện content-length-range cho browser upload.

Không có lựa chọn nhà cung cấp cuối cùng hoặc cam kết latency/accuracy trong tài liệu. Những quyết định đó đi qua benchmark và capability gate trong kế hoạch đánh giá.
