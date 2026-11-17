// src/lib/broker-research/effective.ts
// effectiveValue (spec §4.6, plan 契约补充): for each typed component a present `corrected` key
// wins — JSON null clears — and a missing key inherits the extracted value. Same rule as SQL
// broker_field_effective (A2) and the inlined case expressions of broker_report_citations_v (A3);
// the pg contract (A5) asserts the three agree.
import type {FieldRow,TypedValue} from './types';

export const TYPED_KEYS=['value_text','value_num','value_currency','value_unit','value_date'] as const satisfies readonly (keyof TypedValue)[];
export function effectiveValue(row:Pick<FieldRow,'corrected'|keyof TypedValue>):TypedValue{
 const c=row.corrected as Record<string,unknown>|null;
 const pick=<K extends keyof TypedValue>(k:K):TypedValue[K]=>(c!==null&&Object.prototype.hasOwnProperty.call(c,k)?c[k]:row[k]) as TypedValue[K];
 return {value_text:pick('value_text'),value_num:pick('value_num'),value_currency:pick('value_currency'),value_unit:pick('value_unit'),value_date:pick('value_date')};
}
