# MiniMax cache design review

Review of the stated pure-fact/authentication/revision/expiry design, not production performance evidence. Final text only.

Approve. Authorization occurs before cache access; fresh revision/snapshot/code keys drive invalidation; missing revisions bypass caching; the five-minute TTL plus absolute `expiresAt` bounds staleness; and errors are never cached. The cache key should include all relevant authenticated scope/tenant and freshness identifiers, but no concrete blocker remains under the stated design.
