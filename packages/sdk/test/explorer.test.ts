import { describe, expect, it } from "vitest";

import { explorerUrl, parseCluster } from "../src/index.js";

describe("parseCluster", () => {
  it("defaults to devnet when unset", () => {
    expect(parseCluster(undefined)).toBe("devnet");
    expect(parseCluster("")).toBe("devnet");
  });

  it("accepts known clusters", () => {
    expect(parseCluster("localnet")).toBe("localnet");
    expect(parseCluster("mainnet-beta")).toBe("mainnet-beta");
  });

  it("rejects unknown clusters", () => {
    expect(() => parseCluster("testnet")).toThrow(/Unknown cluster/);
  });
});

describe("explorerUrl", () => {
  const sig = "5j7s1QzqC9JZ";

  it("adds the devnet cluster param", () => {
    expect(explorerUrl("tx", sig, "devnet")).toBe(
      `https://explorer.solana.com/tx/${sig}?cluster=devnet`,
    );
  });

  it("has no cluster param on mainnet", () => {
    expect(explorerUrl("address", sig, "mainnet-beta")).toBe(
      `https://explorer.solana.com/address/${sig}`,
    );
  });

  it("points localnet at a local RPC", () => {
    expect(explorerUrl("tx", sig, "localnet")).toContain("customUrl=http%3A%2F%2Flocalhost%3A8899");
  });
});
