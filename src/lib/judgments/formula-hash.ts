// src/lib/judgments/formula-hash.ts
// formula_hash (spec §4.1, audits G20 / F22). implementation_sha256 = digest of [[repo path, sha256]]
// over the method module's LOCAL import closure: every relative or '@/' specifier (static import,
// import type, export … from, dynamic import(), require) reachable from Methodology.module, whether or
// not it lives under src/lib/judgments/, resolved like the bundler (exact file; .ts / .tsx / .d.ts /
// .js / .mjs / .json; a .js specifier naming a .ts file; dir/index.*). Bare specifiers (packages,
// node:*) are excluded. Discovery uses the TypeScript compiler's preProcessFile scanner — comments
// and string literals can neither add nor hide an import, which a regex cannot guarantee; no type
// checking. An unresolvable local specifier throws (a silently dropped file would escape the hash).
// deps_sha256 = digest over Methodology.deps (non-import files: data, rule tables, catalogue
// snapshots). formula_hash = digest({id, version, params, params_json, horizon, upstream,
// doc_sha256, implementation_sha256, deps_sha256}); status and publishable are not part of it.
// Paths are repo-relative POSIX and sorted; bytes are hashed raw. Node-only (fs + typescript): the
// sync script and tests use it, app code never imports it.
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,statSync} from 'node:fs';
import {dirname,join,relative,resolve,sep} from 'node:path';
import ts from 'typescript';
import type {Methodology} from './types';
import {digest} from './canonical';
import {upstreamOf} from './registry';
import type {MethodologyHashes} from './registry';

export interface FormulaHashes extends MethodologyHashes{closure:string[]}
const EXT=['.ts','.tsx','.d.ts','.js','.mjs','.json'];
const INDEX=['index.ts','index.tsx','index.js'];
const isFile=(p:string)=>existsSync(p)&&statSync(p).isFile();
const posix=(root:string,abs:string)=>relative(root,abs).split(sep).join('/');
export const fileSha256=(repoRoot:string,path:string)=>createHash('sha256').update(readFileSync(join(repoRoot,path))).digest('hex');
export function importSpecifiers(source:string):string[]{return ts.preProcessFile(source,true,true).importedFiles.map(f=>f.fileName);}
export function resolveImport(repoRoot:string,fromAbs:string,spec:string):string|null{
 let base:string;
 if(spec.startsWith('@/'))base=join(repoRoot,'src',spec.slice(2));
 else if(spec==='.'||spec==='..'||spec.startsWith('./')||spec.startsWith('../'))base=resolve(dirname(fromAbs),spec);
 else return null;
 if(isFile(base))return base;
 if(/\.m?js$/.test(base)){const t=base.replace(/\.m?js$/,'.ts');if(isFile(t))return t;}
 for(const e of EXT)if(isFile(base+e))return base+e;
 for(const i of INDEX)if(isFile(join(base,i)))return join(base,i);
 throw new Error(`formula_hash_unresolved_import:${posix(repoRoot,fromAbs)}:${spec}`);
}
export function importClosure(repoRoot:string,entry:string):string[]{
 const root=resolve(repoRoot);const start=resolve(root,entry);
 if(!isFile(start))throw new Error(`formula_hash_missing_module:${entry}`);
 const seen=new Set<string>([start]);const stack=[start];
 while(stack.length>0){
  const file=stack.pop()!;
  if(file.endsWith('.json'))continue;
  for(const spec of importSpecifiers(readFileSync(file,'utf8'))){
   const dep=resolveImport(root,file,spec);
   if(dep&&!seen.has(dep)){seen.add(dep);stack.push(dep);}
  }
 }
 return [...seen].map(f=>posix(root,f)).sort();
}
export function implementationSha256(repoRoot:string,entry:string):{sha256:string;files:string[]}{
 const files=importClosure(repoRoot,entry);
 return {sha256:digest(files.map(f=>[f,fileSha256(repoRoot,f)])),files};
}
export function depsSha256(repoRoot:string,deps:readonly string[]):string{
 return digest([...new Set(deps)].sort().map(f=>{if(!isFile(join(repoRoot,f)))throw new Error(`formula_hash_missing_dep:${f}`);return [f,fileSha256(repoRoot,f)];}));
}
export function formulaHashOf(m:Methodology,repoRoot:string=process.cwd()):FormulaHashes{
 if(!isFile(join(repoRoot,m.doc)))throw new Error(`formula_hash_missing_doc:${m.doc}`);
 const doc_sha256=fileSha256(repoRoot,m.doc);
 const impl=implementationSha256(repoRoot,m.module);
 const deps_sha256=depsSha256(repoRoot,m.deps);
 const formula_hash=digest({id:m.id,version:m.version,params:m.params,params_json:m.params_json??{},horizon:m.horizon,upstream:upstreamOf(m),doc_sha256,implementation_sha256:impl.sha256,deps_sha256});
 return {doc_sha256,implementation_sha256:impl.sha256,deps_sha256,formula_hash,closure:impl.files};
}
