// Topic research (spec §9, §13.1).
export const TOPIC_ERROR_STATUS={topics_disabled:404,not_found:404,no_version_at_asof:404,topic_retired:410,version_unpublished:410,
 invalid_parameter:400,slug_taken:409,revision_conflict:409,publish_blocked:409,resolver_degraded:409,licence_confirmation_missing:409,
 quota_exceeded:429,code_version_unavailable:503,unsupported_media_type:415,forbidden_origin:403,invalid_body:400} as const;
export type TopicErrorHead=keyof typeof TOPIC_ERROR_STATUS;
export class TopicError extends Error{
 readonly status:number;
 constructor(readonly code:string,readonly detail:Record<string,unknown>|null=null){
  super(code);this.name='TopicError';
  this.status=TOPIC_ERROR_STATUS[code.split(':')[0] as TopicErrorHead]??500;
 }
}
