import type {TopicSourceLicenceRow} from '@/lib/topics/database-types';
import {excerptPermitted} from '@/lib/topics/excerpts';
export {licenceForm} from '@/lib/topics/licences';
export const offersExcerpt=(rows:Pick<TopicSourceLicenceRow,'status'|'permits'>[])=>rows.some(excerptPermitted);
export function permissionKeys(permits:Record<string,unknown>){
 const keys:string[]=[];
 if(permits.display_excerpt===true)keys.push('excerpt');
 if(permits.attribution_required!==false)keys.push('credit');
 if(permits.link_required===true)keys.push('link');
 return keys;
}
