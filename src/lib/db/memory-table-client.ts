// In-memory TableClient for unit tests. Optional `keys` declares ONE unique key (the primary key)
// per table so duplicate inserts, key-changing updates and upserts fail like PostgreSQL would
// (TableError code 23505); an upsert whose onConflict is not exactly that key set fails with
// 42P10 like PostgreSQL's "no unique constraint matching ON CONFLICT". Rows are deep-copied in
// and out so callers never share jsonb references with the store.
// Differences from PostgreSQL to keep in mind:
//  - no column defaults, generated values, triggers or check constraints: write every column;
//  - ordering and range filters (gte/lt) compare numbers numerically and everything else as
//    strings by UTF-16 code unit, which matches PostgreSQL only under C collation (ISO-8601
//    timestamps in one fixed format compare correctly; mixed offsets or locales do not).
//  - rpc emulates only the plan-3 row-locking functions (append_claim_evidence, patch_quarantine_detail, set_security_identifier, set_issuer_identifier, set_security_window, patch_security_provenance, close_security_absent, settle_reconcile_cycle, record_cycle_freshness); one synchronous JS turn stands for the row lock.
import {CADENCES,computeFreshness} from '../dq/freshness';
import type {Cadence} from '../dq/freshness';
import {TableError,assertMatch,assertUpdateMatch,checkRangeOptions,checkSelectOptions} from './table-client';
import type {RangeOptions,Row,TableClient} from './table-client';

const matches=(row:Row,match:Row)=>Object.entries(match).every(([k,v])=>row[k]===v);
const clone=<T>(v:T):T=>structuredClone(v);
const cmp=(x:unknown,y:unknown)=>{
 if(typeof x==='number'&&typeof y==='number')return x<y?-1:x>y?1:0;
 const a=String(x),b=String(y);return a<b?-1:a>b?1:0;
};
// PostgreSQL default: NULLS LAST ascending, NULLS FIRST descending.
const compare=(k:string,desc:boolean)=>(a:Row,b:Row)=>{
 const x=a[k],y=b[k];
 if(x==null||y==null)return x==null&&y==null?0:x==null?(desc?-1:1):(desc?1:-1);
 const c=cmp(x,y);return desc?-c:c;
};
// SQL comparison with NULL is never true, so null/missing values are excluded.
const inRange=(row:Row,opts:RangeOptions)=>
 Object.entries(opts.gte??{}).every(([k,v])=>row[k]!=null&&cmp(row[k],v)>=0)&&
 Object.entries(opts.lt??{}).every(([k,v])=>row[k]!=null&&cmp(row[k],v)<0);

