import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { R2Key, PresignedUrl } from "@/lib/types/brands";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PDF_MAGIC = "%PDF-";

function readEnv() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(
      "R2 env vars missing: need R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME",
    );
  }
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

let cached: {
  client: S3Client;
  bucket: string;
  accessKeyIdPrefix: string;
} | null = null;

function getClient() {
  const { accountId, accessKeyId, secretAccessKey, bucket } = readEnv();
  const accessKeyIdPrefix = accessKeyId.slice(0, 6);
  // If credentials rotated, invalidate the cached client so the next call uses
  // the new key. Silent staleness on rotation = silent 403s on in-flight jobs.
  if (cached && cached.accessKeyIdPrefix !== accessKeyIdPrefix) {
    console.warn(
      `[r2] credential rotation detected (was ${cached.accessKeyIdPrefix}, now ${accessKeyIdPrefix}); recreating client`,
    );
    cached = null;
  }
  if (cached) return cached;
  console.log(
    `[r2] constructing S3 client (bucket=${bucket}, accessKeyIdPrefix=${accessKeyIdPrefix})`,
  );
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  cached = { client, bucket, accessKeyIdPrefix };
  return cached;
}

function assertDeckId(deckId: string): asserts deckId is string {
  if (!UUID_RE.test(deckId)) {
    throw new Error(`invalid deckId (expected UUID, got: ${deckId})`);
  }
}

export function deckPdfKey(deckId: string): R2Key {
  assertDeckId(deckId);
  return `decks/${deckId}/original.pdf` as R2Key;
}

export async function uploadDeckPdf(
  deckId: string,
  body: Buffer | Uint8Array,
): Promise<void> {
  const { client, bucket } = getClient();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: deckPdfKey(deckId),
      Body: body,
      ContentType: "application/pdf",
    }),
  );
}

export async function getDeckPdfBytes(deckId: string): Promise<Buffer> {
  const { client, bucket } = getClient();
  const key = deckPdfKey(deckId);
  const result = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );

  const ct = result.ContentType ?? "";
  if (!ct.startsWith("application/pdf") && !ct.startsWith("application/octet-stream")) {
    throw new Error(
      `R2 object ${key} has unexpected ContentType: ${ct || "(missing)"}`,
    );
  }

  const stream = result.Body;
  if (!stream || !("transformToByteArray" in stream)) {
    throw new Error(`R2 object ${key} has no body or unexpected stream type`);
  }
  const bytes = await stream.transformToByteArray();
  if (bytes.length === 0) {
    throw new Error(`R2 object ${key} is zero bytes`);
  }
  if (
    result.ContentLength !== undefined &&
    result.ContentLength !== bytes.length
  ) {
    throw new Error(
      `R2 object ${key} length mismatch: header ${result.ContentLength} vs body ${bytes.length}`,
    );
  }
  const head = Buffer.from(bytes.slice(0, 5)).toString("ascii");
  if (head !== PDF_MAGIC) {
    throw new Error(
      `R2 object ${key} does not begin with PDF magic bytes (got: ${JSON.stringify(head)})`,
    );
  }
  return Buffer.from(bytes);
}

export async function headDeckPdf(
  deckId: string,
): Promise<{ exists: true; size: number } | { exists: false }> {
  const { client, bucket } = getClient();
  try {
    const result = await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: deckPdfKey(deckId) }),
    );
    return { exists: true, size: result.ContentLength ?? 0 };
  } catch (e: unknown) {
    const code = (e as { $metadata?: { httpStatusCode?: number } })?.$metadata
      ?.httpStatusCode;
    if (code === 404) return { exists: false };
    throw e;
  }
}

export async function getDeckPdfPresignedUrl(
  deckId: string,
  expiresInSeconds = 3600,
): Promise<PresignedUrl> {
  const { client, bucket } = getClient();
  const url = await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: deckPdfKey(deckId) }),
    { expiresIn: expiresInSeconds },
  );
  return url as PresignedUrl;
}
