import {readFileSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {NextIntlClientProvider} from 'next-intl';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import en from '../../../../messages/en/topicsAdmin.json';
import zh from '../../../../messages/zh/topicsAdmin.json';
import {AdminForbidden,AdminUnauthenticated,requireAdminUser} from '@/lib/admin/auth';
import {FromThesisLink} from '@/app/(app)/admin/topics/new/from-thesis';

vi.mock('@/lib/admin/auth',()=>({requireAdminUser:vi.fn(),AdminForbidden:class extends Error{},AdminUnauthenticated:class extends Error{}}));
const pagePath='src/app/(app)/research/theses/[id]/page.tsx';
const href='/admin/topics/new?fromThesis=abc';
beforeEach(()=>{
 vi.stubEnv('TOPICS_ENABLED',undefined);
 vi.stubEnv('TOPICS_E2E_FIXTURES',undefined);
 vi.mocked(requireAdminUser).mockReset();
});
afterEach(()=>vi.unstubAllEnvs());

it('keeps the admin API probe out of the thesis page and link',()=>{
 for(const path of [pagePath,'src/app/(app)/admin/topics/new/from-thesis.tsx']){
  expect(readFileSync(path,'utf8')).not.toMatch(/fetch\s*\(\s*['"`]\/api\/admin\/topics/);
 }
});
it('keeps topic code on the thesis page inside the two TOPICS fences',()=>{
 // Self-contained on purpose: comparing with origin/main stops working once the fenced page is on main.
 const source=readFileSync(pagePath,'utf8');
 const fence=/^ *(?:\/\/ TOPICS ↓|\{\/\* TOPICS ↓ \*\/\})\n([^]*?)^ *(?:\/\/ TOPICS ↑|\{\/\* TOPICS ↑ \*\/\})\n/gm;
 expect([...source.matchAll(fence)].map(match=>match[1].trim())).toEqual([
  "import { FromThesisLink } from '@/app/(app)/admin/topics/new/from-thesis';",
  '<FromThesisLink href={`/admin/topics/new?fromThesis=${params.id}`}/>',
 ]);
 expect(source.replace(fence,'')).not.toMatch(/topics|FromThesis/i);
});

async function renderLink(locale?:'zh'|'en'){
 const {default:Layout}=await import('@/app/(app)/research/theses/[id]/layout');
 const tree=await Layout({children:createElement(FromThesisLink,{href})});
 if(!locale)return renderToStaticMarkup(tree);
 return renderToStaticMarkup(createElement(NextIntlClientProvider,{locale,timeZone:'UTC',
  messages:{topicsAdmin:locale==='zh'?zh:en},onError:e=>{throw e;},children:tree}));
}
it('skips authentication and translation when topics are closed',async()=>{
 expect(await renderLink()).toBe('');
 expect(requireAdminUser).not.toHaveBeenCalled();
});
it.each([AdminForbidden,AdminUnauthenticated])('omits the link for a denied viewer',async(ErrorType)=>{
 vi.stubEnv('TOPICS_ENABLED','1');
 vi.mocked(requireAdminUser).mockRejectedValue(new ErrorType());
 expect(await renderLink()).toBe('');
 expect(requireAdminUser).toHaveBeenCalledOnce();
});
it.each(['zh','en'] as const)('renders one translated link for an admin in %s',async locale=>{
 vi.stubEnv('TOPICS_ENABLED','1');
 vi.mocked(requireAdminUser).mockResolvedValue({id:'admin'} as Awaited<ReturnType<typeof requireAdminUser>>);
 const html=await renderLink(locale);
 expect(html.match(/href="[^"]+"/g)).toEqual([`href="${href}"`]);
 expect(html).toContain((locale==='zh'?zh:en).promotion.start);
});
it('recognises the isolated admin fixture without authentication',async()=>{
 vi.stubEnv('TOPICS_E2E_FIXTURES','1');
 for(const key of ['VERCEL','NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'])vi.stubEnv(key,undefined);
 expect(await renderLink('zh')).toContain(`href="${href}"`);
 expect(requireAdminUser).not.toHaveBeenCalled();
});
