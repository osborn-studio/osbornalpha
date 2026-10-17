/** POSIX process group captured from an owned detached spawn, including workers. */
export async function stopOwnedProcessGroup(pid: number, timeout = 5000) {
  if (!Number.isSafeInteger(pid) || pid <= 1) throw new Error('Invalid owned group');
  const alive = () => {
    try { process.kill(-pid, 0); return true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false; throw error; }
  };
  const signal = (name: NodeJS.Signals) => {
    try { process.kill(-pid, name); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
  };
  if (!alive()) return;
  signal('SIGTERM');
  for (const phase of [0, 1]) {
    const until = performance.now() + timeout;
    while (alive() && performance.now() < until) await new Promise(resolve => setTimeout(resolve, 50));
    if (!alive()) return;
    if (phase === 0) signal('SIGKILL');
  }
  throw new Error('Owned process group remains; directory must be retained');
}
