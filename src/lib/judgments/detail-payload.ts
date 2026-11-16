import {cardsOf,methodKey} from './display';
import type {PublicReads} from './public-reads';

/** The detail projection shared by the route and the PG17 macro bridge test. */
export async function judgmentDetailPayload(r:PublicReads,id:string,v:{view:'latest'|'as_known';asOf:string|null;cutoff?:string},now:string){
 const found=await r.db.envelopeById(id,{view:v.view,cutoff:v.cutoff});
 if(!found)return null;
 const methods=await r.db.listMethodologies();
 const [card]=cardsOf([found],new Map(methods.map(m=>[methodKey(m),m])),{includeAbstained:true,now:v.cutoff??now});
 if(!card)return null;
 const settlements=(await r.settlements(id)).filter(s=>v.cutoff===undefined||s.settled_at<=v.cutoff);
 return {view:v.view,asOf:v.asOf,card,judgment:found.judgment,settlements,calibration:found.calibration?{row:found.calibration,valid:found.calibration_valid}:null};
}
