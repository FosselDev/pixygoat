import { useEffect, useRef, useState } from "preact/hooks";
import { ANIMATIONS, buildFrameSet, DIRECTIONS, getAnimation, type Direction } from "@pixygoat/core";
import { coverage, doc, drawLayers, otherBodyTypes, slotStates, ui, type Background } from "../state/store.ts";
import { SheetCache, layerSignature, type ComposedSheet } from "../render/renderer.ts";
import { loadSprites } from "../render/images.ts";
import { slotLabel, t, tn } from "../i18n/i18n.ts";
import { Icon } from "./icons.tsx";

const cache = new SheetCache();
const DIR_ICON: Record<Direction, () => preact.JSX.Element> = { up: () => <Icon.Up size={14} />, left: () => <Icon.Left size={14} />, down: () => <Icon.Down size={14} />, right: () => <Icon.Right size={14} /> };

export function PreviewPanel() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [sheet, setSheet] = useState<ComposedSheet | null>(null);
  const [frameIdx, setFrameIdx] = useState(0);
  const [boxWidth, setBoxWidth] = useState(392);

  const layers = drawLayers.value;
  const animation = ui.animation.value;
  const direction = ui.direction.value;
  const all = ui.allDirections.value;
  const zoomWanted = ui.zoom.value;
  const playing = ui.playing.value;
  const speed = ui.speed.value;
  const bg = ui.background.value;
  const grid = ui.grid.value;
  const explode = ui.explode.value;
  const missing = coverage.value;
  const states = slotStates.value;

  // compose the sheet for the current layers + animation
  useEffect(() => {
    let cancelled = false;
    cache.invalidate(layerSignature(layers));
    void cache.get(layers, animation).then((s) => {
      if (!cancelled) setSheet(s);
    });
    return () => {
      cancelled = true;
    };
  }, [layers, animation]);

  // measure the preview box
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxWidth(el.clientWidth - 2));
    ro.observe(el);
    setBoxWidth(el.clientWidth - 2);
    return () => ro.disconnect();
  }, []);

  // animation clock
  useEffect(() => {
    if (!sheet) return;
    const cycle = sheet.set.cycle;
    if (!playing) return;
    let i = 0;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const dt = sheet.set.frameMs / speed;
      if (now - last >= dt) {
        last = now;
        i = (i + 1) % cycle.length;
        setFrameIdx(i);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelRAF(raf);
  }, [sheet, playing, speed]);

  const cell = sheet?.set.cellSize ?? 64;
  const rows = sheet?.set.rows ?? 4;
  const cycle = sheet?.set.cycle ?? [0];
  const column = cycle[frameIdx % cycle.length] ?? 0;
  const dirRow = rows === 1 ? 0 : DIRECTIONS.indexOf(direction);
  const cellsAcross = all && rows === 4 ? 2 : 1;
  const maxZoom = Math.max(1, Math.floor(boxWidth / (cell * cellsAcross)));
  const zoom = Math.min(zoomWanted, maxZoom);
  const cw = cell * zoom * cellsAcross;
  const ch = cell * zoom * (all && rows === 4 ? 2 : 1);

  // draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = cw;
    canvas.height = ch;
    const c = canvas.getContext("2d")!;
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, cw, ch);
    if (!sheet) return;
    const drawCell = (r: number, dx: number, dy: number) => {
      if (explode) {
        void drawExploded(c, sheet, r, column, dx, dy, zoom, layers.length);
      } else {
        c.drawImage(sheet.canvas, column * cell, r * cell, cell, cell, dx, dy, cell * zoom, cell * zoom);
      }
    };
    if (all && rows === 4) {
      const order: Direction[] = ["up", "left", "down", "right"];
      order.forEach((dir, i) => drawCell(DIRECTIONS.indexOf(dir), (i % 2) * cell * zoom, Math.floor(i / 2) * cell * zoom));
    } else {
      drawCell(dirRow, 0, 0);
    }
    if (grid) {
      c.strokeStyle = "rgba(232,163,60,0.45)";
      c.lineWidth = 1;
      const step = 8 * zoom;
      for (let x = 0; x <= cw; x += step) {
        c.beginPath();
        c.moveTo(x + 0.5, 0);
        c.lineTo(x + 0.5, ch);
        c.stroke();
      }
      for (let y = 0; y <= ch; y += step) {
        c.beginPath();
        c.moveTo(0, y + 0.5);
        c.lineTo(cw, y + 0.5);
        c.stroke();
      }
      // cell borders
      c.strokeStyle = "rgba(232,163,60,0.9)";
      c.strokeRect(0.5, 0.5, cell * zoom - 1, cell * zoom - 1);
    }
  }, [sheet, column, dirRow, all, zoom, cw, ch, grid, explode, layers]);

  const animDef = getAnimation(animation);
  const bgClass: Record<Background, string> = { checker: "checker", green: "bg-green", dark: "bg-dark", light: "bg-light" };
  const missingHere = states.filter((s) => s.visible && s.item && missing.get(s.type)?.includes(animation));

  return (
    <div class="panel right">
      <div class="panel-head">
        <span class="heading">{t("preview.title")}</span>
        <div style="display:flex;align-items:center;gap:4px">
          {(["checker", "green", "dark", "light"] as Background[]).map((b) => (
            <button class={`ico ${bg === b ? "on" : ""}`} style="width:26px;height:26px" title={t(`preview.bg${b[0]!.toUpperCase()}${b.slice(1)}`)} onClick={() => (ui.background.value = b)}>
              <span class={`${bgClass[b]}`} style="width:12px;height:12px;border-radius:2px;display:inline-block;border:1px solid var(--line-3)" />
            </button>
          ))}
          <span style="width:1px;height:18px;background:var(--line-2);margin:0 4px" />
          <select value={String(zoomWanted)} onChange={(e) => (ui.zoom.value = Number((e.target as HTMLSelectElement).value))} style="height:26px;padding:0 6px;font-family:var(--font-mono);font-size:11px" title={t("preview.zoom")}>
            {[1, 2, 3, 4, 5, 6, 8].map((z) => (
              <option value={String(z)}>{z}×</option>
            ))}
          </select>
        </div>
      </div>

      <div class={`preview ${bgClass[bg]}`} ref={boxRef} style={`height:${Math.max(260, ch + 2)}px`}>
        <canvas ref={canvasRef} class="px" />
        <span class="badge">
          {t("preview.frame", { anim: t(`anim.${animation}`), dir: rows === 1 ? "–" : t(`dir.${direction}`), frame: (frameIdx % cycle.length) + 1, total: cycle.length })}
        </span>
        {sheet?.set.customAnimation && <span class="badge right">{t("preview.oversize", { size: cell })}</span>}
        {zoom !== zoomWanted && <span class="badge" style="bottom:auto;top:10px;left:10px">{zoom}×</span>}
        <div class="tools">
          <button class={`ico ${explode ? "on" : ""}`} title={t("preview.explode")} onClick={() => (ui.explode.value = !explode)}><Icon.Layers size={14} /></button>
          <button class={`ico ${grid ? "on" : ""}`} title={t("preview.grid")} onClick={() => (ui.grid.value = !grid)}><Icon.Grid size={14} /></button>
        </div>
      </div>

      <div class="pv-row">
        <div style="display:flex;gap:4px">
          {(["up", "left", "down", "right"] as Direction[]).map((dir) => (
            <button class={`ico ${direction === dir && !all ? "on" : ""}`} title={t(`dir.${dir}`)} disabled={rows === 1} onClick={() => { ui.direction.value = dir; ui.allDirections.value = false; }}>
              {DIR_ICON[dir]()}
            </button>
          ))}
          <button class={`ico ${all ? "on" : ""}`} title={t("preview.allDirections")} disabled={rows === 1} onClick={() => (ui.allDirections.value = !all)}><Icon.Quad size={14} /></button>
        </div>
        <div class="spacer" />
        <button class="ico" title={playing ? t("preview.pause") : t("preview.play")} onClick={() => (ui.playing.value = !playing)}>
          {playing ? <Icon.Pause size={12} /> : <Icon.Play size={12} />}
        </button>
        <select value={String(speed)} onChange={(e) => (ui.speed.value = Number((e.target as HTMLSelectElement).value))} style="height:30px;padding:0 6px;font-family:var(--font-mono);font-size:11px" title={t("preview.speed")}>
          {[0.25, 0.5, 1, 1.5, 2].map((s) => (
            <option value={String(s)}>{s}×</option>
          ))}
        </select>
      </div>

      <div class="pv-chips">
        {ANIMATIONS.map((a) => {
          const warn = states.some((s) => s.visible && s.item && missing.get(s.type)?.includes(a.id));
          return (
            <button class={`chip ${animation === a.id ? "on" : ""} ${warn ? "warn" : ""}`} onClick={() => { ui.animation.value = a.id; setFrameIdx(0); }}>
              {t(`anim.${a.id}`)}
              {warn && <span class="dot" />}
            </button>
          );
        })}
      </div>

      <Filmstrip sheet={sheet} row={dirRow} column={column} onPick={(i) => { ui.playing.value = false; setFrameIdx(cycleIndexFor(sheet, i)); }} />

      <div style="flex-grow:1" />
      {missingHere.length > 0 ? (
        <div class="warnbox">
          <Icon.Warn size={16} />
          <div>
            {missingHere.map((s) => {
              const label = `${slotLabel(s.type)} · ${s.item!.name}`;
              // No animation at all means the part was drawn for another body
              // type; naming it beats listing all fifteen animations.
              if (s.covered.size === 0) {
                const bodies = otherBodyTypes(s.item!);
                return (
                  <div class="t">
                    {bodies.length
                      ? t("preview.wrongBody", { item: label, body: t(`body.${doc.value.bodyType}`), bodies: bodies.map((b) => t(`body.${b}`)).join(", ") })
                      : `${label} – ${t("catalog.notForBody")}`}
                  </div>
                );
              }
              return <div class="t">{t("preview.missingIn", { item: label, anims: missing.get(s.type)!.map((a) => t(`anim.${a}`)).join(", ") })}</div>;
            })}
            <div class="d">{missingHere.some((s) => s.covered.size === 0) ? t("preview.wrongBodyHint", { body: t(`body.${doc.value.bodyType}`) }) : t("preview.missingHint")}</div>
          </div>
        </div>
      ) : missing.size > 0 ? (
        <div class="okbox">
          <Icon.Warn size={14} style="color:var(--warn)" />
          <span>{tn("stack.warnings", missing.size)}</span>
        </div>
      ) : (
        <div class="okbox">
          <Icon.Check size={14} />
          <span>{t("stack.noWarnings")}</span>
        </div>
      )}
      <span class="hidden">{animDef?.label}</span>
    </div>
  );
}

