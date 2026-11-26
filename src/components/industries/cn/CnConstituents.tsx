import Link from 'next/link';
import {useLocale,useTranslations} from 'next-intl';
import type {CnConstituentsView,ConstituentRow,RunHeader,VendorNode} from '@/lib/industry/vendor/page-read';
import {SourceButton} from '../SourceDrawer';
import {StateNotice} from '../StateNotice';
import {vendorMembershipPayload} from '../drawer-model';
import {constituentsPath,hrefWith,nodeName,type Search} from '../hrefs';

export function MembershipTable({rows,node,header}:{rows:ConstituentRow[];node:VendorNode;header:RunHeader}) {
 const t=useTranslations('industries');
 const name=nodeName(node,useLocale()==='en'?'en':'zh');
 return <table className="w-full text-left text-xs sm:text-sm">
  <thead className="text-text-dim"><tr>
   {[t('constituents.company'),t('table.code'),t('cnConstituents.weight'),t('table.source')].map(label=><th key={label} scope="col" className="p-1.5 font-normal">{label}</th>)}
  </tr></thead>
  <tbody>{rows.map(row=><tr key={row.securityCode} className="border-t border-border">
   <th scope="row" className="break-words p-1.5 font-normal">{row.securityName}</th>
   <td className="p-1.5 font-mono tabular-nums">{row.securityCode}</td>
   <td className="p-1.5 text-text-dim">{t('cnConstituents.weightMissing')}</td>
   <td className="p-1.5 text-accent"><SourceButton payload={vendorMembershipPayload(name,row,header)} label={t('cnConstituents.rowSource',{company:row.securityName})}>
    <span className="hidden sm:inline">{t('cnConstituents.snapshotSource')}</span><span className="sm:hidden">{t('table.sourceButton')}</span>
   </SourceButton></td>
  </tr>)}</tbody>
 </table>;
}

export function CnConstituents({view,search}:{view:Extract<CnConstituentsView,{state:'ok'}>;search:Search}) {
 const t=useTranslations('industries');
 const {node,rows,total,page,pageSize,header}=view;
 const pages=Math.max(1,Math.ceil(total/pageSize));
 const href=(p:number)=>hrefWith(constituentsPath('sw2021',node.code),search,{page:String(p)});
 return <>
  <StateNotice kind="currentOnly" body={t('cnConstituents.currentOnly',{date:header.fetchedTo.slice(0,10)})}/>
  <section className="card-base min-w-0">
   <div className="mb-3 flex flex-wrap items-center gap-3">
    <h2 className="font-semibold">{t('page.constituents')}</h2>
    {total>0 && <p className="text-xs text-text-dim">{t('cnConstituents.rowCount',{total,from:(page-1)*pageSize+1,to:Math.min(total,page*pageSize)})}</p>}
    <nav aria-label={t('cnConstituents.pages')} className="ml-auto flex items-center gap-3 text-xs">
     {page>1?<Link href={href(page-1)}>{t('controls.prev')}</Link>:<span aria-disabled="true" className="text-text-dim">{t('controls.prev')}</span>}
     <span className="font-mono">{page} / {pages}</span>
     {page<pages?<Link href={href(page+1)}>{t('controls.next')}</Link>:<span aria-disabled="true" className="text-text-dim">{t('controls.next')}</span>}
    </nav>
   </div>
   {rows.length?<MembershipTable rows={rows} node={node} header={header}/>:<p className="text-sm text-text-dim">{t('cnConstituents.noRows')}</p>}
  </section>
 </>;
}
