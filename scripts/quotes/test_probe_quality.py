import json, os, subprocess, sys, tempfile, unittest
from pathlib import Path
from probe_quality import classify, EXPECTED, LIMIT

def payload():
    return {'quotes': {t: {'price': 10, 'source': 'datagateway-wind'} for t in EXPECTED}, 'meta': {'failed': 0, 'stale': 0, 'selected_sources': {t: 'datagateway-wind' for t in EXPECTED}}}
class ProbeQualityTests(unittest.TestCase):
    def test_available_preferred(self):
        self.assertEqual(classify(payload()), {'availability':'available','preferred_source':'selected','reason':'classified'})
    def test_available_fallback_is_degradation_not_outage(self):
        p=payload();p['meta']['selected_sources']['AAPL']='synthetic-fallback'
        self.assertEqual(classify(p)['availability'],'available');self.assertEqual(classify(p)['preferred_source'],'degraded')
    def test_stale_and_failed_are_separate(self):
        p=payload();p['meta']['stale']=1;self.assertEqual(classify(p)['availability'],'stale')
        p['meta']['failed']=1;self.assertEqual(classify(p)['availability'],'unavailable')
    def test_missing_sources_are_unknown(self):
        p=payload();p['meta'].pop('selected_sources');self.assertEqual(classify(p)['preferred_source'],'unknown');self.assertEqual(classify(p)['availability'],'available')
    def test_metadata_false_zero_and_invalid_prices(self):
        for field in ['failed','stale']:
            for value in [False,True,-1,3,'0',None]:
                p=payload();p['meta'][field]=value;self.assertEqual(classify(p)['availability'],'invalid')
        for value in [False,0,-1,float('nan'),float('inf'),'10',None]:
            p=payload();p['quotes']['AAPL']['price']=value;self.assertEqual(classify(p)['availability'],'unavailable')
    def test_no_raw_body_or_prices_in_cli_and_failure_exit(self):
        p=payload();p['private']='synthetic-private';p['meta']['selected_sources']['AAPL']='synthetic-secret-provider'
        r=subprocess.run([sys.executable,str(Path(__file__).with_name('probe_quality.py'))],input=json.dumps(p).encode(),capture_output=True)
        self.assertEqual(r.stdout,(json.dumps({'availability':'available','preferred_source':'degraded','reason':'classified'},sort_keys=True)+'\n').encode());self.assertNotIn(b'datagateway',r.stdout);self.assertEqual(r.returncode,1);self.assertNotIn(b'synthetic-',r.stdout);self.assertNotIn(b'price',r.stdout);self.assertEqual(r.stderr,b'')
    def test_cli_malformed_overflow_and_success(self):
        expected_good={'availability':'available','preferred_source':'selected','reason':'classified'}
        expected_bad={'availability':'invalid','preferred_source':'unknown','reason':'invalid_payload'}
        padded=payload();padded['padding']='';empty=json.dumps(padded).encode();padded['padding']='x'*(LIMIT-len(empty));exact=json.dumps(padded).encode();self.assertEqual(len(exact),LIMIT)
        for body,code,expected in [(b'{',1,expected_bad),(b'null',1,expected_bad),(exact+b' ',1,expected_bad),(exact,0,expected_good),(json.dumps(payload()).encode(),0,expected_good)]:
            r=subprocess.run([sys.executable,str(Path(__file__).with_name('probe_quality.py'))],input=body,capture_output=True);self.assertEqual(r.returncode,code);self.assertEqual(r.stderr,b'');self.assertEqual(r.stdout,(json.dumps(expected,sort_keys=True)+'\n').encode());self.assertNotIn(b'datagateway',r.stdout)
    def test_actual_gateway_shell_with_stubbed_curl_never_calls_network(self):
        root=Path(__file__).resolve().parents[2];workflow=(root/'.github/workflows/quote-service-alert.yml').read_text()
        self.assertIn("cron: '7,22,37,52 * * * *'",workflow)
        block=workflow.split('        run: |',1)[1].split('\n\n  check:',1)[0]
        command='\n'.join(line[10:] for line in block.splitlines() if line.strip())
        with tempfile.TemporaryDirectory() as temp:
            curl=Path(temp)/'curl';curl.write_text('#!/usr/bin/env python3\nimport os,sys\nassert "--max-filesize" in sys.argv\nsys.stdout.write(os.environ["SYNTHETIC_PAYLOAD"])\n');curl.chmod(0o700)
            for preferred,code in [(True,0),(False,1)]:
                p=payload()
                if not preferred:p['meta']['selected_sources']['AAPL']='synthetic-fallback'
                env={**os.environ,'PATH':temp+os.pathsep+os.environ['PATH'],'SYNTHETIC_PAYLOAD':json.dumps(p)}
                r=subprocess.run(['bash','-c',command],cwd=root,env=env,capture_output=True,timeout=10)
                self.assertEqual(r.returncode,code);self.assertEqual(r.stderr,b'');self.assertEqual(json.loads(r.stdout)['availability'],'available');self.assertNotIn(b'price',r.stdout);self.assertNotIn(b'datagateway',r.stdout)
    def test_quote_source_disagreement_missing_source_and_delayed(self):
        p=payload();p['quotes']['AAPL']['source']='synthetic-fallback';self.assertEqual(classify(p)['preferred_source'],'degraded')
        p=payload();p['quotes']['AAPL'].pop('source');self.assertEqual(classify(p)['preferred_source'],'unknown')
        p=payload();p['quotes']['AAPL']['delayed']=True;self.assertEqual(classify(p)['availability'],'stale')
if __name__=='__main__':unittest.main()
