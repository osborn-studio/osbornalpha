import type {DocumentsDb} from './types';

/** Shared public citation read used by the route and the anon PostgreSQL bridge test. */
export async function readPublicFactCitations(factId:string,read:{
 fact:(id:string)=>Promise<Record<string,unknown>|null>;
 filing:(id:string)=>Promise<{mapping_gen:number|string}|null>;
 links:(id:string,from:number,to:number)=>Promise<{role:string;citation_id:string}[]>;
},db:Pick<DocumentsDb,'citationsByIds'|'documentById'>){
 const fact=await read.fact(factId);
 if(!fact)return null;
 const filing=await read.filing(String(fact.filing_id));
 if(!filing||Number(filing.mapping_gen)<1)return null;
 const links:{role:string;citation_id:string}[]=[];
 for(let from=0;;from+=500){const part=await read.links(factId,from,from+499);links.push(...part);if(part.length<500)break;}
 const wanted=[...new Set(links.map(l=>l.citation_id))];
 const rows=new Map<string,{citation_id:string;document_id:string;extraction_id:string;page_no:number}>();
 for(let i=0;i<wanted.length;i+=100)for(const r of await db.citationsByIds(wanted.slice(i,i+100)))rows.set(r.citation_id,r);
 for(const [cid,r] of rows)if((await db.documentById(r.document_id))?.permission!=='public')rows.delete(cid);
 const citations=links.filter(l=>rows.has(l.citation_id)).map(l=>{const r=rows.get(l.citation_id)!;return {role:l.role,citationId:r.citation_id,documentId:r.document_id,extractionId:r.extraction_id,pageNo:r.page_no};});
 return {factId,concept:fact.concept,periodStart:fact.period_start,periodEnd:fact.period_end,unit:fact.unit,valueText:String(fact.value_text),citations};
}
