import { useEffect, useMemo, useState } from "preact/hooks";
import { ANIMATIONS, sanitizeVariantName, type UnityPaperDollPlan } from "@pixygoat/core";
import { Dialog } from "./Dialog.tsx";
import { coverage, doc, slotStates, toast, ui, update } from "../../state/store.ts";
import { downloadDocument } from "../../state/persistence.ts";
import { currentPlan, runFlatExport, runUnityPaperDollExport, type Delivery } from "../../export/run-export.ts";
import { t } from "../../i18n/i18n.ts";
import { Icon } from "../icons.tsx";

/** "Waffe (6tla)" - the paper doll slot codes mean nothing on their own. */
function slotName(slot: string): string {
  const label = t(`sbslot.${slot}`);
  return label === `sbslot.${slot}` ? slot : `${label} (${slot})`;
}

/** "Hieb (128 px)" instead of the page code "slash128". */
function pageName(plan: UnityPaperDollPlan | null, code: string): string {
  const page = plan?.manifest.pages[code];
  if (!page) return code;
  const label = t(`anim.${page.animation}`);
  return page.layout ? `${label} (${page.cellSize} px)` : label;
}

const SB_SLOTS = ["0bas", "1out", "2clo", "3fac", "4har", "5hat", "6tla", "7tlb"];

type Target = "unity" | "flat" | "character";
type FlatMode = "animations" | "universal" | "frames";

interface Defaults { unityDir: string; flatDir: string }

const LS_KEY = "pixygoat.export";

const TARGETS: Target[] = ["unity", "flat", "character"];

/**
 * Remembered dialog state. What comes back was written by an older version of
 * this dialog as often as not, so the target is checked against the list
 * rather than trusted: a name that no longer exists would leave no card
 * selected and an export button that does nothing.
 */
function loadPrefs(): Partial<{ target: Target; flatMode: FlatMode; delivery: Delivery; unityDir: string; flatDir: string; perLayer: boolean }> {
  try {
    const prefs = JSON.parse(localStorage.getItem(LS_KEY) ?? "{}") as Partial<{ target: Target }> & Record<string, unknown>;
    if (prefs.target && !TARGETS.includes(prefs.target)) delete prefs.target;
    if (typeof prefs["staticBloomDir"] === "string" && !prefs["unityDir"]) prefs["unityDir"] = prefs["staticBloomDir"];
    return prefs;
  } catch {
    return {};
  }
}

