import { useCallback, useEffect, useState } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import SeriesPage from '../../../src/app/(app)/macro/[seriesId]/page';
import HistoryPage from '../../../src/app/(app)/macro/history/page';
import TransmissionPage from '../../../src/app/(app)/macro/transmission/page';
import ReviewIndexPage from '../../../src/app/(app)/macro/review/page';
import ReviewMonthPage from '../../../src/app/(app)/macro/review/[region]/[month]/page';
import { SourceDrawer, type DrawerTarget } from '../../../src/components/macro/SourceDrawer';
import { useMacroT } from '../../../src/components/macro/use-macro-t';
import macro from '../../../messages/en/macro.json';
import macroStrategy from '../../../messages/en/macroStrategy.json';
import { notFound } from './navigation';

function HydrationMarker() {
  useEffect(() => { document.documentElement.dataset.fixtureHydrated = 'true'; }, []);
  return null;
}
export interface FixturePageInput { path: string; query: Record<string, string | string[]>; drawerTarget?: DrawerTarget }
function SourceFixture({ target }: { target: DrawerTarget }) {
  const [open, setOpen] = useState(true);
  const { t, locale } = useMacroT();
  const close = useCallback(() => setOpen(false), []);
  return <><button type="button" onClick={() => setOpen(true)}>Open source fixture</button><SourceDrawer target={open ? target : null} onClose={close} t={t} locale={locale} /></>;
}
export async function fixturePage(input: FixturePageInput) {
  const { query } = input;
  // Route files and next.config use /macro; the components still contain /intel links.
  const path = input.path.replace(/^\/macro(?=\/|$)/, '/intel/macro');
  let page;
  if (path === '/fixture/source') {
    if (!input.drawerTarget) throw new Error('Session 1 drawerTarget fixture unavailable');
    page = <SourceFixture target={input.drawerTarget} />;
  } else if (path === '/intel/macro/history') page = await HistoryPage({ searchParams: Promise.resolve(query) });
  else if (path === '/intel/macro/transmission') page = await TransmissionPage({ searchParams: Promise.resolve(query) });
  else if (path === '/intel/macro/review') page = ReviewIndexPage();
  else if (/^\/intel\/macro\/review\/[^/]+\/[^/]+$/.test(path)) {
    const [, , , , region, month] = path.split('/');
    page = await ReviewMonthPage({ params: Promise.resolve({ region, month }) });
  } else if (/^\/intel\/macro\/[^/]+$/.test(path)) page = await SeriesPage({ params: Promise.resolve({ seriesId: decodeURIComponent(path.split('/').at(-1)!) }) });
  else notFound();
  return <NextIntlClientProvider locale="en" messages={{ macro, macroStrategy }} timeZone="UTC" now={new Date('2026-11-07T12:00:00Z')}>
    <div data-fixture-only="true"><HydrationMarker /><p role="note">Synthetic fixture harness · real page components · simulated framework routing and capability gates</p>{page}</div>
  </NextIntlClientProvider>;
}
