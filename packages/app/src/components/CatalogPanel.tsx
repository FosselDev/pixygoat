import { useMemo } from "preact/hooks";
import { availableVariants, coveredAnimations, itemAllowed, resolveItem, ANIMATIONS, type BodyType, type CatalogItem, type Direction } from "@pixygoat/core";
import { allowedLicenses, catalog, doc, itemsByType, licenseFilterActive, otherBodyTypes, resolveContext, selectItem, setSubcategory, subcategoryOf, ui } from "../state/store.ts";
import { slotLabel, t } from "../i18n/i18n.ts";
import { Icon } from "./icons.tsx";
import { ItemTile } from "./ItemTile.tsx";
import { VariantStrip } from "./VariantStrip.tsx";

const TOTAL = ANIMATIONS.length;

/** Arrows for the direction every thumbnail is rendered in. */
const DIR_ICON: Record<Direction, preact.JSX.Element> = {
  up: <Icon.Up size={13} />,
  left: <Icon.Left size={13} />,
  down: <Icon.Down size={13} />,
  right: <Icon.Right size={13} />,
};

export function CatalogPanel() {
  const cat = catalog.value!;
  const d = doc.value;
  const slot = ui.selectedSlot.value;
  const search = ui.search.value.trim().toLowerCase();
  const allSlots = ui.searchAllSlots.value && search.length > 0;
  const onlyMatching = ui.onlyMatching.value;
  const subWanted = ui.subcategory.value[slot] ?? "";
  const ctx = resolveContext.value;
  const subOf = subcategoryOf.value;
  const bodyType = d.bodyType;
  const allowed = allowedLicenses.value;

  const baseItems = allSlots ? cat.items : (itemsByType.value.get(slot) ?? []);

  const subcats = useMemo(() => {
    if (allSlots) return [] as string[];
    const set = new Set<string>();
    for (const it of baseItems) {
      const s = subOf.get(it.id);
      if (s) set.add(s);
    }
    return [...set].sort();
  }, [baseItems, subOf, allSlots]);

  // A chip that this slot does not offer must never hide everything: a filter
  // the body type removed, or one left over from a slot without chips, falls
  // back to "all" instead of leaving an invisible empty result.
  const sub = subcats.includes(subWanted) ? subWanted : "";

  const info = useMemo(() => {
    const m = new Map<string, { matching: boolean; covered: number; variants: string[]; bodies: BodyType[] }>();
    for (const it of baseItems) {
      const variants = it.available ? availableVariants(cat, it, bodyType, ctx) : [];
      let covered = 0;
      if (variants.length) covered = coveredAnimations(resolveItem(cat, it, bodyType, variants[0]!, ctx)).size;
      // Only for the ones that do not fit: which body types were they drawn for?
      const bodies: BodyType[] = variants.length ? [] : otherBodyTypes(it);
      m.set(it.id, { matching: variants.length > 0, covered, variants, bodies });
    }
    return m;
  }, [baseItems, bodyType, ctx, cat]);

  const items = useMemo(() => {
    let list = baseItems;
    if (search) {
      const terms = search.split(/\s+/);
      list = list.filter((it) => {
        const hay = `${it.name} ${it.id} ${it.tags.join(" ")} ${it.typeName} ${it.variants.join(" ")}`.toLowerCase();
        return terms.every((term) => hay.includes(term));
      });
    }
    if (onlyMatching) list = list.filter((it) => info.get(it.id)?.matching);
    if (sub && !allSlots) list = list.filter((it) => subOf.get(it.id) === sub);
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [baseItems, search, onlyMatching, sub, allSlots, info, subOf]);

  const selectedId = d.slots[slot]?.item;

  const onPick = (it: CatalogItem | null) => {
    const target = it ? it.typeName : slot;
    selectItem(target, it);
    if (it && it.typeName !== slot) ui.selectedSlot.value = it.typeName;
  };

  return (
    <div class="center">
      <div class="cat-head">
        <div class="crumb">
          <span>{allSlots ? t("catalog.everySlot") : slot}</span>
          {!allSlots && sub && (
            <>
              <span class="dim">/</span>
              <b>{sub}</b>
            </>
          )}
          {!allSlots && !sub && (
            <>
              <span class="dim">/</span>
              <b>{t("catalog.all").toLowerCase()}</b>
            </>
          )}
        </div>
        <span class="mono dim">{t("catalog.count", { n: items.length })}</span>
        {licenseFilterActive.value && (
          <button class="chip warn" onClick={() => (ui.dialog.value = "licenses")}>{t("lic.filterActive", { n: allowed.size })}</button>
        )}
        <div style="flex-grow:1" />
        <div class="search">
          <Icon.Search size={14} style="color:var(--muted)" />
          <input
            placeholder={t("catalog.search")}
            value={ui.search.value}
            onInput={(e) => (ui.search.value = (e.target as HTMLInputElement).value)}
          />
          {ui.search.value && (
            <button class="ico" style="width:22px;height:22px;border:none" onClick={() => (ui.search.value = "")}><Icon.Close size={12} /></button>
          )}
        </div>
        <label class="chip" style="height:32px;border-radius:6px" title={t("catalog.everySlot")}>
          <span class={`cb ${ui.searchAllSlots.value ? "on" : ""}`} onClick={() => (ui.searchAllSlots.value = !ui.searchAllSlots.value)}>
            {ui.searchAllSlots.value && <Icon.Check size={10} />}
          </span>
          <span onClick={() => (ui.searchAllSlots.value = !ui.searchAllSlots.value)}>{t("catalog.everySlot")}</span>
        </label>
        <div class="seg">
          <button class={onlyMatching ? "on" : ""} onClick={() => (ui.onlyMatching.value = true)}>{t("catalog.matching")}</button>
          <button class={!onlyMatching ? "on" : ""} onClick={() => (ui.onlyMatching.value = false)}>{t("catalog.all")}</button>
        </div>
      </div>

      <div class="cat-chips">
        <div class="chips">
          {subcats.length > 0 && (
            <>
              <button class={`chip ${sub === "" ? "on" : ""}`} onClick={() => setSubcategory(slot, "")}>{t("catalog.allSub")} · {baseItems.length}</button>
              {subcats.map((s) => (
                <button class={`chip ${sub === s ? "on" : ""}`} onClick={() => setSubcategory(slot, sub === s ? "" : s)}>{s.replace(/_/g, " ")}</button>
              ))}
            </>
          )}
        </div>
        <div class="cat-tools" title={t("catalog.onCharacter")}>
          <span class="dim" style="font-size:11px">{t("catalog.direction")}</span>
          <div class="dir-picker">
            {(["up", "left", "down", "right"] as Direction[]).map((dir) => (
              <button class={ui.catalogDirection.value === dir ? "on" : ""} title={t(`dir.${dir}`)} onClick={() => (ui.catalogDirection.value = dir)}>
                {DIR_ICON[dir]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div class="cat-grid-wrap">
        {items.length === 0 && !allSlots ? (
          <div class="cat-empty">{t("catalog.empty")}</div>
        ) : (
          <div class="cat-grid">
            {!allSlots && !search && (
              <button class={`tile ${!selectedId ? "on" : ""}`} onClick={() => onPick(null)}>
                <div class="thumb checker none">{t("catalog.none")}</div>
                <div class="meta">
                  <span class="name">{t("catalog.none")}</span>
                  <span class="dim" style="font-size:11px">{t("catalog.noneHint")}</span>
                </div>
              </button>
            )}
            {items.map((it) => {
              const inf = info.get(it.id)!;
              return (
                <ItemTile
                  key={it.id}
                  item={it}
                  selected={selectedId === it.id && it.typeName === slot}
                  matching={inf.matching}
                  covered={inf.covered}
                  total={TOTAL}
                  variants={inf.variants}
                  typeLabel={allSlots ? slotLabel(it.typeName) : undefined}
                  blocked={!itemAllowed(it, allowed)}
                  otherBodies={inf.bodies}
                  onPick={() => onPick(it)}
                />
              );
            })}
          </div>
        )}
      </div>

      <VariantStrip />
    </div>
  );
}
