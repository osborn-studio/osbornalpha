/**
 * Small client-side request lifecycle primitive.
 *
 * A slot owns one active request at a time. Starting a new request aborts the
 * previous one, while the monotonically increasing id also protects callers
 * whose transport cannot be cancelled immediately (for example a shared
 * in-flight promise).
 */
export interface RequestLease {
  id: number;
  signal: AbortSignal;
}

export interface RequestSlot {
  begin(): RequestLease;
  cancel(): void;
  isCurrent(lease: RequestLease): boolean;
}

export function createRequestSlot(): RequestSlot {
  let sequence = 0;
  let controller: AbortController | null = null;

  return {
    begin() {
      controller?.abort();
      controller = new AbortController();
      return { id: ++sequence, signal: controller.signal };
    },
    cancel() {
      controller?.abort();
      controller = null;
      sequence += 1;
    },
    isCurrent(lease) {
      return lease.id === sequence && controller?.signal === lease.signal && !lease.signal.aborted;
    },
  };
}
