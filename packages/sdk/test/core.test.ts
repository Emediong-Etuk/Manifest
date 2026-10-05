import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";

import { MANIFEST_PROGRAM_ID, parseCluster, resolveProgramId } from "../src/constants.js";
import { explorerUrl } from "../src/explorer.js";
import { errorByCode, extractErrorCode, friendlyError } from "../src/errors.js";
import {
  canonicalJson,
  hashEvidence,
  toHex,
  verifyEvidence,
  type EvidenceManifest,
} from "../src/evidence.js";
import { accountSize, enumIndex, fieldOffset } from "../src/layout.js";
import { configPda, consignmentPda, containerPda, forwarderPda, vaultPda } from "../src/pdas.js";

describe("constants", () => {
  it("parses clusters and program ids", () => {
    expect(parseCluster(undefined)).toBe("devnet");
    expect(() => parseCluster("testnet")).toThrow(/Unknown cluster/);
    expect(resolveProgramId(undefined).equals(MANIFEST_PROGRAM_ID)).toBe(true);
    const other = PublicKey.unique();
    expect(resolveProgramId(other.toBase58()).equals(other)).toBe(true);
  });

  it("builds explorer links per cluster", () => {
    expect(explorerUrl("tx", "abc", "devnet")).toBe(
      "https://explorer.solana.com/tx/abc?cluster=devnet",
    );
    expect(explorerUrl("address", "abc", "mainnet-beta")).toBe(
      "https://explorer.solana.com/address/abc",
    );
  });
});

describe("layout offsets (must match tests/src/layout.rs)", () => {
  it("computes field offsets from the IDL", () => {
    expect(fieldOffset("Consignment", "container")).toBe(11);
    expect(fieldOffset("Consignment", "trader")).toBe(45);
    expect(fieldOffset("Consignment", "status")).toBe(319);
    expect(fieldOffset("Container", "forwarder")).toBe(10);
    expect(fieldOffset("Container", "status")).toBe(137);
    expect(accountSize("Consignment")).toBe(394);
    expect(enumIndex("ConsignmentStatus", "approved")).toBe(2);
    expect(enumIndex("ContainerStatus", "Arrived")).toBe(3);
    expect(() => fieldOffset("Consignment", "nope")).toThrow();
  });
});

describe("pdas", () => {
  it("derives deterministic, distinct addresses", () => {
    const authority = new PublicKey("7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU");
    const f = forwarderPda(authority);
    const c0 = containerPda(f, 0);
    const c1 = containerPda(f, 1);
    expect(c0.equals(containerPda(f, 0))).toBe(true);
    expect(c0.equals(c1)).toBe(false);
    const k = consignmentPda(c0, 0);
    expect(vaultPda(k).equals(k)).toBe(false);
    const [expected] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      MANIFEST_PROGRAM_ID,
    );
    expect(configPda().equals(expected)).toBe(true);
  });
});

describe("errors", () => {
  it("maps codes from every error shape to friendly text", () => {
    expect(errorByCode(6022)?.name).toBe("CoverageExceeded");
    expect(extractErrorCode({ InstructionError: [0, { Custom: 6022 }] })).toBe(6022);
    expect(extractErrorCode({ logs: ["Program failed: custom program error: 0x1786"] })).toBe(6022);
    expect(extractErrorCode({ error: { errorCode: { number: 6024 } } })).toBe(6024);
    expect(friendlyError({ InstructionError: [0, { Custom: 6022 }] }).message).toMatch(
      /guarantee is fully used/,
    );
    expect(friendlyError(new Error("User rejected the request")).message).toMatch(/cancelled/);
    expect(friendlyError(new Error("boom")).message).toMatch(/Something went wrong/);
  });
});

describe("evidence", () => {
  const manifest: EvidenceManifest = {
    schema: "manifest.evidence.v1",
    consignment: "C",
    container: "K",
    forwarder: "F",
    recordedAt: "2026-10-09T10:15:00Z",
    measuredCbmMilli: 1250,
    cartonCount: 12,
    packingList: [{ item: "iPhone 15 silicone cases", qty: 2400 }],
    notes: "2 cartons slightly dented, contents fine",
    photos: [],
  };

  it("canonicalizes with sorted keys regardless of input order", () => {
    const reordered = Object.fromEntries(Object.entries(manifest).reverse());
    expect(canonicalJson(reordered)).toBe(canonicalJson(manifest));
    expect(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe('{"a":[2,{"c":2,"d":1}],"b":1}');
  });

  it("hashes with SHA-256 and verifies against the onchain hash", async () => {
    const { hash, hashHex } = await hashEvidence(manifest);
    expect(hash).toHaveLength(32);
    expect(toHex(hash)).toBe(hashHex);
    expect(await verifyEvidence(JSON.stringify(manifest), hash)).toBe(true);
    expect(await verifyEvidence({ ...manifest, cartonCount: 11 }, hash)).toBe(false);
  });

  it("matches a known SHA-256 vector", async () => {
    const { sha256 } = await import("../src/evidence.js");
    expect(toHex(await sha256("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
