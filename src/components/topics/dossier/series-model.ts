// Topic spec §7.2, A17: frozen repeated series with explicit gaps.
import type {PublicEvidence} from '@/lib/topics/public-dto';
export function seriesModel(rows:PublicEvidence[]){
 const macro=rows.filter(e=>e.kind==='macro_observation');
 const key=(e:PublicEvidence)=>typeof e.fact?.slots.series==='string'?e.fact.slots.series:null;
 const series=macro.map(key).find(s=>s!==null&&macro.filter(e=>key(e)===s).length>=2);
 if(!series)return null;
 const known=macro.filter(e=>key(e)===series),periods=known.flatMap(e=>e.period?[e.period]:[]).sort();
 const selected=macro.filter(e=>key(e)===series||(key(e)===null&&e.period!==null&&e.period>=periods[0]&&e.period<=periods[periods.length-1])).sort((a,b)=>(a.period??'').localeCompare(b.period??'')||a.ordinal-b.ordinal);
 return {series,points:selected.map(e=>{
  const slot=e.state==='ok'&&!e.masked?e.fact?.slots.value:null;
  const value=slot&&typeof slot!=='string'?Number(slot.value_text):NaN;
  return {x:e.period??'',y:Number.isFinite(value)?value:null};
 }),tableRows:rows};
}
