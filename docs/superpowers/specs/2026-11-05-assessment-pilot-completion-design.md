# Hoàn thiện thiết kế pilot chấm bài trên VPS

Ngày 2026-11-05 · Phụ lục v1.3 của [đặc tả chấm bài](2026-11-03-ai-assisted-assessment-design.md)

Đây là đặc tả cho phần còn thiếu trước khi xử lý bài thật. Các mục dưới đây mô tả hành vi cần xây hoặc kiểm chứng. Giữ chế độ tắt cho tới khi có môi trường và bằng chứng nghiệm thu. Phạm vi đầu là Công nghệ 8, nhiều mã đề trong cùng đợt. Giáo viên tải chung đề và bài làm, duyệt một khung chấm cho mỗi phiên bản mã đề, xử lý ngoại lệ và chốt điểm.

## 1. Khoảng cách giữa mã hiện tại và pilot

| Đã có trong mã | Cần hoàn thiện |
|---|---|
| `AssessmentService.enabled()` kiểm tra một cờ toàn hệ thống. `published()` cũng phụ thuộc cờ này. | Mở đúng lớp × môn của trường pilot. Tạm dừng xử lý mà vẫn xem được điểm đã chốt. |
| Worker che nền sau khi Reader đọc ảnh lần đầu. Nếu chưa có polygon do giáo viên sửa, lượt đầu gửi cả ảnh đã chuẩn hóa. | Xác định tờ chính và che thông tin định danh trên VPS trước khi gửi bất kỳ pixel nào ra ngoài. |
| Browser tải file qua presigned POST. Link đọc có thời hạn năm phút. Báo cáo có hạn truy cập 24 giờ. | Xử lý upload dở và tiếp tục tải đúng bài. Hết hạn truy cập và xóa object là hai bước riêng. |
| Pipeline deploy dựng API trước rồi kiểm tra worker. Worker lỗi có đường rollback image. | Giữ tiếp nhận và ghi điểm ở trạng thái an toàn trong lúc chuyển bản phát hành hoặc khi worker lỗi. |
| Test cục bộ dùng ảnh tổng hợp và provider giả lập. | Nghiệm thu S3/Redis/container thật, benchmark đúng mã đề, đo thao tác giáo viên và chi phí. |

## 2. Ba bước trên màn hình giáo viên

1. **Tải bài.** Mỗi lần thêm một nhóm tạo một bài, có thể chứa ảnh đề đã khoanh và giấy tự luận. Hiện trạng thái theo từng file: đang tải, đã tải chờ xác thực, đã xác thực hoặc lỗi. Khi một file lỗi, tải lại đúng file vào bài hiện tại. Nếu server đã xác thực file và chỉ mất phản hồi, lấy lại trạng thái theo ID để tiếp tục. Giữ các file thành công, phân biệt lỗi mạng, link hết hạn, ảnh mờ và thiếu trang. Chỉ mở thao tác Chấm bài khi các file được chọn đã xác thực.
2. **Chấm theo mã đề.** Danh sách nhóm theo mã đề trong cùng đợt, kèm số bài chưa xác định mã. Lấy mã và nội dung từ tờ chính, đối chiếu phiên bản trong đợt. Khi thiếu trang đề hoặc mã mâu thuẫn, giữ bài đó và yêu cầu bổ sung/xác nhận. Bản nháp đáp án chỉ dùng câu hỏi in và tài liệu chấm nếu có. Giáo viên duyệt một lần cho mỗi phiên bản mã đề. Chỉ một worker được giữ quyền tạo draft có phí cho cùng đợt, mã và fingerprint đề. Kiểm tra draft đã có trước khi gọi model. Mâu thuẫn nội dung cùng mã đi vào xử lý phiên bản, không dùng chung khung chấm ngầm.
3. **Xử lý ngoại lệ và chốt.** Bảng hiển thị mã đề, điểm đã đánh giá, phần chưa đánh giá và lý do chặn. Mở cảnh báo phải đưa thẳng tới câu và vùng ảnh liên quan. Thiếu II.1.a trong ảnh mẫu vẫn để chưa đánh giá. Câu hình được cùng giáo viên xác nhận theo rubric trước khi chốt. Chọn nhóm bài đủ điều kiện và gửi revision của mỗi bài. Bài vừa đổi dữ liệu bị từ chối riêng. Chốt xong mới cập nhật sổ điểm.

