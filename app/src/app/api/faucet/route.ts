/**
 * POST /api/faucet { address }: devnet "try it" faucet. Sends 0.05 SOL if the wallet has
 * under 0.02 SOL (for fees) and mints 500 test dollars of the demo mint. The gas-tank key
 * (GAS_TANK_SECRET_KEY) pays and is the demo mint's authority. Devnet/localnet only.
 * Limits: once per address per 24 h, and a global daily cap.
 */
import { explorerUrl, parseCluster } from "@manifest/sdk";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import { z } from "zod";

import { sendServerTx, serverProgram } from "@/server/chain";
import { keypairFromEnv } from "@/server/keys";
import { claimOnce, increment, release } from "@/server/ratelimit";

export const runtime = "nodejs";

const FAUCET_DOLLARS = 500n;
const SOL_THRESHOLD = 0.02 * LAMPORTS_PER_SOL;
const SOL_DRIP = 0.05 * LAMPORTS_PER_SOL;
// `||`, not `??`: an empty FAUCET_DAILY_CAP (pasted from .env.example) must not mean a cap of 0.
const DAILY_CAP = Number(process.env.FAUCET_DAILY_CAP) || 300;
const DAY = 86_400;

const body = z.object({ address: z.string().min(32).max(44) });
const fail = (status: number, error: string) => Response.json({ error }, { status });

export async function POST(request: Request) {
  const cluster = parseCluster(process.env.NEXT_PUBLIC_CLUSTER);
  if (cluster === "mainnet-beta") return fail(404, "Not available");
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "Send { address }");
  let owner: PublicKey;
  try {
    owner = new PublicKey(parsed.data.address);
  } catch {
    return fail(400, "That isn't a valid Solana address");
  }

  const gasTank = keypairFromEnv("GAS_TANK_SECRET_KEY");
  const mintEnv = process.env.NEXT_PUBLIC_DEMO_MINT;
  if (!gasTank || !mintEnv) return fail(503, "The faucet isn't configured yet");
  const mint = new PublicKey(mintEnv);

  const key = `faucet:addr:${owner.toBase58()}`;
  if (!(await claimOnce(key, DAY)))
    return fail(429, "You already got test dollars today. Come back tomorrow.");
  const today = new Date().toISOString().slice(0, 10);
  if ((await increment(`faucet:day:${today}`, DAY)) > DAILY_CAP) {
    await release(key);
    return fail(429, "The faucet has given out today's test dollars. Try again tomorrow.");
  }

  try {
    const connection = serverProgram().provider.connection;
    const balance = await connection.getBalance(owner);
    const ata = getAssociatedTokenAddressSync(mint, owner, true, TOKEN_PROGRAM_ID);
    const instructions = [
      ...(balance < SOL_THRESHOLD
        ? [
            SystemProgram.transfer({
              fromPubkey: gasTank.publicKey,
              toPubkey: owner,
              lamports: SOL_DRIP,
            }),
          ]
        : []),
      createAssociatedTokenAccountIdempotentInstruction(
        gasTank.publicKey,
        ata,
        owner,
        mint,
        TOKEN_PROGRAM_ID,
      ),
      createMintToInstruction(
        mint,
        ata,
        gasTank.publicKey,
        FAUCET_DOLLARS * 1_000_000n,
        [],
        TOKEN_PROGRAM_ID,
      ),
    ];
    const signature = await sendServerTx(instructions, gasTank);
    return Response.json({
      signature,
      explorer: explorerUrl("tx", signature, cluster),
      dollars: Number(FAUCET_DOLLARS),
      sol: balance < SOL_THRESHOLD ? SOL_DRIP / LAMPORTS_PER_SOL : 0,
    });
  } catch (err) {
    await release(key);
    console.error("[faucet] failed", err instanceof Error ? err.message : err);
    return fail(502, "The faucet couldn't send right now. Please try again in a minute.");
  }
}
