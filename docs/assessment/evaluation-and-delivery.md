# Đánh giá và phân kỳ bàn giao — Assessment v1

Tham chiếu [đặc tả](../superpowers/specs/2026-11-03-ai-assisted-assessment-design.md), [data/API](data-and-api-contract.md), [pipeline](pipeline-and-operations.md).

Tài liệu này chia hệ thống thành các gói bàn giao và tiêu chí nghiệm thu. Không thay cho kế hoạch code từng bước; kế hoạch đó được lập từ đặc tả được rà soát, theo từng gói để giữ phạm vi kiểm chứng được.

## 1. Hợp đồng có thể kiểm tra ngay ở giai đoạn thiết kế

Thư mục [contracts](contracts/README.md) chứa JSON Schema và mẫu cấu trúc đề Công nghệ 8. Mẫu là draft chưa có đáp án/rubric được giáo viên duyệt, không phải kết quả chấm thật.

Những kiểm tra hiện có thể làm: JSON hợp lệ, mẫu đúng schema, mã câu không trùng, 12 câu lựa chọn × 250 units, nhóm Đúng/Sai 1000 units, bốn mục tự luận × 1000 units, hình 2000 units, tổng 10000 units. Chưa thể tuyên bố OCR/AI chính xác từ các kiểm tra này.

V1.1 thêm schema/config agent routing, ví dụ tính chi phí giả định, 12 ca M01–M12 trong [multi-agent routing](multi-agent-model-routing.md) và 12 ca W01–W12 trong [remote protocol](remote-worker-protocol.md). Tổng bộ nghiệm thu là 40 ca cơ sở và 24 ca bổ sung, chưa phải 64 test ứng dụng đã chạy.

## 2. Bộ nghiệm thu bắt buộc

