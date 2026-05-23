/**
 * Branded string types. These are plain strings at runtime but distinct
 * types at compile time, preventing accidental mix-ups like passing an
 * R2 object key where a presigned URL is expected.
 *
 * Construct only through the dedicated factory functions in the relevant
 * modules (e.g., `deckPdfKey()` in lib/r2/client.ts).
 */

declare const __brand: unique symbol;

type Brand<T, B> = T & { readonly [__brand]: B };

export type R2Key = Brand<string, "R2Key">;
export type PresignedUrl = Brand<string, "PresignedUrl">;
export type PrivateToken = Brand<string, "PrivateToken">;
export type PublicToken = Brand<string, "PublicToken">;
