import assert from 'node:assert/strict';
import {after, before, test} from 'node:test';
import {spawnSync} from 'node:child_process';
import {Client} from 'pg';
import {readSicCoverage} from './sic-coverage';

// Dedicated disposable database only; this fixture never runs application migrations.
const url = process.env.SIC_COVERAGE_TEST_DATABASE_URL;
const target=url ? new URL(url) : null;
if (!target || !['localhost', '127.0.0.1'].includes(target.hostname) ||
    !target.port || target.port==='5432' || !/^\/sic_coverage_test[a-z0-9_]*$/.test(target.pathname)) {
  throw new Error('SIC_COVERAGE_TEST_DATABASE_URL requires localhost, a dedicated nondefault port and database sic_coverage_test*');
}
const client = new Client({connectionString: url});
before(async () => {
  await client.connect();
  await client.query("set time zone 'UTC'");
  await client.query(`
    create table fact_sync_scope(issuer_id text, market text, priority integer);
    create table issuers(issuer_id text, cik text);
    create table industry_classifications(scheme text, version text, code text, level integer);
    create table issuer_industry_memberships(issuer_id text, scheme text, version text, code text,
      level integer, status text, valid_from date, available_date date, valid_to date, valid_to_available_date date);
    create table industry_sync_scope(issuer_id text, job text, next_due_at timestamptz,
      lease_until timestamptz, last_status text);
    create table ingest_batches(batch_id text, dataset text, started_at timestamptz,
      finished_at timestamptz, status text, errors jsonb);
    create table industry_dataset_licenses(dataset_key text, status text);
    insert into fact_sync_scope values
      ('a','US',10),('b','US',10),('c','US',10),('d','US',10),('e','US',10),('f','US',10),
      ('retired','US',0),('cn','CN',10);
    insert into issuers values ('a','320193'),('b','789019'),('c',null),('d','0'),('e','1045810'),('f','1');
    insert into industry_classifications values ('sic','sec-current','3571',1),('sw2021','2021','801120',1);
    insert into issuer_industry_memberships values
      ('a','sic','sec-current','3571',1,'ok','2026-01-01','2026-01-01',null,null),
      ('a','sic','sec-current','3571',1,'ok','2025-01-01','2025-01-01','2026-01-01','2026-01-01'),
      ('b','sic','sec-current','9999',1,'quarantined','2026-01-01','2026-01-01',null,null),
      ('e','sic','sec-current','3571',1,'ok','2026-11-09','2026-11-09',null,null),
      ('retired','sic','sec-current','3571',1,'ok','2026-01-01','2026-01-01',null,null),
      ('cn','sw2021','2021','801120',1,'ok','2026-01-01','2026-01-01',null,null);
    insert into industry_sync_scope values
      ('a','sic','2026-11-01',null,'success'),('b','sic','2026-11-01','2026-11-08 13:00Z','failed'),
      ('c','sic','2026-11-09',null,'success'),('d','sic','9999-12-31T00:00:00Z',null,null),
      ('e','sic','2026-11-01',null,'failed');
    insert into ingest_batches values
      ('old','industry.sic.memberships','2026-11-07','2026-11-07','failed','[{"code":"sec_unavailable"}]'),
      ('new','industry.sic.memberships','2026-11-08','2026-11-08','partial',
       '[{"code":"sec_unavailable","key":"PRIVATE_ISSUER","message":"SECRET"},{"code":"sic_error"},{"message":"PRIVATE malformed receipt"},{"code":null},{"code":"skipped_summary","message":"PRIVATE"},{"code":"truncated"}]'),
      ('other','industry.sw.memberships','2026-11-09',null,'running','[]');
    insert into industry_dataset_licenses values ('scheme:sic:sec-current','internal');
  `);
});
after(async () => {await client.end();});

test('separates eligible issuer backlog from rows, financial facts, leases and receipt errors', async () => {
  const report = await readSicCoverage(client, new Date('2026-11-08T12:00:00Z'));
  assert.deepEqual(report.scope, {usRows:7, eligibleIssuers:6, missingIssuer:0, missingCik:1, invalidCik:1});
  assert.deepEqual(report.memberships, {currentRows:2, currentIssuers:2, eligibleWithMembership:1, eligibleWithoutMembership:5, currentRowsWithoutClassification:0});
  assert.equal(report.classificationCodes, 1);
  assert.deepEqual(report.schedule, {missing:1, retired:1, leased:1, dueUnleased:2, futureUnleased:1, lastFailed:2});
  assert.deepEqual(report.latestMembershipBatch, {startedAt:'2026-11-08T00:00:00+00:00',finishedAt:'2026-11-08T00:00:00+00:00',status:'partial', providerUnavailableEntries:1, otherErrorEntries:3, skippedSummaryPresent:true, errorsTruncated:true});
  assert.equal(report.license, 'internal');
  assert.equal(report.financialFactsCoverage, 'not_measured');
  assert.equal(report.publicationReadiness, 'not_evaluated');
  assert.doesNotMatch(JSON.stringify(report), /SECRET|PRIVATE|320193|sk-cp/);
  const cli = spawnSync(process.execPath, ['--import','tsx','scripts/industry/sic-coverage.ts'], {
    env:{...process.env,SIC_COVERAGE_DATABASE_URL:url}, encoding:'utf8',
  });
  assert.equal(cli.status,0,cli.stderr);
  assert.equal(JSON.parse(cli.stdout).financialFactsCoverage,'not_measured');
});

