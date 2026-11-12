# Thiết kế bảo vệ dữ liệu học sinh trong luồng chấm bài

Ngày 06/11/2026 · Đặc tả đề xuất cho pilot chấm bài Công nghệ 8

## Phạm vi

Giáo viên chọn học sinh rồi tải các trang bài như hiện tại. Bài thật được lưu và xử lý trong hạ tầng riêng tại Việt Nam. API Gemini và DeepSeek chỉ được dùng ở môi trường thử nghiệm tách biệt với dữ liệu giả lập. Python đọc phần bài cần thiết. NestJS giữ danh tính, quyền truy cập và quyết định ghi sổ sau khi giáo viên duyệt.

Thiết kế ưu tiên ngăn lộ dữ liệu ngay cả khi cắt ảnh hoặc che chữ sai. Ảnh đã che, văn bản trích xuất và điểm vẫn được bảo vệ như dữ liệu cá nhân khi hệ thống có thể liên kết chúng với học sinh. Tài liệu này bổ sung [đặc tả nhập đề Word](2026-11-06-assessment-official-exam-import-design.md).

## Các vùng dữ liệu

| Thành phần | Dữ liệu và quyền |
|---|---|
| NestJS và PostgreSQL | Giữ họ tên, mã học sinh, lớp, liên kết học sinh với bài nộp, quyền lớp và môn, kết quả và lịch sử duyệt. Duyệt quyền trước mỗi lượt xem, tải hoặc ghi sổ. |
| Kho riêng cho bài gốc | Giữ ảnh/PDF gốc, tệp tải dở và bằng chứng gốc. Khóa công khai đọc/list. Tên object dùng mã ngẫu nhiên. Chỉ NestJS và worker tiền xử lý có quyền đọc đúng phạm vi. |
| Worker tiền xử lý | Đọc bài gốc đã xác thực, tạo bản ảnh xử lý trong vùng riêng. Dùng credential giới hạn quyền. Kiểm tra kích thước, số trang và định dạng trước khi giải mã. |
| Python xử lý bài | Nhận mã tác vụ ngẫu nhiên, trang đã xử lý và phiên bản khung chấm cần thiết. Nhận dữ liệu qua API nội bộ có xác thực. Không gắn credential kho bài gốc, PostgreSQL, sổ điểm hay API model công cộng vào service này. |
| Hàng đợi và log | Hàng đợi chứa mã job và phiên bản đầu vào. Log chỉ giữ mã truy vết nội bộ, mã lỗi và số liệu vận hành. Họ tên, nội dung bài, file base64, URL ký và secret nằm ngoài payload log, trace và báo lỗi. |

Kho có thể dùng giao diện S3-compatible. Địa điểm của VPS, kho, bản sao lưu và dịch vụ quan sát phải được xác minh riêng trước khi bật bài thật. Mã hóa truyền và lưu trữ, tách credential giữa các vai trò, kiểm tra khôi phục và phân quyền kho là điều kiện vận hành.

## Luồng xử lý bài thật

1. Giáo viên chọn học sinh trong danh sách lớp rồi gắn trang. NestJS xác minh quyền và ghi liên kết. Trình duyệt tải file lên vùng staging qua quyền ghi có hạn, không có quyền đọc hoặc liệt kê kho. Backend xác thực file trước khi đưa vào vùng bài gốc.
2. Backend kiểm tra bài có được xử lý tự động trước khi tạo job. Bài thiếu điều kiện hoặc chọn chấm thủ công đi vào cùng màn hình duyệt với trạng thái tương ứng. Worker kiểm tra lại điều kiện và phiên bản trước khi xử lý để job đã xếp hàng không vượt qua thay đổi sau đó.
3. Worker nội bộ dựng ảnh từ PDF, xử lý từng trang, cắt tờ chính, che họ tên, mã học sinh, lớp, chữ ký, mã QR hoặc dấu hiệu định danh nhìn thấy và bỏ metadata khi mã hóa lại. Nếu chỉ thấy bài mờ, có nhiều tờ chồng lên nhau hoặc chưa xác định được vùng che, đặt trạng thái **Cần kiểm tra ảnh**. Giáo viên có thể thay ảnh, xác nhận vùng cắt và vùng che, hoặc chấm thủ công. Bài khác trong cùng đợt tiếp tục.
4. Python chỉ nhận ảnh dẫn xuất đã qua bước trên. Bỏ yêu cầu đọc `studentName` khỏi prompt và bỏ trường đó khỏi hợp đồng kết quả mới. Trắc nghiệm và Đúng/Sai dùng đáp án đã duyệt. Phần chữ viết tay và tự luận dùng OCR hoặc model chạy nội bộ nếu đạt kiểm thử. Câu chưa đọc đủ bằng chứng giữ trạng thái chưa đánh giá. NestJS ánh xạ kết quả trở lại bài nộp.
5. Giáo viên xem ảnh, khung chấm và điểm nháp rồi xác nhận hoặc sửa. NestJS lưu lần duyệt cùng người duyệt, phiên bản đầu vào, khung chấm và bản kết quả. API chỉ cho ghi sổ phiên bản đã duyệt. Ghi sổ hàng loạt chọn từ các bài đã duyệt. Khi ảnh hoặc kết quả thay đổi, lượt duyệt cũ hết hiệu lực cho bản mới.

