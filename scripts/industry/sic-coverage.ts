/** Read-only ops inventory. See SIC-COVERAGE.md. No ingestion, HTTP or application imports. */
import {pathToFileURL} from 'node:url';
import {Client} from 'pg';

interface Reader {query(text:string, values?:unknown[]):Promise<{rows:Record<string, unknown>[]}>}

// Mirrors sic.ts eligibility (US priority > 0) and memberships.ts point-in-time validity.
// Error entries are capped by finishBatch: these counts are NOT failed issuer totals.
const INVENTORY = `WITH
  eligible AS (select distinct issuer_id from public.fact_sync_scope where market='US' and priority>0),
  classifications AS (select code from public.industry_classifications where scheme='sic' and version='sec-current' and level=1),
  members AS (
    select issuer_id, code from public.issuer_industry_memberships
    where scheme='sic' and version='sec-current' and level=1 and status='ok'
      and valid_from<=($1::timestamptz at time zone 'UTC')::date
      and available_date<=($1::timestamptz at time zone 'UTC')::date
      and (valid_to is null or valid_to_available_date is null
        or valid_to_available_date>($1::timestamptz at time zone 'UTC')::date
        or valid_to>($1::timestamptz at time zone 'UTC')::date)
  ),
  schedule AS (select s.* from public.industry_sync_scope s join eligible e using(issuer_id) where job='sic'),
  latest AS (select status, errors from public.ingest_batches where dataset='industry.sic.memberships'
    order by started_at desc, batch_id desc limit 1),
  errors AS (select value->>'code' code from latest, jsonb_array_elements(errors))
select jsonb_build_object(
  'asOf', $1::text,
  'scope', jsonb_build_object(
    'usRows', (select count(*) from public.fact_sync_scope where market='US'),
    'eligibleIssuers', (select count(*) from eligible),
    'missingIssuer', (select count(*) from eligible e left join public.issuers i using(issuer_id) where i.issuer_id is null),
    'missingCik', (select count(*) from eligible e join public.issuers i using(issuer_id) where i.cik is null or btrim(i.cik)=''),
    'invalidCik', (select count(*) from eligible e join public.issuers i using(issuer_id)
      where i.cik is not null and btrim(i.cik)<>'' and (btrim(i.cik)!~'^[0-9]{1,10}$' or btrim(i.cik)~'^0+$'))
  ),
  'classificationCodes', (select count(*) from classifications),
  'memberships', jsonb_build_object(
    'currentRows', (select count(*) from members),
    'currentIssuers', (select count(distinct issuer_id) from members),
    'eligibleWithMembership', (select count(*) from eligible e where exists(select 1 from members m where m.issuer_id=e.issuer_id)),
    'eligibleWithoutMembership', (select count(*) from eligible e where not exists(select 1 from members m where m.issuer_id=e.issuer_id)),
    'currentRowsWithoutClassification', (select count(*) from members m where not exists(select 1 from classifications c where c.code=m.code))
  ),
  'schedule', jsonb_build_object(
    'missing', (select count(*) from eligible e where not exists(select 1 from schedule s where s.issuer_id=e.issuer_id)),
    'retired', (select count(*) from schedule where next_due_at='9999-12-31T00:00:00Z'::timestamptz),
    'leased', (select count(*) from schedule where lease_until >= $1::timestamptz),
    'dueUnleased', (select count(*) from schedule where next_due_at <= $1::timestamptz and (lease_until is null or lease_until<$1::timestamptz)),
    'futureUnleased', (select count(*) from schedule where next_due_at > $1::timestamptz
      and next_due_at<>'9999-12-31T00:00:00Z'::timestamptz and (lease_until is null or lease_until<$1::timestamptz)),
    'lastFailed', (select count(*) from schedule where last_status='failed')
  ),
  'latestMembershipBatch', (select jsonb_build_object(
    'status', case when status in ('running','success','partial','failed','rejected') then status else 'unknown' end,
    'providerUnavailableEntries', (select count(*) from errors where code='sec_unavailable'),
    'otherErrorEntries', (select count(*) from errors where code is null or code not in ('sec_unavailable','skipped_summary','truncated')),
    'skippedSummaryPresent', exists(select 1 from errors where code='skipped_summary'),
    'errorsTruncated', exists(select 1 from errors where code='truncated')
  ) from latest),
  'license', coalesce((select case when status in ('public','internal') then status else 'unknown' end
    from public.industry_dataset_licenses where dataset_key='scheme:sic:sec-current'),'missing'),
  'financialFactsCoverage', 'not_measured',
  'publicationReadiness', 'not_evaluated',
  'i3', 'not_evaluated'
) report`;

/** Uses one supplied connection, never a pool: all reads share one read-only snapshot. */
export async function readSicCoverage(client:Reader, at=new Date()) {
  const stamp=at.toISOString();
  await client.query('begin isolation level repeatable read read only');
  try {
    await client.query("set local statement_timeout='15s'");
    await client.query("set local lock_timeout='2s'");
    // RLS-limited reads could silently turn invisible rows into a false empty inventory.
    const visibility=await client.query(`select bool_or(row_security_active(t::regclass)) blocked from unnest(array[
      'public.fact_sync_scope','public.issuers','public.industry_classifications',
      'public.issuer_industry_memberships','public.industry_sync_scope',
      'public.ingest_batches','public.industry_dataset_licenses']) t`);
    if(visibility.rows[0].blocked) throw new Error('limited_visibility');
    const result=await client.query(INVENTORY,[stamp]);
    await client.query('commit');
    return result.rows[0].report as {
      scope:Record<string,number>; memberships:Record<string,number>; schedule:Record<string,number>;
      classificationCodes:number; latestMembershipBatch:Record<string,unknown>|null;
      license:string; financialFactsCoverage:string; publicationReadiness:string;
    };
  } catch(error) {
    await client.query('rollback');
    throw error;
  }
}

async function main() {
  const url=process.env.SIC_COVERAGE_DATABASE_URL;
  if(process.argv.length!==2 || !url) {
    console.error('usage: SIC_COVERAGE_DATABASE_URL=<connection> node --import tsx scripts/industry/sic-coverage.ts');
    process.exitCode=2;
    return;
  }
  const client=new Client({connectionString:url,connectionTimeoutMillis:5000,application_name:'sic-coverage-readonly'});
  let connectionFailed=false;
  client.on('error',()=>{connectionFailed=true;});
  try {
    let report;
    try {
      await client.connect();
      report=await readSicCoverage(client);
    } finally {
      await client.end();
    }
    if(connectionFailed) throw new Error('connection_failed');
    console.log(JSON.stringify(report,null,2));
  } catch {
    console.error('sic_coverage_unavailable');
    process.exitCode=1;
  }
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) void main();
