import type {
  BodyType,
  Catalog,
  CatalogItem,
  CatalogLayer,
  SheetDir,
  SheetInfo,
} from "./types.ts";
import { replacementKey, variantFileStem } from "./definitions.ts";
import { CUSTOM_ANIMATIONS } from "./animations.ts";

/**
 * Context for `${placeholder}` substitution in layer paths. `replace_in_path`
 * maps a type name (e.g. "head") to a table keyed by the *name* of the item
 * currently selected in that slot.
 */
export interface ResolveContext {
  /** selected item name per type name, spaces replaced by "_" */
  selectedNames: Record<string, string>;
}

export interface ResolvedSheet {
  /** sprite path relative to the sprites root, e.g. "hair/messy1/adult/walk/black.png" */
  path: string;
  width: number;
  height: number;
}

export interface ResolvedLayer {
  layer: CatalogLayer;
  /** sheet directory used for this body type (placeholders substituted) */
  dir: string;
  zPos: number;
  customAnimation?: string;
  /** standard animation id -> sheet, only for animations that exist on disk for this variant */
  sheets: Record<string, ResolvedSheet>;
  /** custom-animation sheet, when the layer is a custom animation and the file exists */
  customSheet?: ResolvedSheet;
  isMask: boolean;
}

/** Substitutes `${var}` placeholders in a layer path using the selection context. */
export function substitutePath(
  path: string,
  item: CatalogItem,
  ctx: ResolveContext,
): string | undefined {
  if (!path.includes("${")) return path;
  const table = item.replaceInPath ?? {};
  let out = path;
  for (const [variable, mapping] of Object.entries(table)) {
    const token = "${" + variable + "}";
    if (!out.includes(token)) continue;
    const selected = ctx.selectedNames[variable] ?? "none";
    const value = mapping[selected] ?? mapping[replacementKey(selected)];
    if (value === undefined || value === "none") return undefined;
    out = out.replaceAll(token, value);
  }
  return out.includes("${") ? undefined : out;
}

function variantIndex(catalog: Catalog, variant: string): number {
  return catalog.variantTable.indexOf(variantFileStem(variant));
}

function hasVariant(info: SheetInfo | undefined, idx: number): info is SheetInfo {
  return !!info && idx >= 0 && info.v.includes(idx);
}

/**
 * Resolves the sheets of every layer of an item for a body type and variant.
 * Only sheets that exist on disk are returned, so the result doubles as the
 * item's real animation coverage.
 */
export function resolveItem(
  catalog: Catalog,
  item: CatalogItem,
  bodyType: BodyType,
  variant: string,
  ctx: ResolveContext,
): ResolvedLayer[] {
  const stem = variantFileStem(variant);
  const vIdx = variantIndex(catalog, variant);
  const out: ResolvedLayer[] = [];
  for (const layer of item.layers) {
    const raw = layer.paths[bodyType];
    if (!raw) continue;
    const dir = substitutePath(raw, item, ctx);
    if (!dir) continue;
    const sheetDir: SheetDir | undefined = catalog.sheets[dir];
    if (!sheetDir) continue;
    const resolved: ResolvedLayer = {
      layer,
      dir,
      zPos: layer.zPos,
      sheets: {},
      isMask: layer.isMask === true,
    };
    if (layer.customAnimation) {
      resolved.customAnimation = layer.customAnimation;
      if (hasVariant(sheetDir.files, vIdx) && CUSTOM_ANIMATIONS[layer.customAnimation]) {
        resolved.customSheet = {
          path: `${dir}/${stem}.png`,
          width: sheetDir.files.w,
          height: sheetDir.files.h,
        };
      }
    } else {
      for (const [anim, info] of Object.entries(sheetDir.anims)) {
        if (hasVariant(info, vIdx)) {
          resolved.sheets[anim] = { path: `${dir}/${anim}/${stem}.png`, width: info.w, height: info.h };
        }
      }
    }
    out.push(resolved);
  }
  return out;
}

/** Animation ids for which at least one layer of the item has a sheet. */
export function coveredAnimations(layers: ResolvedLayer[]): Set<string> {
  const set = new Set<string>();
  for (const l of layers) {
    for (const anim of Object.keys(l.sheets)) set.add(anim);
    if (l.customSheet && l.customAnimation) {
      const base = CUSTOM_ANIMATIONS[l.customAnimation]?.frames[0]?.[0]?.animation;
      if (base) set.add(base);
    }
  }
  return set;
}

/**
 * Variants that exist on disk for an item and body type (union over layers).
 * Items whose definition lists no variants (single sheet) return [""].
 */
export function availableVariants(
  catalog: Catalog,
  item: CatalogItem,
  bodyType: BodyType,
  ctx: ResolveContext,
): string[] {
  const found = new Set<string>();
  for (const layer of item.layers) {
    const raw = layer.paths[bodyType];
    if (!raw) continue;
    const dir = substitutePath(raw, item, ctx);
    if (!dir) continue;
    const sheetDir = catalog.sheets[dir];
    if (!sheetDir) continue;
    const infos = [...Object.values(sheetDir.anims), ...(sheetDir.files ? [sheetDir.files] : [])];
    for (const info of infos) for (const vi of info.v) {
      const name = catalog.variantTable[vi];
      if (name !== undefined) found.add(name);
    }
  }
  // keep definition order, then any extra variants found on disk
  const ordered = item.variants.filter((v) => found.has(variantFileStem(v)));
  for (const v of found) if (!item.variants.some((d) => variantFileStem(d) === v)) ordered.push(v);
  return ordered;
}

/** Whether the item has any sheet for the body type (with the given context). */
export function isAvailableFor(
  catalog: Catalog,
  item: CatalogItem,
  bodyType: BodyType,
  ctx: ResolveContext,
): boolean {
  return availableVariants(catalog, item, bodyType, ctx).length > 0;
}
