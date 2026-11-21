import {expect,it} from 'vitest';
import {ADMIN_ID,memoryCoreDeps,seedLicence,sha256,syntheticPdf} from './testing';
import {brokerPaths} from './storage';
import {commitIntent,createIntent} from './upload';

it.each(['validated','promoting'] as const)('pauses at %s if the licence changes and resumes after confirmation',async stage=>{
 const d=memoryCoreDeps(),l=await seedLicence(d.db),bytes=syntheticPdf(),sha=sha256(bytes);
 const {intentId,token}=await createIntent(d,{licence_id:l.licence_id,sha256:sha,byte_size:bytes.length,original_filename:'r.pdf'},ADMIN_ID);
 const path=brokerPaths.staging(intentId);d.storage.putSigned(path,token,bytes);
 const change=()=>d.db.updateLicence(l.licence_id,{terms_summary:'changed'});
 if(stage==='validated'){const download=d.storage.download.bind(d.storage);d.storage.download=async p=>{const b=await download(p);await change();return b;};}
 else{const insert=d.db.insertDocument.bind(d.db);d.db.insertDocument=async row=>{const r=await insert(row);await change();return r;};}
 const commit=()=>commitIntent(d,intentId,ADMIN_ID);
 await expect(commit()).rejects.toMatchObject({status:409,code:'licence_unconfirmed'});
 expect((await d.db.getIntent(intentId))?.status).toBe(stage);
 if(stage==='validated')expect(await d.db.findDocumentBySha(sha)).toBeNull();
 expect(await d.storage.exists(path)).toBe(true);expect(await d.storage.exists(brokerPaths.report(sha))).toBe(false);
 await d.db.confirmLicence(l.licence_id,ADMIN_ID,(await d.db.getLicence(l.licence_id))!.version);
 expect(await commit()).toEqual({documentId:intentId,status:'committed'});
});
