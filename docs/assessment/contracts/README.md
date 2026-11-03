# Hợp đồng máy đọc được cho thiết kế Assessment

- exam-template.schema.json: JSON Schema draft-07 cho nội dung ExamVersion.
- technology-8-template.example.json: cấu trúc draft của đề mã 102 trong ảnh người dùng, chưa có đáp án được duyệt.
- grading-output.schema.json: đầu ra rubric/drawing grader; không cho model tự khai điểm cuối hoặc trạng thái approved.
- grading-output.synthetic.example.json: điểm giả lập để kiểm tra contract, không phải kết quả chấm ảnh người dùng.
- sample-case-manifest.json: vai trò năm ảnh và các kiểm tra kỳ vọng; không chứa ảnh hoặc tên học sinh.
- agent-routing.schema.json và agent-routing.example.json: cấu hình agent/model v1.1 ở trạng thái design_only; quality gates chưa được xác nhận.
- cost-scenarios.example.json: phép tính từ token giả định, không phải benchmark hoặc báo giá thực.

Schema kiểm tra cấu trúc. Domain validation vẫn phải kiểm tra tổng điểm, ID duy nhất, key thuộc options, criterion max, evidence cùng bài/tenant, vùng nền, trạng thái rubric và manifest hiện hành.

Fixture đề có answerKey/scoringPolicy null hoặc criteria rỗng là hợp lệ cho draft. Approve phải từ chối cho tới khi có đầy đủ đáp án, policy và rubric được giáo viên xác nhận. Không được dùng fixture này làm đáp án chính thức.

Các câu được diễn đạt lại theo ảnh để minh họa cấu trúc, phần/ý và điểm; không dùng như ground truth phiên âm OCR. Phần không rõ hoặc cần đối chiếu giữ cảnh báo trong quá trình đọc thật. Tài liệu này không tuyên bố đã chạy OCR hoặc đã xác minh đáp án môn học.

Để kiểm tra cấu trúc tại workspace hiện tại, có thể dùng Ajv draft-07 đã có trong dev dependencies bắc cầu của ESLint. Khi triển khai runtime, khai báo validator là dependency trực tiếp và pin version phù hợp; không dựa vào sự hiện diện bắc cầu của tooling.
