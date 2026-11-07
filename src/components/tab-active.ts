// src/components/tab-active.ts
// TabBar highlight rule (spec §8: intel highlighted on /intel/*). /today is exact; other tabs match their
// path or any sub-path (segment boundary, so /intel never matches /intelligence).
export function isTabActive(href:string,pathname:string):boolean{
 if(href==='/today')return pathname==='/today';
 return pathname===href||pathname.startsWith(`${href}/`);
}
