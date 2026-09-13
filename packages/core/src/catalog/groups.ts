import slotGroupsJson from "../../../../data/slot-groups.json";
import type { CatalogItem } from "./types.ts";

export interface SlotGroup {
  id: string;
  primary: string[];
  more: string[];
}

export const SLOT_GROUPS: SlotGroup[] = slotGroupsJson.groups;

/** Every type name that has a place in a group, in stack order. */
export function groupedTypeNames(): string[] {
  return SLOT_GROUPS.flatMap((g) => [...g.primary, ...g.more]);
}

/**
 * Sub-category of an item inside its type, derived from the item id: the
 * first id segment after the prefix shared by all items of the type, when it
 * is shared by at least two items. Used for the filter chips of the catalog.
 */
export function deriveSubcategories(items: CatalogItem[]): Map<string, string> {
  const result = new Map<string, string>();
  const byType = new Map<string, CatalogItem[]>();
  for (const it of items) {
    const list = byType.get(it.typeName) ?? [];
    list.push(it);
    byType.set(it.typeName, list);
  }
  for (const list of byType.values()) {
    if (list.length < 4) continue;
    const segs = list.map((i) => i.id.split("_"));
    // common prefix length in segments
    let prefix = 0;
    while (segs.every((s) => s.length > prefix + 1 && s[prefix] === segs[0]![prefix])) prefix++;
    const counts = new Map<string, number>();
    for (const s of segs) {
      const key = s[prefix];
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const groups = new Set([...counts.entries()].filter(([, n]) => n >= 2).map(([k]) => k));
    if (groups.size < 2) continue;
    list.forEach((it, i) => {
      const key = segs[i]![prefix];
      if (key && groups.has(key)) result.set(it.id, key);
    });
  }
  return result;
}
