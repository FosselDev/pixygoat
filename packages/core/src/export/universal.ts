/**
 * Layout of the classic "universal" LPC sheet: 832 px wide, one band of rows
 * per standard animation at fixed offsets, oversize layouts appended below.
 */
import { ANIMATIONS, CUSTOM_ANIMATIONS, CELL_SIZE } from "../catalog/animations.ts";
import { customLayoutFor, type DrawLayer } from "../compose/compose.ts";

export const UNIVERSAL_WIDTH = 832;
export const UNIVERSAL_STANDARD_HEIGHT = 54 * CELL_SIZE;

export interface UniversalBlock {
  animation: string;
  layout: string | null;
  x: number;
  y: number;
  cellSize: number;
}

export interface UniversalLayout {
  width: number;
  height: number;
  blocks: UniversalBlock[];
}

export function universalLayout(layers: DrawLayer[], animations: string[]): UniversalLayout {
  const blocks: UniversalBlock[] = [];
  let width = UNIVERSAL_WIDTH;
  let y = UNIVERSAL_STANDARD_HEIGHT;
  for (const a of ANIMATIONS) {
    if (!animations.includes(a.id)) continue;
    blocks.push({ animation: a.id, layout: null, x: 0, y: a.universalRow * CELL_SIZE, cellSize: CELL_SIZE });
  }
  for (const a of ANIMATIONS) {
    if (!animations.includes(a.id)) continue;
    const layout = customLayoutFor(layers, a.id);
    if (!layout) continue;
    const def = CUSTOM_ANIMATIONS[layout]!;
    blocks.push({ animation: a.id, layout, x: 0, y, cellSize: def.frameSize });
    width = Math.max(width, def.frameSize * (def.frames[0]?.length ?? 0));
    y += def.frameSize * def.frames.length;
  }
  return { width, height: y, blocks };
}
