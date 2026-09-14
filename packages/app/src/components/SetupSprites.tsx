import { useEffect, useState } from "preact/hooks";
import { catalogStatus } from "../state/store.ts";
import { t } from "../i18n/i18n.ts";
import { Icon } from "./icons.tsx";
import { GoatProgress } from "./GoatProgress.tsx";
import { errorText, Warn, type SetupState, type SpritesReport } from "./SetupScreen.tsx";

interface Entry {
  name: string;
  path: string;
  matched: number;
}

interface Listing {
  path: string;
  parent: string | null;
  entries: Entry[];
  report: SpritesReport;
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

const parentOf = (p: string) => p.replace(/[\\/][^\\/]*$/, "");
const childOf = (p: string, name: string, win: boolean) => `${p.replace(/[\\/]+$/, "")}${win ? "\\" : "/"}${name}`;
const quoted = (p: string) => (p.includes(" ") ? `"${p}"` : p);

/**
 * The commands from the README, with the target already filled in. Nothing is
 * translated here on purpose: a command is typed, not read, and a translated
 * one would be a command that does not work.
 */
function cloneCommand(repo: string, ref: string, target: string): string {
  return [
    `git clone --filter=blob:none --no-checkout --sparse ${repo} ${quoted(target)}`,
    `cd ${quoted(target)}`,
    `git sparse-checkout set spritesheets`,
    `git checkout ${ref}`,
  ].join("\n");
}

interface Props {
  state: SetupState;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  refresh: () => Promise<void>;
}

/**
 * The second half, and the one people get stuck on: a gigabyte of sprites that
 * PixyGoat may not ship. So this does not just offer a folder browser - it
 * says what the sprites are, what they cost, hands over the command with the
 * target already in it, and then watches the folder so nobody has to come back
 * and guess whether it worked.
 */
export function SpritesStep({ state, busy, setBusy, refresh }: Props) {
  const [way, setWay] = useState<"have" | "need">(state.sprites.suggestions.length > 0 ? "have" : "need");
  const [error, setError] = useState<{ text: string; detail?: string } | null>(null);

  const choose = async (path: string) => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/setup/sprites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setBusy(false);
        setError({
          text:
            body.error === "not-a-sprites-dir"
              ? t("setup.notSprites", { dir: path })
              : errorText(body.error, body.error ?? `HTTP ${res.status}`),
        });
        return;
      }
      // The server restarts onto the new folder; the catalog poll picks it up.
      catalogStatus.value = { state: "building", message: t("setup.starting") };
      await refresh();
    } catch (err) {
      setBusy(false);
      setError({ text: (err as Error).message });
    }
  };

  return (
    <>
      {error && <Warn text={error.text} detail={error.detail} />}
      {state.sprites.ignored.map((i) => (
        <div class="warnbox" key={i.path}>
          <Icon.Warn size={16} />
          <div>
            <div class="t">{t("setup.ignored", { source: i.source, dir: i.path })}</div>
          </div>
        </div>
      ))}

      <div class="ways">
        <button class={`btn sm ${way === "have" ? "primary" : ""}`} onClick={() => setWay("have")}>
          {t("setup.sprites.haveIt")}
        </button>
        <button class={`btn sm ${way === "need" ? "primary" : ""}`} onClick={() => setWay("need")}>
          {t("setup.sprites.needIt")}
        </button>
      </div>

      {way === "have" ? (
        <HaveThem state={state} busy={busy} choose={choose} />
      ) : (
        <GetThem state={state} busy={busy} choose={choose} />
      )}
    </>
  );
}

