// src/lib/company/fixture-manifest.ts
// Loader of src/lib/company/fixtures/manifest.json (spec §12.0, §0 #72). Acceptance tests call
// pendingExpectation(id) and skip while the owner-transcribed value is missing; expected values are
// never generated from implementation output.
import {readFileSync} from 'node:fs';

export interface ManifestFixture{id:string;path:string;sha256:string;recorded_at:string;synthetic?:boolean}
export interface ManifestExpectation{id:string;kind:string;status:'pending'|'transcribed';request:Record<string,unknown>;expected:unknown;source:{document:string;page_or_row:string|null;url:string|null};transcribed_by:string|null;transcribed_at:string|null}
export interface FixtureManifest{version:number;note:string;fixtures:ManifestFixture[];expectations:ManifestExpectation[]}
const PATH=new URL('./fixtures/manifest.json',import.meta.url);
export function loadFixtureManifest():FixtureManifest{return JSON.parse(readFileSync(PATH,'utf8')) as FixtureManifest;}
export function expectationOf(id:string):ManifestExpectation|null{return loadFixtureManifest().expectations.find(e=>e.id===id)??null;}
export function pendingExpectation(id:string):boolean{const e=expectationOf(id);return e===null||e.status!=='transcribed'||e.expected===null;}
