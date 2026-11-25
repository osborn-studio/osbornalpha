# /admin/sources · Claude Design artboards

Canvas: https://claude.ai/artifact/SUEMb6xw32UReg6vEEtzYg (section 8, "数据源接入层").

| Artboard | Covers |
|---|---|
| `Adm-Sources.dc.html` | Desktop 1440, Chinese |
| `Adm-Sources-en.dc.html` | Desktop 1440, English |
| `Adm-Sources-States.dc.html` | No access, partial read failure, empty, loading (zh / en) |
| `M-Adm-Sources.dc.html` | Phone 390, Chinese: two-line rows, no sideways scroll |
| `M-Adm-Sources-en.dc.html` | Phone 390, English |

`gen.py <outdir> [kit css href]` regenerates all five and holds the copy in both languages.
Routes drawn are the real ones at `main` on 2026-11-24. Values in square brackets are placeholders.
The page is read-only in P0: no write controls. Source health is shown as "not measured" because it
exists only in process memory today.
