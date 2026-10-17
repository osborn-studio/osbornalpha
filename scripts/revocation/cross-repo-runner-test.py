"""No databases: exercise bounded timeout with a TERM-resistant child tree."""
from pathlib import Path
import re,runpy,subprocess,sys,time
run=runpy.run_path(str(Path(__file__).with_name('cross-repo-smoke.py')))['run_harness']
result=run([sys.executable,'-c','print("synthetic normal output")'],Path.cwd(),2)
if result.returncode or result.stdout.strip()!='synthetic normal output':raise RuntimeError('normal subprocess failed')
program='''import os,signal,subprocess,sys,time
signal.signal(signal.SIGTERM,signal.SIG_IGN)
child=subprocess.Popen([sys.executable,'-c','import signal,time; signal.signal(signal.SIGTERM,signal.SIG_IGN); time.sleep(30)'])
print('synthetic_child='+str(child.pid),file=sys.stderr,flush=True)
time.sleep(30)
'''
started=time.monotonic()
try:run([sys.executable,'-c',program],Path.cwd(),0.5,grace=0.2)
except RuntimeError as error:
 if 'cleanup unconfirmed' not in str(error):raise
 match=re.search(r'synthetic_child=(\d+)',str(error))
 if not match:raise RuntimeError('missing child evidence')
 child=int(match[1])
 for _ in range(20):
  status=subprocess.run(['ps','-o','stat=','-p',str(child)],capture_output=True,text=True,timeout=1).stdout.strip()
  if not status or status.startswith('Z'):break
  time.sleep(0.05)
 else:raise RuntimeError('descendant survived process group termination')
else:raise RuntimeError('timeout was not enforced')
if time.monotonic()-started>4:raise RuntimeError('bounded timeout exceeded')
print('PASS: normal output and bounded process-tree timeout; no databases started')
