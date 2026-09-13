import { useEffect, useRef } from "preact/hooks";
import {
  ANIMATIONS,
  bestLicense,
  buildFrameSet,
  coveredAnimations,
  customLayoutFor,
  LICENSES,
  resolveItem,
  sortLayers,
  toDrawLayers,
  type CatalogItem,
  type DrawLayer,
  type FrameSet,
  type PreviewHint,
} from "@pixygoat/core";
import { catalog, doc, drawLayers, effectiveVariant, resolveContext, slotStates } from "../state/store.ts";
import { composeFrame } from "../render/renderer.ts";
import { variantColor } from "../render/colors.ts";
import { language, t } from "../i18n/i18n.ts";
import { Icon } from "./icons.tsx";

interface Props {
  item: CatalogItem;
  selected: boolean;
  matching: boolean;
  covered: number;
  total: number;
  variants: string[];
  typeLabel?: string;
  blocked?: boolean;
  /** body types the part does have sheets for, when it has none for this one */
  otherBodies?: string[];
  onPick: () => void;
}

/** Vertical crop origin (in sprite pixels) so the thumbnail shows the relevant body region. */
function cropY(type: string): number {
  if (/^(legs|shoes|socks|shoes_toe|feet|prosthesis_leg)/.test(type)) return 16;
  if (/^(clothes|jacket|vest|dress|sleeves|apron|overalls|sash|belt|buckles|cargo|wrists|gloves|arms|armour|chainmail|shoulders|bracers|bauldron|neck|necklace|charm|backpack|cape|quiver|ammo|weapon|shield|body|tail|wings|fins|shadow|wheelchair|ring|accessory)/.test(type)) return 8;
  return 0;
}

/**
 * Colour of the license badge, by how demanding the item's least demanding
 * option is: green nothing to do, grey credit the authors, amber share-alike,
 * red the item leaves no choice but GPL.
 */
/**
 * Square region of a rendered cell that actually holds pixels, with a little
 * air around it. Oversize cells are mostly empty - a 192 px slash cell holds a
 * 64 px character and the arc of the swing - so framing them on their content
 * is what makes the thumbnail readable.
 */
function contentBox(canvas: OffscreenCanvas): { x: number; y: number; size: number } | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3]! <= 8) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  const size = Math.max(maxX - minX + 1, maxY - minY + 1) + 4;
  return {
    x: Math.round(minX + (maxX - minX + 1) / 2 - size / 2),
    y: Math.round(minY + (maxY - minY + 1) / 2 - size / 2),
    size,
  };
}

/** Animations that show a part best, in order; the rest follow in sheet order. */
const PREFERRED_ANIMATIONS = ["walk", "idle", "combat_idle", "run", "thrust", "slash", "shoot"];

/**
 * Animation to preview a part in. Prefers one that keeps the standard 64 px
 * grid, so a spear in the character's hand does not drag every thumbnail into
 * an oversize layout. Parts that exist only as an oversize attack - spears,
 * bows, whips - fall back to their own first animation.
 */
function previewAnimation(layers: DrawLayer[], covered: Set<string>): string {
  const available = ANIMATIONS.map((a) => a.id).filter((a) => covered.has(a));
  const ordered = [
    ...PREFERRED_ANIMATIONS.filter((a) => available.includes(a)),
    ...available.filter((a) => !PREFERRED_ANIMATIONS.includes(a)),
  ];
  return ordered.find((a) => !customLayoutFor(layers, a)) ?? ordered[0] ?? "walk";
}

/**
 * Cell of the sheet to show. The definitions carry the generator's preview
 * hint as sheet pixels - column and row in 64 px units plus a pixel nudge -
 * so dividing by the real cell size maps it onto whatever grid the animation
 * uses, 64, 128 or 192 px.
 */
function previewCell(hint: PreviewHint, set: FrameSet): { row: number; column: number } {
  const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v));
  return {
    column: clamp(Math.floor((hint.column * 64 + hint.xOffset) / set.cellSize), set.columns - 1),
    row: clamp(Math.floor((hint.row * 64 + hint.yOffset) / set.cellSize), set.rows - 1),
  };
}

const LICENSE_COLORS = ["var(--ok)", "var(--dim)", "var(--dim)", "var(--warn)", "var(--err)"];

let observer: IntersectionObserver | null = null;
const pending = new Map<Element, () => void>();
function observe(el: Element, cb: () => void) {
  if (!observer) {
    observer = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          const fn = pending.get(e.target);
          if (fn) {
            pending.delete(e.target);
            observer!.unobserve(e.target);
            fn();
          }
        }
      }
    }, { rootMargin: "200px" });
  }
  pending.set(el, cb);
  observer.observe(el);
}

