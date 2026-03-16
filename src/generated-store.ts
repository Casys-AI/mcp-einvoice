/**
 * Generated File Store
 *
 * In-memory temporary store for generated invoice files (PDF/XML).
 * Files auto-expire after 10 minutes. Used by the generate → preview → emit flow
 * to avoid passing large base64 payloads back through the LLM context.
 *
 * @module lib/einvoice/src/generated-store
 */

const EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

interface StoredFile {
  file: Uint8Array;
  filename: string;
  createdAt: number;
}

const store = new Map<string, StoredFile>();

/** Purge entries older than EXPIRY_MS. Called on every read/write. */
function purgeExpired(): void {
  const now = Date.now();
  for (const [id, entry] of store) {
    if (now - entry.createdAt > EXPIRY_MS) store.delete(id);
  }
}

/**
 * Store a generated file and return a unique ID.
 * The file will be available for 10 minutes.
 */
export function storeGenerated(file: Uint8Array, filename: string): string {
  purgeExpired();
  const id = crypto.randomUUID();
  store.set(id, { file, filename, createdAt: Date.now() });
  return id;
}

/**
 * Retrieve a stored file by ID.
 * Returns null if the ID is unknown or the file has expired.
 */
export function getGenerated(id: string): { file: Uint8Array; filename: string } | null {
  purgeExpired();
  const entry = store.get(id);
  if (!entry) return null;
  // Consume on retrieval — each generated file should only be emitted once.
  store.delete(id);
  return { file: entry.file, filename: entry.filename };
}

/**
 * Visible-for-testing: clear all entries.
 */
export function _clearStore(): void {
  store.clear();
}

/**
 * Visible-for-testing: override expiry check for a specific entry.
 * Sets createdAt to a past timestamp so the next purge will remove it.
 */
export function _expireEntry(id: string): void {
  const entry = store.get(id);
  if (entry) entry.createdAt = 0;
}
