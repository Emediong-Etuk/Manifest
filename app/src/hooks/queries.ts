"use client";

/** Onchain data hooks. Detail views poll every 10 s; everything refetches after a tx. */
import {
  findCargoTicketHolder,
  getConfig,
  getConsignment,
  getContainer,
  getForwarderByPda,
  listConsignments,
  listContainers,
  listForwarders,
  type ConsignmentStatus,
  type ContainerStatus,
} from "@manifest/sdk";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { getConnection, getManifestProgram } from "@/lib/chain";

const POLL = 10_000;
const k = (key?: PublicKey | null) => key?.toBase58() ?? "none";

export function useConfigAccount() {
  return useQuery({
    queryKey: ["config"],
    queryFn: () => getConfig(getManifestProgram()),
    staleTime: 60_000,
  });
}

export function useContainers(opts: { status?: ContainerStatus; forwarder?: PublicKey } = {}) {
  return useQuery({
    queryKey: ["containers", opts.status ?? "all", k(opts.forwarder)],
    queryFn: () => listContainers(getManifestProgram(), opts),
  });
}

export function useContainer(address: PublicKey | null) {
  return useQuery({
    queryKey: ["container", k(address)],
    queryFn: () => (address ? getContainer(getManifestProgram(), address) : null),
    enabled: Boolean(address),
    refetchInterval: POLL,
  });
}

export function useConsignment(address: PublicKey | null) {
  return useQuery({
    queryKey: ["consignment", k(address)],
    queryFn: () => (address ? getConsignment(getManifestProgram(), address) : null),
    enabled: Boolean(address),
    refetchInterval: POLL,
  });
}

export function useConsignments(
  opts: { container?: PublicKey; trader?: PublicKey; status?: ConsignmentStatus },
  enabled = true,
) {
  return useQuery({
    queryKey: ["consignments", k(opts.container), k(opts.trader), opts.status ?? "all"],
    queryFn: () => listConsignments(getManifestProgram(), opts),
    enabled,
    refetchInterval: POLL,
  });
}

export function useForwarders() {
  return useQuery({
    queryKey: ["forwarders"],
    queryFn: () => listForwarders(getManifestProgram()),
  });
}

export function useForwarder(address: PublicKey | null) {
  return useQuery({
    queryKey: ["forwarder", k(address)],
    queryFn: () => (address ? getForwarderByPda(getManifestProgram(), address) : null),
    enabled: Boolean(address),
    refetchInterval: POLL,
  });
}

/** Current Cargo Ticket holder; `trader` is checked first (the usual holder, cheapest read). */
export function useTicketHolder(ticketMint: PublicKey | null, trader: PublicKey | null) {
  const live = ticketMint && !ticketMint.equals(PublicKey.default) ? ticketMint : null;
  return useQuery({
    queryKey: ["ticketHolder", k(live), k(trader)],
    queryFn: () =>
      live ? findCargoTicketHolder(getManifestProgram(), live, trader ?? undefined) : null,
    enabled: Boolean(live),
    refetchInterval: POLL,
  });
}

/** Token balance (base units) of `owner`'s associated account for `mint`. */
export function useTokenBalance(owner: PublicKey | null, mint: PublicKey | null) {
  return useQuery({
    queryKey: ["balance", k(owner), k(mint)],
    queryFn: async () => {
      if (!owner || !mint) return 0n;
      const connection = getConnection();
      const info = await connection.getAccountInfo(mint);
      if (!info) return 0n;
      const ata = getAssociatedTokenAddressSync(mint, owner, true, info.owner);
      const bal = await connection.getTokenAccountBalance(ata).catch(() => null);
      return bal ? BigInt(bal.value.amount) : 0n;
    },
    enabled: Boolean(owner && mint),
    refetchInterval: POLL,
  });
}

export function useSolBalance(owner: PublicKey | null) {
  return useQuery({
    queryKey: ["sol", k(owner)],
    queryFn: () => (owner ? getConnection().getBalance(owner) : 0),
    enabled: Boolean(owner),
    refetchInterval: POLL,
  });
}

/** Unix seconds, ticking once a second (for countdowns). */
export function useNow(): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** Parse a base58 route param; null if invalid. */
export function usePubkeyParam(value: string | string[] | undefined): PublicKey | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  try {
    return new PublicKey(raw);
  } catch {
    return null;
  }
}

/** Token-2022 mints this wallet holds exactly one of (candidate Cargo Tickets). */
export function useHeldTicketMints(owner: PublicKey | null) {
  return useQuery({
    queryKey: ["heldTickets", k(owner)],
    queryFn: async () => {
      if (!owner) return new Set<string>();
      const { TOKEN_2022_PROGRAM_ID } = await import("@manifest/sdk");
      const res = await getConnection().getParsedTokenAccountsByOwner(owner, {
        programId: TOKEN_2022_PROGRAM_ID,
      });
      const mints = res.value
        .map(
          (a) =>
            a.account.data.parsed as {
              info?: { mint?: string; tokenAmount?: { amount?: string } };
            },
        )
        .filter((p) => p.info?.tokenAmount?.amount === "1")
        .map((p) => p.info?.mint ?? "");
      return new Set(mints.filter(Boolean));
    },
    enabled: Boolean(owner),
    refetchInterval: POLL,
  });
}
