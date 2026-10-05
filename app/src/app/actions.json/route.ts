/**
 * GET /actions.json: tells Blink clients that container pages (/c/<address>) have a
 * Solana Action at /api/actions/book/<address>. Must allow any origin.
 * Spec: https://solana.com/docs/advanced/actions#actionsjson
 */
import type { ActionsJson } from "@solana/actions";

import { ACTION_HEADERS, actionsPreflight } from "@/server/actions";

export const dynamic = "force-static";

export function GET() {
  const body: ActionsJson = {
    rules: [
      { pathPattern: "/c/*", apiPath: "/api/actions/book/*" },
      { pathPattern: "/api/actions/**", apiPath: "/api/actions/**" },
    ],
  };
  return Response.json(body, { headers: ACTION_HEADERS });
}

export const OPTIONS = actionsPreflight;
