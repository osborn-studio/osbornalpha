// Stored copies of the Feishu simulation workbook: one object per report name under the
// simulation owner's prefix in the private `feishu-reports` bucket.
export const REPORT_BUCKET = 'feishu-reports';
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const MAX_REPORT_BYTES = 5 * 1024 * 1024;

// <date>[-<HHMM>].xlsx, e.g. 2026-11-27.xlsx or 2026-11-27-1630.xlsx
const reportName = /^(\d{4}-\d{2}-\d{2})(?:-(\d{4}))?\.xlsx$/;

export function parseReportName(name: string): { date: string } | null {
  const match = reportName.exec(name);
  if (!match || Number.isNaN(Date.parse(match[1] + 'T00:00:00Z'))) return null;
  return { date: match[1] };
}

export const reportObjectPath = (ownerId: string, name: string) => `${ownerId}/${name}`;

/** Content-Disposition with an ASCII fallback and the Chinese file name (RFC 6266 / 5987). */
export function reportDisposition(name: string): string {
  const { date } = parseReportName(name) ?? { date: 'report' };
  const pretty = `飞书模拟组合报告_${name.replace(/\.xlsx$/, '')}.xlsx`;
  return `attachment; filename="feishu-simulation-${date}.xlsx"; filename*=UTF-8''${encodeURIComponent(pretty)}`;
}
