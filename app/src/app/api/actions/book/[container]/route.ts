/**
 * Solana Action (Blink) for booking space on a container.
 *  GET  -> ActionGetResponse: route, space left, rate, cut-off and forwarder score, with
 *          one form (goods value, estimated CBM, supplier address, description).
 *  POST -> { type: "transaction", transaction } : an unsigned book_consignment transaction
 *          for `account` (fee payer), built by @manifest/sdk and simulated first so the
 *          user gets a plain-language error instead of a failing wallet prompt.
 * Spec: https://solana.com/docs/advanced/actions. Headers on every response via
 * createActionHeaders (src/server/actions.ts).
 */
import {
  buildTransaction,
  containerStatus,
  decodeFixed,
  FIELD_LEN,
  formatCbm,
  formatCountdown,
  formatUsd,
  friendlyError,
  ix,
  locodeCity,
  mintTokenProgram,
  parseCbm,
  parseUsd,
  quoteBooking,
  ata,
  configPda,
} from "@manifest/sdk";
import type { ActionGetResponse, ActionPostResponse } from "@solana/actions";
import { createAssociatedTokenAccountIdempotentInstruction } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { z } from "zod";

import { ACTION_HEADERS, actionError, actionsPreflight } from "@/server/actions";
import { serverProgram } from "@/server/chain";
import { appUrl, loadContainer, parseKey, scoreText } from "@/server/og/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const dollars = (v: bigint | { toString(): string }) =>
  formatUsd(BigInt(v.toString())).replace(/\.00$/, "");

const pubkey = z.string().refine((v) => parseKey(v) !== null, "Not a valid Solana address");

const query = z.object({
  goods: z.string().min(1, "Enter the goods value"),
  cbm: z.string().min(1, "Enter the estimated volume"),
  payee: pubkey,
  description: z
    .string()
    .trim()
    .min(1, "Describe the goods")
    .refine(
      (v) => new TextEncoder().encode(v).length <= FIELD_LEN.description,
      `Keep the description under ${FIELD_LEN.description} characters`,
    ),
});

export const OPTIONS = actionsPreflight;

export async function GET(request: Request, ctx: { params: Promise<{ container: string }> }) {
  const { container: param } = await ctx.params;
  const key = parseKey(param);
  const data = key ? await loadContainer(key).catch(() => null) : null;
  if (!key || !data) return actionError("Container not found", 404);

  const { container: c, forwarder: f } = data;
  const base = appUrl(request);
  const code = decodeFixed(c.code);
  const route = `${locodeCity(decodeFixed(c.origin))} → ${locodeCity(decodeFixed(c.destination))}`;
  const left = Math.max(0, c.capacityCbmMilli - c.bookedCbmMilli);
  const cutoffIn = c.cutoffTs.toNumber() - Math.floor(Date.now() / 1000);
  const open = containerStatus(c) === "open" && cutoffIn > 0 && left > 0;
  const href =
    `${base}/api/actions/book/${key.toBase58()}` +
    "?goods={goods}&cbm={cbm}&payee={payee}&description={description}";

  const body: ActionGetResponse = {
    type: "action",
    icon: `${base}/api/og/container/${key.toBase58()}`,
    title: `Book space on ${code}: ${route}`,
    description: [
      `${formatCbm(left)} left at ${dollars(c.ratePerCbm)}/CBM.`,
      open ? `Cut-off in ${formatCountdown(cutoffIn)}.` : "Booking is closed.",
      f
        ? `Forwarder ${decodeFixed(f.name)} (${scoreText(f)}), ${dollars(f.bondBalance)} guarantee.`
        : "",
      "Your payment stays locked onchain until the forwarder photographs and measures your goods and you approve them. Then the supplier is paid.",
    ]
      .filter(Boolean)
      .join(" "),
    label: "Book space",
    disabled: !open,
    ...(open ? {} : { error: { message: "This container isn't taking bookings." } }),
    links: {
      actions: [
        {
          type: "transaction",
          label: "Book space",
          href,
          parameters: [
            {
              name: "goods",
              label: "Goods value in USD (e.g. 2400)",
              type: "number",
              required: true,
              min: 1,
            },
            {
              name: "cbm",
              label: "Estimated volume in CBM (e.g. 1.25)",
              type: "number",
              required: true,
              min: 0.001,
              max: left / 1000,
            },
            {
              name: "payee",
              label: "Supplier or payment agent's Solana address",
              type: "text",
              required: true,
              pattern: "^[1-9A-HJ-NP-Za-km-z]{32,44}$",
              patternDescription: "A Solana wallet address",
            },
            {
              name: "description",
              label: "What are you shipping? (e.g. Phone cases, 12 cartons)",
              type: "text",
              required: true,
            },
          ],
        },
      ],
    },
  };
  return Response.json(body, { headers: ACTION_HEADERS });
}