// Plan 3 row-locking functions (migration 20261107090000, Task 1b) with the SQL functions' answers
// and error codes; an unknown function fails like PostgreSQL (42883).
const isObj=(v:unknown):v is Row=>!!v&&typeof v==='object'&&!Array.isArray(v);
const sameEvidence=(a:unknown,b:Row)=>isObj(a)&&a.source===b.source&&a.evidence_sha256===b.evidence_sha256;
const SHA256=/^[0-9a-f]{64}$/;
const MEMORY_RPC:Record<string,(rowsOf:(t:string)=>Row[],a:Row)=>unknown>={
 // twin of dq_reconcile_failed_counts: distinct (pair, natural_key) by latest row (created_at, then id), failures per pair
 dq_reconcile_failed_counts(rowsOf){
  const latest=new Map<string,Row>();
  const key=(r:Row)=>`${String(r.created_at??'')}\u0000${String(r.id)}`;
  for(const r of rowsOf('dq_reconciliations')){const k=`${String(r.pair)}\u0000${String(r.natural_key)}`;const cur=latest.get(k);if(!cur||key(r)>key(cur))latest.set(k,r);}
  const out=new Map<string,number>();
  for(const r of latest.values())if(r.passed===false)out.set(String(r.pair),(out.get(String(r.pair))??0)+1);
  return [...out].map(([pair,failed])=>({pair,failed}));
 },
 // Task 14b review: twins of settle_reconcile_cycle / record_cycle_freshness (migration 20261107091000 section 14); detail is only ever
 // touched at the freshness key, so a pending_members entry registered meanwhile survives.
 settle_reconcile_cycle(rowsOf,a){
  const c=a.p_counts,f=a.p_freshness;
  if(!isObj(c)||!isObj(f)||typeof f.ok!=='boolean'||f.status!=='pending'||(a.p_status!=='complete'&&a.p_status!=='complete_with_gaps'))throw new TableError('rpc','settle_reconcile_cycle','invalid_settlement','22023');
  const row=rowsOf('dq_reconcile_cycles').find(r=>r.pair===a.p_pair&&r.cycle_id===a.p_cycle_id&&r.status==='running');
  if(!row)return false;
  Object.assign(row,{status:a.p_status,finished_at:typeof c.finished_at==='string'?c.finished_at:new Date().toISOString(),compared_passed:c.compared_passed,compared_failed:c.compared_failed,not_compared:c.not_compared,exec_failed_members:c.exec_failed_members,detail:{...(isObj(row.detail)?row.detail:{}),freshness:clone(f)}});
  return true;
 },
 record_cycle_freshness(rowsOf,a){
  const cadence=a.p_cadence as Cadence;
  if(typeof a.p_dataset!=='string'||a.p_dataset.length<1||a.p_dataset.length>64||!CADENCES.includes(cadence)||typeof a.p_at!=='string'||!Number.isFinite(Date.parse(a.p_at)))throw new TableError('rpc','record_cycle_freshness','invalid_freshness','22023');
  const row=rowsOf('dq_reconcile_cycles').find(r=>r.pair===a.p_pair&&r.cycle_id===a.p_cycle_id);
  if(!row)return 'not_found';
  if(row.status==='running')return 'not_terminal';
  const d=isObj(row.detail)?row.detail:{};const f=d.freshness;
  if(!isObj(f)||typeof f.ok!=='boolean')return 'no_freshness';
  if(f.status==='recorded')return 'already';
  const at=new Date(a.p_at);
  const rows=rowsOf('dq_freshness');const ex=rows.find(r=>r.dataset===a.p_dataset);
  const prevOk=ex?.last_ok_at?new Date(String(ex.last_ok_at)):null;
  const errs=f.ok?0:Number(ex?.consecutive_errors??0)+1;
  const lastOk=f.ok?at:prevOk;
  const next={dataset:a.p_dataset,expected_cadence:cadence,last_ok_at:lastOk?lastOk.toISOString():null,last_attempt_at:at.toISOString(),consecutive_errors:errs,status:computeFreshness({cadence,lastOkAt:lastOk,consecutiveErrors:errs,now:at}),detail:isObj(f.detail)?clone(f.detail):{},updated_at:at.toISOString()};
  if(ex)Object.assign(ex,next);else rows.push(next);
  row.detail={...d,freshness:{...f,status:'recorded'}};
  return 'recorded';
 },
 append_claim_evidence(rowsOf,a){
  const e=a.p_evidence;
  if(!isObj(e)||typeof e.source!=='string'||e.source.length<1||e.source.length>64||typeof e.as_of!=='string'||typeof e.evidence_sha256!=='string'||!SHA256.test(e.evidence_sha256))
   throw new TableError('rpc','append_claim_evidence','invalid_evidence','22023');
  const row=rowsOf('issuer_identifier_claims').find(r=>r.status==='pending'&&r.issuer_id===a.p_issuer&&r.id_type===a.p_id_type&&r.value===a.p_value&&r.op===a.p_op&&r.target_key===a.p_target_key);
  if(!row)return 'not_found';
  const d=isObj(row.detail)?row.detail:{};
  const sources=Array.isArray(d.sources)?d.sources:[];
  if(sameEvidence(d.evidence,e)||sources.some(s=>sameEvidence(s,e)))return 'duplicate';
  row.detail={...d,sources:[...sources,clone(e)]};
  return 'appended';
 },
 patch_quarantine_detail(rowsOf,a){
  const key=a.p_key;
  if(key!=='hook'&&key!=='audit_written')throw new TableError('rpc','patch_quarantine_detail','invalid_detail_key','22023');
  if(a.p_value===null||a.p_value===undefined)throw new TableError('rpc','patch_quarantine_detail','invalid_detail_key','22023');
  const row=rowsOf('dq_quarantine').find(r=>r.id===a.p_id);
  if(!row)return false;
  const cur=isObj(row.detail)?row.detail:{};
  // compare-and-set (Task 11 review, Codex P2): a given p_expect_hook_at must equal detail.hook.at, else nothing is written
  if(a.p_expect_hook_at!==undefined&&a.p_expect_hook_at!==null){
   const hook=isObj(cur.hook)?cur.hook:{};
   if(hook.at===undefined||hook.at===null||String(hook.at)!==String(a.p_expect_hook_at))return 'stale';
  }
  row.detail={...cur,[key]:clone(a.p_value)};
  return true;
 },
 // plan audit round 3, R2: guarded ISIN/FIGI write + one provenance key merged (never replaced) in one step
 // Task 4b review P1: guarded issuers.cninfo_org_id write + one provenance key merged (never replaced)
 set_issuer_identifier(rowsOf,a){
  const pv=a.p_provenance,v=a.p_value;
  if(a.p_column!=='cninfo_org_id')throw new TableError('rpc','set_issuer_identifier','invalid_column','22023');
  // not mirrored: SQL claim_provenance_safe (credential-like key names, URLs, UUIDs); callers pass fixed-shape provenance and the DB suite covers rejection
  if(typeof v!=='string'||v.trim()===''||!isObj(pv))throw new TableError('rpc','set_issuer_identifier','invalid_identifier_write','22023');
  const row=rowsOf('issuers').find(r=>r.issuer_id===a.p_issuer);
  if(!row)return 'not_found';
  if(row.status!=='active')return 'not_active';
  if(row.cninfo_org_id!=null)return row.cninfo_org_id===v?'duplicate':'conflict';
  if(rowsOf('issuers').some(r=>r!==row&&r.cninfo_org_id===v))return 'conflict';   // issuers_cninfo_idx
  row.cninfo_org_id=v;
  row.provenance={...(isObj(row.provenance)?row.provenance:{}),cninfo_org_id:clone(pv)};
  row.updated_at=new Date().toISOString();
  return 'written';
 },
 // Task 5a: guarded evidenced-window write (date + method + one provenance key). Not mirrored: claim_provenance_safe and the no-overlap exclusion (DB suite).
 set_security_window(rowsOf,a){
  const side=a.p_side,pv=a.p_provenance,nd=a.p_new_date,tm='delisting';
  if((side!=='from'&&side!=='to')||typeof nd!=='string'||!isObj(pv)||Object.keys(pv).length!==1||!(`valid_${side}` in pv)|| 'p_to_method' in a)
   throw new TableError('rpc','set_security_window','invalid_window_write','22023');
  if(!rowsOf('issuers').some(r=>r.issuer_id===a.p_issuer))return 'not_found';
  const row=rowsOf('issuer_securities').find(r=>r.issuer_id===a.p_issuer&&r.ticker===a.p_ticker&&r.valid_from===a.p_valid_from);
  if(!row)return 'not_found';
  const prov=isObj(row.provenance)?row.provenance:{};
  if(side==='from'){
   if(row.valid_from_method==='listing_date'&&row.valid_from===nd&&'valid_from' in prov)return 'duplicate';
   if((row.valid_from_method!=='first_observed'&&row.valid_from_method!=='curated')||nd>String(row.valid_from))return 'conflict';
   if(rowsOf('issuer_securities').some(o=>o!==row&&o.ticker===a.p_ticker&&String(o.valid_from)<String(row.valid_from)))return 'conflict';   // not the ticker's earliest row
   row.valid_from=nd;row.valid_from_method='listing_date';
  }else{
   if(row.valid_to===nd&&row.valid_to_method===tm&&'valid_to' in prov)return 'duplicate';
   if(row.valid_to!=null||nd<=String(row.valid_from))return 'conflict';
   row.valid_to=nd;row.valid_to_method=tm;
  }
  row.provenance={...prov,...clone(pv)};
  return 'written';
 },
 // Review fix: conditional sec_file_absent close (pending marker must match what the run observed).
 close_security_absent(rowsOf,a){
  const pv=a.p_provenance;
  if(typeof a.p_valid_to!=='string'||typeof a.p_expected_first_missing_sha256!=='string'||!isObj(pv)||Object.keys(pv).length!==1||!('valid_to' in pv))
   throw new TableError('rpc','close_security_absent','invalid_window_write','22023');
  if(!rowsOf('issuers').some(r=>r.issuer_id===a.p_issuer))return 'not_found';
  const row=rowsOf('issuer_securities').find(r=>r.issuer_id===a.p_issuer&&r.ticker===a.p_ticker&&r.valid_from===a.p_valid_from);
  if(!row)return 'not_found';
  const prov=isObj(row.provenance)?row.provenance:{};
  const pc=isObj(prov.pending_change)?prov.pending_change:{};
  if(row.valid_to===a.p_valid_to&&row.valid_to_method==='sec_file_absent'&&'valid_to' in prov&&pc.first_missing_sha256===a.p_expected_first_missing_sha256)return 'duplicate';
  if(row.valid_to!=null||a.p_valid_to<=String(row.valid_from)||pc.first_missing_sha256!==a.p_expected_first_missing_sha256||pc.first_missing_as_of!==a.p_valid_to)return 'conflict';
  row.valid_to=a.p_valid_to;row.valid_to_method='sec_file_absent';row.provenance={...prov,...clone(pv)};
  return 'written';
 },
 // Task 6b: the only writer of provenance.pending_change; open rows only. claim_provenance_safe is not mirrored (DB suite).
 patch_security_provenance(rowsOf,a){
  const set=a.p_set,rm=a.p_remove;
  if(!isObj(set)||Object.keys(set).some(k=>k!=='pending_change')||!Array.isArray(rm)||rm.some(k=>k!=='pending_change'))
   throw new TableError('rpc','patch_security_provenance','invalid_provenance_patch','22023');
  if(!rowsOf('issuers').some(r=>r.issuer_id===a.p_issuer))return 'not_found';
  const row=rowsOf('issuer_securities').find(r=>r.issuer_id===a.p_issuer&&r.ticker===a.p_ticker&&r.valid_from===a.p_valid_from&&r.valid_to==null);
  if(!row)return 'not_found';
  const prov=isObj(row.provenance)?row.provenance:{};
  const next:Row={...prov};for(const k of rm)delete next[k];Object.assign(next,clone(set));
  if(JSON.stringify(Object.entries(next).sort())===JSON.stringify(Object.entries(prov).sort()))return 'duplicate';
  row.provenance=next;
  return 'written';
 },
 set_security_identifier(rowsOf,a){
  const col=a.p_column,v=a.p_value,pv=a.p_provenance;
  if((col!=='isin'&&col!=='figi')||typeof v!=='string'||v===''||!isObj(pv)||Object.keys(pv).length!==1||!(col in pv))
   throw new TableError('rpc','set_security_identifier','invalid_identifier_write','22023');
  const row=rowsOf('issuer_securities').find(r=>r.issuer_id===a.p_issuer&&r.ticker===a.p_ticker&&r.valid_from===a.p_valid_from&&r.valid_to==null);
  if(!row)return 'not_found';
  const prov=isObj(row.provenance)?row.provenance:{};
  const cur=row[col]==null?null:String(row[col]);
  if(cur!==null&&cur!==v)return 'conflict';
  if(cur===v&&col in prov)return 'duplicate';
  row.provenance={...prov,...clone(pv)};
  if(cur===null){row[col]=v;return 'written';}
  return 'duplicate';
 },
};

