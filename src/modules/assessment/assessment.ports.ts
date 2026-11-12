export const ASSESSMENT_STORAGE = Symbol('ASSESSMENT_STORAGE');
export interface AssessmentStoragePort {
  read?(key: string, limit?: number): Promise<Buffer>;
  createUpload(asset: {
    id: string;
    schoolId: string;
    assessmentId: string;
    submissionId?: string | null;
    declaredMime: string;
    byteSize: number;
    stagingKey?: string | null;
  }): Promise<{
    url: string;
    fields: Record<string, string>;
    expiresAt: string;
  }>;
  access(asset: {
    sealedKey: string;
    verifiedMime?: string | null;
  }): Promise<{ url: string; expiresAt: string }>;
}
