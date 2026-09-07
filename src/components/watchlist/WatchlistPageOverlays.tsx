'use client';

import dynamic from 'next/dynamic';
import type { Dispatch, SetStateAction } from 'react';
import type { LiveQuote } from '@/lib/hooks/useQuote';
import type { useWatchlistReviews } from '@/lib/hooks/useWatchlistReviews';
import type { WatchlistChartPreferences } from '@/lib/watchlist/ui-preferences';
import type { WatchlistQuickViewTab } from '@/lib/watchlist/quick-view';
import type { WatchlistGroup } from '@/lib/watchlist/store';
import type { WatchlistSecurityIdentity } from '@/lib/watchlist/security-identity';
import type { VersionedWatchlistSnapshot } from '@/lib/watchlist/sync';
import type { WatchlistTrashEntry } from '@/lib/watchlist/trash';
import type { WatchlistOverviewItemRow, WatchlistOverviewRow } from '@/lib/watchlist/overview-contract';
import type { WatchlistPendingAction } from './WatchlistActionDialog';

const WatchlistQuickView = dynamic(
  () => import('@/components/WatchlistQuickView').then((module) => module.WatchlistQuickView),
  { ssr: false },
);
const WatchlistAddDialog = dynamic(
  () => import('./WatchlistAddDialog').then((module) => module.WatchlistAddDialog),
  { ssr: false },
);
const WatchlistReviewPanel = dynamic(
  () => import('./WatchlistReviewPanel').then((module) => module.WatchlistReviewPanel),
  { ssr: false },
);
const WatchlistImportDialog = dynamic(
  () => import('./WatchlistImportDialog').then((module) => module.WatchlistImportDialog),
  { ssr: false },
);
const WatchlistActionDialog = dynamic(
  () => import('./WatchlistActionDialog').then((module) => module.WatchlistActionDialog),
  { ssr: false },
);
const WatchlistTrashDialog = dynamic(
  () => import('./WatchlistTrashDialog').then((module) => module.WatchlistTrashDialog),
  { ssr: false },
);

type ReviewModel = ReturnType<typeof useWatchlistReviews>;

interface QuickViewOverlay {
  ticker: string;
  tab: WatchlistQuickViewTab;
  quote: LiveQuote | null;
  overview?: WatchlistOverviewRow;
  benchmarkPreference: string;
  chartPreferences: WatchlistChartPreferences;
  onDecisionSaved: (item: WatchlistOverviewItemRow) => void;
  onBenchmarkChange?: (ticker: string, benchmark: string | null) => Promise<boolean>;
  onBenchmarkPreferenceChange: (ticker: string, benchmark: string | null) => void;
  onChartPreferencesChange: Dispatch<SetStateAction<WatchlistChartPreferences>>;
  onClose: () => void;
}

interface AddOverlay {
  groups: WatchlistGroup[];
  onAdd: (security: WatchlistSecurityIdentity, groupId: string) => void;
  onClose: () => void;
}

interface ReviewOverlay {
  model: ReviewModel;
  onOpenTicker: (ticker: string) => void;
  onClose: () => void;
}

interface ImportOverlay {
  existingTickerCount: number;
  existingTickers: Set<string>;
  portableEnabled: boolean;
  onCancel: () => void;
  onConfirm: (tickers: string[], boardName: string, rejected: string[]) => void;
  onPortableImported: (snapshot: VersionedWatchlistSnapshot) => boolean;
}

interface ActionOverlay {
  action: WatchlistPendingAction;
  onCancel: () => void;
  onConfirm: (value?: string) => void;
}

interface TrashOverlay {
  entries: WatchlistTrashEntry[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  onRestore: (entry: WatchlistTrashEntry) => Promise<VersionedWatchlistSnapshot | null>;
  onDelete: (entry: WatchlistTrashEntry) => Promise<boolean>;
  onClose: () => void;
}

export function WatchlistPageOverlays({
  quickView,
  add,
  review,
  importDialog,
  action,
  trash,
}: {
  quickView: QuickViewOverlay | null;
  add: AddOverlay | null;
  review: ReviewOverlay | null;
  importDialog: ImportOverlay | null;
  action: ActionOverlay | null;
  trash: TrashOverlay | null;
}) {
  return (
    <>
      {quickView && (
        <WatchlistQuickView
          ticker={quickView.ticker}
          quote={quickView.quote}
          overview={quickView.overview}
          onDecisionSaved={quickView.onDecisionSaved}
          onBenchmarkChange={quickView.onBenchmarkChange}
          benchmarkPreference={quickView.benchmarkPreference}
          onBenchmarkPreferenceChange={quickView.onBenchmarkPreferenceChange}
          chartPreferences={quickView.chartPreferences}
          onChartPreferencesChange={quickView.onChartPreferencesChange}
          initialTab={quickView.tab}
          onClose={quickView.onClose}
        />
      )}
      {add && <WatchlistAddDialog {...add} />}
      {review && <WatchlistReviewPanel {...review} />}
      {importDialog && <WatchlistImportDialog {...importDialog} />}
      {action && <WatchlistActionDialog {...action} />}
      {trash && <WatchlistTrashDialog {...trash} />}
    </>
  );
}