| ID | Tình huống | Kết quả cần có |
|---|---|---|
| A01 | Ảnh 1 có mã 103 và tên khác trên giấy nền | Tờ chính vẫn là nguồn mã đề 102; vùng nền không làm nguồn danh tính/điểm. |
| A02 | Ảnh 3 có tên học sinh khác phía sau | Không chuyển submission sang tên nền. |
| A03 | Upload thứ tự 1,2,3,4,5 hoặc hoán vị | Cấu trúc đề/bài làm tương đương; provenance vẫn đúng ảnh. |
| A04 | Câu II.2.a bắt đầu ở ảnh 1, tiếp ở ảnh 3 | Một AnswerRevision có nhiều vùng; không tạo hai câu. |
| A05 | Câu I.1 và II.1.a | Hai questionKey khác nhau, không dùng nhầm rubric. |
| A06 | Bảng ở II.1.b | Thành phần/tính chất/ứng dụng giữ đúng hàng cột. |
| A07 | Chưa tìm thấy II.1.a trong vùng nhìn rõ | answer_not_found; chưa có điểm câu; không chốt tổng đầy đủ. |
| A08 | Giáo viên xác nhận II.1.a thật sự bỏ trống | Ghi lý do/actor; confirmed_blank; áp blank policy đã duyệt. |
| A09 | “Đề gồm 2 trang” nhưng thiếu trang tự luận | Không coi đủ mọi bài làm chỉ vì có đề 1/2 và 2/2. |
| A10 | Đ/S khó phân biệt hoặc lệch ô | Chỉ vùng/câu liên quan cần đọc lại; không tự chọn ký hiệu thuận đáp án. |
| A11 | Khoanh hai đáp án, tẩy một đáp án | Chỉ lấy lựa chọn cuối nếu có đủ bằng chứng; nếu chưa rõ thì choice_ambiguous. |
| A12 | Không có đáp án riêng | Soạn một draft key cho cùng mã đề; học sinh khác dùng chung sau duyệt. |
| A13 | Đáp án học sinh tình cờ đều đúng | Vẫn không dùng các lựa chọn đó làm nguồn key. |
| A14 | Mã 102 xuất hiện trong hai đợt/năm khác nhau | Không trộn template chỉ vì cùng mã. |
| A15 | Hình chiếu có kích thước bị gạch sửa | Giữ hình và dấu sửa; flag nếu chưa rõ giá trị cuối. |
| A16 | Ảnh hình vẽ bị nghiêng hoặc thay độ phân giải | Không quy đổi pixel sang mm không có hiệu chuẩn. |
| A17 | Một học sinh có điểm hình nhưng chưa được xác nhận trong pilot | drawing_review_required chặn chốt; các điểm khác vẫn hiển thị. |
| A18 | Teacher sửa text khi worker cũ đang chạy | Run cũ stale; không ghi đè revision mới. |
| A19 | Teacher sửa điểm rồi AI hoàn thành lại | Override giữ nguyên hoặc được yêu cầu xác nhận lại nếu đầu vào liên quan đã đổi. |
| A20 | Sửa rubric một câu sau khi đã công bố | Tạo changes_pending; GradeEntry cũ giữ nguyên đến lần chốt mới. |
| A21 | Hai request finalize đồng thời/replay HTTP hoặc request cũ sau withdraw | Một publication/đầu điểm hiện hành, không nhân đôi; request cũ không tự tái công bố điểm đã rút. |
| A22 | Chốt 50 bài có một bài stale | Kết quả từng bài rõ; bài stale không được chốt, các bài đủ điều kiện có transaction riêng. |
| A23 | Dừng worker sau khi có provider response nhưng trước aggregate | Tái dùng response đã lưu, không gọi lại nếu đã đủ artifact hợp lệ. |
| A24 | Redis restart/mất queue data | Reconciler dispatch từ PostgreSQL jobs, không mất trạng thái bài. |
| A25 | Provider timeout chưa biết có phí hay không | Call state unknown, reservation không thành 0; không retry vô hạn. |
| A26 | Dùng lại upload capability cũ sau seal để thay bytes | Original sealed dùng để chấm không đổi; checksum/version không bị client sửa; upload vượt policy bị từ chối. |
| A27 | User trường khác đoán đúng submission/asset ID | 404, không lộ tên, tồn tại object hoặc signed URL. |
| A28 | Teacher không dạy lớp/môn, chỉ có role TEACHER | Không xem/chấm/chốt được bài ngoài quan hệ. |
| A29 | ParentLink pending/revoked hoặc raw ảnh có giấy học sinh khác | Chỉ approved link hiện hành được xem con mình; evidence không lộ giấy nền hoặc source template từ bài người khác. |
| A30 | Student/parent tìm bài nháp | Không lộ điểm nháp; GradeEntry chỉ xuất hiện sau finalize. |
| A31 | Gradebook sửa/xóa trực tiếp đầu điểm nguồn assessment | 409 hướng về review/withdraw; audit không bị bỏ qua. |
| A32 | Upload trùng, asset quá lớn, PDF lỗi/password | Không nhân đôi processing hoặc chạy vượt giới hạn; lỗi có thể hiểu được. |
| A33 | Logout/chuyển tài khoản, refresh UI đang xử lý | Không rò cache bài trước ở Axios/TanStack/PWA images; tiến độ không bị cache GET 5 phút làm đứng. |
| A34 | Grader trả tiêu chí lạ, điểm âm, điểm quá max hoặc evidence nền | Reject output; không cộng vào tổng. |
| A35 | Model trả tổng điểm khác tổng tiêu chí | Backend tính tổng từ tiêu chí, bỏ qua tổng do model tự khai. |
| A36 | File evidence hết hạn retention | Điểm/audit còn, UI báo evidence hết hạn; không tự chấm từ ảnh không còn. |
| A37 | Export đang chạy trong lúc công bố revision mới | Báo cáo nhất quán snapshot, ghi thời điểm/version; không trộn điểm. |
| A38 | Actor mất phân công dạy trước khi chốt/rút | Kiểm tra lại quyền, command thất bại; không dùng quyền đã cache để ghi điểm. |
| A39 | Số câu hoặc tổng max points không khớp đề | Khung chấm không được approve cho đến khi chỉnh/giải thích đúng cấu trúc. |
| A40 | Điểm 7.25/10; tiêu chí chứa 0.25/0.125 | Lưu units chính xác, chuẩn hóa cuối thành 7.3; không round mỗi bước. |

Không coi ảnh nền chứa một tờ giấy khác là bằng chứng người dùng tải nhầm bài. Ground truth cần đánh dấu polygon tờ chính trước khi đánh giá tên/mã đề.

## 3. Dataset và ground truth

