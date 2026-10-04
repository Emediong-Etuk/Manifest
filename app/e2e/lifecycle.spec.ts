/**
 * Two browsers, one shipment: forwarder registers, posts a guarantee and opens a
 * container; trader books; forwarder records receipt with a photo; trader approves;
 * forwarder closes, loads and marks arrived; trader shows the pickup code; forwarder
 * scans (pastes) it; trader confirms pickup. Every step is a real transaction on the
 * local validator.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction } from "@solana/web3.js";
import sharp from "sharp";

const RPC = process.env.E2E_RPC_URL ?? "http://127.0.0.1:8899";
const MINT = new PublicKey(process.env.E2E_MINT ?? "");
const USD = 1_000_000n;

const connection = new Connection(RPC, "confirmed");
const admin = Keypair.fromSecretKey(
  Uint8Array.from(
    JSON.parse(
      readFileSync(join(homedir(), ".config/solana/manifest-dev.json"), "utf8"),
    ) as number[],
  ),
);

async function fund(owner: PublicKey, dollars: bigint) {
  const sig = await connection.requestAirdrop(owner, 10 * LAMPORTS_PER_SOL);
  await connection.confirmTransaction(sig, "confirmed");
  const ata = getAssociatedTokenAddressSync(MINT, owner);
  const tx = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(admin.publicKey, ata, owner, MINT),
    createMintToInstruction(MINT, ata, admin.publicKey, dollars * USD),
  );
  await connection
    .sendTransaction(tx, [admin])
    .then((s) => connection.confirmTransaction(s, "confirmed"));
}

async function walletPage(browser: Browser, kp: Keypair): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 412, height: 915 } });
  await context.addInitScript(
    (secret) => {
      window.localStorage.setItem("manifest.burner", secret);
    },
    JSON.stringify(Array.from(kp.secretKey)),
  );
  return context.newPage();
}

async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.getByRole("status").filter({ hasText: text }).first()).toBeVisible({
    timeout: 60_000,
  });
}

test("trader and forwarder complete a shipment end to end", async ({ browser }) => {
  const forwarderKp = Keypair.generate();
  const traderKp = Keypair.generate();
  const payee = Keypair.generate().publicKey.toBase58();
  await fund(forwarderKp.publicKey, 10_000n);
  await fund(traderKp.publicKey, 10_000n);
  const code = `E2E-${Date.now().toString().slice(-6)}`;

  const fwd = await walletPage(browser, forwarderKp);
  const trader = await walletPage(browser, traderKp);

  // Forwarder: register, post guarantee, open container.
  await fwd.goto("/forwarder");
  await fwd.getByLabel("Company name").fill("Eastline Cargo");
  await fwd.getByRole("button", { name: "Create forwarder account" }).click();
  await expectToast(fwd, "Forwarder account created");
  await fwd.getByLabel("Add to guarantee").fill("5000");
  await fwd.getByRole("button", { name: "Deposit" }).click();
  await expectToast(fwd, "Guarantee increased");
  await fwd.getByLabel("Container code").fill(code);
  await fwd.getByRole("button", { name: "Open container" }).click();
  await fwd.waitForURL(/\/forwarder\/c\//, { timeout: 60_000 });
  const container = fwd.url().split("/forwarder/c/")[1] ?? "";

  // Trader: find the container and book.
  await trader.goto("/containers");
  await trader.getByRole("link", { name: new RegExp(code) }).click();
  await trader.getByRole("link", { name: "Book space" }).click();
  await trader.getByLabel("Goods value").fill("2400");
  await trader.getByLabel("What are you shipping?").fill("Phone cases, 12 cartons");
  await trader.getByRole("button", { name: "Next" }).click();
  await trader.getByLabel("Estimated volume (CBM)").fill("1.25");
  await trader.getByRole("button", { name: "Next" }).click();
  await trader.getByLabel("Supplier's payout address").fill(payee);
  await trader.getByLabel("Type the last 4 characters to confirm").fill(payee.slice(-4));
  await trader.getByRole("button", { name: "Next" }).click();
  await expect(trader.getByText("$2,940.50").first()).toBeVisible();
  await trader.getByRole("button", { name: /Lock \$2,940\.50 and book/ }).click();
  await trader.waitForURL(/\/s\//, { timeout: 60_000 });
  const shipment = trader.url().split("/s/")[1] ?? "";

  // Forwarder: record receipt with a photo.
  await fwd.goto(`/forwarder/c/${container}`);
  const photo = await sharp({
    create: { width: 800, height: 600, channels: 3, background: "#c2410c" },
  })
    .jpeg()
    .toBuffer();
  await fwd
    .getByLabel(/Photos of the cartons/)
    .setInputFiles({ name: "cartons.jpg", mimeType: "image/jpeg", buffer: photo });
  await fwd.getByLabel("Measured volume (CBM)").fill("1");
  await fwd.getByLabel("Cartons", { exact: true }).fill("12");
  await fwd.getByLabel("Item 1").fill("iPhone 15 silicone cases");
  await fwd.getByLabel("Quantity 1").fill("2400");
  await fwd.getByRole("button", { name: "Upload evidence and record receipt" }).click();
  await expectToast(fwd, "Receipt recorded onchain");

  // Trader: evidence verifies against the onchain hash; approve.
  await trader.goto(`/s/${shipment}`);
  await expect(trader.getByText("Matches the record on Solana")).toBeVisible();
  await trader.getByRole("button", { name: "Approve goods" }).click();
  await trader.getByRole("button", { name: "Yes, pay $2,400.00" }).click();
  await expectToast(trader, "Supplier paid");

  // Forwarder: close, load, arrive.
  await fwd.goto(`/forwarder/c/${container}`);
  await fwd.getByRole("button", { name: "Close bookings" }).click();
  await expectToast(fwd, "Bookings closed");
  await fwd.getByLabel("Container number (ISO 6346)").fill("CSQU3054383");
  await fwd
    .getByLabel("Bill of lading (file)")
    .setInputFiles({
      name: "bl.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("bill of lading"),
    });
  await fwd.getByRole("button", { name: "Mark loaded" }).click();
  await expectToast(fwd, "Container loaded");
  await fwd.getByRole("button", { name: /Mark arrived/ }).click();
  await expectToast(fwd, "Container arrived");

  // Trader: pickup code; forwarder verifies it.
  await trader.goto(`/s/${shipment}`);
  await trader.getByRole("button", { name: "Show pickup code" }).click();
  await expect(trader.getByAltText("Pickup code for the forwarder to scan")).toBeVisible();
  const code64 = await trader.locator("textarea").first().inputValue();
  await fwd.reload();
  await fwd.getByText("Paste a code instead").click();
  await fwd.locator("textarea").last().fill(code64);
  await fwd.getByRole("button", { name: "Check code" }).click();
  await expect(fwd.getByText("Valid ticket")).toBeVisible();
  await expect(fwd.getByText("12 cartons", { exact: true })).toBeVisible();

  // Trader: confirm pickup.
  await trader.getByRole("button", { name: "I've collected my goods" }).click();
  await trader.getByRole("button", { name: "Confirm pickup" }).click();
  await expectToast(trader, "Pickup confirmed");
  await expect(trader.getByText("Collected").first()).toBeVisible();
});
