import { renderReport } from './export';
import * as XLSX from 'xlsx';
describe('published snapshot export', () => {
  it('exports fixed publication scores instead of current mutable grades', async () => {
    const bytes = await renderReport('xlsx', {
      title: 'Exam',
      requestedAt: '2026-11-04T00:00:00Z',
      publications: [
        {
          publicationId: 'p',
          revision: 2,
          studentId: 7,
          normalizedScoreTenths: 73,
          reviewRevisionId: 'r',
          contextSnapshot: {},
        },
      ],
    });
    const book = XLSX.read(bytes, { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]]);
    expect(rows).toEqual([
      expect.objectContaining({
        'Student ID': 7,
        Score: 7.3,
        'Publication revision': 2,
      }),
    ]);
  });
  it('refuses a missing PDF font instead of corrupting Vietnamese text', async () => {
    await expect(
      renderReport(
        'pdf',
        { title: 'Đề thi', requestedAt: 'now', publications: [] },
        '/nonexistent/font.ttf',
      ),
    ).rejects.toThrow('pdf_font_unavailable');
  });
});
