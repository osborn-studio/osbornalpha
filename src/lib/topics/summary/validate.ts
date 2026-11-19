import {FORBIDDEN_TERMS,REGIME_TERMS,validateHypotheses} from '@/lib/macro/strategy/explain-validate';
import {ADVICE_TERMS} from '../lexical';

export const TOPIC_VALIDATOR_VERSION='topic-summary-validator/1';
export const TOPIC_POLICY={forbidden:FORBIDDEN_TERMS,regime:REGIME_TERMS,advice:ADVICE_TERMS,singleSentence:true};
export const validateTopicSummary=(raw:unknown,factIds:ReadonlySet<string>)=>validateHypotheses(raw,factIds,TOPIC_POLICY);
