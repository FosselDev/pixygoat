import { analyzeCharacter, LICENSES, LICENSE_KEYS, type LicenseInfo } from "@pixygoat/core";
import { Dialog } from "./Dialog.tsx";
import { allowedLicenses, setAllowedLicenses, slotStates } from "../../state/store.ts";
import { language, slotLabel, t } from "../../i18n/i18n.ts";
import { Icon } from "../icons.tsx";

function Flag({ label, on, good }: { label: string; on: boolean; good: boolean }) {
  // `good` says whether "on" is the pleasant answer (may sell) or the burden (must credit)
  const color = on === good ? "var(--ok)" : "var(--warn)";
  return (
    <div style="display:flex;flex-direction:column;align-items:center;gap:4px;min-width:96px">
      <span style={`display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;border:2px solid ${color};color:${color}`}>
        {on ? <Icon.Check size={16} /> : <Icon.Close size={14} />}
      </span>
      <span style="font-size:11px;color:var(--muted);text-align:center">{label}</span>
      <span class="mono" style={`color:${color}`}>{good ? (on ? t("lic.yes") : t("lic.no")) : on ? t("lic.required") : t("lic.notRequired")}</span>
    </div>
  );
}

function LicenseCard({ id, info }: { id: string; info: LicenseInfo }) {
  const lang = language.value;
  const summary = info.summary[lang] ?? info.summary.en ?? "";
  const obligations = info.obligations[lang] ?? info.obligations.en ?? [];
  return (
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <h3>{id} <span class="dim" style="font-weight:400;font-size:12px">· {info.name}</span></h3>
        <a href={info.url} target="_blank" rel="noopener" style="font-size:11px">{t("lic.readText")}</a>
      </div>
      <p>{summary}</p>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <span class={`chip ${info.commercial ? "" : "warn"}`}>{t("lic.commercial")}: {info.commercial ? t("lic.yes") : t("lic.no")}</span>
        <span class={`chip ${info.modify ? "" : "warn"}`}>{t("lic.modify")}: {info.modify ? t("lic.yes") : t("lic.no")}</span>
        <span class={`chip ${info.attribution ? "warn" : ""}`}>{t("lic.attribution")}: {info.attribution ? t("lic.required") : t("lic.notRequired")}</span>
        <span class={`chip ${info.shareAlike ? "warn" : ""}`}>{t("lic.shareAlike")}: {info.shareAlike ? t("lic.required") : t("lic.notRequired")}</span>
        {info.copyleft && <span class="chip warn">{t("lic.copyleft")}</span>}
      </div>
      {obligations.length > 0 && (
        <ul style="margin:0;padding-left:18px;font-size:12px;color:var(--muted);display:flex;flex-direction:column;gap:2px">
          {obligations.map((o) => (
            <li>{o}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function LicenseDialog() {
  const states = slotStates.value.filter((s) => s.visible && s.item);
  const analysis = analyzeCharacter(states.map((s) => s.item!));
  const lang = language.value;
  const allowed = allowedLicenses.value;
  const eff = analysis.effective ? LICENSES[analysis.effective] : undefined;

  const toggle = (k: string) => {
    const next = new Set(allowed);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setAllowedLicenses(next);
  };

  return (
    <Dialog title={t("lic.title")} sub={t("lic.subtitle")}>
      <div class="dim" style="font-size:12px">{t("lic.disclaimer")}</div>

      <span class="heading">{t("lic.effective")}</span>
      {states.length === 0 ? (
        <div class="dim">{t("lic.noItems")}</div>
      ) : (
        <div class="card" style="gap:14px">
          <div style="display:flex;align-items:center;gap:12px">
            <span class="chip on" style="height:28px;font-size:13px">{analysis.effective ?? "–"}</span>
            <span class="muted" style="font-size:12px">{eff ? (eff.summary[lang] ?? eff.summary.en) : ""}</span>
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:space-around">
            <Flag label={t("lic.commercial")} on={analysis.commercial} good />
            <Flag label={t("lic.modify")} on={analysis.modify} good />
            <Flag label={t("lic.attribution")} on={analysis.attribution} good={false} />
            <Flag label={t("lic.shareAlike")} on={analysis.shareAlike} good={false} />
            <Flag label={t("lic.copyleft")} on={analysis.copyleft} good={false} />
          </div>
          <div>
            <div class="heading" style="margin-bottom:6px">{t("lic.obligations")}</div>
            {!analysis.attribution && !analysis.shareAlike && !analysis.copyleft ? (
              <div class="dim" style="font-size:12px">{t("lic.none")}</div>
            ) : (
              <ul style="margin:0;padding-left:18px;font-size:12px;display:flex;flex-direction:column;gap:3px">
                {analysis.attribution && <li>{t("lic.creditAuthors", { n: analysis.authors.length })}</li>}
                {analysis.effective && (LICENSES[analysis.effective]!.obligations[lang] ?? LICENSES[analysis.effective]!.obligations.en ?? []).map((o) => <li>{o}</li>)}
                {analysis.gplOnly.length > 0 && <li style="color:var(--warn)">{t("lic.gplOnly", { items: analysis.gplOnly.map((i) => i.name).join(", ") })}</li>}
              </ul>
            )}
          </div>
          <div>
            <div class="heading" style="margin-bottom:6px">{t("lic.perItem")}</div>
            <div class="list">
              {analysis.rows.map((r) => {
                const st = states.find((s) => s.item === r.item)!;
                return (
                  <div class="item" style="padding:6px 10px">
                    <span class="grow" style="font-size:12px"><span class="dim">{slotLabel(st.type)} · </span>{r.item.name}</span>
                    <span class="mono dim">{r.options.length > 1 ? `${t("lic.itemOptions")}: ${r.options.join(" / ")} → ` : ""}</span>
                    <span class="chip on" style="height:22px">{r.chosen ?? "?"}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <span class="heading">{t("lic.filterTitle")}</span>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        {LICENSE_KEYS.map((k) => (
          <label class="chip" style="height:28px;cursor:pointer" onClick={() => toggle(k)}>
            <span class={`cb ${allowed.has(k) ? "on" : ""}`}>{allowed.has(k) && <Icon.Check size={10} />}</span>
            {k}
          </label>
        ))}
      </div>
      <div class="dim" style="font-size:12px">{t("lic.filterHint")}</div>

      <span class="heading">{t("lic.explain")}</span>
      {LICENSE_KEYS.map((k) => LICENSES[k] && <LicenseCard id={k} info={LICENSES[k]!} />)}
    </Dialog>
  );
}
