import {mkdtempSync,readFileSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect,it} from 'vitest';
import {dirRawStore} from './raw-dir-store';

it('writes only the stored item (data + sidecar), keeps existing files and reports status',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'rawdir-'));
 const store=dirRawStore(dir);
 const a=await store.put({kind:'sec-document',bytes:new TextEncoder().encode('one'),contentType:'text/html'});
 const again=await store.put({kind:'sec-document',bytes:new TextEncoder().encode('one'),contentType:'text/html'});
 const b=await store.put({kind:'sec-submissions',bytes:new TextEncoder().encode('{}'),contentType:'application/json'});
 expect([a.status,again.status,b.status]).toEqual(['stored','exists','stored']);
 expect(readFileSync(join(dir,a.path),'utf8')).toBe('one');
 expect(readdirSync(join(dir,'sec-document')).length).toBe(2);
 expect(JSON.parse(readFileSync(join(dir,`${a.path}.meta.json`),'utf8')).sha256).toBe(a.sha256);
});
