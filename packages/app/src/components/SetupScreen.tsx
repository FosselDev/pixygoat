import { useEffect, useState } from "preact/hooks";
import { catalogStatus } from "../state/store.ts";
import { LANGUAGES, language, setLanguage, t } from "../i18n/i18n.ts";
import { Icon } from "./icons.tsx";
import { GoatProgress } from "./GoatProgress.tsx";

interface Entry {
  name: string;
  path: string;
  matched: number;
}

interface Report {
  path: string;
  exists: boolean;
  matched: string[];
  expected: number;
  usable: boolean;
}

interface Listing {
  path: string;
  parent: string | null;
  entries: Entry[];
  report: Report;
}

interface SetupState {
  spritesRoot: string;
  source: string;
  ignored: { source: string; path: string }[];
  settingsFile: string;
  places: string[];
}

/** "E:\\00_dev\\01_tools" becomes clickable pieces back up to the drive. */
function crumbs(path: string): { label: string; path: string }[] {
  const sep = path.includes("\\") ? "\\" : "/";
  const parts = path.split(sep).filter((p, i) => p !== "" || i === 0);
  return parts.map((part, i) => ({
    label: part || sep,
    path: i === 0 ? (part || sep) + (sep === "\\" ? sep : "") : parts.slice(0, i + 1).join(sep),
  }));
}

/**
 * First start without a sprite folder. A browser file picker never yields a
 * real path, so the server lists the directory tree and this walks through it;
 * folders that hold what the catalog needs are marked, so the right one can be
 * recognised without knowing what an LPC checkout looks like.
 */
export function SetupScreen() {
  const [state, setState] = useState<SetupState | null>(null);
  const [listing, setListing] = useState<Listing | null>(null);
  const [manual, setManual] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);

  const browse = async (path?: string) => {
    setError(null);
    setReading(true);
    try {
      const res = await fetch(`/api/setup/browse?path=${encodeURIComponent(path ?? "")}`);
      const body = (await res.json()) as Listing & { error?: string };
      if (!res.ok || body.error) {
        setError(t("setup.cannotOpen", { dir: path ?? "", error: body.error ?? `HTTP ${res.status}` }));
        return;
      }
      setListing(body);
      setManual(body.path);
    } finally {
      setReading(false);
    }
  };

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/setup/state");
      const body = (await res.json()) as SetupState;
      setState(body);
      await browse(body.places[0]);
    })();
  }, []);

  const choose = async (path: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/setup/sprites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string; report?: Report };
      if (!res.ok || !body.ok) {
        setError(
          body.error === "not-a-sprites-dir"
            ? t("setup.notSprites", { dir: path })
            : body.error === "not-found"
              ? t("setup.notFound", { dir: path })
              : (body.error ?? `HTTP ${res.status}`),
        );
        return;
      }
      // The server restarts onto the new folder; the catalog poll picks it up.
      catalogStatus.value = { state: "building", message: t("setup.starting") };
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const report = listing?.report;

  return (
    <div class="setup">
      <div class="setup-card">
        <header>
          <div class="goat"><Icon.Goat size={64} /></div>
          <div>
            <h1>{t("setup.title")}</h1>
            <p>{t("setup.lead")}</p>
          </div>
          <label class="lang" title={t("start.language")}>
            <Icon.Globe size={13} />
            <select value={language.value} onChange={(e) => setLanguage((e.target as HTMLSelectElement).value)}>
              {LANGUAGES.map((l) => <option value={l.id} key={l.id}>{l.label}</option>)}
            </select>
          </label>
        </header>

        {state && state.source !== "default" && (
          <div class="note mono">{t(`setup.from.${state.source}`, { dir: state.spritesRoot })}</div>
        )}
        {state?.ignored.map((i) => (
          <div class="warnbox" key={i.path}>
            <Icon.Warn size={16} />
            <div><div class="t">{t("setup.ignored", { source: i.source, dir: i.path })}</div></div>
          </div>
        ))}

        <div class="places">
          {state?.places.map((p) => (
            <button class="chip" key={p} onClick={() => void browse(p)}>{p}</button>
          ))}
        </div>

        <div class="crumbs mono">
          <button class="btn sm" disabled={!listing?.parent} onClick={() => void browse(listing!.parent!)}>
            <Icon.Up size={13} />
          </button>
          {listing && crumbs(listing.path).map((c) => (
            <button class="linkish" key={c.path} onClick={() => void browse(c.path)}>{c.label}</button>
          ))}
        </div>

        <div class={`dirlist ${reading ? "reading" : ""}`}>
          {reading && (
            <div class="dirlist-wait">
              <GoatProgress label={t("setup.reading")} detail={manual} />
            </div>
          )}
          {listing?.entries.length === 0 && <div class="empty dim">{t("setup.noFolders")}</div>}
          {listing?.entries.map((e) => (
            <button class={`dirrow ${e.matched >= 2 ? "hit" : ""}`} key={e.path} onClick={() => void browse(e.path)}>
              <Icon.Folder size={14} />
              <span class="name">{e.name}</span>
              {e.matched >= 2 && <span class="badge">{t("setup.looksRight", { n: e.matched })}</span>}
              <Icon.Right size={13} />
            </button>
          ))}
        </div>

        <div class="row manual">
          <label>{t("setup.path")}</label>
          <input
            type="text"
            value={manual}
            spellcheck={false}
            onInput={(e) => setManual((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => e.key === "Enter" && void browse(manual)}
          />
          <button class="btn sm" onClick={() => void browse(manual)}>{t("setup.go")}</button>
        </div>

        {error && (
          <div class="warnbox">
            <Icon.Warn size={16} />
            <div><div class="t">{error}</div></div>
          </div>
        )}

        <footer>
          <span class="mono dim left">
            {report?.usable
              ? t("setup.found", { n: report.matched.length, names: report.matched.slice(0, 6).join(", ") })
              : t("setup.hint")}
          </span>
          <button class="btn primary" disabled={busy || !report?.usable} onClick={() => void choose(listing!.path)}>
            <Icon.Check size={14} />
            {busy ? t("setup.saving") : t("setup.use")}
          </button>
        </footer>
      </div>

      <p class="setup-help">
        {t("setup.where")}{" "}
        <a href="https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator" target="_blank" rel="noreferrer">
          Universal-LPC-Spritesheet-Character-Generator <Icon.Link size={11} />
        </a>
      </p>
    </div>
  );
}
