/** Serves locally stored evidence files (development storage fallback only). */
import { readLocalFile } from "@/server/storage";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const bytes = await readLocalFile(name);
  if (!bytes) return new Response("Not found", { status: 404 });
  const type = name.endsWith(".json") ? "application/json" : "image/jpeg";
  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": type,
      "Cache-Control": name.endsWith(".json") ? "no-store" : "public, max-age=31536000, immutable",
    },
  });
}
