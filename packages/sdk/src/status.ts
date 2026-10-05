/**
 * Display stages and allowed actions, derived from onchain state. Pure functions over
 * small "view" objects so they're easy to test; `to*View` converts decoded accounts.
 *
 * These mirror the program's checks so the UI only shows buttons that can succeed.
 */
import type BN from "bn.js";

import {
  type ConfigAccount,
  type ConsignmentAccount,
  type ConsignmentStatus,
  type ContainerAccount,
  type ContainerStatus,
  consignmentStatus,
  containerStatus,
} from "./types.js";

export interface ConsignmentView {
  status: ConsignmentStatus;
  freightEscrowed: bigint;
  freightDue: bigint;
  reviewDeadline: number;
}

export interface ContainerView {
  status: ContainerStatus;
  cutoffTs: number;
  etaTs: number;
  loadedTs: number;
  arrivedTs: number;
}

export interface WindowsView {
  pickupGraceSecs: number;
  disputeWindowSecs: number;
  overdueGraceSecs: number;
}

const big = (v: BN) => BigInt(v.toString());
const num = (v: BN) => Number(v.toString());

export function toConsignmentView(c: ConsignmentAccount): ConsignmentView {
  return {
    status: consignmentStatus(c),
    freightEscrowed: big(c.freightEscrowed),
    freightDue: big(c.freightDue),
    reviewDeadline: num(c.reviewDeadline),
  };
}

export function toContainerView(c: ContainerAccount): ContainerView {
  return {
    status: containerStatus(c),
    cutoffTs: num(c.cutoffTs),
    etaTs: num(c.etaTs),
    loadedTs: num(c.loadedTs),
    arrivedTs: num(c.arrivedTs),
  };
}

export function toWindowsView(c: ConfigAccount): WindowsView {
  return {
    pickupGraceSecs: num(c.pickupGraceSecs),
    disputeWindowSecs: num(c.disputeWindowSecs),
    overdueGraceSecs: num(c.overdueGraceSecs),
  };
}

export const STAGES = [
  "AWAITING_GOODS",
  "REVIEW_PHOTOS",
  "PAID_SUPPLIER",
  "LOADED",
  "SAILING",
  "ARRIVED_READY_FOR_PICKUP",
  "COLLECTED",
  "REFUNDED",
  "IN_DISPUTE",
  "COMPENSATED",
  "SETTLED",
] as const;
export type Stage = (typeof STAGES)[number];

/** How long after loading we show "Loaded" before switching to "Sailing" (display only). */
export const LOADED_DISPLAY_SECS = 2 * 86_400;

export function deriveStage(c: ConsignmentView, k: ContainerView, now: number): Stage {
  switch (c.status) {
    case "booked":
      return "AWAITING_GOODS";
    case "received":
      return "REVIEW_PHOTOS";
    case "disputed":
      return "IN_DISPUTE";
    case "refunded":
    case "rejected":
      return "REFUNDED";
    case "delivered":
      return "COLLECTED";
    case "settled":
      return "SETTLED";
    case "compensated":
      return "COMPENSATED";
    case "approved":
      switch (k.status) {
        case "loaded":
          return now < k.loadedTs + LOADED_DISPLAY_SECS ? "LOADED" : "SAILING";
        case "arrived":
        case "completed":
          return "ARRIVED_READY_FOR_PICKUP";
        default:
          return "PAID_SUPPLIER";
      }
  }
}

/** Plain-language label for each stage (app badges, Cargo Ticket image and metadata). */
export const STAGE_LABEL: Record<Stage, string> = {
  AWAITING_GOODS: "Booked",
  REVIEW_PHOTOS: "At warehouse",
  PAID_SUPPLIER: "Paid supplier",
  LOADED: "Loaded",
  SAILING: "Sailing",
  ARRIVED_READY_FOR_PICKUP: "Ready for pickup",
  COLLECTED: "Collected",
  REFUNDED: "Refunded",
  IN_DISPUTE: "In dispute",
  COMPENSATED: "Compensated",
  SETTLED: "Settled",
};

