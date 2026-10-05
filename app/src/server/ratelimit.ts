import "server-only";

/**
 * Tiny key-value helpers for rate limits: Vercel KV / Upstash Redis REST when
 * KV_REST_API_URL + KV_REST_API_TOKEN are set, otherwise process memory (fine for one
 * dev server; resets on restart and isn't shared between serverless instances).
 */

const memory = new Map<string, { value: number; expires: number }>();
let warned = false;

async function redis(command: (string | number)[]): Promise<unknown> {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return undefined;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`KV error ${res.status}`);
  return ((await res.json()) as { result: unknown }).result;
}

const useKv = () => Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

function warnOnce() {
  if (!warned) {
    warned = true;
    console.warn("[ratelimit] KV not configured: using in-memory limits (dev only).");
  }
}

/** Claim `key` for `ttlSecs`. Returns false if it was already claimed. */
export async function claimOnce(key: string, ttlSecs: number): Promise<boolean> {
  if (useKv()) return (await redis(["SET", key, 1, "NX", "EX", ttlSecs])) === "OK";
  warnOnce();
  const now = Date.now();
  const hit = memory.get(key);
  if (hit && hit.expires > now) return false;
  memory.set(key, { value: 1, expires: now + ttlSecs * 1000 });
  return true;
}

/** Undo a claim (e.g. when the faucet transaction failed). */
export async function release(key: string): Promise<void> {
  if (useKv()) {
    await redis(["DEL", key]);
    return;
  }
  memory.delete(key);
}

/** Increment a counter that expires after `ttlSecs`; returns the new value. */
export async function increment(key: string, ttlSecs: number): Promise<number> {
  if (useKv()) {
    const value = Number(await redis(["INCR", key]));
    if (value === 1) await redis(["EXPIRE", key, ttlSecs]);
    return value;
  }
  warnOnce();
  const now = Date.now();
  const hit = memory.get(key);
  const value = hit && hit.expires > now ? hit.value + 1 : 1;
  memory.set(key, {
    value,
    expires: hit && hit.expires > now ? hit.expires : now + ttlSecs * 1000,
  });
  return value;
}
