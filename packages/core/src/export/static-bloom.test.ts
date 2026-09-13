import { describe, expect, it } from "vitest";
import { planStaticBloom, sanitizeVariantName, slotForType } from "./static-bloom.ts";
import type { CatalogItem } from "../catalog/types.ts";
import type { DrawLayer } from "../compose/compose.ts";

const item = (id: string, typeName: string): CatalogItem => ({
  id, name: id, typeName, tags: [], requiredTags: [], excludedTags: [], bodyTypes: ["male"], variants: [], matchBodyColor: false,
  animations: [], layers: [], credits: [], licenses: [], preview: { row: 2, column: 0, xOffset: 0, yOffset: 0 }, available: true,
});
const layer = (id: string, zPos: number, sheets: Record<string, string>, custom?: { animation: string; sheet: string }): DrawLayer => ({
  id, zPos, sheets, isMask: false, ...(custom ? { customAnimation: custom.animation, customSheet: custom.sheet } : {}),
});

describe("planStaticBloom", () => {
  it("merges layers into slots, sends back layers to 2clo and builds pages", () => {
    const plan = planStaticBloom(
      [
        { type: "body", item: item("body", "body"), variant: "light", layers: [layer("body#1", 10, { walk: "b/walk/light.png", slash: "b/slash/light.png" })] },
        { type: "hair", item: item("hair_long", "hair"), variant: "black", layers: [layer("hair_long#1", 120, { walk: "h/fg/walk/black.png" }), layer("hair_long#2", 5, { walk: "h/bg/walk/black.png" })] },
        {
          type: "weapon", item: item("weapon_sword_arming", "weapon"), variant: "steel",
          layers: [
            layer("sword#1", 140, { walk: "w/fg/walk/steel.png" }),
            layer("sword#2", 9, { walk: "w/bg/walk/steel.png" }),
            layer("sword#3", 150, {}, { animation: "slash_128", sheet: "w/attack/fg/steel.png" }),
            layer("sword#4", 8, {}, { animation: "slash_128", sheet: "w/attack/bg/steel.png" }),
          ],
        },
      ],
      { variantName: "Josua v2", characterName: "josua", bodyType: "male", animations: ["walk", "slash", "hurt"] },
    );
    expect(plan.variant).toBe("josuav2");
    expect(plan.pages.map((p) => [p.code, p.cellSize, p.columns])).toEqual([["walk", 64, 9], ["slash128", 128, 6], ["hurt", 64, 6]]);
    const walkSheets = plan.sheets.filter((s) => s.page.code === "walk");
    expect(walkSheets.map((s) => s.slot).sort()).toEqual(["0bas", "2clo", "4har", "6tla"]);
    const back = walkSheets.find((s) => s.slot === "2clo")!;
    expect(back.layers.map((l) => l.id).sort()).toEqual(["hair_long#2", "sword#2"]);
    expect(back.file).toBe("Sheets/char_a_walk_2clo_josuav2_v01.png");
    const slashSheets = plan.sheets.filter((s) => s.page.code === "slash128");
    expect(slashSheets.map((s) => s.slot).sort()).toEqual(["0bas", "2clo", "6tla"]);
    expect(plan.manifest.drawOrder["2clo"]).toEqual({ "*": -1 });
    expect(plan.manifest.missing["4har"]).toEqual(["slash128", "hurt"]);
    expect(plan.manifest.pages.slash128).toMatchObject({ layout: "slash_128", cellSize: 128, columns: 6, rows: 4 });
  });

  it("maps types and sanitises names", () => {
    expect(slotForType("hat")).toBe("5hat");
    expect(slotForType("beard")).toBe("3fac");
    expect(slotForType("unknown_type")).toBe("1out");
    expect(slotForType("hat", { hat: "4har" })).toBe("4har");
    expect(sanitizeVariantName("Josua_v2 (test)")).toBe("josuav2test");
    expect(sanitizeVariantName("___")).toBe("character");
  });
});
