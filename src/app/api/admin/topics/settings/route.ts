// Topic plan T6.6: public switch and required source confirmations.
import {adminGet,adminPost,jsonNoStore} from '@/lib/topics/admin-route';
import {adminDeps} from '@/lib/topics/admin-deps';
import {requiredAttributions,setPublicEnabled} from '@/lib/topics/settings';
export const GET=adminGet('[admin/topics] settings',async()=>{
 const deps=await adminDeps();
 const [settings,{required,problems}]=await Promise.all([deps.db.settings(),requiredAttributions(deps.db)]);
 return jsonNoStore({settings,required_attributions:required,problems});
});
export const POST=adminPost('[admin/topics] settings',async({body,userId})=>{
 const deps=await adminDeps();return jsonNoStore({settings:await setPublicEnabled(deps,body,userId)});
});
