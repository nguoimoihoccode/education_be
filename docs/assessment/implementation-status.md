# Assessment VPS — trạng thái triển khai 2026-11-04

Mã nguồn đã có trong workspace; tính năng vẫn tắt mặc định. Chưa push/deploy lên VPS, chưa gọi provider có phí và chưa benchmark trên ảnh học sinh thật.

## Đã triển khai

- NestJS AssessmentModule, 16 nhóm bảng và ba migration: tenant/quyền lớp × môn, roster snapshot, nhiều mã đề, upload/seal, sửa bản đọc, review bất biến và chốt/rút điểm theo revision/idempotency. GradeEntry + publication + audit cùng transaction; endpoint sổ điểm cũ bảo vệ điểm nguồn assessment.
- Worker VPS riêng: DB outbox/dispatcher/reconciler, BullMQ, leases/fencing/heartbeat, retry hữu hạn, routing snapshot, provider checkpoints và ngân sách. Sharp/Poppler có giới hạn tài nguyên, masking tờ chính và dọn file tạm. Reader/KeyBuilder/Grader có dữ liệu đầu vào riêng; trắc nghiệm chấm bằng code.
- Rubric text/hình, kiểm tra schema/criterion/evidence cùng câu, giữ null cho phần chưa đánh giá, audit AI lấy mẫu ổn định, bảo vệ review giáo viên khỏi kết quả chạy trễ. Điểm hình và bất đồng có thao tác giáo viên xác nhận kèm lý do.
- React `/teaching/assessments`: lớp/môn, nhóm trang, tiến độ, duyệt đáp án theo mã, sửa câu/điểm, chọn chốt theo bảng và kết quả từng bài. Điểm hiển thị theo thang quen thuộc. Xuất snapshot Excel/PDF với liên kết riêng tư.
- Privacy: bypass Axios cache, invalidation sổ điểm, ảnh runtime NetworkOnly, dọn cache cũ khi activate service worker và Cache Storage khi kết thúc phiên.
- Compose opt-in: worker + Redis AOF/noeviction/volume riêng; object storage ngoài VPS, CPU/RAM limits, log rotation. API/worker images chứa canonical schemas; worker image có PDF/font/Poppler smoke test lúc build trong CI.
- CI/CD build/push worker cùng SHA backend và kiểm tra healthy. Giữ ba image ID mới nhất/repository, bảo vệ image còn được container hoặc tag rollback/previous tham chiếu; không xóa volume, container hay GHCR versions.

## Đã kiểm tra tại workspace

- Backend `ASSESSMENT_TEST_PG=true npm run ci`: lint/build và 741 test qua, gồm sáu ca PostgreSQL thật dùng schema riêng rollback sau test.
- Frontend `npm run ci`: lint/build, 160 unit/component test qua, một test có sẵn bị skip; 136 contract test qua.
- Ba Compose manifests, bốn workflow YAML và shell deploy parse được. Ba kiểm thử retention qua ở mỗi repo.
- Integration kiểm tra chốt/replay không nhân đôi điểm, rollback audit lỗi, ảnh tổng hợp→rule grading→review, duyệt draft đã gắn với bài vẫn tạo job, tải thêm trang làm review stale, duplicate delivery và retry backoff với schema DB thật.

Provider được giả lập và ảnh là dữ liệu tổng hợp; các test không chứng minh độ chính xác OCR/chấm bài thật. Chưa build/chạy Docker image ở máy này, chưa kiểm thử Redis AOF recovery end-to-end hoặc tải VPS thực.

## Trước khi bật pilot

Xem [thiết kế hoàn thiện pilot v1.3](../superpowers/specs/2026-11-05-assessment-pilot-completion-design.md) để phân biệt phần cần xây thêm và các ca kiểm chứng trên staging.

Cần private bucket S3, secrets model ở worker, routing đã benchmark, kiểm tra tài nguyên/quota/retention/backup theo [runbook](operations-runbook.md). Kiểm tra PDF trong container thật, storage upload–seal–read, lỗi mạng/Redis và privacy trình duyệt với hai tài khoản. Không đổi qualityGate thành passed chỉ để vượt readiness.

Viewer có ảnh trang và overlay vùng đọc; giáo viên có thể chọn lại tờ giấy chính bằng 3–8 điểm, lưu theo input revision và yêu cầu đọc lại. Ảnh nguồn trước masking chỉ cấp riêng cho staff có quyền lớp × môn, không đưa vào kết quả học sinh/phụ huynh.
