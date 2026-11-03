# Thiết kế hệ thống chấm bài bằng AI có giáo viên duyệt

Ngày: 2026-11-03. Phiên bản thiết kế: 1.1.

Trạng thái: đặc tả để triển khai và đánh giá; chưa phải chức năng đã được cài đặt hoặc đã đạt độ chính xác thực nghiệm.

## 1. Mục tiêu và quyết định sản phẩm

Giáo viên tải ảnh/PDF có cả đề và bài làm. Hệ thống tự phân tích, chấm và trả bảng điểm đề xuất. Giáo viên xử lý ngoại lệ, có thể kiểm tra bất kỳ bài nào, rồi chốt cả nhóm vào sổ điểm đang có.

Luồng chính có ba thao tác: **chọn lớp và tải bài → chấm bài → kiểm tra và chốt**. Không bắt buộc giáo viên tách đề, sắp xếp từng trang, gõ lại bài viết tay hoặc mở từng bài để duyệt.

Những quyết định đã thống nhất:

- Backend NestJS 11, TypeScript, TypeORM/PostgreSQL; frontend React hiện tại.
- Worker TypeScript chạy riêng; BullMQ điều phối, DB giữ trạng thái nghiệp vụ và công việc bền vững.
- Một bài nộp có nhiều ảnh/trang; câu trả lời có thể nằm trên nhiều vùng/trang.
- Tách đọc bài và chấm bài thành hai hợp đồng độc lập.
- Chấm tự động tạo điểm đề xuất; chốt điểm là hành động có chủ đích của giáo viên.
- Đáp án/rubric dùng chung cho một phiên bản mã đề. AI có thể soạn nháp khi thiếu; giáo viên xác nhận một lần trước khi công bố điểm của đợt đó.
- Hỗ trợ lựa chọn, nhóm Đúng/Sai, tự luận ngắn, bảng so sánh và hình vẽ cơ bản trong bộ ảnh mẫu.
- Bản đầu triển khai một môn/một khối, một lần nộp chính thức cho mỗi học sinh trong mỗi đợt. Upload lại là sửa đầu vào, không tạo thêm đầu điểm.
- Mở rộng v1.1: nhiều agent theo nhiệm vụ với model cấu hình riêng, code-first và escalation có giới hạn; executor có thể chạy native trên Mac qua HTTPS tới VPS.

Không bao gồm trong bản đầu: tự công bố điểm hoàn toàn không có giáo viên, tự tách chắc chắn mọi PDF gộp nhiều học sinh, chấm mọi loại hình học/bản vẽ, kiểm tra đạo văn, billing, thay đổi quy chế tính điểm trung bình của trường.

## 2. Tích hợp với code thực tế

Mốc đọc code: backend 85c32d1; frontend a0c5b33. Hai thư mục là hai Git repository; thư mục stock phía trên không phải repository.

| Điểm tích hợp | Quyết định |
|---|---|
| src/modules/school/grades.service.ts | Tách quyền lớp × môn thành SchoolClassSubjectAccessService dùng chung; giữ nguyên chính sách GVCN, giáo viên được phân công, hiệu trưởng của trường và ADMIN. |
| src/modules/school/entities/grade-entry.entity.ts | Thêm assessmentPublicationId nullable và unique; điểm thang 10 vẫn numeric(4,1). |
| src/modules/school/school.module.ts | Export dịch vụ quyền và GradebookWriter; không import ngược AssessmentModule. |
| src/modules/ai/ai.service.ts | Không dùng lịch sử chat, system rules của AI Tutor hoặc completeJson hiện tại làm bộ chấm. Tái sử dụng tiện ích mã hóa khóa khi cần; cấu hình chấm tách riêng. |
| src/modules/document-import | Chỉ tái sử dụng tiện ích đã phù hợp; queue và kết quả import flashcard không trở thành dữ liệu chấm bài. |
| src/app.module.ts; src/database/data-source.ts | Đăng ký entity rõ ràng ở cả runtime API, worker và CLI migrations. |
| ../education_fe/src/api/client.ts | API tiến độ/bài đang duyệt dùng NO_CACHE; tránh cache Axios che mất việc refetch của TanStack Query. |
| ../education_fe/src/config/routes.ts; ../education_fe/src/config/query.ts | Thêm route và query keys assessment; không thay cấu trúc quiz session. |
| ../docker-compose.yml; ../docker-compose.prod.yml | Thêm worker và Redis hàng đợi có persistence, không dùng cấu hình cache allkeys-lru cho queue. |

