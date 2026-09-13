import { buildFrameSet, frameSetSources, type DrawLayer, type FrameOp, type FrameSet } from "@pixygoat/core";
import { loadSprites } from "./images.ts";

export interface ComposedSheet {
  set: FrameSet;
  canvas: OffscreenCanvas;
  /** sprite paths that failed to load */
  missing: string[];
}

function drawOps(ctx: OffscreenCanvasRenderingContext2D, ops: FrameOp[], images: Map<string, ImageBitmap>, ox: number, oy: number) {
  for (const o of ops) {
    const img = images.get(o.src);
    if (!img) continue;
    ctx.globalCompositeOperation = o.composite ?? "source-over";
    ctx.drawImage(img, o.sx, o.sy, o.sw, o.sh, ox + o.dx, oy + o.dy, o.sw, o.sh);
  }
  ctx.globalCompositeOperation = "source-over";
}

/** Renders the whole sheet of one animation (all rows and columns). */
export async function composeSheet(layers: DrawLayer[], animation: string): Promise<ComposedSheet | null> {
  const set = buildFrameSet(layers, animation);
  if (!set) return null;
  const sources = frameSetSources(set);
  const images = await loadSprites(sources);
  const missing = sources.filter((s) => !images.has(s));
  const canvas = new OffscreenCanvas(set.columns * set.cellSize, set.rows * set.cellSize);
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  for (let r = 0; r < set.rows; r++) {
    for (let c = 0; c < set.columns; c++) {
      drawOps(ctx, set.frames[r]![c]!, images, c * set.cellSize, r * set.cellSize);
    }
  }
  return { set, canvas, missing };
}

export interface ComposedFrame {
  canvas: OffscreenCanvas;
  set: FrameSet;
}

/**
 * Renders a single frame (row, column) of an animation. The frame set comes
 * back with it because the caller needs the cell size: an oversize layout
 * hands back a 128 or 192 px cell, not a 64 px one.
 */
export async function composeFrame(layers: DrawLayer[], animation: string, row: number, column: number): Promise<ComposedFrame | null> {
  const set = buildFrameSet(layers, animation);
  if (!set) return null;
  const ops = set.frames[Math.min(row, set.rows - 1)]?.[Math.min(column, set.columns - 1)] ?? [];
  const images = await loadSprites(Array.from(new Set(ops.map((o) => o.src))));
  const canvas = new OffscreenCanvas(set.cellSize, set.cellSize);
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  drawOps(ctx, ops, images, 0, 0);
  return { canvas, set };
}

/** Cache of composed sheets keyed by a layer signature and animation. */
export class SheetCache {
  private sheets = new Map<string, Promise<ComposedSheet | null>>();
  private signature = "";

  invalidate(signature: string) {
    if (signature !== this.signature) {
      this.sheets.clear();
      this.signature = signature;
    }
  }

  get(layers: DrawLayer[], animation: string): Promise<ComposedSheet | null> {
    let p = this.sheets.get(animation);
    if (!p) {
      p = composeSheet(layers, animation);
      this.sheets.set(animation, p);
    }
    return p;
  }
}

export function layerSignature(layers: DrawLayer[]): string {
  return layers.map((l) => `${l.id}:${l.zPos}:${l.customSheet ?? ""}:${Object.values(l.sheets).join(",")}`).join("|");
}
