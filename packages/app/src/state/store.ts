import { signal, computed, batch } from "@preact/signals";
import {
  availableVariants,
  coveredAnimations,
  deriveSubcategories,
  newCharacter,
  replacementKey,
  resolveItem,
  sortLayers,
  toDrawLayers,
  ANIMATIONS,
  BODY_TYPES,
  LICENSE_KEYS,
  type BodyType,
  type Catalog,
  type CatalogItem,
  type CharacterDocument,
  type Direction,
  type DrawLayer,
  type ResolveContext,
  type SlotSelection,
} from "@pixygoat/core";

// ---------------------------------------------------------------------------
// Catalog

export const catalog = signal<Catalog | null>(null);
export const catalogStatus = signal<{ state: "loading" | "building" | "ready" | "error"; message?: string }>({ state: "loading" });

export const itemsById = computed(() => {
  const map = new Map<string, CatalogItem>();
  for (const it of catalog.value?.items ?? []) map.set(it.id, it);
  return map;
});

export const itemsByType = computed(() => {
  const map = new Map<string, CatalogItem[]>();
  for (const it of catalog.value?.items ?? []) {
    const list = map.get(it.typeName) ?? [];
    list.push(it);
    map.set(it.typeName, list);
  }
  return map;
});

export const subcategoryOf = computed(() => deriveSubcategories(catalog.value?.items ?? []));

// ---------------------------------------------------------------------------
// Character document with undo/redo

export const doc = signal<CharacterDocument>(newCharacter());
export const dirty = signal(false);
const undoStack: string[] = [];
const redoStack: string[] = [];
export const canUndo = signal(false);
export const canRedo = signal(false);

function snapshot(): string {
  return JSON.stringify(doc.value);
}

/** Applies a change to the document, recording an undo step. */
export function update(mutate: (d: CharacterDocument) => void) {
  const before = snapshot();
  const next = JSON.parse(before) as CharacterDocument;
  mutate(next);
  next.modifiedAt = new Date().toISOString();
  const after = JSON.stringify(next);
  if (after === before) return;
  undoStack.push(before);
  if (undoStack.length > 200) undoStack.shift();
  redoStack.length = 0;
  batch(() => {
    doc.value = next;
    dirty.value = true;
    canUndo.value = true;
    canRedo.value = false;
  });
}

export function undo() {
  const prev = undoStack.pop();
  if (prev === undefined) return;
  redoStack.push(snapshot());
  batch(() => {
    doc.value = JSON.parse(prev);
    dirty.value = true;
    canUndo.value = undoStack.length > 0;
    canRedo.value = true;
  });
}

export function redo() {
  const next = redoStack.pop();
  if (next === undefined) return;
  undoStack.push(snapshot());
  batch(() => {
    doc.value = JSON.parse(next);
    dirty.value = true;
    canUndo.value = true;
    canRedo.value = redoStack.length > 0;
  });
}

/** Replaces the document without an undo step (load, new). */
export function replaceDocument(d: CharacterDocument, markDirty = false) {
  undoStack.length = 0;
  redoStack.length = 0;
  batch(() => {
    doc.value = d;
    dirty.value = markDirty;
    canUndo.value = false;
    canRedo.value = false;
  });
}

// ---------------------------------------------------------------------------
// UI state

export type Background = "checker" | "green" | "dark" | "light";

export const ui = {
  selectedSlot: signal<string>("hair"),
  animation: signal<string>("walk"),
  direction: signal<Direction>("down"),
  allDirections: signal(false),
  zoom: signal(6),
  playing: signal(true),
  speed: signal(1),
  background: signal<Background>("checker"),
  grid: signal(false),
  explode: signal(false),
  search: signal(""),
  searchAllSlots: signal(false),
  onlyMatching: signal(true),
  subcategory: signal<string>(""),
  showUnlisted: signal(false),
  dialog: signal<null | "load" | "save" | "export" | "licenses">(null),
  toast: signal<{ text: string; kind: "info" | "warn" | "error" } | null>(null),
  expandedGroups: signal<Record<string, boolean>>({}),
};

