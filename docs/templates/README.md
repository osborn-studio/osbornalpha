# Templates

- `entity-keys-a-share-manual.csv` — WP-A2 manual entry sheet for A-share company keys. `usci` is prefilled from GLEIF / public registries (check digit verified); `cninfo_org_id` must be copied from 巨潮资讯 (the `orgId` used by `hisAnnouncement/query`). Fill `source_url`, `checked_by`, `checked_at`, then apply the values to `src/lib/research/entity-keys/first-cohort.json` (remove the key from `missing`, add `provenance.cninfo_org_id = {source:"manual", retrieved_at, ref: source_url}`) and rerun `npm test`.
