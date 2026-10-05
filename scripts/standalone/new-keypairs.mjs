// Creates the three Manifest devnet keypairs without the Solana CLI (works on Windows,
// macOS and Linux with Node.js 18+; no npm install needed).
//
//   node new-keypairs.mjs
//
// Writes manifest-dev.json, manifest-program.json and manifest-gas-tank.json in the current
// folder, in the same format as `solana-keygen new` (a JSON array of 64 numbers: the 32-byte
// ed25519 seed followed by the 32-byte public key). Prints only the public addresses.
// Never overwrites an existing file. Back the files up: they are the keys.
import { generateKeyPairSync } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58(bytes) {
  let n = BigInt("0x" + Buffer.from(bytes).toString("hex"));
  let out = "";
  while (n > 0n) {
    out = ALPHABET[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = "1" + out;
  }
  return out;
}

for (const name of ["manifest-dev", "manifest-program", "manifest-gas-tank"]) {
  const file = `${name}.json`;
  if (existsSync(file)) {
    console.log(`${file} already exists, left unchanged`);
    continue;
  }
  const { privateKey } = generateKeyPairSync("ed25519");
  const jwk = privateKey.export({ format: "jwk" });
  const seed = Buffer.from(jwk.d, "base64url");
  const pub = Buffer.from(jwk.x, "base64url");
  writeFileSync(file, JSON.stringify([...seed, ...pub]), { mode: 0o600 });
  console.log(`${file.padEnd(24)} address: ${base58(pub)}`);
}
console.log(
  "\nBack up these files now. Fund the dev and gas-tank addresses at https://faucet.solana.com (devnet).",
);
