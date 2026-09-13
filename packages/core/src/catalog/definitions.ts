import {
  BODY_TYPES,
  type BodyType,
  type CatalogItem,
  type CatalogLayer,
  type Credit,
} from "./types.ts";
import { DEFAULT_ANIMATIONS, normalizeAnimationName } from "./animations.ts";
import { normalizeLicense } from "./licenses.ts";

/** Raw shape of a sheet definition JSON file (LPC generator, July 2025). */
export interface RawSheetDefinition {
  name: string;
  type_name: string;
  variants?: string[];
  animations?: string[];
  tags?: string[];
  required_tags?: string[];
  excluded_tags?: string[];
  match_body_color?: boolean;
  replace_in_path?: Record<string, Record<string, string>>;
  preview_row?: number;
  preview_column?: number;
  preview_x_offset?: number;
  preview_y_offset?: number;
  credits?: Partial<Credit>[];
  [key: string]: unknown;
}

interface RawLayer {
  zPos?: number;
  custom_animation?: string;
  is_mask?: boolean;
  [bodyType: string]: unknown;
}

/** Converts a variant name to the file stem used on disk. */
export function variantFileStem(variant: string): string {
  return variant.replaceAll(" ", "_");
}

/** Converts an item name to the key used in `replace_in_path` maps. */
export function replacementKey(itemName: string): string {
  return itemName.replaceAll(" ", "_");
}

/**
 * Parses one definition into a catalog item. Availability (`available`) is
 * filled in later by the server after checking the file system.
 */
export function parseDefinition(id: string, raw: RawSheetDefinition): CatalogItem {
  const layers: CatalogLayer[] = [];
  for (let i = 1; i < 10; i++) {
    const layer = raw[`layer_${i}`] as RawLayer | undefined;
    if (!layer) break;
    const paths: Partial<Record<BodyType, string>> = {};
    for (const bt of BODY_TYPES) {
      const p = layer[bt];
      if (typeof p === "string" && p !== "") paths[bt] = p.replace(/\/+$/, "");
    }
    const entry: CatalogLayer = {
      index: i,
      zPos: typeof layer.zPos === "number" ? layer.zPos : 100,
      paths,
    };
    if (typeof layer.custom_animation === "string") entry.customAnimation = layer.custom_animation;
    if (layer.is_mask === true) entry.isMask = true;
    layers.push(entry);
  }

  const first = layers[0];
  const bodyTypes = first ? (Object.keys(first.paths) as BodyType[]) : [];

  const declared = raw.animations ?? DEFAULT_ANIMATIONS;
  const animations = Array.from(
    new Set(declared.map(normalizeAnimationName).filter((a): a is string => !!a)),
  );

  const credits: Credit[] = (raw.credits ?? []).map((c) => ({
    file: c.file ?? "",
    notes: c.notes ?? "",
    authors: c.authors ?? [],
    licenses: c.licenses ?? [],
    urls: c.urls ?? [],
  }));

  const licenses = Array.from(
    new Set(
      credits
        .flatMap((c) => c.licenses)
        .map(normalizeLicense)
        .filter((l): l is NonNullable<typeof l> => !!l),
    ),
  );

  return {
    id,
    name: raw.name,
    typeName: raw.type_name,
    tags: raw.tags ?? [],
    requiredTags: raw.required_tags ?? [],
    excludedTags: raw.excluded_tags ?? [],
    bodyTypes,
    variants: raw.variants ?? [],
    matchBodyColor: raw.match_body_color === true,
    animations,
    layers,
    credits,
    licenses,
    preview: {
      row: raw.preview_row ?? 2,
      column: raw.preview_column ?? 0,
      xOffset: raw.preview_x_offset ?? 0,
      yOffset: raw.preview_y_offset ?? 0,
    },
    ...(raw.replace_in_path ? { replaceInPath: raw.replace_in_path } : {}),
    available: false,
  };
}
