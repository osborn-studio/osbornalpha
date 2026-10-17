"""Run both checked-out candidate repositories using only their disposable harnesses.
Usage: PATH=<Node22 bin>:$PATH python3 -I scripts/revocation/cross-repo-smoke.py /absolute/pa/checkout
"""
from pathlib import Path
import os,re,signal,subprocess,sys,tempfile
def run_harness(command,cwd,timeout,grace=30):
 # Files avoid pipe EOF hangs when grandchildren inherit output descriptors.
 with tempfile.TemporaryFile(mode='w+t') as out,tempfile.TemporaryFile(mode='w+t') as err:
  process=subprocess.Popen(command,cwd=cwd,stdout=out,stderr=err,text=True,start_new_session=True)
  try:process.wait(timeout=timeout)
  except subprocess.TimeoutExpired:
   try:os.killpg(process.pid,signal.SIGTERM)
   except ProcessLookupError:pass
   try:process.wait(timeout=grace)
   except subprocess.TimeoutExpired:
    try:os.killpg(process.pid,signal.SIGKILL)
    except ProcessLookupError:pass
    try:process.wait(timeout=5)
    except subprocess.TimeoutExpired:raise RuntimeError('Harness leader did not exit; cleanup unconfirmed')
   # A leader may exit before its descendants; terminate the remaining group too.
   try:os.killpg(process.pid,signal.SIGKILL)
   except ProcessLookupError:pass
   err.seek(0)
   raise RuntimeError('Harness timeout; cleanup unconfirmed. Inspect owned database directories. '+err.read()[-1500:])
  out.seek(0);err.seek(0)
  return subprocess.CompletedProcess(command,process.returncode,out.read(),err.read())
def main():
 if any(re.match(r'^(PG|SUPABASE_|NEXT_PUBLIC_SUPABASE_|DATABASE_URL$|ALPHA_S4_DATABASE_URL$)',name) for name in os.environ):raise RuntimeError('Refusing inherited database configuration')
 alpha=Path(__file__).resolve().parents[2]
 if len(sys.argv)!=2 or not Path(sys.argv[1]).is_absolute():raise RuntimeError('Supply the explicit absolute PA candidate checkout')
 pa=Path(sys.argv[1]).resolve()
 if not (pa/'apps/web/scripts/revocation/export-wire-fixture.sql').is_file():raise RuntimeError('PA candidate fixture is missing')
 version=subprocess.run(['node','--version'],capture_output=True,text=True,check=True,timeout=5).stdout
 if not version.startswith('v22.'):raise RuntimeError('Use the supported Node22 runtime')
 p=run_harness(['bash','apps/web/scripts/revocation/test-producer.sh'],pa,120)
 if p.returncode:raise RuntimeError('PA isolated harness failed: '+p.stderr[-1500:])
 m=re.search(r'Evidence: (/tmp/pa-revocation\.[A-Za-z0-9]+)',p.stdout)
 if not m:raise RuntimeError('Missing harness-owned evidence directory')
 directory=Path(m[1])
 if directory.is_symlink() or directory.stat().st_uid!=os.getuid():raise RuntimeError('Unexpected evidence directory ownership')
 for script,fixture in [('producer-contract-smoke.ts','page.json'),('export-contract-smoke.ts','export-wire.json')]:
  result=run_harness(['node',str(alpha/'node_modules/tsx/dist/cli.mjs'),str(alpha/'scripts/revocation'/script),str(directory/fixture)],alpha,30)
  if result.returncode:raise RuntimeError('Alpha isolated harness failed: '+result.stderr[-1500:])
  print(result.stdout.strip())
 print('PASS: two-repository candidate acceptance; retained synthetic PA evidence '+str(directory))

if __name__=='__main__':main()
