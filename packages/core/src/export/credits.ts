import type { CatalogItem, Credit } from "../catalog/types.ts";

export interface CreditLine extends Credit {
  itemName: string;
}

/** Collects the credits of the used items, de-duplicated by file. */
export function collectCredits(items: CatalogItem[]): CreditLine[] {
  const seen = new Set<string>();
  const out: CreditLine[] = [];
  for (const it of items) {
    for (const c of it.credits) {
      const key = `${c.file}|${c.authors.join(",")}|${c.licenses.join(",")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...c, itemName: it.name });
    }
  }
  return out;
}

export function creditsText(lines: CreditLine[], header = "Sprites composed with PixyGoat from the Universal LPC Spritesheet Character Generator assets."): string {
  const parts = [header, "", "Each entry lists the sprite files used, their authors, licenses and source links.", ""];
  for (const c of lines) {
    parts.push(`${c.file} (${c.itemName})`);
    if (c.notes) parts.push(`\t- Note: ${c.notes}`);
    parts.push("\t- Licenses:");
    for (const l of c.licenses) parts.push(`\t\t- ${l}`);
    parts.push("\t- Authors:");
    for (const a of c.authors) parts.push(`\t\t- ${a}`);
    parts.push("\t- Links:");
    for (const u of c.urls) parts.push(`\t\t- ${u}`);
    parts.push("");
  }
  return parts.join("\n");
}

function csv(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}

export function creditsCsv(lines: CreditLine[]): string {
  const rows = ["filename,notes,authors,licenses,urls"];
  for (const c of lines) rows.push([c.file, c.notes, c.authors.join(", "), c.licenses.join(", "), c.urls.join(", ")].map(csv).join(","));
  return rows.join("\n") + "\n";
}

/** All distinct authors of the used items. */
export function allAuthors(lines: CreditLine[]): string[] {
  return Array.from(new Set(lines.flatMap((c) => c.authors))).sort((a, b) => a.localeCompare(b));
}
