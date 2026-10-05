import "server-only";

import {
  containerMode,
  decodeFixed,
  deriveStage,
  explorerUrl,
  FINAL_STAGES,
  formatCbm,
  locodeCity,
  parseCluster,
  type Stage,
  STAGE_LABEL,
  toConsignmentView,
  toContainerView,
} from "@manifest/sdk";
import type { PublicKey } from "@solana/web3.js";

import type { ShipmentData } from "./data";

/** Public facts printed on a Cargo Ticket. Deliberately excludes goods value (privacy). */
export interface TicketFacts {
  name: string;
  ticketNo: string;
  containerCode: string;
  origin: string;
  destination: string;
  originCity: string;
  destinationCity: string;
  mode: "Sea" | "Air";
  cartons: number;
  measuredCbm: string;
  containerNumber: string;
  eta: string;
  stage: Stage;
  stageLabel: string;
  void: boolean;
  forwarderName: string;
  shipmentExplorer: string;
}

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Africa/Lagos",
});

export function ticketFacts(address: PublicKey, d: ShipmentData): TicketFacts {
  const { consignment: c, container: k, forwarder: f } = d;
  const code = decodeFixed(k.code);
  const origin = decodeFixed(k.origin);
  const destination = decodeFixed(k.destination);
  const stage = deriveStage(
    toConsignmentView(c),
    toContainerView(k),
    Math.floor(Date.now() / 1000),
  );
  const ticketNo = `${code}-${c.index}`;
  return {
    // Same format as the onchain name (programs/manifest/src/utils/cargo_ticket.rs).
    name: `Manifest Cargo Ticket ${ticketNo}`,
    ticketNo,
    containerCode: code,
    origin,
    destination,
    originCity: locodeCity(origin),
    destinationCity: locodeCity(destination),
    mode: containerMode(k) === "air" ? "Air" : "Sea",
    cartons: c.cartonCount,
    measuredCbm: c.measuredCbmMilli > 0 ? formatCbm(c.measuredCbmMilli) : "—",
    containerNumber: decodeFixed(k.containerNumber) || "Not loaded yet",
    eta: dateFmt.format(new Date(k.etaTs.toNumber() * 1000)),
    stage,
    stageLabel: STAGE_LABEL[stage],
    void: FINAL_STAGES.includes(stage),
    forwarderName: f ? decodeFixed(f.name) : "",
    shipmentExplorer: explorerUrl(
      "address",
      address.toBase58(),
      parseCluster(process.env.NEXT_PUBLIC_CLUSTER),
    ),
  };
}
