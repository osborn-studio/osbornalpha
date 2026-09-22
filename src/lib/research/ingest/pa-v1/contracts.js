import Ajv from 'ajv';
import schema from './contracts.schema.json' with { type: 'json' };
import { canonicalize, digest, fail } from './json.js';
export { schema };
export const CONTRACT_DIGEST = digest(schema);
const ajv = new Ajv({ strict: true });
ajv.addFormat('utc-rfc3339', value => Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,19) === value.slice(0,19));
ajv.addSchema(schema);
const checks = new Map();
export function validate(name, value) {
  canonicalize(value);
  if (!checks.has(name)) checks.set(name, ajv.compile({ $ref: `${schema.$id}#/$defs/${name}` }));
  if (!checks.get(name)(value)) fail('invalid_schema', `Validate ${name} against pa-bridge/1.0.`);
  return value;
}
