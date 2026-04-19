type Env = {
  APPWRITE_ENDPOINT: string;
  APPWRITE_PROJECT_ID: string;
  APPWRITE_API_KEY: string;
  MEMORYLANES_DATABASE_ID: string;
  MEMORYLANES_STORAGE_BUCKET_ID: string;
  MEMORYLANES_ENCRYPTION_KEY?: string;
};

declare const Deno: {
  env: {
    get: (key: string) => string | undefined;
  };
};

type AppwriteList<T> = {
  total: number;
  documents?: T[];
  collections?: T[];
  files?: T[];
};

type Collection = { $id: string };
type MemoryDoc = { files?: string[] };
type FileDoc = { $id: string };

const HOURS_6_MS = 6 * 60 * 60 * 1000;
const MINUTES_30_MS = 30 * 60 * 1000;

const toBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
};

const fromBase64 = (value: string): Uint8Array => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const concatBytes = (a: Uint8Array, b: Uint8Array): Uint8Array => {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
};

const deriveAesKey = async (secret: string): Promise<CryptoKey> => {
  const data = new TextEncoder().encode(secret);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["decrypt"]);
};

const tryDecryptPacked = async (value: string, secret?: string): Promise<string> => {
  if (!secret || typeof value !== "string") return value;
  const parts = value.split(".");
  if (parts.length !== 3) return value;
  try {
    const [ivB64, tagB64, ctB64] = parts;
    const iv = fromBase64(ivB64);
    const tag = fromBase64(tagB64);
    const ciphertext = fromBase64(ctB64);
    const payload = concatBytes(ciphertext, tag);
    const payloadBuffer = payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength);
    const ivForDecrypt = iv as unknown as BufferSource;
    const payloadForDecrypt = payloadBuffer as unknown as BufferSource;
    const key = await deriveAesKey(secret);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivForDecrypt, tagLength: 128 }, key, payloadForDecrypt);
    return new TextDecoder().decode(new Uint8Array(decrypted));
  } catch {
    return value;
  }
};

const formatQuery = (query: string): string => `queries[]=${encodeURIComponent(query)}`;

const createClient = (env: Env) => {
  const endpoint = env.APPWRITE_ENDPOINT.replace(/\/$/, "").replace(/\/v\d+$/, "");
  const headers = {
    "X-Appwrite-Project": env.APPWRITE_PROJECT_ID,
    "X-Appwrite-Key": env.APPWRITE_API_KEY,
    "Content-Type": "application/json",
  };

  const get = async <T>(path: string, queries: string[] = []): Promise<T> => {
    const qs = queries.length ? `?${queries.map(formatQuery).join("&")}` : "";
    const response = await fetch(`${endpoint}${path}${qs}`, { method: "GET", headers });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GET ${path} failed: ${response.status} ${text}`);
    }
    return (await response.json()) as T;
  };

  const del = async (path: string): Promise<void> => {
    const response = await fetch(`${endpoint}${path}`, { method: "DELETE", headers });
    if (!response.ok && response.status !== 404) {
      const text = await response.text();
      throw new Error(`DELETE ${path} failed: ${response.status} ${text}`);
    }
  };

  return { get, del };
};

const requireEnv = (): Env => {
  const required = [
    "MEMORYLANES_DATABASE_ID",
    "MEMORYLANES_STORAGE_BUCKET_ID",
  ] as const;

  const missing: string[] = [];
  for (const key of required) {
    if (!Deno.env.get(key)) missing.push(key);
  }
  if (missing.length) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }

  const resolvedEndpoint =
    Deno.env.get("APPWRITE_FUNCTION_API_ENDPOINT") ||
    Deno.env.get("APPWRITE_ENDPOINT");

  if (!resolvedEndpoint) {
    throw new Error("Missing environment variable: APPWRITE_FUNCTION_API_ENDPOINT or APPWRITE_ENDPOINT");
  }

  const resolvedProjectId =
    Deno.env.get("APPWRITE_FUNCTION_PROJECT_ID") ||
    Deno.env.get("APPWRITE_PROJECT_ID");

  if (!resolvedProjectId) {
    throw new Error("Missing environment variable: APPWRITE_FUNCTION_PROJECT_ID or APPWRITE_PROJECT_ID");
  }

  const resolvedApiKey =
    Deno.env.get("APPWRITE_FUNCTION_API_KEY") ||
    Deno.env.get("APPWRITE_API_KEY");

  if (!resolvedApiKey) {
    throw new Error("Missing environment variable: APPWRITE_FUNCTION_API_KEY or APPWRITE_API_KEY");
  }

  return {
    APPWRITE_ENDPOINT: resolvedEndpoint,
    APPWRITE_PROJECT_ID: resolvedProjectId,
    APPWRITE_API_KEY: resolvedApiKey,
    MEMORYLANES_DATABASE_ID: Deno.env.get("MEMORYLANES_DATABASE_ID") as string,
    MEMORYLANES_STORAGE_BUCKET_ID: Deno.env.get("MEMORYLANES_STORAGE_BUCKET_ID") as string,
    MEMORYLANES_ENCRYPTION_KEY: Deno.env.get("MEMORYLANES_ENCRYPTION_KEY") || undefined,
  };
};

const listAllCollections = async (get: <T>(path: string, queries?: string[]) => Promise<T>, databaseId: string): Promise<Collection[]> => {
  const out: Collection[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const data = await get<AppwriteList<Collection>>(`/v1/databases/${databaseId}/collections`, [
      `limit(${limit})`,
      `offset(${offset})`,
    ]);
    const chunk = data.collections || [];
    out.push(...chunk);
    if (chunk.length < limit) break;
    offset += limit;
  }

  return out;
};

const listRecentMemoriesForCollection = async (
  get: <T>(path: string, queries?: string[]) => Promise<T>,
  databaseId: string,
  collectionId: string,
  sinceIso: string,
): Promise<MemoryDoc[]> => {
  const out: MemoryDoc[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const data = await get<AppwriteList<MemoryDoc>>(`/v1/databases/${databaseId}/collections/${collectionId}/documents`, [
      `greaterThanEqual(\"$createdAt\",\"${sinceIso}\")`,
      `limit(${limit})`,
      `offset(${offset})`,
    ]);
    const chunk = data.documents || [];
    out.push(...chunk);
    if (chunk.length < limit) break;
    offset += limit;
  }

  return out;
};

