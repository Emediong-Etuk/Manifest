/**
 * Smoke + quality checks on the public pages: landing → containers → container detail
 * renders; no horizontal scrolling at 360 px; no WCAG 2.1 AA violations found by axe.
 * Needs at least one container onchain (run seed-demo, or the lifecycle test first).
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const PHONE = { width: 360, height: 780 };

async function checkPage(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "horizontal scroll at 360 px").toBeLessThanOrEqual(0);
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    axe.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`),
    "axe violations",
  ).toEqual([]);
}

test("landing → containers → container detail, on a phone", async ({ browser }) => {
  const context = await browser.newContext({ viewport: PHONE, isMobile: true, hasTouch: true });
  const page = await context.newPage();

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await checkPage(page);

  await page.getByRole("link", { name: "Containers" }).first().click();
  await expect(page).toHaveURL(/\/containers$/);
  const first = page.locator('a[href^="/c/"]').first();
  await expect(first).toBeVisible({ timeout: 30_000 });
  await checkPage(page);

  await first.click();
  await expect(page).toHaveURL(/\/c\//);
  await expect(page.getByText("Freight rate")).toBeVisible({ timeout: 30_000 });
  await checkPage(page);

  for (const path of ["/verify", "/forwarder", "/me", "/admin"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await checkPage(page);
  }
  await context.close();
});
