// Strict table grammar preserves every cell exactly. Both domain parsers check all block headers first.
import {decodeGildataBody,GildataParseError} from './envelope';
function malformed():never{throw new GildataParseError('parse_failed','malformed_table');}
function cells(line:string){
 if(!line.startsWith('|')||!line.endsWith('|')||line.length<2||line.includes('\r'))return malformed();
 return line.slice(1,-1).split('|');
}
export function parseMarkdownTable(md:string):{header:string[];rows:string[][]}{
 const lines=md.split(/\r?\n/);
 while(lines.length&&!lines.at(-1)!.trim())lines.pop();
 if(lines.length<2)return malformed();
 const header=cells(lines[0]),separator=lines[1].trimEnd();
 if(header.some(h=>!h.length)||!separator.startsWith('|')||/[^|: -]/.test(lines[1]))return malformed();
 const rules=separator.replace(/\|$/,'').slice(1).split('|');
 if(rules.length!==header.length||rules.some(rule=>!/^ *:?-+:? *$/.test(rule)))return malformed();
 const rows=lines.slice(2).map(cells);
 if(rows.some(r=>r.length!==header.length))return malformed();
 return {header,rows};
}
export function checkedTables(bytes:Uint8Array,apiName:string,columns:readonly string[]){
 const {blocks,canonicalSha256}=decodeGildataBody(bytes);
 if(!blocks.length)throw new GildataParseError('request_mismatch','empty_response');
 if(blocks.some(b=>b.apiName!==apiName))throw new GildataParseError('request_mismatch','unexpected_api_name');
 const tables=blocks.map(b=>{
  const {rows,header}=parseMarkdownTable(b.tableMarkdown);
  if(header.length!==columns.length||header.some((h,i)=>h!==columns[i]))throw new GildataParseError('parse_failed','unexpected_columns');
  return rows;
 });
 return {canonicalSha256,apiNames:[apiName],tables};
}
