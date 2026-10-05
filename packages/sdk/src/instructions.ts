/**
 * One builder per program instruction. Each returns the `TransactionInstruction[]` for a
 * single transaction (including ATA creation and compute-budget instructions where
 * needed), so every user action is exactly one wallet signature.
 *
 * Builders fetch the onchain state they need (container, consignment, config), derive
 * every PDA and token account, and use `accountsStrict` so no account is resolved
 * implicitly.
 */
import BN from "bn.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";

import { findCargoTicketHolder } from "./accounts.js";
import type { ManifestProgram } from "./client.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  FIELD_LEN,
  HEAVY_TX_COMPUTE_UNITS,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "./constants.js";
import { encodeFixed } from "./format.js";
import {
  bondVaultPda,
  cargoTicketPda,
  configPda,
  consignmentPda,
  containerPda,
  forwarderPda,
  ticketAuthorityPda,
  vaultPda,
} from "./pdas.js";
import type {
  ConfigAccount,
  ConfigParams,
  ConsignmentAccount,
  ContainerAccount,
  ContainerMode,
  ForwarderAccount,
} from "./types.js";

type Ixs = Promise<TransactionInstruction[]>;
type Amount = bigint | number | BN;

const bn = (v: Amount) => (BN.isBN(v) ? v : new BN(v.toString()));

const BPF_LOADER_UPGRADEABLE = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");

// ---------------------------------------------------------------- helpers

