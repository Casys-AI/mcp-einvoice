/**
 * Shared encoding utilities.
 *
 * @module lib/einvoice/src/adapters/shared/encoding
 */

/** Encode a Uint8Array to base64, chunked to avoid stack overflow on large files. */
export function uint8ToBase64(data: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < data.length; i += 8192) {
    binary += String.fromCharCode(...data.subarray(i, i + 8192));
  }
  return btoa(binary);
}

/** Encode a single URL path segment so user input cannot alter path structure. */
export function encodePathSegment(s: string): string {
  return encodeURIComponent(s);
}