export async function POST(request: Request, ctx: { params: Promise<{ container: string }> }) {
  const { container: param } = await ctx.params;
  const container = parseKey(param);
  if (!container) return actionError("Container not found", 404);

  const bodyJson = (await request.json().catch(() => null)) as { account?: unknown } | null;
  const account = typeof bodyJson?.account === "string" ? parseKey(bodyJson.account) : null;
  if (!account) return actionError("Missing or invalid account");

  const parsed = query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Invalid input");
  let goods: bigint;
  let estCbmMilli: number;
  try {
    goods = parseUsd(parsed.data.goods);
    estCbmMilli = parseCbm(parsed.data.cbm);
  } catch {
    return actionError("Enter amounts as plain numbers, like 2400 and 1.25");
  }
  if (goods <= 0n || estCbmMilli <= 0) return actionError("Amounts must be more than zero");
  const payee = new PublicKey(parsed.data.payee);
  if (payee.equals(account)) return actionError("The supplier's address can't be your own wallet");

  const program = serverProgram();
  const connection = program.provider.connection;
  const [data, config] = await Promise.all([
    loadContainer(container).catch(() => null),
    program.account.config.fetchNullable(configPda(program.programId)),
  ]);
  if (!data || !config) return actionError("Container not found", 404);
  const { container: c } = data;

  // Friendly pre-checks; the program enforces all of these again.
  const left = c.capacityCbmMilli - c.bookedCbmMilli;
  if (containerStatus(c) !== "open" || c.cutoffTs.toNumber() <= Math.floor(Date.now() / 1000)) {
    return actionError("This container isn't taking bookings any more.");
  }
  if (estCbmMilli > left) return actionError(`Only ${formatCbm(left)} left on this container.`);
  const quote = quoteBooking({
    goods,
    estCbmMilli,
    ratePerCbm: BigInt(c.ratePerCbm.toString()),
    feeBps: config.feeBps,
    freightBufferBps: config.freightBufferBps,
    coverageBps: config.coverageBps,
  });
  const tokenProgram = await mintTokenProgram(connection, c.mint);
  const traderAta = ata(account, c.mint, tokenProgram);
  const balance = await connection
    .getTokenAccountBalance(traderAta)
    .then((r) => BigInt(r.value.amount))
    .catch(() => 0n);
  if (balance < quote.total) {
    return actionError(
      `You need ${formatUsd(quote.total)} (goods + fee + freight deposit) but have ${formatUsd(balance)}. ` +
        `Get free test dollars at ${appUrl(request)}.`,
    );
  }

  const instructions = [
    createAssociatedTokenAccountIdempotentInstruction(
      account,
      traderAta,
      account,
      c.mint,
      tokenProgram,
    ),
    ...(await ix.bookConsignment(program, {
      trader: account,
      container,
      goodsAmount: goods,
      estCbmMilli,
      payee,
      description: parsed.data.description,
    })),
  ];
  const tx = await buildTransaction(connection, instructions, account);
  const sim = await connection.simulateTransaction(tx, {
    sigVerify: false,
    replaceRecentBlockhash: true,
  });
  if (sim.value.err) {
    return actionError(
      friendlyError({ logs: sim.value.logs ?? [], message: JSON.stringify(sim.value.err) }).message,
    );
  }

  const code = decodeFixed(c.code);
  const response: ActionPostResponse = {
    type: "transaction",
    transaction: Buffer.from(tx.serialize()).toString("base64"),
    message: `Locks ${formatUsd(quote.total)} in escrow for your space on ${code}. The supplier is paid only after you approve the warehouse photos.`,
    links: {
      next: {
        type: "inline",
        action: {
          type: "completed",
          icon: `${appUrl(request)}/api/og/container/${container.toBase58()}`,
          title: `Booked on ${code}`,
          description: `Your money is in escrow. Track the shipment at ${appUrl(request)}/me`,
          label: "Booked",
        },
      },
    },
  };
  return Response.json(response, { headers: ACTION_HEADERS });
}
