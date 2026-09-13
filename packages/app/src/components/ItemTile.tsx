import { useEffect, useRef } from "preact/hooks";
import { bestLicense, LICENSES, resolveItem, sortLayers, toDrawLayers, type CatalogItem, type DrawLayer } from "@pixygoat/core";
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

export function ItemTile({ item, selected, matching, covered, total, variants, typeLabel, blocked, onPick }: Props) {
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
      const anim = mine.some((l) => l.sheets.walk) || mine.length === 0 ? "walk" : Object.keys(mine[0]!.sheets)[0] ?? "walk";
      void composeFrame(all, anim, item.preview.row, item.preview.column).then((frame) => {
        if (cancelled || !frame) return;
        const c = canvas.getContext("2d")!;
        c.imageSmoothingEnabled = false;
        c.clearRect(0, 0, canvas.width, canvas.height);
        const cell = frame.width;
        const crop = 48;
        const scale = cell / 64;
        const sx = (8 + item.preview.xOffset) * scale + (cell - 64 * scale) / 2;
        const sy = (cropY(item.typeName) + item.preview.yOffset) * scale + (cell - 64 * scale) / 2;
        c.drawImage(frame, sx, sy, crop * scale, crop * scale, 0, 0, canvas.width, canvas.height);
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
    <button class={`tile ${selected ? "on" : ""} ${matching && !blocked ? "" : "na"}`} onClick={onPick} title={!matching ? t("catalog.notForBody") : blocked ? t("lic.blocked") : item.name}>
      <div class="thumb checker">
        {matching ? <canvas ref={ref} width={96} height={96} class="px" /> : <span class="dim">{t("catalog.notForBody")}</span>}
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
