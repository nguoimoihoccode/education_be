# Triển khai Assessment trên VPS — v1.2

Quyết định 2026-11-04: chạy worker trên VPS hiện có; Mac chỉ dùng phát triển và truy cập web. Đã có mã nguồn và cấu hình Compose/CI trong workspace; chưa deploy lên máy chủ. Xem [trạng thái triển khai](implementation-status.md).

## 1. Topology

~~~mermaid
flowchart TD
  UI[Web giáo viên] --> API[NestJS API trên VPS]
  UI --> S3[Private object storage bên ngoài VPS]
  API --> DB[(PostgreSQL nội bộ)]
  API --> CACHE[(Redis cache hiện có)]
  API --> QUEUE[(assessment-redis riêng)]
  QUEUE --> WORKER[assessment-worker trên VPS]
  WORKER --> DB
  WORKER --> S3
  WORKER --> MODELS[Provider API: đọc ảnh và chấm]
~~~

Worker là container/process riêng, không nằm trong HTTP API process. Bootstrap chỉ import module xử lý assessment cần thiết; không khởi động HTTP, scheduler hoặc worker khác. BullMQ là kênh đánh thức; PostgreSQL jobs, leases và fencing vẫn là nguồn trạng thái chuẩn. Dispatcher/reconciler phải có một chủ sở hữu rõ ràng, không chạy trùng ngoài ý muốn.

## 2. Những thành phần cần dựng trong Gói 2

- `assessment-worker`: image có sharp production dependency và Poppler; không GPU hoặc model weights. Chạy non-root, restart policy, graceful shutdown và healthcheck theo heartbeat/job progress, không yêu cầu HTTP health port.
- `assessment-redis`: instance riêng với AOF everysec, noeviction, healthcheck và named volume. Redis cache hiện có giữ cấu hình riêng. Không publish Redis/PostgreSQL ra Internet.
- Private object storage bên ngoài VPS là phương án mặc định để giảm dung lượng lưu trên máy chủ. Cần endpoint HTTPS, private bucket, quyền theo prefix, CORS cho web, presigned POST/read và lifecycle/backup phù hợp. Chưa chọn nhà cung cấp hoặc phát sinh chi phí trong bước thiết kế. Tự host storage trên VPS là thay đổi phương án cần tính lại disk và backup.
- API và worker nhận ASSESSMENT_QUEUE_REDIS_URL nội bộ; dùng cùng routing snapshot/version. Credentials provider/storage cấp qua secrets runtime, không nằm trong image hoặc job payload. Worker có quyền hạ tầng tối thiểu; không cấp API duyệt/chốt điểm cho agent.
- Cập nhật manifests thực sự dùng để deploy và env mẫu; không chỉ thêm biến môi trường vào tài liệu. Giữ feature tắt cho đến khi readiness đạt.

## 3. Tài nguyên và file tạm

Chưa có số đo cấu hình/tải VPS trong lần chỉnh thiết kế này, nên chưa khẳng định VPS đủ năng lực. Trước khi bật phải đo CPU/RAM/disk/inodes, tải nền API/DB và khả năng render PDF lớn nhất trong giới hạn.

Khởi đầu một job và hai provider calls đồng thời. Đề xuất budget container worker 1 vCPU/2 GiB RAM để thử nghiệm, không phải cấu hình đã được chứng minh; phải đặt CPU/memory limits được Docker Compose thực thi và kiểm tra trên host. Nếu không còn headroom cho API/DB thì giữ feature tắt, điều chỉnh tài nguyên hoặc chuyển worker sang VPS riêng. Không để worker không giới hạn làm nghẽn API.

File gốc/derivative/report lưu trong object storage. Worker chỉ tải đầu vào cần thiết, render từng trang rồi upload kết quả, xóa file tạm sau checkpoint hoàn thành. Cache trên volume riêng cap 2 GiB, TTL 24 giờ; quota cache không bao gồm toàn bộ workspace của job, nên workspace cũng phải có quota dung lượng/pixel/trang và timeout. Cleanup khi startup và theo lịch phải bỏ qua file đang có lease hợp lệ. Không dùng tmpfs lớn để chứa toàn bộ PDF/ảnh vì sẽ ăn RAM chung.

Admission kiểm tra volume workspace thực tế: tối thiểu 15 GiB trống để nhận job, pause dưới 10 GiB. Các ngưỡng là chính sách đề xuất, cần hiệu chỉnh theo host và worst-case render; kiểm tra lại khi cấp file tạm, không chỉ lúc nhận job. PostgreSQL, AOF và logs cũng cần giám sát dung lượng; chuyển file sang object storage không loại hết nhu cầu disk VPS. Log rotation bắt buộc, không ghi ảnh/base64/raw prompt vào logs.

## 4. Điều kiện trước khi bật

Kiểm tra restart Redis/worker và recovery từ DB, render ảnh/PDF thực, upload–seal–read từ browser/worker, quota file tạm, dọn cache, budget provider và API còn ổn định khi worker hoạt động. Kiểm tra A33 về ảnh riêng tư trong PWA trước khi đưa bài thật vào viewer. Thử nghiệm không làm trên dữ liệu production chưa được cho phép.

Nghiệm thu cơ sở A01–A40 và multi-agent M01–M12 vẫn áp dụng. Remote protocol W01–W12, worker registry/bootstrap JWT/HTTPS claim endpoints ngoài phạm vi VPS hiện tại. Nếu sau này tách worker sang máy chủ khác, đánh giá lại giao thức và quyền kết nối theo topology mới.
