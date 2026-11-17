import {expect,it} from 'vitest';
import {parseSyncArgs,planRetirements,applyRetirements} from './methodology-retirement';
import {memoryJudgmentsDb} from './memory-judgments-db';
import {REGISTRY,methodologyRowOf} from './registry';
import {formulaHashOf} from './formula-hash';
import {MACRO_METHOD} from './macro-method';
const m=REGISTRY[0];
const row=()=>methodologyRowOf(m,formulaHashOf(m),{publishable:false,code_version:'a'.repeat(40)});
it('shares the single registered macro method selector',()=>{
 expect(REGISTRY.filter(m=>m.id===MACRO_METHOD.id).map(m=>m.version)).toEqual([MACRO_METHOD.version]);
});
it('parses repeatable retirement keys and requires a meaningful reason',()=>{
 const a=parseSyncArgs(['--dry-run','--retire','macro_regime@v2','--retire','macro_regime@v1','--reason','catalog change completed']);
 expect(a.dryRun).toBe(true);expect([...a.retire]).toEqual(['macro_regime@v2','macro_regime@v1']);
 for(const args of [['--retire','bad'],['--retire','macro_regime@v2'],['--retire','macro_regime@v2','--reason','short'],['--reason','unused reason text'],['--oops']])expect(()=>parseSyncArgs(args)).toThrow();
 expect(parseSyncArgs(['--only','macro_regime@v3','--publishable','macro_regime@v3','--owner-confirmation','owner confirmed terms','--unpublish','other@v1']).publish.has('macro_regime@v3')).toBe(true);
});
it('refuses registry members, missing rows and successors absent or inactive in the database',async()=>{
 const db=memoryJudgmentsDb(),reason='catalog change completed';
 await expect(planRetirements(new Set(['macro_regime@v3']),reason,REGISTRY,db)).rejects.toThrow(/in_registry/);
 await expect(planRetirements(new Set(['macro_regime@v2']),reason,REGISTRY,db)).rejects.toThrow(/missing/);
 await db.syncMethodology({...row(),version:'v2'},'script',null);
 await expect(planRetirements(new Set(['macro_regime@v2']),reason,REGISTRY,db)).rejects.toThrow(/newer_active/);
 await db.syncMethodology({...row(),status:'draft'},'script',null);
 await expect(planRetirements(new Set(['macro_regime@v2']),reason,REGISTRY,db)).rejects.toThrow(/newer_active/);
});
it('dry-run preserves the row; applying retires once and preserves its formula',async()=>{
 const db=memoryJudgmentsDb();await db.syncMethodology({...row(),version:'v2'},'script',null);await db.syncMethodology(row(),'script',null);
 const before=await db.methodology('macro_regime','v2');
 const plan=await planRetirements(new Set(['macro_regime@v2']),'catalog change completed',REGISTRY,db);
 expect(plan).toEqual([{key:'macro_regime@v2',id:'macro_regime',version:'v2',reason:'catalog change completed'}]);
 expect(await applyRetirements(plan,db,true)).toEqual([]);expect(await db.methodology('macro_regime','v2')).toEqual(before);
 expect(await applyRetirements(plan,db,false)).toEqual([{changed:true,seq:2}]);
 expect(await applyRetirements(plan,db,false)).toEqual([{changed:false}]);
 expect(await db.methodology('macro_regime','v2')).toMatchObject({status:'retired',formula_hash:before!.formula_hash});
 expect(await db.methodologyStateAt('macro_regime','v2','2099-01-01')).toMatchObject({event:'status_changed',status:'retired',actor:'script',reason:'catalog change completed'});
 await expect(db.retireMethodology('macro_regime','v2','bad','valid reason')).rejects.toThrow();
 await expect(db.retireMethodology('macro_regime','v2','script',' ')).rejects.toThrow();
 await expect(db.retireMethodology('missing','v1','script','valid reason')).rejects.toThrow();
});
