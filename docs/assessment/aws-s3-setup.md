# Cấu hình AWS S3 cho Assessment trên VPS

Tài liệu hướng dẫn, chưa tạo tài khoản/bucket, chưa có secret và không bật tính năng. Giá trị tên bucket/domain bên dưới chỉ minh họa.

Compose bảo vệ dữ liệu đặt worker trên mạng riêng. Ví dụ endpoint AWS công cộng chỉ dùng được sau khi có tuyến kết nối giới hạn riêng cho storage và xác minh nơi lưu trữ phù hợp với chính sách dữ liệu của trường. Xem [runbook VPS](operations-runbook.md) trước khi dùng bài thật.

## S3 làm gì trong dự án

S3 giữ ảnh/PDF gốc, ảnh phân tích, kết quả provider và báo cáo ngoài ổ đĩa VPS. PostgreSQL giữ metadata, khóa file và điểm. VPS tải dữ liệu cần dùng vào thư mục tạm để xử lý. S3 không chạy model hoặc thay thế PostgreSQL.

Code hiện cấp presigned POST hết hạn sau 15 phút cho browser upload vào staging, rồi worker kiểm tra byte/MIME và ghi file sealed. Link xem tải được ký riêng với hạn 5 phút. Bucket vẫn private; browser không nhận secret key của server. CORS cho phép web gọi storage, không cấp quyền truy cập công khai.

## 1. Tạo bucket

Trong AWS Console → S3 → Create bucket, chọn General purpose. Ví dụ chọn Singapore (`ap-southeast-1`) và tên bucket chưa được dùng, như `education-assessment-yourname-prod`. Giữ Block all public access; Object Ownership = Bucket owner enforced (ACLs disabled); encryption SSE-S3 mặc định. Không bật Static website hosting hoặc cấu hình public-read.

Bucket name và region phải được ghi lại chính xác; chúng không đổi được sau khi tạo. Endpoint service ví dụ: `https://s3.ap-southeast-1.amazonaws.com`, không thêm tên bucket vào endpoint vì SDK nhận bucket riêng.

## 2. Tạo quyền và key cho ứng dụng

IAM → Policies → Create policy → JSON: dùng [policy mẫu](../../assessment-config/aws-iam-policy.example.json), thay tất cả YOUR_ASSESSMENT_BUCKET bằng tên bucket vừa tạo. Đây là IAM identity policy gắn cho user ứng dụng, không phải bucket policy để dán vào mục S3 Bucket policy.

Tạo IAM user riêng, ví dụ `education-assessment-vps`, không cần quyền đăng nhập Console. Gắn policy trên. Vào Security credentials → Access keys → Create access key. Lưu Access key ID và Secret access key ở file runtime private trên VPS; secret chỉ hiển thị khi tạo, không gửi vào chat hoặc commit.

ListBucket được yêu cầu vì code readiness gọi HeadBucket. Quyền đọc/ghi giới hạn `assessment/*`; quyền xóa chỉ dành `assessment/readiness/*`, vì readiness tạo/đọc/xóa một mẫu kiểm tra. GetObjectVersion/DeleteObjectVersion hỗ trợ phép kiểm tra này khi bucket có versioning. Lifecycle/retention do quản trị cấu hình ngoài key ứng dụng. Không dùng S3FullAccess hoặc root account key.

## 3. CORS cho browser giáo viên

S3 → bucket → Permissions → Cross-origin resource sharing (CORS) → Edit. Dùng [CORS mẫu](../../assessment-config/s3-cors.example.json), thay origin bằng địa chỉ website frontend thật, ví dụ `https://education.nguoimoihoccode.io.vn`. Origin gồm scheme + hostname + port nếu có, không chứa đường dẫn hoặc dấu `/` cuối. Chỉ thêm `http://localhost:5173` nếu cần test từ Vite local.

GET/HEAD phục vụ đọc; POST phục vụ upload form. MaxAgeSeconds chỉ cache kết quả kiểm tra CORS của browser, không phải cache ảnh bài học sinh. CORS không mở public bucket và không tự cấp quyền IAM.

