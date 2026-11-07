'use client';
// F3 source-drawer adapter (plan 2026-11-06 Task 13; spec §10.3). F3's <SourceDrawer documentId page? bbox? />
// and GET /api/documents/by-filing/[filingId] are not in the repo yet: the adapter reports itself
// unavailable and renders nothing, so the filings view falls back to opening the URL in a new window
// even when NEXT_PUBLIC_COMPANY_F3_DRAWER is on. When F3 lands, edit ONLY this file: import
// SourceDrawer, resolve documentId from /api/documents/by-filing/[filingId] (status 'restricted' →
// metadata + external link only), and flip F3_SOURCE_DRAWER_AVAILABLE to true.
export const F3_SOURCE_DRAWER_AVAILABLE = false;

export function SourceDrawerAdapter(props: { filingId: string; onClose: () => void }) {
  void props;
  return null;
}