function cancelRAF(id: number) {
  cancelAnimationFrame(id);
}

function cycleIndexFor(sheet: ComposedSheet | null, column: number): number {
  if (!sheet) return 0;
  const i = sheet.set.cycle.indexOf(column);
  return i >= 0 ? i : 0;
}

/** Draws each layer of one frame separately, fanned out so the stacking order is visible. */
async function drawExploded(c: CanvasRenderingContext2D, sheet: ComposedSheet, row: number, column: number, dx: number, dy: number, zoom: number, layerCount: number) {
  const set = sheet.set;
  const ops = set.frames[row]?.[column] ?? [];
  const images = await loadSprites(Array.from(new Set(ops.map((o) => o.src))));
  const byLayer = new Map<string, typeof ops>();
  for (const o of ops) {
    const list = byLayer.get(o.layerId) ?? [];
    list.push(o);
    byLayer.set(o.layerId, list);
  }
  const n = Math.max(1, byLayer.size);
  const spread = Math.min(6, Math.floor((set.cellSize * 0.8) / n));
  let i = 0;
  c.imageSmoothingEnabled = false;
  for (const list of byLayer.values()) {
    const off = (i - (n - 1) / 2) * spread;
    for (const o of list) {
      const img = images.get(o.src);
      if (!img) continue;
      c.globalCompositeOperation = o.composite ?? "source-over";
      c.drawImage(img, o.sx, o.sy, o.sw, o.sh, dx + (o.dx + off) * zoom, dy + (o.dy - off) * zoom, o.sw * zoom, o.sh * zoom);
    }
    i++;
  }
  c.globalCompositeOperation = "source-over";
  void layerCount;
  void buildFrameSet;
}

