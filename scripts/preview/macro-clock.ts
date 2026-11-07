/** Credential-free local component preview. Uses immutable captures supplied outside the repository.
 * PATH=/opt/homebrew/opt/node@22/bin:$PATH npx tsx scripts/preview/macro-clock.ts
 * Open http://127.0.0.1:3119/?region=CN&locale=zh (also mode=stale|abstained|empty|loading).
 */
import { build } from "esbuild";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
async function main() {
  const scratch = process.env.OSSTACK_SCRATCH_ROOT ?? "/tmp/osstack";
  const port = Number(process.env.PORT ?? 3119);
  const out = resolve(scratch, `macro-widget/preview-${port}`);
  await mkdir(out, { recursive: true });
  await build({
    entryPoints: ["src/components/macro/ClockPreview.tsx"],
    bundle: true,
    outdir: out,
    entryNames: "clock",
    jsx: "automatic",
    platform: "browser",
    define: { "process.env.NODE_ENV": '"development"' },
    tsconfig: "tsconfig.json",
  });
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (url.pathname.startsWith("/fixtures/")) {
        const region = url.pathname === "/fixtures/CN" ? "cn" : "us";
        const root =
          process.env.MACRO_PREVIEW_FIXTURE_ROOT ??
          "/tmp/osstack/widget-full-fixtures";
        const [snapshot, cards] = await Promise.all([
          readFile(
            resolve(root, `osbornalpha-${region}-snapshot.json`),
            "utf8",
          ),
          readFile(resolve(root, `osbornalpha-${region}-card.json`), "utf8"),
        ]);
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            snapshot: JSON.parse(snapshot),
            cards: JSON.parse(cards),
          }),
        );
        return;
      }
      if (url.pathname === "/clock.js" || url.pathname === "/clock.css") {
        res.setHeader(
          "Content-Type",
          url.pathname.endsWith(".css") ? "text/css" : "application/javascript",
        );
        res.end(await readFile(resolve(out, url.pathname.slice(1))));
        return;
      }
      if (url.pathname !== "/") {
        res.statusCode = 404;
        res.end("Local component preview only");
        return;
      }
      res.setHeader("Content-Type", "text/html");
      res.end(
        '<!doctype html><html class="theme-dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Investment clock · local preview</title><link rel="stylesheet" href="/clock.css"></head><body><div id="root"></div><script src="/clock.js"></script></body></html>',
      );
    } catch (e) {
      res.statusCode = 500;
      res.end(String(e));
    }
  });
  server.listen(port, "127.0.0.1", () =>
    console.log(`Local clock preview: http://127.0.0.1:${port}`),
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
