import { createHash } from "node:crypto";

type Digest = { sha256: string; bytes: number };

// Hash as a stream: a five-minute video must not require two full in-memory blobs.
async function fingerprint(client: any, bucket: string, path: string): Promise<Digest> {
  const { data, error } = await client.storage.from(bucket).createSignedUrl(path, 300);
  if (error || !data?.signedUrl) throw new Error("Publication asset cannot be verified");
  const response = await fetch(data.signedUrl, { cache: "no-store", signal: AbortSignal.timeout(120_000) });
  if (!response.ok || !response.body) throw new Error("Publication asset cannot be read");
  const hash = createHash("sha256");
  let bytes = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      hash.update(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (!bytes) throw new Error("Publication asset is empty");
  return { sha256: hash.digest("hex"), bytes };
}

async function exists(client: any, bucket: string, path: string): Promise<boolean> {
  const parent = path.slice(0, path.lastIndexOf("/"));
  const name = path.slice(path.lastIndexOf("/") + 1);
  const { data, error } = await client.storage.from(bucket).list(parent, { search: name });
  if (error || !Array.isArray(data)) throw new Error("Publication destination is unknown");
  return data.some((object: any) => object.name === name);
}

/** The caller must authorize the source. Never overwrite or delete a destination.
 * A racing copy or a lost Storage response is resolved by verifying the bytes.
 * An unknown result remains an error; partial, unreferenced copies are retained.
 */
export async function copyImmutablePublicationAsset(client: any, bucket: string, source: string, destination: string) {
  const expected = await fingerprint(client, bucket, source);
  if (!await exists(client, bucket, destination)) {
    const { error } = await client.storage.from(bucket).copy(source, destination);
    if (error && !await exists(client, bucket, destination)) throw new Error("Publication copy failed");
  }
  const actual = await fingerprint(client, bucket, destination);
  if (actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256) {
    throw new Error("Publication destination content mismatch");
  }
  return { bucket, path: destination, ...actual };
}
