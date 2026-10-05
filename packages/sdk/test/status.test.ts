import { describe, expect, it } from "vitest";

import {
  allowedActions,
  type ConsignmentView,
  type ContainerView,
  deriveStage,
  LOADED_DISPLAY_SECS,
  manifestScore,
  timelineIndex,
  type WindowsView,
} from "../src/status.js";
import { CONSIGNMENT_STATUSES, CONTAINER_STATUSES } from "../src/types.js";

const NOW = 1_800_000_000;
const W: WindowsView = { pickupGraceSecs: 300, disputeWindowSecs: 600, overdueGraceSecs: 600 };

const c = (over: Partial<ConsignmentView> = {}): ConsignmentView => ({
  status: "approved",
  freightEscrowed: 380n,
  freightDue: 380n,
  reviewDeadline: NOW + 100,
  ...over,
});

const k = (over: Partial<ContainerView> = {}): ContainerView => ({
  status: "open",
  cutoffTs: NOW + 1_000,
  etaTs: NOW + 50_000,
  loadedTs: 0,
  arrivedTs: 0,
  ...over,
});

describe("deriveStage", () => {
  it("maps every consignment status", () => {
    const expected = {
      booked: "AWAITING_GOODS",
      received: "REVIEW_PHOTOS",
      approved: "PAID_SUPPLIER",
      disputed: "IN_DISPUTE",
      refunded: "REFUNDED",
      rejected: "REFUNDED",
      delivered: "COLLECTED",
      settled: "SETTLED",
      compensated: "COMPENSATED",
    } as const;
    for (const status of CONSIGNMENT_STATUSES) {
      expect(deriveStage(c({ status }), k(), NOW)).toBe(expected[status]);
    }
  });

  it("derives approved display stages from the container", () => {
    const expected = {
      open: "PAID_SUPPLIER",
      closed: "PAID_SUPPLIER",
      loaded: "LOADED",
      arrived: "ARRIVED_READY_FOR_PICKUP",
      completed: "ARRIVED_READY_FOR_PICKUP",
      cancelled: "PAID_SUPPLIER",
    } as const;
    for (const status of CONTAINER_STATUSES) {
      expect(deriveStage(c(), k({ status, loadedTs: NOW }), NOW)).toBe(expected[status]);
    }
    const sailing = k({ status: "loaded", loadedTs: NOW - LOADED_DISPLAY_SECS });
    expect(deriveStage(c(), sailing, NOW)).toBe("SAILING");
  });

  it("places stages on the timeline", () => {
    expect(timelineIndex("AWAITING_GOODS")).toBe(0);
    expect(timelineIndex("COLLECTED")).toBe(6);
    expect(timelineIndex("SETTLED")).toBe(6);
    expect(timelineIndex("IN_DISPUTE")).toBe(-1);
  });
});

describe("allowedActions", () => {
  it("booked: refund only after cut-off; forwarder can receive or reject", () => {
    const booked = c({ status: "booked" });
    expect(allowedActions(["trader"], booked, k(), W, NOW)).toEqual([]);
    expect(allowedActions(["trader"], booked, k({ cutoffTs: NOW - 1 }), W, NOW)).toEqual([
      "refund",
    ]);
    expect(allowedActions(["forwarder"], booked, k(), W, NOW)).toEqual([
      "record_receipt",
      "reject_booking",
    ]);
    expect(allowedActions(["forwarder"], booked, k({ status: "loaded" }), W, NOW)).toEqual([
      "reject_booking",
    ]);
  });

  it("received: trader reviews within the window, anyone auto-approves after", () => {
    const received = c({ status: "received" });
    expect(allowedActions(["trader"], received, k(), W, NOW)).toEqual(["approve", "reject_goods"]);
    expect(allowedActions(["anyone"], received, k(), W, NOW)).toEqual([]);
    const late = c({ status: "received", reviewDeadline: NOW - 1 });
    expect(allowedActions(["trader"], late, k(), W, NOW)).toEqual(["auto_approve"]);
    expect(allowedActions(["anyone"], late, k(), W, NOW)).toEqual(["auto_approve"]);
  });

  it("approved: holder can transfer; top-up only when short", () => {
    expect(allowedActions(["holder"], c(), k(), W, NOW)).toEqual(["transfer_ticket"]);
    const short = c({ freightEscrowed: 300n });
    expect(allowedActions(["trader"], short, k(), W, NOW)).toEqual(["top_up_freight"]);
    expect(allowedActions(["trader", "holder"], short, k(), W, NOW)).toEqual([
      "top_up_freight",
      "transfer_ticket",
    ]);
  });

  it("arrived: pickup when funded, dispute within window, forwarder claims after grace", () => {
    const arrived = k({ status: "arrived", arrivedTs: NOW - 100 });
    expect(allowedActions(["holder"], c(), arrived, W, NOW)).toEqual([
      "transfer_ticket",
      "show_pickup_qr",
      "confirm_pickup",
      "open_dispute",
    ]);
    expect(allowedActions(["holder"], c({ freightEscrowed: 1n }), arrived, W, NOW)).toEqual([
      "top_up_freight",
      "transfer_ticket",
      "open_dispute",
    ]);
    const old = k({ status: "arrived", arrivedTs: NOW - 601 });
    expect(allowedActions(["holder"], c(), old, W, NOW)).not.toContain("open_dispute");
    expect(allowedActions(["forwarder"], c(), arrived, W, NOW)).toEqual([]);
    expect(allowedActions(["forwarder"], c(), old, W, NOW)).toEqual(["claim_freight"]);
  });

  it("overdue: holder can dispute once ETA + grace passes", () => {
    const sailing = k({ status: "loaded", etaTs: NOW - 601 });
    expect(allowedActions(["holder"], c(), sailing, W, NOW)).toContain("open_dispute");
    const onTime = k({ status: "loaded", etaTs: NOW - 599 });
    expect(allowedActions(["holder"], c(), onTime, W, NOW)).not.toContain("open_dispute");
  });

  it("disputed: only the arbitrator acts", () => {
    const disputed = c({ status: "disputed" });
    expect(allowedActions(["trader", "holder", "forwarder"], disputed, k(), W, NOW)).toEqual([]);
    expect(allowedActions(["arbitrator"], disputed, k(), W, NOW)).toEqual(["resolve_dispute"]);
  });

  it("final statuses allow nothing", () => {
    for (const status of ["refunded", "rejected", "delivered", "settled", "compensated"] as const) {
      const all = ["trader", "holder", "forwarder", "arbitrator", "anyone"] as const;
      expect(allowedActions(all, c({ status }), k({ status: "arrived" }), W, NOW)).toEqual([]);
    }
  });
});

describe("manifestScore", () => {
  it("labels new forwarders and penalises lost disputes", () => {
    expect(manifestScore({ delivered: 2, onTime: 2, disputesLost: 0 })).toBeNull();
    expect(manifestScore({ delivered: 6, onTime: 6, disputesLost: 0 })).toBe(100);
    expect(manifestScore({ delivered: 10, onTime: 8, disputesLost: 0 })).toBe(80);
    expect(manifestScore({ delivered: 9, onTime: 9, disputesLost: 1 })).toBe(90);
  });
});
