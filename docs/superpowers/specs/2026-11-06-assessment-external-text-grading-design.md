# Chấm tự luận qua API ngoài với đầu vào đã khử nhận dạng

Ngày 06/11/2026 · Đặc tả đề xuất cho pilot Công nghệ 8

## Phạm vi

Thiết kế bổ sung một tuyến tùy chọn vào [luồng bảo vệ dữ liệu học sinh](2026-11-06-assessment-student-data-privacy-design.md). Python tiếp tục đọc ảnh bài thật trong hạ tầng riêng. API ngoài chỉ có thể nhận văn bản đã được kiểm tra của một câu tự luận ngắn và tiêu chí chấm tương ứng. Tuyến này mặc định đóng với bài thật. Môi trường giả lập vẫn tách biệt và có thể thử model đọc ảnh.

Bản đầu giữ trắc nghiệm và Đúng/Sai ở bộ chấm theo quy tắc. Câu hình, bảng khó đọc, bài thiếu trang, câu trả lời có nội dung nhận dạng chưa xử lý được hoặc phần đề và đáp án chưa duyệt đều giữ ở nội bộ. Giáo viên quyết định điểm cuối.

## Luồng của một bài

1. Giáo viên chọn học sinh rồi tải các trang. NestJS kiểm tra quyền theo trường, lớp và môn, gắn ảnh vào bài và giữ bảng liên kết với học sinh. Ảnh gốc nằm trong kho riêng. Khi bài thuộc diện chấm thủ công, hệ thống chuyển thẳng đến hàng duyệt.
2. Worker tiền xử lý cắt tờ chính, che vùng định danh và bỏ metadata. Python đọc ảnh dẫn xuất qua mạng nội bộ. Ảnh mờ hoặc lẫn nhiều tờ đi vào trạng thái **Cần kiểm tra ảnh**. Python trả về câu trả lời, trạng thái đọc và tham chiếu vùng ảnh nội bộ. Các vùng này phục vụ giáo viên xem bằng chứng.
3. NestJS đối chiếu đúng phiên bản đề đã duyệt. Bộ chấm theo quy tắc tính điểm trắc nghiệm và Đúng/Sai. Với từng câu tự luận ngắn đủ bằng chứng, bộ lọc nội bộ tạo bản văn bản tối thiểu để xét gửi. Bộ lọc kiểm tra cả câu trả lời và tiêu chí, kể cả nội dung đến từ file Word của giáo viên.
4. Nếu chính sách của đợt chấm cho phép và nội dung qua kiểm tra, worker gọi **cổng API ngoài**. Model trả điểm đề xuất theo tiêu chí. NestJS kiểm tra cấu trúc, giới hạn điểm, phiên bản rubric và phiên bản bài trước khi lưu nháp. Bài bị chặn vẫn có thể được xử lý nội bộ hoặc chấm thủ công. Bài khác tiếp tục.
5. Giáo viên xem bài gốc, phần đã đọc và điểm đề xuất, rồi sửa hoặc xác nhận. NestJS ghi sổ theo lượt duyệt gắn với phiên bản bài và kết quả. Ghi sổ hàng loạt chỉ nhận các bài đã duyệt. Khi thay trang, đổi đề hoặc chấm lại, kết quả mới cần được duyệt lại.

## Quyền truy cập và đường truyền

| Thành phần | Quyền và giới hạn |
|---|---|
| NestJS | Giữ danh tính, kiểm tra chính sách, ánh xạ tác vụ với bài, lưu bằng chứng, kiểm tra kết quả và ghi sổ. |
| Worker tiền xử lý | Đọc kho gốc theo phạm vi được cấp và chuyển bản dẫn xuất cho Python. Không mang khóa nhà cung cấp AI. |
| Python đọc ảnh nội bộ | Chỉ nhận bản dẫn xuất và mã tác vụ nội bộ. Không có quyền kho gốc, danh sách lớp, ghi sổ hay gọi Internet. |
| Cổng API ngoài | Service riêng có xác thực nội bộ, nhận một loại yêu cầu chấm văn bản. Chỉ service này giữ khóa API và được phép kết nối tới endpoint cố định của nhà cung cấp đã phê duyệt. Không có credential kho gốc, PostgreSQL hay sổ điểm. |

Không mở tuyến chấm mới qua endpoint `/v1/generate` hiện có, vì endpoint đó nhận cả ảnh, prompt và payload linh hoạt. Dùng một hợp đồng riêng cho chấm văn bản. Khóa chiều ra Internet ở cấu hình mạng và loại bỏ tuyến dự phòng trực tiếp qua adapter provider cũ đối với bài thật. Cổng từ chối URL do caller cung cấp và chuyển hướng HTTP. Môi trường giả lập có khóa, kho, hàng đợi và cơ sở dữ liệu riêng.

## Điều kiện gửi và hợp đồng dữ liệu

