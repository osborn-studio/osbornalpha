// Longest normalized copied run between summary and source (spec §6.4(a), overlap/1).
// A suffix automaton indexes the short summary; source scanning is linear in code points.
export {OVERLAP_VERSION} from '../versions';
const prep=(s:string)=>Array.from(s.normalize('NFKC').replace(/\s+/g,' ')).map(c=>c.codePointAt(0)!);
export function maxVerbatimOverlap(summary:string,source:string):number{
 const a=prep(summary),b=prep(source);if(!a.length||!b.length)return 0;
 const len=[0],link=[-1],next:Map<number,number>[]=[new Map()];let last=0;
 for(const c of a){
  const cur=len.length;len.push(len[last]+1);link.push(0);next.push(new Map());let p=last;
  while(p!==-1&&!next[p].has(c)){next[p].set(c,cur);p=link[p];}
  if(p!==-1){const q=next[p].get(c)!;if(len[p]+1===len[q])link[cur]=q;else{const clone=len.length;len.push(len[p]+1);link.push(link[q]);next.push(new Map(next[q]));while(p!==-1&&next[p].get(c)===q){next[p].set(c,clone);p=link[p];}link[q]=clone;link[cur]=clone;}}
  last=cur;
 }
 let v=0,l=0,best=0;
 for(const c of b){while(v!==-1&&!next[v].has(c))v=link[v];if(v===-1){v=0;l=0;continue;}l=Math.min(l,len[v])+1;v=next[v].get(c)!;if(l>best)best=l;}
 return best;
}
