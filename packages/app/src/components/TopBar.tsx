import { useState } from "preact/hooks";
import { analyzeCharacter, type BodyType } from "@pixygoat/core";
import { bodyTypes, canRedo, canUndo, dirty, doc, goToStart, randomize, redo, replaceDocument, setBodyType, setName, slotStates, starterCharacter, toast, ui, undo } from "../state/store.ts";
import { LANGUAGES, language, setLanguage, t } from "../i18n/i18n.ts";
import { Icon } from "./icons.tsx";

export function TopBar() {
  const d = doc.value;
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const effective = analyzeCharacter(slotStates.value.filter((s) => s.visible && s.item).map((s) => s.item!)).effective;

  const commitName = () => {
    if (nameDraft !== null && nameDraft.trim() && nameDraft !== d.name) setName(nameDraft.trim());
    setNameDraft(null);
  };

  const onBody = (e: Event) => {
    const bt = (e.target as HTMLSelectElement).value as BodyType;
    const dropped = setBodyType(bt);
    if (dropped.length) toast(t("body.changeDropped", { body: t(`body.${bt}`), items: dropped.join(", ") }), "warn", 7000);
  };

  const onNew = () => {
    if (dirty.value && !confirm(t("new.confirm"))) return;
    replaceDocument(starterCharacter(d.bodyType));
  };

  return (
    <div class="topbar">
      <button class="brand" onClick={goToStart} title={t("start.back")}>
        <Icon.Goat />
        <span>{t("app.name")}</span>
      </button>
      <div class="sep" />
      <div class="field">
        <label>{t("top.character")}</label>
        <input
          class="name"
          value={nameDraft ?? d.name}
          onInput={(e) => setNameDraft((e.target as HTMLInputElement).value)}
          onBlur={commitName}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          spellcheck={false}
        />
        {dirty.value && <span class="dirty-dot" title={t("toast.unsaved")} />}
      </div>
      <div class="field">
        <label>{t("top.base")}</label>
        <select value={d.bodyType} onChange={onBody}>
          {bodyTypes.map((b) => (
            <option value={b}>{t(`body.${b}`)}</option>
          ))}
        </select>
      </div>
      <div class="spacer" />
      <div class="actions">
        <button class="btn icon" title={`${t("top.undo")} (Ctrl+Z)`} disabled={!canUndo.value} onClick={undo}><Icon.Undo /></button>
        <button class="btn icon" title={`${t("top.redo")} (Ctrl+Y)`} disabled={!canRedo.value} onClick={redo}><Icon.Redo /></button>
        <button class="btn" onClick={randomize}><Icon.Random size={14} />{t("top.random")}</button>
      </div>
      <div class="sep" />
      <div class="actions">
        <button class="btn" onClick={onNew}><Icon.New size={14} />{t("top.new")}</button>
        <button class="btn" onClick={() => (ui.dialog.value = "load")} title="Ctrl+O"><Icon.Load size={14} />{t("top.load")}</button>
        <button class="btn" onClick={() => (ui.dialog.value = "save")} title="Ctrl+S"><Icon.Save size={14} />{t("top.save")}</button>
        <button class="btn primary" onClick={() => (ui.dialog.value = "export")} title="Ctrl+E"><Icon.Export size={14} />{t("top.export")}</button>
      </div>
      <div class="sep" />
      <div class="actions">
        <button class="btn" onClick={() => (ui.dialog.value = "licenses")}>
          {t("top.licenses")}
          {effective && <span class="mono" style="padding:1px 5px;border-radius:3px;background:var(--accent-bg);color:var(--accent)">{effective}</span>}
        </button>
        <select value={language.value} onChange={(e) => setLanguage((e.target as HTMLSelectElement).value)} title={t("top.language")} style="width:auto">
          {LANGUAGES.map((l) => (
            <option value={l.id}>{l.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
