import type { BodyType } from "../catalog/types.ts";

export const CHARACTER_FORMAT = "pixygoat.character";
export const CHARACTER_VERSION = 1;

export interface SlotSelection {
  /** catalog item id */
  item: string;
  variant: string;
  /** hidden layers stay in the document but are not drawn or exported */
  visible?: boolean;
  /** variant follows another slot's variant (e.g. head follows body colour) */
  follow?: string;
}

export interface CharacterDocument {
  format: typeof CHARACTER_FORMAT;
  version: number;
  name: string;
  source: { kind: "ulpc"; snapshot: string };
  bodyType: BodyType;
  /** type name -> selection */
  slots: Record<string, SlotSelection>;
  preview?: { animation?: string; direction?: string; zoom?: number };
  export?: {
    unity?: { variantName?: string; targetDir?: string };
    flat?: { targetDir?: string };
  };
  createdAt?: string;
  modifiedAt?: string;
}

export const SNAPSHOT_ID = "e7fa0aee616";

export function newCharacter(name = "unnamed", bodyType: BodyType = "male"): CharacterDocument {
  const now = new Date().toISOString();
  return {
    format: CHARACTER_FORMAT,
    version: CHARACTER_VERSION,
    name,
    source: { kind: "ulpc", snapshot: SNAPSHOT_ID },
    bodyType,
    slots: {},
    createdAt: now,
    modifiedAt: now,
  };
}

export type ValidationResult = { ok: true; doc: CharacterDocument } | { ok: false; error: string };

/** Parses and validates a character document, migrating older versions. */
export function parseCharacter(input: unknown): ValidationResult {
  if (!input || typeof input !== "object") return { ok: false, error: "not an object" };
  const o = input as Record<string, unknown>;
  if (o.format !== CHARACTER_FORMAT) return { ok: false, error: `unknown format ${String(o.format)}` };
  const version = typeof o.version === "number" ? o.version : 0;
  if (version > CHARACTER_VERSION) return { ok: false, error: `document version ${version} is newer than this app` };
  if (typeof o.bodyType !== "string") return { ok: false, error: "bodyType missing" };
  if (!o.slots || typeof o.slots !== "object") return { ok: false, error: "slots missing" };
  const slots: Record<string, SlotSelection> = {};
  for (const [k, v] of Object.entries(o.slots as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const s = v as Record<string, unknown>;
    if (typeof s.item !== "string") continue;
    const sel: SlotSelection = { item: s.item, variant: typeof s.variant === "string" ? s.variant : "" };
    if (s.visible === false) sel.visible = false;
    if (typeof s.follow === "string") sel.follow = s.follow;
    slots[k] = sel;
  }
  const doc: CharacterDocument = {
    format: CHARACTER_FORMAT,
    version: CHARACTER_VERSION,
    name: typeof o.name === "string" && o.name.trim() ? o.name : "unnamed",
    source: { kind: "ulpc", snapshot: (o.source as { snapshot?: string } | undefined)?.snapshot ?? SNAPSHOT_ID },
    bodyType: o.bodyType as BodyType,
    slots,
    ...(o.preview && typeof o.preview === "object" ? { preview: o.preview as CharacterDocument["preview"] } : {}),
    ...(o.export && typeof o.export === "object" ? { export: o.export as CharacterDocument["export"] } : {}),
    ...(typeof o.createdAt === "string" ? { createdAt: o.createdAt } : {}),
    ...(typeof o.modifiedAt === "string" ? { modifiedAt: o.modifiedAt } : {}),
  };
  return { ok: true, doc };
}
