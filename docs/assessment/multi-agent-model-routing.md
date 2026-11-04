# Pipeline nhiều agent/model và kiểm soát chi phí — Assessment v1.1

Ngày kiểm tra nguồn/model/giá: 2026-11-03. Đây là mở rộng của [thiết kế tổng thể](../superpowers/specs/2026-11-03-ai-assisted-assessment-design.md), chưa phải pipeline đã triển khai hoặc đã benchmark.

## 1. Quyết định kiến trúc

Agent là một nhiệm vụ có input/output và quyền rõ ràng; không nhất thiết là một tiến trình hoặc một microservice. NestJS điều phối đồ thị công việc, chọn model theo cấu hình và kiểm tra mọi đầu ra.

Một container worker trên VPS có thể thực thi nhiều loại agent, gọi nhiều provider qua API. Không tải một model local cho mỗi agent. Không cần thêm CrewAI/LangGraph hoặc broker khác để thực hiện luồng cố định này.

So sánh ba cách:

| Cách | Lợi ích | Đánh đổi |
|---|---|---|
| Một model làm toàn bộ mỗi bài | Ít tích hợp ban đầu | Khó sửa riêng bước đọc/chấm; dễ gửi lại ảnh và rubric nhiều lần. |
| Ba model luôn chạy nối tiếp | Rõ vai trò | Phí và latency của cả ba phát sinh cả khi code đã xử lý được. |
| DAG có code, model theo vai trò và escalation có điều kiện | Tái sử dụng kết quả, chỉ trả phí cho phần cần model | Cần router, schema, provenance và budget. |

Chọn cách thứ ba. Mục tiêu là chi phí thấp nhất **trong giới hạn chất lượng và thời gian giáo viên kiểm tra**, không mặc định càng nhiều agent càng tốt.

## 2. Các agent và quyền

| Agent | Việc làm | Thực thi | Không được làm |
|---|---|---|---|
| PagePreparer | Chọn tờ chính, xoay, crop, chất lượng ảnh | Code trong worker VPS; layout model khi cần | Tạo lại nét chữ hoặc lấy giấy nền làm bài |
| ImageReader | Đọc đề, dấu chọn, chữ viết, bảng, hình thành observations | Model vision cấu hình riêng | Nhận đáp án đúng hoặc quyết định điểm |
| AnswerAssembler | Ghép câu/trang, chuẩn hóa schema và liên kết regions | Code trước; model text nhỏ chỉ khi mơ hồ | Sửa câu trả lời cho giống đáp án |
| KeyBuilder | Soạn draft key/rubric dùng chung cho mã đề | Model text reasoning; vision branch nếu đề có hình cần hiểu | Lấy bài học sinh làm đáp án chuẩn hoặc tự approve |
| ObjectiveScorer | So đáp án MC/Đ-S, tính units | Code | Gọi model để cộng điểm |
| TextGrader | Đề xuất điểm từng tiêu chí văn bản/bảng | Model text; crop ảnh khi cần đối chiếu | Cộng tổng chính thức hoặc đổi rubric |
| DrawingGrader | Quan sát và chấm hình theo rubric | Model vision riêng | Đo mm từ pixel ảnh chưa hiệu chuẩn |
| ResultValidator | Schema, ID, evidence, giới hạn, tổng, stale checks | Code luôn chạy | Tin riêng self-confidence của model |
| IndependentAuditor | Chấm độc lập câu rủi ro hoặc mẫu kiểm tra | Model khác đã qua benchmark | Tự chốt điểm hoặc lấy trung bình hai điểm mâu thuẫn |

Mỗi agent chỉ nhận dữ liệu tối thiểu. Reader/Assembler không nhận key. Auditor chấm mù, không nhận điểm đề xuất đầu tiên trước khi trả kết quả độc lập. Cùng một lỗi OCR có thể ảnh hưởng cả hai grader; bất đồng về đọc phải quay lại ảnh, không bỏ phiếu đa số.

## 3. Đồ thị công việc