Các endpoint NestJS nằm ở /assessments, không có prefix /api. Nginx frontend nhận /api/assessments rồi bỏ /api theo quy ước đang có.

## 3. Hành trình sử dụng

### 3.1 Tạo đợt chấm

Giáo viên chọn lớp, môn và tên đợt. Năm học lấy từ lớp; học kỳ, ngày kiểm tra, loại đầu điểm và hệ số có giá trị gợi ý nhưng được xác nhận trước khi chốt lần đầu. Ngày kiểm tra là date theo ngữ cảnh Asia/Ho_Chi_Minh, không lấy ngày worker chạy.

Danh sách lớp/môn và roster tối thiểu được cung cấp bằng endpoint assessment có quyền lớp × môn. Không gọi endpoint roster chỉ dành cho quản trị trường để phục vụ giáo viên bộ môn.

Roster được chụp tại thời điểm tạo đợt. Học sinh chuyển lớp sau đó không bị mất bài lịch sử. Thêm học sinh vào roster cần thao tác có quyền và audit.

### 3.2 Tải bài

- Chế độ một bài: toàn bộ ảnh trong một lần thêm bài là một nhóm. Bộ năm ảnh mẫu thuộc một submission.
- Chế độ cả lớp: giao diện giữ nhóm theo học sinh đã chọn, phiên chụp “bài tiếp theo” hoặc thư mục nhóm. Hệ thống gợi ý danh tính từ tờ chính.
- Các trang chưa rõ chủ bài được giữ trong nhóm tạm và yêu cầu xác nhận khi có mâu thuẫn. Không hứa phân nhóm chính xác ảnh lẫn lộn không có dấu nhận dạng.
- Không yêu cầu QR ở đầu vào. QR/mã học sinh là đường tối ưu cho các đợt sau.
- Upload ảnh hoặc PDF chứa đề và bài làm cùng lúc; file đáp án bổ sung là tùy chọn.

Nhận dạng họ tên chỉ đề xuất liên kết với roster. Tên duy nhất, lớp khớp và các trang chính nhất quán có thể được giáo viên xác nhận chung trên bảng kết quả khi chốt. Trùng tên, khác lớp hoặc mâu thuẫn là lỗi chặn, phải chọn lại học sinh.

### 3.3 Chấm tự động

Sau khi bấm Chấm bài, API trả mã công việc, không giữ HTTP để chờ AI. Giáo viên có thể rời trang. Hệ thống tiếp tục xử lý và tạo kết quả nháp cả khi rubric mới đang chờ duyệt; giao diện ghi rõ kết quả tạm thời.

Nếu chưa có đáp án, bộ soạn đáp án chỉ nhận câu hỏi và tài liệu chấm do giáo viên cung cấp; không nhận lựa chọn/bài làm của học sinh làm đáp án mẫu. Giáo viên xác nhận đáp án/rubric một lần ngay trong khu vực kết quả. Sửa khung chấm tạo phiên bản mới và tính lại phần bị ảnh hưởng.

### 3.4 Kiểm tra và chốt

Bảng có học sinh, mã đề, điểm đã chấm, điểm tối đa còn chưa chấm, trạng thái và số cảnh báo. Mặc định ưu tiên bài cần xử lý; có bộ lọc tất cả bài và mở kiểm tra ngẫu nhiên.