Khởi động với 100–200 bài của cùng môn/khối, có nhiều chất lượng chữ và cách chụp; đây là tập khám phá/pilot, không đủ chứng minh khả năng dùng cho mọi môn.

Lấy các nhóm có chủ đích: ảnh rõ; nghiêng/bóng; giấy chồng; trắc nghiệm sửa; Đ/S; bảng; câu qua trang; thiếu trang; hình vẽ. Giữ cả ca hệ thống abstain, không chỉ lưu ca đọc thành công.

Hai giáo viên chấm độc lập trên một phần tập để đo mức bất đồng, sau đó thống nhất đáp án/rubric và adjudicate những ca khác nhau. Ground truth gồm:

- chủ bài và mã đề từ tờ chính;
- nội dung câu hỏi/điểm, thứ tự và liên kết trang;
- dấu chọn/Đ-S, bảng và chữ viết tay;
- vùng nguồn, trạng thái thiếu/không đọc được/bỏ trống;
- điểm theo tiêu chí, nhận xét lỗi và cách giải tương đương được chấp nhận.

Chia tập điều chỉnh và holdout theo học sinh/đợt/mẫu đề, không theo crop ngẫu nhiên. Ảnh augment và các trang cùng bài nằm cùng split. Các biến thể mã đề cùng đề gốc không được coi như hai tập độc lập nếu đã dùng để điều chỉnh rubric.

Ảnh thật/nhãn có danh tính lưu ngoài Git trong kho riêng tư. Repo chỉ chứa schema, mẫu tổng hợp và manifest đã ẩn danh. Không tự đưa ảnh học sinh lên nhà cung cấp trong bước thiết kế.

## 4. Metrics và gate pilot

Các ngưỡng dưới đây là mục tiêu thiết kế để xem xét trước pilot, chưa phải số đo đạt được:

| Nhóm | Đo như thế nào | Gate ban đầu |
|---|---|---|
| An toàn dữ liệu | Test tenant/quan hệ/cache/publication/revision và failure injection | Tất cả A18–A40 liên quan phải pass; không còn lỗi nghiêm trọng chưa xử lý. |
| Danh tính/ghép câu | Exact match, số ca tự ghép/đề xuất, số ca giữ lại để xác nhận | Không có lỗi ghép sai đã biết trong holdout; công bố luôn có acknowledgement danh tính. |
| Lựa chọn/Đ-S | Exact mark recognition; báo cả coverage và abstention | Mục tiêu >=99% trên các lựa chọn hệ thống chấp nhận; báo mẫu số và khoảng tin cậy. |
| Tự luận | MAE theo câu/tiêu chí và tổng, độ lệch có dấu, tỷ lệ teacher sửa | Mục tiêu MAE tổng đề xuất <=0.3/10 trên bài đủ dữ liệu; không dùng tổng để che lỗi riêng nhánh tự luận. |
| Hình vẽ | Đồng thuận từng tiêu chí với giáo viên, lý do sửa, vùng chưa quan sát đủ | Giáo viên xác nhận câu hình trong pilot; chưa tự bỏ flag dựa vào self-confidence. |
| Thời gian giáo viên | Thời gian thao tác chủ động từ chuẩn bị đến chốt, gồm sửa lỗi AI | Mục tiêu giảm median ít nhất 30% so với chấm thủ công trên tập đối sánh. |
| Chi phí/độ trễ | Calls/pages/tokens/cost thật và p50/p95 theo stage, cả retry | Trong budget của trường; không vượt caps; đo rồi mới đặt SLA sản phẩm. |

Một bài thiếu dữ liệu không được đưa vào mẫu số “đã chấm đủ” bằng cách gán 0. Luôn báo coverage toàn tập, tỷ lệ bài bị giữ và thời gian xử lý ngoại lệ. Gate chỉ cho supervised pilot, không cấp phép tự công bố điểm.

## 5. Chọn OCR/model

So sánh ba cấu hình trên cùng holdout:

1. Reader đa phương thức có regions, grader riêng.
2. OCR bố cục trước, reader đa phương thức cho chữ khó/hình, grader riêng.
3. OCR cho phần in/dấu chọn và model mạnh hơn cho các vùng cần escalation.

