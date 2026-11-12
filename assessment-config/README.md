# Cấu hình Assessment khi chưa có storage/model

Giữ `ASSESSMENT_ENABLED=false`, `ASSESSMENT_QUEUE_REDIS_URL=` và `ASSESSMENT_ROUTING_CONFIG_PATH=`. Không chạy Compose profile assessment trong lúc chưa cấu hình. Web/API hiện tại vẫn hoạt động; profile assessment quản lý worker, Redis chấm bài và service Python.

## Các mẫu cần điền sau

- `../.env.prod.example`: S3 endpoint HTTPS, region, private bucket và credentials hạ tầng. Chép riêng nhóm ASSESSMENT_* vào file runtime đang dùng, giữ nguyên cấu hình DB/auth hiện có.
- `../.env.assessment-worker.example`: chứa `ASSESSMENT_AUDIT_SEED` và token nội bộ `ASSESSMENT_INFERENCE_TOKEN`.
- `../.env.assessment-inference.example`: chứa cùng token và địa chỉ, tên, token tùy chọn của model nội bộ. Máy phục vụ model phải nằm trong mạng riêng `assessment-inference-net`.
- `../.env.assessment-external-grading.example`: chỉ dùng cho tuyến chấm văn bản đã được phê duyệt. Cổng giữ khóa API ngoài, mặc định tắt và có Compose profile riêng. Khóa model công cộng nằm ngoài file của worker và service đọc ảnh.
- Tạo token và audit seed bằng hai lần gọi riêng `openssl rand -hex 32`. Chép token vào cả hai file runtime, giữ seed ổn định qua deploy và đặt quyền 600.
- `../docs/assessment/contracts/agent-routing.example.json`: mẫu chọn model theo vai trò, hạn mức và giá. Khi chuẩn bị pilot, sao chép thành `assessment-config/routing.json` rồi cập nhật theo model/project thực tế. Mẫu hiện là `design_only`, qualityGate chưa qua benchmark; điền khóa không tự biến mẫu thành cấu hình được phép chạy.
- `s3-cors.example.json`: thay origin mẫu bằng domain web giáo viên thực tế rồi cấu hình tại dịch vụ storage. Bucket vẫn private; CORS không cấp quyền đọc công khai. Một số dịch vụ có màn hình/API CORS riêng, giữ cùng các origin/method/header được yêu cầu.

## Đường dẫn runtime dự kiến

`ASSESSMENT_CONFIG_DIR=./assessment-config` được mount read-only vào `/app/assessment-config`. Khi thực sự mở pilot, ASSESSMENT_ROUTING_CONFIG_PATH trỏ `/app/assessment-config/routing.json`; queue URL nội bộ là `redis://assessment-redis:6379`. Các giá trị này vẫn để trống trong cấu hình đang tắt.

Không tạo bucket, API key, file runtime có secret hoặc phát sinh chi phí trong bước chuẩn bị mẫu. Các bước kiểm tra và bật pilot nằm trong [runbook](../docs/assessment/operations-runbook.md).

Hướng dẫn cụ thể cho adapter hiện tại: [AWS S3, IAM, CORS và env VPS](../docs/assessment/aws-s3-setup.md). Các nhà cung cấp khác cần kiểm tra presigned POST/checksum; Cloudflare R2 chưa tương thích trực tiếp với luồng POST form hiện có.
