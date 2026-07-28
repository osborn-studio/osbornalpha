import { getAdminSupabase } from '@/lib/supabase/admin';
import type { SecuritySnapshot } from '../model';
import type { SnapshotValidation } from './validate';

const STAGING_BATCH_SIZE = 500;

export interface SecurityWriteResult {
  run_id: string;
  status: 'success' | 'rejected' | 'failed';
  checksum: string;
  inserted_count: number;
  updated_count: number;
  deactivated_count: number;
  no_op: boolean;
  error_code?: string;
}

export interface SecurityWriterOptions {
  client?: unknown;
}

function stableErrorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    return /^[a-z0-9_]+$/i.test(error.code) ? error.code : 'sync_failed';
  }
  return 'sync_failed';
}

function stagingRows(runId: string, snapshot: SecuritySnapshot) {
  return [
    ...snapshot.securities.map((row) => ({
      run_id: runId,
      record_kind: 'security' as const,
      natural_key: row.ticker,
      normalized_payload: row as unknown as Record<string, unknown>,
    })),
    ...snapshot.aliases.map((row) => ({
      run_id: runId,
      record_kind: 'alias' as const,
      natural_key: JSON.stringify([row.alias, row.ticker, row.alias_type]),
      normalized_payload: row as unknown as Record<string, unknown>,
    })),
    ...snapshot.memberships.map((row) => ({
      run_id: runId,
      record_kind: 'membership' as const,
      natural_key: JSON.stringify([row.universe, row.ticker]),
      normalized_payload: row as unknown as Record<string, unknown>,
    })),
  ];
}

export async function writeSecuritySnapshot(
  snapshot: SecuritySnapshot,
  validation: SnapshotValidation,
  options: SecurityWriterOptions = {},
): Promise<SecurityWriteResult> {
  const client = (options.client ?? getAdminSupabase()) as any;
  const { data: run, error: runError } = await client
    .from('security_sync_runs')
    .insert({
      source: snapshot.source,
      scope: snapshot.scope,
      status: 'running',
      source_as_of: snapshot.asOf,
      fetched_count: validation.counts.fetched,
      checksum: validation.checksum,
    })
    .select('id')
    .single();
  if (runError || !run) throw new Error('Unable to create security sync run.');
  const runId = run.id;

  if (!validation.accepted) {
    await client.from('security_sync_runs').update({
      status: 'rejected',
      completed_at: new Date().toISOString(),
      error_code: validation.errors[0]?.code ?? 'validation_rejected',
      error_message: 'Snapshot rejected by validation gates.',
    }).eq('id', runId);
    return {
      run_id: runId,
      status: 'rejected',
      checksum: validation.checksum,
      inserted_count: 0,
      updated_count: 0,
      deactivated_count: 0,
      no_op: false,
      error_code: validation.errors[0]?.code,
    };
  }

  try {
    const { data: existing } = await client
      .from('security_sync_runs')
      .select('id')
      .eq('scope', snapshot.scope)
      .eq('checksum', validation.checksum)
      .eq('status', 'success')
      .limit(1)
      .maybeSingle();
    if (existing) {
      await client.from('security_sync_runs').update({
        status: 'success',
        completed_at: new Date().toISOString(),
        accepted_count: validation.counts.securities,
        error_code: null,
        error_message: null,
      }).eq('id', runId);
      return {
        run_id: runId,
        status: 'success',
        checksum: validation.checksum,
        inserted_count: 0,
        updated_count: 0,
        deactivated_count: 0,
        no_op: true,
      };
    }

    const snapshotPath = `${snapshot.scope}/${snapshot.asOf}/${validation.checksum}.json`;
    const { error: uploadError } = await client.storage
      .from('security-snapshots')
      .upload(snapshotPath, JSON.stringify(snapshot), { contentType: 'application/json', upsert: true });
    if (uploadError) throw Object.assign(new Error('Snapshot upload failed.'), { code: 'snapshot_upload_failed' });

    const rows = stagingRows(runId, snapshot);
    for (let index = 0; index < rows.length; index += STAGING_BATCH_SIZE) {
      const { error } = await client.from('security_sync_staging').upsert(
        rows.slice(index, index + STAGING_BATCH_SIZE),
        { onConflict: 'run_id,record_kind,natural_key' },
      );
      if (error) throw Object.assign(new Error('Snapshot staging failed.'), { code: 'snapshot_staging_failed' });
    }

    const { error: stagedError } = await client.from('security_sync_runs').update({
      status: 'staged',
      snapshot_path: snapshotPath,
      accepted_count: validation.counts.securities,
    }).eq('id', runId);
    if (stagedError) throw Object.assign(new Error('Run staging failed.'), { code: 'snapshot_staging_failed' });

    const { error: commitError } = await client.rpc('commit_security_sync', { p_run_id: runId });
    if (commitError) throw Object.assign(new Error('Snapshot commit failed.'), { code: 'snapshot_commit_failed' });

    const { data: completed } = await client
      .from('security_sync_runs')
      .select('inserted_count,updated_count,deactivated_count')
      .eq('id', runId)
      .single();

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await client.from('security_sync_staging').delete().lt('created_at', cutoff);
    return {
      run_id: runId,
      status: 'success',
      checksum: validation.checksum,
      inserted_count: completed?.inserted_count ?? 0,
      updated_count: completed?.updated_count ?? 0,
      deactivated_count: completed?.deactivated_count ?? 0,
      no_op: false,
    };
  } catch (error) {
    const errorCode = stableErrorCode(error);
    await client.from('security_sync_runs').update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_code: errorCode,
      error_message: 'Security synchronization failed.',
    }).eq('id', runId);
    return {
      run_id: runId,
      status: 'failed',
      checksum: validation.checksum,
      inserted_count: 0,
      updated_count: 0,
      deactivated_count: 0,
      no_op: false,
      error_code: errorCode,
    };
  }
}