export function memoryTableClient(keys:Record<string,string[]>={}):TableClient&{rows(table:string):Row[];rpc(fn:string,args:Row):Promise<unknown>}{
 const tables=new Map<string,Row[]>();
 const rowsOf=(t:string)=>{if(!tables.has(t))tables.set(t,[]);return tables.get(t)!;};
 const keyOf=(t:string,row:Row)=>(keys[t]??[]).map(k=>String(row[k])).join('\u0000');
 const dup=(op:string,t:string)=>new TableError(op,t,`duplicate key value violates unique constraint "${t}_pkey"`,'23505');
 const clashes=(t:string,row:Row,except?:Row)=>!!keys[t]&&rowsOf(t).some(r=>r!==except&&keyOf(t,r)===keyOf(t,row));
 return {
  rows:(t)=>clone(rowsOf(t)),
  async insert(t,row){
   if(clashes(t,row))throw dup('insert',t);
   const copy=clone(row);rowsOf(t).push(copy);return clone(copy);
  },
  async update(t,match,patch){
   assertUpdateMatch(match);
   const rows=rowsOf(t);
   const next=rows.map(r=>matches(r,match)?{...r,...clone(patch)}:r);
   // Check every resulting key before mutating any row, so a clash leaves the table unchanged.
   if(keys[t]){const seen=new Set<string>();for(const r of next){const k=keyOf(t,r);if(seen.has(k))throw dup('update',t);seen.add(k);}}
   let n=0;
   rows.forEach((r,i)=>{if(next[i]!==r){Object.assign(r,next[i]);n++;}});
   return n;
  },
  async select(t,match,opts={}){
   assertMatch(match);checkSelectOptions(opts);
   let out=rowsOf(t).filter(r=>matches(r,match)&&inRange(r,opts));
   if(opts.orderBy)out=[...out].sort(compare(opts.orderBy,!!opts.desc));
   if(opts.offset)out=out.slice(opts.offset);
   if(opts.limit!==undefined)out=out.slice(0,opts.limit);
   return clone(out);
  },
  async count(t,match,opts={}){
   assertMatch(match);checkRangeOptions(opts);
   return rowsOf(t).filter(r=>matches(r,match)&&inRange(r,opts)).length;
  },
  async upsert(t,row,onConflict){
   const cols=onConflict.split(',').map(s=>s.trim());
   if(keys[t]){
    const declared=new Set(keys[t]);
    if(cols.length!==declared.size||!cols.every(c=>declared.has(c)))
     throw new TableError('upsert',t,'there is no unique or exclusion constraint matching the ON CONFLICT specification','42P10');
   }
   const rows=rowsOf(t);const hit=rows.find(r=>cols.every(c=>r[c]===row[c]));
   if(clashes(t,{...hit,...row},hit))throw dup('upsert',t);
   if(hit)Object.assign(hit,clone(row));else rows.push(clone(row));
  },
  async rpc(fn,args){
   const impl=MEMORY_RPC[fn];
   if(!impl)throw new TableError('rpc',fn,`function public.${fn} does not exist`,'42883');
   return clone(impl(rowsOf,clone(args)));
  },
 };
}
