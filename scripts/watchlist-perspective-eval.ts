import { PERSPECTIVE_EVAL_FIXTURES } from '../src/lib/stocks/perspective-eval-fixtures';
import { evaluatePerspectiveFixtures } from '../src/lib/stocks/perspective-eval';

const result = evaluatePerspectiveFixtures(PERSPECTIVE_EVAL_FIXTURES);
console.log(JSON.stringify(result));
if (!result.ok) process.exitCode = 1;