/** Final stages: the Cargo Ticket is burned or void. */
export const FINAL_STAGES: readonly Stage[] = ["COLLECTED", "REFUNDED", "COMPENSATED", "SETTLED"];

/** Timeline shown on shipment cards, in order. */
export const TIMELINE: readonly { stage: Stage; label: string }[] = [
  { stage: "AWAITING_GOODS", label: "Booked" },
  { stage: "REVIEW_PHOTOS", label: "At warehouse" },
  { stage: "PAID_SUPPLIER", label: "Paid supplier" },
  { stage: "LOADED", label: "Loaded" },
  { stage: "SAILING", label: "Sailing" },
  { stage: "ARRIVED_READY_FOR_PICKUP", label: "Arrived" },
  { stage: "COLLECTED", label: "Collected" },
];

/** Index of the stage on the happy-path timeline, or -1 for off-path stages. */
export function timelineIndex(stage: Stage): number {
  if (stage === "SETTLED") return TIMELINE.length - 1;
  return TIMELINE.findIndex((t) => t.stage === stage);
}

export type Role = "trader" | "holder" | "forwarder" | "arbitrator" | "anyone";

export type Action =
  | "approve"
  | "reject_goods"
  | "refund"
  | "auto_approve"
  | "top_up_freight"
  | "transfer_ticket"
  | "show_pickup_qr"
  | "confirm_pickup"
  | "open_dispute"
  | "record_receipt"
  | "reject_booking"
  | "claim_freight"
  | "resolve_dispute";

/**
 * Buttons to show for a viewer with the given roles. A viewer can hold several roles
 * (e.g. trader and current ticket holder). `auto_approve` needs no role: the program
 * lets anyone call it once the review window has ended.
 */
export function allowedActions(
  roles: readonly Role[],
  c: ConsignmentView,
  k: ContainerView,
  w: WindowsView,
  now: number,
): Action[] {
  const has = (r: Role) => roles.includes(r);
  const out: Action[] = [];
  const funded = c.freightEscrowed >= c.freightDue;

  if (c.status === "booked") {
    if (has("trader") && now > k.cutoffTs) out.push("refund");
    if (has("forwarder")) {
      if (k.status === "open" || k.status === "closed") out.push("record_receipt");
      out.push("reject_booking");
    }
  }

  if (c.status === "received") {
    if (now <= c.reviewDeadline) {
      if (has("trader")) out.push("approve", "reject_goods");
    } else {
      out.push("auto_approve");
    }
  }

  if (c.status === "approved") {
    if ((has("trader") || has("holder")) && !funded) out.push("top_up_freight");
    if (has("holder")) {
      out.push("transfer_ticket");
      if (k.status === "arrived" && funded) out.push("show_pickup_qr", "confirm_pickup");
      const disputable =
        k.status === "arrived"
          ? now <= k.arrivedTs + w.disputeWindowSecs
          : (k.status === "open" || k.status === "closed" || k.status === "loaded") &&
            now > k.etaTs + w.overdueGraceSecs;
      if (disputable) out.push("open_dispute");
    }
    if (
      has("forwarder") &&
      k.status === "arrived" &&
      now > k.arrivedTs + w.pickupGraceSecs &&
      funded
    ) {
      out.push("claim_freight");
    }
  }

  if (c.status === "disputed" && has("arbitrator")) out.push("resolve_dispute");

  return out;
}

/**
 * Manifest Score: `100 x on-time rate x (1 - dispute-loss rate)`, shown with its formula.
 * Returns null ("New forwarder") under 3 deliveries.
 */
export function manifestScore(stats: {
  delivered: number;
  onTime: number;
  disputesLost: number;
}): number | null {
  if (stats.delivered < 3) return null;
  const settled = stats.delivered + stats.disputesLost;
  const onTimeRate = stats.onTime / stats.delivered;
  const lossRate = settled === 0 ? 0 : stats.disputesLost / settled;
  return Math.round(100 * onTimeRate * (1 - lossRate));
}
