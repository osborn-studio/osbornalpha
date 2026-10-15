import {MarketPolicyError} from '../market-policy';
/** Public code of a business error raised by trusted work, or null for anything
 * that must stay sanitized. Recognizes the fail() convention (message equals
 * code with a recovery string) and MarketPolicyError, whose message is the
 * private reason while `code` carries the public invalid_schema/data_insufficient. */
export function publicWorkErrorCode(error:unknown):string|null{
 if(!(error instanceof Error))return null;
 const code=(error as {code?:unknown}).code;
 if(typeof code!=='string'||!/^[a-z][a-z_]{0,63}$/.test(code))return null;
 if(error instanceof MarketPolicyError)return code;
 return error.message===code&&typeof (error as {recovery?:unknown}).recovery==='string'?code:null;
}
