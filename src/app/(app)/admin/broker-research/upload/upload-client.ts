// src/app/(app)/admin/broker-research/upload/upload-client.ts
// Browser-side upload helpers (spec §6.1 step 1–2): sha256 via Web Crypto, %PDF- sniff, 50 MiB cap
// (bucket limit), and a progress-reporting PUT of the raw bytes to the signed upload URL (the same
// request shape scripts/broker-research/storage-check.ts exercises against the local stack).
export const MAX_BYTES=50*1024*1024;
export async function sha256Hex(blob:Blob):Promise<string>{
 const d=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());
 return Array.from(new Uint8Array(d),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function sniffPdf(blob:Blob):Promise<boolean>{return new TextDecoder().decode(await blob.slice(0,5).arrayBuffer())==='%PDF-';}
export function validatePdfFile(f:{name:string;type:string;size:number}):'not_pdf'|'too_large'|'empty'|null{
 if(f.type!=='application/pdf'&&!/\.pdf$/i.test(f.name))return 'not_pdf';
 if(f.size===0)return 'empty';
 return f.size>MAX_BYTES?'too_large':null;
}
export function putSigned(url:string,file:Blob,onProgress:(loaded:number,total:number)=>void):Promise<void>{
 return new Promise((resolve,reject)=>{
  const xhr=new XMLHttpRequest();
  xhr.open('PUT',url);
  xhr.setRequestHeader('content-type','application/pdf');xhr.setRequestHeader('x-upsert','false');
  xhr.upload.onprogress=e=>{if(e.lengthComputable)onProgress(e.loaded,e.total);};
  xhr.onload=()=>xhr.status>=200&&xhr.status<300?resolve():reject(new Error(`upload_http_${xhr.status}`));
  xhr.onerror=()=>reject(new Error('upload_network'));
  xhr.send(file);
 });
}