Chọn cấu hình nhỏ nhất đáp ứng gate, tính cả latency/cost do các lượt gọi tăng thêm. Giữ khả năng đổi adapter bằng cùng contract; không đổi mặc định theo tên model mới mà chưa chạy regression corpus.

Pin provider/model/config/prompt và lưu model_reported nếu provider cung cấp. Không hứa tái sinh y hệt kết quả dù temperature thấp; snapshot đã lưu là bằng chứng của lần chấm thật.

## 6. Các gói bàn giao

### Gói 0 — Chứng minh khả năng đọc/chấm và chốt profile pilot

Đầu ra: corpus ẩn danh, ground truth, benchmark runner offline có budget, báo cáo từng nhánh, profile được chọn. Người dùng xem được kết quả đề xuất trên năm ảnh mẫu mà không ghi vào sổ điểm.

Điều kiện xong: A01–A17 được thử trên ảnh thật đã gán nhãn; nêu rõ phần chưa đạt. Không dùng mock provider để tuyên bố model đã đọc đúng.

### Gói 1 — Nghiệp vụ nền và quyền

Đầu ra: migrations, entities, shared school authorization, context/roster/assessment/submission APIs, domain score/finalization/revision policies.

File tích hợp: src/app.module.ts, src/database/data-source.ts, src/modules/school/school.module.ts, src/modules/school/grades.service.ts; file mới theo pipeline.

Điều kiện xong: migration test DB sạch và dữ liệu cũ, service tests quyền/tenant/roster, A05/A14/A27–A30/A38/A40. Feature vẫn tắt nếu chưa có worker/storage/profile.

### Gói 2 — Upload, storage và đọc bài nhiều ảnh

Đầu ra: upload staging/seal, worker entrypoint, jobs/dispatcher/reconciler, prepare/layout/extract, viewer hiển thị vùng trên ảnh.

V1.1 của gói này bao gồm WorkerOnly authentication, registry, HTTPS coordinator, call permits và lease tests W01–W12; không mở Redis/DB ra Internet để ghép worker Mac.

Frontend: assessment.api.ts, assessment.types.ts, các route/query keys, UploadGroups và EvidenceViewer. Infra: storage/worker/queue services trong cả hai compose manifests.

Điều kiện xong: năm ảnh được nhóm/ghép đúng, sửa crop tạo revision, không lẫn nền; A01–A10/A23–A26/A32/A33. Chưa tuyên bố đã có đủ khả năng chấm nếu chưa hoàn thành gói 3/4.

### Gói 3 — Đề dùng chung và chấm theo đáp án

Đầu ra: draft/approve/impact ExamVersion; trắc nghiệm và nhóm Đúng/Sai tính bằng code; key draft không nhìn bài học sinh.

Thêm router/config version, profile lifecycle, per-agent schemas và budget thống nhất. Những call assembler không cần thiết phải bằng 0; kiểm tra M01–M12 trước khi bật routing mặc định.

Điều kiện xong: A11–A14/A34/A35/A39, kiểm tra 12×0.25 + 1 + 6 = 10 của mẫu; thiếu quy tắc Đ/S được yêu cầu duyệt, không tự dùng quy chế khác.

### Gói 4 — Tự luận, bảng và hình

Đầu ra: rubric/drawing adapters, structured output validation, evidence checks, partial grading, bảng giữ ô, điểm hình có confirmation.

Điều kiện xong: A04/A06/A07/A15–A20/A34/A35; giới hạn và trường hợp chưa quan sát đủ có biểu diễn rõ. Nhánh hình trong scope hỗ trợ của mẫu, không claim mọi bản vẽ.

### Gói 5 — Review, chốt, kết quả học sinh/phụ huynh

Đầu ra: ReviewRevision/Event, batch finalize, withdraw, GradebookWriter, khóa chỉnh trực tiếp điểm nguồn assessment, published-result authorization, UI bảng/chi tiết/chốt.

File frontend cũ cần cập nhật: src/pages/teacher/GradebookPage.tsx, src/api/school.api.ts, src/types/school.types.ts; xử lý invalidation/bypass cache.

Điều kiện xong: A18–A22/A27–A31/A33/A38; lỗi transaction không tạo trạng thái “đã chốt” một nửa. Các endpoint cũ của quiz/manual grade vẫn hoạt động.

