/**
 * Typed account fetchers. List queries use `getProgramAccounts` memcmp filters at
 * offsets computed from the IDL (see layout.ts).
 */
import { utils } from "@anchor-lang/core";
import {
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
  unpackAccount,
  unpackMint,
} from "@solana/spl-token";
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
  likelyHolder?: PublicKey,
): Promise<{ owner: PublicKey; tokenAccount: PublicKey } | null> {
  const connection = program.provider.connection;
  // Usually the trader still holds the ticket: one account read, no heavy RPC method.
  if (likelyHolder) {
    const ata = getAssociatedTokenAddressSync(
      ticketMint,
      likelyHolder,
      true,
      TOKEN_2022_PROGRAM_ID,
    );
    const info = await connection.getAccountInfo(ata);
    if (info && unpackAccount(ata, info, TOKEN_2022_PROGRAM_ID).amount === 1n)
      return { owner: likelyHolder, tokenAccount: ata };
  }
  // Burned at pickup or settlement: supply 0 (or the mint is gone). Definitely no holder.
  const mintInfo = await connection.getAccountInfo(ticketMint);
  if (!mintInfo || unpackMint(ticketMint, mintInfo, TOKEN_2022_PROGRAM_ID).supply === 0n)
    return null;
  // Resold tickets: every transfer references the mint, so its latest transaction's token
  // balances name the current holder. Confirmed by reading that account (two light calls;
  // public RPCs rate-limit getTokenLargestAccounts hard).
  const [latest] = await connection.getSignaturesForAddress(ticketMint, { limit: 1 });
  if (latest) {
    const tx = await connection.getTransaction(latest.signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    const keys = tx?.transaction.message.getAccountKeys({
      accountKeysFromLookups: tx.meta?.loadedAddresses,
    });
    for (const b of tx?.meta?.postTokenBalances ?? []) {
      if (b.mint !== ticketMint.toBase58() || b.uiTokenAmount.amount !== "1" || !keys) continue;
      const tokenAccount = keys.get(b.accountIndex);
      const info = tokenAccount && (await connection.getAccountInfo(tokenAccount));
      if (!tokenAccount || !info) continue;
      const account = unpackAccount(tokenAccount, info, TOKEN_2022_PROGRAM_ID);
      if (account.amount === 1n) return { owner: account.owner, tokenAccount };
    }
  }
  // Last resort. A failure throws (callers retry) rather than reading as "no holder", which
  // would show a live ticket as burned.
  const largest = await connection.getTokenLargestAccounts(ticketMint);
  const top = largest.value.find((a) => a.amount === "1");
  if (!top) return null;
  const info = await connection.getAccountInfo(top.address);
  if (!info) return null;
  const account = unpackAccount(top.address, info, TOKEN_2022_PROGRAM_ID);
  return { owner: account.owner, tokenAccount: top.address };
}
