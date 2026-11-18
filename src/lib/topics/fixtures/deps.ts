// Topic fixture dependencies (spec §9, §13.2).
import type {PublicDeps} from '../deps';
import {publishedFixture} from './published';
let singleton:PublicDeps|undefined;
export function fixtureDeps():PublicDeps{
 return singleton??={db:publishedFixture().db,now:()=>new Date('2026-11-15T00:00:00Z'),preview:false};
}
