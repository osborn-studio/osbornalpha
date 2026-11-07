// F4 Task 19: production flag wiring exercises the real MacroReadApi over a DB boundary double.
import {afterEach,expect,it,vi} from 'vitest';
import {productionJudgmentDeps} from './deps';
import {MacroUnavailable} from './macro-api';
const m=vi.hoisted(()=>({db:vi.fn(),anon:{},admin:{}}));
vi.mock('../supabase/admin',()=>({getAdminSupabase:()=>m.admin}));
vi.mock('../supabase/anon',()=>({getAnonSupabase:()=>m.anon}));
vi.mock('../macro/db',()=>({supabaseMacroDb:m.db}));
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
const deps=()=>productionJudgmentDeps({codeVersion:'test',actor:'script',triggeredBy:'manual'});
it.each([undefined,'0','false'])('flag %s keeps the unavailable API',async flag=>{
 vi.stubEnv('MACRO_JUDGMENTS_ENABLED',flag);
 await expect(deps().inputsDb.macro.snapshotsSince(null,1)).rejects.toBeInstanceOf(MacroUnavailable);
 expect(m.db).not.toHaveBeenCalled();
});
it.each(['1','true'])('flag %s enables stored regimes using the real API and admin/anon clients',async flag=>{
 vi.stubEnv('MACRO_JUDGMENTS_ENABLED',flag);
 const regime={primary_state:'recovery'};
 m.db.mockReturnValue({snapshot:async()=>({snapshot_id:'s1',observation_ids:[]}),regimeOf:async()=>({regime})});
 const d=deps();
 expect(await d.inputsDb.macro.snapshot('s1')).toMatchObject({regime});
 expect(m.db).toHaveBeenCalledWith({admin:m.admin,anon:m.anon});
 // Upstream has its own error class; consumers must receive F4's unavailable signal.
 await expect(d.inputsDb.macro.classifyAsOf('US','2026-09','2027-01-31T00:00:00.000Z','unknown')).rejects.toBeInstanceOf(MacroUnavailable);
});
