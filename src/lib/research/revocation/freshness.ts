import type {FeedCheckpoint} from './feed';
const seq=(value:string)=>{
 if(typeof value!=='string'||!/^(0|[1-9][0-9]{0,18})$/.test(value))throw new Error('revocation_unavailable');
 const n=BigInt(value);if(n>9223372036854775807n)throw new Error('revocation_unavailable');return n;
};
/** Re-evaluate at each protected operation from a committed, authenticated checkpoint.
 * Never pass an uncommitted page result or treat this as grant authorization. */
export function assertRevocationFresh(checkpoint:FeedCheckpoint|null,expected:Pick<FeedCheckpoint,'feedId'|'scope'>,nowMs:number):void {
 try{
  if(!checkpoint||!Number.isSafeInteger(nowMs)||nowMs<0||checkpoint.publishedAt===null)throw new Error();
  if(checkpoint.feedId!==expected.feedId||checkpoint.scope.user_id!==expected.scope.user_id||checkpoint.scope.workspace_id!==expected.scope.workspace_id)throw new Error();
  const cursor=seq(checkpoint.cursor),latest=seq(checkpoint.latestSeq);
  if(cursor!==latest)throw new Error();
  const published=Date.parse(checkpoint.publishedAt);
  if(!Number.isFinite(published)||new Date(published).toISOString()!==checkpoint.publishedAt||published>nowMs+5000||nowMs-published>60000)throw new Error();
 }catch{throw new Error('revocation_unavailable');}
}
