// Topic plan PR-5 fix 1: dependency-free isolated fixture gate.
export const adminFixtureMode=(env:Record<string,string|undefined>=process.env)=>env.TOPICS_E2E_FIXTURES==='1'&&env.NODE_ENV!=='production'&&!env.VERCEL&&!env.NEXT_PUBLIC_SUPABASE_URL&&!env.SUPABASE_SERVICE_ROLE_KEY;
export const FIXTURE_ADMIN_ID='00000000-0000-4000-8000-0000000000e2';
