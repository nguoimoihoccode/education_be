import { execFile } from 'node:child_process';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { checkWorkspaceAdmission, prepareDocument } from './preparation';

jest.mock('node:child_process', () => ({ execFile: jest.fn() }));
const run = execFile as unknown as jest.Mock;

describe('bounded private document preparation', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'assessment-test-'));
    run.mockReset();
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('resizes genuine images into bounded JPEG pages without retaining files', async () => {
    const image = await sharp({
      create: { width: 3000, height: 100, channels: 3, background: 'white' },
    })
      .png()
      .toBuffer();
    const result = await prepareDocument(image, 'image/png', root);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      mime: 'image/jpeg',
      width: 2048,
      height: 68,
      pageNumber: 1,
    });
    expect((await sharp(result[0].bytes).metadata()).format).toBe('jpeg');
    expect(await readdir(root)).toEqual([]);
  });

  it('rejects claimed MIME mismatches, over-limit pixels and workspace overflow', async () => {
    const image = await sharp({
      create: { width: 20, height: 20, channels: 3, background: 'white' },
    })
      .png()
      .toBuffer();
    await expect(prepareDocument(image, 'image/jpeg', root)).rejects.toThrow(
      'document_mime_mismatch',
    );
    await expect(
      prepareDocument(image, 'image/png', root, { maxPixels: 100 }),
    ).rejects.toThrow();
    await expect(
      prepareDocument(image, 'image/png', root, { maxWorkspaceBytes: 1 }),
    ).rejects.toThrow('workspace_limit');
    expect(await readdir(root)).toEqual([]);
  });

  it.each(['Pages: 31\nEncrypted: no', 'Pages: 1\nEncrypted: yes'])(
    'rejects unsafe PDF metadata before rendering: %s',
    async (metadata) => {
      run.mockImplementation((_bin, _args, _options, callback) =>
        callback(null, metadata, ''),
      );
      await expect(
        prepareDocument(Buffer.from('%PDF-1.7\n'), 'application/pdf', root),
      ).rejects.toThrow();
      expect(run.mock.calls).toHaveLength(1);
      expect(await readdir(root)).toEqual([]);
    },
  );

  it('renders one PDF page at a time with bounded subprocesses and cleans up', async () => {
    const jpg = await sharp({
      create: { width: 20, height: 30, channels: 3, background: 'white' },
    })
      .jpeg()
      .toBuffer();
    run.mockImplementation((bin, args, options, callback) => {
      expect(options).toMatchObject({ timeout: 30000, maxBuffer: 1024 * 1024 });
      expect(options.shell).toBe(false);
      if (bin === 'pdfinfo')
        callback(
          null,
          'Pages: 2\nEncrypted: no\nPage 1 size: 600 x 800 pts\nPage 2 size: 600 x 800 pts',
          '',
        );
      else
        void writeFile(`${args[args.length - 1]}.jpg`, jpg).then(
          () => callback(null, '', ''),
          callback,
        );
    });
    const pages = await prepareDocument(
      Buffer.from('%PDF-1.7\n'),
      'application/pdf',
      root,
    );
    expect(pages.map((page) => page.pageNumber)).toEqual([1, 2]);
    const renders = run.mock.calls.filter(([bin]) => bin === 'pdftoppm');
    expect(renders).toHaveLength(2);
    expect(renders[0][1]).toEqual(
      expect.arrayContaining([
        '-f',
        '1',
        '-l',
        '1',
        '-singlefile',
        '-scale-to',
        '2048',
      ]),
    );
    expect(await readdir(root)).toEqual([]);
  });

  it('cleans up after subprocess timeout and refuses oversized PDF pages before render', async () => {
    run.mockImplementation((_bin, _args, _options, callback) =>
      callback(Object.assign(new Error('timeout'), { killed: true }), '', ''),
    );
    await expect(
      prepareDocument(Buffer.from('%PDF-1.7\n'), 'application/pdf', root),
    ).rejects.toThrow('document_process_failed');
    expect(await readdir(root)).toEqual([]);
    run.mockImplementation((_bin, _args, _options, callback) =>
      callback(
        null,
        'Pages: 1\nEncrypted: no\nPage 1 size: 100000 x 100000 pts',
        '',
      ),
    );
    await expect(
      prepareDocument(Buffer.from('%PDF-1.7\n'), 'application/pdf', root),
    ).rejects.toThrow('document_pixel_limit');
    expect(run.mock.calls.some(([bin]) => bin === 'pdftoppm')).toBe(false);
  });

  it('checks actual filesystem admission and rejects relative roots or unsafe limits', async () => {
    await expect(checkWorkspaceAdmission(root, 0)).resolves.toBeUndefined();
    await expect(
      checkWorkspaceAdmission(root, Number.MAX_SAFE_INTEGER),
    ).rejects.toThrow('workspace_disk_low');
    await expect(checkWorkspaceAdmission('../request-path', 0)).rejects.toThrow(
      'workspace_root_invalid',
    );
    await expect(checkWorkspaceAdmission(root, -1)).rejects.toThrow(
      'workspace_limit_invalid',
    );
    await expect(
      prepareDocument(Buffer.from('x'), 'image/png', root, {
        maxPages: Infinity,
      }),
    ).rejects.toThrow('document_limit_invalid');
  });
});
