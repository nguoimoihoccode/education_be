# Document Import Module

Module cho phép người dùng import các tài liệu và trích xuất từ khóa từ nội dung của chúng.

## Tính năng

- Hỗ trợ nhiều định dạng tài liệu:
  - PDF (`.pdf`)
  - Microsoft Word (`.docx`)
  - Microsoft Excel (`.xlsx`, `.xls`)
  - JSON (`.json`)
  - Text (`.txt`)

- Trích xuất từ khóa thông minh:
  - Loại bỏ từ thông dụng (stop words)
  - Hỗ trợ tiếng Anh và tiếng Việt
  - Tùy chỉnh độ dài tối thiểu của từ khóa
  - Giới hạn số lượng từ khóa trả về

- Trích xuất cụm từ (phrases):
  - Tìm các cụm từ 2-3 từ phổ biến
  - Hỗ trợ phân tích ngữ cảnh

## Cài đặt

Module đã được cài đặt sẵn với các dependencies sau:

```bash
npm install pdf-parse mammoth xlsx
npm install -D @types/pdf-parse
```

## API Endpoints

### 1. Upload Document và Extract Keywords

**Endpoint:** `POST /document-import/upload`

**Authentication:** Bearer JWT token required

**Request:**
- Content-Type: `multipart/form-data`
- Body:
  - `file`: File tài liệu (required)
  - `fileType`: Loại file (required) - enum: `pdf`, `docx`, `doc`, `xlsx`, `xls`, `json`, `txt`
  - `language`: Mã ngôn ngữ (optional) - ví dụ: `en`, `vi`, `ja`
  - `minKeywordLength`: Độ dài tối thiểu của từ khóa (optional, default: 3)
  - `maxKeywords`: Số lượng từ khóa tối đa (optional, default: 100)

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "originalName": "document.pdf",
  "fileType": "pdf",
  "fileSize": 1024000,
  "textLength": 5000,
  "keywordCount": 45,
  "keywords": [
    {
      "keyword": "artificial intelligence",
      "frequency": 15,
      "context": "artificial intelligence is transforming modern technology"
    }
  ],
  "processingTime": 1250,
  "processedAt": "2024-01-15T10:30:00Z"
}
```

### 2. Upload Document với Phrases

**Endpoint:** `POST /document-import/upload-with-phrases`

**Authentication:** Bearer JWT token required

**Request:** Giống endpoint upload, nhưng trả về thêm `phrases`

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "originalName": "document.pdf",
  "fileType": "pdf",
  "fileSize": 1024000,
  "textLength": 5000,
  "keywordCount": 45,
  "keywords": [...],
  "phrases": [
    "machine learning",
    "deep learning",
    "neural networks"
  ],
  "processingTime": 1250,
  "processedAt": "2024-01-15T10:30:00Z"
}
```

### 3. Get Supported File Types

**Endpoint:** `POST /document-import/supported-types`

**Authentication:** Bearer JWT token required

**Response:**
```json
[
  "pdf",
  "docx",
  "doc",
  "xlsx",
  "xls",
  "json",
  "txt"
]
```

## Ví dụ sử dụng

### Sử dụng cURL

```bash
# Upload PDF document
curl -X POST http://localhost:3000/document-import/upload \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@/path/to/document.pdf" \
  -F "fileType=pdf" \
  -F "language=en" \
  -F "minKeywordLength=3" \
  -F "maxKeywords=50"

# Upload JSON file
curl -X POST http://localhost:3000/document-import/upload \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@/path/to/data.json" \
  -F "fileType=json" \
  -F "language=vi"

# Upload with phrases
curl -X POST http://localhost:3000/document-import/upload-with-phrases \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@/path/to/document.docx" \
  -F "fileType=docx" \
  -F "language=en"
```

### Sử dụng JavaScript/TypeScript

```typescript
const formData = new FormData();
formData.append('file', fileInput.files[0]);
formData.append('fileType', 'pdf');
formData.append('language', 'en');
formData.append('minKeywordLength', '3');
formData.append('maxKeywords', '100');

const response = await fetch('http://localhost:3000/document-import/upload', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
  },
  body: formData,
});

const result = await response.json();
console.log('Extracted keywords:', result.keywords);
```

## Giới hạn

- **Kích thước file tối đa:** 10MB
- **Số lượng từ khóa tối đa:** 500 (có thể tùy chỉnh)
- **Độ dài từ khóa tối thiểu:** 1 ký tự (có thể tùy chỉnh)

## Xử lý lỗi

Module trả về các lỗi sau:

- `400 Bad Request`: File không hợp lệ, tham số thiếu, hoặc định dạng không được hỗ trợ
- `401 Unauthorized`: Token JWT không hợp lệ hoặc thiếu
- `429 Too Many Requests`: Quá nhiều request (rate limiting)

## Lưu ý

- File `.doc` (Microsoft Word cũ) không được hỗ trợ. Hãy chuyển đổi sang `.docx`
- JSON files có thể là object hoặc array. Module sẽ trích xuất text từ tất cả các string values
- Excel files trích xuất text từ tất cả các sheets
- Stop words được lọc tự động cho tiếng Anh và tiếng Việt

## Swagger Documentation

Swagger UI có sẵn tại `/api` khi server đang chạy. Bạn có thể test các endpoint trực tiếp từ giao diện Swagger.

## Cấu trúc Module

```
document-import/
├── document-import.module.ts          # Module definition
├── document-import.controller.ts      # REST API endpoints
├── document-import.service.ts         # Main business logic
├── document-text-extraction.service.ts # Text extraction from files
├── keyword-extraction.service.ts      # Keyword extraction logic
└── dto/
    ├── upload-document.dto.ts         # Request DTOs
    └── document-import-response.dto.ts # Response DTOs
```
