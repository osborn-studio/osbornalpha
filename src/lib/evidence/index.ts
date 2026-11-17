// Topic spec §4.1 resolver composition.
import {getAdminSupabase} from '@/lib/supabase/admin';
import {createResolver} from './resolve';
import {productionSources} from './production-sources';
import {memorySources,type MemorySourcesInput} from './memory-sources';
import type {EvidenceSources} from './sources';
import {macroResolver} from './resolvers/macro';
import {industryResolver} from './resolvers/industry';
import {factResolver} from './resolvers/fact';
import {citationResolver} from './resolvers/citation';
import {judgmentResolver} from './resolvers/judgment';
import {brokerResolver} from './resolvers/broker';
const resolver=(s:EvidenceSources)=>createResolver([macroResolver(s),industryResolver(s),factResolver(s),citationResolver(s),judgmentResolver(s),brokerResolver()]);
export const productionResolver=()=>resolver(productionSources({admin:getAdminSupabase()}));
export const memoryResolver=(seed:MemorySourcesInput)=>resolver(memorySources(seed));