## 3. Phân luồng agent và kiểm soát chi phí

| Bước | Đầu vào và điều kiện gọi |
|---|---|
| Reader | Model hỗ trợ ảnh chỉ nhận trang đã che dữ liệu. Cache bản đọc theo hash bytes gửi đi, trang, chính sách che và profile/prompt. Sửa một trang chỉ làm mất hiệu lực kết quả của trang đó và câu phụ thuộc. |
| Ghép dữ liệu và chấm khách quan | Code nhóm theo mã, nối câu qua trang, tính trắc nghiệm và Đ/S từ đáp án đã duyệt. Nếu dấu chọn mơ hồ thì giữ ngoại lệ, không đoán dựa trên đáp án đúng. |
| KeyBuilder và Grader | KeyBuilder chỉ gọi khi cần draft mới. Grader nhận chữ đã đọc cùng rubric theo câu; chỉ cấp ảnh đúng vùng cho bảng/hình khi dữ liệu chữ không đủ. Sửa rubric một câu chỉ chấm lại phần chịu ảnh hưởng. |
| Auditor | Dùng model riêng cho mẫu ổn định và trường hợp rủi ro theo routing đã benchmark. Bất đồng chuyển về review của giáo viên. |

Các model cụ thể chọn qua [routing theo nhiệm vụ](../../assessment/multi-agent-model-routing.md). Trước mỗi lần gọi, giữ ngân sách theo trường, bài và profile. Timeout chưa xác nhận được phí giữ reservation ở trạng thái chưa rõ, có giới hạn retry. Khi hết ngân sách, dừng lượt gọi mới và hiển thị lý do trong bảng tiến độ. Báo cáo theo cả tổng chi phí và chi phí trên mỗi bài đủ điều kiện chốt để thấy giá của các ca thất bại và phải đọc lại. Ở P2 cần đo số lượt gọi thật tại adapter giả lập, bao gồm ca rubric đã có, retry và chỉnh một trang.

## 4. Mở có giới hạn và tạm dừng

Giữ `ASSESSMENT_ENABLED` làm công tắc triển khai, mặc định `false`. Bổ sung cấu hình pilot lưu PostgreSQL theo `schoolId + classId + subjectId`, có revision và audit actor/thời điểm/lý do. Quản trị vận hành thay đổi qua thao tác có quyền. Khi chưa có cấu hình hoặc cấu hình lỗi, hệ thống không cấp quyền xử lý. Quyền lớp × môn và ParentLink vẫn kiểm tra riêng.

| Trạng thái lớp × môn | Hành vi |
|---|---|
| `closed` hoặc không có trong danh sách pilot | Không tạo đợt, tải bài, cấp link bằng chứng, gọi model hay chốt. |
| `active` | Cho phép quy trình đầy đủ khi hệ thống đã sẵn sàng. API trả capabilities theo lớp × môn. |
| `paused` | Không cấp upload, không nhận job mới, không gọi model mới, không chốt mới. Giáo viên được xem trạng thái và bản điểm đã công bố. Rút điểm đã công bố vẫn dùng lệnh riêng với quyền hiện hành, lý do và audit. |

Sổ điểm và bản công bố của chính học sinh/phụ huynh đã được duyệt vẫn đọc theo quyền khi dừng xử lý, kể cả khi global flag tắt. API công bố trả snapshot đã chốt, không cấp bằng chứng trong nhánh này. Quyền cấp URL cho staff chỉ có ở trạng thái active. URL đã ký trước đó là capability ngắn hạn, có thể dùng đến khi hết hạn theo S3. Khi cần ngắt quyền ngay do sự cố, cô lập quyền truy cập S3 tương ứng và kiểm thử ảnh hưởng với vận hành. [Hành vi URL đã ký của AWS](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html)

API kiểm tra trạng thái dưới cùng transaction với thay đổi nghiệp vụ. Worker kiểm tra lúc claim, trước mỗi lần giữ ngân sách để gọi provider và trước khi áp kết quả. Một lượt gọi đã bắt đầu có thể hoàn tất sau khi pause. Giữ checkpoint và chi phí đã phát sinh, chặn ghi kết quả vào review bằng revision của cổng pilot. Khi mở lại, đối chiếu input revision và routing snapshot trước khi chạy lại. Chỉ tái dùng checkpoint khớp đầu vào, chính sách che dữ liệu và phiên bản model.

