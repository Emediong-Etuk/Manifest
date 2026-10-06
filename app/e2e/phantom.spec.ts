/**
 * Guard for the Phantom wallet bridge (devnet builds). The other specs run on localnet with
 * the test wallet, so they never mount Phantom; this one loads the main pages of a devnet
 * build and fails if React reports a render loop, as it did when the bridge depended on
 * useSolana()'s per-render object. Skipped unless E2E_PHANTOM_URL is set:
 *
 *   E2E_PHANTOM_URL=https://manifest-seven-tau.vercel.app \
 *     pnpm --filter @manifest/app exec playwright test e2e/phantom.spec.ts
 */
import { expect, test } from "@playwright/test";

const BASE = process.env.E2E_PHANTOM_URL;
const PAGES = ["/", "/containers", "/me", "/forwarder", "/verify", "/admin"];
// Dev builds print the message; production builds print React's minified error #185.
const LOOP = /Maximum update depth exceeded|Minified React error #185/;

test.skip(!BASE, "set E2E_PHANTOM_URL to a devnet (Phantom) build");

for (const path of PAGES) {
  test(`no render loop with the Phantom wallet: ${path}`, async ({ page }) => {
    const loops: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" && LOOP.test(m.text())) loops.push(m.text().slice(0, 200));
    });
    page.on("pageerror", (e) => {
      if (LOOP.test(e.message)) loops.push(e.message.slice(0, 200));
    });
    await page.goto(new URL(path, BASE).toString(), { waitUntil: "load" });
    await expect(page.getByRole("banner")).toBeVisible();
    await page.waitForTimeout(5_000);
    expect(loops, "React render loop").toEqual([]);
  });
}
