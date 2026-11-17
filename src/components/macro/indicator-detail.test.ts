import {act, createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {create, type ReactTestRenderer} from 'react-test-renderer';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {DISPLAY_CATALOG} from '@/lib/macro/display-catalog';
import {catalogById} from '@/lib/macro/catalog';
import {SourceDrawer} from './SourceDrawer';
import {unitSuffix} from './macro-format';
import {IndicatorDetail} from './IndicatorDetail';

vi.mock('./use-macro-t', () => ({useMacroT: () => ({locale:'en',t:(key:string) => key})}));
vi.mock('./SourceDrawer', () => ({SourceDrawer: () => null}));
vi.mock('./charts/MacroLineChart', () => ({MacroLineChart: () => null}));
let root: ReactTestRenderer | undefined;
afterEach(async () => {
  if(root) await act(async () => root!.unmount());
  root=undefined;
  vi.unstubAllGlobals();
});
describe('registry detail definitions', () => {
  it.each(DISPLAY_CATALOG)('renders $id before data arrives', def => {
    const html=renderToStaticMarkup(createElement(IndicatorDetail,{seriesId:def.id}));
    expect(html).toContain(def.name.en);
    expect(html).not.toContain('detail.notFound');
  });
  it('uses the registry definition of seriesRead for units and source', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
    vi.stubGlobal('fetch',vi.fn(async () => new Response(JSON.stringify({
      def:catalogById('US_UNRATE'),seriesRead:'US_WALCL_W',transform:'raw',observations:[{observation_id:'test-observation',period_end:'2026-09-30',value_text:'4.2',version:1,available_at:'2026-10-01T00:00:00Z',availability_basis:'first_seen'}],
      cycles:[],insufficient:[],events:[],calendar:[],assetsByCycle:[],eventsVersion:'test',cyclesVersion:'test',
    }))));
    await act(async () => {root=create(createElement(IndicatorDetail,{seriesId:'US_UNRATE'}));});
    const text=JSON.stringify(root!.toJSON());
    expect(text).toContain(`4.2${unitSuffix('usd_mn',key=>key)}`);
    const open=root!.root.findAllByType('button').find(button=>button.props.children==='detail.openDrawer')!;
    await act(async () => {open.props.onClick();});
    expect(root!.root.findByType(SourceDrawer).props.target).toMatchObject({
      seriesId:'US_WALCL_W',unit:'usd_mn',source:{publisher:{en:'Board of Governors of the Federal Reserve System'}},
    });
  });
});
