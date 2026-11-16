/** Fixture transport for the real MacroWorkbench, plus the component preview. No production connection. */
import { build } from "esbuild";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";
import { indicatorsOf } from "../../src/lib/macro/catalog";
import type { ObservationRow } from "../../src/lib/macro/types";

type Capture = {
  snapshot: {
    snapshot_id: string;
    as_of: string;
    region: "US" | "CN";
    methodology_version: string;
    catalog_counts: unknown;
  };
  catalogVersion: string;
  observations: ObservationRow[];
};
async function main() {
  const out = resolve(
    "/tmp/osstack/macro-widget-correction/bundle",
    String(process.pid),
  );
  await mkdir(out, { recursive: true });
  for (const [entry, name] of [
    ["scripts/preview/workbench-entry.tsx", "workbench"],
    ["src/components/macro/ClockPreview.tsx", "component"],
  ]) {
    await build({
      entryPoints: [entry],
      bundle: true,
      outfile: resolve(out, `${name}.js`),
      jsx: "automatic",
      platform: "browser",
      define: { "process.env.NODE_ENV": '"development"', "process.env": "{}" },
      alias: {
        "@/lib/supabase/client": resolve("scripts/preview/auth-boundary.ts"),
      },
      tsconfig: "tsconfig.json",
    });
    const path = resolve(out, `${name}.css`);
    const css = await postcss([
      tailwindcss({ config: resolve("tailwind.config.ts") }),
      autoprefixer,
    ]).process(await readFile(path, "utf8"), { from: path });
    await writeFile(path, css.css);
  }
  const root =
    process.env.MACRO_PREVIEW_FIXTURE_ROOT ??
    "/tmp/osstack/widget-full-fixtures";
  const capture = async (region: string) =>
    JSON.parse(
      await readFile(
        resolve(root, `osbornalpha-${region.toLowerCase()}-snapshot.json`),
        "utf8",
      ),
    ) as Capture;
  const cards = async (region: string) =>
    JSON.parse(
      await readFile(
        resolve(root, `osbornalpha-${region.toLowerCase()}-card.json`),
        "utf8",
      ),
    ) as unknown;
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const region = url.searchParams.get("region") === "CN" ? "CN" : "US";
      const json = (data: unknown) => {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(data));
      };
      if (url.pathname.startsWith("/fixtures/")) {
        const r = url.pathname.endsWith("CN") ? "CN" : "US";
        json({ snapshot: await capture(r), cards: await cards(r) });
        return;
      }
      if (url.pathname === "/api/judgments") {
        json(
          await cards(
            url.searchParams.get("subject_key") === "CN" ? "CN" : "US",
          ),
        );
        return;
      }
      if (url.pathname.startsWith("/api/macro/snapshots/")) {
        for (const r of ["US", "CN"]) {
          const dto = await capture(r);
          if (url.pathname.endsWith(dto.snapshot.snapshot_id)) {
            json(dto);
            return;
          }
        }
        res.statusCode = 404;
        json({ error: { code: "unknown_snapshot" } });
        return;
      }
      if (url.pathname === "/api/macro/overview") {
        const dto = await capture(region);
        // A transport adapter, derived only from the immutable full capture. No invented changes or freshness.
        const indicators = indicatorsOf(region).map((def) => {
          const obs = dto.observations
            .filter((o) => o.series_id === def.id)
            .sort((a, b) => b.period_end.localeCompare(a.period_end))[0];
          return {
            observation_id: obs?.observation_id ?? null,
            series_id: def.id,
            name: def.name,
            value_text: obs?.value_text ?? null,
            unit: def.unit,
            change: null,
            period_end: obs?.period_end ?? null,
            available_at: obs?.available_at ?? null,
            timeliness: "n/a",
            status:
              def.status === "active"
                ? "A"
                : def.status === "restricted"
                  ? "R"
                  : "M",
            reason: def.reason,
            retrieval_id: obs?.retrieval_id ?? null,
            sparkline: dto.observations
              .filter((o) => o.series_id === def.id)
              .sort((a, b) => a.period_end.localeCompare(b.period_end))
              .map((o) => o.value_text),
          };
        });
        json({
          regions: {
            [region]: {
              snapshotId: dto.snapshot.snapshot_id,
              asOf: dto.snapshot.as_of,
              catalogVersion: dto.catalogVersion,
              methodologyVersion: dto.snapshot.methodology_version,
              collection: [],
              indicators,
              changes: {
                counts: { new_release: 0, revised: 0, late: 0, missing: 0 },
                items: [],
              },
              catalogCounts: dto.snapshot.catalog_counts,
            },
          },
        });
        return;
      }
      if (/^\/api\/macro\/series\/[^/]+\/versions$/.test(url.pathname)) {
        const id = url.pathname.split("/")[4],
          dto = await capture(id.startsWith("CN_") ? "CN" : "US");
        const observations = dto.observations.filter(
          (o) =>
            o.series_id === id &&
            o.period_end === url.searchParams.get("period_end"),
        );
        json({
          series_id: id,
          read_series_id: id,
          period_end: url.searchParams.get("period_end"),
          versions: observations.map((o) => ({
            ...o,
            retrieval: null,
            evidence: null,
            inputs: (o.derived_from ?? []).map((observation_id) => ({
              observation_id,
              missing: true,
            })),
          })),
        });
        return;
      }
      if (url.pathname === "/intel/methods/macro_regime/v2") {
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end(
          await readFile("docs/methodologies/macro_regime/v2.md", "utf8"),
        );
        return;
      }
      if (/^\/(workbench|component)\.(js|css)$/.test(url.pathname)) {
        res.setHeader(
          "Content-Type",
          url.pathname.endsWith(".css") ? "text/css" : "application/javascript",
        );
        res.end(await readFile(resolve(out, url.pathname.slice(1))));
        return;
      }
      if (
        url.pathname === "/" ||
        url.pathname === "/macro" ||
        url.pathname === "/component"
      ) {
        const name = url.pathname === "/component" ? "component" : "workbench";
        res.setHeader("Content-Type", "text/html");
        res.end(
          `<!doctype html><html class="theme-dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fixture-backed MacroWorkbench</title><link rel="stylesheet" href="/${name}.css"></head><body><div id="root"></div><script src="/${name}.js"></script></body></html>`,
        );
        return;
      }
      res.statusCode = 404;
      res.end("Not provided by the local fixture transport");
    } catch (e) {
      res.statusCode = 500;
      res.end(String(e));
    }
  });
  server.listen(3121, "127.0.0.1", () =>
    console.log(
      "Real MacroWorkbench: http://127.0.0.1:3121/macro · component: /component",
    ),
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
