/** Configuration-only diagnosis: no dotenv loader, DB connection or external calls. */
import {preflightConfig} from '../../src/lib/research/runtime/config';
const report=preflightConfig();console.log(JSON.stringify(report,null,2));
// Even valid production candidate settings are not sufficient to release runtime.
process.exitCode=report.readyForProduction?0:1;
