/**
 * Typed account fetchers. List queries use `getProgramAccounts` memcmp filters at
 * offsets computed from the IDL (see layout.ts).
 */
import { utils } from "@anchor-lang/core";
import { TOKEN_2022_PROGRAM_ID, unpackAccount } from "@solana/spl-token";
import type { GetProgramAccountsFilter, PublicKey } from "@solana/web3.js";

import type { ManifestProgram } from "./client.js";
import { enumIndex, fieldOffset } from "./layout.js";
import { configPda, forwarderPda } from "./pdas.js";
import type {
  ConfigAccount,
  ConsignmentAccount,
  ConsignmentStatus,
  ContainerAccount,
  ContainerStatus,
  ForwarderAccount,
} from "./types.js";

export interface Fetched<T> {
  address: PublicKey;
  account: T;
}

const pubkeyFilter = (offset: number, key: PublicKey): GetProgramAccountsFilter => ({
  memcmp: { offset, bytes: key.toBase58() },
});

const enumFilter = (offset: number, index: number): GetProgramAccountsFilter => ({
  memcmp: { offset, bytes: utils.bytes.bs58.encode(Uint8Array.from([index])) },
});

export async function getConfig(program: ManifestProgram): Promise<ConfigAccount | null> {
  return program.account.config.fetchNullable(configPda(program.programId));
}

export async function getForwarderByPda(
  program: ManifestProgram,
  forwarder: PublicKey,
): Promise<ForwarderAccount | null> {
  return program.account.forwarder.fetchNullable(forwarder);
}

export async function getForwarder(
  program: ManifestProgram,
  authority: PublicKey,
): Promise<Fetched<ForwarderAccount> | null> {
  const address = forwarderPda(authority, program.programId);
  const account = await getForwarderByPda(program, address);
  return account ? { address, account } : null;
}

export async function getContainer(
  program: ManifestProgram,
  container: PublicKey,
): Promise<ContainerAccount | null> {
  return program.account.container.fetchNullable(container);
}

export async function getConsignment(
  program: ManifestProgram,
  consignment: PublicKey,
): Promise<ConsignmentAccount | null> {
  return program.account.consignment.fetchNullable(consignment);
}

export async function listForwarders(
  program: ManifestProgram,
): Promise<Fetched<ForwarderAccount>[]> {
  const all = await program.account.forwarder.all();
  return all.map((a) => ({ address: a.publicKey, account: a.account }));
}

export async function listContainers(
  program: ManifestProgram,
  opts: { status?: ContainerStatus; forwarder?: PublicKey } = {},
): Promise<Fetched<ContainerAccount>[]> {
  const filters: GetProgramAccountsFilter[] = [];
  if (opts.forwarder)
    filters.push(pubkeyFilter(fieldOffset("Container", "forwarder"), opts.forwarder));
  if (opts.status) {
    filters.push(
      enumFilter(fieldOffset("Container", "status"), enumIndex("ContainerStatus", opts.status)),
    );
  }
  const all = await program.account.container.all(filters);
  return all.map((a) => ({ address: a.publicKey, account: a.account }));
}

export async function listConsignments(
  program: ManifestProgram,
  opts: { container?: PublicKey; trader?: PublicKey; status?: ConsignmentStatus } = {},
): Promise<Fetched<ConsignmentAccount>[]> {
  const filters: GetProgramAccountsFilter[] = [];
  if (opts.container) {
    filters.push(pubkeyFilter(fieldOffset("Consignment", "container"), opts.container));
  }
  if (opts.trader) filters.push(pubkeyFilter(fieldOffset("Consignment", "trader"), opts.trader));
  if (opts.status) {
    filters.push(
      enumFilter(fieldOffset("Consignment", "status"), enumIndex("ConsignmentStatus", opts.status)),
    );
  }
  const all = await program.account.consignment.all(filters);
  return all.map((a) => ({ address: a.publicKey, account: a.account }));
}

/**
 * The current holder of a Cargo Ticket: the owner of the (only) token account holding 1.
 * Returns null if the ticket was burned or never minted.
 */
export async function findCargoTicketHolder(
  program: ManifestProgram,
  ticketMint: PublicKey,
): Promise<{ owner: PublicKey; tokenAccount: PublicKey } | null> {
  const connection = program.provider.connection;
  const largest = await connection.getTokenLargestAccounts(ticketMint).catch(() => null);
  const top = largest?.value.find((a) => a.amount === "1");
  if (!top) return null;
  const info = await connection.getAccountInfo(top.address);
  if (!info) return null;
  const account = unpackAccount(top.address, info, TOKEN_2022_PROGRAM_ID);
  return { owner: account.owner, tokenAccount: top.address };
}
