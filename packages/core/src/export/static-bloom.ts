/**
 * Planning of the Static-Bloom paper-doll export: which LPC layers end up in
 * which Mana-Seed slot sheet, which pages exist and what the manifest says.
 * Rendering happens in the app; this module only decides.
 */
import slotMappingJson from "../../../../data/slot-mapping.json";
import { ANIMATIONS, CUSTOM_ANIMATIONS, getAnimation } from "../catalog/animations.ts";
import type { CatalogItem } from "../catalog/types.ts";
import { customLayoutFor, type DrawLayer } from "../compose/compose.ts";

export interface SlotMapping {
  back: string;
  default: string;
  bodyZPos: number;
  slots: Record<string, string[]>;
  slotOrder: string[];
}

export const SLOT_MAPPING: SlotMapping = slotMappingJson as SlotMapping;

const typeToSlot = new Map<string, string>();
for (const [slot, types] of Object.entries(SLOT_MAPPING.slots)) for (const t of types) typeToSlot.set(t, slot);

/** Static-Bloom slot for an LPC type name (front layers). */
export function slotForType(typeName: string, overrides?: Record<string, string>): string {
  return overrides?.[typeName] ?? typeToSlot.get(typeName) ?? SLOT_MAPPING.default;
}

export interface ExportSlotInput {
  /** LPC type name */
  type: string;
  item: CatalogItem;
  variant: string;
  layers: DrawLayer[];
}

export interface PageSpec {
  /** page code as used in file names; no underscores */
  code: string;
  animation: string;
  /** custom layout id when the page uses oversize cells */
  layout: string | null;
  cellSize: number;
  columns: number;
  rows: number;
}

export interface SheetSpec {
  page: PageSpec;
  slot: string;
  layers: DrawLayer[];
  /** relative output path */
  file: string;
}

export interface StaticBloomManifest {
  format: "pixygoat.static-bloom";
  version: 1;
  generator: string;
  variant: string;
  character: string;
  bodyType: string;
  cellSize: number;
  pages: Record<string, { animation: string; layout: string | null; cellSize: number; columns: number; rows: number; directions: string[] | null }>;
  slots: Record<string, { file: string; parts: string[] }[]>;
  /** per slot: draw order for every frame of every page ("*" = all pages) */
  drawOrder: Record<string, Record<string, number | number[]>>;
  hides: Record<string, string[]>;
  /** slot -> page codes in which the slot has no content */
  missing: Record<string, string[]>;
  files: string[];
  credits: string;
}

export interface StaticBloomPlan {
  variant: string;
  pages: PageSpec[];
  sheets: SheetSpec[];
  manifest: StaticBloomManifest;
}

export interface StaticBloomOptions {
  variantName: string;
  characterName: string;
  bodyType: string;
  animations: string[];
  /** keep every LPC layer as its own sheet instead of merging into 8 slots */
  perLayer?: boolean;
  slotOverrides?: Record<string, string>;
  mapping?: SlotMapping;
}

export function sanitizeVariantName(name: string): string {
  const s = name.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
  return s || "character";
}

export function pageCodeFor(animation: string, layout: string | null): string {
  const base = animation.replace(/[^A-Za-z0-9]/g, "");
  if (!layout) return base;
  const size = CUSTOM_ANIMATIONS[layout]?.frameSize ?? 0;
  return `${base}${size}`;
}

