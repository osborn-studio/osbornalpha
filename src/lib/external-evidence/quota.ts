import type { ResearchArtifactClient } from '@/lib/stocks/research-artifact-repository';

export const EXTERNAL_EVIDENCE_REQUESTS_PER_HOUR = 30;

export async function consumeExternalEvidenceQuota(
  client: ResearchArtifactClient | null,
  limit = EXTERNAL_EVIDENCE_REQUESTS_PER_HOUR,
): Promise<boolean> {
  if (!client) return true;
  const repository = client as unknown as {
    rpc: (name: string, args: Record<string, unknown>) => Promise<{
      data: boolean | null;
      error: { message: string } | null;
    }>;
  };
  const { data, error } = await repository.rpc('consume_external_evidence_user_quota', {
    p_limit: Math.min(Math.max(Math.floor(limit), 1), 200),
    p_window_seconds: 3600,
  });
  if (error) throw new Error(`external_evidence_quota_failed:${error.message}`);
  return data === true;
}
