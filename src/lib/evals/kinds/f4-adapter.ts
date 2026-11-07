// F4 has no registered, calibrated probability methodology or settledForecasts read contract.
// recommendation_call@v1 is a private self-assessment and cannot enter the F6 truth population.
import {REGISTRY} from '@/lib/judgments/registry';
import type {Methodology} from '@/lib/judgments/types';

export function calibrationAvailability(methodologies:readonly Pick<Methodology,'kind'>[]=REGISTRY):{status:'unavailable';reason:'no_probability_methodology'}{
 // A future probability method still needs a settled, visible, calibration-eligible export and
 // owner thresholds before this adapter can return data. Never fabricate p from category scores.
 if(methodologies.some(m=>m.kind==='probability'))throw new Error('probability_export_not_implemented');
 return {status:'unavailable',reason:'no_probability_methodology'};
}