Một nút Chốt các bài đã chọn xác nhận danh tính đề xuất đang hiển thị và kết quả đúng revision. Chỉ những bài đủ điều kiện mới được chốt. Response nêu kết quả từng bài; không âm thầm bỏ qua lỗi. Học sinh/phụ huynh chỉ thấy điểm đã công bố.

## 4. Mẫu thực tế và các bất biến bắt buộc

Bộ ảnh Công nghệ 8 do người dùng cung cấp có hai trang đề đã làm trực tiếp và ba ảnh tự luận. Dữ liệu mẫu được gọi HS-A trong tài liệu, không đưa ảnh học sinh vào Git.

| Ảnh người dùng | Vai trò đề xuất | Điều phải giữ |
|---|---|---|
| 4 | Đề trang 1/2, mã 102, câu lựa chọn | Đọc câu hỏi riêng với nét khoanh. |
| 5 | Đề trang 2/2, Đúng/Sai, câu tự luận | Đọc từng ô đúng hàng; tổng điểm 10. |
| 1 | Câu II.1.b dạng bảng, bắt đầu II.2.a | Chỉ lấy tờ chính; giấy nền có mã 103 không thuộc bài. |
| 3 | Tiếp II.2.a, II.2.b, dẫn sang II.3 | Không lấy tên trên tờ giấy nền. |
| 2 | Câu II.3 có ba hình chiếu | Giữ hình ảnh và nét sửa kích thước. |

Nối 1 → 3 → 2 là đề xuất từ nội dung, không phải thứ tự mặc định áp cho mọi submission.

Các bất biến:

1. Vùng nền không quyết định danh tính, mã đề hoặc đáp án.
2. Mã câu có phần/ý: I.1 khác II.1.a.
3. “Đề có 2 trang” chỉ xác nhận trang đề, không xác nhận đủ trang tự luận.
4. II.1.a chưa tìm thấy không tự trở thành bỏ trống hoặc sai.
5. Bảng giữ hàng/cột; vùng hình không được chuyển thành văn bản rồi làm mất bằng chứng.
6. Tổng điểm tối đa là 3 + 1 + 4 + 2 = 10. Quy tắc chấm nhóm Đúng/Sai cần được duyệt.
7. Vẽ hình được chấm theo rubric, không suy milimét tuyệt đối từ pixel ảnh chụp chưa hiệu chuẩn.
8. Mọi điểm đề xuất phải truy ra đúng revision đầu vào và vùng bằng chứng.

## 5. Kiến trúc

Chọn modular monolith cùng worker riêng. Phương án worker Python chỉ được bổ sung nếu benchmark chứng minh cần thư viện OCR/CV chuyên biệt. Phương án microservices theo từng công đoạn chưa có lợi ích đủ để thêm broker hoặc datastore mới.

Agent không đồng nghĩa một microservice: worker Mac có thể thực thi nhiều vai trò/model. Routing chi tiết nằm trong [multi-agent-model-routing.md](../../assessment/multi-agent-model-routing.md). Khi worker ở Mac, coordinator lease/DB nằm trên VPS và worker giao tiếp qua [remote-worker-protocol.md](../../assessment/remote-worker-protocol.md); DB/Redis không public để Mac truy cập trực tiếp.