~~~mermaid
flowchart TD
  INPUT["Ảnh/PDF đã niêm phong"] --> PREP["PagePreparer: code"]
  PREP --> READ["ImageReader: vision profile"]
  READ --> ASSEMBLE["AnswerAssembler: code trước"]
  ASSEMBLE --> CHECK{"Ghép đủ và hợp lệ?"}
  CHECK -->|Mơ hồ| SMALL["Model text nhỏ cho đúng vùng"]
  SMALL --> VALIDATE_READ["Kiểm tra bằng chứng / giới hạn"]
  CHECK -->|Đủ| ROUTE{"Loại câu"}
  VALIDATE_READ --> ROUTE
  ROUTE -->|MC hoặc Đ/S| RULE["ObjectiveScorer: code"]
  ROUTE -->|Văn bản / bảng| TEXT["TextGrader: profile tiết kiệm"]
  ROUTE -->|Hình| DRAW["DrawingGrader: vision profile"]
  RULE --> VERIFY["ResultValidator: code"]
  TEXT --> VERIFY
  DRAW --> VERIFY
  VERIFY --> RISK{"Rủi ro hoặc mẫu audit?"}
  RISK -->|Có| AUDIT["IndependentAuditor / đọc lại có giới hạn"]
  RISK -->|Không| REVIEW["Kết quả cho giáo viên"]
  AUDIT --> REVIEW
  REVIEW --> FINAL["Giáo viên chốt qua VPS"]
~~~

KeyBuilder chạy một lần cho mỗi phiên bản đề/rubric, song song khi có đủ vùng đề. Grader nhận đúng version; kết quả dùng rubric draft chỉ là nháp và không được công bố.

Một đợt có thể có hai hoặc nhiều mã đề. Coordinator nhóm theo assessmentId + examVersionId; mỗi nhóm dùng key/rubric tương ứng, không gọi KeyBuilder lại cho từng học sinh. Chỉ tái sử dụng nội dung/rubric giữa hai mã sau khi đã xác minh ánh xạ câu và lựa chọn; không mặc định cùng số câu là cùng đáp án.

Các lượt đọc lại là job mới có fingerprint/attempt budget rõ. Không có vòng agent tự gọi nhau vô hạn. Một vòng escalation mỗi câu, tối đa một independent audit; vẫn nằm trong cap tổng 24 paid attempts/bài/revision của thiết kế cơ sở.

## 4. Profile gợi ý để benchmark

Các tên dưới đây là ứng viên, chưa có bằng chứng đọc/chấm đạt gate trên bài thật:

| Vai trò | Primary minh họa | Khi cần nâng cấp/đổi |
|---|---|---|
| Đọc ảnh theo yêu cầu người dùng | gemini-2.5-flash | gemini-3.5-flash-lite sau capability/quality gate; vùng khó có thể dùng gemini-3.8-flash |
| Chuẩn hóa mơ hồ | gemini-2.5-flash-lite | deepseek-flash text profile nếu project không có quyền 2.5 |
| Soạn key text một lần | deepseek-v4-pro | Vision profile cho câu đề có hình |
| Chấm text/bảng | deepseek-flash | deepseek-v4-pro hoặc model khác đạt benchmark |
| Chấm hình / audit khó | gemini-3.8-flash | Dừng và yêu cầu giáo viên khi vẫn thiếu bằng chứng |

Profile và agent là hai cấu hình riêng: có thể thay TextGrader sang bất kỳ provider được hỗ trợ mà không sửa workflow. Không bắt buộc ba bước phải dùng ba model khác nhau nếu cùng model rẻ hơn và đạt chất lượng tương đương.

### Lưu ý quan trọng về Gemini 2.5 Flash

