/** GET /api/evidence/[consignment]: the latest evidence manifest, with displayable photo URLs. */
import { evidenceStore } from "@/server/storage";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ consignment: string }> },
) {
  const { consignment } = await params;
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(consignment)) {
    return Response.json({ error: "Invalid address" }, { status: 400 });
  }
  const store = evidenceStore();
  const latest = await store.latestManifest(consignment);
  if (!latest) return Response.json({ error: "No evidence yet" }, { status: 404 });
  const manifest = JSON.parse(latest.json) as { photos?: { uri: string }[] };
  return Response.json({
    manifestUri: latest.file.uri,
    manifestJson: latest.json,
    photoUrls: (manifest.photos ?? []).map((p) => store.toUrl(p.uri)),
  });
}
