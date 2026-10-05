/**
 * Deploy-day and recording-day readiness check. Reads `.env.local` and the chain, never
 * prints a secret, and ends with the next steps for anything missing.
 *
 *   pnpm --filter @manifest/scripts preflight            # devnet (from .env.local)
 *   NEXT_PUBLIC_CLUSTER=localnet pnpm ... preflight      # local rehearsal
 *
 * Exit code 1 if any required check fails.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

import {
  decodeFixed,
  forwarderPda,
  getConfig,
  listContainers,
  MANIFEST_PROGRAM_ID,
  resolveProgramId,
} from "@manifest/sdk";
import { getMint } from "@solana/spl-token";
import { type Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";

import { chain } from "./lib/chain.js";
import { appUrl } from "./lib/demo.js";
import { loadEnv, REPO_ROOT } from "./lib/env.js";
import { keypairFromEnv, keypairFromFile } from "./lib/keys.js";
import { KEYS_DIR, loadSquads } from "./lib/squads.js";

loadEnv();
const c = chain();
const fixes: string[] = [];
let failed = 0;

function report(ok: boolean | null, label: string, detail = "", fix?: string) {
  const mark = ok === null ? "–" : ok ? "✓" : "✗";
  console.log(`${mark} ${label}${detail ? `: ${detail}` : ""}`);
  if (ok === false) {
    failed += 1;
    if (fix) fixes.push(fix);
  }
}
const sol = async (key: PublicKey) => (await c.connection.getBalance(key)) / LAMPORTS_PER_SOL;
const tryKey = (load: () => Keypair): Keypair | null => {
  try {
    return load();
  } catch {
    return null;
  }
};

console.log(`Manifest preflight · cluster ${c.cluster} · app ${appUrl()}\n`);

// --- RPC ---------------------------------------------------------------------------------
const version = await c.connection.getVersion().catch(() => null);
report(
  version !== null,
  "RPC reachable",
  c.connection.rpcEndpoint,
  "Check NEXT_PUBLIC_RPC_URL / RPC_URL (or start the local validator).",
);
if (!version) {
  console.log(`\nNext step: ${fixes[0]}`);
  process.exit(1);
}

// --- Keys and program ID ---------------------------------------------------------------
console.log("Keys and program");
// Cloud sessions: a key that didn't come from the MANIFEST_DEV_KEYPAIR secret was generated
// in this container and disappears with it. Never deploy with it.
const ephemeral = process.env.CLAUDE_CODE_REMOTE === "true" && !process.env.MANIFEST_DEV_KEYPAIR;
const devPath =
  process.env.MANIFEST_DEV_KEYPAIR_PATH ?? resolve(homedir(), ".config/solana/manifest-dev.json");
const dev = existsSync(devPath) ? tryKey(() => keypairFromFile(devPath)) : null;
report(
  dev !== null && !(ephemeral && c.cluster !== "localnet"),
  ephemeral ? "deploy/admin key (container-only, not durable)" : "deploy/admin key",
  dev?.publicKey.toBase58() ?? devPath,
  "Create manifest-dev.json (docs/SETUP_CHECKLIST.md) or add MANIFEST_DEV_KEYPAIR to the cloud environment.",
);

const programKeyPath = resolve(REPO_ROOT, "target/deploy/manifest-keypair.json");
const programKey = existsSync(programKeyPath)
  ? tryKey(() => keypairFromFile(programKeyPath))
  : null;
const declared = /declare_id!\("([1-9A-HJ-NP-Za-km-z]+)"\)/.exec(
  readFileSync(resolve(REPO_ROOT, "programs/manifest/src/lib.rs"), "utf8"),
)?.[1];
const anchorToml = /\[programs\.devnet\]\s*manifest = "([^"]+)"/.exec(
  readFileSync(resolve(REPO_ROOT, "Anchor.toml"), "utf8"),
)?.[1];
const appProgram = resolveProgramId(process.env.NEXT_PUBLIC_PROGRAM_ID || undefined).toBase58();
const ids = new Set([
  programKey?.publicKey.toBase58(),
  declared,
  anchorToml,
  MANIFEST_PROGRAM_ID.toBase58(),
  appProgram,
]);
report(
  programKey !== null && ids.size === 1,
  "program ID consistent",
  ids.size === 1
    ? `${declared}`
    : `keypair ${programKey?.publicKey.toBase58() ?? "missing"}, lib.rs ${declared}, Anchor.toml ${anchorToml}, SDK IDL ${MANIFEST_PROGRAM_ID.toBase58()}, app ${appProgram}`,
  "Put the durable program keypair at target/deploy/manifest-keypair.json, run `anchor keys sync`, `pnpm program:test` (syncs the IDL), and set NEXT_PUBLIC_PROGRAM_ID (docs/DEPLOY.md step 1).",
);

const programInfo = await c.connection.getParsedAccountInfo(c.program.programId).catch(() => null);
const deployed = Boolean(programInfo?.value?.executable);
let authority: string | null = null;
if (deployed) {
  const data = programInfo?.value?.data as
    { parsed?: { info?: { programData?: string } } } | undefined;
  const pd = data?.parsed?.info?.programData;
  if (pd) {
    const pdInfo = await c.connection.getParsedAccountInfo(new PublicKey(pd));
    const parsed = pdInfo.value?.data as { parsed?: { info?: { authority?: string } } } | undefined;
    authority = parsed?.parsed?.info?.authority ?? null;
  }
}
if (dev) {
  const balance = await sol(dev.publicKey);
  report(
    deployed || balance >= 12,
    "deploy key balance",
    `${balance.toFixed(2)} SOL${deployed ? "" : " (need ~12 to deploy)"}`,
    `Fund ${dev.publicKey.toBase58()} with ~12 devnet SOL (faucet.solana.com).`,
  );
}
report(
  deployed,
  "program deployed",
  c.program.programId.toBase58(),
  "Run `anchor deploy --provider.cluster devnet` (docs/DEPLOY.md step 2).",
);
if (deployed) {
  report(
    authority !== null && authority === dev?.publicKey.toBase58(),
    "upgrade authority = deploy key",
    authority ?? "unknown",
    "The upgrade authority isn't your deploy key; check which key deployed.",
  );
}

// --- Config, mint, gas tank --------------------------------------------------------------
console.log("\nConfig and money");
const config = deployed ? await getConfig(c.program).catch(() => null) : null;
report(
  deployed ? config !== null : null,
  "config initialized",
  config ? `admin ${config.admin.toBase58()}` : "",
  "Run create-demo-mint, then init-config (docs/DEPLOY.md step 3).",
);
const mintEnv = process.env.NEXT_PUBLIC_DEMO_MINT;
const demoMint = mintEnv ? new PublicKey(mintEnv) : null;
const mintInfo = demoMint ? await getMint(c.connection, demoMint).catch(() => null) : null;
report(
  mintInfo !== null,
  "demo mint",
  mintEnv || "NEXT_PUBLIC_DEMO_MINT not set",
  "Run create-demo-mint and put the printed NEXT_PUBLIC_DEMO_MINT in .env.local and Vercel.",
);
if (config && demoMint) {
  report(
    config.paymentMints.some((m) => m.equals(demoMint)),
    "demo mint accepted by config",
    "",
    "Re-run init-config --update with NEXT_PUBLIC_DEMO_MINT set.",
  );
}
const gasTank = process.env.GAS_TANK_SECRET_KEY
  ? tryKey(() => keypairFromEnv("GAS_TANK_SECRET_KEY"))
  : null;
report(
  gasTank !== null,
  "gas tank key",
  gasTank?.publicKey.toBase58() ?? "GAS_TANK_SECRET_KEY not set",
  "Add GAS_TANK_SECRET_KEY (a funded devnet keypair) to .env.local and Vercel.",
);
if (gasTank) {
  const balance = await sol(gasTank.publicKey);
  report(
    balance >= 1,
    "gas tank balance",
    `${balance.toFixed(2)} SOL (faucet sends 0.05 per new wallet)`,
    `Fund ${gasTank.publicKey.toBase58()} with ~5 devnet SOL.`,
  );
  if (mintInfo) {
    report(
      mintInfo.mintAuthority?.equals(gasTank.publicKey) ?? false,
      "gas tank is the demo mint authority",
      "",
      "Recreate the demo mint with create-demo-mint (it uses the gas tank as authority).",
    );
  }
}
if (config) {
  const expected = `${appUrl()}/api/tickets/`;
  const uri = decodeFixed(config.metadataBaseUri);
  report(
    uri === expected,
    "Cargo Ticket metadata URL",
    uri,
    `Set NEXT_PUBLIC_APP_URL to the production URL and run init-config --update (expected ${expected}).`,
  );
}

// --- Squads --------------------------------------------------------------------------------
console.log("\nArbitration (Squads)");
const squads = loadSquads(c.cluster);
if (!squads) {
  report(false, "Squads multisig", "not set up", "Run squads-setup (docs/DEPLOY.md step 4).");
} else {
  const exists = (await c.connection.getAccountInfo(squads.multisig)) !== null;
  report(
    exists,
    "multisig exists",
    squads.multisig.toBase58(),
    "Run squads-setup on this cluster.",
  );
  if (config) {
    report(
      config.arbitrator.equals(squads.vault) && config.treasuryOwner.equals(squads.vault),
      "arbitrator + treasury = vault",
      squads.vault.toBase58(),
      "Re-run squads-setup (it updates the config).",
    );
  }
  report(
    (await sol(squads.vault)) >= 0.05,
    "vault float",
    `${(await sol(squads.vault)).toFixed(3)} SOL`,
    "Re-run squads-setup to top up the vault.",
  );
  for (const name of ["arbitrator-1", "arbitrator-2"]) {
    const path = resolve(KEYS_DIR, `${name}.json`);
    const kp = existsSync(path) ? tryKey(() => keypairFromFile(path)) : null;
    report(
      kp !== null,
      `.keys/${name}.json`,
      kp ? `${(await sol(kp.publicKey)).toFixed(3)} SOL` : "missing",
      "Restore .keys/ from your backup (the demo members' keys).",
    );
  }
}

// --- Demo world ----------------------------------------------------------------------------
console.log("\nDemo world");
const eastlinePath = resolve(KEYS_DIR, "demo-forwarder-eastline.json");
const eastline = existsSync(eastlinePath) ? tryKey(() => keypairFromFile(eastlinePath)) : null;
if (!eastline || !deployed) {
  report(
    false,
    "seed-demo",
    eastline ? "program not deployed" : "no demo keys in .keys/",
    "Run seed-demo against the running app (docs/DEPLOY.md step 5).",
  );
} else {
  const containers = await listContainers(c.program, {
    forwarder: forwarderPda(eastline.publicKey, c.program.programId),
  }).catch(() => []);
  const now = Math.floor(Date.now() / 1000);
  const open = containers.filter(
    (k) => "open" in k.account.status && k.account.cutoffTs.toNumber() > now,
  );
  report(
    containers.length > 0,
    "Eastline containers",
    containers.map((k) => decodeFixed(k.account.code)).join(", ") || "none",
    "Run seed-demo.",
  );
  report(
    open.length > 0,
    "an open Eastline container to record on",
    open.map((k) => decodeFixed(k.account.code)).join(", ") || "none",
    "Run demo-reset before recording.",
  );
}

// --- App -------------------------------------------------------------------------------------
console.log("\nApp");
async function probe(path: string, init?: RequestInit): Promise<number> {
  try {
    return (await fetch(`${appUrl()}${path}`, { ...init, signal: AbortSignal.timeout(20_000) }))
      .status;
  } catch {
    return 0;
  }
}
const home = await probe("/");
report(
  home === 200,
  "app reachable",
  `${appUrl()} → ${home || "no answer"}`,
  "Deploy to Vercel and set NEXT_PUBLIC_APP_URL (docs/DEPLOY.md step 7).",
);
if (home === 200) {
  report(
    (await probe("/actions.json")) === 200,
    "Blink rules (/actions.json)",
    "",
    "Check the deploy includes app/src/app/actions.json.",
  );
  report(
    (await probe("/api/cron/crank")) === 401,
    "crank endpoint guarded",
    "",
    "Set CRON_SECRET in Vercel.",
  );
  report(
    c.cluster === "localnet" || appUrl().startsWith("https://"),
    "public HTTPS (needed for Blinks and previews)",
    appUrl(),
    "Use the Vercel HTTPS URL as NEXT_PUBLIC_APP_URL.",
  );
}
report(
  c.cluster === "localnet" || Boolean(process.env.PINATA_JWT && process.env.PINATA_GATEWAY),
  "durable evidence storage (Pinata)",
  process.env.PINATA_JWT ? "configured" : "local disk only",
  "Add PINATA_JWT and PINATA_GATEWAY (Vercel's disk isn't durable).",
);

console.log(failed === 0 ? "\nAll checks passed." : `\n${failed} check(s) failed. Next steps:`);
fixes.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
process.exitCode = failed === 0 ? 0 : 1;
