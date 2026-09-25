# Frozen PA bridge adapter

Copied without changes from Osborn-PA `db842d3a88cc87074bc67c1935159bcb75e5ba9e`,
`apps/web/app/api/lib/bridge/`, on 2026-09-22. These six files preserve the
producer's strict parser, JCS profile, schema and digest checks. Alpha owns
the surrounding adapter and server-side scope binding. No runtime import
from the PA checkout or service is required. Do not edit schemas/golden to
make an input pass; upgrade via a separately versioned adapter.

Source schema digest: `0332392777529977ded8d4bb7aa7726b1709cd3215f7c5a59933349b89109a35`.
Candidate schema digest: `4a16eed9ac9fc20aba0c5a6379c1744de6b3fe9c344fba1743039b30167053c0`.
