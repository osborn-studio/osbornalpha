'use client';

import dynamic from 'next/dynamic';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { LiveQuote } from '@/lib/hooks/useQuote';
import { useWatchlistBoardDnd } from '@/lib/hooks/useWatchlistBoardDnd';
import type { WatchlistOverviewRow } from '@/lib/watchlist/overview-contract';
import type { WatchlistSecurityIdentity } from '@/lib/watchlist/security-identity';
import type { WatchlistGroup } from '@/lib/watchlist/store';

const WatchlistKanbanColumn = dynamic(
  () => import('./WatchlistKanbanColumn').then((module) => module.WatchlistKanbanColumn),
  { ssr: false },
);

export function WatchlistBoard({
  groups,
  quotes,
  identities,
  overviewByTicker,
  loadedAt,
  onChange,
  onTickerMoved,
  onGroupReordered,
  onRetryTicker,
  onCardRemove,
  onQuickView,
  onRenameGroup,
  onDeleteGroup,
  onTickerAdded,
  onGroupAdded,
}: {
  groups: WatchlistGroup[];
  quotes: Record<string, LiveQuote | null>;
  identities: Record<string, WatchlistSecurityIdentity>;
  overviewByTicker: Record<string, WatchlistOverviewRow>;
  loadedAt: number | null;
  onChange: (groups: WatchlistGroup[]) => void;
  onTickerMoved: (ticker: string, groupName: string) => void;
  onGroupReordered: (groupName: string) => void;
  onRetryTicker: () => void;
  onCardRemove: (ticker: string) => void;
  onQuickView: (ticker: string) => void;
  onRenameGroup: (groupId: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onTickerAdded: (identity: WatchlistSecurityIdentity, groupId: string) => void;
  onGroupAdded: (name: string) => void;
}) {
  const t = useTranslations('market.watchlist');
  const [addingInGroup, setAddingInGroup] = useState<string | null>(null);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [openMenuTicker, setOpenMenuTicker] = useState<string | null>(null);
  const dnd = useWatchlistBoardDnd({ groups, onChange, onTickerMoved, onGroupReordered });

  const closeNewGroup = () => {
    setNewGroupOpen(false);
    setNewGroupName('');
  };
  const addGroup = () => {
    const name = newGroupName.trim();
    if (!name) return;
    onGroupAdded(name);
    closeNewGroup();
  };

  return (
    <div className="flex gap-3 overflow-x-auto pb-3" style={{ scrollSnapType: 'x mandatory' }} onClick={() => setOpenMenuTicker(null)}>
      {groups.map((group) => (
        <WatchlistKanbanColumn
          key={group.id}
          group={group}
          allGroups={groups}
          quotes={quotes}
          securityIdentities={identities}
          overviewByTicker={overviewByTicker}
          loadedAt={loadedAt}
          isDropTarget={dnd.dropTargetGroup === group.id && dnd.dragKind === 'card'}
          isColumnDropTarget={dnd.dropTargetColumnId === group.id && dnd.dragKind === 'column'}
          isBeingDragged={dnd.dragColumnId === group.id && dnd.dragKind === 'column'}
          dragTicker={dnd.dragTicker}
          isAdding={addingInGroup === group.id}
          openMenuTicker={openMenuTicker}
          onDragOver={(event) => dnd.onColumnDragOver(event, group.id)}
          onDragEnter={() => dnd.onColumnDragEnter(group.id)}
          onDragLeave={() => dnd.onColumnDragLeave(group.id)}
          onDrop={(event) => dnd.onColumnDrop(event, group.id)}
          onColumnDragStart={(event) => dnd.onColumnDragStart(event, group.id)}
          onCardDragStart={(event, ticker) => dnd.onCardDragStart(event, ticker, group.id)}
          onCardDragEnd={dnd.onDragEnd}
          onRetryTicker={onRetryTicker}
          onAddOpen={() => setAddingInGroup(group.id)}
          onAddClose={() => setAddingInGroup(null)}
          onCardMove={(ticker, toGroupId) => dnd.moveTicker(ticker, group.id, toGroupId)}
          onCardRemove={onCardRemove}
          onOpenMenu={(ticker) => setOpenMenuTicker((current) => current === ticker ? null : ticker)}
          onQuickView={onQuickView}
          onRename={() => onRenameGroup(group.id)}
          onDelete={() => onDeleteGroup(group.id)}
          onTickerAdded={(identity) => onTickerAdded(identity, group.id)}
          onCardKeyboardMove={(ticker, direction) => dnd.moveCardByKeyboard(ticker, group.id, direction)}
          onColumnKeyboardMove={(direction) => {
            const index = groups.findIndex((candidate) => candidate.id === group.id);
            const target = groups[index + (direction === 'right' ? 1 : -1)];
            if (target) dnd.reorderColumn(group.id, target.id);
          }}
        />
      ))}

      <div className="w-[min(85vw,300px)] shrink-0 snap-start">
        {newGroupOpen ? (
          <div className="rounded-lg border border-border bg-bg-card p-3">
            <input autoFocus value={newGroupName} onChange={(event) => setNewGroupName(event.target.value)} onKeyDown={(event) => {
              if (event.key === 'Enter') addGroup();
              if (event.key === 'Escape') closeNewGroup();
            }} placeholder={t('newColumnPlaceholder')} className="w-full text-sm" />
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={addGroup} disabled={!newGroupName.trim()} className="flex-1 rounded bg-accent-dim px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{t('addColumnCta')}</button>
              <button type="button" onClick={closeNewGroup} className="rounded border border-border px-3 py-1.5 text-xs text-text-dim">{t('cancel')}</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setNewGroupOpen(true)} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border bg-transparent py-3 text-sm text-text-dim hover:border-accent-dim hover:text-accent">
            <Plus className="h-4 w-4" aria-hidden="true" />{t('addColumnLabel')}
          </button>
        )}
      </div>
    </div>
  );
}
