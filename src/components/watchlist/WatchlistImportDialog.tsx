'use client';

import { CheckCircle2, FileUp, ShieldAlert, Upload, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { formatDateLocale, type AppLocale } from '@/lib/i18n/locale';
import { useDialogFocusTrap } from '@/lib/hooks/useDialogFocusTrap';
import { parseTickerInput, watchlistImportStats } from '@/lib/watchlist/import';
import {
  WatchlistImportClientError,
  detectPortableWatchlistFormat,
  executePortableWatchlistImport,
  previewPortableWatchlistImport,
} from '@/lib/watchlist/import-client';
import type { WatchlistImportMode, WatchlistImportPreview } from '@/lib/watchlist/portable-import';
import type { VersionedWatchlistSnapshot } from '@/lib/watchlist/sync';

interface Props {
  existingTickerCount: number;
  existingTickers: Set<string>;
  portableEnabled: boolean;
  onCancel: () => void;
  onConfirm: (tickers: string[], boardName: string, rejected: string[]) => void;
  onPortableImported: (snapshot: VersionedWatchlistSnapshot) => boolean;
}

function previewTotal(preview: WatchlistImportPreview, key: 'groups' | 'items' | 'alerts') {
  const value = preview[key];
  return value.create + value.update + value.remove;
}

export function WatchlistImportDialog({
  existingTickerCount,
  existingTickers,
  portableEnabled,
  onCancel,
  onConfirm,
  onPortableImported,
}: Props) {
  const t = useTranslations('market.watchlist.import');
  const tw = useTranslations('market.watchlist');
  const locale = useLocale() as AppLocale;
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [boardName, setBoardName] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [rejected, setRejected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<WatchlistImportMode>('merge');
  const [preview, setPreview] = useState<WatchlistImportPreview | null>(null);
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const mutationId = useRef<string | null>(null);
  const dialogRef = useDialogFocusTrap<HTMLDivElement>(onCancel);
  const portableFormat = useMemo(
    () => portableEnabled ? detectPortableWatchlistFormat(text, fileName) : null,
    [fileName, portableEnabled, text],
  );
  const parsed = useMemo(() => portableFormat ? [] : parseTickerInput(text), [portableFormat, text]);
  const stats = useMemo(() => watchlistImportStats(parsed, existingTickers), [parsed, existingTickers]);

  function resetOperation() {
    setPreview(null);
    setReplaceConfirmed(false);
    setValidationError(null);
    mutationId.current = null;
  }

  function changeText(value: string) {
    setText(value);
    setFileName('');
    resetOperation();
  }

  function changeMode(value: WatchlistImportMode) {
    setMode(value);
    resetOperation();
  }

  async function readFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setFileError(t('fileTooLarge', { size: (file.size / 1024 / 1024).toFixed(1) }));
      event.target.value = '';
      return;
    }
    setFileError(null);
    const extension = file.name.toLowerCase().split('.').pop() ?? '';
    try {
      let content = '';
      if (['xlsx', 'xls', 'xlsm', 'xlsb'].includes(extension)) {
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        content = workbook.SheetNames
          .map((name) => XLSX.utils.sheet_to_csv(workbook.Sheets[name], { blankrows: false }))
          .filter((value) => value.trim())
          .join('\n');
        if (!content.trim()) throw new Error(t('excelEmpty'));
      } else {
        content = await file.text();
      }
      setText(content);
      setFileName(file.name);
      resetOperation();
    } catch (error) {
      setFileError(t('readFailed', { message: error instanceof Error ? error.message : t('unknownError') }));
    } finally {
      event.target.value = '';
    }
  }

  function importError(error: unknown) {
    if (error instanceof WatchlistImportClientError && error.code === 'security_not_selectable') {
      return t('portableSecurityRejected', { tickers: error.tickers.join(', ') || '--' });
    }
    if (error instanceof WatchlistImportClientError && error.status === 401) return t('portableSignedOut');
    if (error instanceof WatchlistImportClientError && error.status === 400) return t('portableInvalid');
    return t('portableFailed');
  }

  async function buildPreview() {
    if (!portableFormat) return;
    setBusy(true);
    setValidationError(null);
    try {
      const result = await previewPortableWatchlistImport({ content: text, format: portableFormat, mode });
      setPreview(result);
    } catch (error) {
      setValidationError(importError(error));
    } finally {
      setBusy(false);
    }
  }

  async function executePortable() {
    if (!portableFormat || !preview || (mode === 'replace' && !replaceConfirmed)) return;
    setBusy(true);
    setValidationError(null);
    mutationId.current ??= crypto.randomUUID();
    try {
      const result = await executePortableWatchlistImport(
        { content: text, format: portableFormat, mode },
        mutationId.current,
      );
      if (!onPortableImported(result.snapshot)) throw new Error('snapshot_owner_mismatch');
      onCancel();
    } catch (error) {
      setValidationError(importError(error));
    } finally {
      setBusy(false);
    }
  }

  async function confirmLightweight() {
    if (!stats.fresh.length) return;
    setBusy(true);
    setValidationError(null);
    setRejected([]);
    try {
      const response = await fetch('/api/securities/validate', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tickers: stats.fresh }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setValidationError(body?.error === 'security_master_unavailable' ? t('validationUnavailable') : t('validationFailed'));
        return;
      }
      const accepted = Array.isArray(body?.accepted) ? body.accepted.filter((value: unknown): value is string => typeof value === 'string') : [];
      const invalid = Array.isArray(body?.rejected) ? body.rejected.filter((value: unknown): value is string => typeof value === 'string') : [];
      setRejected(invalid);
      if (!accepted.length) { setValidationError(t('validationNoneAccepted')); return; }
      onConfirm(accepted, boardName, invalid);
    } catch {
      setValidationError(t('validationFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3 backdrop-blur-[2px]" onClick={onCancel}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="watchlist-import-title"
        className="max-h-[calc(100vh-24px)] w-full max-w-2xl overflow-y-auto rounded-lg border border-border bg-bg p-4 shadow-2xl sm:p-5"
        onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 id="watchlist-import-title" className="text-base font-semibold">{t('title')}</h2>
            <p className="mt-1 text-[11px] text-text-muted">{t(portableEnabled ? 'descriptionSignedIn' : 'descriptionGuest')}</p>
          </div>
          <button type="button" onClick={onCancel} className="icon-button !h-8 !w-8 !basis-8 border-transparent bg-transparent" aria-label={tw('cancel')}><X className="h-4 w-4" /></button>
        </div>

        <div className="grid gap-3">
          {!portableFormat && (
            <label>
              <span className="mb-1 block text-xs text-text-dim">{t('boardNameLabel')}</span>
              <input value={boardName} onChange={(event) => setBoardName(event.target.value)} className="w-full text-sm"
                placeholder={t('boardNamePlaceholder', { defaultName: tw('importDefaultName', { date: formatDateLocale(new Date().toISOString(), locale) }) })} />
            </label>
          )}
          <label>
            <span className="mb-1 flex items-center justify-between gap-3 text-xs text-text-dim">
              <span>{t('pasteLabel')}</span>
              {portableFormat && <span className="inline-flex items-center gap-1 text-accent"><FileUp className="h-3.5 w-3.5" />{t('portableDetected')}</span>}
            </span>
            <textarea value={text} onChange={(event) => changeText(event.target.value)} rows={7} className="w-full resize-y rounded-md border border-border bg-bg-elevated px-3 py-2 font-mono text-xs outline-none focus:border-accent" placeholder={t('pastePlaceholder')} />
          </label>
          <div>
            <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded border border-border bg-bg-elevated px-2.5 text-xs text-text-dim hover:text-text">
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />{t('uploadFile')}
              <input type="file" accept=".csv,.txt,.yml,.yaml,.xlsx,.xls,.xlsm,.xlsb" onChange={readFile} className="hidden" />
            </label>
            <div className="mt-1.5 text-[10px] text-text-muted">{t('supportedFormats')}</div>
            {fileError && <div className="mt-1 text-[11px] text-down" role="alert">{fileError}</div>}
            {validationError && <div className="mt-2 rounded border border-down/25 bg-down/5 p-2 text-[11px] text-down" role="alert">{validationError}</div>}
          </div>
        </div>

        {portableFormat ? (
          <div className="mt-4 border-y border-border py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex rounded-md border border-border bg-bg-elevated p-0.5" aria-label={t('portableMode')}>
                {(['merge', 'replace'] as const).map((value) => (
                  <button key={value} type="button" onClick={() => changeMode(value)} className={`h-8 rounded px-3 text-xs ${mode === value ? 'bg-bg-card font-semibold text-text shadow-sm' : 'text-text-muted'}`}>
                    {t(`portableModes.${value}`)}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => void buildPreview()} disabled={busy} className="h-8 rounded border border-border px-3 text-xs text-text disabled:opacity-50">
                {busy && !preview ? t('portablePreviewing') : t('portablePreview')}
              </button>
            </div>
            <p className={`mt-2 text-[11px] ${mode === 'replace' ? 'text-warn' : 'text-text-muted'}`}>{t(`portableModeHints.${mode}`)}</p>
            {preview && (
              <div className="mt-4">
                <div className="grid grid-cols-3 divide-x divide-border rounded border border-border bg-bg-elevated">
                  {(['groups', 'items', 'alerts'] as const).map((key) => (
                    <div key={key} className="px-3 py-2 text-center">
                      <div className="text-[10px] text-text-muted">{t(`portableEntities.${key}`)}</div>
                      <div className="mt-1 font-mono text-base font-semibold text-text">{preview[key].incoming}</div>
                      <div className="mt-1 text-[9px] text-text-muted">{t('portableChanges', { count: previewTotal(preview, key) })}</div>
                    </div>
                  ))}
                </div>
                {mode === 'replace' && (
                  <label className="mt-3 flex cursor-pointer items-start gap-2 rounded border border-warn/30 bg-warn/5 p-3 text-xs text-warn">
                    <input type="checkbox" checked={replaceConfirmed} onChange={(event) => setReplaceConfirmed(event.target.checked)} className="mt-0.5" />
                    <span><span className="flex items-center gap-1 font-semibold"><ShieldAlert className="h-3.5 w-3.5" />{t('portableReplaceConfirmTitle')}</span><span className="mt-1 block text-[11px]">{t('portableReplaceConfirmBody', { groups: preview.groups.remove, items: preview.items.remove })}</span></span>
                  </label>
                )}
              </div>
            )}
          </div>
        ) : parsed.length > 0 && (
          <div className="mt-4 border-y border-border py-3 text-[11px]">
            <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-text-dim">
              <span>{t('parsedTotal', { total: stats.total })}</span><span className="text-up">{t('parsedFresh', { fresh: stats.fresh.length })}</span>
              {stats.duplicateOfExisting > 0 && <span>{t('parsedDupExisting', { count: stats.duplicateOfExisting })}</span>}
              {stats.duplicateWithinInput > 0 && <span>{t('parsedDupWithinInput', { count: stats.duplicateWithinInput })}</span>}
              {rejected.length > 0 && <span className="text-warn">{t('validationRejected', { count: rejected.length })}</span>}
            </div>
            <div className="max-h-28 overflow-y-auto font-mono text-[10px] leading-5">
              {Array.from(new Set(parsed)).map((ticker) => <span key={ticker} className={`mr-2 inline-block ${existingTickers.has(ticker) ? 'text-text-muted line-through' : 'text-text'}`}>{ticker}</span>)}
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center justify-end gap-2">
          {preview && <span className="mr-auto inline-flex items-center gap-1 text-[11px] text-up"><CheckCircle2 className="h-3.5 w-3.5" />{t('portablePreviewReady')}</span>}
          <button type="button" onClick={onCancel} className="h-8 rounded border border-border px-3 text-xs text-text-dim">{tw('cancel')}</button>
          {portableFormat ? (
            <button type="button" onClick={() => void executePortable()} disabled={!preview || busy || (mode === 'replace' && !replaceConfirmed)} className="h-8 rounded bg-accent-dim px-3 text-xs font-semibold text-white disabled:opacity-50">
              {busy && preview ? t('portableImporting') : t(`portableActions.${mode}`)}
            </button>
          ) : (
            <button type="button" onClick={() => void confirmLightweight()} disabled={!stats.fresh.length || busy} className="h-8 rounded bg-accent-dim px-3 text-xs font-semibold text-white disabled:opacity-50">
              {busy ? t('validating') : stats.fresh.length ? t('confirmImport', { count: stats.fresh.length }) : t('noneToImport')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