## 4. Điền env trên VPS

Giữ nguyên DB/auth và các cấu hình đang dùng trong .env.prod. Chỉ thêm/cập nhật nhóm sau, thay placeholder bằng giá trị thật:

```dotenv
ASSESSMENT_ENABLED=false
ASSESSMENT_QUEUE_REDIS_URL=
ASSESSMENT_ROUTING_CONFIG_PATH=

ASSESSMENT_STORAGE_DRIVER=s3
ASSESSMENT_S3_ENDPOINT=https://s3.ap-southeast-1.amazonaws.com
ASSESSMENT_S3_REGION=ap-southeast-1
ASSESSMENT_S3_BUCKET=YOUR_ASSESSMENT_BUCKET
ASSESSMENT_S3_FORCE_PATH_STYLE=false
ASSESSMENT_S3_ACCESS_KEY_ID=YOUR_IAM_ACCESS_KEY_ID
ASSESSMENT_S3_SECRET_ACCESS_KEY=YOUR_IAM_SECRET_ACCESS_KEY
```

Các biến S3 được Compose truyền cho cả API và worker. API dùng key ký quyền upload/download; worker dùng key đọc/ghi xử lý. Frontend không có biến VITE_* chứa S3 secret. Không cần thêm container S3 trên VPS.

File `.env.assessment-inference` cấu hình model đọc ảnh nội bộ. File `.env.assessment-worker` giữ audit seed. Hai file dùng cùng token nội bộ, tách với cấu hình S3. Khóa model công cộng chỉ nằm trong file riêng của cổng chấm văn bản nếu tuyến đó được duyệt. Điền S3 xong vẫn để tính năng tắt. Việc mở pilot còn cần kiểm thử mạng, model và quy trình chấm.

## 5. Kiểm tra trước khi bật

- Từ VPS: đúng bucket/region, HTTPS tới endpoint được, HeadBucket và đọc/ghi/xóa canary thành công.
- Từ web: presigned POST upload ảnh tổng hợp thành công, MIME/size đúng, complete/seal thành công, GET link mở được trong thời hạn. Cần kiểm tra POST browser riêng vì readiness canary dùng PutObject, chưa chứng minh CORS/POST.
- Ảnh private không mở bằng URL không có chữ ký; sau logout không xuất hiện trong Cache Storage.
- Cấu hình lifecycle/retention phù hợp từng loại file; không đặt quy tắc xóa cả bucket sau 24 giờ. Prefix thực tế: assessment/<schoolId>/<assessmentId>/staging/...; file sealed và các bản phân tích/báo cáo có prefix riêng.

Các bước vận hành ở [runbook](operations-runbook.md). Chưa có model/benchmark thì không đổi ASSESSMENT_ENABLED thành true chỉ để thử storage qua luồng chấm thật.

## Tương thích nhà cung cấp

S3-compatible không có nghĩa mọi API đều tương thích. Adapter hiện dùng presigned POST và SHA-256 checksum của PutObject. Cloudflare R2 công bố chưa hỗ trợ POST form; chuyển sang R2 cần sửa upload adapter và kiểm tra thêm checksum/versioning/readiness, không chỉ đổi endpoint. Không có thay đổi adapter trong tài liệu hướng dẫn này.

## Nguồn chính thức

- [Tạo S3 bucket](https://docs.aws.amazon.com/AmazonS3/latest/userguide/create-bucket-overview.html)
- [CORS](https://docs.aws.amazon.com/AmazonS3/latest/userguide/ManageCorsUsing.html)
- [HeadBucket và ListBucket](https://docs.aws.amazon.com/AmazonS3/latest/API/API_HeadBucket.html)
- [IAM access keys](https://docs.aws.amazon.com/IAM/latest/UserGuide/access-keys-admin-managed.html)
- [Regional endpoints](https://docs.aws.amazon.com/general/latest/gr/s3.html)
- [R2 presigned URL compatibility](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
- [Giá S3](https://aws.amazon.com/s3/pricing/)