/** Associated token address; off-curve owners (PDAs, Squads vaults) are allowed. */
export function ata(owner: PublicKey, mint: PublicKey, tokenProgram = TOKEN_PROGRAM_ID): PublicKey {
  return getAssociatedTokenAddressSync(
    mint,
    owner,
    true,
    tokenProgram,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
}

/** SPL Token or Token-2022, read from the mint account's owner. */
export async function mintTokenProgram(
  connection: Connection,
  mint: PublicKey,
): Promise<PublicKey> {
  const info = await connection.getAccountInfo(mint);
  if (!info) throw new Error(`Mint ${mint.toBase58()} not found`);
  if (info.owner.equals(TOKEN_PROGRAM_ID) || info.owner.equals(TOKEN_2022_PROGRAM_ID)) {
    return info.owner;
  }
  throw new Error(`Account ${mint.toBase58()} is not a token mint`);
}

export function computeBudget(units = HEAVY_TX_COMPUTE_UNITS): TransactionInstruction {
  return ComputeBudgetProgram.setComputeUnitLimit({ units });
}

/** Wrap instructions in a v0 transaction with a fresh blockhash, ready for the wallet. */
export async function buildTransaction(
  connection: Connection,
  instructions: TransactionInstruction[],
  payer: PublicKey,
): Promise<VersionedTransaction> {
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();
  return new VersionedTransaction(message);
}

async function fetchConfig(program: ManifestProgram): Promise<ConfigAccount> {
  return program.account.config.fetch(configPda(program.programId));
}

/** A consignment together with its container and payment-mint token program. */
export interface ConsignmentContext {
  address: PublicKey;
  consignment: ConsignmentAccount;
  container: ContainerAccount;
  tokenProgram: PublicKey;
}

export async function loadConsignment(
  program: ManifestProgram,
  address: PublicKey,
): Promise<ConsignmentContext> {
  const consignment = await program.account.consignment.fetch(address);
  const container = await program.account.container.fetch(consignment.container);
  const tokenProgram = await mintTokenProgram(program.provider.connection, consignment.mint);
  return { address, consignment, container, tokenProgram };
}

async function holderOf(program: ManifestProgram, ticketMint: PublicKey): Promise<PublicKey> {
  const holder = await findCargoTicketHolder(program, ticketMint);
  if (!holder) throw new Error("No current Cargo Ticket holder (ticket burned or not minted)");
  return holder.owner;
}

// ---------------------------------------------------------------- admin

export async function initializeConfig(
  program: ManifestProgram,
  args: { admin: PublicKey; params: ConfigParams; mints: PublicKey[] },
): Ixs {
  const programData = PublicKey.findProgramAddressSync(
    [program.programId.toBytes()],
    BPF_LOADER_UPGRADEABLE,
  )[0];
  const ix = await program.methods
    .initializeConfig(args.params)
    .accountsStrict({
      admin: args.admin,
      config: configPda(program.programId),
      program: program.programId,
      programData,
      systemProgram: SystemProgram.programId,
    })
    .remainingAccounts(args.mints.map((pubkey) => ({ pubkey, isSigner: false, isWritable: false })))
    .instruction();
  return [ix];
}

/** Current config as `update_config` params, with `overrides` applied. */
export function configParamsFrom(
  config: ConfigAccount,
  overrides: Partial<ConfigParams> = {},
): ConfigParams {
  return {
    arbitrator: config.arbitrator,
    treasuryOwner: config.treasuryOwner,
    paymentMints: config.paymentMints,
    bondMints: config.bondMints,
    feeBps: config.feeBps,
    coverageBps: config.coverageBps,
    freightBufferBps: config.freightBufferBps,
    reviewWindowSecs: config.reviewWindowSecs,
    pickupGraceSecs: config.pickupGraceSecs,
    disputeWindowSecs: config.disputeWindowSecs,
    overdueGraceSecs: config.overdueGraceSecs,
    onTimeGraceSecs: config.onTimeGraceSecs,
    metadataBaseUri: config.metadataBaseUri,
    paused: config.paused,
    ...overrides,
  };
}

/** Distinct configured mints (payment + bond), which update_config needs as remaining accounts. */
export function configuredMints(
  params: Pick<ConfigParams, "paymentMints" | "bondMints">,
): PublicKey[] {
  const seen = new Map<string, PublicKey>();
  for (const m of [...params.paymentMints, ...params.bondMints]) {
    if (!m.equals(PublicKey.default)) seen.set(m.toBase58(), m);
  }
  return [...seen.values()];
}

export async function updateConfig(
  program: ManifestProgram,
  args: { admin: PublicKey; params: ConfigParams; mints: PublicKey[] },
): Ixs {
  const ix = await program.methods
    .updateConfig(args.params)
    .accountsStrict({ admin: args.admin, config: configPda(program.programId) })
    .remainingAccounts(args.mints.map((pubkey) => ({ pubkey, isSigner: false, isWritable: false })))
    .instruction();
  return [ix];
}

export async function transferAdmin(
  program: ManifestProgram,
  args: { admin: PublicKey; newAdmin: PublicKey },
): Ixs {
  const ix = await program.methods
    .transferAdmin(args.newAdmin)
    .accountsStrict({ admin: args.admin, config: configPda(program.programId) })
    .instruction();
  return [ix];
}

// ---------------------------------------------------------------- forwarder

export async function registerForwarder(
  program: ManifestProgram,
  args: { authority: PublicKey; name: string; bondMint: PublicKey },
): Ixs {
  const forwarder = forwarderPda(args.authority, program.programId);
  const tokenProgram = await mintTokenProgram(program.provider.connection, args.bondMint);
  const ix = await program.methods
    .registerForwarder(encodeFixed(args.name, FIELD_LEN.name))
    .accountsStrict({
      authority: args.authority,
      config: configPda(program.programId),
      forwarder,
      bondMint: args.bondMint,
      bondVault: bondVaultPda(forwarder, program.programId),
      tokenProgram,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  return [ix];
}

async function moveBond(
  program: ManifestProgram,
  args: { authority: PublicKey; amount: Amount },
  deposit: boolean,
): Ixs {
  const forwarder = forwarderPda(args.authority, program.programId);
  const f: ForwarderAccount = await program.account.forwarder.fetch(forwarder);
  const tokenProgram = await mintTokenProgram(program.provider.connection, f.bondMint);
  const authorityTokenAccount = ata(args.authority, f.bondMint, tokenProgram);
  const accounts = {
    authority: args.authority,
    forwarder,
    bondMint: f.bondMint,
    bondVault: f.bondVault,
    authorityTokenAccount,
    tokenProgram,
  };
  const method = deposit
    ? program.methods.depositBond(bn(args.amount))
    : program.methods.withdrawBond(bn(args.amount));
  const ix = await method.accountsStrict(accounts).instruction();
  const create = createAssociatedTokenAccountIdempotentInstruction(
    args.authority,
    authorityTokenAccount,
    args.authority,
    f.bondMint,
    tokenProgram,
  );
  return deposit ? [ix] : [create, ix];
}

export const depositBond = (
  program: ManifestProgram,
  args: { authority: PublicKey; amount: Amount },
) => moveBond(program, args, true);
export const withdrawBond = (
  program: ManifestProgram,
  args: { authority: PublicKey; amount: Amount },
) => moveBond(program, args, false);

export interface OpenContainerArgs {
  authority: PublicKey;
  code: string;
  origin: string;
  destination: string;
  mode: ContainerMode;
  mint: PublicKey;
  capacityCbmMilli: number;
  ratePerCbm: Amount;
  cutoffTs: number;
  etaTs: number;
}

export async function openContainer(program: ManifestProgram, args: OpenContainerArgs): Ixs {
  const forwarder = forwarderPda(args.authority, program.programId);
  const f = await program.account.forwarder.fetch(forwarder);
  const ix = await program.methods
    .openContainer({
      code: encodeFixed(args.code, FIELD_LEN.code),
      origin: encodeFixed(args.origin, FIELD_LEN.locode),
      destination: encodeFixed(args.destination, FIELD_LEN.locode),
      mode: args.mode === "sea" ? { sea: {} } : { air: {} },
      capacityCbmMilli: args.capacityCbmMilli,
      ratePerCbm: bn(args.ratePerCbm),
      cutoffTs: bn(args.cutoffTs),
      etaTs: bn(args.etaTs),
    })
    .accountsStrict({
      authority: args.authority,
      config: configPda(program.programId),
      forwarder,
      container: containerPda(forwarder, f.containerCount, program.programId),
      mint: args.mint,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  return [ix];
}

/** Address the next `openContainer` by this forwarder will create. */
export async function nextContainerAddress(
  program: ManifestProgram,
  authority: PublicKey,
): Promise<PublicKey> {
  const forwarder = forwarderPda(authority, program.programId);
  const f = await program.account.forwarder.fetch(forwarder);
  return containerPda(forwarder, f.containerCount, program.programId);
}

export async function closeBooking(
  program: ManifestProgram,
  args: { caller: PublicKey; container: PublicKey },
): Ixs {
  const k = await program.account.container.fetch(args.container);
  const ix = await program.methods
    .closeBooking()
    .accountsStrict({ caller: args.caller, forwarder: k.forwarder, container: args.container })
    .instruction();
  return [ix];
}

export async function cancelContainer(
  program: ManifestProgram,
  args: { authority: PublicKey; container: PublicKey },
): Ixs {
  const ix = await program.methods
    .cancelContainer()
    .accountsStrict({
      authority: args.authority,
      forwarder: forwarderPda(args.authority, program.programId),
      container: args.container,
    })
    .instruction();
  return [ix];
}

export async function rejectBooking(
  program: ManifestProgram,
  args: { authority: PublicKey; consignment: PublicKey },
): Ixs {
  const ctx = await loadConsignment(program, args.consignment);
  const c = ctx.consignment;
  const ix = await program.methods
    .rejectBooking()
    .accountsStrict({
      authority: args.authority,
      forwarder: forwarderPda(args.authority, program.programId),
      container: c.container,
      consignment: args.consignment,
      vault: c.vault,
      mint: c.mint,
      trader: c.trader,
      traderTokenAccount: ata(c.trader, c.mint, ctx.tokenProgram),
      tokenProgram: ctx.tokenProgram,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  return [ix];
}

export async function recordReceipt(
  program: ManifestProgram,
  args: {
    authority: PublicKey;
    consignment: PublicKey;
    evidenceHash: Uint8Array;
    measuredCbmMilli: number;
    cartonCount: number;
  },
): Ixs {
  const c = await program.account.consignment.fetch(args.consignment);
  const ix = await program.methods
    .recordReceipt(Array.from(args.evidenceHash), args.measuredCbmMilli, args.cartonCount)
    .accountsStrict({
      authority: args.authority,
      config: configPda(program.programId),
      forwarder: forwarderPda(args.authority, program.programId),
      container: c.container,
      consignment: args.consignment,
    })
    .instruction();
  return [ix];
}

async function ship(
  program: ManifestProgram,
  authority: PublicKey,
  container: PublicKey,
  load?: { containerNumber: string; blHash: Uint8Array },
): Ixs {
  const accounts = {
    authority,
    config: configPda(program.programId),
    forwarder: forwarderPda(authority, program.programId),
    container,
  };
  const method = load
    ? program.methods.markLoaded(
        encodeFixed(load.containerNumber.toUpperCase(), FIELD_LEN.containerNumber),
        Array.from(load.blHash),
      )
    : program.methods.markArrived();
  return [await method.accountsStrict(accounts).instruction()];
}

export const markLoaded = (
  program: ManifestProgram,
  args: { authority: PublicKey; container: PublicKey; containerNumber: string; blHash: Uint8Array },
) => ship(program, args.authority, args.container, args);

export const markArrived = (
  program: ManifestProgram,
  args: { authority: PublicKey; container: PublicKey },
) => ship(program, args.authority, args.container);

export async function claimFreightAfterGrace(
  program: ManifestProgram,
  args: { authority: PublicKey; consignment: PublicKey },
): Ixs {
  const ctx = await loadConsignment(program, args.consignment);
  const c = ctx.consignment;
  const holder = await holderOf(program, c.cargoTicketMint);
  const ix = await program.methods
    .claimFreightAfterGrace()
    .accountsStrict({
      authority: args.authority,
      config: configPda(program.programId),
      forwarder: forwarderPda(args.authority, program.programId),
      container: c.container,
      consignment: args.consignment,
      vault: c.vault,
      mint: c.mint,
      forwarderTokenAccount: ata(args.authority, c.mint, ctx.tokenProgram),
      holder,
      holderTokenAccount: ata(holder, c.mint, ctx.tokenProgram),
      cargoTicketMint: c.cargoTicketMint,
      holderTicketAccount: ata(holder, c.cargoTicketMint, TOKEN_2022_PROGRAM_ID),
      ticketAuthority: ticketAuthorityPda(program.programId),
      tokenProgram: ctx.tokenProgram,
      token2022Program: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  return [computeBudget(), ix];
}

// ---------------------------------------------------------------- trader / holder

export interface BookConsignmentArgs {
  trader: PublicKey;
  container: PublicKey;
  goodsAmount: Amount;
  estCbmMilli: number;
  payee: PublicKey;
  description: string;
  /** Defaults to the trader's associated token account for the container mint. */
  traderTokenAccount?: PublicKey;
}

export async function bookConsignment(program: ManifestProgram, args: BookConsignmentArgs): Ixs {
  const k = await program.account.container.fetch(args.container);
  const tokenProgram = await mintTokenProgram(program.provider.connection, k.mint);
  const consignment = consignmentPda(args.container, k.consignmentCount, program.programId);
  const ix = await program.methods
    .bookConsignment({
      goodsAmount: bn(args.goodsAmount),
      estCbmMilli: args.estCbmMilli,
      payee: args.payee,
      description: encodeFixed(args.description, FIELD_LEN.description),
    })
    .accountsStrict({
      trader: args.trader,
      config: configPda(program.programId),
      forwarder: k.forwarder,
      container: args.container,
      consignment,
      vault: vaultPda(consignment, program.programId),
      mint: k.mint,
      traderTokenAccount: args.traderTokenAccount ?? ata(args.trader, k.mint, tokenProgram),
      tokenProgram,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  return [ix];
}

/** Address the next booking on this container will create. */
export async function nextConsignmentAddressFor(
  program: ManifestProgram,
  container: PublicKey,
): Promise<PublicKey> {
  const k = await program.account.container.fetch(container);
  return consignmentPda(container, k.consignmentCount, program.programId);
}

export async function refundAfterCutoff(
  program: ManifestProgram,
  args: { trader: PublicKey; consignment: PublicKey },
): Ixs {
  const ctx = await loadConsignment(program, args.consignment);
  const c = ctx.consignment;
  const ix = await program.methods
    .refundAfterCutoff()
    .accountsStrict({
      trader: args.trader,
      forwarder: ctx.container.forwarder,
      container: c.container,
      consignment: args.consignment,
      vault: c.vault,
      mint: c.mint,
      traderTokenAccount: ata(args.trader, c.mint, ctx.tokenProgram),
      tokenProgram: ctx.tokenProgram,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  return [ix];
}

async function settleAccounts(program: ManifestProgram, payer: PublicKey, consignment: PublicKey) {
  const ctx = await loadConsignment(program, consignment);
  const config = await fetchConfig(program);
  const c = ctx.consignment;
  const ticket = cargoTicketPda(consignment, program.programId);
  return {
    payer,
    config: configPda(program.programId),
    container: c.container,
    consignment,
    vault: c.vault,
    mint: c.mint,
    trader: c.trader,
    traderTokenAccount: ata(c.trader, c.mint, ctx.tokenProgram),
    payee: c.payee,
    payeeTokenAccount: ata(c.payee, c.mint, ctx.tokenProgram),
    treasuryOwner: config.treasuryOwner,
    treasuryTokenAccount: ata(config.treasuryOwner, c.mint, ctx.tokenProgram),
    ticketAuthority: ticketAuthorityPda(program.programId),
    cargoTicketMint: ticket,
    traderTicketAccount: ata(c.trader, ticket, TOKEN_2022_PROGRAM_ID),
    tokenProgram: ctx.tokenProgram,
    token2022Program: TOKEN_2022_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  };
}

/** The trader approves the warehouse evidence (pays the supplier, mints the Cargo Ticket). */
export async function approveGoods(
  program: ManifestProgram,
  args: { trader: PublicKey; consignment: PublicKey },
): Ixs {
  const accounts = await settleAccounts(program, args.trader, args.consignment);
  return [
    computeBudget(),
    await program.methods.approveGoods().accountsStrict(accounts).instruction(),
  ];
}

/** Anyone settles a consignment whose review window has ended. */
export async function autoApprove(
  program: ManifestProgram,
  args: { payer: PublicKey; consignment: PublicKey },
): Ixs {
  const accounts = await settleAccounts(program, args.payer, args.consignment);
  return [
    computeBudget(),
    await program.methods.autoApprove().accountsStrict(accounts).instruction(),
  ];
}

export async function rejectGoods(
  program: ManifestProgram,
  args: { trader: PublicKey; consignment: PublicKey; reason: number },
): Ixs {
  const ctx = await loadConsignment(program, args.consignment);
  const ix = await program.methods
    .rejectGoods(args.reason)
    .accountsStrict({
      trader: args.trader,
      forwarder: ctx.container.forwarder,
      container: ctx.consignment.container,
      consignment: args.consignment,
    })
    .instruction();
  return [ix];
}

export async function topUpFreight(
  program: ManifestProgram,
  args: { payer: PublicKey; consignment: PublicKey; amount: Amount; payerTokenAccount?: PublicKey },
): Ixs {
  const ctx = await loadConsignment(program, args.consignment);
  const c = ctx.consignment;
  const ix = await program.methods
    .topUpFreight(bn(args.amount))
    .accountsStrict({
      payer: args.payer,
      consignment: args.consignment,
      vault: c.vault,
      mint: c.mint,
      payerTokenAccount: args.payerTokenAccount ?? ata(args.payer, c.mint, ctx.tokenProgram),
      tokenProgram: ctx.tokenProgram,
    })
    .instruction();
  return [ix];
}

export async function confirmPickup(
  program: ManifestProgram,
  args: { holder: PublicKey; consignment: PublicKey },
): Ixs {
  const ctx = await loadConsignment(program, args.consignment);
  const c = ctx.consignment;
  const f = await program.account.forwarder.fetch(ctx.container.forwarder);
  const ix = await program.methods
    .confirmPickup()
    .accountsStrict({
      holder: args.holder,
      config: configPda(program.programId),
      forwarder: ctx.container.forwarder,
      authority: f.authority,
      container: c.container,
      consignment: args.consignment,
      vault: c.vault,
      mint: c.mint,
      forwarderTokenAccount: ata(f.authority, c.mint, ctx.tokenProgram),
      holderTokenAccount: ata(args.holder, c.mint, ctx.tokenProgram),
      cargoTicketMint: c.cargoTicketMint,
      holderTicketAccount: ata(args.holder, c.cargoTicketMint, TOKEN_2022_PROGRAM_ID),
      tokenProgram: ctx.tokenProgram,
      token2022Program: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  return [computeBudget(), ix];
}

export async function openDispute(
  program: ManifestProgram,
  args: { holder: PublicKey; consignment: PublicKey; reason: number },
): Ixs {
  const ctx = await loadConsignment(program, args.consignment);
  const c = ctx.consignment;
  const ix = await program.methods
    .openDispute(args.reason)
    .accountsStrict({
      holder: args.holder,
      config: configPda(program.programId),
      forwarder: ctx.container.forwarder,
      container: c.container,
      consignment: args.consignment,
      cargoTicketMint: c.cargoTicketMint,
      holderTicketAccount: ata(args.holder, c.cargoTicketMint, TOKEN_2022_PROGRAM_ID),
      token2022Program: TOKEN_2022_PROGRAM_ID,
    })
    .instruction();
  return [ix];
}

/** "Sell goods in transit": move the Cargo Ticket (and its pickup/dispute rights) to a buyer. */
export async function transferCargoTicket(
  program: ManifestProgram,
  args: { from: PublicKey; to: PublicKey; consignment: PublicKey },
): Ixs {
  const c = await program.account.consignment.fetch(args.consignment);
  const mint = c.cargoTicketMint;
  const destination = ata(args.to, mint, TOKEN_2022_PROGRAM_ID);
  return [
    createAssociatedTokenAccountIdempotentInstruction(
      args.from,
      destination,
      args.to,
      mint,
      TOKEN_2022_PROGRAM_ID,
    ),
    createTransferCheckedInstruction(
      ata(args.from, mint, TOKEN_2022_PROGRAM_ID),
      mint,
      destination,
      args.from,
      1,
      0,
      [],
      TOKEN_2022_PROGRAM_ID,
    ),
  ];
}

// ---------------------------------------------------------------- arbitrator

export type Resolution =
  | { kind: "refundEscrow" }
  | { kind: "forceApprove" }
  | { kind: "dismiss" }
  | { kind: "slashBond"; amount: Amount };

/**
 * Build the instruction(s) for a dispute resolution. `arbitrator` is `config.arbitrator`
 * (a Squads vault PDA on devnet; wrap these instructions in a vault transaction).
 */
export async function resolveDispute(
  program: ManifestProgram,
  args: { arbitrator: PublicKey; consignment: PublicKey; resolution: Resolution },
): Ixs {
  const { arbitrator, consignment, resolution } = args;
  const config = configPda(program.programId);

  if (resolution.kind === "dismiss") {
    const ix = await program.methods
      .resolveDismiss()
      .accountsStrict({ arbitrator, config, consignment })
      .instruction();
    return [ix];
  }

  if (resolution.kind === "forceApprove") {
    const accounts = await settleAccounts(program, arbitrator, consignment);
    return [
      computeBudget(),
      await program.methods.resolveForceApprove().accountsStrict(accounts).instruction(),
    ];
  }

  const ctx = await loadConsignment(program, consignment);
  const c = ctx.consignment;

  if (resolution.kind === "refundEscrow") {
    const ix = await program.methods
      .resolveRefundEscrow()
      .accountsStrict({
        arbitrator,
        config,
        forwarder: ctx.container.forwarder,
        container: c.container,
        consignment,
        vault: c.vault,
        mint: c.mint,
        trader: c.trader,
        traderTokenAccount: ata(c.trader, c.mint, ctx.tokenProgram),
        tokenProgram: ctx.tokenProgram,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    return [ix];
  }

  // slashBond
  const f = await program.account.forwarder.fetch(ctx.container.forwarder);
  const holder = await holderOf(program, c.cargoTicketMint);
  const bondTokenProgram = await mintTokenProgram(program.provider.connection, f.bondMint);
  const sameMint = f.bondMint.equals(c.mint);
  const holderBondTokenAccount = sameMint ? null : ata(holder, f.bondMint, bondTokenProgram);
  const ix = await program.methods
    .resolveSlashBond(bn(resolution.amount))
    .accountsStrict({
      arbitrator,
      config,
      forwarder: ctx.container.forwarder,
      container: c.container,
      consignment,
      vault: c.vault,
      mint: c.mint,
      bondMint: f.bondMint,
      bondVault: f.bondVault,
      holder,
      holderTokenAccount: ata(holder, c.mint, ctx.tokenProgram),
      holderBondTokenAccount,
      cargoTicketMint: c.cargoTicketMint,
      holderTicketAccount: ata(holder, c.cargoTicketMint, TOKEN_2022_PROGRAM_ID),
      ticketAuthority: ticketAuthorityPda(program.programId),
      tokenProgram: ctx.tokenProgram,
      bondTokenProgram,
      token2022Program: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  const pre = holderBondTokenAccount
    ? [
        createAssociatedTokenAccountIdempotentInstruction(
          arbitrator,
          holderBondTokenAccount,
          holder,
          f.bondMint,
          bondTokenProgram,
        ),
      ]
    : [];
  return [computeBudget(), ...pre, ix];
}
