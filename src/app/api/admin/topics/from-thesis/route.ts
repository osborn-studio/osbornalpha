import {adminPost,enumField,jsonNoStore,strField,uuidParam} from '@/lib/topics/admin-route';
import {adminDeps} from '@/lib/topics/admin-deps';
import {adminFixtureMode} from '@/lib/topics/admin-fixture-mode';
import {promoteThesis,sessionThesisReader} from '@/lib/topics/promote';
import {CATEGORIES} from '@/lib/topics/types';

export const POST=adminPost('[admin/topics] from-thesis',async({body,userId})=>{
 const thesisId=uuidParam(body.thesis_id,'thesis_id'),slug=strField(body,'slug',{max:64}),category=enumField(body,'category',CATEGORIES);
 const thesis=adminFixtureMode()?(await import('@/lib/topics/fixtures/promotion')).fixtureThesis:await sessionThesisReader(userId);
 const {db,now}=await adminDeps();
 return jsonNoStore(await promoteThesis({db,now,thesis},{thesisId,slug,category,actor:userId}),201);
});
