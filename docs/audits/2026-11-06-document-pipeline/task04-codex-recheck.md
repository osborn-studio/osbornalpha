| ID | CLOSED? | note |
|---|---|---|
| F1 | CLOSED | Both adapters enforce allowed MIME types and the migration’s 52,428,800-byte limit. |
| F2 | CLOSED | `Map` rejects inherited-property MIME names. |
| F3 | CLOSED | Missing-object signing maps to `object_not_found` in both adapters. |
| F4 | CLOSED | `pdfjs-dist` is last in `dependencies`; commit explains the change. |
| Opus: content addressing | CLOSED | Both adapters verify bytes against the path hash. |
| Opus: MIME/path | CLOSED | Extension must match MIME; extraction paths require JSON. |
| Opus: status-based not-found | CLOSED | Status codes override message fallback; missing buckets remain errors. |
| Opus: head size | CLOSED | Rejects nonfinite, fractional, negative and unsafe sizes. |
| Opus: parsePresented dashes/grouping/cap | CLOSED | Expanded dash support, stricter comma grouping and 128-character cap implemented. |
| Opus: smoke CMaps/fonts | NOT CLOSED | Asset URLs cannot be read by the pinned Node factories; see N1. |
| Opus: smoke size | CLOSED | Checks file size before reading. |
| Opus: smoke timing | CLOSED | Import time reported separately from load/extraction. |

Opus labels above follow the supplied summary; its original numbered list was unavailable.

| ID | Sev | file:line | defect | fix |
|---|---|---|---|---|
| N1 | P2 | scripts/documents/smoke-pdf.ts:42 | `dirUrl()` returns a `file://` **string**. pdfjs-dist 4.10.38’s Node CMap/font factories pass it directly to `fs.promises.readFile`, which treats it as a filesystem path and raises `ENOENT`. Both existing CMap and font files reproduced this failure. CJK smoke results therefore cannot validate asset-backed extraction. | Pass absolute filesystem directory paths with trailing separators to both asset options; verify extraction with a CMap-dependent PDF. |

Adversarial checks:

- **Double hashing:** Caller hashing plus store verification adds a second linear pass. A 50 MiB probe measured approximately 34 ms and 72 ms respectively; no blocking regression established. Move size rejection before hashing to avoid processing oversized buffers.
- **pagesSha:** Correct semantics. Plan lines 8051–8052 hash the serialized UTF-8 `pages.json` bytes.
- **Legitimate numbers:** Executed probes accepted `007`, `0`, `0.25`, `(0)` and `—` with expected results.
- **Bucket configuration:** Size and MIME constants match migration lines 253–259. Hosted configuration was not tested.

Read-only probes used Node 26.5.0; the project targets Node 22. Full tests and hosted/PDF extraction were not run.

VERDICT: fail (0 P1, 1 P2)