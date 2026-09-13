/**
 * Catalog data model.
 *
 * The catalog is built once by the server from the sheet definitions and the
 * real spritesheet directory. Everything the app needs to decide what can be
 * shown, combined and exported lives here; nothing in the app touches the file
 * system or guesses paths.
 */

export const BODY_TYPES = [
  "male",
  "female",
  "teen",
  "child",
  "muscular",
  "pregnant",
] as const;
export type BodyType = (typeof BODY_TYPES)[number];

export const DIRECTIONS = ["up", "left", "down", "right"] as const;
export type Direction = (typeof DIRECTIONS)[number];

export interface AnimationDef {
  id: string;
  label: string;
  columns: number;
  rows: number;
  cycle: number[];
  frameMs: number;
  universalRow: number;
  aliases: string[];
}

export interface CustomAnimationFrame {
  animation: string;
  direction: Direction;
  frame: number;
}

export interface CustomAnimationDef {
  frameSize: number;
  skipFirstFrameInPreview: boolean;
  /** rows (one per direction) of source-frame references */
  frames: CustomAnimationFrame[][];
}

export interface Credit {
  file: string;
  notes: string;
  authors: string[];
  licenses: string[];
  urls: string[];
}

/** One sheet directory on disk, e.g. `hair/messy1/adult`. */
export interface SheetDir {
  /**
   * Standard animations found as sub-directories: animation id -> sheet info.
   * `v` indexes the catalog's variant table; `w`/`h` are the sheet pixel size.
   */
  anims: Record<string, SheetInfo>;
  /** Files directly in the directory (custom-animation sheets): variant table indices. */
  files?: SheetInfo;
}

export interface SheetInfo {
  w: number;
  h: number;
  v: number[];
}

export interface CatalogLayer {
  /** 1-based layer number as in the definition */
  index: number;
  zPos: number;
  customAnimation?: string;
  /**
   * Sheet directory per body type, without trailing slash. May contain
   * `${name}` placeholders that `replaceInPath` resolves.
   */
  paths: Partial<Record<BodyType, string>>;
  /** True when this layer is a transparency mask rather than art. */
  isMask?: boolean;
}

export interface PreviewHint {
  row: number;
  column: number;
  xOffset: number;
  yOffset: number;
}

export interface CatalogItem {
  /** definition file stem, unique */
  id: string;
  name: string;
  /** slot key; one item per type may be worn */
  typeName: string;
  tags: string[];
  requiredTags: string[];
  excludedTags: string[];
  bodyTypes: BodyType[];
  variants: string[];
  matchBodyColor: boolean;
  /** declared animations, normalised to animation ids */
  animations: string[];
  layers: CatalogLayer[];
  credits: Credit[];
  /** normalised license keys, e.g. "CC-BY-SA" */
  licenses: string[];
  preview: PreviewHint;
  replaceInPath?: Record<string, Record<string, string>>;
  /** at least one sheet exists on disk for this item */
  available: boolean;
  /** true for directories found on disk that no definition describes */
  unlisted?: boolean;
}

export interface CatalogMeta {
  format: "pixygoat.catalog";
  version: number;
  builtAt: string;
  spritesRoot: string;
  fingerprint: string;
  definitionCount: number;
  itemCount: number;
  sheetDirCount: number;
  buildMs: number;
}

export interface Catalog {
  meta: CatalogMeta;
  animations: AnimationDef[];
  customAnimations: Record<string, CustomAnimationDef>;
  /** variant name table; SheetInfo.v indexes into it */
  variantTable: string[];
  items: CatalogItem[];
  /** sheet directories keyed by path relative to the sprites root */
  sheets: Record<string, SheetDir>;
}
