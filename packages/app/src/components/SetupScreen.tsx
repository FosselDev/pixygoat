import { useEffect, useState } from "preact/hooks";
import { LANGUAGES, language, setLanguage, t } from "../i18n/i18n.ts";
import { Icon } from "./icons.tsx";
import { GoatProgress } from "./GoatProgress.tsx";
import { SpritesStep } from "./SetupSprites.tsx";

export interface Ignored {
  source: string;
  path: string;
}

export interface SpritesReport {
  path: string;
  exists: boolean;
  matched: string[];
  expected: number;
  usable: boolean;
}

export interface DefinitionsReport {
  path: string;
  exists: boolean;
  count: number;
  nested: number;
  usable: boolean;
}

export type FetchJob =
  | { state: "running"; phase: string; message: string }
  | { state: "done"; path: string; count: number; commit: string }
  | { state: "error"; code: string; message: string; detail?: string };

export interface SetupState {
  done: boolean;
  settingsFile: string;
  platform: string;
  definitions: { configured: boolean; path: string; source: string; count: number; ignored: Ignored[] };
  sprites: {
    configured: boolean;
    path: string;
    source: string;
    ignored: Ignored[];
    places: string[];
    suggestions: { path: string; matched: number }[];
  };
  upstream: { repo: string; web: string; ref: string; definitionsPath: string; zipUrl: string; fetchTarget: string };
  fetch: FetchJob | null;
}

export async function readSetupState(): Promise<SetupState | null> {
  try {
    const res = await fetch("/api/setup/state");
    return res.ok ? ((await res.json()) as SetupState) : null;
  } catch {
    // Committing a step restarts the server, so a failed poll is normal.
    return null;
  }
}

/** Server error codes become sentences; anything unknown keeps its own words. */
export function errorText(code: string | undefined, fallback: string): string {
  if (!code) return fallback;
  const text = t(`setup.err.${code}`);
  return text === `setup.err.${code}` ? fallback : text;
}

export function Warn({ text, detail }: { text: string; detail?: string }) {
  return (
    <div class="warnbox">
      <Icon.Warn size={16} />
      <div>
        <div class="t">{text}</div>
        {detail && <div class="d mono">{detail}</div>}
      </div>
    </div>
  );
}

/**
 * First start. Two things are missing and they are asked for in this order:
 * the sheet definitions, then the sprites they describe - the definitions are
 * what says which folders a sprite directory should contain, so the folder
 * browser cannot judge anything before they are here.
 *
 * Every step ends with a server restart, because the configuration is read
 * once at start. That is why the state is polled rather than trusted: the
 * answer during those few hundred milliseconds is no answer at all.
 */
