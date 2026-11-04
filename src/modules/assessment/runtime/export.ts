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
// The DejaVu face lives in a different directory on Debian and Alpine; the
// image that serves a Vietnamese report embeds its own copy of it.
const DEFAULT_FONT_CANDIDATES = [
  '/usr/share/fonts/ttf-dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/dejavu/DejaVuSans.ttf',
];
async function resolveFontPath(explicit?: string): Promise<string> {
  const configured = explicit || process.env.ASSESSMENT_PDF_FONT_PATH;
  if (configured) {
    try {
      await access(configured);
    } catch {
      throw new Error('pdf_font_unavailable');
    }
    return configured;
  }
  for (const candidate of DEFAULT_FONT_CANDIDATES) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // try the next well-known location
    }
  }
  throw new Error('pdf_font_unavailable');
}
export async function renderReport(
  format: string,
  snapshot: ReportSnapshot,
  fontPath?: string,
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
  const pdfFont = await resolveFontPath(fontPath);
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
      .font(pdfFont)
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
