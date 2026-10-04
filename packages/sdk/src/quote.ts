/**
 * Booking quote: the exact amounts `book_consignment` will lock, mirroring the program's
 * rounding (programs/manifest/src/utils/math.rs): fee rounds down, freight and the buffer
 * round up, coverage rounds up.
 */
const BPS = 10_000n;
const MILLI = 1_000n;

const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;

export interface BookingQuote {
  goods: bigint;
  fee: bigint;
  /** Freight on the estimated volume, before the buffer. */
  estimatedFreight: bigint;
  /** Freight actually escrowed (estimate + buffer); the excess is refunded at approval. */
  freightEscrowed: bigint;
  total: bigint;
  coverage: bigint;
}

export function freightFor(cbmMilli: number, ratePerCbm: bigint): bigint {
  return ceilDiv(BigInt(cbmMilli) * ratePerCbm, MILLI);
}

export function quoteBooking(args: {
  goods: bigint;
  estCbmMilli: number;
  ratePerCbm: bigint;
  feeBps: number;
  freightBufferBps: number;
  coverageBps: number;
}): BookingQuote {
  const fee = (args.goods * BigInt(args.feeBps)) / BPS;
  const estimatedFreight = freightFor(args.estCbmMilli, args.ratePerCbm);
  const freightEscrowed = ceilDiv(estimatedFreight * (BPS + BigInt(args.freightBufferBps)), BPS);
  return {
    goods: args.goods,
    fee,
    estimatedFreight,
    freightEscrowed,
    total: args.goods + fee + freightEscrowed,
    coverage: ceilDiv(args.goods * BigInt(args.coverageBps), BPS),
  };
}
