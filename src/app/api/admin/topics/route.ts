// Topic plan T5.2: admin topic creation and directory.
import {adminGet,adminPost,enumField,jsonNoStore,strField} from '@/lib/topics/admin-route';
import {adminDeps} from '@/lib/topics/admin-deps';
import {emptyDraft,parseDraftBody} from '@/lib/topics/drafts';
import {TopicError} from '@/lib/topics/errors';
import {CATEGORIES} from '@/lib/topics/types';
export const GET=adminGet('[admin/topics] list',async()=>{
 const {db}=await adminDeps();return jsonNoStore({topics:await db.adminTopics(),settings:await db.settings()});
});
export const POST=adminPost('[admin/topics] create',async({body,userId})=>{
 const slug=strField(body,'slug',{max:64});
 if(slug.length<3||!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug))throw new TopicError('invalid_body:slug');
 const category=enumField(body,'category',CATEGORIES);
 const draft=parseDraftBody({...emptyDraft({zh:'',en:''}),title:body.title});
 return jsonNoStore(await (await adminDeps()).db.createTopic({slug,category,body:draft,actor:userId}),201);
});
