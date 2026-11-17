import {expect,it} from 'vitest';
import {companyFixtureMode,fixtureCompanyPageData,COMPANY_FIXTURE_US,COMPANY_FIXTURE_CN} from './e2e-fixture';
it.each([{}, {COMPANY_E2E_FIXTURES:'true'}, {COMPANY_E2E_FIXTURES:'1',NODE_ENV:'production'}, {COMPANY_E2E_FIXTURES:'1',VERCEL:'1'}, {COMPANY_E2E_FIXTURES:'1',NEXT_PUBLIC_SUPABASE_URL:'https://example.invalid'}, {COMPANY_E2E_FIXTURES:'1',SUPABASE_SERVICE_ROLE_KEY:'synthetic'}])('fails closed for %j',env=>expect(companyFixtureMode(env)).toBe(false));
it('allows only an isolated local fixture server',()=>expect(companyFixtureMode({COMPANY_E2E_FIXTURES:'1',NODE_ENV:'development'})).toBe(true));
it('serves exactly the two synthetic tickers',()=>{
 const us=fixtureCompanyPageData('FIXT','2026-01-31');
 expect(us).toMatchObject({today:'2026-01-31',market:'US',factState:'ok',issuer:{issuer_id:COMPANY_FIXTURE_US,names:{en:'Fixture Corp',zh:'夹具公司'}}});
 expect(us?.issuer?.securities).toHaveLength(1);
 expect(fixtureCompanyPageData('999999.SH','2026-01-31')).toMatchObject({market:'CN',issuer:{issuer_id:COMPANY_FIXTURE_CN},coverage:{citation_summary:{pending:1}}});
 for(const ticker of ['AAPL','600519.SH','fixt',''])expect(fixtureCompanyPageData(ticker,'2026-01-31')).toBeNull();
});