test('receipt timing distinguishes old partial results from recent attempts and unfinished batches', async () => {
  const at = new Date('2026-11-08T12:00:00Z');
  const original = await readSicCoverage(client, at);
  try {
    await client.query(`update ingest_batches set started_at=started_at-interval '38 days',
      finished_at=finished_at-interval '38 days' where dataset='industry.sic.memberships'`);
    const old = await readSicCoverage(client, at);
    assert.notDeepEqual(old.latestMembershipBatch, original.latestMembershipBatch,
      'an old partial receipt must be distinguishable from a recent partial receipt');
    assert.equal(Date.parse(String(old.latestMembershipBatch?.startedAt)), Date.parse('2026-10-01T00:00:00Z'));
    assert.equal(Date.parse(String(old.latestMembershipBatch?.finishedAt)), Date.parse('2026-10-01T00:00:00Z'));
    await client.query(`update ingest_batches set started_at='2026-11-08T11:00:00Z',
      finished_at=null, status='running' where batch_id='new'`);
    const running = await readSicCoverage(client, at);
    assert.equal(running.latestMembershipBatch?.status, 'running');
    assert.equal(Date.parse(String(running.latestMembershipBatch?.startedAt)), Date.parse('2026-11-08T11:00:00Z'));
    assert.equal(running.latestMembershipBatch?.finishedAt, null);
    assert.equal(running.publicationReadiness, 'not_evaluated');
  } finally {
    await client.query(`update ingest_batches set started_at='2026-11-07', finished_at='2026-11-07'
      where batch_id='old';
      update ingest_batches set started_at='2026-11-08', finished_at='2026-11-08', status='partial'
      where batch_id='new'`);
  }
});

test('read transaction rejects writes and rolls back on failure', async () => {
  const original = client.query.bind(client);
  const probe = {query: async (sql:string, values?:unknown[]) => {
    if (sql.startsWith('WITH')) await original("insert into issuers values ('forbidden','2')");
    return original(sql,values);
  }};
  await assert.rejects(readSicCoverage(probe,new Date('2026-11-08')), {code:'25006'});
  assert.equal((await client.query("select count(*)::int n from issuers where issuer_id='forbidden'")).rows[0].n,0);
  assert.equal((await client.query('show transaction_read_only')).rows[0].transaction_read_only,'off');
});

test('overlapping rows count one issuer and membership end availability follows the public reader', async () => {
  await client.query(`insert into issuer_industry_memberships values
    ('a','sic','sec-current','9999',1,'ok','2026-01-01','2026-01-01',null,null),
    ('b','sic','sec-current','3571',1,'ok','2026-01-01','2026-01-01','2026-11-07','2026-11-09'),
    ('f','sic','sec-current','3571',1,'ok','2026-01-01','2026-01-01','2026-11-08','2026-11-08')`);
  try {
    const report=await readSicCoverage(client,new Date('2026-11-08T12:00:00Z'));
    assert.deepEqual(report.memberships, {currentRows:4,currentIssuers:3,eligibleWithMembership:2,
      eligibleWithoutMembership:4,currentRowsWithoutClassification:1});
  } finally {
    await client.query(`delete from issuer_industry_memberships where (issuer_id='a' and code='9999')
      or (issuer_id='b' and status='ok') or issuer_id='f'`);
  }
});

test('RLS-filtered reads fail rather than report invisible rows as missing', async () => {
  // This cluster is task-owned and disposable. No application role or production grants used.
  await client.query(`create role sic_coverage_fixture_reader;
    grant usage on schema public to sic_coverage_fixture_reader;
    grant select on all tables in schema public to sic_coverage_fixture_reader;
    alter table issuers enable row level security;
    set role sic_coverage_fixture_reader`);
  try {
    assert.equal((await client.query('select * from issuers')).rows.length,0);
    await assert.rejects(readSicCoverage(client), /limited_visibility/);
  } finally {
    await client.query('reset role');
    await client.query(`alter table issuers disable row level security;
      drop owned by sic_coverage_fixture_reader; drop role sic_coverage_fixture_reader`);
  }
});

test('CLI errors never echo connection strings or database errors', () => {
  const cli = spawnSync(process.execPath, ['--import','tsx','scripts/industry/sic-coverage.ts'], {
    env:{...process.env,SIC_COVERAGE_DATABASE_URL:'postgres://secret:PRIVATE@127.0.0.1:1/nope'}, encoding:'utf8',
  });
  assert.equal(cli.status,1);
  assert.equal(cli.stdout,'');
  assert.equal(cli.stderr.trim(),'sic_coverage_unavailable');
});

test('CLI sanitizes driver cleanup failures before printing a report', () => {
  const preload=`import {createRequire} from 'node:module';
    const pg=createRequire(process.cwd()+'/package.json')('pg');
    const end=pg.Client.prototype.end;
    pg.Client.prototype.end=async function(){await end.call(this);throw new Error('PRIVATE cleanup error');};`;
  const cli=spawnSync(process.execPath, ['--import','tsx','--import',
    'data:text/javascript,'+encodeURIComponent(preload),'scripts/industry/sic-coverage.ts'], {
    env:{...process.env,SIC_COVERAGE_DATABASE_URL:url},encoding:'utf8',
  });
  assert.equal(cli.status,1);
  assert.equal(cli.stdout,'');
  assert.equal(cli.stderr.trim(),'sic_coverage_unavailable');
});

test('empty inventory and missing license never imply coverage or readiness', async () => {
  await client.query(`truncate fact_sync_scope, issuers, industry_classifications,
    issuer_industry_memberships, industry_sync_scope, ingest_batches, industry_dataset_licenses`);
  const report=await readSicCoverage(client,new Date('2026-11-08T12:00:00Z'));
  assert.equal(report.scope.eligibleIssuers,0);
  assert.equal(report.memberships.eligibleWithoutMembership,0);
  assert.equal(report.classificationCodes,0);
  assert.equal(report.latestMembershipBatch,null);
  assert.equal(report.license,'missing');
  assert.equal(report.publicationReadiness,'not_evaluated');
});
