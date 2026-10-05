/**
 * Resolve a dispute through the Squads multisig: build the resolution instruction with the
 * vault PDA as arbitrator, wrap it in a vault transaction + proposal, approve with the two
 * demo arbitrators (2 of 3) and execute. Prints explorer links for every step.
 *
 *   pnpm --filter @manifest/scripts resolve-dispute --consignment <pk> --resolution slash --amount 500
 *   --resolution refund | force-approve | dismiss | slash (slash needs --amount in USD)
 */
import { parseArgs } from "node:util";

import {
  consignmentStatus,
  explorerUrl,
  formatUsd,
  getConfig,
  getConsignment,
  ix,
  parseUsd,
  type Resolution,
} from "@manifest/sdk";
import { PublicKey } from "@solana/web3.js";

import { chain } from "./lib/chain.js";
import { loadEnv } from "./lib/env.js";
import { arbitratorKeys, loadSquads, proposeApproveExecute } from "./lib/squads.js";

loadEnv();
const { values } = parseArgs({
  options: {
    consignment: { type: "string" },
    resolution: { type: "string" },
    amount: { type: "string" },
  },
});
if (!values.consignment || !values.resolution) {
  console.error(
    "Usage: resolve-dispute --consignment <pk> --resolution refund|force-approve|dismiss|slash [--amount 500]",
  );
  process.exit(1);
}

const resolution: Resolution = (() => {
  switch (values.resolution) {
    case "refund":
      return { kind: "refundEscrow" };
    case "force-approve":
      return { kind: "forceApprove" };
    case "dismiss":
      return { kind: "dismiss" };
    case "slash":
      if (!values.amount) throw new Error("--resolution slash needs --amount (USD)");
      return { kind: "slashBond", amount: parseUsd(values.amount) };
    default:
      throw new Error(`Unknown resolution: ${values.resolution}`);
  }
})();

const c = chain();
const squads = loadSquads();
if (!squads) throw new Error("No Squads multisig recorded. Run squads-setup first.");
const config = await getConfig(c.program);
if (!config?.arbitrator.equals(squads.vault)) {
  throw new Error("config.arbitrator is not this Squads vault. Run squads-setup.");
}
const consignment = new PublicKey(values.consignment);
const before = await getConsignment(c.program, consignment);
if (!before) throw new Error("Consignment not found");
console.log(`Consignment ${consignment.toBase58()} is ${consignmentStatus(before)}`);
console.log(
  `Resolution: ${values.resolution}${resolution.kind === "slashBond" ? ` ${formatUsd(resolution.amount)}` : ""}\n`,
);

const instructions = await ix.resolveDispute(c.program, {
  arbitrator: squads.vault,
  consignment,
  resolution,
});
await proposeApproveExecute(
  c,
  squads,
  `resolve ${values.resolution}`,
  instructions,
  arbitratorKeys(),
);

const after = await getConsignment(c.program, consignment);
console.log(`\nConsignment is now ${after ? consignmentStatus(after) : "?"}`);
console.log(explorerUrl("address", consignment.toBase58(), c.cluster));
