# Cấu hình Assessment khi chưa có storage/model

Giữ `ASSESSMENT_ENABLED=false`, `ASSESSMENT_QUEUE_REDIS_URL=` và `ASSESSMENT_ROUTING_CONFIG_PATH=`. Không chạy Compose profile assessment trong lúc chưa cấu hình. Web/API hiện tại vẫn hoạt động; worker và Redis chấm bài không cần khởi động.

## Các mẫu cần điền sau

- `../.env.prod.example`: S3 endpoint HTTPS, region, private bucket và credentials hạ tầng. Chép riêng nhóm ASSESSMENT_* vào file runtime đang dùng, giữ nguyên cấu hình DB/auth hiện có.
- `../.env.assessment-worker.example`: khóa Google/DeepSeek theo credentialRef và ASSESSMENT_AUDIT_SEED. Chỉ lưu ở `.env.assessment-worker` trên VPS, không commit hoặc gửi khóa vào chat. Seed audit là chuỗi ngẫu nhiên ổn định, có thể tạo lúc cài đặt bằng `openssl rand -hex 32`; giữ nguyên khi retry để mẫu audit không đổi.
- `../docs/assessment/contracts/agent-routing.example.json`: mẫu chọn model theo vai trò, hạn mức và giá. Khi chuẩn bị pilot, sao chép thành `assessment-config/routing.json` rồi cập nhật theo model/project thực tế. Mẫu hiện là `design_only`, qualityGate chưa qua benchmark; điền khóa không tự biến mẫu thành cấu hình được phép chạy.
- `s3-cors.example.json`: thay origin mẫu bằng domain web giáo viên thực tế rồi cấu hình tại dịch vụ storage. Bucket vẫn private; CORS không cấp quyền đọc công khai. Một số dịch vụ có màn hình/API CORS riêng, giữ cùng các origin/method/header được yêu cầu.

## Đường dẫn runtime dự kiến

`ASSESSMENT_CONFIG_DIR=./assessment-config` được mount read-only vào `/app/assessment-config`. Khi thực sự mở pilot, ASSESSMENT_ROUTING_CONFIG_PATH trỏ `/app/assessment-config/routing.json`; queue URL nội bộ là `redis://assessment-redis:6379`. Các giá trị này vẫn để trống trong cấu hình đang tắt.

Không tạo bucket, API key, file runtime có secret hoặc phát sinh chi phí trong bước chuẩn bị mẫu. Các bước kiểm tra và bật pilot nằm trong [runbook](../docs/assessment/operations-runbook.md).

Hướng dẫn cụ thể cho adapter hiện tại: [AWS S3, IAM, CORS và env VPS](../docs/assessment/aws-s3-setup.md). Các nhà cung cấp khác cần kiểm tra presigned POST/checksum; Cloudflare R2 chưa tương thích trực tiếp với luồng POST form hiện có.
