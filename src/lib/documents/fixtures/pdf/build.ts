// src/lib/documents/fixtures/pdf/build.ts
// Deterministic builder of the hand-written PDF fixtures (spec §11.1). Two fonts: /FL = Helvetica
// (WinAnsi, Latin runs) and /FU = a Type0 font with Identity-H encoding and a ToUnicode CMap but NO
// embedded font program — pdf.js's text layer comes from ToUnicode alone, so code 0001 → U+2000B 𠀋
// (supplementary plane), 0002 → U+1F600 😀 (emoji), 0003 → U+FF11 '１' (fullwidth, NFKC → '1').
// scripts/documents/make-fixture-pdf.ts writes minimal-two-pages.pdf and no-text.pdf from here; the
// tests assert the committed bytes equal this builder's output.
export type PdfOp={font:'L';x:number;y:number;text:string}|{font:'U';x:number;y:number;codes:number[]};

const CMAP=['begincmap','1 begincodespacerange','<0000><FFFF>','endcodespacerange','3 beginbfchar','<0001><D840DC0B>','<0002><D83DDE00>','<0003><FF11>','endbfchar','endcmap'].join('\n');

/** Latin text: printable ASCII, balanced parentheses, no backslash (a PDF literal string as is); every op is one BT … ET at size 10. */
export function buildPdf(pages:PdfOp[][]):Uint8Array{
 const objs:string[]=[];
 const add=(s:string)=>{objs.push(s);return objs.length;};
 const catalog=add(''),pagesObj=add('');
 const fl=add('<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>');
 const tou=add(`<</Length ${CMAP.length}>>\nstream\n${CMAP}\nendstream`);
 const desc=add('<</Type/FontDescriptor/FontName/U/Flags 4/FontBBox[0 0 1000 1000]>>');
 const cid=add(`<</Type/Font/Subtype/CIDFontType2/BaseFont/U/CIDSystemInfo<</Registry(Adobe)/Ordering(Identity)/Supplement 0>>/FontDescriptor ${desc} 0 R/DW 1000/CIDToGIDMap/Identity>>`);
 const fu=add(`<</Type/Font/Subtype/Type0/BaseFont/U/Encoding/Identity-H/DescendantFonts[${cid} 0 R]/ToUnicode ${tou} 0 R>>`);
 const kids:number[]=[];
 for(const ops of pages){
  const body=ops.map(o=>o.font==='L'?`BT/FL 10 Tf ${o.x} ${o.y} Td(${o.text})Tj ET`:`BT/FU 10 Tf ${o.x} ${o.y} Td<${o.codes.map(c=>c.toString(16).padStart(4,'0')).join('')}>Tj ET`).join('\n');
  const content=add(`<</Length ${body.length}>>\nstream\n${body}\nendstream`);
  kids.push(add(`<</Type/Page/Parent ${pagesObj} 0 R/MediaBox[0 0 300 300]/Resources<</Font<</FL ${fl} 0 R/FU ${fu} 0 R>>>>/Contents ${content} 0 R>>`));
 }
 objs[catalog-1]=`<</Type/Catalog/Pages ${pagesObj} 0 R>>`;
 objs[pagesObj-1]=`<</Type/Pages/Kids[${kids.map(k=>`${k} 0 R`).join(' ')}]/Count ${kids.length}>>`;
 let out='%PDF-1.4\n';const offsets:number[]=[];
 objs.forEach((o,i)=>{offsets.push(out.length);out+=`${i+1} 0 obj\n${o}\nendobj\n`;});   // ASCII only: string length = byte offset
 const xref=out.length;
 out+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n${offsets.map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')}`;
 out+=`trailer\n<</Size ${objs.length+1}/Root ${catalog} 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
 return new TextEncoder().encode(out);
}

/**
 * Page 1: "𠀋😀 Revenue" (two supplementary-plane code points before the cited word), a two-row table
 * "Total 1,234 (5,678)" / "Cost (100) 90", and a fullwidth '１' line. Page 2: "Page two" and
 * "𠀋cash 42" (no gap between the CJK glyph and the Latin run → no space).
 */
export const minimalTwoPagePdf=()=>buildPdf([
 [{font:'U',x:20,y:270,codes:[1,2]},{font:'L',x:44,y:270,text:'Revenue'},
  {font:'L',x:20,y:250,text:'Total'},{font:'L',x:150,y:250,text:'1,234'},{font:'L',x:220,y:250,text:'(5,678)'},
  {font:'L',x:20,y:235,text:'Cost'},{font:'L',x:155,y:235,text:'(100)'},{font:'L',x:235,y:235,text:'90'},
  {font:'U',x:20,y:200,codes:[3]}],
 [{font:'L',x:20,y:270,text:'Page two'},{font:'U',x:20,y:250,codes:[1]},{font:'L',x:30,y:250,text:'cash 42'}],
]);
/** One page with no text operators: the no_text_layer case. */
export const noTextPdf=()=>buildPdf([[]]);
