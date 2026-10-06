import { spawn, type ChildProcess } from 'node:child_process';
export function startOwnedGateway(binary: string, config: string, stderr: NodeJS.WritableStream) {
  const child = spawn(binary, [config], { stdio: ['ignore', 'ignore', 'pipe'] });
  child.stderr!.pipe(stderr);
  const exited = new Promise<void>(resolve => { child.once('exit', () => resolve()); child.once('error', () => resolve()); });
  const spawned = new Promise<void>((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
  return { child, exited, spawned };
}
export async function bounded<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(label)), ms); })]); }
  finally { clearTimeout(timer); }
}
export async function stopOwnedGateway(child: ChildProcess, exited: Promise<void>, timeout = 5000) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  try { await bounded(exited, timeout, 'Owned gateway TERM timeout'); }
  catch { child.kill('SIGKILL'); await bounded(exited, timeout, 'Owned gateway exit unconfirmed after KILL'); }
}
