import { useEffect, useRef, useState } from "preact/hooks";
import { ANIMATIONS, BODY_TYPES, parseCharacter, type CharacterDocument } from "@pixygoat/core";
import { catalog, draft, layersForDocument, openInEditor, starterCharacter, toast } from "../state/store.ts";
import { readDroppedFile } from "../state/persistence.ts";
import { composeFrame } from "../render/renderer.ts";
import { t } from "../i18n/i18n.ts";
import { Icon } from "./icons.tsx";

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

export function StartScreen() {
  const cat = catalog.value;
  const [list, setList] = useState<Entry[] | null>(null);

  useEffect(() => {
    void fetch("/api/characters")
      .then((r) => r.json() as Promise<{ characters: Entry[] }>)
      .then((b) => setList(b.characters.slice(0, 12)))
      .catch(() => setList([]));
  }, []);

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

  const items = cat?.items.filter((i) => i.available).length ?? 0;
  const d = draft.value;

  return (
    <div class="start">
      <div class="hero">
        <div class="logo"><Icon.Goat size={128} /></div>
        <h1>{t("app.name")}</h1>
        <p class="tagline">{t("start.tagline")}</p>
        <p class="pitch">{t("start.pitch", { n: items })}</p>
        <p class="stats mono">{t("start.stats", { items, bodies: BODY_TYPES.length, anims: ANIMATIONS.length })}</p>
      </div>

      <div class="recent">
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
      </div>
    </div>
  );
}
