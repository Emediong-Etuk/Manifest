import "server-only";

/**
 * Evidence storage. Pinata (public IPFS) when PINATA_JWT is set; otherwise the local
 * filesystem under `.data/` (development only: serverless hosts don't keep files).
 * Docs: https://docs.pinata.cloud/files/uploading-files, /files/listing-files
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export interface StoredFile {
  /** Canonical URI written into manifests (`ipfs://<cid>` or `/api/files/<name>`). */
  uri: string;
  /** Browser-loadable URL. */
  url: string;
}

export interface EvidenceStore {
  kind: "pinata" | "local";
  put(name: string, bytes: Uint8Array, contentType: string): Promise<StoredFile>;
  /** Latest manifest stored for a consignment, or null. */
  latestManifest(consignment: string): Promise<{ file: StoredFile; json: string } | null>;
  toUrl(uri: string): string;
}

export const manifestName = (consignment: string) => `manifest-${consignment}.json`;

const SAFE_NAME = /^[A-Za-z0-9._-]{1,128}$/;

function localStore(): EvidenceStore {
  const root = resolve(process.cwd(), ".data");
  const files = join(root, "files");
  const toUrl = (uri: string) => uri;
  return {
    kind: "local",
    toUrl,
    async put(name, bytes) {
      if (!SAFE_NAME.test(name)) throw new Error("Invalid file name");
      await mkdir(files, { recursive: true });
      await writeFile(join(files, name), bytes);
      const uri = `/api/files/${name}`;
      return { uri, url: uri };
    },
    async latestManifest(consignment) {
      const name = manifestName(consignment);
      try {
        const json = await readFile(join(files, name), "utf8");
        const uri = `/api/files/${name}`;
        return { file: { uri, url: uri }, json };
      } catch {
        return null;
      }
    },
  };
}

/** Read a locally stored file (served by /api/files/[name]). */
export async function readLocalFile(name: string): Promise<Uint8Array | null> {
  if (!SAFE_NAME.test(name)) return null;
  try {
    return await readFile(join(resolve(process.cwd(), ".data"), "files", name));
  } catch {
    return null;
  }
}

function pinataStore(jwt: string, gateway: string): EvidenceStore {
  const toUrl = (uri: string) =>
    uri.startsWith("ipfs://") ? `https://${gateway}/ipfs/${uri.slice("ipfs://".length)}` : uri;
  return {
    kind: "pinata",
    toUrl,
    async put(name, bytes, contentType) {
      const form = new FormData();
      form.append("file", new Blob([bytes as BlobPart], { type: contentType }), name);
      form.append("network", "public");
      form.append("name", name);
      const res = await fetch("https://uploads.pinata.cloud/v3/files", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
        body: form,
      });
      if (!res.ok) throw new Error(`Pinata upload failed (${res.status})`);
      const body = (await res.json()) as { data?: { cid?: string } };
      const cid = body.data?.cid;
      if (!cid) throw new Error("Pinata upload returned no CID");
      const uri = `ipfs://${cid}`;
      return { uri, url: toUrl(uri) };
    },
    async latestManifest(consignment) {
      const params = new URLSearchParams({
        name: manifestName(consignment),
        order: "DESC",
        limit: "1",
      });
      const res = await fetch(`https://api.pinata.cloud/v3/files/public?${params}`, {
        headers: { Authorization: `Bearer ${jwt}` },
        cache: "no-store",
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { data?: { files?: { cid: string }[] } };
      const cid = body.data?.files?.[0]?.cid;
      if (!cid) return null;
      const uri = `ipfs://${cid}`;
      const file = await fetch(toUrl(uri), { cache: "no-store" });
      if (!file.ok) return null;
      return { file: { uri, url: toUrl(uri) }, json: await file.text() };
    },
  };
}

export function evidenceStore(): EvidenceStore {
  const jwt = process.env.PINATA_JWT;
  const gateway = process.env.PINATA_GATEWAY;
  if (jwt && gateway)
    return pinataStore(jwt, gateway.replace(/^https?:\/\//, "").replace(/\/$/, ""));
  return localStore();
}
