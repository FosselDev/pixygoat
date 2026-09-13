import { useMemo } from "preact/hooks";
import { availableVariants, coveredAnimations, resolveItem, ANIMATIONS, type CatalogItem } from "@pixygoat/core";
import { catalog, doc, itemsByType, resolveContext, selectItem, subcategoryOf, ui } from "../state/store.ts";
import { slotLabel, t } from "../i18n/i18n.ts";
import { Icon } from "./icons.tsx";
import { ItemTile } from "./ItemTile.tsx";
import { VariantStrip } from "./VariantStrip.tsx";

const TOTAL = ANIMATIONS.length;

export function CatalogPanel() {
  const cat = catalog.value!;
  const d = doc.value;
  const slot = ui.selectedSlot.value;
  const search = ui.search.value.trim().toLowerCase();
  const allSlots = ui.searchAllSlots.value && search.length > 0;
  const onlyMatching = ui.onlyMatching.value;
  const sub = ui.subcategory.value;
  const ctx = resolveContext.value;
  const subOf = subcategoryOf.value;
  const bodyType = d.bodyType;

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

  const info = useMemo(() => {
    const m = new Map<string, { matching: boolean; covered: number; variants: string[] }>();
    for (const it of baseItems) {
      const variants = it.available ? availableVariants(cat, it, bodyType, ctx) : [];
      let covered = 0;
      if (variants.length) covered = coveredAnimations(resolveItem(cat, it, bodyType, variants[0]!, ctx)).size;
      m.set(it.id, { matching: variants.length > 0, covered, variants });
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

      {subcats.length > 0 && (
        <div class="cat-chips">
          <button class={`chip ${sub === "" ? "on" : ""}`} onClick={() => (ui.subcategory.value = "")}>{t("catalog.allSub")} · {baseItems.length}</button>
          {subcats.map((s) => (
            <button class={`chip ${sub === s ? "on" : ""}`} onClick={() => (ui.subcategory.value = sub === s ? "" : s)}>{s.replace(/_/g, " ")}</button>
          ))}
          <div style="flex-grow:1" />
          <span class="dim" style="font-size:11px">{t("catalog.onCharacter")}</span>
        </div>
      )}

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
