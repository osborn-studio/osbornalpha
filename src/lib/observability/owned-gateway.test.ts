import { describe, it, expect, vi } from 'vitest';
import { Writable } from 'node:stream';
import type { ChildProcess } from 'node:child_process';
import { startOwnedGateway, stopOwnedGateway, bounded } from '../../../scripts/ci/owned-gateway';
describe('owned gateway failure cleanup primitives', () => {
  it('settles exit on actual spawn error without an unhandled rejection', async () => {
    const owned = startOwnedGateway('/nonexistent-synthetic-gateway', 'synthetic-config', new Writable({ write(_chunk, _encoding, callback) { callback(); } }));
    await expect(owned.spawned).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(owned.exited).resolves.toBeUndefined();
    await expect(stopOwnedGateway(owned.child, owned.exited)).resolves.toBeUndefined();
  });
  it('bounds TERM and KILL waits when exit cannot be confirmed', async () => {
    const kill = vi.fn();
    const child = { pid: 123, exitCode: null, signalCode: null, kill } as unknown as ChildProcess;
    await expect(stopOwnedGateway(child, new Promise(() => {}), 5)).rejects.toThrow('exit unconfirmed');
    expect(kill.mock.calls).toEqual([['SIGTERM'], ['SIGKILL']]);
  });
  it('does not kill a process already exited by signal; timeout rejects visibly', async () => {
    const kill = vi.fn(); const child = { pid: 123, exitCode: null, signalCode: 'SIGTERM', kill } as unknown as ChildProcess;
    await stopOwnedGateway(child, Promise.resolve()); expect(kill).not.toHaveBeenCalled();
    await expect(bounded(new Promise(() => {}), 5, 'pool close timeout')).rejects.toThrow('pool close timeout');
  });
});
