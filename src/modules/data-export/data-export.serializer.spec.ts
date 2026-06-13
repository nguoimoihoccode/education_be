import {
  buildCsvEntries,
  escapeCsvCell,
  serializeCsvZip,
  serializeJsonExport,
} from './data-export.serializer';
import JSZip from 'jszip';

describe('data-export serializer', () => {
  it.each(['=SUM(A1:A2)', '+cmd', '-2+3', '@import'])(
    'neutralizes spreadsheet formula input %s',
    (value) => {
      expect(escapeCsvCell(value)).toBe(`'${value}`);
    },
  );

  it('creates one CSV entry per selected dataset', () => {
    const entries = buildCsvEntries({
      profile: [{ email: 'a@example.com' }],
      quizzes: [{ score: 90 }],
    });

    expect(entries.map((entry) => entry.name)).toEqual([
      'profile.csv',
      'quizzes.csv',
    ]);
  });

  it('serializes the full payload as json bytes', () => {
    const payload = { profile: [{ email: 'a@example.com' }] };
    const buffer = serializeJsonExport(payload);

    expect(buffer.toString('utf8')).toBe(JSON.stringify(payload));
  });

  it('serializes csv datasets into a zip archive', async () => {
    const buffer = await serializeCsvZip({
      profile: [{ email: 'a@example.com' }],
      quizzes: [{ score: 90 }],
    });
    const zip = await JSZip.loadAsync(buffer);

    expect(Object.keys(zip.files).sort()).toEqual([
      'profile.csv',
      'quizzes.csv',
    ]);
    await expect(zip.file('profile.csv')!.async('string')).resolves.toContain(
      'a@example.com',
    );
  });
});