Thứ tự triển khai là đóng tiếp nhận, áp migration tương thích, chạy API và worker cùng SHA, kiểm tra dependencies và thử tổng hợp trong môi trường riêng, rồi mới mở đúng phạm vi pilot. Khi worker lỗi hoặc rollback, giữ cổng đóng/paused, bảo toàn Redis AOF và PostgreSQL. Khôi phục cùng cặp API/worker đã kiểm chứng rồi kiểm tra lại trước khi mở. Healthcheck container chỉ chứng minh worker còn hoạt động; browser S3 và luồng ghi điểm cần ca thử riêng.

## 5. Bảo vệ ảnh trước lần gọi Reader đầu tiên

Worker render và xoay ảnh trên VPS, loại metadata ảnh, định vị tờ chính bằng xử lý ảnh cục bộ. Dùng polygon để xóa pixel ngoài tờ chính và che vùng họ tên/lớp/chữ ký theo mẫu đã kiểm chứng. Lưu ánh xạ tọa độ để giáo viên xem vùng bằng chứng trên ảnh trong app. Ghép học sinh bằng roster và xác nhận của giáo viên trong app. Gói gửi model chỉ chứa dữ liệu cần cho câu hỏi, dấu chọn, chữ viết tay và mã đề đã tách khỏi vùng định danh.

Nếu tờ chính bị chồng, vùng định danh chạm mã đề, hoặc không thể che an toàn bằng mẫu hiện có, trả trạng thái cần sửa ảnh trước AI. Giáo viên chọn vùng hoặc chụp lại; luồng tạo revision như thao tác crop hiện tại. Đo cả số bài phải can thiệp để xác định cách này có giảm thao tác thật. Nhánh KeyBuilder, Grader và Auditor chỉ dùng câu hỏi/đáp án đã lọc, các ID kỹ thuật và crop đúng câu khi cần. Áp dụng cùng chính sách cho tài liệu hướng dẫn chấm. Xác minh điều kiện lưu trữ và xử lý dữ liệu của từng provider theo tài khoản thực tế trước khi dùng dữ liệu thật.

Ca bắt buộc với bộ ảnh Công nghệ 8 là ảnh có giấy mã 103 phía sau giấy mã 102. Kiểm tra ảnh thực tế tại ranh giới adapter, bằng fixture có chuỗi nhận dạng giả ở vùng tên và nền. Cả Reader, KeyBuilder, Grader, Auditor đều phải loại thông tin ngoài phạm vi của mình, kể cả khi xử lý lại dữ liệu cache. Khi đổi chính sách che ảnh, kết quả/checkpoint cũ không được tái sử dụng chỉ vì cùng hash ảnh gốc.

## 6. Vòng đời S3 và phục hồi

Dùng private bucket ngoài VPS có presigned POST, niêm phong và GET đã kiểm chứng theo [hướng dẫn AWS S3](../../assessment/aws-s3-setup.md). Khóa API/worker hiện tại chỉ có quyền xóa canary. Khi xây purge, dùng quyền xóa riêng cho tác vụ bảo trì, giới hạn namespace assessment và đối chiếu manifest trước khi xóa. Bản đầu của chính sách pilot đề xuất như sau.

| Dữ liệu | Hạn và điều kiện |
|---|---|
| Upload staging | Link tải 15 phút. Dọn sau tối thiểu 24 giờ và khi seal đã kết thúc hoặc upload hết hạn, không còn job cần dữ liệu. |
| Ảnh/PDF niêm phong, ảnh dẫn xuất, phản hồi thô | 365 ngày từ lần công bố gần nhất của bài. Nháp không hoạt động 90 ngày đi vào diện dọn, có cảnh báo trong app trước 7 ngày. Tài liệu chấm dùng chung lấy hạn muộn nhất của bài còn tham chiếu. |
| Báo cáo Excel/PDF | Giữ hạn tải 24 giờ đang có trong API, giới hạn URL được ký bằng thời gian còn lại. Đưa object vào danh sách xóa khi hết hạn. Snapshot điểm vẫn có thể xuất lại theo quyền. Mốc này thay mốc 7 ngày trong pipeline cũ. |
| Điểm đã chốt, phiên bản và audit nghiệp vụ | Tiếp tục lưu sau khi dọn bytes. Chỉ giữ nội dung trích xuất cần cho review/audit theo chính sách trường. Raw output và transcript đầy đủ có vòng đời riêng, không giữ vô hạn chỉ vì nằm trong JSON PostgreSQL. |

