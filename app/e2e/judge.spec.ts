/**
 * Phase 5 acceptance: a judge on a phone (360 px) goes from the landing page to a booked
 * shipment in under 2 minutes: create a wallet → get test dollars from the faucet → book.
 * Needs the app running with GAS_TANK_SECRET_KEY = the dev key (seed:local makes it the
 * test-dollar mint authority) and NEXT_PUBLIC_DEMO_MINT = E2E_MINT.
 */
import { expect, test } from "@playwright/test";
import { Keypair } from "@solana/web3.js";

import { connection, expectToast, fund, MINT, sendIxs, USD } from "./helpers";

const PHONE = { width: 360, height: 780 };

test("judge books space from the landing page in under 2 minutes on a phone", async ({
  browser,
}) => {
  // A fresh forwarder opens a container with a cut-off tomorrow: the soonest one, so the
  // landing card offers it.
  // Dynamic import: the SDK is ESM-only and lives outside node_modules (workspace link).
  const { getProgram, ix } = await import("@manifest/sdk");
  const program = getProgram(connection);
  const forwarder = Keypair.generate();
  await fund(forwarder.publicKey, 2_000n);
  await sendIxs(
    await ix.registerForwarder(program, {
      authority: forwarder.publicKey,
      name: "Judge Test Freight",
      bondMint: MINT,
    }),
    [forwarder],
  );
  await sendIxs(
    await ix.depositBond(program, { authority: forwarder.publicKey, amount: 2_000n * USD }),
    [forwarder],
  );
  const code = `JDG-${Date.now().toString().slice(-6)}`;
  const now = Math.floor(Date.now() / 1000);
  await sendIxs(
    await ix.openContainer(program, {
      authority: forwarder.publicKey,
      code,
      origin: "CNCAN",
      destination: "NGAPP",
      mode: "sea",
      mint: MINT,
      capacityCbmMilli: 28_000,
      ratePerCbm: 380n * USD,
      cutoffTs: now + 3_600,
      etaTs: now + 30 * 86_400,
    }),
    [forwarder],
  );

  const context = await browser.newContext({ viewport: PHONE, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const started = Date.now();

  await page.goto("/");
  await page.getByRole("button", { name: "Create a test wallet" }).click();
  await page.getByRole("button", { name: "Get 500 test dollars" }).click();
  await expectToast(page, "500 test dollars sent");
  // The card offers the open container with the soonest cut-off (ours, or an earlier run's).
  await page.getByRole("link", { name: /^Book on / }).click();

  await page.getByLabel("Goods value").fill("300");
  await page.getByLabel("What are you shipping?").fill("Phone cases, 3 cartons");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("Estimated volume (CBM)").fill("0.25");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Use a test supplier address" }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: /^Lock .* and book$/ }).click();

  await expect(page).toHaveURL(/\/s\//, { timeout: 60_000 });
  await expect(page.getByText("Phone cases, 3 cartons")).toBeVisible();
  const seconds = (Date.now() - started) / 1000;
  console.log(`judge flow: ${seconds.toFixed(1)} s of app time (plus typing)`);
  expect(seconds).toBeLessThan(120);
  await context.close();
});