export function ExportDialog() {
  const d = doc.value;
  const prefs = useMemo(loadPrefs, []);
  const [target, setTarget] = useState<Target>(prefs.target ?? "unity");
  const [flatMode, setFlatMode] = useState<FlatMode>(prefs.flatMode ?? "animations");
  const [delivery, setDelivery] = useState<Delivery>(prefs.delivery ?? "folder");
  const [perLayer, setPerLayer] = useState(prefs.perLayer ?? false);
  const [variantName, setVariantName] = useState(d.export?.unity?.variantName ?? sanitizeVariantName(d.name));
  const [unityDir, setUnityDir] = useState(d.export?.unity?.targetDir ?? prefs.unityDir ?? "");
  const [flatDir, setFlatDir] = useState(d.export?.flat?.targetDir ?? prefs.flatDir ?? "");
  const [animations, setAnimations] = useState<string[]>(ANIMATIONS.map((a) => a.id));
  const [busy, setBusy] = useState<{ done: number; total: number; label: string } | null>(null);
  const [defaults, setDefaults] = useState<Defaults | null>(null);

  useEffect(() => {
    void fetch("/api/health").then(async (r) => {
      const h = (await r.json()) as { exportDefaults?: Defaults };
      if (h.exportDefaults) {
        setDefaults(h.exportDefaults);
        setUnityDir((v) => v || h.exportDefaults!.unityDir);
        setFlatDir((v) => v || h.exportDefaults!.flatDir);
      }
    });
  }, []);

  const savePrefs = () => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ target, flatMode, delivery, unityDir, flatDir, perLayer }));
    } catch {
      /* ignore */
    }
  };

  const missing = coverage.value;
  const states = slotStates.value.filter((s) => s.visible && s.item);
  const plan = useMemo(() => (target === "unity" ? currentPlan(variantName, perLayer, animations) : null), [target, variantName, perLayer, animations, states]);

  const toggleAnim = (id: string) => setAnimations((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));

  const run = async () => {
    savePrefs();
    if (target === "character") {
      downloadDocument(d.name);
      ui.dialog.value = null;
      return;
    }
    if (animations.length === 0) return;
    setBusy({ done: 0, total: 1, label: "" });
    const progress = (done: number, total: number, label: string) => setBusy({ done, total, label });
    try {
      const result =
        target === "unity"
          ? await runUnityPaperDollExport({ variantName, perLayer, animations, delivery, targetDir: unityDir }, progress)
          : await runFlatExport({ mode: flatMode, animations, delivery, targetDir: flatDir }, progress);
      if (!result.ok) {
        toast(t("export.failed", { error: result.error ?? "?" }), "error", 8000);
        return;
      }
      update((doc) => {
        doc.export ??= {};
        if (target === "unity") doc.export.unity = { variantName, targetDir: unityDir };
        else doc.export.flat = { targetDir: flatDir };
      });
      toast(result.targetDir ? t("export.doneFolder", { n: result.files, dir: result.targetDir }) : t("export.doneZip", { n: result.files }), "info", 8000);
      ui.dialog.value = null;
    } catch (err) {
      toast(t("export.failed", { error: (err as Error).message }), "error", 8000);
    } finally {
      setBusy(null);
    }
  };

  const fileCount = target === "unity" ? (plan?.sheets.length ?? 0) + 4 : target === "flat" ? (flatMode === "animations" ? animations.length : flatMode === "universal" ? 1 : "…") : 1;

  return (
    <Dialog
      title={`${t("top.export")} · ${d.name}`}
      sub={`${t(`body.${d.bodyType}`)} · ${states.length} ${t("export.layers")} · ${animations.length} ${t("export.animations")}`}
      footer={
        <>
          <span class="mono dim left">{busy ? `${busy.done}/${busy.total} ${busy.label}` : t("export.fileCount", { n: String(fileCount) })}</span>
          <button class="btn" onClick={() => (ui.dialog.value = null)} disabled={!!busy}>{t("dialog.cancel")}</button>
          <button class="btn primary" onClick={run} disabled={!!busy || (target !== "character" && animations.length === 0) || (delivery === "folder" && target === "unity" && !unityDir.trim()) || (delivery === "folder" && target === "flat" && !flatDir.trim())}>
            <Icon.Export size={14} />
            {busy ? t("export.running") : t("top.export")}
          </button>
        </>
      }
    >
      <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:16px">
        <div style="display:flex;flex-direction:column;gap:10px">
          <span class="heading">{t("export.target")}</span>

          <button class={`card ${target === "unity" ? "on" : ""}`} onClick={() => setTarget("unity")}>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
              <h3>{t("export.unity.title")}</h3>
              <span class="mono" style="padding:2px 6px;border-radius:3px;background:var(--accent-bg);color:var(--accent)">char_a_&lt;page&gt;_&lt;slot&gt;_&lt;variant&gt;_v01.png</span>
            </div>
            <p>{t("export.unity.desc")}</p>
            {target === "unity" && (
              <div style="display:flex;flex-direction:column;gap:8px;margin-top:4px" onClick={(e) => e.stopPropagation()}>
                <label class="row">
                  <span class={`cb ${!perLayer ? "on" : ""}`} onClick={() => setPerLayer(false)}>{!perLayer && <Icon.Check size={10} />}</span>
                  <span>{t("export.unity.merge")}</span>
                  <span class="mono dim" title={SB_SLOTS.map(slotName).join(", ")}>{SB_SLOTS.join(" ")}</span>
                </label>
                <label class="row">
                  <span class={`cb ${perLayer ? "on" : ""}`} onClick={() => setPerLayer(true)}>{perLayer && <Icon.Check size={10} />}</span>
                  <span>{t("export.unity.perLayer")}</span>
                </label>
                <div class="row">
                  <label>{t("export.unity.variant")}</label>
                  <input type="text" value={variantName} onInput={(e) => setVariantName((e.target as HTMLInputElement).value)} />
                  <span class="mono dim">{sanitizeVariantName(variantName)}</span>
                </div>
                <DeliveryRow delivery={delivery} setDelivery={setDelivery} dir={unityDir} setDir={setUnityDir} defaultDir={defaults?.unityDir} />
              </div>
            )}
          </button>

          <button class={`card ${target === "flat" ? "on" : ""}`} onClick={() => setTarget("flat")}>
            <h3>{t("export.flat.title")}</h3>
            <p>{t("export.flat.desc")}</p>
            {target === "flat" && (
              <div style="display:flex;flex-direction:column;gap:8px;margin-top:4px" onClick={(e) => e.stopPropagation()}>
                {(["animations", "universal", "frames"] as FlatMode[]).map((m) => (
                  <label class="row">
                    <span class={`cb radio ${flatMode === m ? "on" : ""}`} onClick={() => setFlatMode(m)} />
                    <span onClick={() => setFlatMode(m)}>{t(`export.flat.${m}`)}</span>
                  </label>
                ))}
                <DeliveryRow delivery={delivery} setDelivery={setDelivery} dir={flatDir} setDir={setFlatDir} defaultDir={defaults?.flatDir} />
              </div>
            )}
          </button>

          <button class={`card ${target === "character" ? "on" : ""}`} onClick={() => setTarget("character")}>
            <h3>{t("export.char.title")}</h3>
            <p>{t("export.char.desc", { file: `${d.name}.character.json` })}</p>
          </button>

          {target !== "character" && (
            <>
              <span class="heading" style="margin-top:4px">{t("export.animations")}</span>
              <div style="display:flex;flex-wrap:wrap;gap:5px">
                {ANIMATIONS.map((a) => {
                  const warn = [...missing.values()].some((m) => m.includes(a.id));
                  return (
                    <button class={`chip ${animations.includes(a.id) ? "on" : ""} ${warn ? "warn" : ""}`} onClick={() => toggleAnim(a.id)}>
                      {t(`anim.${a.id}`)}
                      {warn && <span class="dot" />}
                    </button>
                  );
                })}
                <button class="chip" style="border:none;color:var(--accent)" onClick={() => setAnimations(ANIMATIONS.map((a) => a.id))}>{t("export.all")}</button>
                <button class="chip" style="border:none;color:var(--accent)" onClick={() => setAnimations([])}>{t("export.none")}</button>
              </div>
            </>
          )}
        </div>

        <div style="display:flex;flex-direction:column;gap:10px;background:var(--bg);border-radius:8px;padding:14px;border:1px solid var(--line)">
          <span class="heading">{t("export.result")}</span>
          {target === "unity" && plan && (
            <>
              <div class="mono" style="display:flex;flex-direction:column;gap:2px;color:var(--muted);max-height:260px;overflow-y:auto">
                <span style="color:var(--text)">{delivery === "folder" ? unityDir || "…" : `${plan.variant}_unity.zip`}</span>
                {plan.sheets.map((s) => (
                  <span>├─ {s.file} <span class="dim">{s.page.columns * s.page.cellSize}×{s.page.rows * s.page.cellSize}</span></span>
                ))}
                <span>├─ manifest.json</span>
                <span>├─ character.json</span>
                <span>├─ CREDITS.txt</span>
                <span>└─ CREDITS.csv</span>
              </div>
              <div class="mono" style="padding:10px 12px;border-radius:6px;border:1px solid var(--line-2);display:flex;flex-direction:column;gap:3px;color:#b0b0ba">
                <span class="dim">manifest.json</span>
                {plan.pages.map((p) => (
                  <span>"{p.code}": {p.columns}×{p.rows} @ {p.cellSize}px{p.layout ? ` (${p.layout})` : ""}</span>
                ))}
                {Object.entries(plan.manifest.drawOrder).map(([slot, o]) => (
                  <span>drawOrder {slot}: {JSON.stringify(o)}</span>
                ))}
              </div>
              {Object.keys(plan.manifest.missing).length > 0 && (
                <div class="warnbox" style="margin:0">
                  <Icon.Warn size={16} />
                  <div>
                    {Object.entries(plan.manifest.missing).map(([slot, pages]) => (
                      <div class="t">{t("export.missing", { slot: slotName(slot), pages: pages.map((p) => pageName(plan, p)).join(", ") })}</div>
                    ))}
                    <div class="d">{t("export.missingHint")}</div>
                  </div>
                </div>
              )}
            </>
          )}
          {target === "flat" && (
            <div class="mono" style="display:flex;flex-direction:column;gap:2px;color:var(--muted)">
              <span style="color:var(--text)">{delivery === "folder" ? flatDir || "…" : "ZIP"}</span>
              {flatMode === "animations" && animations.map((a) => <span>├─ {a}.png</span>)}
              {flatMode === "universal" && <span>├─ universal.png <span class="dim">832×3456{"+"}</span></span>}
              {flatMode === "frames" && <span>├─ frames/&lt;animation&gt;/&lt;direction&gt;_NN.png</span>}
              <span>├─ character.json</span>
              <span>├─ CREDITS.txt</span>
              <span>└─ CREDITS.csv</span>
            </div>
          )}
          {target === "character" && <div class="dim" style="font-size:12px">{t("export.char.hint")}</div>}
          {busy && (
            <div style="height:4px;background:var(--line);border-radius:2px;overflow:hidden">
              <div style={`height:100%;width:${busy.total ? Math.round((busy.done / busy.total) * 100) : 0}%;background:var(--accent);transition:width .2s`} />
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function DeliveryRow({ delivery, setDelivery, dir, setDir, defaultDir }: { delivery: Delivery; setDelivery: (d: Delivery) => void; dir: string; setDir: (s: string) => void; defaultDir?: string }) {
  return (
    <>
      <div class="row">
        <label>{t("export.delivery")}</label>
        <div class="seg">
          <button class={delivery === "folder" ? "on" : ""} onClick={() => setDelivery("folder")}>{t("export.toFolder")}</button>
          <button class={delivery === "zip" ? "on" : ""} onClick={() => setDelivery("zip")}>{t("export.zip")}</button>
        </div>
      </div>
      {delivery === "folder" && (
        <div class="row">
          <label>{t("export.folder")}</label>
          <input type="text" value={dir} onInput={(e) => setDir((e.target as HTMLInputElement).value)} spellcheck={false} />
          {defaultDir && dir !== defaultDir && (
            <button class="btn sm" onClick={() => setDir(defaultDir)}>{t("export.default")}</button>
          )}
        </div>
      )}
    </>
  );
}
