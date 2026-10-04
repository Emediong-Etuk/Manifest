/** Decoded account types (from the Anchor IDL) and status helpers. */
import type { IdlAccounts, IdlTypes } from "@anchor-lang/core";

import type { Manifest } from "./idl/manifest.js";

export type { Manifest };
export type ConfigAccount = IdlAccounts<Manifest>["config"];
export type ForwarderAccount = IdlAccounts<Manifest>["forwarder"];
export type ContainerAccount = IdlAccounts<Manifest>["container"];
export type ConsignmentAccount = IdlAccounts<Manifest>["consignment"];
export type ConfigParams = IdlTypes<Manifest>["configParams"];
export type OpenContainerParams = IdlTypes<Manifest>["openContainerParams"];
export type BookConsignmentParams = IdlTypes<Manifest>["bookConsignmentParams"];

export const CONSIGNMENT_STATUSES = [
  "booked",
  "received",
  "approved",
  "disputed",
  "refunded",
  "rejected",
  "delivered",
  "settled",
  "compensated",
] as const;
export type ConsignmentStatus = (typeof CONSIGNMENT_STATUSES)[number];

export const CONTAINER_STATUSES = [
  "open",
  "closed",
  "loaded",
  "arrived",
  "completed",
  "cancelled",
] as const;
export type ContainerStatus = (typeof CONTAINER_STATUSES)[number];

export type ContainerMode = "sea" | "air";

/** Anchor decodes Rust enums as `{ variant: {} }`; return the variant name. */
export function enumVariant<T extends string>(value: object): T {
  const [key] = Object.keys(value);
  if (key === undefined) throw new Error("Empty enum value");
  return key as T;
}

export const consignmentStatus = (c: Pick<ConsignmentAccount, "status">) =>
  enumVariant<ConsignmentStatus>(c.status);
export const consignmentPrevStatus = (c: Pick<ConsignmentAccount, "prevStatus">) =>
  enumVariant<ConsignmentStatus>(c.prevStatus);
export const containerStatus = (c: Pick<ContainerAccount, "status">) =>
  enumVariant<ContainerStatus>(c.status);
export const containerMode = (c: Pick<ContainerAccount, "mode">) =>
  enumVariant<ContainerMode>(c.mode);
