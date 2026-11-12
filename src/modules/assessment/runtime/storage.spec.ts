import JSZip from 'jszip';

import { AssessmentStorage, detectDocumentMime, storageKey } from './storage';
describe('private assessment storage', () => {
  it('detects the bytes, not a claimed extension', () => {
    expect(detectDocumentMime(Buffer.from('%PDF-1.7'))).toBe('application/pdf');
    expect(detectDocumentMime(Buffer.from([255, 216, 255, 224]))).toBe(
      'image/jpeg',
    );
    expect(() =>
      detectDocumentMime(Buffer.from('<script>bad</script>')),
    ).toThrow('unsupported_document');
  });
  it('rejects object path traversal and client generated keys', () => {
    expect(() => storageKey('../other', 'x', 'x', 'staging')).toThrow();
    expect(
      storageKey(
        'a'.repeat(8) + '-aaaa-4aaa-aaaa-' + 'a'.repeat(12),
        'b'.repeat(8) + '-bbbb-4bbb-bbbb-' + 'b'.repeat(12),
        'c'.repeat(8) + '-cccc-4ccc-cccc-' + 'c'.repeat(12),
        'staging',
      ),
    ).toContain('/staging/');
  });
});

describe('fail-closed private storage readiness', () => {
  const originalBucket = process.env.ASSESSMENT_S3_BUCKET;
  beforeEach(() => {
    process.env.ASSESSMENT_S3_BUCKET = 'private-test';
  });
  afterEach(() => {
    if (originalBucket === undefined) delete process.env.ASSESSMENT_S3_BUCKET;
    else process.env.ASSESSMENT_S3_BUCKET = originalBucket;
  });
  function instance(send: jest.Mock) {
    const storage = new AssessmentStorage();
    Object.defineProperty(storage, 'client', { value: { send } });
    return storage;
  }
  it('does not treat missing buckets as ready', async () => {
    const send = jest.fn().mockRejectedValue({
      name: 'NoSuchBucket',
      $metadata: { httpStatusCode: 404 },
    });
    await expect(instance(send).ready()).rejects.toThrow('storage_unreachable');
  });
  it('checks random private write/read/delete and removes the exact canary version', async () => {
    let body: Buffer;
    const commands: {
      constructor: { name: string };
      input: Record<string, unknown>;
    }[] = [];
    const send = jest.fn().mockImplementation((command) => {
      commands.push(command);
      if (command.constructor.name === 'PutObjectCommand') {
        body = command.input.Body;
        return { VersionId: 'canary-version' };
      }
      if (command.constructor.name === 'GetObjectCommand')
        return {
          ContentLength: body.length,
          Body: (async function* () {
            yield body;
          })(),
        };
      return {};
    });
    await expect(instance(send).ready()).resolves.toBeUndefined();
    expect(commands.map((command) => command.constructor.name)).toEqual([
      'HeadBucketCommand',
      'PutObjectCommand',
      'GetObjectCommand',
      'DeleteObjectCommand',
    ]);
    const put = commands[1].input;
    expect(put.Key).toMatch(/^assessment\/readiness\/[0-9a-f-]+$/);
    expect(put.CacheControl).toBe('private, no-store');
    expect(commands[2].input).toMatchObject({
      Key: put.Key,
      VersionId: 'canary-version',
    });
    expect(commands[3].input).toMatchObject({
      Key: put.Key,
      VersionId: 'canary-version',
    });
  });
  it.each(['GetObjectCommand', 'DeleteObjectCommand'])(
    'fails readiness on %s failure and attempts cleanup',
    async (failure) => {
      const send = jest.fn().mockImplementation((command) => {
        if (command.constructor.name === failure) throw new Error('denied');
        if (command.constructor.name === 'GetObjectCommand')
          return {
            Body: (async function* () {
              yield Buffer.from('wrong');
            })(),
          };
        return {};
      });
      await expect(instance(send).ready()).rejects.toThrow(
        'storage_unreachable',
      );
      expect(
        send.mock.calls.some(
          ([command]) => command.constructor.name === 'DeleteObjectCommand',
        ),
      ).toBe(true);
    },
  );
});

describe('official marking guide uploads', () => {
  const mime =
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const id = 'aaaa0000-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  const guide = {
    id,
    schoolId: id,
    assessmentId: id,
    declaredMime: mime,
    stagingKey: storageKey(id, id, id, 'staging'),
    purpose: 'marking_guide',
  };

  it('seals a DOCX package only as a marking guide', async () => {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<Types/>');
    zip.file('word/document.xml', '<document/>');
    const bytes = await zip.generateAsync({ type: 'nodebuffer' });
    const storage = new AssessmentStorage();
    jest.spyOn(storage, 'read').mockResolvedValue(bytes);
    jest.spyOn(storage, 'put').mockResolvedValue(null);
    const asset = { ...guide, byteSize: bytes.length };
    await expect(storage.seal(asset)).resolves.toMatchObject({
      verifiedMime: mime,
    });
    await expect(
      storage.seal({ ...asset, purpose: 'student_work' }),
    ).rejects.toThrow('unsupported_document');
  });

  it('rejects a ZIP lacking the DOCX document parts', async () => {
    const zip = new JSZip();
    zip.file('arbitrary.txt', 'content');
    const bytes = await zip.generateAsync({ type: 'nodebuffer' });
    const storage = new AssessmentStorage();
    jest.spyOn(storage, 'read').mockResolvedValue(bytes);
    const put = jest.spyOn(storage, 'put').mockResolvedValue(null);
    await expect(
      storage.seal({ ...guide, byteSize: bytes.length }),
    ).rejects.toThrow('unsupported_document');
    expect(put).not.toHaveBeenCalled();
  });
});