const listCandidateFiles = async (
  get: <T>(path: string, queries?: string[]) => Promise<T>,
  bucketId: string,
  fromIso: string,
  toIso: string,
): Promise<FileDoc[]> => {
  const out: FileDoc[] = [];
  let offset = 0;
  const limit = 100;
  const fromMs = new Date(fromIso).getTime();
  const toMs = new Date(toIso).getTime();

  while (true) {
    const data = await get<AppwriteList<FileDoc>>(`/v1/storage/buckets/${bucketId}/files`, [
      `limit(${limit})`,
      `offset(${offset})`,
    ]);
    const chunk = data.files || [];
    
    // Filter by date in code since storage files API doesn't support date queries
    for (const file of chunk) {
      const fileCreatedMs = new Date((file as any).$createdAt || "").getTime();
      if (fileCreatedMs >= fromMs && fileCreatedMs <= toMs) {
        out.push(file);
      }
    }
    
    if (chunk.length < limit) break;
    offset += limit;
  }

  return out;
};

export default async ({ res, log, error }: { res: any; log?: (s: string) => void; error?: (s: string) => void }) => {
  try {
    const env = requireEnv();
    const now = Date.now();
    const since6h = new Date(now - HOURS_6_MS).toISOString();
    const before30m = new Date(now - MINUTES_30_MS).toISOString();

    const client = createClient(env);

    const candidateFiles = await listCandidateFiles(
      client.get,
      env.MEMORYLANES_STORAGE_BUCKET_ID,
      since6h,
      before30m,
    );

    if (candidateFiles.length === 0) {
      return res.json({
        message: "No candidate files found in 6h-to-30m window",
        checkedWindow: { since6h, before30m },
        deletedCount: 0,
      }, 200);
    }

    const collections = await listAllCollections(client.get, env.MEMORYLANES_DATABASE_ID);
    const referenced = new Set<string>();

    for (const collection of collections) {
      const docs = await listRecentMemoriesForCollection(
        client.get,
        env.MEMORYLANES_DATABASE_ID,
        collection.$id,
        since6h,
      );

      for (const doc of docs) {
        const files = Array.isArray(doc.files) ? doc.files : [];
        for (const entry of files) {
          if (typeof entry !== "string" || entry.length === 0) continue;
          const normalized = await tryDecryptPacked(entry, env.MEMORYLANES_ENCRYPTION_KEY);
          if (normalized) referenced.add(normalized);
        }
      }
    }

    const orphanFileIds = candidateFiles
      .map((f) => f.$id)
      .filter((id) => !referenced.has(id));

    const deleted: string[] = [];
    const failed: string[] = [];

    for (const fileId of orphanFileIds) {
      try {
        await client.del(`/v1/storage/buckets/${env.MEMORYLANES_STORAGE_BUCKET_ID}/files/${fileId}`);
        deleted.push(fileId);
      } catch (e) {
        failed.push(fileId);
        error?.(`Failed to delete file ${fileId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    log?.(`Cleanup complete. candidates=${candidateFiles.length} orphan=${orphanFileIds.length} deleted=${deleted.length}`);

    return res.json({
      message: "Cleanup completed",
      checkedWindow: { since6h, before30m },
      candidatesCount: candidateFiles.length,
      referencedCount: referenced.size,
      orphanCount: orphanFileIds.length,
      deletedCount: deleted.length,
      failedCount: failed.length,
      deleted,
      failed,
    }, 200);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    error?.(message);
    return res.json({ error: message }, 500);
  }
};
