import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { inspectDefinitionsDir, expectedTopLevelDirs } from "./inspect.ts";

const HAIR = {
  name: "Plain",
  type_name: "hair",
  layer_1: { zPos: 130, male: "hair/plain/male/", female: "hair/plain/female/" },
};

function folder(files: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), "pixygoat-defs-"));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), JSON.stringify(body));
  return dir;
}

describe("inspectDefinitionsDir", () => {
  it("accepts a folder of sheet definitions", async () => {
    const report = await inspectDefinitionsDir(folder({ "hair_plain.json": HAIR }));
    expect(report).toMatchObject({ exists: true, count: 1, usable: true });
  });

  it("refuses a folder that only happens to hold JSON", async () => {
    const report = await inspectDefinitionsDir(folder({ "tsconfig.json": { compilerOptions: {} } }));
    expect(report).toMatchObject({ exists: true, count: 1, usable: false });
  });

  it("refuses a definition that points nowhere", async () => {
    const report = await inspectDefinitionsDir(folder({ "empty.json": { name: "X", type_name: "hair" } }));
    expect(report.usable).toBe(false);
  });

  it("reports a missing folder instead of throwing", async () => {
    const report = await inspectDefinitionsDir(join(tmpdir(), "pixygoat-does-not-exist"));
    expect(report).toMatchObject({ exists: false, count: 0, usable: false });
  });

  it("survives broken JSON in the folder", async () => {
    const dir = folder({ "hair_plain.json": HAIR });
    writeFileSync(join(dir, "broken.json"), "{ not json");
    expect((await inspectDefinitionsDir(dir)).usable).toBe(true);
  });
});

describe("expectedTopLevelDirs", () => {
  it("reads the sprite folder names out of the definitions", async () => {
    const dir = folder({ "hair_plain.json": HAIR, "weapon_axe.json": { ...HAIR, layer_1: { male: "weapon/axe/male/" } } });
    expect([...(await expectedTopLevelDirs(dir))].sort()).toEqual(["hair", "weapon"]);
  });

  it("answers per folder instead of remembering the first one it saw", async () => {
    const one = folder({ "hair_plain.json": HAIR });
    const two = folder({ "weapon_axe.json": { ...HAIR, layer_1: { male: "weapon/axe/male/" } } });
    expect([...(await expectedTopLevelDirs(one))]).toEqual(["hair"]);
    expect([...(await expectedTopLevelDirs(two))]).toEqual(["weapon"]);
  });

  it("does not remember a folder it could not read", async () => {
    const gone = join(tmpdir(), "pixygoat-gone-" + Date.now());
    await expect(expectedTopLevelDirs(gone)).rejects.toThrow();
    mkdirSync(gone);
    writeFileSync(join(gone, "hair_plain.json"), JSON.stringify(HAIR));
    expect([...(await expectedTopLevelDirs(gone))]).toEqual(["hair"]);
  });
});
