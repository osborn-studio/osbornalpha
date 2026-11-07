// src/lib/evals/kinds/pairs.ts
// F6-owned dual_source pair registrations (spec §5.5, §0 R5-10). The list is EMPTY until plan 3 lands: entries are added then, each with
// pair_id, module, both sides' source/upstream, `independence` (same_feed => adapter_check, never truth), the registration tolerance and the
// §5.5 key scope (concepts, durations, units, consolidations the pair may observe). A PairSource only supplies observations.
import type {PairRegistration} from './dual-source';

export const F6_PAIRS:readonly PairRegistration[]=[];
export const pairRegistration=(pairId:string,list:readonly PairRegistration[]=F6_PAIRS):PairRegistration|undefined=>list.find(r=>r.pair_id===pairId);
