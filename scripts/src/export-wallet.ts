/**
 * Prepare a demo keypair for import into Phantom (Settings → Add account → Import private
 * key), so the seeded forwarder or traders can be used in the browser on devnet.
 * Writes the base58 secret to .keys/<name>.phantom.txt (gitignored, mode 600) and prints
 * only the public key and the file path; never the secret. Refuses on mainnet.
 *
 *   pnpm --filter @manifest/scripts export-wallet --name demo-forwarder-eastline
 *   pnpm --filter @manifest/scripts export-wallet --name demo-buyer-dele --public   # address only
 */
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import { parseCluster } from "@manifest/sdk";
import bs58 from "bs58";

import { loadEnv } from "./lib/env.js";
import { keypairFromFile } from "./lib/keys.js";
import { KEYS_DIR } from "./lib/squads.js";

loadEnv();
if (parseCluster(process.env.NEXT_PUBLIC_CLUSTER) === "mainnet-beta") {
  throw new Error("export-wallet is for devnet demo keys only.");
}
const { values } = parseArgs({
  options: { name: { type: "string" }, public: { type: "boolean", default: false } },
});
const name = values.name ?? "";
if (!/^demo-[a-z0-9-]+$/.test(name)) {
  console.error(
    "Usage: export-wallet --name demo-<role>-<who> (one of the .keys/demo-*.json files)",
  );
  process.exit(1);
}
const source = resolve(KEYS_DIR, `${name}.json`);
if (!existsSync(source)) throw new Error(`.keys/${name}.json not found. Run seed-demo first.`);
const kp = keypairFromFile(source);
if (values.public) {
  console.log(kp.publicKey.toBase58());
  process.exit(0);
}
const out = resolve(KEYS_DIR, `${name}.phantom.txt`);
writeFileSync(out, `${bs58.encode(kp.secretKey)}\n`, { mode: 0o600 });
console.log(`Public key: ${kp.publicKey.toBase58()}`);
console.log(`Private key for Phantom import written to ${out}`);
console.log("Open the file, copy its single line into Phantom, then delete the file.");
