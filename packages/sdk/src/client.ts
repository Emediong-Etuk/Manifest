/** Anchor program client (web3.js v1). Read-only unless a wallet-backed provider is given. */
import { Program, type Provider } from "@anchor-lang/core";
import { Connection, PublicKey } from "@solana/web3.js";

import { MANIFEST_PROGRAM_ID } from "./constants.js";
import { IDL } from "./idl/idl.js";
import type { Manifest } from "./idl/manifest.js";

export type ManifestProgram = Program<Manifest>;

/**
 * Create the program client. Instruction builders in this SDK only need a connection:
 * transactions are signed by the wallet (Phantom) or a script keypair afterwards.
 */
export function getProgram(
  connection: Connection,
  programId: PublicKey = MANIFEST_PROGRAM_ID,
  provider?: Provider,
): ManifestProgram {
  const idl = { ...IDL, address: programId.toBase58() } as unknown as Manifest;
  return new Program<Manifest>(idl, provider ?? ({ connection } as Provider));
}