Trang hiện hành của Google thông báo gemini-2.5-flash tự route sang gemini-3.5-flash-lite từ **01/12/2026**; quyền dùng dòng 2.5 còn phụ thuộc project đã sử dụng trước đó. Vì vậy profile 2.5 Flash trong ví dụ có allowThroughDate=2026-11-30. Khi hết ngày, chỉ dùng fallback đã được kiểm tra; nếu chưa có thì dừng rõ ràng. Không chấp nhận thay model âm thầm. [Nguồn deprecations](https://aistudio.google.com/docs/deprecations#gemini-2.5-flash-models).

Model-requested/model-reported và functional profile hash được lưu từng call. Alias không phải cam kết pin được trọng số. Nếu provider đổi model sau alias mà không báo, regression corpus và kiểm tra lịch model vẫn cần thiết.

## 5. Router có phiên bản

Hợp đồng: [schema](contracts/agent-routing.schema.json) và [ví dụ cấu hình](contracts/agent-routing.example.json).

v1.1 dùng ASSESSMENT_ROUTING_CONFIG_PATH trỏ JSON chỉ đọc tại server. Các biến READ/GRADE/DRAWING_PROFILE cũ chỉ là nguồn credentials/profile khi chuyển tiếp; file routing là nguồn quyết định agent/model khi đã cấu hình. Không lấy tên model trực tiếp từ request giáo viên.

Mỗi job pin routingVersion + routingPolicyHash. Đổi cấu hình chỉ ảnh hưởng job mới hoặc một lệnh reprocess có audit. Các artifact phải giữ phiên bản để job đang chạy không cần đọc một file config đã bị thay.

Các thành phần:

- ProviderRegistry: adapter, capabilities, endpoint allowlist và credential reference.
- AgentRegistry: vai trò, schema input/output, tools bị cấm hoặc cho phép.
- ModelRouter: chọn profile trong các profile đạt gate và phù hợp modality, deadline, lifecycle.
- CostEstimator: reserve chi phí từ payload/token estimate và pricing snapshot.
- QualityGate: kiểm tra cấu trúc, bằng chứng, kết quả benchmark và tín hiệu rủi ro.
- WorkflowCoordinator: dependency, lease, fingerprint, retries và đường về teacher review.

Các cấu hình trong ví dụ ở deploymentState=design_only và qualityGate=benchmark_required. JSON hợp lệ không đồng nghĩa được bật chấm production.

## 6. Hợp đồng giữa các agent

Mỗi artifact envelope có schemaVersion, assessmentId, submissionId nếu có, schoolId do server cấp, inputRevision, routingVersion, producerAgent, inferenceProfileHash, sourceArtifactIds, payloadHash và payload.

Payload Reader: page/region ID được cung cấp, text/marks/cells/observations và ambiguityCodes. Payload Assembler: questionKey → answerRevision references và trạng thái đọc. Grader dùng [grading-output.schema.json](contracts/grading-output.schema.json).

Không truyền lịch sử hội thoại của toàn bộ pipeline. Artifact chứa nội dung chuẩn được lưu riêng; mỗi agent chỉ lấy những câu, rubric và crops cần thiết. Dữ liệu vùng nguồn được cấp bởi hệ thống, không chấp nhận regionId do model bịa.

Schema Gemini chỉ hỗ trợ một tập JSON Schema nhất định. Adapter hạ schema canonical thành schema request được provider hỗ trợ, rồi luôn validate lại bằng schema canonical phía server. Không tắt validator vì provider đã trả structured output. [Tài liệu structured output](https://aistudio.google.com/docs/structured-output).

## 7. Tối ưu chi phí có kiểm soát

1. **Chuẩn hóa bằng code trước.** Không tạo một call text chỉ để đổi tên field hoặc cộng điểm.
2. **Đọc đề một lần/mã đề.** Key/rubric và nội dung đề được dùng chung, phần lựa chọn của mỗi học sinh vẫn đọc riêng.
3. **Một lần đọc thường, crop lại khi khó.** Không gửi toàn bộ năm ảnh cho mọi agent.
4. **Giữ bảng và hình trong representation phù hợp.** Không ép grader text nhận ảnh khi không cần, không bỏ ảnh khi câu cần hình.
5. **Tối ưu output.** Chỉ xuất ID, observations, điểm tiêu chí và lý do ngắn; không yêu cầu suy luận dài hoặc chép lại đề trong mọi response.
6. **Thinking theo vai trò.** Đọc ảnh/chuẩn hóa có thể tắt thinking khi model hỗ trợ và benchmark đạt; chấm/key có budget rõ. Tham số native được adapter dịch đúng model, không gửi thinkingBudget của Gemini sang provider khác.
7. **Audit có chọn lọc.** Code validation cho mọi câu, model audit cho câu rủi ro và mẫu 5% ban đầu. Mẫu được chọn theo seed cố định để retry không chọn lại; bài đã chọn phải xong audit trước khi chốt.
8. **Cache artifact.** Key có tenant, dữ liệu nguồn/bối cảnh, schema, prompt và inferenceProfileHash. Không dùng điểm của học sinh khác hoặc cache khác tenant. Khi chỉ giá thay đổi, không cần đọc lại ảnh.
9. **Tách các hash.** inferenceProfileHash chỉ gồm yếu tố ảnh hưởng inference; billingProfileHash giữ giá; routingPolicyHash giữ cách điều phối. Đổi giá không vô hiệu cache hợp lệ, đổi prompt/model/crop thì có.
10. **Batch đúng API khi không gấp.** BullMQ hoặc gom nhiều ảnh vào request không tự tạo giảm giá. Chế độ qua provider Batch API là lựa chọn riêng, có deadline, recovery và chi phí riêng.

Google nêu Batch API giảm 50% so với standard và thời gian hoàn thành mục tiêu 24 giờ; chỉ dùng khi giáo viên chọn chế độ không cần ngay. Không hứa hoàn thành ngay hoặc tự chuyển sang standard tốn thêm phí khi sắp hết hạn. Không submit batch bằng profile cũ nếu deadline có thể vượt mốc model/giá đã công bố; chọn profile đã qua gate hoặc pause. [Nguồn Batch API](https://aistudio.google.com/docs/batch-api).

Provider context caching có phí lưu cache và điều kiện token; mặc định tắt cho tới khi đo được điểm hòa vốn. Application artifact cache không phải provider context cache.

## 8. Giá và cách tính

Snapshot tham khảo standard paid, USD / 1 triệu tokens, ngày 2026-11-03:

| Model | Input không cache | Output gồm phần thinking được tính phí |
|---|---:|---:|
| Gemini 2.5 Flash | 0.30 | 2.50 |
| Gemini 2.5 Flash-Lite | 0.10 | 0.40 |
| Gemini 3.5 Flash-Lite | 0.30 | 2.50 |
| Gemini 3.8 Flash | 0.75 | 3.75 |
| deepseek-flash, mức peak dùng để reserve | 0.30 | 1.20 |
| deepseek-v4-pro, mức peak dùng để reserve | 1.32 | 3.96 |

Google có mốc đổi giá một số model; 3.8 Flash trong snapshot chỉ dùng giá này tới 31/12/2026. DeepSeek có giờ peak/off-peak; reserve theo mức peak, không giả định cache hit hoặc giờ giảm giá. Đây không phải cam kết giá tương lai. Nguồn: [Google pricing](https://aistudio.google.com/docs/pricing), [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing/).

Adapter chuẩn hóa billable input/output/thinking/cache để không cộng thinking hai lần. Giá trị chưa biết để null và giữ reservation bảo thủ; token estimate không được gắn nhãn actual cost.

~~~text
chi phí một call =
  noncachedInput * rateInput
  + cachedInput * rateCached
  + billableOutputIncludingThinking * rateOutput
  + công cụ/cache storage nếu thực sự dùng

chi phí một bài =
  reader + assembler thực sự được gọi + grader + hình
  + audit/escalation/retries
  + phần key/rubric chung phân bổ theo đợt
~~~

Trong code dùng integer micros và phép làm tròn bảo thủ; công thức trên bỏ hệ số chia 1 triệu để dễ đọc.

[cost-scenarios.example.json](contracts/cost-scenarios.example.json) minh họa token giả định cho một lớp 35 bài. Nó không phải báo giá hoặc kết quả benchmark. Không đưa free tier, cache hit chưa đo hay thinking “miễn phí” vào dự toán production.

Không khẳng định cấu hình nhiều agent rẻ nhất thị trường. So sánh với baseline cùng chất lượng, tính cả chi phí sửa của giáo viên và tỷ lệ abstention.

## 9. Chính sách fallback và giới hạn

- Retry lỗi mạng/provider không đồng nghĩa đổi model chấm.
- Model không đủ modality thì router không gọi; không gửi hình cho profile text-only.
- Output sai schema: tối đa một repair trong tổng retry/call budget; không trả nguyên cả lớp đi làm lại.
- Read uncertainty: một lần đọc lại vùng khó; còn mơ hồ → teacher.
- Grade disagreement: lưu cả hai bản và flag; không tự lấy điểm cao hơn hoặc trung bình.
- Model hết hạn/quota: chỉ fallback đã qua gate, đúng allowlist của trường và trong ngân sách. Không có fallback phù hợp → paused, không mất kết quả đã có.
- Agent không có quyền đổi key, tự cấp ngân sách, gọi web search, chạy shell hoặc công bố điểm.

Mỗi profile trong ví dụ cap input 32768 tokens và output 4096 tokens; coordinator kiểm tra giới hạn theo modality trước khi cấp permit, split job khi cần. Audit mẫu mặc định chọn 5% bài không có cảnh báo và một câu tự luận của mỗi bài được chọn; không mô tả việc này như audit toàn bộ câu. Sampling seed gắn assessment/học sinh/policy, giữ ổn định khi retry hoặc upload lại để tránh né mẫu.

Mặc định ví dụ: cap 0.05 USD/bài/revision và 10 USD/ngày của tenant để minh họa cấu hình; trường phải chọn mức phù hợp trước pilot. Giá trị này không phải chi phí thực tế dự đoán.

## 10. Triển khai VPS v1.2

VPS giữ web/API, DB, job state, routing/budget, publication và audit, đồng thời chạy container assessment-worker riêng cho PagePreparer và executor các agent. Worker gọi provider qua API, không giữ model nặng. Mac không tham gia xử lý hoặc lưu cache bài.

Worker kết nối PostgreSQL và assessment-redis qua mạng Docker nội bộ, dùng cùng lease/fencing và revision validation của pipeline. Không dựng remote coordinator endpoints hoặc worker JWT/registry trong bản này. Worker không tự approve rubric/finalize. File routing có execution.mode = vps_colocated.

Bắt đầu một job và tối đa hai provider calls đồng thời; cache worker cap 2 GiB. Admission yêu cầu volume tạm còn ít nhất 15 GiB, pause dưới 10 GiB. Đây là chính sách pilot đề xuất, cần kiểm tra dung lượng/RAM/CPU VPS trước khi bật. Lưu file lâu dài trong private object storage bên ngoài VPS; xem [vps-deployment.md](vps-deployment.md).

## 11. Kiểm tra bổ sung

- M01: Đổi reader, giữ grader; schema, evidence và provenance vẫn đúng.
- M02: Assembler chạy được bằng code → không phát sinh model call.
- M03: MC/Đ-S chỉ gọi reader và rule scorer, không text grader vô ích.
- M04: Reader/Assembler không nhận key, KeyBuilder không nhận bài học sinh.
- M05: Hai model chấm mâu thuẫn → flag, không tự chốt.
- M06: Đổi giá không đọc lại ảnh; đổi prompt/model làm invalidate inference cache.
- M07: Profile hết hạn 2.5 Flash → fallback đã duyệt hoặc pause trước call.
- M08: Billable thinking được đếm một lần, cả trong retry/unknown calls.
- M09: Cùng call budget ở mọi agent; không nhân cap 24 cho từng agent.
- M10: Mẫu audit ổn định qua retry và chặn chốt khi audit chưa xong.
- M11: Chế độ Batch được submit thật qua Batch API; không gắn giảm giá cho BullMQ.
- M12: Không route dữ liệu sang provider ngoài tenant allowlist vì rẻ hơn.

Chất lượng, tổng chi phí và thời gian giáo viên phải được đo lại trên holdout trước khi đổi routing mặc định.
