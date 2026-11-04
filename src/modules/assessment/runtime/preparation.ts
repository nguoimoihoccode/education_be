import { execFile } from 'node:child_process';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  statfs,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import sharp from 'sharp';

type Limits = {
  maxPages?: number;
  maxPixels?: number;
  maxWorkspaceBytes?: number;
};
type PreparedPage = {
  bytes: Buffer;
  mime: 'image/jpeg';
  width: number;
  height: number;
  pageNumber: number;
};
const INPUT_BYTES = 50 * 1024 * 1024;
const OUTPUT_BYTES = 64 * 1024 * 1024;
const WORKSPACE_BYTES = 512 * 1024 * 1024;
const PIXELS = 40_000_000;

// Callers must supply a server-configured absolute root, never a request field.
async function workspaceRoot(root: string): Promise<void> {
  if (!isAbsolute(root)) throw new Error('workspace_root_invalid');
  await mkdir(root, { recursive: true, mode: 0o700 });
  const info = await lstat(root);
  if (!info.isDirectory() || info.isSymbolicLink())
    throw new Error('workspace_root_invalid');
}

export async function checkWorkspaceAdmission(
  root: string,
  minFreeGiB: number,
): Promise<void> {
  if (!Number.isFinite(minFreeGiB) || minFreeGiB < 0)
    throw new Error('workspace_limit_invalid');
  await workspaceRoot(root);
  const fs = await statfs(root, { bigint: true });
  const needed = BigInt(Math.ceil(minFreeGiB * 1024 ** 3));
  if (fs.bavail * fs.bsize < needed) throw new Error('workspace_disk_low');
}

function bounded(value: number | undefined, fallback: number): number {
  const effective = value ?? fallback;
  if (!Number.isSafeInteger(effective) || effective < 1 || effective > fallback)
    throw new Error('document_limit_invalid');
  return effective;
}

function processDocument(binary: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      binary,
      args,
      {
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
        shell: false,
        killSignal: 'SIGKILL',
      },
      (error, stdout) => {
        // Do not retain stderr/file paths or document text in error messages.
        if (error) reject(new Error('document_process_failed'));
        else resolve(stdout);
      },
    );
  });
}

function pdfPages(info: string, maxPages: number): number {
  const pages = Number(/^Pages:\s+(\d+)\s*$/m.exec(info)?.[1]);
  if (!/^Encrypted:\s+no\s*$/m.test(info))
    throw new Error('document_encrypted_or_invalid');
  if (!Number.isSafeInteger(pages) || pages < 1 || pages > maxPages)
    throw new Error('document_page_limit');
  return pages;
}

function assertPdfPixels(info: string, page: number, maxPixels: number): void {
  const pageSize =
    new RegExp(
      `^Page\\s+${page}\\s+size:\\s+([\\d.]+) x ([\\d.]+) pts`,
      'm',
    ).exec(info) ?? /^Page size:\s+([\d.]+) x ([\d.]+) pts/m.exec(info);
  if (!pageSize) throw new Error('document_page_size_invalid');
  const width = Number(pageSize[1]);
  const height = Number(pageSize[2]);
  // Pixel policy at the rendering resolution, before invoking the renderer.
  if (
    !(width > 0 && height > 0) ||
    Math.ceil(width * 2) * Math.ceil(height * 2) > maxPixels
  )
    throw new Error('document_pixel_limit');
}

export async function prepareDocument(
  bytes: Buffer,
  mime: string,
  root: string,
  limits: Limits = {},
): Promise<PreparedPage[]> {
  const maxPages = bounded(limits.maxPages, 30);
  const maxPixels = bounded(limits.maxPixels, PIXELS);
  const maxWorkspaceBytes = bounded(limits.maxWorkspaceBytes, WORKSPACE_BYTES);
  if (!bytes.length || bytes.length > INPUT_BYTES)
    throw new Error('document_input_limit');
  if (bytes.length > maxWorkspaceBytes) throw new Error('workspace_limit');
  if (
    !['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(mime)
  )
    throw new Error('unsupported_document');
  await workspaceRoot(root);
  const directory = await mkdtemp(join(root, 'assessment-'));
  await chmod(directory, 0o700);
  const pages: PreparedPage[] = [];
  let outputBytes = 0;
  async function convert(
    input: Buffer,
    pageNumber: number,
    expectedMime?: string,
  ): Promise<void> {
    const image = sharp(input, {
      limitInputPixels: maxPixels,
      failOn: 'warning',
      animated: false,
    }).timeout({ seconds: 30 });
    const metadata = await image.metadata();
    if (
      !metadata.width ||
      !metadata.height ||
      metadata.width * metadata.height > maxPixels
    )
      throw new Error('document_pixel_limit');
    if (metadata.pages && metadata.pages > 1)
      throw new Error('document_multiframe_unsupported');
    if (expectedMime && `image/${metadata.format}` !== expectedMime)
      throw new Error('document_mime_mismatch');
    const result = await image
      .rotate()
      .resize({
        width: 2048,
        height: 2048,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 85 })
      .toBuffer({ resolveWithObject: true });
    outputBytes += result.data.length;
    if (outputBytes > OUTPUT_BYTES) throw new Error('document_output_limit');
    if (bytes.length + outputBytes > maxWorkspaceBytes)
      throw new Error('workspace_limit');
    pages.push({
      bytes: result.data,
      mime: 'image/jpeg',
      width: result.info.width,
      height: result.info.height,
      pageNumber,
    });
  }
  try {
    if (mime !== 'application/pdf') {
      await convert(bytes, 1, mime);
      return pages;
    }
    if (!bytes.subarray(0, 5).equals(Buffer.from('%PDF-')))
      throw new Error('document_mime_mismatch');
    const input = join(directory, 'input.pdf');
    await writeFile(input, bytes, { mode: 0o600, flag: 'wx' });
    const count = pdfPages(await processDocument('pdfinfo', [input]), maxPages);
    for (let page = 1; page <= count; page++) {
      const info = await processDocument('pdfinfo', [
        '-f',
        String(page),
        '-l',
        String(page),
        '-box',
        input,
      ]);
      assertPdfPixels(info, page, maxPixels);
      const output = join(directory, 'page');
      // Pre-create with private permissions before Poppler opens/truncates it.
      await writeFile(`${output}.jpg`, Buffer.alloc(0), {
        mode: 0o600,
        flag: 'wx',
      });
      await processDocument('pdftoppm', [
        '-f',
        String(page),
        '-l',
        String(page),
        '-singlefile',
        '-r',
        '144',
        '-scale-to',
        '2048',
        '-jpeg',
        '-jpegopt',
        'quality=85',
        input,
        output,
      ]);
      const file = `${output}.jpg`;
      await chmod(file, 0o600);
      const size = (await stat(file)).size;
      if (
        size + bytes.length + outputBytes > maxWorkspaceBytes ||
        size > OUTPUT_BYTES - outputBytes
      )
        throw new Error('workspace_limit');
      await convert(await readFile(file), page, 'image/jpeg');
      await unlink(file);
    }
    return pages;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
