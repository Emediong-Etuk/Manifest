/**
 * Squads arbitration setup:
 *  1. create a 2-of-3 Squads v4 multisig (members: Greg's wallet + two demo arbitrator keys
 *     kept in .keys/), unless one is already recorded;
 *  2. fund its vault (index 0) with a little SOL: the arbitrator pays rent for accounts the
 *     resolution instructions create (Cargo Ticket mint, holder token accounts);
 *  3. update_config so `arbitrator` and `treasury_owner` are the vault PDA. From then on
 *     only a Squads proposal approved by 2 of 3 members can resolve disputes, and protocol
 *     fees accrue to the vault.
 *
 *   pnpm --filter @manifest/scripts squads-setup
 * Greg's member key: SQUADS_OWNER_WALLET (a public key); defaults to the admin key.
 */
import { configParamsFrom, configuredMints, explorerUrl, getConfig, ix } from "@manifest/sdk";
import * as multisig from "@sqds/multisig";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";

import { chain, send } from "./lib/chain.js";
import { loadEnv } from "./lib/env.js";
import { devKeypair } from "./lib/keys.js";
import { arbitratorKeys, loadSquads, saveSquads, vaultOf } from "./lib/squads.js";

loadEnv();
const { Permissions } = multisig.types;
const c = chain();
const admin = devKeypair();
const owner = process.env.SQUADS_OWNER_WALLET
  ? new PublicKey(process.env.SQUADS_OWNER_WALLET)
  : admin.publicKey;
const [arb1, arb2] = arbitratorKeys();
const VAULT_FLOAT = 0.2 * LAMPORTS_PER_SOL;
const MEMBER_FLOAT = 0.05 * LAMPORTS_PER_SOL;

console.log(`Cluster: ${c.cluster}`);
console.log(`Members: ${owner.toBase58()} (Greg)`);
console.log(`         ${arb1.publicKey.toBase58()} (demo arbitrator 1, .keys/arbitrator-1.json)`);
console.log(`         ${arb2.publicKey.toBase58()} (demo arbitrator 2, .keys/arbitrator-2.json)`);
console.log("Threshold: 2 of 3\n");

// 1. Multisig.
let squads = loadSquads();
const existing = squads ? await c.connection.getAccountInfo(squads.multisig) : null;
if (squads && existing) {
  console.log(`Multisig already exists: ${squads.multisig.toBase58()}`);
} else {
  const createKey = Keypair.generate();
  const [multisigPda] = multisig.getMultisigPda({ createKey: createKey.publicKey });
  const programConfig = await multisig.accounts.ProgramConfig.fromAccountAddress(
    c.connection,
    multisig.getProgramConfigPda({})[0],
  );
  await send(
    c,
    "squads: multisig_create_v2 (2-of-3)",
    [
      multisig.instructions.multisigCreateV2({
        createKey: createKey.publicKey,
        creator: admin.publicKey,
        multisigPda,
        configAuthority: null, // autonomous: member changes need a config proposal
        threshold: 2,
        members: [
          { key: owner, permissions: Permissions.all() },
          { key: arb1.publicKey, permissions: Permissions.all() },
          { key: arb2.publicKey, permissions: Permissions.all() },
        ],
        timeLock: 0,
        rentCollector: null,
        treasury: programConfig.treasury,
        memo: "Manifest arbitration",
      }),
    ],
    [admin, createKey],
  );
  squads = { multisig: multisigPda, vault: vaultOf(multisigPda) };
  saveSquads(squads, c.cluster);
}

// 2. Float for the vault (rent payer inside resolutions) and the demo members (fees).
const top = async (to: PublicKey, min: number, label: string) => {
  const balance = await c.connection.getBalance(to);
  if (balance >= min) return;
  await send(
    c,
    `fund ${label} with ${(min - balance) / LAMPORTS_PER_SOL} SOL`,
    [
      SystemProgram.transfer({
        fromPubkey: admin.publicKey,
        toPubkey: to,
        lamports: min - balance,
      }),
    ],
    [admin],
  );
};
await top(squads.vault, VAULT_FLOAT, "vault");
await top(arb1.publicKey, MEMBER_FLOAT, "arbitrator 1");
await top(arb2.publicKey, MEMBER_FLOAT, "arbitrator 2");

// 3. Point the program's arbitrator and treasury at the vault.
const config = await getConfig(c.program);
if (!config) throw new Error("Config not initialized. Run init-config first.");
if (config.arbitrator.equals(squads.vault) && config.treasuryOwner.equals(squads.vault)) {
  console.log("Config already uses the Squads vault as arbitrator and treasury.");
} else {
  const params = configParamsFrom(config, {
    arbitrator: squads.vault,
    treasuryOwner: squads.vault,
  });
  await send(
    c,
    "update_config (arbitrator + treasury = Squads vault)",
    await ix.updateConfig(c.program, {
      admin: admin.publicKey,
      params,
      mints: configuredMints(params),
    }),
    [admin],
  );
}

console.log(`\nMultisig: ${explorerUrl("address", squads.multisig.toBase58(), c.cluster)}`);
console.log(`Vault:    ${explorerUrl("address", squads.vault.toBase58(), c.cluster)}`);
console.log("\nAdd to .env.local (public addresses):");
console.log(`NEXT_PUBLIC_SQUADS_MULTISIG=${squads.multisig.toBase58()}`);
console.log(`NEXT_PUBLIC_SQUADS_VAULT=${squads.vault.toBase58()}`);