### Gói 6 — Export, vận hành và mở supervised pilot

Đầu ra: XLSX/PDF snapshot, telemetry, budget enforcement, readiness, backup/restore drill, retention, runbook worker/provider/Redis outages.

Điều kiện xong: A23–A26/A32/A36/A37; complete QA/gates; feature mở theo trường được chỉ định. Khi rollback, tắt chấm mới và giữ quyền đọc/điểm đã công bố.

## 7. Thứ tự kiểm thử khi triển khai

- Unit: pure policies, JSON validation, cache/revision/fingerprint, adapter contract fixtures.
- Integration với PostgreSQL thật: composite FK/unique, locking, concurrent finalize, rollback audit+grade, permission revocation.
- Worker integration: crash tại từng checkpoint, response reuse, lease fencing, Redis flush/restart trong môi trường test riêng.
- FE component/contract: upload nhóm, flags, original overlay, sửa một câu, source grade, no-cache progress, batch result từng item.
- E2E: năm ảnh theo workflow đủ từ upload tới publication, dùng provider thật trong benchmark có budget và provider giả trong CI nghiệp vụ.

Commands cuối mỗi gói có code:

~~~sh
# cwd: education_be
npm run lint:check
npm run test -- --runInBand
npm run build
# cwd: education_fe
npm run lint
npm run test:run
npm run test:contracts
npm run build
~~~

Các bài integration DB/failure injection được chạy bằng cấu hình test riêng có database/queue riêng; không dùng Redis hoặc database production để thử recovery. Phải thêm cấu hình/script integration phù hợp khi viết kế hoạch code gói tương ứng; commands CI hiện tại không tự chứng minh concurrency hoặc chất lượng OCR.

## 8. Điều kiện hoàn thành tính năng

Tính năng hoàn thành supervised MVP khi cả bảy gói có bằng chứng nghiệm thu, giáo viên thực hiện được ba thao tác chính, toàn bộ dạng bài của mẫu có đường xử lý, và không còn lỗi chặn trong việc ghi điểm/quyền/phiên bản.

Chỉ hoàn thành tài liệu không đồng nghĩa tính năng đã triển khai. Chỉ pass CI với fixture không đồng nghĩa AI chấm đạt gate. Chỉ không có cảnh báo không đồng nghĩa bài chắc chắn đúng.

## 9. Rà soát trong phiên thiết kế 2026-11-03

Đã kiểm tra bằng công cụ tại workspace:

- Hai schema draft-07 hợp lệ và hai payload mẫu vượt kiểm tra cấu trúc bằng Ajv.
- Mẫu đề có 18 questionKey duy nhất, 12 câu lựa chọn, bốn mệnh đề Đ/S và tổng 10000 units; chưa có đáp án được duyệt.
- Payload bị thêm finalScore/approved, điểm âm, units phân số hoặc thiếu evidence cho điểm số đều bị schema từ chối.
- Quy tắc làm tròn được kiểm tra tại 0, điểm tối đa, 7.249/10, 7.25/10 và các điểm lẻ thành phần.
- Ở v1 cơ sở: năm tài liệu Markdown không có link nội bộ hỏng hoặc code fence lệch; năm file JSON parse được; bảng dữ liệu có 16 nhóm và bộ nghiệm thu có A01–A40 không trùng. V1.1 mở rộng thêm routing/remote protocol, ba JSON artifacts và worker registry; các kiểm tra bổ sung được chạy riêng khi bàn giao v1.1.
- Thay đổi chỉ là tài liệu/hợp đồng thiết kế. Chưa chạy benchmark OCR/model, migrations, kiểm thử ứng dụng hoặc load test.

Rà soát v1.1 cùng ngày: ba schema và ba payload mẫu hợp lệ; profile references, modality, ngày hiệu lực và cap input được kiểm tra; bảy cấu hình sai quyền/chấm bằng model ngoài ý định bị schema từ chối. Phép tính chi phí giả định được đối chiếu bằng integer micros. Bảy Markdown, tám JSON, 17 nhóm dữ liệu và 64 tình huống nghiệm thu có cấu trúc/liên kết hợp lệ. Không gọi provider có phí hoặc coi các kiểm tra tài liệu là kết quả benchmark.
