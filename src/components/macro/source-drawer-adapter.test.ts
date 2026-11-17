import {expect,it} from 'vitest';
import zh from '../../../messages/zh/macro.json';
import en from '../../../messages/en/macro.json';
import {macroDrawerInput,macroDrawerText} from './source-drawer-adapter';
import type {DrawerTarget} from './SourceDrawer';
import type {VersionJson} from './view-model';
import type {MacroT} from './use-macro-t';
import {formatInstant} from './macro-format';
const translator=(messages:unknown):MacroT=>(key,values)=>{
 const value=key.split('.').reduce<unknown>((v,k)=>(v as Record<string,unknown>)[k],messages);
 if(typeof value!=='string')throw new Error(`Missing ${key}`);
 return value.replace(/\{(\w+)\}/g,(_,k)=>String(values?.[k]??k));
};
const target:DrawerTarget={seriesId:'[series/id]',observationId:'[observation_id]',name:'[name]',periodEnd:'2026-01-01',display:'4.2',unit:'percent',source:{publisher:{zh:'[发布方]',en:'[publisher]'},via:{zh:'[转发方]',en:'[relay]'},fetch_host:'[host]',adapter:'fred_csv',rights:'public_domain',attribution:{zh:'[署名]',en:'[attribution]'}}};
const version:VersionJson={observation_id:'[observation_id]',series_id:target.seriesId,version:1,value_text:'4.2',available_at:'2026-01-02T00:00:00Z',availability_basis:'first_seen',retrieval:{retrieval_id:'[retrieval_id]',fetch_url:'https://example.test/[series]',fetch_host:'example.test',http_status:200,fetched_at:'2026-01-02T00:00:00Z',tool_versions:{parser:'[parser]',code:'[code]'}},evidence:{sha256:'[sha256]',adapter:'fred_csv',content_type:'text/csv',byte_length:42},locator:{kind:'csv_row',line:2,column:0},transform:null,derived_from:null,code_version:'[code-version]',inputs:[]};
for(const [locale,messages] of [['zh',zh],['en',en]] as const){
 const t=translator(messages);
 it(`maps source, identity, times, versions and licence in ${locale}`,()=>{
  const input=macroDrawerInput(target,version,[version],t,locale);expect(input.variant).toBe('ok');if(input.variant!=='ok')throw new Error('expected ok');
  expect(input.payload).toEqual({kind:'macro_observation',identity:{id:'[observation_id]',label:'[series/id] · [name]'},source:{publisher:target.source!.publisher[locale],adapter:t('drawer.adapters.fred_csv'),url:version.retrieval!.fetch_url,locator:t('drawer.csvRow',{line:2,column:1}),evidence_sha256:'[sha256]'},times:{period:target.periodEnd,available_at:formatInstant(version.available_at),ingested_at:formatInstant(version.retrieval!.fetched_at)},transform:{code_version:'[code-version]',mapping_version:null,method_version:null},licence:{status:t('drawer.rightsValues.public_domain'),note_key:'macro:rights:public_domain'},attribution_key:'macro:attribution',links:{module_href:'/macro/%5Bseries%2Fid%5D'}});
  expect(input.extras).toMatchObject({title:target.name,value:'4.2',period:target.periodEnd,relay:target.source!.via![locale],evidence_href:'/api/macro/evidence/[sha256]',transform_label:t('drawer.none'),links:[{label:t('drawer.rawLink'),href:'/api/macro/evidence/[sha256]'}]});
  expect(input.extras?.rows?.source?.map(r=>r.key)).toEqual(['host','fetchedAt','toolVersions']);expect(input.extras?.rows?.source?.at(-1)?.value).toBe('code=[code] · parser=[parser]');expect(input.extras?.rows?.times).toEqual([{key:'basis',label:t('drawer.available'),value:t('drawer.basis')}]);expect(input.extras?.as_of).toBeUndefined();
 });
 it(`resolves module-owned keys in ${locale}`,()=>{const text=macroDrawerText(target,t,locale);expect(text('macro:rights:public_domain')).toBe(t('drawer.rightsValues.public_domain'));expect(text('macro:attribution')).toBe(target.source!.attribution[locale]);expect(text('[unknown]')).toBe('[unknown]');});
}
it('keeps missing retrieval null without host extras, and marks exactly the displayed revision',()=>{
 const t=translator(en),v={...version,retrieval:null};const input=macroDrawerInput(target,v,[{...v,observation_id:'[new-id]',version:2,value_text:'4.3'},v],t,'en');if(input.variant!=='ok')throw new Error('expected ok');
 expect(input.payload.source.url).toBeNull();expect(input.payload.times.ingested_at).toBeNull();expect(input.extras?.rows?.source).toEqual([]);expect(input.extras?.revisions).toHaveLength(2);expect(input.extras?.revisions?.filter(r=>r.current)).toHaveLength(1);expect(input.extras?.revisions?.find(r=>r.current)?.version).toContain('v1');
});
it('uses source adapter and fallback identity with no version, and missing source safely',()=>{
 const t=translator(en);const input=macroDrawerInput({...target,observationId:null},null,null,t,'en');if(input.variant!=='ok')throw new Error('expected ok');expect(input.payload.identity.id).toBe(target.seriesId);expect(input.payload.source.adapter).toBe(t('drawer.adapters.fred_csv'));expect(input.payload.times.available_at).toBe(t('drawer.missing'));
 const missing=macroDrawerInput({...target,source:null},null,null,t,'en');if(missing.variant!=='ok')throw new Error('expected ok');expect(missing.payload.source.publisher).toBe(t('drawer.missing'));expect(missing.extras?.relay).toBeUndefined();expect(macroDrawerText({...target,source:null},t,'en')('macro:attribution')).toBe(t('drawer.missing'));
});
