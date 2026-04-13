# Document Import Module - Examples

## Testing the Module

### 1. Start the Server

```bash
cd stock/stock-be
npm run start:dev
```

### 2. Get JWT Token

First, authenticate to get a JWT token:

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your-email@example.com",
    "password": "your-password"
  }'
```

Save the `accessToken` from the response.

### 3. Test Document Import

#### Example 1: Upload PDF File

```bash
curl -X POST http://localhost:3000/document-import/upload \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -F "file=@/path/to/your/document.pdf" \
  -F "fileType=pdf" \
  -F "language=en" \
  -F "minKeywordLength=3" \
  -F "maxKeywords=50"
```

#### Example 2: Upload DOCX File

```bash
curl -X POST http://localhost:3000/document-import/upload \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -F "file=@/path/to/your/document.docx" \
  -F "fileType=docx" \
  -F "language=en"
```

#### Example 3: Upload JSON File

Create a sample JSON file (`data.json`):

```json
{
  "title": "Machine Learning Basics",
  "content": "Machine learning is a subset of artificial intelligence that focuses on building systems that can learn from data.",
  "topics": [
    "supervised learning",
    "unsupervised learning",
    "neural networks",
    "deep learning"
  ],
  "author": {
    "name": "John Doe",
    "affiliation": "AI Research Lab"
  }
}
```

Upload it:

```bash
curl -X POST http://localhost:3000/document-import/upload \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -F "file=@data.json" \
  -F "fileType=json" \
  -F "language=en"
```

#### Example 4: Upload with Phrases

```bash
curl -X POST http://localhost:3000/document-import/upload-with-phrases \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -F "file=@/path/to/your/document.pdf" \
  -F "fileType=pdf" \
  -F "language=en" \
  -F "maxKeywords=100"
```

#### Example 5: Vietnamese Language

```bash
curl -X POST http://localhost:3000/document-import/upload \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -F "file=@/path/to/your/document.pdf" \
  -F "fileType=pdf" \
  -F "language=vi" \
  -F "minKeywordLength=2"
```

### 4. Get Supported File Types

```bash
curl -X POST http://localhost:3000/document-import/supported-types \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## Sample Response

### Basic Upload Response

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "originalName": "research_paper.pdf",
  "fileType": "pdf",
  "fileSize": 1024000,
  "textLength": 5234,
  "keywordCount": 47,
  "keywords": [
    {
      "keyword": "machine learning",
      "frequency": 23,
      "context": "machine learning algorithms have revolutionized data analysis"
    },
    {
      "keyword": "neural networks",
      "frequency": 18,
      "context": "neural networks are inspired by biological brain structures"
    },
    {
      "keyword": "artificial intelligence",
      "frequency": 15,
      "context": "artificial intelligence continues to advance rapidly"
    }
  ],
  "processingTime": 1234,
  "processedAt": "2024-01-15T10:30:00Z"
}
```

### Upload with Phrases Response

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "originalName": "research_paper.pdf",
  "fileType": "pdf",
  "fileSize": 1024000,
  "textLength": 5234,
  "keywordCount": 47,
  "keywords": [...],
  "phrases": [
    "machine learning algorithms",
    "neural network architecture",
    "deep learning models",
    "artificial intelligence systems",
    "data analysis techniques"
  ],
  "processingTime": 1456,
  "processedAt": "2024-01-15T10:30:00Z"
}
```

## Using Swagger UI

1. Navigate to `http://localhost:3000/api`
2. Click "Authorize" and enter your JWT token
3. Expand the "Document Import" section
4. Try out the endpoints with the "Try it out" button

## Integration Examples

### React Frontend Example

```typescript
import React, { useState } from 'react';

const DocumentImport = () => {
  const [file, setFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState<string>('pdf');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setLoading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('fileType', fileType);
    formData.append('language', 'en');
    formData.append('minKeywordLength', '3');
    formData.append('maxKeywords', '100');

    try {
      const response = await fetch('http://localhost:3000/document-import/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: formData,
      });

      const data = await response.json();
      setResult(data);
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2>Document Import</h2>
      <input
        type="file"
        onChange={handleFileChange}
        accept=".pdf,.docx,.xlsx,.json,.txt"
      />
      <select value={fileType} onChange={(e) => setFileType(e.target.value)}>
        <option value="pdf">PDF</option>
        <option value="docx">DOCX</option>
        <option value="xlsx">XLSX</option>
        <option value="json">JSON</option>
        <option value="txt">TXT</option>
      </select>
      <button onClick={handleUpload} disabled={loading}>
        {loading ? 'Processing...' : 'Upload & Extract Keywords'}
      </button>

      {result && (
        <div>
          <h3>Results</h3>
          <p>File: {result.originalName}</p>
          <p>Text Length: {result.textLength} characters</p>
          <p>Keywords Found: {result.keywordCount}</p>
          <h4>Top Keywords:</h4>
          <ul>
            {result.keywords.slice(0, 10).map((kw: any, index: number) => (
              <li key={index}>
                <strong>{kw.keyword}</strong> (frequency: {kw.frequency})
                <p><em>Context: {kw.context}</em></p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default DocumentImport;
```

### Node.js Example

```javascript
const FormData = require('form-data');
const fs = require('fs');
const axios = require('axios');

async function importDocument(filePath, fileType, token) {
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));
  form.append('fileType', fileType);
  form.append('language', 'en');
  form.append('minKeywordLength', '3');
  form.append('maxKeywords', '100');

  try {
    const response = await axios.post(
      'http://localhost:3000/document-import/upload',
      form,
      {
        headers: {
          ...form.getHeaders(),
          'Authorization': `Bearer ${token}`,
        },
      }
    );

    console.log('Import successful!');
    console.log(`Extracted ${response.data.keywordCount} keywords`);
    console.log('Top keywords:', response.data.keywords.slice(0, 5));

    return response.data;
  } catch (error) {
    console.error('Import failed:', error.response?.data || error.message);
    throw error;
  }
}

// Usage
const token = 'your-jwt-token';
importDocument('./document.pdf', 'pdf', token);
```

## Tips for Best Results

1. **File Quality**: Use high-quality PDFs with selectable text (not scanned images)
2. **Language**: Specify the correct language for better stop-word filtering
3. **Keyword Length**: Adjust `minKeywordLength` based on your needs:
   - 2-3 for short, common terms
   - 4-5 for more specific terms
   - 6+ for very specific technical terms
4. **Max Keywords**: Limit results to the most relevant terms:
   - 20-50 for quick overviews
   - 100-200 for detailed analysis
   - 200-500 for comprehensive extraction

## Troubleshooting

### "Unsupported file type" error
- Check that the file extension matches the `fileType` parameter
- Ensure the file MIME type is correct

### "Failed to extract text" error
- Verify the file is not corrupted
- For PDFs, ensure they contain selectable text (not images)
- For DOC files, convert to DOCX format

### No keywords extracted
- Try reducing `minKeywordLength`
- Check if the document contains meaningful text
- Verify the language parameter is correct

### Slow processing
- Large files (>5MB) may take longer to process
- Consider reducing `maxKeywords` for faster results
