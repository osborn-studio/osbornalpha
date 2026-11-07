// src/components/macro/charts/chart-geometry.ts
// Pure geometry and data helpers for macro charts (spec §3.3, §3.4). Numbers here only position marks; every
// printed number comes from value_text through macro-format.ts.
const r1=(v:number)=>Math.round(v*10)/10;
export function sparklinePoints(values:readonly string[],w:number,h:number,pad=2):string{
 const nums=values.map(Number);if(nums.length<2||nums.some(n=>!Number.isFinite(n)))return '';
 const lo=Math.min(...nums),hi=Math.max(...nums),span=hi-lo;
 return nums.map((n,i)=>`${r1(pad+(i*(w-2*pad))/(nums.length-1))},${r1(span===0?h/2:pad+((hi-n)*(h-2*pad))/span)}`).join(' ');
}
export interface ScatterGeometry{dots:{cx:number;cy:number}[];line:{x1:number;y1:number;x2:number;y2:number};xDomain:[number,number];yDomain:[number,number]}
export function scatterGeometry(pairs:readonly {x:number;y:number}[],fit:{slope:number;intercept:number},w:number,h:number,pad=28):ScatterGeometry{
 const xs=pairs.map(p=>p.x),ys=pairs.map(p=>p.y);
 let x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
 if(x0===x1){x0-=1;x1+=1;}if(y0===y1){y0-=1;y1+=1;}
 const sx=(x:number)=>r1(pad+((x-x0)/(x1-x0))*(w-2*pad)),sy=(y:number)=>r1(h-pad-((y-y0)/(y1-y0))*(h-2*pad));
 return {dots:pairs.map(p=>({cx:sx(p.x),cy:sy(p.y)})),line:{x1:sx(x0),y1:sy(fit.intercept+fit.slope*x0),x2:sx(x1),y2:sy(fit.intercept+fit.slope*x1)},xDomain:[x0,x1],yDomain:[y0,y1]};
}
export function withAlpha(color:string,alpha:number):string{
 const hex=/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
 if(hex){const h=hex[1].length===3?hex[1].split('').map(c=>c+c).join(''):hex[1];return `rgba(${parseInt(h.slice(0,2),16)}, ${parseInt(h.slice(2,4),16)}, ${parseInt(h.slice(4,6),16)}, ${alpha})`;}
 const rgb=/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(color.trim());
 return rgb?`rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${alpha})`:color;
}
/** Each marker moves to the first point time on/after its own date (lightweight-charts markers need a bar). */
export function snapMarkers<T extends {time:string}>(times:readonly string[],markers:readonly T[]):T[]{
 const out:T[]=[];
 for(const m of markers){const at=times.find(x=>x>=m.time);if(at)out.push({...m,time:at});}
 return out.sort((a,b)=>a.time.localeCompare(b.time));
}
/** Points whose month lies within a band's start..end months (inclusive); the first matching band wins. */
export function bandPoints<D extends string>(times:readonly string[],bands:readonly {start:string;end:string;direction:D}[]):{time:string;direction:D}[]{
 return times.flatMap(time=>{const m=time.slice(0,7);const b=bands.find(x=>m>=x.start.slice(0,7)&&m<=x.end.slice(0,7));return b?[{time,direction:b.direction}]:[];});
}
