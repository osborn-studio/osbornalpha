// Topic isolated local fixture switch (spec §9, §13.2).
export const fixtureMode=(env:Record<string,string|undefined>=process.env)=>env.TOPICS_E2E_FIXTURES==='1'&&env.NODE_ENV!=='production'&&!env.VERCEL
 &&!env.NEXT_PUBLIC_SUPABASE_URL&&!env.SUPABASE_SERVICE_ROLE_KEY;