- Backend kiểm tra chế độ của môi trường, chính sách của đợt chấm, tình trạng tham gia xử lý tự động, provider được duyệt và phiên bản bài. Cổng xác minh vé nội bộ ngắn hạn do backend ký, gắn với hash nội dung, phiên bản chính sách và loại tác vụ. Vé, mã truy vết và các mã nội bộ chỉ đi giữa các service. Khi retry phải đánh giá lại quyền gửi.
- Kiểm tra dấu hiệu nhận dạng trực tiếp và theo ngữ cảnh. Ví dụ gồm tên, mã học sinh, trường/lớp, liên hệ, chữ ký chép lại và câu trả lời kể sự kiện cá nhân có thể nhận diện. Nếu còn nghi ngờ hoặc việc lược bỏ làm đổi nghĩa câu trả lời, giữ bài nội bộ. Kết quả bộ lọc là điều kiện kỹ thuật để xét gửi, không phải chứng nhận dữ liệu đã khử nhận dạng.
- Payload đến nhà cung cấp chỉ có văn bản câu trả lời đã xét gửi, nội dung câu hỏi tối thiểu nếu cần, tiêu chí chấm và mức điểm cho từng tiêu chí. Dùng nhãn tiêu chí cục bộ như `c1`. Không kèm ảnh, PDF, bảng điểm, URL, metadata, mã trường/lớp/học sinh, mã bài, mã đợt, mã job hay lịch sử hội thoại. Cổng tạo chỉ dẫn cố định và từ chối trường lạ, nội dung quá dài và kiểu dữ liệu ngoài hợp đồng.
- Model trả điểm từng tiêu chí và lý do ngắn dựa trên câu trả lời. NestJS đối chiếu điểm được phép, kiểm tra tiêu chí bị thiếu hoặc lặp và tự tổng hợp điểm. Kết quả sai cấu trúc hoặc có bằng chứng không hợp lệ chuyển về giáo viên. Nội dung bài và rubric được xử lý như dữ liệu. Model không được cấp công cụ, URL callback hoặc quyền tác động vào hệ thống.
- Nếu timeout, lỗi cấu hình, vé hết hạn, thiếu quyền hoặc provider không sẵn sàng, giữ trạng thái chưa có điểm đề xuất. Retry có giới hạn và dùng lại kết quả hợp lệ đã lưu nội bộ cho cùng phiên bản khi chính sách cho phép. Hệ thống không gửi nhiều dữ liệu hơn hoặc tự chuyển sang provider chưa được duyệt.

Log, hàng đợi và theo dõi lỗi chỉ giữ mã truy vết, trạng thái, phiên bản chính sách, provider/model và số liệu vận hành. Tránh lưu prompt, đoạn trả lời, ảnh hoặc phản hồi thô trong log. Điểm nháp và lý do đã kiểm tra được lưu trong phạm vi bài nộp để giáo viên đối chiếu.

## Bật và nghiệm thu tuyến ngoài

Quản trị viên chỉ bật tuyến cho bài thật sau khi nhà trường và bên vận hành xác nhận loại nội dung được gửi, điều kiện xử lý của nhà cung cấp, nơi xử lý/lưu giữ, quyền tham gia và các thủ tục áp dụng. Một lựa chọn nhà cung cấp hoặc việc bật thanh toán không tự mở tuyến. Có thể tắt ở cấp môi trường và đợt chấm. Job đang chờ phải kiểm tra lại chính sách trước lượt gọi tiếp theo.

| Ca kiểm thử | Kết quả |
|---|---|
| Tên nằm trong câu trả lời hoặc rubric Word, hoặc có chi tiết nhận dạng gián tiếp | Giữ ở nội bộ nếu chưa xử lý an toàn. Provider giả không nhận yêu cầu. |
| Gửi ảnh, URL, mã học sinh hoặc trường thừa vào cổng | Cổng từ chối trước khi mở kết nối ra ngoài. |
| Nội dung đủ điều kiện | Provider giả chỉ nhận nội dung một câu và tiêu chí tương ứng. NestJS ghép kết quả với bài ở nội bộ. |
| Tắt tuyến khi job đang chờ, đổi phiên bản bài hoặc thử phát lại vé | Lượt gửi mới bị chặn hoặc kết quả cũ không được áp dụng vào bản mới. |
| Python nội bộ cố gọi API ngoài, hoặc model trả điểm vượt rubric | Kết nối bị chặn ở tầng mạng. Kết quả vượt điểm không tạo bản duyệt hợp lệ. |
| Bài chưa duyệt hoặc thêm trang sau khi duyệt | API ghi sổ từ chối cho tới khi có lượt duyệt đúng phiên bản. |

Triển khai trước bằng provider giả để kiểm tra chính xác payload đi ra. Sau đó thử provider thật bằng dữ liệu tổng hợp. Việc chạy bài thật chỉ bắt đầu sau khi kiểm chứng đường mạng, chất lượng đọc nội bộ, khả năng giáo viên xử lý ngoại lệ và các điều kiện vận hành đã được xác nhận.
