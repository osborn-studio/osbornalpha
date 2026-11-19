import {adminGet,adminPost,jsonNoStore,uuidParam} from '@/lib/topics/admin-route';
import {adminDeps} from '@/lib/topics/admin-deps';
import {licenceForm} from '@/lib/topics/licences';
export const GET=adminGet('[admin/topics] licences',async()=>jsonNoStore({licences:await (await adminDeps()).db.licences()}));
export const POST=adminPost('[admin/topics] licence change',async({body,userId})=>{
 const licenceId=body.licence_id==null?null:uuidParam(body.licence_id,'licence_id');
 const fields=licenceForm(body),{db}=await adminDeps();
 const licence_id=await db.setLicence({licenceId,fields,actor:userId});
 return jsonNoStore({licence_id},licenceId?200:201);
});
