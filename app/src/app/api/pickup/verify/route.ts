/** POST /api/pickup/verify: server-side fallback for checking a pickup QR payload. */
import { verifyPickupPayload } from "@/lib/pickup";
import { serverProgram } from "@/server/chain";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const result = await verifyPickupPayload(serverProgram(), body);
  return Response.json(result, { status: result.ok ? 200 : 422 });
}
