import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { ANIMATIONS, BODY_TYPES, parseCharacter, type CharacterDocument } from "@pixygoat/core";
import { catalog, draft, layersForDocument, openInEditor, starterCharacter, toast, ui } from "../state/store.ts";
import { readDroppedFile } from "../state/persistence.ts";
import { composeFrame } from "../render/renderer.ts";
import { LANGUAGES, language, setLanguage, t } from "../i18n/i18n.ts";
import { Icon } from "./icons.tsx";
import { StartBackdrop } from "./StartBackdrop.tsx";

interface Entry {
  file: string;
  name: string;
  bodyType?: string;
  modifiedAt: string;
  document?: unknown;
}

/**
 * One character drawn from its own document. The start screen shows a dozen of
 * these, so the frame is composed once and kept as long as the document is.
 */
function CharacterPreview({ document, size = 112 }: { document: CharacterDocument; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let cancelled = false;
    const layers = layersForDocument(document);
    void composeFrame(layers, "walk", 2, 0).then((frame) => {
      if (cancelled || !frame) return;
      const c = canvas.getContext("2d")!;
      c.imageSmoothingEnabled = false;
      c.clearRect(0, 0, canvas.width, canvas.height);
      const cell = frame.set.cellSize;
      c.drawImage(frame.canvas, 0, 0, cell, cell, 0, 0, canvas.width, canvas.height);
    });
    return () => {
      cancelled = true;
    };
  }, [document]);
  return <canvas ref={ref} width={size} height={size} class="px" style={`width:${size}px;height:${size}px`} />;
}

/** The unobtrusive corner switch. Remembers the choice; English until told. */
function LanguagePicker() {
  return (
    <label class="lang" title={t("start.language")}>
      <Icon.Globe size={13} />
      <select
        value={language.value}
        onChange={(e) => setLanguage((e.target as HTMLSelectElement).value)}
      >
        {LANGUAGES.map((l) => (
          <option value={l.id} key={l.id}>{l.label}</option>
        ))}
      </select>
    </label>
  );
}

export function StartScreen() {
  const cat = catalog.value;
  const [list, setList] = useState<Entry[] | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void fetch("/api/characters")
      .then((r) => r.json() as Promise<{ characters: Entry[] }>)
      .then((b) => setList(b.characters.slice(0, 12)))
      .catch(() => setList([]));
  }, []);

  // The crowd in the background is built once the saved characters are known,
  // and not again: rebuilding it would make everyone jump back to the kerb.
  const cast = useMemo(() => {
    const docs: CharacterDocument[] = [];
    for (const e of list ?? []) {
      const parsed = parseCharacter(e.document);
      if (parsed.ok) docs.push(parsed.doc);
    }
    return docs;
  }, [list]);

  const openSaved = (e: Entry) => {
    const parsed = parseCharacter(e.document);
    if (parsed.ok) {
      openInEditor(parsed.doc);
      return;
    }
    // Broken or missing payload: fall back to the file itself.
    void fetch(`/api/characters/${encodeURIComponent(e.file)}`)
      .then((r) => r.json())
      .then((json) => {
        const p = parseCharacter(json);
        if (p.ok) openInEditor(p.doc);
        else toast(t("load.error", { error: p.error }), "error");
      })
      .catch((err: Error) => toast(t("load.error", { error: err.message }), "error"));
  };

  const pickFile = () => {
    const input = window.document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = () => {
      const f = input.files?.[0];
      if (f) void readDroppedFile(f);
    };
    input.click();
  };

  const scrollDown = () => {
    scroller.current?.scrollTo({ top: scroller.current.clientHeight, behavior: "smooth" });
  };

  const items = cat?.items.filter((i) => i.available).length ?? 0;
  const d = draft.value;
  const saved = list?.length ?? 0;

  return (
    <div
      class="start"
      ref={scroller}
      onScroll={(e) => setScrolled((e.currentTarget as HTMLDivElement).scrollTop > 24)}
    >
      {list !== null && <StartBackdrop documents={cast} />}

      <div class="hero">
        <LanguagePicker />
        <div class="logo"><Icon.Goat size={128} /></div>
        <h1>{t("app.name")}</h1>
        <p class="tagline">{t("start.tagline")}</p>
        <p class="pitch">{t("start.pitch", { n: items })}</p>
        <p class="stats mono">{t("start.stats", { items, bodies: BODY_TYPES.length, anims: ANIMATIONS.length })}</p>

        <button class={`scroll-hint ${scrolled ? "gone" : ""}`} onClick={scrollDown}>
          <span>{saved > 0 || d ? t("start.scrollRecent") : t("start.scrollStart")}</span>
          <Icon.ChevronDown size={16} />
        </button>
      </div>

      <div class={`recent ${scrolled ? "in" : ""}`}>
        <div class="recent-head">
          <span class="heading">{t("start.recent")}</span>
          <button class="btn sm" onClick={pickFile}><Icon.Load size={13} />{t("load.fromFile")}</button>
        </div>
        <div class="cards">
          <button class="char-card new" onClick={() => openInEditor(starterCharacter())}>
            <div class="thumb"><Icon.Plus size={40} /></div>
            <span class="name">{t("start.new")}</span>
            <span class="sub">{t("start.newHint")}</span>
          </button>

          {d && (
            <button class="char-card draft" onClick={() => openInEditor(d, true)} title={t("start.draft")}>
              <div class="thumb checker"><CharacterPreview document={d} /></div>
              <span class="name">{d.name}</span>
              <span class="sub">{t("start.draftHint")}</span>
            </button>
          )}

          {list === null
            ? null
            : list.map((e) => {
                const parsed = parseCharacter(e.document);
                return (
                  <button class="char-card" key={e.file} onClick={() => openSaved(e)} title={t("start.open")}>
                    <div class="thumb checker">
                      {parsed.ok ? <CharacterPreview document={parsed.doc} /> : <Icon.Warn size={20} />}
                    </div>
                    <span class="name">{e.name}</span>
                    <span class="sub">
                      {e.bodyType ? `${t(`body.${e.bodyType}`)} · ` : ""}
                      {new Date(e.modifiedAt).toLocaleDateString()}
                    </span>
                  </button>
                );
              })}

          {list !== null && list.length === 0 && !d && <span class="empty dim">{t("start.empty")}</span>}
        </div>

        <footer class="colophon">
          <span>{t("footer.by")}</span>
          <span class="dot">·</span>
          <span>{t("footer.wibecoded")}</span>
          <span class="dot">·</span>
          <span>{t("footer.license")}</span>
          <span class="dot">·</span>
          <button class="linkish" onClick={() => (ui.view.value = "about")}>{t("footer.about")}</button>
        </footer>
      </div>
    </div>
  );
}
