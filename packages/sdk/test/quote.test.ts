import { describe, expect, it } from "vitest";

import { freightFor, quoteBooking } from "../src/quote.js";

describe("quoteBooking (mirrors program math)", () => {
  it("matches the program's standard booking", () => {
    // Same numbers as tests/src/booking.rs: $2,400 goods, 1.25 CBM at $380/CBM.
    const q = quoteBooking({
      goods: 2_400_000_000n,
      estCbmMilli: 1_250,
      ratePerCbm: 380_000_000n,
      feeBps: 75,
      freightBufferBps: 1_000,
      coverageBps: 2_000,
    });
    expect(q.fee).toBe(18_000_000n);
    expect(q.estimatedFreight).toBe(475_000_000n);
    expect(q.freightEscrowed).toBe(522_500_000n);
    expect(q.total).toBe(2_940_500_000n);
    expect(q.coverage).toBe(480_000_000n);
  });

  it("rounds like the program at the edges", () => {
    expect(freightFor(1, 1n)).toBe(1n);
    const q = quoteBooking({
      goods: 133n,
      estCbmMilli: 1,
      ratePerCbm: 1n,
      feeBps: 75,
      freightBufferBps: 1_000,
      coverageBps: 2_000,
    });
    expect(q.fee).toBe(0n);
    expect(q.freightEscrowed).toBe(2n);
    expect(q.coverage).toBe(27n);
  });
});
