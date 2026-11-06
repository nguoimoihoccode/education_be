# Thiết kế luồng chấm từ đề và đáp án chính thức

Ngày 2026-11-06 · Bổ sung luồng chọn khung chấm cho [thiết kế pilot](2026-11-05-assessment-pilot-completion-design.md).

Đây là đặc tả cho phần nhập đề chính thức và ghép bài. Bản đầu áp dụng cho một môn và một khối, có nhiều mã trong cùng đợt. Giao diện tiếp tục có bản xem trước trong khi kiểm thử luồng thật trên staging.

## 1. Ba bước của giáo viên

1. **Chuẩn bị đợt chấm.** Chọn lớp và môn. Trong mục **Đề và đáp án**, có hai lựa chọn: **Tải file đề và hướng dẫn chấm** hoặc **Lấy đề từ ảnh bài làm**. Ở nhánh có file, giáo viên tải một DOCX chứa cả đề và biểu điểm cho mỗi phiên bản đề, kiểm tra bản trích xuất, xác nhận mã đề và duyệt. Nhiều phiên bản cùng nằm trong một đợt. Giáo viên có thể chuẩn bị nhóm bài trong lúc file Word đang được đọc.
2. **Tải và xử lý cả lớp.** Chọn học sinh trong danh sách, gắn ảnh đề đã làm và ảnh tự luận, chuyển em tiếp theo rồi tải chung. Tiến độ và lỗi hiện theo file. Nút **Bắt đầu xử lý** đưa các bài đã xác thực đủ file vào hàng đợi. Bài chờ tài liệu, sai mã hoặc thiếu trang được giữ riêng. Với nhánh chưa có file, hệ thống đọc câu hỏi in từ bài đủ trang và tạo một khung chấm nháp cho phiên bản đó. Cùng một giáo viên kiểm tra và duyệt khung chấm.
3. **Kiểm tra ngoại lệ và chốt.** Giáo viên mở danh sách **Cần xử lý** để thấy đúng câu và vùng ảnh. Với bài có câu hình, xác nhận từng bài trên màn hình duyệt liên tiếp, hiển thị ảnh, tiêu chí và điểm cạnh nhau. Chọn các bài đủ điều kiện rồi chốt điểm. Bài đang lỗi có thể xử lý và chốt sau.

## 2. Nhập file chính thức một lần

NestJS nhận file Word trong phạm vi đợt chấm, lưu tài liệu nguồn vào kho riêng tư và tạo job nhập. Phạm vi đầu là một đề kèm một hướng dẫn chấm trong mỗi file. Nếu file chứa nhiều đề hoặc nhiều bảng đáp án có thể ghép theo nhiều cách, báo cần tách hoặc xác nhận từng khối trước khi tạo khung chấm. Nếu file thiếu mã, giáo viên nhập mã in trên đề đã phát hoặc đánh dấu đề không in mã. Trạng thái đó là dữ liệu riêng, không suy ra từ tên file. Một đề không in mã có thể được ghép theo nội dung nếu chỉ có một phiên bản phù hợp, hoặc được giáo viên xác nhận theo quy tắc ở mục 3.

| Dữ liệu | Cách đọc và kiểm tra |
|---|---|
| Phần đề | Đọc DOCX theo thứ tự đoạn, bảng và công thức OMML. Giữ số câu, ý nhỏ, thứ tự phương án, công thức, đơn vị và hình nếu có. Nếu thiếu nội dung công thức hoặc bố cục không đọc được, hiển thị ngay vị trí cần kiểm tra. |
| Trắc nghiệm | Đọc bảng đáp án theo số câu, giữ nguyên ký hiệu và điểm. Kiểm tra câu lặp, thiếu đáp án, đáp án ngoài phương án và tổng điểm. |
| Đúng/Sai | Lưu đáp án từng ý và bảng điểm theo số ý đúng. Với file mẫu, bảng là 0, 0.10, 0.25, 0.50 và 1.00 cho từ 0 đến 4 ý đúng. |
| Tự luận và hình | Lưu tiêu chí, điểm thành phần và vùng nguồn trong tài liệu. Ưu tiên đọc bảng bằng code. Dùng model để đề xuất cấu trúc tiêu chí khi nội dung trình bày tự do. Tiêu chí chưa rõ chờ giáo viên sửa. |

Khung chấm nháp hiển thị cạnh đoạn hoặc ô nguồn để giáo viên sửa rồi duyệt. Ví dụ, câu II.1.b trong file mẫu chia 0.25 cho thành phần, 0.25 cho tính chất và 0.50 cho ứng dụng. Câu hình gồm bốn tiêu chí 0.50 điểm. Tổng phần trắc nghiệm, Đ/S và tự luận lần lượt là 3, 1 và 6 điểm. Hướng dẫn chính thức đã duyệt là nguồn tính điểm. Model được phép cấu trúc nội dung và giải thích bằng chứng, còn thay đổi đáp án hoặc biểu điểm cần giáo viên lưu và duyệt phiên bản mới.

Cùng file và cùng cấu hình nhập trong một đợt có thể dùng lại bản trích xuất theo checksum và phiên bản parser. Nếu tải lại do mất mạng, tiếp tục job đã có. Việc duyệt tạo hoặc chọn một phiên bản cụ thể, không ghi đè phiên bản đã duyệt. Giáo viên chỉ duyệt lại nếu đã thay đổi khung chấm hoặc thay đổi tài liệu gốc.

