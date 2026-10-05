/** Shared connection and read-only program client. */
import { getProgram, type ManifestProgram } from "@manifest/sdk";
import { Connection } from "@solana/web3.js";

import { config } from "./config";

let connection: Connection | undefined;
let program: ManifestProgram | undefined;

export function getConnection(): Connection {
  connection ??= new Connection(config.rpcUrl, "confirmed");
  return connection;
}

export function getManifestProgram(): ManifestProgram {
  program ??= getProgram(getConnection(), config.programId);
  return program;
}
