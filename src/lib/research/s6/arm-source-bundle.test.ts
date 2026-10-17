import {describe,expect,it} from 'vitest';
import {ARM_SOURCE_BUNDLE_PROTOCOL,armSourceBundleHash,parseArmSourceBundle} from './arm-source-bundle';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,h=(n:number)=>n.toString(16).padStart(64,'0');
const grant=(n:number,purpose:string,recipient='alpha-local')=>({grant_id:id(n),grant_version:1,grant_hash:h(n),mapping_hash:h(n+10),purpose,recipient});
function fixture(external=false){return {protocol:ARM_SOURCE_BUNDLE_PROTOCOL,source_reference:{feed_id:id(1),source_id:id(2),source_version_hash:h(1)},generation_mode:external?'external':'local',processor:external?'deepseek-analysis':null,purpose_map:{capture:grant(3,'alpha_arm_capture'),disclosure:grant(4,'alpha_arm_disclosure'),processing:external?grant(5,'external_model_processing','deepseek-analysis'):null}};}
describe('inactive source-purpose bundle shape, no actual processing approval',()=>{
 it('detaches and freezes local/external structures, requires separate grant IDs',()=>{
  for(const external of [false,true]){const f=fixture(external),r=parseArmSourceBundle(f);expect(r).toEqual(f);expect(Object.isFrozen(r)).toBe(true);expect(Object.isFrozen(r.source_reference)).toBe(true);expect(Object.isFrozen(r.purpose_map.capture)).toBe(true);expect(Object.isFrozen(r.purpose_map)).toBe(true);if(r.generation_mode==='external')expect(Object.isFrozen(r.purpose_map.processing)).toBe(true);f.purpose_map.capture.grant_version=2;expect(r.purpose_map.capture.grant_version).toBe(1);}
  for(const mode of [false,true]){const f=fixture(mode);f.purpose_map.disclosure.grant_id=f.purpose_map.capture.grant_id;expect(()=>parseArmSourceBundle(f)).toThrow('invalid_schema');}
 });
 it('requires exact keys and refuses import substitution, wrong purpose/recipient/processor',()=>{
  for(const layer of ['root','source','map','capture','disclosure','processing']){const f=fixture(true);const target=layer==='root'?f:layer==='source'?f.source_reference:layer==='map'?f.purpose_map:f.purpose_map[layer as 'capture'|'disclosure'|'processing']!;
   expect(()=>parseArmSourceBundle(layer==='root'?{...f,extra:true}:(Object.assign(target,{extra:true}),f))).toThrow('invalid_schema');
  }
  for(const entry of ['capture','disclosure','processing'] as const)for(const change of [{purpose:'alpha_research_import'},{purpose:'pa_reader_display'},{recipient:'wrong-system'},{grant_id:null},{grant_version:0},{grant_version:2147483648},{grant_version:1.5},{grant_version:'1'},{grant_hash:h(20).toUpperCase().replace('1','A')},{mapping_hash:'x'},{grant_id:{toString(){throw Error('must not run');}}}]){const f=fixture(true);Object.assign(f.purpose_map[entry]!,change);expect(()=>parseArmSourceBundle(f)).toThrow('invalid_schema');}
 });
 it('refuses ambiguous generation modes and missing/unsafe processor IDs',()=>{
  for(const processor of [null,'','alpha-local','DeepSeek',' x','x '.repeat(100),'x'.repeat(129),{}]){const f=fixture(true);Object.assign(f,{processor});Object.assign(f.purpose_map.processing!,{recipient:processor});expect(()=>parseArmSourceBundle(f)).toThrow('invalid_schema');}
  for(const processor of ['x','x'.repeat(128),'a.b','a_b','a:b','a/b','a-b']){const f=fixture(true);f.processor=processor;f.purpose_map.processing!.recipient=processor;expect(parseArmSourceBundle(f).processor).toBe(processor);}
  expect(()=>parseArmSourceBundle({...fixture(),processor:'deepseek-analysis'})).toThrow('invalid_schema');
  expect(()=>parseArmSourceBundle({...fixture(),purpose_map:fixture(true).purpose_map})).toThrow('invalid_schema');
  expect(()=>parseArmSourceBundle({...fixture(true),purpose_map:fixture().purpose_map})).toThrow('invalid_schema');
  for(const generation_mode of ['inferred','constructor',null,1,{}])expect(()=>parseArmSourceBundle({...fixture(),generation_mode})).toThrow('invalid_schema');
 });
 it('binds all grant/source/version/mapping/processor values and canonical key order',()=>{
  const f=fixture(true),base=armSourceBundleHash(f);const roundtrip=JSON.parse(JSON.stringify(f));expect(armSourceBundleHash(roundtrip)).toBe(base);
  for(const key of ['feed_id','source_id','source_version_hash'] as const){const f=fixture(true);f.source_reference[key]=key.endsWith('hash')?h(100):id(100);expect(armSourceBundleHash(f)).not.toBe(base);}
  for(const role of ['capture','disclosure','processing'] as const)for(const key of ['grant_id','grant_version','grant_hash','mapping_hash'] as const){const f=fixture(true);Object.assign(f.purpose_map[role]!,{[key]:key==='grant_id'?id(100):key==='grant_version'?2:h(100)});expect(armSourceBundleHash(f)).not.toBe(base);}
  const changed=fixture(true);changed.processor='processor-v2';changed.purpose_map.processing!.recipient='processor-v2';expect(armSourceBundleHash(changed)).not.toBe(base);
  const reverse=(o:object)=>Object.fromEntries(Object.entries(o).reverse());const reordered={...reverse(f),source_reference:reverse(f.source_reference),purpose_map:{...reverse(f.purpose_map),capture:reverse(f.purpose_map.capture),disclosure:reverse(f.purpose_map.disclosure),processing:reverse(f.purpose_map.processing!)}};expect(armSourceBundleHash(reordered)).toBe(base);
 });
 it('refuses every pair of reused grant IDs/digests and accepts bounded versions',()=>{
  for(const [a,b] of [['capture','disclosure'],['capture','processing'],['disclosure','processing']] as const)for(const field of ['grant_id','grant_hash'] as const){const f=fixture(true);f.purpose_map[b]![field]=f.purpose_map[a]![field];expect(()=>parseArmSourceBundle(f)).toThrow('invalid_schema');}
  for(const role of ['capture','disclosure','processing'] as const)for(const grant_version of [1,2147483647]){const f=fixture(true);f.purpose_map[role]!.grant_version=grant_version;expect(parseArmSourceBundle(f).purpose_map[role]!.grant_version).toBe(grant_version);}
  // Mapping hashes may represent the same source identity; trusted authority must
  // still resolve and bind each mapping to its individual purpose and recipient.
  const f=fixture(true);f.purpose_map.disclosure.mapping_hash=f.purpose_map.capture.mapping_hash;expect(parseArmSourceBundle(f)).toEqual(f);
 });
 it('refuses nested missing/accessor/symbol/Proxy shapes without invoking traps',()=>{
  let calls=0;const proxy=new Proxy({},{ownKeys(){calls++;throw Error('trap');},getPrototypeOf(){calls++;throw Error('trap');}});
  for(const v of [proxy,[],Object.create(fixture()),{...fixture(),[Symbol('extra')]:true}])expect(()=>parseArmSourceBundle(v)).toThrow('invalid_schema');
  expect(()=>parseArmSourceBundle({...fixture(),purpose_map:proxy})).toThrow('invalid_schema');
  const f=fixture();Object.defineProperty(f.source_reference,'source_id',{enumerable:true,get(){calls++;return id(2);}});expect(()=>parseArmSourceBundle(f)).toThrow('invalid_schema');expect(calls).toBe(0);
  for(const key of Object.keys(fixture(true))){const f={...fixture(true)} as Record<string,unknown>;delete f[key];expect(()=>parseArmSourceBundle(f)).toThrow('invalid_schema');}
  for(const role of ['capture','disclosure','processing'] as const)for(const key of Object.keys(grant(3,'alpha_arm_capture'))){const f=fixture(true);delete (f.purpose_map[role]! as Record<string,unknown>)[key];expect(()=>parseArmSourceBundle(f)).toThrow('invalid_schema');}
 });
});
