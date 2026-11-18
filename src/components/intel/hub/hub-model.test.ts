import {expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {NextIntlClientProvider} from 'next-intl';
import research from '../../../../messages/zh/research.json';
import intel from '../../../../messages/zh/intel.json';

it('uses the research chain order',async()=>{
 const {HUB_ORDER}=await import('./hub-model');
 expect(HUB_ORDER).toEqual(['macro','industry','company','foreign','topic']);
});
it('opens only a parsed HTTP 200 response',async()=>{
 const {hubState}=await import('./hub-model');
 expect(hubState(200,true)).toBe('open');
 for(const status of [0,201,204,401,403,404,500])expect(hubState(status,true)).toBe('notServed');
 expect(hubState(200,false)).toBe('notServed');
});
it.each(['notServed','loading','open'] as const)('renders destinations only when available (%s)',async state=>{
 const {HubCard}=await import('./HubCard');
 const card=createElement(HubCard,{id:'topics',no:'05',title:'专题研究',titleEn:'Topics',state,
  href:'/intel/topics',enterLabel:'进入专题目录 →',children:createElement('a',{href:'/detail'},'Detail')});
 const html=renderToStaticMarkup(createElement(NextIntlClientProvider,{locale:'zh',timeZone:'UTC',messages:{research,intel},children:card}));
 // TOPICS ↓
 expect(html).toContain('data-hub-step="05"');
 // TOPICS ↑
 expect(html).toContain(`data-hub-state="${state}"`);
 if(state==='open'){expect(html).toContain('href="/intel/topics"');return;}
 expect(html).not.toContain('href=');
 if(state==='loading'){expect(html).toContain('加载');return;}
 expect(html).toContain('aria-disabled="true"');
 expect(html).toContain('未服务');
 expect(html).toContain('data-research-state="notServed"');
});