/** Builds the export plan. Layers must belong to visible slots only. */
export function planStaticBloom(slots: ExportSlotInput[], opts: StaticBloomOptions): StaticBloomPlan {
  const mapping = opts.mapping ?? SLOT_MAPPING;
  const variant = sanitizeVariantName(opts.variantName);
  const allLayers = slots.flatMap((s) => s.layers);

  // slot assignment per layer
  const layerSlot = new Map<string, string>();
  const layerPart = new Map<string, string>();
  for (const s of slots) {
    for (const l of s.layers) {
      layerPart.set(l.id, `${s.type}:${s.item.id}:${s.variant}`);
      if (opts.perLayer) {
        layerSlot.set(l.id, l.id.replace(/[^A-Za-z0-9]/g, "").toLowerCase());
        continue;
      }
      const behind = l.zPos < mapping.bodyZPos && s.type !== "body";
      layerSlot.set(l.id, behind ? mapping.back : slotForType(s.type, opts.slotOverrides));
    }
  }

  const pages: PageSpec[] = [];
  const sheets: SheetSpec[] = [];
  const manifestSlots: StaticBloomManifest["slots"] = {};
  const missing: Record<string, Set<string>> = {};
  const slotsUsed = new Set(layerSlot.values());

  for (const animId of opts.animations) {
    const anim = getAnimation(animId);
    if (!anim) continue;
    const layout = customLayoutFor(allLayers, animId) ?? null;
    const custom = layout ? CUSTOM_ANIMATIONS[layout] : undefined;
    const page: PageSpec = custom
      ? { code: pageCodeFor(animId, layout), animation: animId, layout, cellSize: custom.frameSize, columns: custom.frames[0]?.length ?? 0, rows: custom.frames.length }
      : { code: pageCodeFor(animId, null), animation: animId, layout: null, cellSize: 64, columns: anim.columns, rows: anim.rows };
    pages.push(page);

    for (const slot of slotsUsed) {
      const layers = allLayers.filter((l) => layerSlot.get(l.id) === slot && layerHasContent(l, animId, layout));
      if (layers.length === 0) {
        (missing[slot] ??= new Set()).add(page.code);
        continue;
      }
      const file = `Sheets/char_a_${page.code}_${slot}_${variant}_v01.png`;
      sheets.push({ page, slot, layers, file });
      (manifestSlots[slot] ??= []).push({ file, parts: Array.from(new Set(layers.map((l) => layerPart.get(l.id)!))) });
    }
  }

  const drawOrder: StaticBloomManifest["drawOrder"] = {};
  if (!opts.perLayer && slotsUsed.has(mapping.back)) drawOrder[mapping.back] = { "*": -1 };
  if (opts.perLayer) {
    // per-layer export: keep LPC z order as the draw order relative to the body (0)
    for (const s of slots) for (const l of s.layers) drawOrder[layerSlot.get(l.id)!] = { "*": l.zPos - mapping.bodyZPos };
  }

  const manifest: StaticBloomManifest = {
    format: "pixygoat.static-bloom",
    version: 1,
    generator: "PixyGoat 0.1.0",
    variant,
    character: opts.characterName,
    bodyType: opts.bodyType,
    cellSize: 64,
    pages: Object.fromEntries(
      pages.map((p) => [
        p.code,
        { animation: p.animation, layout: p.layout, cellSize: p.cellSize, columns: p.columns, rows: p.rows, directions: p.rows === 4 ? ["up", "left", "down", "right"] : null },
      ]),
    ),
    slots: manifestSlots,
    drawOrder,
    hides: {},
    missing: Object.fromEntries(Object.entries(missing).map(([k, v]) => [k, [...v]])),
    files: sheets.map((s) => s.file),
    credits: "CREDITS.txt",
  };
  return { variant, pages, sheets, manifest };
}

function layerHasContent(l: DrawLayer, animation: string, layout: string | null): boolean {
  if (l.customAnimation) {
    if (!l.customSheet) return false;
    const def = CUSTOM_ANIMATIONS[l.customAnimation];
    return !!def && def.frames[0]?.[0]?.animation === animation && (layout === null || CUSTOM_ANIMATIONS[layout] !== undefined);
  }
  if (layout) {
    const def = CUSTOM_ANIMATIONS[layout]!;
    return def.frames.some((row) => row.some((f) => !!l.sheets[f.animation]));
  }
  return !!l.sheets[animation];
}

export const ALL_ANIMATION_IDS = ANIMATIONS.map((a) => a.id);
