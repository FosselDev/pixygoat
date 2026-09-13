/**
 * Frame composition. Turns a sorted list of layers into draw operations for
 * one animation, independent of any canvas API so it runs in the app, in a
 * worker and in tests.
 */
import { CELL_SIZE, CUSTOM_ANIMATIONS, getAnimation } from "../catalog/animations.ts";
import type { CustomAnimationDef, Direction } from "../catalog/types.ts";
import type { ResolvedLayer } from "../catalog/resolve.ts";

export interface DrawLayer {
  /** stable id for caching and debugging, e.g. "hair_messy1#1" */
  id: string;
  zPos: number;
  /** standard animation id -> sheet path */
  sheets: Record<string, string>;
  customAnimation?: string;
  customSheet?: string;
  isMask: boolean;
}

export interface FrameOp {
  /** sprite path relative to the sprites root */
  src: string;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dx: number;
  dy: number;
  /** "destination-out" for mask layers, otherwise normal alpha blending */
  composite?: "destination-out";
  layerId: string;
}

export interface FrameSet {
  animation: string;
  /** id of the custom-animation layout used, when an oversize layout is active */
  customAnimation?: string;
  cellSize: number;
  columns: number;
  rows: number;
  /** [row][column] -> ops in draw order (back to front) */
  frames: FrameOp[][][];
  /** column indices played in the preview */
  cycle: number[];
  frameMs: number;
}

export function toDrawLayers(resolved: ResolvedLayer[], itemId: string): DrawLayer[] {
  return resolved.map((r) => {
    const sheets: Record<string, string> = {};
    for (const [anim, s] of Object.entries(r.sheets)) sheets[anim] = s.path;
    const out: DrawLayer = { id: `${itemId}#${r.layer.index}`, zPos: r.zPos, sheets, isMask: r.isMask };
    if (r.customAnimation) out.customAnimation = r.customAnimation;
    if (r.customSheet) out.customSheet = r.customSheet.path;
    return out;
  });
}

export function sortLayers(layers: DrawLayer[]): DrawLayer[] {
  return [...layers].sort((a, b) => a.zPos - b.zPos);
}

function baseAnimationOf(def: CustomAnimationDef): string | undefined {
  return def.frames[0]?.[0]?.animation;
}

/**
 * Picks the custom layout to use for an animation: the largest frame size
 * among active custom layers whose base animation matches.
 */
export function customLayoutFor(layers: DrawLayer[], animation: string): string | undefined {
  let best: { id: string; size: number } | undefined;
  for (const l of layers) {
    if (!l.customAnimation || !l.customSheet) continue;
    const def = CUSTOM_ANIMATIONS[l.customAnimation];
    if (!def || baseAnimationOf(def) !== animation) continue;
    if (!best || def.frameSize > best.size) best = { id: l.customAnimation, size: def.frameSize };
  }
  return best?.id;
}

function directionIndex(d: Direction): number {
  return d === "up" ? 0 : d === "left" ? 1 : d === "down" ? 2 : 3;
}

/**
 * Builds the frame set of an animation. Layers must already be sorted back to
 * front. Layers without a sheet for the animation are skipped, which is how
 * missing coverage shows up (the part simply is not drawn).
 */
export function buildFrameSet(layers: DrawLayer[], animation: string, cellSize = CELL_SIZE): FrameSet | undefined {
  const anim = getAnimation(animation);
  if (!anim) return undefined;
  const customId = customLayoutFor(layers, animation);
  const custom = customId ? CUSTOM_ANIMATIONS[customId] : undefined;

  if (!custom) {
    const frames: FrameOp[][][] = [];
    for (let r = 0; r < anim.rows; r++) {
      const row: FrameOp[][] = [];
      for (let c = 0; c < anim.columns; c++) {
        const ops: FrameOp[] = [];
        for (const l of layers) {
          const src = l.sheets[animation];
          if (!src) continue;
          ops.push(op(l, src, c * cellSize, r * cellSize, cellSize, 0, 0));
        }
        row.push(ops);
      }
      frames.push(row);
    }
    return { animation, cellSize, columns: anim.columns, rows: anim.rows, frames, cycle: anim.cycle, frameMs: anim.frameMs };
  }

  // Oversize layout: every standard layer is re-laid out into the big cells,
  // centred; custom layers are drawn from their own sheet cell by cell.
  const size = custom.frameSize;
  const pad = (size - cellSize) / 2;
  const columns = custom.frames[0]?.length ?? 0;
  const rows = custom.frames.length;
  const frames: FrameOp[][][] = [];
  for (let r = 0; r < rows; r++) {
    const row: FrameOp[][] = [];
    for (let c = 0; c < columns; c++) {
      const ref = custom.frames[r]?.[c];
      const ops: FrameOp[] = [];
      if (ref) {
        for (const l of layers) {
          if (l.customAnimation && l.customSheet) {
            const def = CUSTOM_ANIMATIONS[l.customAnimation];
            if (!def || baseAnimationOf(def) !== animation) continue;
            if (def.frameSize === size) {
              ops.push(op(l, l.customSheet, c * size, r * size, size, 0, 0));
            } else {
              // a smaller custom sheet inside a bigger layout: centre it too
              const p = (size - def.frameSize) / 2;
              ops.push(op(l, l.customSheet, c * def.frameSize, r * def.frameSize, def.frameSize, p, p));
            }
            continue;
          }
          const src = l.sheets[ref.animation];
          if (!src) continue;
          const srcAnim = getAnimation(ref.animation);
          if (!srcAnim) continue;
          const srcRow = srcAnim.rows === 1 ? 0 : directionIndex(ref.direction);
          ops.push(op(l, src, ref.frame * cellSize, srcRow * cellSize, cellSize, pad, pad));
        }
      }
      row.push(ops);
    }
    frames.push(row);
  }
  const cycle = Array.from({ length: columns }, (_, i) => i).filter((i) => !(custom.skipFirstFrameInPreview && i === 0));
  return { animation, customAnimation: customId, cellSize: size, columns, rows, frames, cycle, frameMs: anim.frameMs };
}

function op(l: DrawLayer, src: string, sx: number, sy: number, s: number, dx: number, dy: number): FrameOp {
  const o: FrameOp = { src, sx, sy, sw: s, sh: s, dx, dy, layerId: l.id };
  if (l.isMask) o.composite = "destination-out";
  return o;
}

/** All sprite paths referenced by a frame set (for preloading). */
export function frameSetSources(set: FrameSet): string[] {
  const s = new Set<string>();
  for (const row of set.frames) for (const cell of row) for (const o of cell) s.add(o.src);
  return [...s];
}

/** Direction of a row in a frame set (undefined for one-row sheets). */
export function rowDirection(set: FrameSet, row: number): Direction | undefined {
  if (set.rows !== 4) return undefined;
  return (["up", "left", "down", "right"] as const)[row];
}
