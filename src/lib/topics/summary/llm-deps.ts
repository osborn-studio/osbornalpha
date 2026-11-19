import {resolveUserLlm} from '@/lib/llm/resolve';
import {productionLlmDeps} from '@/lib/macro/strategy/llm-deps';
export const topicLlmDeps=(userId:string)=>productionLlmDeps(userId,'topic_summary',resolveUserLlm);
