import { ANIMATIONS, SLOT_GROUPS } from "@pixygoat/core";
import { coverage, doc, slotStates, toggleVisible, ui } from "../state/store.ts";
import { groupLabel, slotLabel, t } from "../i18n/i18n.ts";
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

  const listed = new Set(SLOT_GROUPS.flatMap((g) => [...g.primary, ...g.more]));
  const other = Object.keys(d.slots).filter((tn) => !listed.has(tn));

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
            {empty
              ? t("stack.empty")
              : item
                ? `${item.name}${st?.variant ? ` · ${st.variant}` : ""}${sel.follow ? ` · ${t("stack.follows", { slot: slotLabel(sel.follow) })}` : ""}${miss ? ` · ${t("stack.coverage", { n: TOTAL - miss.length, total: TOTAL })}` : ""}`
                : sel.item}
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
                {g.more.length > 0 && (
                  <button onClick={() => (ui.expandedGroups.value = { ...expanded, [g.id]: !isExp })}>
                    {isExp ? t("stack.less") : `${t("stack.more")} ${hiddenCount ? `(${hiddenCount})` : ""}`}
                  </button>
                )}
              </div>
              {g.primary.map(renderSlot)}
              {moreVisible.map(renderSlot)}
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
        {missing.size > 0 ? (
          <>
            <Icon.Warn size={14} style="color:var(--warn)" />
            <span>{t("stack.warnings", { n: missing.size })}</span>
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