export function SetupScreen() {
  const [state, setState] = useState<SetupState | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const next = await readSetupState();
    if (!next) return;
    setState(next);
    // A failed fetch has to end the waiting too, or the progress bar sits
    // there forever and the message explaining why never gets drawn.
    if (next.definitions.configured || next.done || next.fetch?.state === "error") setBusy(false);
  };

  useEffect(() => {
    void refresh();
  }, []);

  const running = busy || state?.fetch?.state === "running";
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => void refresh(), 1000);
    return () => clearInterval(id);
  }, [running]);

  const step = state && state.definitions.configured ? 2 : 1;

  return (
    <div class="setup">
      <div class="setup-card">
        <header>
          <div class="goat">
            <Icon.Goat size={64} />
          </div>
          <div>
            <h1>{step === 1 ? t("setup.def.title") : t("setup.sprites.title")}</h1>
            <p>{step === 1 ? t("setup.def.lead") : t("setup.sprites.lead")}</p>
          </div>
          <label class="lang" title={t("start.language")}>
            <Icon.Globe size={13} />
            <select value={language.value} onChange={(e) => setLanguage((e.target as HTMLSelectElement).value)}>
              {LANGUAGES.map((l) => (
                <option value={l.id} key={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
        </header>

        <ol class="steps">
          <li class={step === 1 ? "on" : "done"}>
            {step === 1 ? <span class="n">1</span> : <Icon.Check size={13} />}
            {t("setup.steps.definitions")}
            {state?.definitions.configured && (
              <span class="dim"> · {t("setup.def.ready", { n: state.definitions.count })}</span>
            )}
          </li>
          <li class={step === 2 ? "on" : ""}>
            <span class="n">2</span>
            {t("setup.steps.sprites")}
          </li>
        </ol>

        {!state && <GoatProgress label={t("setup.loading")} />}

        {state && step === 1 && <DefinitionsStep state={state} busy={busy} setBusy={setBusy} refresh={refresh} />}
        {state && step === 2 && <SpritesStep state={state} busy={busy} setBusy={setBusy} refresh={refresh} />}
      </div>

      <p class="setup-help">
        {t("setup.where")}{" "}
        <a href={state?.upstream.web ?? "https://lpc.opengameart.org/"} target="_blank" rel="noreferrer">
          Universal-LPC-Spritesheet-Character-Generator <Icon.Link size={11} />
        </a>
      </p>
    </div>
  );
}

interface StepProps {
  state: SetupState;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  refresh: () => Promise<void>;
}

/**
 * Three megabytes from the generator repository, or a folder somebody already
 * has. The source is editable because a fork, a mirror or a newer commit are
 * all legitimate - and because the one prefilled here is the snapshot this
 * version was built against.
 */
function DefinitionsStep({ state, busy, setBusy, refresh }: StepProps) {
  const [repo, setRepo] = useState(state.upstream.repo);
  const [ref, setRef] = useState(state.upstream.ref);
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState("");
  const [error, setError] = useState<{ text: string; detail?: string } | null>(null);

  const job = state.fetch;

  const start = async () => {
    setError(null);
    setBusy(true);
    try {
      await fetch("/api/setup/definitions/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo, ref }),
      });
      await refresh();
    } catch (err) {
      setBusy(false);
      setError({ text: (err as Error).message });
    }
  };

  const useFolder = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/setup/definitions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string; report?: DefinitionsReport };
      if (!res.ok || !body.ok) {
        setBusy(false);
        setError({
          text: errorText(body.error, body.error ?? `HTTP ${res.status}`),
          detail: body.report ? `${body.report.count} JSON, ${body.report.nested} in subfolders` : undefined,
        });
        return;
      }
      await refresh();
    } catch (err) {
      setBusy(false);
      setError({ text: (err as Error).message });
    }
  };

  if (job?.state === "running" || (busy && !error)) {
    return (
      <div class="waitbox">
        <GoatProgress label={t("setup.def.fetching")} detail={job?.state === "running" ? job.message : repo} />
      </div>
    );
  }

  return (
    <>
      {job?.state === "error" && <Warn text={errorText(job.code, job.message)} detail={job.detail} />}
      {error && <Warn text={error.text} detail={error.detail} />}

      <div class="row wrap">
        <button class="btn primary" onClick={() => void start()} disabled={busy}>
          <Icon.Load size={14} />
          {t("setup.def.fetch")}
        </button>
        <span class="dim src">
          {t("setup.def.source", { repo: repo.replace(/^https:\/\/(www\.)?/, "").replace(/\.git$/, "") })}{" "}
          <span class="mono">{t("setup.def.atRef", { ref: ref.length === 40 ? ref.slice(0, 11) : ref })}</span>
        </span>
        <button class="linkish sm" onClick={() => setOpen(!open)}>
          {t("setup.def.change")}
          <Icon.ChevronDown size={12} />
        </button>
      </div>

      {open && (
        <div class="fields">
          <label>
            {t("setup.def.repo")}
            <input type="text" value={repo} spellcheck={false} onInput={(e) => setRepo((e.target as HTMLInputElement).value)} />
          </label>
          <label>
            {t("setup.def.ref")}
            <input type="text" value={ref} spellcheck={false} onInput={(e) => setRef((e.target as HTMLInputElement).value)} />
          </label>
        </div>
      )}

      <div class="sep">{t("setup.def.or")}</div>

      <div class="row manual">
        <label>{t("setup.def.have")}</label>
        <input
          type="text"
          value={path}
          spellcheck={false}
          placeholder={`…${state.upstream.definitionsPath}`}
          onInput={(e) => setPath((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => e.key === "Enter" && path && void useFolder()}
        />
        <button class="btn sm" disabled={!path || busy} onClick={() => void useFolder()}>
          {t("setup.def.check")}
        </button>
      </div>
    </>
  );
}
