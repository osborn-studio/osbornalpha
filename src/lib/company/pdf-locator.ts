// src/lib/company/pdf-locator.ts
// CN per-value PDF locators (spec §0.1 item 2'): produced by spec 3's cninfo per-value reconciliation,
// which has not landed. The default source returns nothing, so every public CN value is withheld as
// citation_pending; spec 3 injects a real source later. staticPdfLocatorSource serves tests and the
// injected CN acceptance fixture of §0 #65.
import type {Market} from '@/lib/facts/types';
import type {PdfLocator} from './types';

export interface PdfLocatorSource{locate(issuerId:string,market:Market,factIds:string[]):Promise<Map<string,PdfLocator>>}
export const emptyPdfLocatorSource:PdfLocatorSource={async locate(){return new Map();}};
export function staticPdfLocatorSource(byFact:Record<string,PdfLocator>):PdfLocatorSource{
 return {async locate(_issuer,_market,factIds){return new Map(factIds.filter(id=>byFact[id]!==undefined).map(id=>[id,byFact[id]]));}};
}