~~~mermaid
flowchart TD
  UI["React: Upload và kiểm tra"] --> API["NestJS Assessment API"]
  API --> DB[("PostgreSQL: dữ liệu và công việc")]
  UI --> UP["Upload có giới hạn tới vùng staging"]
  UP --> STORE[("Kho file riêng tư")]
  API --> SEAL["Kiểm tra và niêm phong file"]
  SEAL --> STORE
  DB --> DISPATCH["Dispatcher / khôi phục công việc"]
  DISPATCH --> QUEUE["BullMQ + Redis queue riêng"]
  QUEUE --> PREP["Worker: chuẩn bị, bố cục, chọn tờ chính"]
  STORE --> PREP
  PREP --> TEMPLATE["Dựng đề và khung chấm dùng chung"]
  PREP --> READ["Đọc và ghép bài làm"]
  TEMPLATE --> GRADE["Rule grader + rubric grader + drawing grader"]
  READ --> GRADE
  GRADE --> VALIDATE["Kiểm tra schema, điểm và bằng chứng"]
  VALIDATE --> DB
  DB --> RESULT["Bảng kết quả và cảnh báo"]
  RESULT --> APPROVE["Giáo viên xác nhận và chốt qua API"]
  APPROVE --> TX["Transaction: publication, GradeEntry, audit"]
  TX --> DB
~~~

API không tự khởi tạo worker chấm. Worker bootstrap không import toàn bộ AppModule, không khởi tạo HTTP, scheduler hay worker Document Import ngoài ý muốn.

AssessmentModule phụ thuộc SchoolModule theo một chiều. Domain policies không gọi DB, queue, provider hoặc đọc biến môi trường. Adapter hạ tầng nhận cấu hình đã được kiểm tra.

## 6. Các đơn vị nghiệp vụ

| Đơn vị | Trách nhiệm | Phụ thuộc |
|---|---|---|
| AssessmentContextService | Quyền lớp × môn, cấu hình đợt, roster | SchoolClassSubjectAccessService |
| SubmissionService | Nhóm ảnh, danh tính, revision đầu vào | DB, AssetStorage |
| PagePreparationService | Render PDF, chọn tờ, phối cảnh, chất lượng | Bộ xử lý ảnh, LayoutReader |
| ExamVersionService | Câu hỏi, đáp án, rubric, duyệt phiên bản | DB, TemplateReader, KeyDraftingProvider |
| AnswerExtractionService | Đọc lựa chọn, bảng, chữ viết và liên kết câu | LayoutReader, AnswerReader |
| GradingOrchestrator | Chọn cách chấm, gom nhóm gọi model | Pure scoring policies, RubricGrader, DrawingGrader |
| ResultValidationService | Kiểm tra đầu ra, bằng chứng và tính đủ | JSON Schema, domain policies |
| ReviewService | Bản chỉnh sửa, cảnh báo, kế thừa override | DB, revision policies |
| FinalizationService | Chốt/rút điểm có transaction và idempotency | School access, GradebookWriter, EntityManager |
| AssessmentJobService | Công việc bền vững, lease, retry, budget | PostgreSQL, BullMQ |
| AssessmentExportService | XLSX/PDF theo snapshot đã công bố | JobService, AssetStorage |

Tên module, file và hợp đồng chi tiết được mô tả trong [pipeline-and-operations.md](../../assessment/pipeline-and-operations.md).

## 7. Dữ liệu, phiên bản và điểm

Hợp đồng chuẩn nằm trong [data-and-api-contract.md](../../assessment/data-and-api-contract.md). Không tạo lại School, Student hoặc QuizSession. V1.1 thêm worker registry; dùng lại jobs/provider calls cho agent, không tạo một bộ bảng cho mỗi agent.

- ID miền school/assessment là UUID; studentId và actorId là integer users.id.
- Mọi bảng assessment có school_id. Liên kết cha/con được ràng buộc cùng tenant, không chỉ dựa vào UUID.
- ExamVersion và AnswerRevision bất biến về nội dung sau khi ghi. Chỉnh sửa tạo revision mới.
- GradingRun lưu manifest đầu vào, cấu hình, prompt, phiên bản mã, kết quả model và dữ liệu usage. Không lưu khóa API.
- ReviewRevision giữ snapshot điểm hiệu lực, override của giáo viên và nguồn của từng quyết định.
- Publication trỏ vào ReviewRevision được chấp thuận. GradeEntry chỉ là đầu điểm chính thức được tạo từ publication.

