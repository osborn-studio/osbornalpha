'use client';

import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import {
  moveTickerBetweenWatchlistGroups,
  moveTickerWithinWatchlistGroup,
  reorderWatchlistGroups,
} from '@/lib/watchlist/group-operations';
import type { WatchlistGroup } from '@/lib/watchlist/store';

export function useWatchlistBoardDnd({
  groups,
  onChange,
  onTickerMoved,
  onGroupReordered,
}: {
  groups: WatchlistGroup[];
  onChange: (groups: WatchlistGroup[]) => void;
  onTickerMoved: (ticker: string, groupName: string) => void;
  onGroupReordered: (groupName: string) => void;
}) {
  const [dragKind, setDragKind] = useState<'card' | 'column' | null>(null);
  const [dragTicker, setDragTicker] = useState<string | null>(null);
  const [dragFromGroup, setDragFromGroup] = useState<string | null>(null);
  const [dragColumnId, setDragColumnId] = useState<string | null>(null);
  const [dropTargetGroup, setDropTargetGroup] = useState<string | null>(null);
  const [dropTargetColumnId, setDropTargetColumnId] = useState<string | null>(null);
  const dragOverCounters = useRef<Record<string, number>>({});

  const onDragEnd = useCallback(() => {
    setDragKind(null);
    setDragTicker(null);
    setDragFromGroup(null);
    setDragColumnId(null);
    setDropTargetGroup(null);
    setDropTargetColumnId(null);
    dragOverCounters.current = {};
    document.body.style.cursor = '';
  }, []);

  useEffect(() => onDragEnd, [onDragEnd]);

  const moveTicker = useCallback((ticker: string, fromGroupId: string, toGroupId: string) => {
    const next = moveTickerBetweenWatchlistGroups(groups, ticker, fromGroupId, toGroupId);
    if (next === groups) return;
    onChange(next);
    onTickerMoved(ticker, groups.find((group) => group.id === toGroupId)?.name ?? toGroupId);
  }, [groups, onChange, onTickerMoved]);

  const reorderColumn = useCallback((fromGroupId: string, toGroupId: string) => {
    const next = reorderWatchlistGroups(groups, fromGroupId, toGroupId);
    if (next === groups) return;
    onChange(next);
    onGroupReordered(groups.find((group) => group.id === fromGroupId)?.name ?? fromGroupId);
  }, [groups, onChange, onGroupReordered]);

  const onCardDragStart = (event: DragEvent, ticker: string, fromGroupId: string) => {
    setDragKind('card');
    setDragTicker(ticker);
    setDragFromGroup(fromGroupId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', ticker);
    document.body.style.cursor = 'grabbing';
  };

  const onColumnDragStart = (event: DragEvent, columnId: string) => {
    setDragKind('column');
    setDragColumnId(columnId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-watchlist-column', columnId);
    document.body.style.cursor = 'grabbing';
  };

  const onColumnDragEnter = (groupId: string) => {
    if (dragKind !== 'card') return;
    dragOverCounters.current[groupId] = (dragOverCounters.current[groupId] || 0) + 1;
    setDropTargetGroup(groupId);
  };

  const onColumnDragLeave = (groupId: string) => {
    if (dragKind !== 'card') return;
    dragOverCounters.current[groupId] = Math.max(0, (dragOverCounters.current[groupId] || 0) - 1);
    if (dragOverCounters.current[groupId] === 0) {
      setDropTargetGroup((current) => current === groupId ? null : current);
    }
  };

  const onColumnDragOver = (event: DragEvent, groupId: string) => {
    if (dragKind === 'card') {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    } else if (dragKind === 'column') {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      if (dragColumnId && dragColumnId !== groupId) setDropTargetColumnId(groupId);
    }
  };

  const onColumnDrop = (event: DragEvent, groupId: string) => {
    event.preventDefault();
    if (dragKind === 'card' && dragTicker && dragFromGroup) moveTicker(dragTicker, dragFromGroup, groupId);
    else if (dragKind === 'column' && dragColumnId) reorderColumn(dragColumnId, groupId);
    onDragEnd();
  };

  const moveCardByKeyboard = (ticker: string, groupId: string, direction: 'left' | 'right' | 'up' | 'down') => {
    const groupIndex = groups.findIndex((group) => group.id === groupId);
    if (groupIndex < 0) return;
    if (direction === 'left' || direction === 'right') {
      const target = groups[groupIndex + (direction === 'right' ? 1 : -1)];
      if (target) moveTicker(ticker, groupId, target.id);
    } else {
      const next = moveTickerWithinWatchlistGroup(groups, groupId, ticker, direction);
      if (next !== groups) onChange(next);
    }
    window.setTimeout(() => document.querySelector<HTMLElement>(`[data-watchlist-card="${CSS.escape(ticker)}"]`)?.focus(), 0);
  };

  return {
    dragKind,
    dragTicker,
    dragColumnId,
    dropTargetGroup,
    dropTargetColumnId,
    onCardDragStart,
    onColumnDragStart,
    onDragEnd,
    onColumnDragEnter,
    onColumnDragLeave,
    onColumnDragOver,
    onColumnDrop,
    moveTicker,
    reorderColumn,
    moveCardByKeyboard,
  };
}
