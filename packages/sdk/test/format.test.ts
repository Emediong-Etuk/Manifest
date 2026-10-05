import BN from "bn.js";
import { describe, expect, it } from "vitest";

import {
  cbmFromCartons,
  decodeFixed,
  encodeFixed,
  formatCbm,
  formatCountdown,
  formatUsd,
  isValidIso6346,
  isValidLocode,
  iso6346CheckDigit,
  locodeCity,
  parseCbm,
  parseUsd,
  shortAddress,
} from "../src/format.js";

describe("money", () => {
  it("formats base units as dollars with two decimals", () => {
    expect(formatUsd(2_400_000_000n)).toBe("$2,400.00");
    expect(formatUsd(new BN(522_500_000))).toBe("$522.50");
    expect(formatUsd(1_234_567_890)).toBe("$1,234.57");
    expect(formatUsd(0n)).toBe("$0.00");
    expect(formatUsd(4_999n)).toBe("$0.00");
    expect(formatUsd(5_000n)).toBe("$0.01");
    expect(formatUsd(18_000_000n, { symbol: false })).toBe("18.00");
  });

  it("parses dollar input into base units", () => {
    expect(parseUsd("2,400.50")).toBe(2_400_500_000n);
    expect(parseUsd("$380")).toBe(380_000_000n);
    expect(parseUsd("0.000001")).toBe(1n);
    expect(() => parseUsd("1.0000001")).toThrow();
    expect(() => parseUsd("abc")).toThrow();
    expect(() => parseUsd("-5")).toThrow();
  });
});

describe("volume", () => {
  it("formats and parses milli-CBM", () => {
    expect(formatCbm(1_250)).toBe("1.25 CBM");
    expect(formatCbm(28_000)).toBe("28 CBM");
    expect(formatCbm(1)).toBe("0.001 CBM");
    expect(parseCbm("1.25")).toBe(1_250);
    expect(parseCbm("28")).toBe(28_000);
    expect(() => parseCbm("1.2345")).toThrow();
  });

  it("computes CBM from carton dimensions (rounded up)", () => {
    // 12 cartons of 50 x 40 x 30 cm = 0.72 CBM.
    expect(cbmFromCartons(50, 40, 30, 12)).toBe(720);
    expect(cbmFromCartons(10, 10, 10, 1)).toBe(1);
  });
});

describe("fixed strings", () => {
  it("round-trips zero-padded text", () => {
    const bytes = encodeFixed("LAG-1014", 12);
    expect(bytes).toHaveLength(12);
    expect(bytes.slice(8)).toEqual([0, 0, 0, 0]);
    expect(decodeFixed(bytes)).toBe("LAG-1014");
    expect(decodeFixed(encodeFixed("Ọjà", 12))).toBe("Ọjà");
    expect(() => encodeFixed("this is too long", 12)).toThrow();
  });
});

describe("ports and containers", () => {
  it("knows corridor ports", () => {
    expect(locodeCity("CNCAN")).toBe("Guangzhou");
    expect(locodeCity("NGAPP")).toBe("Apapa");
    expect(locodeCity("XXXXX")).toBe("XXXXX");
    expect(isValidLocode("CNYIW")).toBe(true);
    expect(isValidLocode("cncan")).toBe(false);
    expect(isValidLocode("CN1AN")).toBe(false);
  });

  it("validates ISO 6346 numbers exactly like the program", () => {
    for (const ok of ["CSQU3054383", "MSCU1234566", "MSKU9070323", "csqu3054383"]) {
      expect(isValidIso6346(ok)).toBe(true);
    }
    for (const bad of ["MSCU1234567", "MSCX1234566", "MSCU12A4566", "MSCU123456"]) {
      expect(isValidIso6346(bad)).toBe(false);
    }
    expect(iso6346CheckDigit("CSQU305438")).toBe(3);
  });
});

describe("display helpers", () => {
  it("shortens addresses", () => {
    expect(shortAddress("7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU")).toBe("7xKX…gAsU");
    expect(shortAddress("short")).toBe("short");
  });

  it("formats countdowns", () => {
    expect(formatCountdown(0)).toBe("now");
    expect(formatCountdown(65)).toBe("1m 05s");
    expect(formatCountdown(3 * 3600 + 12 * 60)).toBe("3h 12m");
    expect(formatCountdown(2 * 86_400 + 4 * 3600)).toBe("2d 4h");
  });
});
