import { ANIMATIONS, SLOT_GROUPS, type CatalogItem } from "@pixygoat/core";
import { coverage, doc, otherBodyTypes, slotStates, toggleVisible, ui } from "../state/store.ts";
import { groupLabel, slotLabel, t, tn } from "../i18n/i18n.ts";
import { variantColor } from "../render/colors.ts";
import { Icon } from "./icons.tsx";

const TOTAL = ANIMATIONS.length;

export function SlotStack() {
  const d = doc.value;
  const states = new Map(slotStates.value.map((s) => [s.type, s]));
  const selected = ui.selectedSlot.value;
  const expanded = ui.expandedGroups.value;
  const missing = coverage.value;
  const used = Object.keys(d.slots).length;
  const conflicts = slotStates.value.filter((s) => s.visible && s.item && s.covered.size === 0);

  const listed = new Set(SLOT_GROUPS.flatMap((g) => [...g.primary, ...g.more]));
  const other = Object.keys(d.slots).filter((tn) => !listed.has(tn));

  /**
   * Second line of a slot: what is worn, plus the reason when it does not
   * show up. A part with no animation at all is a body type conflict, and
   * naming the body types it was drawn for is the only useful thing to say.
   */
  const describe = (item: CatalogItem, st: (typeof slotStates.value)[number], sel: { follow?: string }): string => {
    const parts = [item.name];
    if (st.variant) parts.push(st.variant);
    if (sel.follow) parts.push(t("stack.follows", { slot: slotLabel(sel.follow) }));
    if (st.covered.size === 0) {
      const bodies = otherBodyTypes(item);
      parts.push(bodies.length ? t("stack.onlyFor", { bodies: bodies.map((b) => t(`body.${b}`)).join(", ") }) : t("catalog.notForBody"));
    } else {
      const miss = missing.get(st.type);
      if (miss) parts.push(t("stack.coverage", { n: TOTAL - miss.length, total: TOTAL }));
    }
    return parts.join(" · ");
  };

  const renderSlot = (type: string) => {
    const st = states.get(type);
    const sel = d.slots[type];
    const isOn = selected === type;
    const empty = !sel;
    const item = st?.item;
    const miss = missing.get(type);
    const visible = sel?.visible !== false;
    return (
      <button class={`slot ${isOn ? "on" : ""} ${empty ? "empty" : ""}`} onClick={() => (ui.selectedSlot.value = type)} key={type}>
        <span class={`sw ${empty ? "empty" : ""}`} style={empty ? "" : `background:${variantColor(st?.variant ?? "")}`} />
        <span class="txt">
          <span class="name">{slotLabel(type)}</span>
          <span class="sub" style={miss ? "color:var(--warn)" : ""}>
            {empty ? t("stack.empty") : item ? describe(item, st!, sel) : sel.item}
          </span>
        </span>
        {!empty && (
          <span
            class={`eye ${visible ? "" : "off"}`}
            title={visible ? t("stack.hide") : t("stack.show")}
            onClick={(e) => {
              e.stopPropagation();
              toggleVisible(type);
            }}
          >
            {visible ? <Icon.Eye /> : <Icon.EyeOff />}
          </span>
        )}
      </button>
    );
  };

  return (
    <div class="panel left">
      <div class="panel-head">
        <span class="heading">{t("stack.title")}</span>
        <span class="mono dim">{t("stack.used", { n: used })}</span>
      </div>
      <div class="stack">
        {SLOT_GROUPS.map((g) => {
          const isExp = expanded[g.id] === true;
          const moreVisible = g.more.filter((tn) => isExp || d.slots[tn]);
          const hiddenCount = g.more.length - moreVisible.length;
          return (
            <div key={g.id}>
              <div class="grp">
                <span>{groupLabel(g.id)}</span>
              </div>
              {g.primary.map(renderSlot)}
              {moreVisible.map(renderSlot)}
              {(hiddenCount > 0 || isExp) && (
                <button class={`more-slots ${isExp ? "open" : ""}`} onClick={() => (ui.expandedGroups.value = { ...expanded, [g.id]: !isExp })}>
                  {isExp ? <Icon.Up size={12} /> : <Icon.Down size={12} />}
                  {isExp ? t("stack.less") : tn("stack.moreCount", hiddenCount)}
                </button>
              )}
            </div>
          );
        })}
        {other.length > 0 && (
          <div>
            <div class="grp"><span>{groupLabel("other")}</span></div>
            {other.map(renderSlot)}
          </div>
        )}
      </div>
      <div class="stack-foot">
        {conflicts.length > 0 ? (
          <>
            <Icon.Warn size={14} style="color:var(--warn)" />
            <span>{tn("stack.bodyConflict", conflicts.length, { body: t(`body.${d.bodyType}`) })}</span>
          </>
        ) : missing.size > 0 ? (
          <>
            <Icon.Warn size={14} style="color:var(--warn)" />
            <span>{tn("stack.warnings", missing.size)}</span>
          </>
        ) : (
          <>
            <Icon.Check size={14} style="color:var(--ok)" />
            <span>{t("stack.noWarnings")}</span>
          </>
        )}
      </div>
    </div>
  );
}
