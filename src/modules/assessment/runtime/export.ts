import * as XLSX from 'xlsx';
import PDFDocument from 'pdfkit';
import { access } from 'node:fs/promises';
export interface ReportSnapshot {
  title: string;
  requestedAt: string;
  publications: {
    publicationId: string;
    revision: number;
    studentId: number;
    studentName?: string;
    reviewRevisionId: string;
    normalizedScoreTenths: number;
    contextSnapshot: Record<string, unknown>;
  }[];
}
export async function renderReport(
  format: string,
  snapshot: ReportSnapshot,
  fontPath = process.env.ASSESSMENT_PDF_FONT_PATH ||
    '/usr/share/fonts/ttf-dejavu/DejaVuSans.ttf',
): Promise<Buffer> {
  const rows = snapshot.publications.map((p) => ({
    'Student ID': p.studentId,
    'Student name': p.studentName || '',
    Score: p.normalizedScoreTenths / 10,
    'Publication revision': p.revision,
    'Publication ID': p.publicationId,
    'Review ID': p.reviewRevisionId,
    'Requested at': snapshot.requestedAt,
  }));
  if (format === 'xlsx') {
    const book = XLSX.utils.book_new();
    book.Props = { Title: snapshot.title };
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.json_to_sheet(rows),
      'Published scores',
    );
    return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }
  if (format !== 'pdf') throw new Error('export_format_invalid');
  try {
    await access(fontPath);
  } catch {
    throw new Error('pdf_font_unavailable');
  }
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({
      size: 'A4',
      margin: 40,
      info: { Title: snapshot.title },
    });
    const chunks: Buffer[] = [];
    pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);
    pdf
      .font(fontPath)
      .fontSize(16)
      .text(snapshot.title)
      .fontSize(9)
      .text(`Snapshot: ${snapshot.requestedAt}`)
      .moveDown();
    for (const row of rows) {
      if (pdf.y > 730) pdf.addPage();
      pdf
        .fontSize(10)
        .text(
          `${row['Student name']} (ID: ${row['Student ID']})     Score: ${row.Score}/10     Revision: ${row['Publication revision']}`,
        )
        .fontSize(7)
        .text(
          `Publication: ${row['Publication ID']} / Review: ${row['Review ID']}`,
        )
        .moveDown();
    }
    pdf.end();
  });
}
