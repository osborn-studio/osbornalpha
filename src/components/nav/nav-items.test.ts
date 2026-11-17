import {expect,it} from 'vitest';
import {activeNavId,isMoreActive,PHONE_TAB_IDS,MORE_IDS,NAV_ITEMS} from './nav-items';
export const cases = [
 ['/macro','macro'],['/macro/history','macro'],['/intel','intel'],['/intel/industries/sic/3674','intel'],['/intel/companies/x','intel'],['/intel/methods/a','intel'],['/stock/AAPL','intel'],['/watchlist/tracking','watchlist'],['/portfolio/review','portfolio'],['/analyst/x','analyst'],['/tools/dcf','tools'],['/settings','settings'],['/intelx',null],['/',null],['/briefs',null],
] as const;
it.each(cases)('%s selects %s',(path,id)=>{expect(activeNavId(path)).toBe(id);expect(isMoreActive(path)).toBe(['analyst','tools','settings'].includes(id ?? ''));});
it('defines ordered desktop and phone navigation',()=>{expect(NAV_ITEMS.map(i=>i.id)).toEqual([...PHONE_TAB_IDS,...MORE_IDS]);expect(PHONE_TAB_IDS).toEqual(['macro','watchlist','intel','portfolio']);});
