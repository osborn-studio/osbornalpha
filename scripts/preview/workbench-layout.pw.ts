import { test, expect, type Locator } from "@playwright/test";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import {
  clockRowsFrom,
  quadrantRows,
  CLOCK_ORDER,
} from "../../src/components/macro/clock-model";
const out = "/tmp/osstack/macro-widget-correction";
const fixture = (region: string, kind: string) =>
  JSON.parse(
    readFileSync(
      `/tmp/osstack/widget-full-fixtures/osbornalpha-${region.toLowerCase()}-${kind}.json`,
      "utf8",
    ),
  );
async function assertCells(panel: Locator) {
  const geometry = await panel.evaluate((el) => {
    const panel = el.getBoundingClientRect(),
      content = el.querySelector(".clock-table-scroll")!,
      clip = content.getBoundingClientRect();
    return {
      width: panel.width,
      stacked:
        getComputedStyle(el.querySelector("tbody tr")!).display === "grid",
      scroll: content.scrollWidth - content.clientWidth,
      cells: [...el.querySelectorAll("tbody th,tbody td")].map((cell) => {
        const rect = cell.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(cell);
        const text = range.getBoundingClientRect();
        return {
          value: cell.textContent,
          left: rect.left,
          right: rect.right,
          textRight: text.right,
          limit: Math.min(panel.right, clip.right),
          start: Math.max(panel.left, clip.left),
          overflow: cell.scrollWidth - cell.clientWidth,
          label: cell.getAttribute("data-label"),
          visibleLabel: getComputedStyle(cell, "::before").content,
        };
      }),
    };
  });
  expect(geometry.scroll).toBeLessThanOrEqual(0.1);
  for (const cell of geometry.cells) {
    expect(cell.left, JSON.stringify(cell)).toBeGreaterThanOrEqual(
      cell.start - 0.1,
    );
    expect(cell.right, JSON.stringify(cell)).toBeLessThanOrEqual(
      cell.limit + 0.1,
    );
    expect(cell.textRight, JSON.stringify(cell)).toBeLessThanOrEqual(
      cell.limit + 0.1,
    );
    expect(cell.overflow, JSON.stringify(cell)).toBeLessThanOrEqual(0.1);
    if (geometry.stacked && cell.label)
      expect(cell.visibleLabel).toContain(cell.label);
  }
  return geometry;
}
test.beforeAll(async () => {
  await mkdir(`${out}/screenshots`, { recursive: true });
  await mkdir(`${out}/geometry`, { recursive: true });
});
for (const kind of ["component", "macro"])
  for (const locale of ["zh", "en"] as const)
    for (const region of ["US", "CN"])
      for (const width of [320, 390, 768, 1024, 1440]) {
        test(`${kind} ${region} ${locale} ${width}`, async ({ page }) => {
          const errors: string[] = [];
          page.on("pageerror", (e) => errors.push(e.message));
          await page.setViewportSize({ width, height: 1000 });
          await page.goto(`/${kind}?region=${region}&locale=${locale}`);
          const widget = page.locator(".investment-clock");
          await expect(widget.locator(".clock-panel")).toHaveCount(4);
          await expect(widget.locator("[data-current]")).toHaveAttribute(
            "data-phase",
            region === "US" ? "overheat" : "stagflation",
          );
          await expect(widget.locator(".clock-coverage summary")).toContainText(
            "60%",
          );
          await expect(widget.locator(".clock-limitations")).toContainText(
            region === "US"
              ? locale === "en"
                ? "Growth"
                : "增长"
              : locale === "en"
                ? "tie"
                : "并列",
          );
          const dto = fixture(region, "snapshot"),
            rows = clockRowsFrom(dto, dto.snapshot.snapshot_id, locale);
          expect(
            rows.every(
              (row) => row.value !== null && !row.rule.includes(row.ruleId),
            ),
          ).toBe(true);
          const record: unknown[] = [];
          for (const phase of CLOCK_ORDER) {
            const panel = widget.locator(`[data-phase="${phase}"]`),
              button = panel.locator(".clock-inspect");
            await button.focus();
            await page.keyboard.press("Enter");
            await expect(button).toHaveAttribute("aria-expanded", "true");
            const ranked = quadrantRows(rows, phase);
            await expect(panel.locator("tbody tr")).toHaveCount(ranked.length);
            for (let i = 0; i < ranked.length; i++) {
              const cells = panel.locator("tbody tr").nth(i).locator("th,td"),
                r = ranked[i];
              await expect(cells.nth(0)).toContainText(r.name);
              await expect(cells.nth(1)).toHaveText(r.value!);
              await expect(cells.nth(2)).toHaveText(r.rule);
              await expect(cells.nth(3)).toHaveText(String(r.weight));
              await expect(cells.nth(4)).toHaveText(String(r.amount));
            }
            record.push({ phase, ...(await assertCells(panel)) });
            await expect(widget.locator("[data-current]")).toHaveAttribute(
              "data-phase",
              region === "US" ? "overheat" : "stagflation",
            );
            if (phase === (region === "US" ? "overheat" : "stagflation"))
              await widget.screenshot({
                path: `${out}/screenshots/${kind}-${region}-${locale}-${width}-expanded.png`,
              });
            await page.keyboard.press("Escape");
            await expect(button).toBeFocused();
            await expect(button).toHaveAttribute("aria-expanded", "false");
          }
          if (kind === "macro") {
            const main = page.locator(".macro-overview-main"),
              box = await main.boundingBox(),
              clock = await widget.boundingBox();
            expect(Math.abs(box!.width - clock!.width)).toBeLessThan(2);
            if (width === 1440) expect(clock!.width).toBeGreaterThan(1000);
            await expect(page.locator("#macro-indicators table")).toBeVisible();
            await expect(page.locator(".macro-local-nav")).toBeVisible({
              visible: width >= 1280,
            });
          }
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth - innerWidth,
            ),
          ).toBeLessThanOrEqual(0.1);
          expect(errors).toEqual([]);
          await writeFile(
            `${out}/geometry/${kind}-${region}-${locale}-${width}.json`,
            JSON.stringify(record, null, 2),
          );
        });
      }
