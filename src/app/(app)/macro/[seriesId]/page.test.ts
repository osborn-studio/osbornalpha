import {describe, expect, it, vi} from 'vitest';
import {MACRO_CATALOG} from '@/lib/macro/catalog';
import {DISPLAY_CATALOG} from '@/lib/macro/display-catalog';

vi.mock('next/navigation', () => ({notFound: () => {throw new Error('NEXT_HTTP_ERROR_FALLBACK;404');}}));
vi.mock('next-intl/server', () => ({getTranslations: async () => (key: string) => key}));
vi.mock('@/components/macro/IndicatorDetail', () => ({IndicatorDetail: () => null}));
import MacroSeriesPage from './page';

const page = (seriesId: string) => MacroSeriesPage({params: Promise.resolve({seriesId})});
describe('macro series page resolution', () => {
  it.each(DISPLAY_CATALOG)('opens display-only $id with its region and detail id', async def => {
    const result = await page(def.id);
    const [back, detail] = result.props.children;
    expect(back.props.href).toBe(`/macro?region=${def.region}&tab=indicators`);
    expect(detail.props.seriesId).toBe(def.id);
  });
  it('preserves every hashed-catalog page and event-source exclusion', async () => {
    for (const def of MACRO_CATALOG) {
      if (def.role === 'event_source') {
        await expect(page(def.id)).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404');
      } else {
        const result = await page(def.id);
        expect(result.props.children[1].props.seriesId).toBe(def.id);
        expect(result.props.children[0].props.href).toBe(`/macro?region=${def.region}&tab=indicators`);
      }
    }
  });
  it('still returns 404 for an unknown series', async () => {
    await expect(page('UNKNOWN_SERIES')).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404');
  });
});
