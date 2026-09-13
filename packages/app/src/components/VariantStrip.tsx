import { availableVariants } from "@pixygoat/core";
import { catalog, doc, effectiveVariant, itemsById, resolveContext, selectVariant, setFollow, ui } from "../state/store.ts";
import { slotLabel, t } from "../i18n/i18n.ts";
import { variantColor } from "../render/colors.ts";
import { Icon } from "./icons.tsx";

export function VariantStrip() {
  const d = doc.value;
  const slot = ui.selectedSlot.value;
  const sel = d.slots[slot];
  const item = sel ? itemsById.value.get(sel.item) : undefined;
  if (!sel || !item) {
    return (
      <div class="variants">
        <span class="title dim">{t("catalog.selectSlot")}</span>
      </div>
    );
  }
  const variants = availableVariants(catalog.value!, item, d.bodyType, resolveContext.value);
  const current = effectiveVariant(slot, sel, d);
  const canFollowBody = slot !== "body" && !!d.slots.body && item.matchBodyColor;
  const canFollowHair = slot !== "hair" && !!d.slots.hair && /^(beard|mustache|hairext|ponytail|updo|eyebrows)/.test(slot);

  return (
    <div class="variants">
      <span class="title">{t("variant.title", { item: item.name })}</span>
      <div class="vlist">
        {variants.length <= 1 && <span class="dim" style="font-size:12px">{variants[0] || t("variant.single")}</span>}
        {variants.length > 1 &&
          variants.map((v) => (
            <button class={`col ${v === current ? "on" : ""}`} style={`background:${variantColor(v)}`} title={v} onClick={() => selectVariant(slot, v)} />
          ))}
      </div>
      {sel.follow && (
        <span class="chip on" style="height:28px" title={t("variant.following", { slot: slotLabel(sel.follow) })}>
          <Icon.Link size={12} /> {t("variant.following", { slot: slotLabel(sel.follow) })}
          <span onClick={() => setFollow(slot, undefined)} style="margin-left:4px;display:inline-flex"><Icon.Close size={10} /></span>
        </span>
      )}
      {!sel.follow && canFollowBody && (
        <button class="btn sm" onClick={() => setFollow(slot, "body")}><Icon.Link size={12} />{t("variant.followBody")}</button>
      )}
      {!sel.follow && canFollowHair && (
        <button class="btn sm" onClick={() => setFollow(slot, "hair")}><Icon.Link size={12} />{t("variant.followHair")}</button>
      )}
    </div>
  );
}
