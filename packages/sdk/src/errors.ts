/**
 * Program error codes -> plain-English messages for trader and forwarder screens.
 * Codes come from the IDL, so they stay in sync with `programs/manifest/src/errors.rs`.
 */
import { IDL } from "./idl/idl.js";

export type ManifestErrorName = (typeof IDL.errors)[number]["name"];

const FRIENDLY: Partial<Record<ManifestErrorName, string>> = {
  Paused: "Manifest is paused for maintenance. Bookings will reopen shortly.",
  MintNotAllowed: "This currency isn't accepted on Manifest.",
  BondBelowCoverage: "That would leave your guarantee below what your open bookings need.",
  InvalidSchedule: "The cut-off must be in the future and before the arrival date.",
  BookingClosed: "Bookings for this container have closed.",
  CapacityExceeded: "There isn't enough space left in this container.",
  CoverageExceeded:
    "This forwarder's bond is fully used. Try another container or ask them to top up their bond.",
  InvalidPayee:
    "That supplier payout address can't be used. It must be a different wallet from yours.",
  NotTrader: "Only the trader who booked this shipment can do that.",
  NotForwarder: "Only the forwarder running this container can do that.",
  ReviewWindowClosed: "The review window has ended, so the goods were approved automatically.",
  ReviewWindowOpen: "The trader still has time to review the photos.",
  InvalidReceipt: "Enter the measured volume and the number of cartons.",
  InvalidContainerNumber:
    "That container number isn't valid. Check the letters and the last digit.",
  ConsignmentsNotApproved: "Every shipment in the container must be approved before loading.",
  FreightShort: "Freight isn't fully paid yet. Top up the balance before pickup.",
  TopUpTooLarge: "That's more than the freight still owed.",
  NotTicketHolder: "You need to hold this shipment's Cargo Ticket to do that.",
  PickupGraceNotOver: "The holder still has time to collect these goods.",
  DisputeNotAllowed:
    "Disputes open after arrival (within the dispute window) or once the container is overdue.",
  NotArbitrator: "Only Manifest's arbitrators can resolve disputes.",
  CutoffNotReached: "This is only possible after the booking cut-off.",
  ContainerHasActiveConsignments: "This container still has active bookings.",
  ZeroAmount: "Enter an amount greater than zero.",
};

const BY_CODE = new Map<number, { name: ManifestErrorName; msg: string }>(
  IDL.errors.map((e) => [e.code, { name: e.name, msg: e.msg }]),
);

export function errorByCode(code: number): { name: ManifestErrorName; msg: string } | undefined {
  return BY_CODE.get(code);
}

/** Pull a custom program error code out of an Anchor/web3 error, if there is one. */
export function extractErrorCode(err: unknown): number | undefined {
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    // AnchorError: { error: { errorCode: { number } } }
    const anchorCode = (e.error as { errorCode?: { number?: number } } | undefined)?.errorCode
      ?.number;
    if (typeof anchorCode === "number") return anchorCode;
    // Raw: { InstructionError: [index, { Custom: n }] }
    const ie = e.InstructionError as [number, { Custom?: number }] | undefined;
    if (Array.isArray(ie) && typeof ie[1]?.Custom === "number") return ie[1].Custom;
    // Logs: "... custom program error: 0x1792" / "Error Number: 6034."
    const logs = (e.logs ?? e.transactionLogs) as string[] | undefined;
    const text = [String(e.message ?? ""), ...(Array.isArray(logs) ? logs : [])].join("\n");
    const num = /Error Number: (\d+)/.exec(text);
    if (num?.[1]) return Number(num[1]);
    const hex = /custom program error: (0x[0-9a-fA-F]+)/.exec(text);
    if (hex?.[1]) return Number.parseInt(hex[1], 16);
  }
  return undefined;
}

/** A message safe to show a non-crypto user, plus the raw detail for a "details" disclosure. */
export function friendlyError(err: unknown): { message: string; detail: string; code?: number } {
  const detail = err instanceof Error ? err.message : JSON.stringify(err);
  if (detail.includes("User rejected")) {
    return { message: "You cancelled the request in your wallet.", detail };
  }
  if (/insufficient (funds|lamports)/i.test(detail)) {
    return {
      message: "Your wallet doesn't have enough SOL for network fees. Use the demo faucet.",
      detail,
    };
  }
  const code = extractErrorCode(err);
  const known = code === undefined ? undefined : errorByCode(code);
  if (known) {
    return { message: FRIENDLY[known.name] ?? known.msg, detail, code };
  }
  return { message: "Something went wrong. Please try again.", detail, code };
}
