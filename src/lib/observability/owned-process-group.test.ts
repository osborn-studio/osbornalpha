import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { stopOwnedProcessGroup } from '../../../scripts/ci/owned-process-group';
import { bounded } from '../../../scripts/ci/owned-gateway';
describe.skipIf(process.platform === 'win32')('owned POSIX worker group cleanup', () => {
  it('terminates a real parent and its worker and confirms the whole group absent', async () => {
    const child = spawn(process.execPath, ['-e', `const {spawn}=require('node:child_process'); const worker=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});worker.once('spawn',()=>process.stdout.write('ready'));setInterval(()=>{},1000);`], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    try {
      await bounded(new Promise<void>((resolve, reject) => { child.stdout!.once('data', () => resolve()); child.once('error', reject); }), 3000, 'Synthetic worker readiness');
      await stopOwnedProcessGroup(child.pid!);
      expect(() => process.kill(-child.pid!, 0)).toThrowError(expect.objectContaining({ code: 'ESRCH' }));
    } finally { if (child.pid) await stopOwnedProcessGroup(child.pid); }
  }, 15000);
  it('refuses an unsafe process-group identifier', async () => {
    await expect(stopOwnedProcessGroup(0)).rejects.toThrow('Invalid owned group');
    await expect(stopOwnedProcessGroup(-1)).rejects.toThrow('Invalid owned group');
  });
});
