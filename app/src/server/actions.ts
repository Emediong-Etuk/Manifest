import "server-only";

import { createActionHeaders } from "@solana/actions";
import { parseCluster } from "@manifest/sdk";

/**
 * Headers for every Solana Actions response, including OPTIONS (CORS preflight) and
 * actions.json: Access-Control-* plus X-Action-Version and X-Blockchain-Ids.
 * Spec: https://solana.com/docs/advanced/actions ("OPTIONS response", "actions.json").
 * localnet has no CAIP-2 id; it advertises devnet (Blink clients only run on real clusters).
 */
export const ACTION_HEADERS = createActionHeaders({
  chainId: parseCluster(process.env.NEXT_PUBLIC_CLUSTER) === "mainnet-beta" ? "mainnet" : "devnet",
  actionVersion: "2.4",
});

/** Fatal ActionError: `{ message }` with an HTTP error status. */
export function actionError(message: string, status = 400): Response {
  return Response.json({ message }, { status, headers: ACTION_HEADERS });
}

export function actionsPreflight(): Response {
  return new Response(null, { status: 204, headers: ACTION_HEADERS });
}
