// src/components/macro/use-macro-t.ts
// Translation hook for the macro domain. Components take a plain `t` so the pure helpers stay testable in
// node-env vitest (spec §10).
import {useCallback} from 'react';
import {useLocale,useTranslations} from 'next-intl';
export type MacroT=(key:string,values?:Record<string,string|number>)=>string;
export function useMacroT():{t:MacroT;locale:'zh'|'en'}{
 const tr=useTranslations('macro');
 const locale=useLocale()==='en'?'en':'zh';
 const t=useCallback<MacroT>((key,values)=>tr(key,values),[tr]);
 return {t,locale};
}
