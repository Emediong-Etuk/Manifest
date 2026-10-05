import "server-only";

import {
  configPda,
  type ConfigAccount,
  type ConsignmentAccount,
  type ContainerAccount,
  type ForwarderAccount,
  manifestScore,
} from "@manifest/sdk";
import { PublicKey } from "@solana/web3.js";

import { serverProgram } from "@/server/chain";

/** Parse a base58 route param; null if it isn't a public key. */
export function parseKey(value: string): PublicKey | null {
  try {
    return new PublicKey(value);
  } catch {
    return null;
  }
}

export function scoreText(f: ForwarderAccount): string {
  const score = manifestScore({
    delivered: f.statsConsignmentsDelivered,
    onTime: f.statsOnTime,
    disputesLost: f.statsDisputesLost,
  });
  return score === null ? "New forwarder" : `Score ${score}`;
}

export interface ContainerData {
  container: ContainerAccount;
  forwarder: ForwarderAccount | null;
}

export async function loadContainer(address: PublicKey): Promise<ContainerData | null> {
  const program = serverProgram();
  const container = await program.account.container.fetchNullable(address);
  if (!container) return null;
  const forwarder = await program.account.forwarder.fetchNullable(container.forwarder);
  return { container, forwarder };
}

export interface ShipmentData extends ContainerData {
  consignment: ConsignmentAccount;
  config: ConfigAccount | null;
}

export async function loadShipment(address: PublicKey): Promise<ShipmentData | null> {
  const program = serverProgram();
  const consignment = await program.account.consignment.fetchNullable(address);
  if (!consignment) return null;
  const [k, config] = await Promise.all([
    loadContainer(consignment.container),
    program.account.config.fetchNullable(configPda(program.programId)),
  ]);
  if (!k) return null;
  return { ...k, consignment, config };
}

export function appUrl(request?: Request): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (env) return env;
  return request ? new URL(request.url).origin : "http://localhost:3000";
}