function HaveThem({
  state,
  busy,
  choose,
}: {
  state: SetupState;
  busy: boolean;
  choose: (path: string) => Promise<void>;
}) {
  const [listing, setListing] = useState<Listing | null>(null);
  const [manual, setManual] = useState("");
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    void browse(state.sprites.places[0]);
  }, []);

  const report = listing?.report;

  return (
    <>
      {state.sprites.suggestions.length > 0 && (
        <div class="found">
          <div class="dim">{t("setup.sprites.suggested")}</div>
          {state.sprites.suggestions.map((s) => (
            <button class="dirrow hit" key={s.path} disabled={busy} onClick={() => void choose(s.path)}>
              <Icon.Folder size={14} />
              <span class="name mono">{s.path}</span>
              <span class="badge">{t("setup.looksRight", { n: s.matched })}</span>
              <Icon.Check size={13} />
            </button>
          ))}
        </div>
      )}

      <div class="dim">{t("setup.sprites.browseHint")}</div>

      <div class="places">
        {state.sprites.places.map((p) => (
          <button class="chip" key={p} onClick={() => void browse(p)}>
            {p}
          </button>
        ))}
      </div>

      <div class="crumbs mono">
        <button class="btn sm" disabled={!listing?.parent} onClick={() => void browse(listing!.parent!)}>
          <Icon.Up size={13} />
        </button>
        {listing &&
          crumbs(listing.path).map((c) => (
            <button class="linkish" key={c.path} onClick={() => void browse(c.path)}>
              {c.label}
            </button>
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
        <button class="btn sm" onClick={() => void browse(manual)}>
          {t("setup.go")}
        </button>
      </div>

      {error && <Warn text={error} />}

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
    </>
  );
}

/** How often to look whether the download has produced a folder yet. */
const WATCH_MS = 2000;

function GetThem({
  state,
  busy,
  choose,
}: {
  state: SetupState;
  busy: boolean;
  choose: (path: string) => Promise<void>;
}) {
  const win = state.platform === "win32";
  const [target, setTarget] = useState(childOf(parentOf(state.sprites.path), "lpc", win));
  const [copied, setCopied] = useState(false);
  const [report, setReport] = useState<SpritesReport | null>(null);

  const watched = childOf(target, "spritesheets", win);
  const command = cloneCommand(state.upstream.repo, state.upstream.ref, target);

  // Watching costs one readdir every two seconds, and it is the difference
  // between "did that work?" and seeing it work.
  useEffect(() => {
    setReport(null);
    let alive = true;
    const look = async () => {
      try {
        const res = await fetch(`/api/setup/probe?path=${encodeURIComponent(watched)}`);
        if (!res.ok) return;
        const body = (await res.json()) as { report: SpritesReport };
        if (alive) setReport(body.report);
      } catch {
        /* the server may be restarting; the next tick tries again */
      }
    };
    void look();
    const id = setInterval(() => void look(), WATCH_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [watched]);

  const copy = () => {
    void navigator.clipboard?.writeText(command).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <>
      <p class="prose">{t("setup.get.what")}</p>
      <div class="note">{t("setup.get.cost")}</div>

      <div class="row manual">
        <label>{t("setup.get.target")}</label>
        <input type="text" value={target} spellcheck={false} onInput={(e) => setTarget((e.target as HTMLInputElement).value)} />
      </div>

      <div class="cmd">
        <div class="cmd-head">
          <span class="dim">{t("setup.get.command")}</span>
          <button class="btn sm" onClick={copy}>
            {copied ? <Icon.Check size={13} /> : <Icon.Save size={13} />}
            {copied ? t("setup.get.copied") : t("setup.get.copy")}
          </button>
        </div>
        <pre class="mono">{command}</pre>
      </div>

      <div class="note">
        {t("setup.get.nogit")}{" "}
        <a href={state.upstream.zipUrl} target="_blank" rel="noreferrer">
          {t("setup.get.zip")} <Icon.Link size={11} />
        </a>
      </div>

      <div class="watch">
        {report?.usable ? (
          <>
            <div class="hit">
              <Icon.Check size={16} />
              {t("setup.get.appeared", { n: report.matched.length, total: report.expected })}
            </div>
            <button class="btn primary" disabled={busy} onClick={() => void choose(watched)}>
              <Icon.Check size={14} />
              {busy ? t("setup.saving") : t("setup.get.use")}
            </button>
          </>
        ) : (
          <GoatProgress label={t("setup.get.waiting", { dir: watched })} detail={t("setup.get.waitingHint")} />
        )}
      </div>
    </>
  );
}
