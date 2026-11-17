/** Standalone capture against scripts/preview/macro-clock.ts (serve generated fixtures).
 * npx tsx scripts/preview/clock-screens.ts <baseUrl> <outDir>
 */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import zh from "../../messages/zh/macro.json";

async function main() {
  const [baseUrl, outDir] = process.argv.slice(2);
  assert(baseUrl && outDir, "Usage: npx tsx scripts/preview/clock-screens.ts <baseUrl> <outDir>");
  const base = new URL(baseUrl);
  assert(["http:", "https:"].includes(base.protocol), "baseUrl must be HTTP(S)");
  await mkdir(resolve(outDir), { recursive: true });
  const browser = await chromium.launch();
  try {
    const captures: { region: "US" | "CN"; mode: "missing" | null; device: string; width: number; height: number }[] = (["US", "CN"] as const).flatMap(region => [
      { region, mode: null, device: "desktop", width: 1280, height: 900 },
      { region, mode: null, device: "mobile", width: 390, height: 844 },
    ]);
    captures.push({ region: "US", mode: "missing", device: "missing", width: 1280, height: 900 });
    for (const capture of captures) {
      const { region, mode, device, width, height } = capture;
      const page = await browser.newPage({ viewport: { width, height }, locale: "zh-CN", deviceScaleFactor: 1 });
      try {
        const errors: string[] = [];
        page.on("pageerror", error => errors.push(error.message));
        const url = new URL(base);
        url.searchParams.set("region", region);
        url.searchParams.set("locale", "zh");
        url.searchParams.delete("mode");
        if (mode) url.searchParams.set("mode", mode);
        const response = await page.goto(url.toString(), { waitUntil: "networkidle" });
        assert(response?.ok(), `Preview HTTP failure: ${url}`);
        const grid = page.locator(".investment-clock:not([aria-busy='true']) .clock-grid");
        await grid.locator(".clock-panel").nth(3).waitFor({ state: "visible" });
        assert.equal(await grid.locator(".clock-panel").count(), 4);
        assert.equal(await grid.locator("[data-current]").count(), mode ? 0 : 1);
        if (mode === "missing")
          await page.getByText(zh.judgment.clock.reasons.missing, { exact: true }).waitFor({ state: "visible" });
        if (device === "desktop") {
          const first = grid.locator(".clock-panel").first();
          const inspect = first.locator("button.clock-inspect");
          if ((await inspect.getAttribute("aria-expanded")) !== "true") await inspect.click();
          assert.equal(await inspect.getAttribute("aria-expanded"), "true");
          await first.getByRole("table").waitFor({ state: "visible" });
        }
        await page.evaluate(() => document.fonts.ready);
        assert.deepEqual(errors, [], `${region} ${device}: browser errors`);
        const path = resolve(outDir, `clock-${region.toLowerCase()}-${device}.png`);
        await page.screenshot({ path, fullPage: true, animations: "disabled" });
        console.log(`Captured ${path}`);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