Tác vụ dọn lập manifest dry-run theo DB với tenant, key, version nếu có, hạn và lý do. Dùng cùng khóa nghiệp vụ với job xử lý để đánh dấu đang dọn trước khi thao tác S3; API ngừng cấp link và worker ngừng đọc lại. Tác vụ có retry idempotent, xác nhận đã xóa các phiên bản thuộc manifest rồi mới đánh dấu đã dọn, ghi audit. Nếu object mất ngoài quy trình, hiển thị bằng chứng không khả dụng và báo vận hành. Rà soát riêng object mồ côi do crash sau khi ghi S3 trước commit DB: đối chiếu manifest và khoảng an toàn cho job còn lease trước khi dọn. Không khôi phục ảnh đã purge từ backup vào luồng chấm; diễn tập restore DB cùng manifest object/version và áp lại nhật ký purge.

Key đang đặt theo `assessment/<schoolId>/<assessmentId>/staging/...`, nên một prefix chung `assessment/` sẽ bao trùm cả file đã niêm phong. Dùng manifest DB cho hạn theo ngày công bố. Nếu bổ sung S3 Lifecycle cho staging, phải chứng minh filter chỉ khớp staging, chẳng hạn bằng tag được ràng buộc trong luồng upload hoặc namespace mới được kiểm thử. Với bucket bật versioning, kiểm tra cả phiên bản cũ và delete marker trước khi báo đã dọn bytes. [Quy tắc hết hạn của AWS S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/lifecycle-expire-general-considerations.html)

## 7. Thứ tự nghiệm thu

| Đợt | Bằng chứng phải có |
|---|---|
| P1 · Nghiệp vụ và quyền, fixture tổng hợp | Hai lớp/trường có quyền khác nhau; phạm vi ngoài pilot không gọi provider, không cấp upload và không chốt. Pause giữa lúc gọi model không ghi đè review, đọc bản đã công bố vẫn đúng quyền. Upload lỗi giữa nhóm chỉ tải lại file lỗi. |
| P2 · Ảnh và nhiều mã, fixture tổng hợp | Bắt payload tại adapter để chứng minh ảnh nền/định danh bị loại. Mã 102/103 cùng đợt dùng đúng rubric. Hai worker không gọi soạn cùng draft đồng thời. Thiếu II.1.a giữ null, hình chưa xác nhận chặn chốt. |
| P3 · Staging VPS có bucket và Redis riêng | Browser POST → seal → GET; thao tác sau logout không có ảnh trong cache; worker render PDF thật. Redis restart và worker crash phục hồi từ DB. Thử rollback worker, timeout S3 trong purge và restore DB + object manifest. Bài đã công bố vẫn đọc được trong quá trình thử. |
| P4 · Benchmark và pilot giám sát | Dùng bài đã chấm được phép dùng làm chuẩn, giữ riêng holdout theo học sinh/đợt. Duyệt khung chấm theo mã và chỉ một giáo viên trong luồng nghiệp vụ. Báo accuracy lẫn coverage, MAE theo loại câu, thời gian thao tác, chi phí cả retry và số bài cần xác nhận vùng. Áp ngưỡng trong [tiêu chí đánh giá](../../assessment/evaluation-and-delivery.md). |

Thứ tự xây phần còn lại là cổng pilot và tạm dừng, sau đó che dữ liệu trước AI và hoàn thiện luồng ngoại lệ, rồi purge và diễn tập vận hành. Có thể kiểm chứng P1/P2 với provider giả và dữ liệu tổng hợp trước khi có S3/key thật. P3/P4 cần hạ tầng và quyền sử dụng dữ liệu thực tế. Mở pilot ở một lớp Công nghệ 8 với hai mã đề trở lên sau khi qua các bước trên, và giữ cơ chế tạm dừng nếu phát hiện ghép sai học sinh/mã đề, lộ dữ liệu, ghi điểm sai hoặc vượt ngân sách đã duyệt.
