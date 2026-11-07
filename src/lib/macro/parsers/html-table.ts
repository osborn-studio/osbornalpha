// src/lib/macro/parsers/html-table.ts
// Minimal, deterministic HTML table reader for the two official HTML sources (ChinaBond yield history,
// SAFE central parity). Not a general HTML parser: comments are dropped, then only <table>, <tr>, <td>
// and <th> tags are tracked, with nesting, so each table's own rows/cells are kept apart from nested
// tables. Cell text = inner HTML without tags, &nbsp;/&amp;/&lt;/&gt;/&quot;/&#NN; decoded, whitespace
// collapsed and trimmed. Tables are numbered by start-tag order (0-based), which is the `table` of an
// html_cell locator; `row` is the index in HtmlTable.rows (header row = 0) and `cell` the index in the row.
export interface HtmlTable{index:number;rows:string[][]}

const TAG=/<(\/?)(table|tr|td|th)\b[^>]*>/gi;
function cellText(html:string):string{
 return html.replace(/<[^>]*>/g,'')
  .replace(/&nbsp;?/gi,' ').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&quot;/gi,'"').replace(/&#(\d{1,6});/g,(_m,d:string)=>String.fromCodePoint(Number(d)))
  .replace(/&amp;/gi,'&').replace(/[\s ]+/g,' ').trim();
}

export function htmlTables(html:string):HtmlTable[]{
 const text=html.replace(/<!--[\s\S]*?-->/g,'');
 const out:HtmlTable[]=[];
 interface Open{table:HtmlTable;row:string[]|null;cellStart:number}
 const stack:Open[]=[];
 const closeCell=(o:Open,end:number)=>{if(o.row&&o.cellStart>=0){o.row.push(cellText(text.slice(o.cellStart,end)));o.cellStart=-1;}};
 const closeRow=(o:Open,end:number)=>{closeCell(o,end);if(o.row){o.table.rows.push(o.row);o.row=null;}};
 for(const m of text.matchAll(TAG)){
  const closing=m[1]==='/',tag=m[2].toLowerCase(),at=m.index!,after=at+m[0].length;
  const top=stack[stack.length-1];
  if(tag==='table'){
   if(!closing){const t:HtmlTable={index:out.length,rows:[]};out.push(t);stack.push({table:t,row:null,cellStart:-1});}
   else if(top){closeRow(top,at);stack.pop();}
   continue;
  }
  if(!top)continue;
  if(tag==='tr'){if(closing)closeRow(top,at);else{closeRow(top,at);top.row=[];}continue;}
  // td / th
  if(closing){closeCell(top,at);continue;}
  if(!top.row)top.row=[];   // a cell without <tr> opens an implicit row
  closeCell(top,at);top.cellStart=after;
 }
 for(const o of stack.reverse())closeRow(o,text.length);
 return out;
}
