/**
 * License key normalisation. Sheet definitions spell licenses in many ways
 * ("OGA-BY 3.0+", "CC-BY 3.0", "GPL 2.0"); the catalog keeps the original
 * strings in the credits and a normalised key per item for filtering.
 */

export const LICENSE_KEYS = [
  "CC0",
  "CC-BY",
  "CC-BY-SA",
  "OGA-BY",
  "OGA-SA",
  "GPL",
] as const;
export type LicenseKey = (typeof LICENSE_KEYS)[number];

export function normalizeLicense(raw: string): LicenseKey | undefined {
  const s = raw.trim().toUpperCase().replace(/\s+/g, " ");
  if (s.startsWith("CC0")) return "CC0";
  if (s.startsWith("CC-BY-SA") || s.startsWith("CC BY-SA")) return "CC-BY-SA";
  if (s.startsWith("CC-BY") || s.startsWith("CC BY")) return "CC-BY";
  if (s.startsWith("OGA-BY")) return "OGA-BY";
  if (s.startsWith("OGA-SA")) return "OGA-SA";
  if (s.startsWith("GPL") || s.startsWith("LGPL")) return "GPL";
  return undefined;
}

export function licenseVersion(raw: string): string | undefined {
  const m = raw.match(/(\d+(?:\.\d+)?)(\+?)/);
  return m ? `${m[1]}${m[2]}` : undefined;
}
