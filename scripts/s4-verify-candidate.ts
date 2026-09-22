/** Local verification only: never connects to a database or model. */
import { readFileSync } from 'node:fs';
import { prepareCandidate, type CandidateBinding } from '../src/lib/research/ingest/candidate';
import { parseStrict } from '../src/lib/research/ingest/pa-v1/json.js';

const [packPath, bindingPath] = process.argv.slice(2);
if (!packPath || !bindingPath) throw new Error('usage: tsx scripts/s4-verify-candidate.ts PACK LOCAL_BINDING');
const binding = parseStrict(readFileSync(bindingPath)) as CandidateBinding;
// Local operator invocation only; an HTTP caller must supply actor from the
// authenticated ResearchCtx, never from this binding or an uploaded document.
const candidate = prepareCandidate(readFileSync(packPath, 'utf8'), binding.localUserId, binding);
console.log(JSON.stringify({
  status: 'verified_only_not_persisted', payloadHash: candidate.payloadHash,
  localUserId: candidate.localUserId, upstreamScope: candidate.upstreamScope,
  idempotencyKey: candidate.idempotencyKey, researchStream: candidate.researchStream,
  synthetic: candidate.synthetic, receivedAt: candidate.receivedAt,
}, null, 2));
