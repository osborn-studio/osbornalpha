// Topic isolated local fixtures (spec §9, §13.2).
import type {PublicDeps} from './deps';
import {publishedFixture} from './fixtures/published';
export const fixtureMode=(env:Record<string,string|undefined>=process.env)=>env.TOPICS_E2E_FIXTURES==='1'&&env.NODE_ENV!=='production'&&!env.VERCEL
 &&!env.NEXT_PUBLIC_SUPABASE_URL&&!env.SUPABASE_SERVICE_ROLE_KEY;
let singleton:PublicDeps|undefined;
export function fixtureDeps():PublicDeps{
 return singleton??={db:publishedFixture().db,now:()=>new Date(),preview:false};
}
