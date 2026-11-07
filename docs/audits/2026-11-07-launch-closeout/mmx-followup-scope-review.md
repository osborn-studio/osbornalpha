# MiniMax follow-up scope review

`mmx text chat --model MiniMax-M2.5`, `stop_reason=end_turn`; reviewed a concise release-scope description, not the implementation or production. These are documentation constraints, not executable test results. Deployment-status advice reflects the pre-deployment review time and is superseded only by actual release evidence in the main record.

- [ ] Do not claim F6/F3 validation enables extraction gold or judgment calibration; both remain disabled.
- [ ] Do not present the stale/expiry rebuild singleflight as end-to-end performance, latency, or freshness proof; cite measured CI/deploy results only.
- [ ] Do not claim private `no-store` server responses or client `no-store` fetches guarantee no intermediary/client caching in all paths.
- [ ] Keep server-facts TTL at **300s** and revision keys unchanged; do not imply broader cache invalidation.
- [ ] Do not claim company replay eliminates all live tracking access beyond the specified live-read stop; no issuer methods, CN PDF locator, or gold were added.
- [ ] Do not describe the offline industry numeric diagnostic or H decision plan as an I-3 valuation pipeline or licensing implementation.
- [ ] Mark `dc47ba2e` as awaiting exact CI/deploy evidence; do not call it released, deployed, or production-verified without that evidence.
- [ ] Keep the compact macro widget separate and pending PR/production acceptance; do not imply the cache release resolves the prior visual rejection.
- [ ] Avoid absolute completeness wording (“complete,” “fully fixed,” “production-ready,” “all live reads removed,” “no caching”) unless directly supported by the documented scope and evidence.