Điểm nội bộ là số nguyên, một điểm = 1000 units. Chỉ cộng các tiêu chí lá; không cộng lại điểm cha. Chuẩn hóa sang thang 10 và làm tròn half-up đến một chữ số thập phân khi công bố. Ví dụ 7,25/10 → 7,3; điểm chi tiết vẫn giữ 7,25.

Không dùng số 0 thay cho giá trị chưa chấm. Bỏ trống đã xác nhận có thể nhận 0 theo rubric; không đọc được/thiếu dữ liệu vẫn chưa có điểm.

Ba trục trạng thái độc lập:

- Công việc: idle, queued, preparing, extracting, grading, ready, paused, failed.
- Quan sát câu trả lời: readable, confirmed_blank, unreadable, not_found.
- Công bố: unpublished, published, changes_pending, withdrawn.

Điều kiện chốt là một policy tính từ dữ liệu và cảnh báo, không phải chỉ một trường status do model trả về.

## 8. Chấm và sửa kết quả

Lựa chọn đơn và Đúng/Sai dùng code sau khi đọc dấu chọn. Câu văn bản/bảng dùng rubric grader. Câu hình dùng drawing grader có ảnh và rubric chuyên biệt. Trong pilot, điểm hình vẽ cần giáo viên xem xác nhận theo câu.

Model phải phân biệt điều quan sát được và nhận xét chấm. Evidence dùng regionId được cung cấp; không cho model tự tạo nguồn hoặc tham chiếu vùng nền. Không có đủ bằng chứng thì tạo cảnh báo, không kết luận học sinh sai.

Sửa bài đọc làm mất hiệu lực các điểm liên quan. Sửa điểm tạo override kèm lý do, giữ riêng với điểm AI. Nếu sửa đầu vào mà override cũ phụ thuộc phần đó, override cần được xác nhận lại. Kết quả worker đến muộn chỉ được lưu ở lịch sử, không trở thành kết quả hiện hành.

Sửa đáp án/rubric tạo ExamVersion mới. Những câu có fingerprint chấm không đổi có thể dùng lại kết quả có ghi provenance trong run mới; câu thay đổi được tính/chấm lại. Điểm đã công bố không tự thay đổi: tạo bản nháp changes_pending, giáo viên chốt lại mới cập nhật sổ điểm.

## 9. Chốt điểm và tính nhất quán

Mỗi bài được chốt bằng transaction riêng. Batch có tối đa 50 bài/request; giao diện tự chia nhóm lớn hơn mà vẫn giữ một thao tác người dùng. Kết quả từng bài được trả rõ, không hứa batch atomic.

Transaction khóa submission, publication nếu có và GradeEntry hiện hành, kiểm tra lại quyền, revision, rubric đã duyệt, danh tính và lỗi chặn. Sau đó tạo/cập nhật publication, ghi đầu điểm, ghi ReviewEvent và kết thúc cùng nhau. Không gọi model hoặc object storage trong transaction.

Một publication có tối đa một GradeEntry đang tồn tại. Replay cùng bản duyệt trả cùng đầu điểm nếu publication vẫn active. Request phải mang expectedPublicationRevision để một màn hình cũ không vô tình công bố lại điểm đã rút. Update/Delete trực tiếp đầu điểm có assessmentPublicationId qua /grades bị từ chối 409 và hướng về luồng sửa/rút điểm có audit của assessment.

Rút điểm là thao tác riêng có lý do: transaction lưu sự kiện, đánh dấu withdrawn, xóa đầu điểm khỏi sổ hiện hành. Lịch sử publication/review còn nguyên. Công bố lại dùng cùng publication; có thể tạo gradeId mới sau lần rút rõ ràng. Archive đợt chấm không xóa điểm.

## 10. UX, quyền và dữ liệu cá nhân

