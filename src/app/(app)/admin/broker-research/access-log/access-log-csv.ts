// src/app/(app)/admin/broker-research/access-log/access-log-csv.ts
// CSV export of the access log (AccessLog artboard): every field quoted, quotes doubled, and cells
// starting with = + - @ prefixed with ' so spreadsheets do not evaluate them.
import type {AccessLogView} from '../_shared/admin-fetch';
const cell=(v:string)=>`"${(/^[=+\-@]/.test(v)?`'${v}`:v).replace(/"/g,'""')}"`;
export function toCsv(rows:AccessLogView[]):string{
 const head='id,created_at,user_id,action,document_id,detail';
 return [head,...rows.map(r=>[r.id,r.created_at,r.user_id,r.action,r.document_id??'',JSON.stringify(r.detail??{})].map(cell).join(','))].join('\n');
}
