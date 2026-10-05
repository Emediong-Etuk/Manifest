/**
 * Rehearsal of docs/DEMO_SCRIPT.md on a local validator, click for click (Phantom replaced by
 * the localnet test wallet, dial.to by the same Actions GET/POST a Blink client makes):
 * demo-reset → Blink booking → receipt with photo → VERIFIED → approve → ticket transfer →
 * pickup code paste → confirm pickup → Squads slash via resolve-dispute → /admin.
 * Needs the seed-demo world and its keys in .keys/ (skipped otherwise), and the app started
 * like the judge test (GAS_TANK_SECRET_KEY = dev key, NEXT_PUBLIC_DEMO_MINT = E2E_MINT).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, type Page, test } from "@playwright/test";
import { Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";

import { connection, expectToast, fund, walletPage } from "./helpers";

const ROOT = resolve(__dirname, "../..");
const KEYS = resolve(ROOT, ".keys");
const key = (name: string) =>
  Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(resolve(KEYS, `${name}.json`), "utf8")) as number[]),
  );
const scripts = (...args: string[]) =>
  execFileSync("pnpm", ["--filter", "@manifest/scripts", ...args], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, NEXT_PUBLIC_CLUSTER: "localnet" },
  });

/** The `<section>` card for one shipment on the forwarder's container page. */
const shipmentCard = (page: Page, label: string) =>
  page
    .locator("section")
    .filter({ has: page.getByRole("link", { name: label, exact: true }) })
    .last();

test.skip(!existsSync(resolve(KEYS, "demo-forwarder-eastline.json")), "needs seed-demo");

test("technical demo script runs end to end", async ({ browser }) => {
  test.setTimeout(600_000);
  const { decodeFixed, getProgram, listConsignments, listContainers, forwarderPda } =
    await import("@manifest/sdk");
  const program = getProgram(connection);
  const eastline = key("demo-forwarder-eastline");
  const ada = key("demo-trader-ada");
  const dele = key("demo-buyer-dele").publicKey;

  // Before recording: demo-reset prints a fresh container (LAG-NEW).
  const reset = scripts("demo-reset");
  const match = /(LAG-\d+)\s+\S+\/c\/([1-9A-HJ-NP-Za-km-z]+)/.exec(reset);
  expect(match, reset).not.toBeNull();
  const code = match?.[1] ?? "";
  const container = match?.[2] ?? "";

  // 0:45 Blink: what dial.to does. GET the Action, POST with the wallet, sign, send.
  const trader = Keypair.generate();
  await fund(trader.publicKey, 1_000n);
  const action = `/api/actions/book/${container}`;
  const get = await (await fetch(`http://localhost:3000${action}`)).json();
  expect(get.title).toContain(`Book space on ${code}`);
  const href = (get.links.actions[0].href as string)
    .replace("{goods}", "300")
    .replace("{cbm}", "0.25")
    .replace("{payee}", dele.toBase58())
    .replace("{description}", encodeURIComponent("Phone cases, 3 cartons"));
  const post = await fetch(href, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account: trader.publicKey.toBase58() }),
  });
  const body = (await post.json()) as { transaction: string; message: string };
  expect(post.status, body.message).toBe(200);
  expect(body.message).toContain("$406.75");
  const tx = VersionedTransaction.deserialize(Buffer.from(body.transaction, "base64"));
  tx.message.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.sign([trader]);
  await connection.confirmTransaction(await connection.sendTransaction(tx), "confirmed");
  const [mine] = await listConsignments(program, {
    container: new PublicKey(container),
    trader: trader.publicKey,
  });
  expect(mine).toBeDefined();
  const shipment = mine!.address.toBase58();
  const label = `${code}-${mine!.account.index}`;

  // 1:05 Window B (Eastline): record receipt with a photo.
  const fwd = await walletPage(browser, eastline);
  await fwd.goto(`/forwarder/c/${container}`);
  const card = shipmentCard(fwd, label);
  await card
    .getByLabel(/Photos of the cartons/)
    .setInputFiles(resolve(ROOT, "scripts/demo-assets/cartons-stack.jpg"));
  await card.getByLabel("Measured volume (CBM)").fill("0.22");
  await card.getByLabel("Cartons", { exact: true }).fill("3");
  await card.getByLabel("Item 1").fill("Phone cases");
  await card.getByLabel("Quantity 1").fill("300");
  await card.getByRole("button", { name: "Upload evidence and record receipt" }).click();
  await expectToast(fwd, "Receipt recorded onchain");

  // 1:30 Window A (trader): VERIFIED, approve.
  const tr = await walletPage(browser, trader);
  await tr.goto(`/s/${shipment}`);
  await expect(tr.getByText("Matches the record on Solana")).toBeVisible();
  await tr.getByRole("button", { name: "Approve goods" }).click();
  await tr.getByRole("button", { name: "Yes, pay $300.00" }).click();
  await expectToast(tr, "Supplier paid");

  // 1:50 Transfer the Cargo Ticket to Dele.
  await tr.getByText("Sell goods in transit (transfer Cargo Ticket)").click();
  await tr.getByLabel("Buyer's wallet address").fill(dele.toBase58());
  await tr.getByLabel("Type the last 4 characters to confirm").fill(dele.toBase58().slice(-4));
  await tr.getByRole("button", { name: "Transfer ticket" }).click();
  await expectToast(tr, "Cargo Ticket transferred");

  // 2:05 Ada at LAG-0930: pickup code → forwarder pastes it → confirm pickup.
  const lag0930 = (
    await listContainers(program, {
      forwarder: forwarderPda(eastline.publicKey, program.programId),
    })
  ).find((k) => decodeFixed(k.account.code) === "LAG-0930");
  expect(lag0930).toBeDefined();
  const ready = (
    await listConsignments(program, { container: lag0930!.address, trader: ada.publicKey })
  ).find((s) => "approved" in s.account.status);
  test.skip(!ready, "Ada's LAG-0930 pickup was already used in an earlier take; re-seed");
  const adaPage = await walletPage(browser, ada);
  await adaPage.goto(`/s/${ready!.address.toBase58()}`);
  await adaPage.getByRole("button", { name: "Show pickup code" }).click();
  await adaPage.getByText("Can't scan? Copy the code").click();
  const pickupCode = await adaPage.locator("textarea").first().inputValue();
  await fwd.goto(`/forwarder/c/${lag0930!.address.toBase58()}`);
  await fwd.getByText("Paste a code instead").click();
  await fwd.locator("textarea").last().fill(pickupCode);
  await fwd.getByRole("button", { name: "Check code" }).click();
  await expect(fwd.getByText("Valid ticket")).toBeVisible();
  await adaPage.getByRole("button", { name: "I've collected my goods" }).click();
  await adaPage.getByRole("button", { name: "Confirm pickup" }).click();
  await expectToast(adaPage, "Pickup confirmed");

  // 2:30 Squads slash on the disputed shipment, then /admin.
  const disputed = (
    await listConsignments(program, { container: lag0930!.address, status: "disputed" })
  )[0];
  if (disputed) {
    const out = scripts(
      "resolve-dispute",
      "--consignment",
      disputed.address.toBase58(),
      "--resolution",
      "slash",
      "--amount",
      "500",
    );
    expect(out).toContain("Consignment is now compensated");
  }
  await tr.goto("/admin");
  await expect(tr.getByText("Paid from guarantees")).toBeVisible();
});
