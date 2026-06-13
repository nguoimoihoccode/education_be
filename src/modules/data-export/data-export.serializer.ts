import JSZip from 'jszip';

export type ExportDataset = Record<string, Array<Record<string, unknown>>>;

export type CsvEntry = {
  name: string;
  content: string;
};

export function escapeCsvCell(value: unknown): string {
  const text = stringifyCell(value);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

export function buildCsvEntries(data: ExportDataset): CsvEntry[] {
  return Object.entries(data).map(([name, rows]) => ({
    name: `${name}.csv`,
    content: buildCsvContent(rows),
  }));
}

export function serializeJsonExport(data: ExportDataset): Buffer {
  return Buffer.from(JSON.stringify(data), 'utf8');
}

export async function serializeCsvZip(data: ExportDataset): Promise<Buffer> {
  const zip = new JSZip();
  for (const entry of buildCsvEntries(data)) {
    zip.file(entry.name, entry.content);
  }

  return Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }));
}

function buildCsvContent(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) {
    return '';
  }

  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const lines = [headers.join(',')];

  for (const row of rows) {
    lines.push(
      headers
        .map((header) => escapeCsvCell(row[header]))
        .map(quoteCsvCell)
        .join(','),
    );
  }

  return lines.join('\n');
}

function stringifyCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return `${value}`;
  }

  if (typeof value === 'symbol') {
    return value.toString();
  }

  return '';
}

function quoteCsvCell(value: string): string {
  const escaped = value.replace(/"/g, '""');
  return /[",\n\r]/.test(escaped) ? `"${escaped}"` : escaped;
}
