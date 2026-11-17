import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';

const originalSw = {
  "zh": "历史期间用之后才拿到的成分证据重建：申万成分的可得日按纳入日假设（来源没有公告时刻），发行人按今天的归属解析。可以比较趋势，但不能当作当时投资者看到的值。每格的可得时刻是本次运行的激活时刻，不回溯到期间。",
  "en": "Historical periods are rebuilt from membership evidence obtained later: SW membership availability is assumed at the inclusion date (the source has no announcement time) and issuers are resolved by today's ownership. Compare trends, but do not read them as what investors saw then. Each cell becomes available at the run's activation, never back-dated to its period."
};
const sicBody = {
  "zh": "SEC 只提供每家公司当前的 SIC 码，没有历史归属。历史期间按今天的 SIC 归属回填，成分自首次观察日起有效。可以比较趋势，但不能当作当时投资者看到的值。每格的可得时刻是本次运行的激活时刻，不回溯到期间。成分快照日：{date}。",
  "en": "SEC publishes only each company's current SIC code, with no history. Past periods are back-filled using today's SIC assignment, valid from the first observed date. Compare trends, but do not read them as what investors saw then. Each cell becomes available at the run's activation, never back-dated to its period. Constituent snapshot date: {date}."
};
const originalFormulas = {
  "zh": {
    "revenue_sum": "Σ revenue（单季用 q_single_revenue）",
    "net_income_parent_sum": "Σ net_income_parent（单季用 q_single_net_income_parent）"
  },
  "en": {
    "revenue_sum": "Σ revenue (quarterly: q_single_revenue)",
    "net_income_parent_sum": "Σ net_income_parent (quarterly: q_single_net_income_parent)"
  }
};

describe('industry scheme-specific reconstruction and formula copy',()=>{
  for(const locale of ['zh','en'] as const){
    const messages=JSON.parse(readFileSync(join(process.cwd(),`messages/${locale}/industries.json`),'utf8'));
    it(`${locale}: preserves SW copy and separates the exact SIC explanation`,()=>{
      expect(messages.states.reconstruction.bodySw).toBe(originalSw[locale]);
      expect(messages.states.reconstruction.bodySic).toBe(sicBody[locale]);
      expect(messages.states.reconstruction).not.toHaveProperty('body');
      expect(messages.states.reconstruction.bodySic).not.toMatch(/申万|SW /);
    });
    it(`${locale}: preserves SW formulas and removes quarterly claims from SIC formulas`,()=>{
      for(const metric of ['revenue_sum','net_income_parent_sum'] as const){
        expect(messages.formulas[metric]).toBe(originalFormulas[locale][metric]);
        expect(messages.formulasSic?.[metric]).toEqual(expect.any(String));
        expect(messages.formulasSic?.[metric]).not.toMatch(/quarterly|单季|q_single/i);
      }
    });
  }
});
