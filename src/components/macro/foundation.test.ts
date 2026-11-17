import {readFileSync,readdirSync} from 'node:fs';
import {expect,it} from 'vitest';
const read=(p:string)=>readFileSync(p,'utf8');
it('all route surfaces use the shared page header, including unloaded pages',()=>{
 for(const file of ['MacroWorkbench.tsx','IndicatorDetail.tsx','AnalysisRunView.tsx','strategy/StrategyScreens.tsx']) expect(read(`src/components/macro/${file}`),file).toContain('<PageHeader');
});
it('macro links and copy use the canonical route',()=>{
 for(const root of ['src/components/macro','src/app/(app)/macro','messages/zh','messages/en']) {
  for(const f of readdirSync(root,{recursive:true}) as string[]) if(/\.(tsx|json)$/.test(f)) expect(read(`${root}/${f}`),f).not.toContain('/intel/macro');
 }
});

it('marks the clock as a judgment separately from the allocation hypothesis',()=>{
 expect(read('src/components/macro/MacroJudgmentSlot.tsx')).toMatch(/<MarkCard kind="judgment">[\s\S]*<MacroRegimeClock[\s\S]*<\/MarkCard>[\s\S]*<AllocationTemplateCard/);
});
