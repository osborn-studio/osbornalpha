import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';

it('summarizes the newest-first public directory page in the requested language',async()=>{
 const {entryCardModel}=await import('./entry-card-model');
 const newest={title:{zh:'最新',en:'Latest'},version_no:3,drift_counts:{revised:2}};
 const older={...newest,title:{zh:'旧',en:'Older'},drift_counts:{revised:0}};
 expect(entryCardModel([],'zh')).toBeNull();
 expect(entryCardModel([newest,older],'zh-CN')).toEqual({published:'2',title:'最新',version:3,revised:1});
 expect(entryCardModel(Array(200).fill(newest),'en')).toEqual({published:'200+',title:'Latest',version:3,revised:200});
});
it('mounts the topic card with both shared-file fences',()=>{
 const page=readFileSync('src/app/(app)/intel/page.tsx','utf8');
 expect(page).toMatch(/\/\/ TOPICS ↓\s*import {\s*TopicEntryCard\s*} from '@\/components\/topics\/TopicEntryCard';\s*\/\/ TOPICS ↑/);
 expect(page).toMatch(/\{\/\* TOPICS ↓ \*\/\}\s*<TopicEntryCard \/>\s*\{\/\* TOPICS ↑ \*\/\}/);
});
