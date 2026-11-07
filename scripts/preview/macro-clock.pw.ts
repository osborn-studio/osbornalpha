import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const out = "/tmp/osstack/macro-widget/screenshots";
test.beforeAll(async () => {
  await mkdir(out, { recursive: true });
});
for (const region of ["US", "CN"])
  for (const width of [390, 768, 1440]) {
    test(`${region} ${width}px full widget and breakdown`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`/?region=${region}&locale=zh`);
      const widget = page.locator(".investment-clock");
      await expect(widget.locator(".clock-panel")).toHaveCount(4);
      await expect(widget.locator("[data-current]")).toHaveCount(1);
      await expect(widget.locator(".clock-coverage summary")).toContainText(
        "数据覆盖率 60%",
      );
      if (region === "US")
        await expect(widget.locator(".clock-limitations")).toContainText(
          "增长",
        );
      else
        await expect(widget.locator(".clock-limitations")).toContainText(
          "零分差并列",
        );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await widget.screenshot({
        path: `${out}/${region.toLowerCase()}-${width}-full.png`,
      });
      const current = widget
        .locator("[data-current]")
        .getAttribute("data-phase");
      const button = widget.locator('[data-phase="recovery"] .clock-inspect');
      await button.focus();
      await page.keyboard.press("Enter");
      await expect(button).toHaveAttribute("aria-expanded", "true");
      await expect(widget.locator("[data-current]")).toHaveAttribute(
        "data-phase",
        (await current) ?? "",
      );
      await expect(widget.locator(".clock-breakdown table")).toBeVisible();
      // Captured DTOs omit observations: never invent values from the rule thresholds.
      await expect(widget.locator(".clock-breakdown")).toContainText(
        "数值未提供",
      );
      await widget.screenshot({
        path: `${out}/${region.toLowerCase()}-${width}-expanded.png`,
      });
      await widget.locator(".clock-table-scroll").focus();
      await page.keyboard.press("Escape");
      await expect(button).toHaveAttribute("aria-expanded", "false");
      await expect(button).toBeFocused();
      await page.keyboard.press("Space");
      await expect(button).toHaveAttribute("aria-expanded", "true");
      await page.keyboard.press("Escape");
      await expect(button).toHaveAttribute("aria-expanded", "false");
      await expect(widget.locator(".clock-inspect")).toHaveCount(4);
      expect(errors).toEqual([]);
    });
  }
test("all four phases show their own raw contributions, light theme and English", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/?region=CN&locale=en");
  await expect(page.locator(".clock-panel")).toHaveCount(4);
  for (const [phase, total] of [
    ["recovery", "10.5"],
    ["overheat", "12"],
    ["stagflation", "21"],
    ["recession", "21"],
  ]) {
    const panel = page.locator(`[data-phase="${phase}"]`);
    await expect(panel.locator(".clock-total strong")).toHaveText(total);
    await panel.locator(".clock-inspect").click();
    await expect(panel.locator("tbody tr")).toHaveCount(6);
  }
  await page.getByRole("button", { name: "◐ Theme" }).click();
  await page
    .locator(".investment-clock")
    .screenshot({ path: `${out}/cn-1440-english-light.png` });
});
for (const mode of ["stale", "abstained", "missing", "empty", "loading"])
  test(`honest ${mode} state`, async ({ page }) => {
    await page.goto(`/?region=US&locale=en&mode=${mode}`);
    if (mode === "loading") {
      await expect(page.locator('[aria-busy="true"]')).toBeVisible();
      await expect(
        page.getByText("metadata unavailable", { exact: false }),
      ).toHaveCount(0);
    } else {
      await expect(page.locator(".clock-panel")).toHaveCount(4);
      if (mode !== "empty")
        await expect(page.locator("[data-current]")).toHaveCount(0);
      else
        await expect(page.locator(".clock-total strong").first()).toHaveText(
          "—",
        );
    }
  });

test("mobile keyboard follows the cycle and labels both languages accurately", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/?region=CN&locale=en");
  const phases = page.locator(".clock-panel");
  await expect(phases).toHaveCount(4);
  expect(
    await phases.evaluateAll((nodes) =>
      nodes.map((n) => n.getAttribute("data-phase")),
    ),
  ).toEqual(["recovery", "overheat", "stagflation", "recession"]);
  await expect(
    page.locator(".clock-phase-heading small").first(),
  ).toHaveAttribute("lang", "zh");
  for (const phase of ["recovery", "overheat", "stagflation", "recession"]) {
    const panel = page.locator(`[data-phase="${phase}"]`);
    await panel.locator(".clock-inspect").focus();
    await page.keyboard.press("Space");
    await expect(panel.locator(".clock-inspect")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await page.keyboard.press("Escape");
    await expect(panel.locator(".clock-inspect")).toBeFocused();
  }
});

test("phase labels and current badge meet text contrast in both themes", async ({
  page,
}) => {
  await page.goto("/?region=CN&locale=en");
  await expect(page.locator("[data-current]")).toHaveCount(1);
  for (const theme of ["dark", "light"]) {
    if (theme === "light")
      await page.getByRole("button", { name: "◐ Theme" }).click();
    const ratios = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext("2d")!;
      const luminance = (color: string) => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);
        const px = ctx.getImageData(0, 0, 1, 1).data;
        const rgb = [px[0], px[1], px[2]].map((v) => {
          const n = v / 255;
          return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
      };
      return [
        ...document.querySelectorAll(
          ".clock-phase-heading h3,.clock-current-badge,.clock-current-label",
        ),
      ].map((el) => {
        const foreground = luminance(getComputedStyle(el).color);
        const bg = el.classList.contains("clock-current-badge")
          ? el
          : (el.closest(".clock-panel") ?? el.closest(".investment-clock")!);
        const background = luminance(getComputedStyle(bg).backgroundColor);
        return (
          (Math.max(foreground, background) + 0.05) /
          (Math.min(foreground, background) + 0.05)
        );
      });
    });
    for (const ratio of ratios) expect(ratio).toBeGreaterThanOrEqual(4.5);
  }
});
