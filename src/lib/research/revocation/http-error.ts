import {RevocationAccessDenied} from './error';
/** Public codes deliberately exclude grant identities, SQL text and internal
 * causes. Availability failures must not look like confirmed revocation. */
export function revocationHttpError(error:unknown):{status:500;code:'internal_error'}|{status:403;code:'revocation_access_denied'}|{status:503;code:'revocation_check_unavailable'}|null{
 if(!(error instanceof RevocationAccessDenied))return null;
 const cause=typeof error.cause==='string'?error.cause:'';
 if(['transaction_not_clean','transaction_isolation','explicit_transaction_required','transaction_changed'].includes(cause))return {status:500,code:'internal_error'};
 if(['binding_revoked','grant_expired','grant_version_revoked'].includes(cause)){
  return {status:403,code:'revocation_access_denied'};
 }
 // Missing registration, lag/staleness, corruption and failed DB verification
 // are unresolved access checks, not evidence that permission was revoked.
 return {status:503,code:'revocation_check_unavailable'};
}
