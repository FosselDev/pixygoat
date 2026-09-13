import licensesJson from "../../../../data/licenses.json";
import type { CatalogItem } from "../catalog/types.ts";
import type { LicenseKey } from "../catalog/licenses.ts";

export interface LicenseInfo {
  name: string;
  url: string;
  strictness: number;
  commercial: boolean;
  modify: boolean;
  attribution: boolean;
  shareAlike: boolean;
  copyleft: boolean;
  summary: Record<string, string>;
  obligations: Record<string, string[]>;
}

export const LICENSES: Record<string, LicenseInfo> = licensesJson.licenses as Record<string, LicenseInfo>;

export function licenseInfo(key: string): LicenseInfo | undefined {
  return LICENSES[key];
}

/** The least demanding license an item offers (items are multi-licensed: pick any). */
export function bestLicense(item: CatalogItem): LicenseKey | undefined {
  let best: LicenseKey | undefined;
  for (const k of item.licenses) {
    const info = LICENSES[k];
    if (!info) continue;
    if (!best || info.strictness < LICENSES[best]!.strictness) best = k as LicenseKey;
  }
  return best;
}

/** Whether an item may be used given a set of allowed license keys. */
export function itemAllowed(item: CatalogItem, allowed: ReadonlySet<string>): boolean {
  if (item.licenses.length === 0) return true;
  return item.licenses.some((l) => allowed.has(l));
}

export interface ItemLicenseRow {
  item: CatalogItem;
  /** license used for the analysis */
  chosen: LicenseKey | undefined;
  /** all options the item offers */
  options: string[];
}

export interface CharacterLicenseAnalysis {
  rows: ItemLicenseRow[];
  /** the strictest of the chosen licenses; what the combination effectively is */
  effective: LicenseKey | undefined;
  commercial: boolean;
  modify: boolean;
  attribution: boolean;
  shareAlike: boolean;
  copyleft: boolean;
  /** items whose only option is GPL */
  gplOnly: CatalogItem[];
  authors: string[];
}

/**
 * Combines the licenses of every used item. Each item contributes its least
 * demanding option; the obligations of the combination are the union.
 */
export function analyzeCharacter(items: CatalogItem[]): CharacterLicenseAnalysis {
  const rows: ItemLicenseRow[] = items.map((item) => ({ item, chosen: bestLicense(item), options: item.licenses }));
  let effective: LicenseKey | undefined;
  const flags = { commercial: true, modify: true, attribution: false, shareAlike: false, copyleft: false };
  for (const r of rows) {
    if (!r.chosen) continue;
    const info = LICENSES[r.chosen]!;
    if (!effective || info.strictness > LICENSES[effective]!.strictness) effective = r.chosen;
    flags.commercial &&= info.commercial;
    flags.modify &&= info.modify;
    flags.attribution ||= info.attribution;
    flags.shareAlike ||= info.shareAlike;
    flags.copyleft ||= info.copyleft;
  }
  const gplOnly = items.filter((i) => i.licenses.length > 0 && i.licenses.every((l) => l === "GPL"));
  const authors = Array.from(new Set(items.flatMap((i) => i.credits.flatMap((c) => c.authors)))).sort((a, b) => a.localeCompare(b));
  return { rows, effective, ...flags, gplOnly, authors };
}