## 3. Ghép bài với đúng phiên bản trước khi tính điểm

- **Mã đề và nội dung cùng khớp:** gắn bài với phiên bản đã duyệt. So sánh cấu trúc và nội dung câu in trên tờ chính, gồm số câu, phương án theo thứ tự, mệnh đề Đ/S, số liệu, công thức và đơn vị nếu quan sát được. Chuẩn hóa khác biệt trình bày, giữ dấu toán học và số liệu có ý nghĩa. Câu nhận dạng thiếu hoặc OCR mơ hồ không được tính là bằng chứng khớp.
- **Thiếu mã hoặc bài chỉ có giấy trả lời:** nếu bằng chứng in đủ và chỉ khớp một phiên bản, có thể ghép theo nội dung. Nếu bằng chứng thiếu, giáo viên xác nhận nhóm bài theo phiên bản dựa trên danh sách hoặc đề gốc họ có. Các bài mâu thuẫn nội dung phải sửa đầu vào hoặc chọn đúng phiên bản sau khi đối chiếu, kể cả đã xác nhận nhóm.
- **Mã trùng nhưng nội dung khác:** giữ bài ở trạng thái **Cần xác nhận phiên bản**. File Word mẫu hỏi kích thước A4 ở câu 1, còn ảnh mã 102 hỏi tỉ lệ 1:2. Ca này phải bị giữ lại dù cả hai cùng môn và kỳ thi. Có thể chọn khung đúng hoặc nhập thêm phiên bản, không tự dùng đáp án của file Word cho ảnh mã 102.
- **Chưa có khung chấm:** khi giáo viên chọn nhánh đọc đề từ ảnh, chỉ soạn một nháp cho từng mã và nội dung đề trong đợt. Nguồn là câu hỏi in, tách khỏi dấu chọn và phần tự luận của học sinh. Nếu đang có tài liệu chính thức chờ xác thực, ưu tiên đợi tài liệu đó thay vì tự tạo thêm nháp. Chờ duyệt trước khi tính điểm.

Mỗi bài gắn một `examVersionId` và lưu căn cứ ghép. Đổi phiên bản làm kết quả nháp cũ hết hiệu lực. Điểm đã công bố chỉ thay đổi sau thao tác chốt lại của giáo viên.

## 4. Ranh giới xử lý và quyền truy cập

- Tận dụng Assessment, ExamVersion, upload/seal và hàng đợi hiện có. Bổ sung job nhập DOCX và lưu nguồn từng mục trích xuất theo tài liệu, phần tử và phiên bản parser. Giữ file chính thức tách khỏi file bài làm. Khung chấm ở PostgreSQL, file nguồn và ảnh bài ở kho riêng tư.
- NestJS giữ quyền truy cập, phiên bản, trạng thái duyệt và sổ điểm. Ở pilot, worker Node tiếp tục đọc và chấm bài như hiện tại. Đề xuất giao riêng job nhập DOCX cho worker Python sau khi parser và quy tắc phân quyền nhận job được nghiệm thu. Bước đọc bảng và công thức chạy trong parser, không phụ thuộc lượt gọi model. Service Python inference chỉ nhận đoạn rubric cần cấu trúc nếu phát sinh lượt gọi. Phần chấm khách quan chạy bằng code, phần tự luận nhận đúng câu trả lời và rubric đã duyệt.
- Kiểm tra loại DOCX và giới hạn cả dung lượng nén lẫn giải nén. Đọc nội dung tài liệu như dữ liệu, bỏ liên kết ngoài và nội dung có thể thực thi. Khóa chấm và tài liệu nguồn chỉ cho giáo viên có quyền lớp và môn. Áp dụng bước che thông tin định danh trước khi gửi ảnh bài học sinh cho model theo thiết kế pilot.

## 5. Ca nghiệm thu

| Ca | Kết quả mong đợi |
|---|---|
| DOCX mẫu có đề và hướng dẫn chấm | Nhập một lần, giữ đủ 12 đáp án, bảng điểm Đ/S, công thức câu 12 và tổng 10 điểm. Duyệt bản nháp từ đúng nguồn. |
| Mã 102 trong ảnh khác nội dung Word | Bài bị giữ, khung Word không được dùng tính điểm cho bài đó. |
| 120 ảnh của 40 học sinh với hai mã đề | Mỗi bài dùng đúng phiên bản đã duyệt. Bài thiếu trang hoặc thiếu file chờ riêng. Lượt gọi AI tự soạn đáp án bằng 0 cho những phiên bản đã nhập và duyệt đầy đủ. |
| Chỉ có đề đã khoanh và ảnh tự luận | Đọc được nguồn đề từ nhóm đủ trang, tạo một nháp cho mỗi phiên bản cần dùng. Câu thiếu giữ trạng thái chưa đánh giá. |
| Tải lại cùng file hoặc sửa biểu điểm | Tải lại dùng job và kết quả trích xuất phù hợp. Sửa biểu điểm tạo phiên bản mới, điểm đã chốt vẫn đọc được cho tới khi có lần chốt lại. |