Ba màn hình giáo viên: danh sách đợt và bộ chọn lớp/môn, không gian đợt chấm, xem một bài. Có lối vào Chấm bài riêng cho cả giáo viên bộ môn, không chỉ từ trang lớp chủ nhiệm. Upload, tiến độ, duyệt khung chấm và bảng kết quả nằm trong không gian đợt; không buộc đi qua một chuỗi màn hình xác nhận.

Màn hình bài có ảnh và kết quả cạnh nhau, nhảy tới vùng câu được chọn, sửa văn bản/điểm và chuyển bài bằng bàn phím. Cảnh báo chặn và gợi ý kiểm tra được phân biệt. Số “không có cảnh báo” không được gọi là “chắc chắn đúng”.

Staff reads cần role TEACHER/PRINCIPAL/ADMIN và quyền quan hệ lớp × môn. Sai tenant/không có quan hệ trả 404. STUDENT/PARENT không vào API nháp; endpoint kết quả công bố riêng kiểm tra chủ bài hoặc ParentLink approved hiện hành.

Đường dẫn object không public, không dùng kho avatar. Link đọc có thời hạn, được cấp sau kiểm tra quyền. Student/parent chỉ nhận evidence đã loại giấy nền và dữ liệu người khác; link asset gốc dành cho staff. Worker lấy dữ liệu bằng ID gắn tenant, không nhận URL tùy ý từ bài làm. Nội dung trên bài là dữ liệu, không phải lệnh điều khiển model.

Không dùng BYOK ở trình duyệt để chấm điểm chính thức. Không gửi họ tên/trường/lớp vào grader nếu không cần; ưu tiên crop không chứa header. Header chỉ phục vụ bước danh tính nội bộ.

## 11. Vận hành, đánh giá và phân kỳ

Hợp đồng công việc, storage, retry, giới hạn tài nguyên và cấu hình nằm trong [pipeline-and-operations.md](../../assessment/pipeline-and-operations.md).

Kịch bản nghiệm thu, benchmark và các gói triển khai nằm trong [evaluation-and-delivery.md](../../assessment/evaluation-and-delivery.md). Đây là thứ tự triển khai và tiêu chí bàn giao, không khẳng định đã triển khai.

Model/OCR cụ thể được lựa chọn bằng benchmark cùng bộ bài giữ riêng để đánh giá; không giả định cấu hình AI Tutor hiện tại hỗ trợ ảnh. Mặc định feature tắt cho tới khi profile có khả năng cần thiết, storage và Redis queue đạt readiness.

Model, reasoning, pricing và lifecycle là cấu hình có phiên bản. Ví dụ Gemini 2.5 Flash đọc ảnh → code/model text nhỏ ghép dữ liệu → model khác chấm được hỗ trợ, nhưng không bắt mọi bài phải trả phí cho tất cả agent. Mỗi profile cần kiểm tra quyền project, vòng đời và benchmark trước khi bật.

Chưa tự công bố điểm ở bất kỳ mức tự tin nào trong phiên bản đầu. Tối ưu hiệu quả bằng xử lý tự động và duyệt theo ngoại lệ; việc chốt vẫn do giáo viên.

## 12. Tài liệu và giới hạn bằng chứng

- [BullMQ production](https://docs.bullmq.io/guide/going-to-production): Redis hàng đợi cần persistence và noeviction.
- [BullMQ idempotent jobs](https://docs.bullmq.io/patterns/idempotent-jobs): công việc phải an toàn khi chạy lại.
- [Document AI response](https://docs.cloud.google.com/document-ai/docs/handle-response): dữ liệu OCR có vị trí và phép biến đổi, phù hợp liên kết bằng chứng.
- [S3 presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html): URL upload có thể dùng lại và ghi đè cùng object key; vì vậy file được niêm phong sang key riêng sau khi xác thực.

Các lựa chọn kiến trúc trên là quyết định thiết kế của dự án. Không có số đo độ chính xác, chi phí hay thời gian xử lý thực tế được tuyên bố trong đặc tả.
