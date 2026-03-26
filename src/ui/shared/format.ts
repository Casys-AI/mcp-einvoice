/**
 * Shared formatting utilities for viewers.
 */

/**
 * Format a postal address object into a human-readable string.
 * Returns "—" (em-dash) if no parts are present.
 */
export function formatAddress(addr: {
  street?: string;
  city?: string;
  postalCode?: string;
  country?: string;
}): string {
  const parts: string[] = [];
  if (addr.street) parts.push(addr.street);
  if (addr.postalCode || addr.city) {
    parts.push([addr.postalCode, addr.city].filter(Boolean).join(" "));
  }
  if (addr.country) parts.push(addr.country);
  return parts.join(", ") || "\u2014";
}