## Chặn truyền bài thật ra ngoài

- Tách môi trường thử nghiệm có API model công cộng khỏi môi trường bài thật bằng kho, cơ sở dữ liệu, hàng đợi, tài khoản và credential riêng. Luồng bài thật mặc định chỉ có tuyến xử lý nội bộ. Chế độ thật do backend và cấu hình triển khai quyết định, độc lập với lựa chọn từ trình duyệt hoặc payload job.
- Service Python và model nội bộ nằm trên mạng riêng không có đường ra Internet. Worker có quyền đến kho hoặc dịch vụ nội bộ theo danh sách đích cố định. Kiểm chứng cả chính sách mạng và cấu hình ứng dụng. Mạng bridge trong Compose hiện tại chỉ là điểm xuất phát để cấu hình, không được coi là bằng chứng đã chặn kết nối ra ngoài.
- Model nội bộ mất kết nối, job cũ thiếu trạng thái bảo vệ hoặc cấu hình routing trỏ ra Internet đều dẫn đến từ chối chạy hoặc chuyển chấm thủ công. Retry và fallback tuân cùng chính sách. Kết quả OCR, crop và cache từ trước khi áp dụng chính sách chỉ dùng lại nếu đã kiểm chứng nguồn và phiên bản bảo vệ.
- Mọi tích hợp cloud cho bài thật về sau phải được thiết kế và phê duyệt riêng, với dữ liệu gửi đi, điều kiện sử dụng và vị trí xử lý được xác minh. Luồng hiện tại chỉ mở API model công cộng cho dữ liệu giả lập.

## Trình duyệt, vòng đời và sự cố

- Ưu tiên proxy ảnh qua endpoint xác thực của NestJS để kiểm tra quyền ở mỗi lượt đọc và có thể thu hồi quyền ngay. Thư viện viewer dùng URL tạm trong bộ nhớ và thu hồi khi đóng bài, đổi tài khoản hoặc hết phiên. Ảnh gốc, ảnh dẫn xuất, PDF và báo cáo riêng tư dùng `Cache-Control: private, no-store`. Kiểm tra quy tắc NetworkOnly, cache cũ của service worker và cache ở reverse proxy.
- Staging bỏ dở áp dụng mốc 24 giờ theo thiết kế kho hiện có. File tạm của worker được dọn sau khi hoàn tất hoặc hết hạn xử lý. Nhà trường cấu hình thời hạn riêng cho ảnh gốc, dẫn xuất, báo cáo và bản sao lưu. Khi hết hạn, thu hồi quyền đọc và dọn bản sao tương ứng theo chính sách. Lịch sử điểm và hồ sơ kiểm tra có chính sách riêng.
- Khi nghi lộ dữ liệu, người vận hành có thể tạm dừng job, thu hồi phiên hoặc credential và ngắt quyền đọc vùng ảnh. Giữ mã truy vết và lịch sử quyền để xác định phạm vi sự cố, tránh sao chép thêm nội dung học sinh vào công cụ hỗ trợ.

## Nghiệm thu trước khi nhận bài thật

| Ca thử với dữ liệu giả lập | Kết quả phải quan sát được |
|---|---|
| Họ tên ở đầu trang, trong câu trả lời hoặc trên tờ phía sau | Trang dẫn xuất không lộ vùng đã nhận diện. Trường hợp không chắc chuyển giáo viên. Bài thật không có kết nối tới API model công cộng dù phát hiện thiếu. |
| Model nội bộ lỗi, routing sai hoặc job retry | Dừng hoặc chuyển chấm thủ công. Không gửi ảnh, text hay rubric kèm câu trả lời sang môi trường khác. |
| Truy cập bằng tài khoản khác lớp, khác trường hoặc sau khi thu hồi quyền | Proxy từ chối ảnh gốc, bản dẫn xuất và báo cáo. Sau logout, dữ liệu không còn dùng được từ cache hoặc chế độ offline. |
| Kiểm tra log, telemetry, hàng đợi và bản sao lưu | Không có nội dung bài hoặc credential trong log/hàng đợi. Bản sao lưu đúng vị trí, quyền và thời hạn đã cấu hình. |
| Thêm trang hoặc đổi khung chấm sau khi duyệt | Lượt duyệt cũ không áp dụng cho bản mới. API ghi sổ từ chối nếu chưa duyệt lại. |

Triển khai theo thứ tự chặn kết nối ra ngoài và cô lập môi trường, tách quyền kho và thay luồng đọc ảnh, sau đó kiểm chứng truy cập và duyệt trước ghi sổ. Dùng dữ liệu giả lập cho đến khi các ca trên đạt và nhà trường chốt chính sách vận hành. Chất lượng OCR nội bộ cần được đo riêng để xác định phần nào có thể tự động hóa.
