// Verbatim overlap length across normalized Unicode source and summary (spec §6.4).
import {describe,it,expect} from 'vitest';
import {maxVerbatimOverlap} from './overlap';
const brute=(a:string,b:string)=>{const x=Array.from(a),y=Array.from(b);let best=0;for(let i=0;i<x.length;i++)for(let j=0;j<y.length;j++){let k=0;while(i+k<x.length&&j+k<y.length&&x[i+k]===y[j+k])k++;best=Math.max(best,k);}return best;};
describe('maxVerbatimOverlap',()=>{
 it('counts longest copied run in code points',()=>{const src='The company reported strong growth in cloud revenue this quarter.';expect(maxVerbatimOverlap('We note strong growth in cloud demand.',src)).toBe(' strong growth in cloud '.length);expect(maxVerbatimOverlap('完全不同',src)).toBe(0);expect(maxVerbatimOverlap('',src)).toBe(0);expect(maxVerbatimOverlap('🚀🚀x','a🚀🚀xb')).toBe(3);});
 it('normalizes whitespace and NFKC',()=>{expect(maxVerbatimOverlap('strong growth in cloud','strong\n  growth in\tcloud')).toBe('strong growth in cloud'.length);expect(maxVerbatimOverlap('ＡＢＣ','ABC')).toBe(3);});
 it('matches brute force on pseudo-random strings',()=>{let seed=7;const rnd=()=>(seed=(seed*1103515245+12345)%2147483648)/2147483648;const gen=(n:number)=>Array.from({length:n},()=>'abc 中'[Math.floor(rnd()*5)]).join('').replace(/\s+/g,' ');for(let i=0;i<200;i++){const a=gen(1+Math.floor(rnd()*30)),b=gen(1+Math.floor(rnd()*60));expect(maxVerbatimOverlap(a,b)).toBe(brute(a,b));}});
 it('scans a long source in linear time',()=>{const src='x'.repeat(300000)+'needle in a haystack';const t=Date.now();expect(maxVerbatimOverlap('a needle in a hay',src)).toBe('needle in a hay'.length);expect(Date.now()-t).toBeLessThan(2000);});
});
