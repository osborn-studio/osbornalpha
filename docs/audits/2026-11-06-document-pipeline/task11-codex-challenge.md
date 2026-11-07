Read-only review of `949890fe`; both defects reproduced using committed code in isolated, offline probes. Full test suites were not run.

| ID | Sev P1/P2/P3 | file:line | attack/defect | fix |
|---|---|---|---|---|
| T11-01 | P2 | `src/app/api/documents/doc/[id]/route.ts:22` | Request a public document with `extractionsCursor=WyJ4Il0` (base64url `["x"]`). Generic cursor decoding accepts it; Supabase’s extraction cursor validator rejects it, but the route returns **500 internal** instead of **400 invalid_parameter:extractionsCursor**. Tests only exercise undecodable cursors. | Validate the extraction cursor’s timestamp/UUID shape before querying; map cursor validation failures to 400. Add a decodable-but-invalid cursor test. |
| T11-02 | P3 | `src/lib/documents/read-route.ts:108` | `supersededBy` stops after 20 pages and silently returns `null` despite more results. With 999-row pages, version 19,980 incorrectly reports no successor when version 19,981 exists. | Start the version query after the current version and fetch its successor directly; do not represent an incomplete scan as “no successor.” |

VERDICT: fail (0 P1, 1 P2)