import animationsJson from "../../../../data/animations.json";
import customAnimationsJson from "../../../../data/custom-animations.json";
import type { AnimationDef, CustomAnimationDef, Direction } from "./types.ts";

export const CELL_SIZE: number = animationsJson.cellSize;

export const ANIMATIONS: AnimationDef[] = animationsJson.animations;

export const DEFAULT_ANIMATIONS: string[] = animationsJson.defaultAnimations;

export const CUSTOM_ANIMATIONS: Record<string, CustomAnimationDef> =
  customAnimationsJson as Record<string, CustomAnimationDef>;

const byId = new Map(ANIMATIONS.map((a) => [a.id, a]));
const byAlias = new Map<string, AnimationDef>();
for (const a of ANIMATIONS) {
  byAlias.set(a.id, a);
  for (const alias of a.aliases) byAlias.set(alias, a);
}

export function getAnimation(id: string): AnimationDef | undefined {
  return byId.get(id);
}

/** Maps a definition's animation name (e.g. "combat", "1h_slash") to the sheet folder id. */
export function normalizeAnimationName(name: string): string | undefined {
  return byAlias.get(name)?.id;
}

export function directionRow(direction: Direction): number {
  return ["up", "left", "down", "right"].indexOf(direction);
}

/** Pixel size of a standard sheet for an animation. */
export function sheetSize(animation: AnimationDef, cellSize = CELL_SIZE) {
  return { width: animation.columns * cellSize, height: animation.rows * cellSize };
}

/** Pixel size of a custom-animation sheet. */
export function customSheetSize(def: CustomAnimationDef) {
  return {
    width: def.frameSize * (def.frames[0]?.length ?? 0),
    height: def.frameSize * def.frames.length,
  };
}
