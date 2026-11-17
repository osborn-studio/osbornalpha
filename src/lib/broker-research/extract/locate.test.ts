// Verbatim page offsets use UTF-16 code units (spec §5.2).
import {describe,it,expect} from 'vitest';
import {locateQuote,pageText,sliceText,type PageText} from './locate';
import pages from '../fixtures/synthetic-pages.json';
const P:PageText=pages;
describe('locateQuote (spec §5.2, UTF-16 code units)',()=>{
 it('locates a quote and the span slices back verbatim',()=>{const r=locateQuote(P,1,'US$120.00');expect(r).toMatchObject({status:'located',page:1,multiple_hits:null,version:'locate/1'});if(r.status==='located')expect(sliceText(P,1,r.char_start,r.char_end)).toBe('US$120.00');});
 it('counts an astral character before the quote as two code units',()=>{const r=locateQuote(P,2,'platforms');const text=pageText(P,2)!;expect(r.status).toBe('located');if(r.status==='located'){expect(r.char_start).toBe(text.indexOf('platforms'));expect(text.indexOf('platforms')-text.indexOf('🚀')).toBe(3);expect(sliceText(P,2,r.char_start,r.char_end)).toBe('platforms');}});
 it('locates a quote containing a surrogate pair',()=>{const r=locateQuote(P,2,'Internet 🚀 platforms');expect(r.status).toBe('located');if(r.status==='located')expect(r.char_end-r.char_start).toBe('Internet 🚀 platforms'.length);});
 it('never reports a hit that splits a surrogate pair',()=>{const low='🚀'.charAt(1),high='🚀'.charAt(0);expect(locateQuote(P,2,`${low} platforms`)).toMatchObject({status:'unverified',reason:'splits_surrogate_pair'});expect(locateQuote(P,2,`Internet ${high}`)).toMatchObject({status:'unverified',reason:'splits_surrogate_pair'});});
 it('reports every hit (overlapping ones too) and uses the first',()=>{const r=locateQuote(P,1,'Overweight');const text=pageText(P,1)!;expect(r).toMatchObject({status:'located',char_start:text.indexOf('Overweight'),multiple_hits:[text.indexOf('Overweight'),text.lastIndexOf('Overweight')]});expect(locateQuote([{page:1,text:'aaa'}],1,'aa')).toMatchObject({char_start:0,multiple_hits:[0,1]});});
 it('a quote that differs by one space is unverified',()=>{expect(locateQuote(P,1,'US$ 120.00')).toMatchObject({status:'unverified',reason:'not_found'});expect(locateQuote(P,1,'target price  US$120.00')).toMatchObject({status:'unverified',reason:'not_found'});});
 it('does not search other pages, normalize case or width',()=>{expect(locateQuote(P,2,'US$120.00').status).toBe('unverified');expect(locateQuote(P,1,'us$120.00').status).toBe('unverified');expect(locateQuote(P,1,'ＵＳ$120.00').status).toBe('unverified');});
 it('missing page and empty quote',()=>{expect(locateQuote(P,9,'x')).toMatchObject({status:'unverified',reason:'page_missing',page:9});expect(locateQuote(P,1,'')).toMatchObject({status:'unverified',reason:'empty_quote'});});
 it('rejects duplicate page numbers in an artifact',()=>{expect(()=>locateQuote([{page:1,text:'a'},{page:1,text:'b'}],1,'a')).toThrow('duplicate_page:1');});
});
describe('sliceText',()=>{const T:PageText=[{page:1,text:'ab🚀cd'}];it('slices by code units and fails closed on bad spans',()=>{expect(sliceText(T,1,2,4)).toBe('🚀');expect(sliceText(T,1,0,0)).toBe('');expect(sliceText(T,1,3,4)).toBeNull();expect(sliceText(T,1,2,3)).toBeNull();expect(sliceText(T,1,-1,2)).toBeNull();expect(sliceText(T,1,3,2)).toBeNull();expect(sliceText(T,1,0,7)).toBeNull();expect(sliceText(T,1,0.5,2)).toBeNull();expect(sliceText(T,2,0,1)).toBeNull();});});
