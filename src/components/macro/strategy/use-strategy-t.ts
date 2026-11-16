// src/components/macro/strategy/use-strategy-t.ts
// Translation hook for the macroStrategy domain (spec §10). Components hand a plain `t` to the pure helpers in
// strategy-view-model.ts so those stay testable in node-env vitest.
import {useCallback} from 'react';
import {useLocale,useTranslations} from 'next-intl';
import type {Locale,StrategyT} from './strategy-view-model';
export function useStrategyT():{t:StrategyT;locale:Locale}{
 const tr=useTranslations('macroStrategy');
 const locale:Locale=useLocale()==='en'?'en':'zh';
 const t=useCallback<StrategyT>((key,values)=>tr(key,values),[tr]);
 return {t,locale};
}
