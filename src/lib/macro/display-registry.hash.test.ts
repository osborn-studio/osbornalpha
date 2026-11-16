// @vitest-environment node
import {expect,it} from 'vitest';
import {formulaHashOf,importClosure} from '../judgments/formula-hash';
import {macroRegimeV2} from '../judgments/methodologies/macro-regime.v2';
it('preserves the registered v2 formula and excludes the display registry from its closure',()=>{
 expect(formulaHashOf(macroRegimeV2).formula_hash).toBe('dc26a628372facffa66bc51beb795f23ef755b0f51a82337b4bea17f0c2770ba');
 const closure=importClosure(process.cwd(),macroRegimeV2.module);
 for(const file of ['display-catalog.ts','series-registry.ts'])expect(closure).not.toContain(`src/lib/macro/${file}`);
});