test("real workbench evidence, anchors, region switch, tab navigation and methodology destination", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/macro?region=US&locale=en");
  const widget = page.locator(".investment-clock");
  await expect(widget.locator("[data-current]")).toHaveCount(1);
  await page.locator('.macro-local-nav a[href="#macro-indicators"]').click();
  await expect(page).toHaveURL(/#macro-indicators$/);
  await page.locator('.macro-local-nav a[href="#investment-clock"]').click();
  const panel = widget.locator('[data-phase="overheat"]');
  await panel.locator(".clock-inspect").click();
  const evidence = panel.locator(".clock-evidence-links button").first();
  const label = await evidence.textContent();
  const request = page.waitForRequest((r) =>
    r.url().includes("/versions?period_end="),
  );
  await evidence.click();
  const req = await request;
  expect(req.url()).toContain(
    "/api/macro/series/US_CPI_YOY/versions?period_end=2026-09-30",
  );
  const drawer = page.getByRole("dialog");
  await expect(drawer).toContainText("3.72%");
  await expect(drawer).toContainText("US_CPI_YOY");
  await expect(drawer).toContainText("2026-09-30");
  await expect(drawer).toContainText("yoy_from_index@1");
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(evidence).toBeFocused();
  expect(label).toContain("CPI");
  const top = page.getByRole("navigation", { name: "Workbench sections" });
  await top
    .getByRole("button", { name: "Method & sources", exact: true })
    .click();
  await expect(page).toHaveURL(/tab=methodology/);
  await expect(page.locator(".investment-clock")).toHaveCount(0);
  await top.getByRole("button", { name: "Indicators", exact: true }).click();
  await expect(page).toHaveURL(/tab=indicators/);
  await expect(page.locator("table").first()).toBeVisible();
  await top.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(widget.locator("[data-current]")).toHaveCount(1);
  await page
    .getByRole("group", { name: "Region" })
    .getByRole("button", { name: "China", exact: true })
    .click();
  await expect(widget.locator("[data-current]")).toHaveAttribute(
    "data-phase",
    "stagflation",
  );
  await expect(widget.locator(".clock-limitations")).toContainText("tie");
  const method = widget.locator(".clock-audit-row>a");
  await expect(method).toHaveAttribute(
    "href",
    "/intel/methods/macro_regime/v2",
  );
  await method.click();
  await expect(page).toHaveURL(/\/intel\/methods\/macro_regime\/v2$/);
  await expect(page.locator("body")).toContainText("macro_regime");
});

test("desktop containers choose cards or a fitted five-column table by their own width", async ({
  page,
}) => {
  for (const width of [1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/macro?region=US&locale=en");
    const panel = page.locator('[data-phase="overheat"]');
    await expect(panel.locator(".clock-inspect")).toBeVisible();
    await panel.locator(".clock-inspect").click();
    const geometry = await assertCells(panel);
    expect(geometry.stacked).toBe(width === 1440);
    await panel.screenshot({
      path: `${out}/screenshots/container-US-en-${width}.png`,
    });
  }
});

test("ROOT 1440 viewport / 544px quadrant regression: every contribution digit fits", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/component?region=US&locale=en");
  await page.addStyleTag({
    content: ".clock-preview-shell{padding-inline:31px}",
  });
  const panel = page.locator('[data-phase="overheat"]');
  await panel.locator(".clock-inspect").click();
  const geometry = await assertCells(panel);
  expect(geometry.width).toBe(544);
  expect(geometry.stacked).toBe(true);
  await writeFile(
    `${out}/regression-after.json`,
    JSON.stringify(geometry, null, 2),
  );
  await panel
    .locator(".clock-breakdown")
    .screenshot({ path: `${out}/screenshots/regression-after-US-en-544.png` });
});
