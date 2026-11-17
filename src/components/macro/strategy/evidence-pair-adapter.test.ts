import {expect,it} from 'vitest';
import {evidencePairInput} from './evidence-pair-adapter';
it('maps a group title without inventing observation values or provenance',()=>{
 const input=evidencePairInput('Frozen pair');
 expect(input.variant).toBe('ok');
 if(input.variant!=='ok')throw new Error('variant');
 expect(input.extras?.title).toBe('Frozen pair');
 expect(input.extras?.value).toBeUndefined();
 expect(input.payload.source.evidence_sha256).toBeNull();
 expect(input.payload.times.available_at).toBe('');
});