function Filmstrip({ sheet, row, column, onPick }: { sheet: ComposedSheet | null; row: number; column: number; onPick: (i: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const cols = sheet?.set.columns ?? 0;
  const cell = sheet?.set.cellSize ?? 64;
  const size = 48;
  useEffect(() => {
    const host = ref.current;
    if (!host || !sheet) return;
    const canvases = host.querySelectorAll("canvas");
    canvases.forEach((cv, i) => {
      const c = cv.getContext("2d")!;
      c.imageSmoothingEnabled = false;
      c.clearRect(0, 0, size, size);
      c.drawImage(sheet.canvas, i * cell, row * cell, cell, cell, 0, 0, size, size);
    });
  }, [sheet, row, cols]);
  return (
    <div class="filmstrip">
      <div class="frames" ref={ref}>
        {Array.from({ length: cols }, (_, i) => (
          <canvas key={i} width={size} height={size} class={`px ${i === column ? "on" : ""}`} style={`width:${size}px;height:${size}px`} onClick={() => onPick(i)} />
        ))}
      </div>
      <div class="bar">
        {/* Same frame the box highlights: a cycle can skip or repeat columns
            (walk skips the rest frame, sit holds each pose), so its own
            length does not match the strip's column count. */}
        {cols > 0 && <span style={`left:${(column / cols) * 100}%;width:${(1 / cols) * 100}%`} />}
      </div>
    </div>
  );
}
