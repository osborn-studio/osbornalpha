export const E2E_COOKIE='industry_e2e';
/** Fails closed (Codex task20 P2): only an isolated local test server — flag on, not production, not Vercel, no Supabase credentials. */
export const fixtureMode=(env:Record<string,string|undefined>=process.env)=>env.INDUSTRY_E2E_FIXTURES==='1'&&env.NODE_ENV!=='production'&&!env.VERCEL
 &&!env.NEXT_PUBLIC_SUPABASE_URL&&!env.SUPABASE_SERVICE_ROLE_KEY;