export function ItemTile({ item, selected, matching, covered, total, variants, typeLabel, blocked, otherBodies, onPick }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const d = doc.value;
  const bodyType = d.bodyType;
  const ctx = resolveContext.value;
  const baseLayers = drawLayers.value;
  const slotVariant = d.slots[item.typeName];
  const selectedState = slotStates.value.find((s) => s.type === item.typeName);

  // Variant to preview: the slot's current variant when the item has it, else the first one.
  let variant = variants[0] ?? "";
  if (slotVariant) {
    const v = effectiveVariant(item.typeName, slotVariant, d);
    if (variants.includes(v)) variant = v;
  }

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !matching) return;
    let cancelled = false;
    observe(canvas, () => {
      if (cancelled) return;
      const cat = catalog.value!;
      // the current character without the layers of this slot, plus the item
      const own = new Set(selectedState?.layers.map((l) => l.id) ?? []);
      const layers: DrawLayer[] = baseLayers.filter((l) => !own.has(l.id));
      const resolved = resolveItem(cat, item, bodyType, variant, ctx);
      const mine = toDrawLayers(resolved, item.id);
      const all = sortLayers([...layers, ...mine]);
      const anim = previewAnimation(all, coveredAnimations(resolved));
      const geometry = buildFrameSet(all, anim);
      if (!geometry) return;
      const { row, column } = previewCell(item.preview, geometry);
      void composeFrame(all, anim, row, column).then((frame) => {
        if (cancelled || !frame) return;
        const c = canvas.getContext("2d")!;
        c.imageSmoothingEnabled = false;
        c.clearRect(0, 0, canvas.width, canvas.height);
        const cell = frame.set.cellSize;
        if (cell > 64) {
          // Oversize cell: frame what is drawn, so a spear or a drawn bow fills
          // the thumbnail instead of sitting small in a mostly empty cell.
          const box = contentBox(frame.canvas) ?? { x: 0, y: 0, size: cell };
          c.drawImage(frame.canvas, box.x, box.y, box.size, box.size, 0, 0, canvas.width, canvas.height);
        } else {
          c.drawImage(frame.canvas, 8, cropY(item.typeName), 48, 48, 0, 0, canvas.width, canvas.height);
        }
      });
    });
    return () => {
      cancelled = true;
      pending.delete(canvas);
      observer?.unobserve(canvas);
    };
  }, [item.id, variant, bodyType, baseLayers, matching]);

  const covClass = covered === total ? "" : covered === 0 ? "none" : "part";
  const swatches = variants.slice(0, 5);

  const best = bestLicense(item);
  const licInfo = best ? LICENSES[best] : undefined;
  const licColor = licInfo ? LICENSE_COLORS[Math.min(licInfo.strictness, 4)]! : "var(--dim)";
  const licTitle = [
    item.licenses.length ? item.licenses.join(" · ") : "?",
    best && item.licenses.length > 1 ? t("lic.tipLeast", { license: best }) : "",
    licInfo ? (licInfo.summary[language.value] ?? licInfo.summary.en ?? "") : "",
    blocked ? t("lic.blocked") : "",
  ]
    .filter(Boolean)
    .join("\n");
  return (
    <button class={`tile ${selected ? "on" : ""} ${matching && !blocked ? "" : "na"}`} onClick={onPick} title={
        !matching
          ? `${item.name} – ${otherBodies && otherBodies.length ? t("catalog.onlyForLong", { bodies: otherBodies.map((b) => t(`body.${b}`)).join(", "), body: t(`body.${bodyType}`) }) : t("catalog.notForBody")}`
          : blocked
            ? t("lic.blocked")
            : item.name
      }>
      <div class="thumb checker">
        {matching ? (
          <canvas ref={ref} width={96} height={96} class="px" />
        ) : (
          <span class="na-hint">
            <Icon.Warn size={14} />
            {otherBodies && otherBodies.length > 0 ? (
              <>
                <span class="dim">{t("catalog.onlyFor")}</span>
                <span>{otherBodies.map((b) => t(`body.${b}`)).join(" · ")}</span>
              </>
            ) : (
              <span class="dim">{t("catalog.notForBody")}</span>
            )}
          </span>
        )}
        {matching && <span class={`cov ${covClass}`}>{covered}/{total}</span>}
        {selected && <span class="check"><Icon.Check size={10} /></span>}
      </div>
      <div class="meta">
        <span class="name">{item.name}{typeLabel ? <span class="dim"> · {typeLabel}</span> : null}</span>
        <div class="sw">
          {swatches.map((v) => (
            <span style={`background:${variantColor(v)}`} title={v} />
          ))}
          {variants.length > 5 && <span class="more">+{variants.length - 5}</span>}
          {variants.length === 1 && <span class="more">{variants[0]}</span>}
          <span class="lic" style={`color:${licColor}`} title={licTitle}>
            <Icon.License size={13} />
          </span>
        </div>
      </div>
    </button>
  );
}
