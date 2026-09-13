/**
 * Export rendering: turns export plans into PNG blobs using the same
 * compositing as the preview, then hands them to the server (write to a
 * folder) or packs a ZIP for download.
 */
import { zipSync, strToU8 } from "fflate";
import {
  buildFrameSet,
  frameSetSources,
  universalLayout,
  ANIMATIONS,
  CELL_SIZE,
  type DrawLayer,
  type FrameOp,
  type StaticBloomPlan,
} from "@pixygoat/core";
import { loadSprites } from "../render/images.ts";
import { triggerDownload } from "../state/persistence.ts";

export interface OutFile {
  path: string;
  blob: Blob;
}

export type Progress = (done: number, total: number, label: string) => void;

function drawOps(ctx: OffscreenCanvasRenderingContext2D, ops: FrameOp[], images: Map<string, ImageBitmap>, ox: number, oy: number) {
  for (const o of ops) {
    const img = images.get(o.src);
    if (!img) continue;
    ctx.globalCompositeOperation = o.composite ?? "source-over";
    ctx.drawImage(img, o.sx, o.sy, o.sw, o.sh, ox + o.dx, oy + o.dy, o.sw, o.sh);
  }
  ctx.globalCompositeOperation = "source-over";
}

/** Renders one animation of a layer set into a canvas, optionally forcing a layout. */
export async function renderSheetCanvas(layers: DrawLayer[], animation: string, layout?: string | null): Promise<OffscreenCanvas | null> {
  const set = buildFrameSet(layers, animation, CELL_SIZE, layout);
  if (!set) return null;
  const images = await loadSprites(frameSetSources(set));
  const canvas = new OffscreenCanvas(set.columns * set.cellSize, set.rows * set.cellSize);
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  for (let r = 0; r < set.rows; r++) for (let c = 0; c < set.columns; c++) drawOps(ctx, set.frames[r]![c]!, images, c * set.cellSize, r * set.cellSize);
  return canvas;
}

async function toPng(canvas: OffscreenCanvas): Promise<Blob> {
  return canvas.convertToBlob({ type: "image/png" });
}

/** Static-Bloom slot sheets according to the plan. */
export async function renderStaticBloom(plan: StaticBloomPlan, progress?: Progress): Promise<OutFile[]> {
  const out: OutFile[] = [];
  let i = 0;
  for (const sheet of plan.sheets) {
    progress?.(i++, plan.sheets.length, sheet.file);
    const canvas = await renderSheetCanvas(sheet.layers, sheet.page.animation, sheet.page.layout);
    if (!canvas) continue;
    out.push({ path: sheet.file, blob: await toPng(canvas) });
  }
  progress?.(plan.sheets.length, plan.sheets.length, "");
  return out;
}

/** One PNG per animation, composited from all layers (oversize layout when present). */
export async function renderPerAnimation(layers: DrawLayer[], animations: string[], progress?: Progress): Promise<OutFile[]> {
  const out: OutFile[] = [];
  let i = 0;
  for (const a of animations) {
    progress?.(i++, animations.length, a);
    const canvas = await renderSheetCanvas(layers, a);
    if (!canvas) continue;
    out.push({ path: `${a}.png`, blob: await toPng(canvas) });
  }
  return out;
}

/** Classic universal sheet (832 px wide, fixed bands) with oversize blocks appended. */
export async function renderUniversal(layers: DrawLayer[], animations: string[], progress?: Progress): Promise<OutFile> {
  const layout = universalLayout(layers, animations);
  const canvas = new OffscreenCanvas(layout.width, layout.height);
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  let i = 0;
  for (const b of layout.blocks) {
    progress?.(i++, layout.blocks.length, b.animation);
    const sheet = await renderSheetCanvas(layers, b.animation, b.layout);
    if (sheet) ctx.drawImage(sheet, b.x, b.y);
  }
  return { path: "universal.png", blob: await toPng(canvas) };
}

/** Every frame as its own PNG: frames/<animation>/<direction>_<index>.png */
export async function renderFrames(layers: DrawLayer[], animations: string[], progress?: Progress): Promise<OutFile[]> {
  const out: OutFile[] = [];
  const dirs = ["up", "left", "down", "right"];
  let i = 0;
  for (const a of animations) {
    progress?.(i++, animations.length, a);
    const set = buildFrameSet(layers, a);
    if (!set) continue;
    const images = await loadSprites(frameSetSources(set));
    for (let r = 0; r < set.rows; r++) {
      for (let c = 0; c < set.columns; c++) {
        const canvas = new OffscreenCanvas(set.cellSize, set.cellSize);
        const ctx = canvas.getContext("2d")!;
        ctx.imageSmoothingEnabled = false;
        drawOps(ctx, set.frames[r]![c]!, images, 0, 0);
        const dir = set.rows === 4 ? dirs[r]! : "single";
        out.push({ path: `frames/${a}/${dir}_${String(c).padStart(2, "0")}.png`, blob: await toPng(canvas) });
      }
    }
  }
  return out;
}

export function textFile(path: string, text: string): OutFile {
  return { path, blob: new Blob([text], { type: "text/plain" }) };
}

/** Packs files into a ZIP and starts the download. */
export async function downloadZip(files: OutFile[], zipName: string) {
  const entries: Record<string, Uint8Array> = {};
  for (const f of files) entries[f.path] = new Uint8Array(await f.blob.arrayBuffer());
  const zipped = zipSync(entries, { level: 6 });
  triggerDownload(new Blob([zipped], { type: "application/zip" }), zipName);
}

/** Sends files to the server to be written below targetDir. */
export async function writeToFolder(files: OutFile[], targetDir: string): Promise<{ ok: boolean; written?: string[]; error?: string }> {
  const payload = await Promise.all(
    files.map(async (f) => {
      const buf = new Uint8Array(await f.blob.arrayBuffer());
      const isText = f.blob.type.startsWith("text/") || f.blob.type === "application/json";
      return isText
        ? { path: f.path, encoding: "utf8" as const, data: new TextDecoder().decode(buf) }
        : { path: f.path, encoding: "base64" as const, data: base64(buf) };
    }),
  );
  const res = await fetch("/api/export/write", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetDir, files: payload }) });
  const body = (await res.json()) as { ok?: boolean; written?: string[]; error?: string };
  return res.ok ? { ok: true, written: body.written } : { ok: false, error: body.error ?? `HTTP ${res.status}` };
}

function base64(bytes: Uint8Array): string {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}

export const ANIMATION_IDS = ANIMATIONS.map((a) => a.id);
export { strToU8 };
