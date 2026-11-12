import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadBucketCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHash, randomUUID, randomBytes } from 'node:crypto';
import JSZip from 'jszip';
import type { AssessmentStoragePort } from '../assessment.ports';
export const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const DOCX_LIMIT = 5 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function storageKey(
  school: string,
  assessment: string,
  asset: string,
  zone: 'staging' | 'sealed',
): string {
  if (![school, assessment, asset].every((v) => uuid.test(v)))
    throw new Error('invalid_object_scope');
  return `assessment/${school}/${assessment}/${zone}/${asset}`;
}
export function detectDocumentMime(b: Buffer): string {
  if (b.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  if (b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255)
    return 'image/jpeg';
  if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return 'image/png';
  if (
    b.subarray(0, 4).toString() === 'RIFF' &&
    b.subarray(8, 12).toString() === 'WEBP'
  )
    return 'image/webp';
  throw new Error('unsupported_document');
}
@Injectable()
export class AssessmentStorage implements AssessmentStoragePort {
  private client?: S3Client;
  private get bucket(): string {
    const bucket = process.env.ASSESSMENT_S3_BUCKET;
    if (!bucket)
      throw new ServiceUnavailableException(
        'assessment_storage_not_configured',
      );
    return bucket;
  }
  private s3(): S3Client {
    if (this.client) return this.client;
    const endpoint = process.env.ASSESSMENT_S3_ENDPOINT;
    if (!endpoint || new URL(endpoint).protocol !== 'https:')
      throw new ServiceUnavailableException(
        'assessment_storage_https_required',
      );
    if (
      !process.env.ASSESSMENT_S3_ACCESS_KEY_ID ||
      !process.env.ASSESSMENT_S3_SECRET_ACCESS_KEY
    )
      throw new ServiceUnavailableException(
        'assessment_storage_credentials_required',
      );
    this.client = new S3Client({
      endpoint,
      region: process.env.ASSESSMENT_S3_REGION || 'us-east-1',
      forcePathStyle: process.env.ASSESSMENT_S3_FORCE_PATH_STYLE === 'true',
      credentials: {
        accessKeyId: process.env.ASSESSMENT_S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.ASSESSMENT_S3_SECRET_ACCESS_KEY,
      },
      maxAttempts: 1,
    });
    return this.client;
  }
  async createUpload(asset: {
    id: string;
    schoolId: string;
    assessmentId: string;
    declaredMime: string;
    byteSize: number;
    stagingKey?: string | null;
  }) {
    const key = storageKey(
      asset.schoolId,
      asset.assessmentId,
      asset.id,
      'staging',
    );
    if (asset.stagingKey !== key) throw new Error('invalid_staging_key');
    const cap =
      asset.declaredMime === DOCX_MIME
        ? DOCX_LIMIT
        : (asset.declaredMime === 'application/pdf' ? 50 : 20) * 1024 * 1024;
    if (
      !Number.isSafeInteger(asset.byteSize) ||
      asset.byteSize < 1 ||
      asset.byteSize > cap
    )
      throw new Error('document_size_invalid');
    const post = await createPresignedPost(this.s3(), {
      Bucket: this.bucket,
      Key: key,
      Expires: 900,
      Fields: { 'Content-Type': asset.declaredMime },
      Conditions: [
        ['eq', '$Content-Type', asset.declaredMime],
        ['content-length-range', asset.byteSize, asset.byteSize],
      ],
    });
    return { ...post, expiresAt: new Date(Date.now() + 900000).toISOString() };
  }
  async access(asset: { sealedKey: string; verifiedMime?: string | null }) {
    if (
      !asset.sealedKey.startsWith('assessment/') ||
      asset.sealedKey.includes('..') ||
      asset.sealedKey.includes('/staging/')
    )
      throw new Error('invalid_sealed_key');
    const url = await getSignedUrl(
      this.s3(),
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: asset.sealedKey,
        ResponseCacheControl: 'private, no-store',
        ResponseContentType: asset.verifiedMime || 'application/octet-stream',
      }),
      { expiresIn: 300 },
    );
    return { url, expiresAt: new Date(Date.now() + 300000).toISOString() };
  }
  async read(key: string, limit = 50 * 1024 * 1024): Promise<Buffer> {
    const response = await this.s3().send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!response.Body || (response.ContentLength || 0) > limit)
      throw new Error('document_size_invalid');
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const part of response.Body as AsyncIterable<Uint8Array>) {
      size += part.byteLength;
      if (size > limit) throw new Error('document_size_invalid');
      chunks.push(Buffer.from(part));
    }
    return Buffer.concat(chunks);
  }
  async put(key: string, bytes: Buffer, mime: string): Promise<string | null> {
    const response = await this.s3().send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: bytes,
        ContentType: mime,
        CacheControl: 'private, no-store',
        ChecksumSHA256: createHash('sha256').update(bytes).digest('base64'),
      }),
    );
    return response.VersionId || null;
  }
  async seal(asset: {
    id: string;
    schoolId: string;
    assessmentId: string;
    stagingKey: string;
    byteSize: number;
    declaredMime: string;
    purpose?: string;
  }) {
    if (
      asset.stagingKey !==
      storageKey(asset.schoolId, asset.assessmentId, asset.id, 'staging')
    )
      throw new Error('invalid_staging_key');
    const bytes = await this.read(asset.stagingKey, asset.byteSize);
    if (bytes.length !== asset.byteSize)
      throw new Error('document_size_mismatch');
    let verifiedMime: string;
    if (asset.declaredMime === DOCX_MIME && asset.purpose === 'marking_guide') {
      if (bytes.length > DOCX_LIMIT) throw new Error('document_size_invalid');
      const zip = await JSZip.loadAsync(bytes).catch(() => null);
      if (!zip?.file('[Content_Types].xml') || !zip.file('word/document.xml'))
        throw new Error('unsupported_document');
      verifiedMime = DOCX_MIME;
    } else {
      verifiedMime = detectDocumentMime(bytes);
    }
    if (verifiedMime !== asset.declaredMime)
      throw new Error('document_mime_mismatch');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const sealedKey = `${storageKey(asset.schoolId, asset.assessmentId, asset.id, 'sealed')}/${sha256}`;
    const storageVersionId = await this.put(sealedKey, bytes, verifiedMime);
    return { sha256, sealedKey, storageVersionId, verifiedMime };
  }
  async ready(): Promise<void> {
    const key = `assessment/readiness/${randomUUID()}`;
    const bytes = randomBytes(32);
    let attemptedWrite = false;
    let version: string | undefined;
    try {
      const client = this.s3();
      const bucket = this.bucket;
      await client.send(new HeadBucketCommand({ Bucket: bucket }), {
        abortSignal: AbortSignal.timeout(10000),
      });
      try {
        attemptedWrite = true;
        const result = await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: bytes,
            ContentType: 'application/octet-stream',
            CacheControl: 'private, no-store',
          }),
          { abortSignal: AbortSignal.timeout(10000) },
        );
        version = result.VersionId;
        const response = await client.send(
          new GetObjectCommand({
            Bucket: bucket,
            Key: key,
            VersionId: version,
          }),
          { abortSignal: AbortSignal.timeout(10000) },
        );
        if (
          !response.Body ||
          (response.ContentLength !== undefined &&
            response.ContentLength !== bytes.length)
        )
          throw new Error('canary_invalid');
        let size = 0;
        const chunks: Buffer[] = [];
        for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
          size += chunk.byteLength;
          if (size > bytes.length) throw new Error('canary_invalid');
          chunks.push(Buffer.from(chunk));
        }
        if (!Buffer.concat(chunks).equals(bytes))
          throw new Error('canary_invalid');
      } finally {
        if (attemptedWrite)
          await client.send(
            new DeleteObjectCommand({
              Bucket: bucket,
              Key: key,
              VersionId: version,
            }),
            { abortSignal: AbortSignal.timeout(10000) },
          );
      }
    } catch {
      throw new Error('storage_unreachable');
    }
  }
}
