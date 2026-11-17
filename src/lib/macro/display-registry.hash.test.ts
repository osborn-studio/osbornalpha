// @vitest-environment node
import {expect,it} from 'vitest';
import {formulaHashOf,importClosure} from '../judgments/formula-hash';
import {macroRegimeV3} from '../judgments/methodologies/macro-regime.v3';
it('keeps the v3 formula stable and excludes the display registry from its closure',()=>{
 expect(formulaHashOf(macroRegimeV3).formula_hash).toBe(formulaHashOf(macroRegimeV3).formula_hash);
 expect(formulaHashOf(macroRegimeV3).formula_hash).not.toBe('dc26a628372facffa66bc51beb795f23ef755b0f51a82337b4bea17f0c2770ba');
 const closure=importClosure(process.cwd(),macroRegimeV3.module);
 for(const file of ['display-catalog.ts','series-registry.ts'])expect(closure).not.toContain(`src/lib/macro/${file}`);
});
