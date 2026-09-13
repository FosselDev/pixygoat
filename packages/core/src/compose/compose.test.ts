import { describe, expect, it } from "vitest";
import { buildFrameSet, customLayoutFor, sortLayers, type DrawLayer } from "./compose.ts";

const body: DrawLayer = {
  id: "body#1",
  zPos: 10,
  sheets: { walk: "body/bodies/male/walk/light.png", slash: "body/bodies/male/slash/light.png" },
  isMask: false,
};
const swordFg: DrawLayer = {
  id: "sword#4",
  zPos: 150,
  sheets: {},
  customAnimation: "slash_128",
  customSheet: "weapon/sword/arming/attack_slash/fg/steel.png",
  isMask: false,
};
const swordBg: DrawLayer = { ...swordFg, id: "sword#3", zPos: 8, customSheet: "weapon/sword/arming/attack_slash/bg/steel.png" };

describe("buildFrameSet", () => {
  it("lays out a standard animation from per-animation sheets", () => {
    const set = buildFrameSet([body], "walk")!;
    expect(set.columns).toBe(9);
    expect(set.rows).toBe(4);
    expect(set.cellSize).toBe(64);
    const op = set.frames[2]![1]![0]!;
    expect(op).toMatchObject({ src: body.sheets.walk, sx: 64, sy: 128, sw: 64, sh: 64, dx: 0, dy: 0 });
  });

  it("skips layers without a sheet for the animation", () => {
    const set = buildFrameSet([{ ...body, sheets: { walk: "x.png" } }], "slash")!;
    expect(set.frames.flat(2)).toHaveLength(0);
  });

  it("switches to the oversize layout when a custom layer matches", () => {
    const layers = sortLayers([swordFg, body, swordBg]);
    expect(customLayoutFor(layers, "slash")).toBe("slash_128");
    const set = buildFrameSet(layers, "slash")!;
    expect(set.cellSize).toBe(128);
    expect(set.columns).toBe(6);
    const ops = set.frames[2]![3]!;
    expect(ops.map((o) => o.layerId)).toEqual(["sword#3", "body#1", "sword#4"]);
    const bodyOp = ops[1]!;
    // body frame (slash, down, frame 3) centred in the 128 cell
    expect(bodyOp).toMatchObject({ sx: 3 * 64, sy: 2 * 64, sw: 64, dx: 32, dy: 32 });
    const fgOp = ops[2]!;
    expect(fgOp).toMatchObject({ sx: 3 * 128, sy: 2 * 128, sw: 128, dx: 0, dy: 0 });
  });

  it("keeps the standard layout for animations without custom layers", () => {
    const set = buildFrameSet(sortLayers([swordFg, body]), "walk")!;
    expect(set.customAnimation).toBeUndefined();
    expect(set.frames[0]![0]!.map((o) => o.layerId)).toEqual(["body#1"]);
  });
});