// Allowed licenses for the catalog filter (persisted). Items offering none of
// them are greyed out, never hidden.
function loadAllowed(): Set<string> {
  try {
    const raw = localStorage.getItem("pixygoat.licenses");
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {
    /* ignore */
  }
  return new Set(LICENSE_KEYS);
}
export const allowedLicenses = signal<Set<string>>(loadAllowed());
export function setAllowedLicenses(set: Set<string>) {
  allowedLicenses.value = set;
  try {
    localStorage.setItem("pixygoat.licenses", JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}
export const licenseFilterActive = computed(() => allowedLicenses.value.size < LICENSE_KEYS.length);

let toastTimer: number | undefined;
export function toast(text: string, kind: "info" | "warn" | "error" = "info", ms = 4000) {
  ui.toast.value = { text, kind };
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (ui.toast.value = null), ms);
}

// ---------------------------------------------------------------------------
// Derived: resolution context, effective variants, draw layers

/** Names of selected items per type, for `${placeholder}` substitution. */
export const resolveContext = computed<ResolveContext>(() => {
  const names: Record<string, string> = {};
  const items = itemsById.value;
  for (const [type, sel] of Object.entries(doc.value.slots)) {
    const it = items.get(sel.item);
    if (it) names[type] = replacementKey(it.name);
  }
  return { selectedNames: names };
});

/** The variant actually used for a slot, honouring `follow`. */
export function effectiveVariant(type: string, sel: SlotSelection, d: CharacterDocument = doc.value): string {
  if (sel.follow) {
    const src = d.slots[sel.follow];
    if (src) {
      const item = itemsById.value.get(sel.item);
      const target = effectiveVariantNoFollow(src);
      if (item && item.variants.includes(target)) return target;
    }
  }
  return sel.variant;
}

function effectiveVariantNoFollow(sel: SlotSelection): string {
  return sel.variant;
}

export interface SlotState {
  type: string;
  selection: SlotSelection;
  item: CatalogItem | undefined;
  variant: string;
  layers: DrawLayer[];
  /** animations covered by at least one layer of this slot */
  covered: Set<string>;
  visible: boolean;
}

/** Per-slot resolution for the current body type. */
export const slotStates = computed<SlotState[]>(() => {
  const cat = catalog.value;
  if (!cat) return [];
  const d = doc.value;
  const ctx = resolveContext.value;
  const out: SlotState[] = [];
  for (const [type, sel] of Object.entries(d.slots)) {
    const item = itemsById.value.get(sel.item);
    const variant = effectiveVariant(type, sel, d);
    const visible = sel.visible !== false;
    if (!item) {
      out.push({ type, selection: sel, item: undefined, variant, layers: [], covered: new Set(), visible });
      continue;
    }
    const resolved = resolveItem(cat, item, d.bodyType, variant, ctx);
    out.push({
      type,
      selection: sel,
      item,
      variant,
      layers: toDrawLayers(resolved, item.id),
      covered: coveredAnimations(resolved),
      visible,
    });
  }
  return out;
});

/** Sorted draw layers of all visible slots. */
export const drawLayers = computed<DrawLayer[]>(() =>
  sortLayers(slotStates.value.filter((s) => s.visible).flatMap((s) => s.layers)),
);

/** Animations covered by every visible slot, and which slots miss which. */
export const coverage = computed(() => {
  const missing = new Map<string, string[]>(); // slot type -> animations missing
  const animIds = ANIMATIONS.map((a) => a.id);
  for (const s of slotStates.value) {
    if (!s.visible || !s.item) continue;
    const miss = animIds.filter((a) => !s.covered.has(a));
    if (miss.length) missing.set(s.type, miss);
  }
  return missing;
});

// ---------------------------------------------------------------------------
// Selection commands

const FOLLOW_BODY_TYPES = new Set(["head", "nose", "ears", "ears_inner", "furry_ears_skin", "wrinkes", "eyebrows", "prosthesis_hand", "prosthesis_leg"]);
const FOLLOW_HAIR_TYPES = new Set(["beard", "mustache", "hairextl", "hairextr", "ponytail", "updo", "eyebrows"]);

export function defaultFollowFor(type: string, item: CatalogItem): string | undefined {
  if (item.matchBodyColor && type !== "body" && (FOLLOW_BODY_TYPES.has(type) || item.variants.includes("light"))) return "body";
  if (FOLLOW_HAIR_TYPES.has(type)) return "hair";
  return undefined;
}

export function selectItem(type: string, item: CatalogItem | null, variant?: string) {
  update((d) => {
    if (!item) {
      delete d.slots[type];
      return;
    }
    const cat = catalog.value!;
    const ctx = resolveContext.value;
    const variants = availableVariants(cat, item, d.bodyType, ctx);
    const prev = d.slots[type];
    let v = variant ?? (prev && variants.includes(prev.variant) ? prev.variant : variants[0] ?? "");
    const sel: SlotSelection = { item: item.id, variant: v };
    const follow = prev?.follow ?? defaultFollowFor(type, item);
    if (follow && d.slots[follow]) sel.follow = follow;
    if (prev?.visible === false) sel.visible = false;
    d.slots[type] = sel;
  });
}

export function selectVariant(type: string, variant: string) {
  update((d) => {
    const sel = d.slots[type];
    if (!sel) return;
    sel.variant = variant;
    delete sel.follow;
  });
}

export function setFollow(type: string, follow: string | undefined) {
  update((d) => {
    const sel = d.slots[type];
    if (!sel) return;
    if (follow) sel.follow = follow;
    else delete sel.follow;
  });
}

export function toggleVisible(type: string) {
  update((d) => {
    const sel = d.slots[type];
    if (!sel) return;
    if (sel.visible === false) delete sel.visible;
    else sel.visible = false;
  });
}

export function setBodyType(bodyType: BodyType): string[] {
  const dropped: string[] = [];
  update((d) => {
    d.bodyType = bodyType;
    const cat = catalog.value!;
    const ctx = resolveContext.value;
    for (const [type, sel] of Object.entries(d.slots)) {
      const item = itemsById.value.get(sel.item);
      if (!item) continue;
      const variants = availableVariants(cat, item, bodyType, ctx);
      if (variants.length === 0) {
        dropped.push(item.name);
        delete d.slots[type];
      } else if (!variants.includes(sel.variant)) {
        sel.variant = variants[0]!;
      }
    }
  });
  return dropped;
}

export function setName(name: string) {
  update((d) => {
    d.name = name;
  });
}

/** Default starter character. */
export function starterCharacter(bodyType: BodyType = "male"): CharacterDocument {
  const d = newCharacter("new_character", bodyType);
  const cat = catalog.value;
  if (!cat) return d;
  const ctxOf = (): ResolveContext => {
    const names: Record<string, string> = {};
    for (const [type, sel] of Object.entries(d.slots)) {
      const it = itemsById.value.get(sel.item);
      if (it) names[type] = replacementKey(it.name);
    }
    return { selectedNames: names };
  };
  const pick = (type: string, id: string, variant: string, follow?: string) => {
    const item = itemsById.value.get(id);
    if (!item) return;
    const vs = availableVariants(cat, item, bodyType, ctxOf());
    if (vs.length === 0) return;
    const sel: SlotSelection = { item: id, variant: vs.includes(variant) ? variant : vs[0]! };
    if (follow) sel.follow = follow;
    d.slots[type] = sel;
  };
  pick("body", "body", "light");
  pick("head", bodyType === "female" || bodyType === "pregnant" ? "heads_human_female" : bodyType === "child" ? "heads_human_child" : "heads_human_male", "light", "body");
  pick("eye_color", "eye_color", "blue");
  pick("clothes", "torso_clothes_tshirt", "navy");
  pick("legs", bodyType === "child" ? "legs_childpants" : "legs_pants2", "bluegray");
  pick("shoes", "feet_shoes_basic", "brown");
  return d;
}

/** Random character: random item per primary slot with some probability. */
export function randomize() {
  const cat = catalog.value;
  if (!cat) return;
  const rnd = <T>(arr: T[]): T | undefined => arr[Math.floor(Math.random() * arr.length)];
  update((d) => {
    const ctx: ResolveContext = {
      get selectedNames() {
        const names: Record<string, string> = {};
        for (const [type, sel] of Object.entries(d.slots)) {
          const it = itemsById.value.get(sel.item);
          if (it) names[type] = replacementKey(it.name);
        }
        return names;
      },
    };
    const bodyType = d.bodyType;
    const chance: Record<string, number> = {
      body: 1, head: 1, eye_color: 1, hair: 0.9, clothes: 0.95, legs: 0.95, shoes: 0.9,
      hat: 0.3, beard: bodyType === "male" || bodyType === "muscular" ? 0.35 : 0.05, facial_eyes: 0.15,
      neck: 0.2, cape: 0.15, backpack: 0.1, weapon: 0.35, shield: 0.15, armour: 0.2, shoulders: 0.1, belt: 0.3, gloves: 0.2,
    };
    for (const [type, p] of Object.entries(chance)) {
      if (Math.random() > p) {
        if (type !== "body" && type !== "head") delete d.slots[type];
        continue;
      }
      const candidates = (itemsByType.value.get(type) ?? []).filter((it) => it.available && availableVariants(cat, it, bodyType, ctx).length > 0);
      if (type === "head") {
        const humans = candidates.filter((it) => it.id.startsWith("heads_human"));
        const item = rnd(Math.random() < 0.8 ? humans : candidates);
        if (!item) continue;
        d.slots[type] = { item: item.id, variant: "light", follow: "body" };
        continue;
      }
      const item = rnd(candidates);
      if (!item) continue;
      const vs = availableVariants(cat, item, bodyType, ctx);
      const sel: SlotSelection = { item: item.id, variant: rnd(vs) ?? "" };
      const follow = defaultFollowFor(type, item);
      if (follow) sel.follow = follow;
      d.slots[type] = sel;
    }
    if (d.slots.body) d.slots.body.variant = rnd(["light", "amber", "olive", "taupe", "bronze", "brown", "black"]) ?? "light";
  });
}

export const bodyTypes = BODY_TYPES;
