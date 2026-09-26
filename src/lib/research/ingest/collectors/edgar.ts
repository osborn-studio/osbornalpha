/**
 * EDGAR collector: submissions index per CIK → recent filings of selected
 * forms → primary document text. available_at is the SEC acceptance instant.
 * Fair-access rules: declared User-Agent, ≤10 requests/second.
 */
import { companyName, createClient, errorMessage, inWindow, isoDate, Receipt, writeDocument } from './shared';
import type { CollectOptions, CollectReceipt, CollectorCompany } from './types';

export const EDGAR_DEFAULT_FORMS = ['8-K','10-Q','10-K','6-K','20-F','S-1','424B1','424B2','424B3','424B4','424B5','DEF 14A','SC 13D','SC 13G','8-K/A','10-Q/A','10-K/A'];
const MAX_TEXT = 200_000;

export function primaryDocumentUrl(cik: string, accession: string, primaryDocument: string): string {
  return `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replace(/-/g, '')}/${primaryDocument}`;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export function htmlToText(html: string): string {
  const text = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENTITIES[e.toLowerCase()] ?? m))
    .replace(/\s+/g, ' ').trim();
  return text.length > MAX_TEXT ? text.slice(0, MAX_TEXT) : text;
}

interface Recent { accessionNumber: string[]; filingDate: string[]; acceptanceDateTime: string[]; form: string[]; primaryDocument: string[]; primaryDocDescription: string[] }

export async function collectEdgar(opts: CollectOptions & { forms?: string[] }): Promise<CollectReceipt> {
  const clock = opts.now ?? (() => new Date());
  const receipt = new Receipt('edgar', opts.companies.length, clock);
  const client = createClient(opts, 120);
  const forms = new Set(opts.forms ?? EDGAR_DEFAULT_FORMS);
  const cap = opts.maxPerCompany ?? 50;
  for (const company of opts.companies) {
    if (!company.cik) { receipt.r.skipped++; continue; }
    const cik10 = company.cik.padStart(10, '0');
    const indexUrl = `https://data.sec.gov/submissions/CIK${cik10}.json`;
    let recent: Recent;
    try {
      const res = await client.get(indexUrl, { Accept: 'application/json' });
      if (!res.ok) throw new Error(`edgar ${res.status}`);
      recent = (await res.json() as { filings?: { recent?: Recent } }).filings?.recent as Recent;
      if (!recent?.accessionNumber) throw new Error('submissions index has no filings.recent');
    } catch (e) { receipt.fail({ company: companyName(company), stage: 'list', message: errorMessage(e), url: indexUrl }); continue; }
    let taken = 0;
    for (let i = 0; i < recent.accessionNumber.length && taken < cap; i++) {
      const form = recent.form[i], accepted = recent.acceptanceDateTime[i];
      if (!forms.has(form) || !inWindow(accepted, opts.since, opts.until)) continue;
      taken++; receipt.r.fetched++;
      const url = primaryDocumentUrl(company.cik, recent.accessionNumber[i], recent.primaryDocument[i]);
      const description = recent.primaryDocDescription[i] || form;
      let text = `${form} — ${description} — ${companyName(company)} — filed ${recent.filingDate[i]} — ${url}`;
      if (/\.html?$/i.test(recent.primaryDocument[i])) {
        try {
          const res = await client.get(url, { Accept: 'text/html' });
          if (!res.ok) throw new Error(`edgar ${res.status}`);
          const body = htmlToText(await res.text());
          if (body) text = `${text}\n\n${body}`;
        } catch (e) { receipt.fail({ company: companyName(company), stage: 'document', message: errorMessage(e), url }); }
      }
      await writeDocument(opts, receipt, company, {
        source_type: 'FILING', title: `${form} ${description} (${companyName(company)}, ${recent.filingDate[i]})`, raw_text: text, url,
        published_at: recent.filingDate[i], trust_level: 'HIGH', entity_ids: [company.entity_id], market: 'US', permission: 'public', origin_type: 'filing',
        event_time: `${recent.filingDate[i]}T00:00:00.000Z`, available_at: new Date(accepted).toISOString(),
        metadata: { collector: 'edgar', accession_number: recent.accessionNumber[i], form, primary_document: recent.primaryDocument[i], document_url: url, cik: company.cik },
      });
    }
  }
  return receipt.finish();
}

export type { CollectorCompany };
