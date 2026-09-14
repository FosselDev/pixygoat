import { describe, it, expect } from "vitest";
import { join, resolve, sep } from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  definitionCandidates,
  holdsDefinitions,
  pickPath,
  spriteCandidates,
  type Candidate,
} from "./config.ts";

const A = resolve(sep, "a");
const B = resolve(sep, "b");
const C = resolve(sep, "c");

function candidates(...spec: [string, string, boolean][]): Candidate<string>[] {
  return spec.map(([source, path, explicit]) => ({ source, path, explicit }));
}

describe("pickPath", () => {
  it("takes the first candidate that is there", () => {
    const r = pickPath(candidates(["flag", A, true], ["env", B, true], ["default", C, false]), (p) => p !== A);
    expect(r).toMatchObject({ source: "env", path: B, configured: true });
  });

  it("reports the named sources it had to skip", () => {
    const r = pickPath(candidates(["flag", A, true], ["env", B, true], ["default", C, false]), (p) => p === C);
    expect(r.source).toBe("default");
    expect(r.ignored).toEqual([
      { source: "flag", path: A },
      { source: "env", path: B },
    ]);
  });

  it("says nothing about a derived location that simply is not there", () => {
    const r = pickPath(candidates(["sprites", A, false], ["cache", B, false], ["env", C, true]), (p) => p === C);
    expect(r).toMatchObject({ source: "env", configured: true, ignored: [] });
  });

  it("falls back to the last candidate when nothing is there", () => {
    const r = pickPath(candidates(["flag", A, true], ["default", B, false]), () => false);
    expect(r).toMatchObject({ source: "default", path: B, configured: false });
    expect(r.ignored).toEqual([{ source: "flag", path: A }]);
  });
});

describe("definitionCandidates", () => {
  const base = {
    spritesRoot: join(A, "lpc", "spritesheets"),
    upstreamDir: join(A, "cache", "upstream"),
    repoRoot: B,
    definitionsPath: "sheet_definitions",
  };

  it("prefers what the user named, then the folder next to the sprites", () => {
    const c = definitionCandidates({ ...base, env: C });
    expect(c.map((x) => x.source)).toEqual(["env", "sprites", "cache", "bundled"]);
    expect(c[1]!.path).toBe(join(A, "lpc", "sheet_definitions"));
    expect(c[2]!.path).toBe(join(A, "cache", "upstream", "sheet_definitions"));
    expect(c[3]!.path).toBe(join(B, "data", "definitions"));
  });

  it("keeps flag over env over settings", () => {
    const c = definitionCandidates({ ...base, flag: A, env: B, settings: C });
    expect(c.slice(0, 3).map((x) => x.source)).toEqual(["flag", "env", "settings"]);
    expect(c.slice(0, 3).every((x) => x.explicit)).toBe(true);
  });
});

describe("spriteCandidates", () => {
  it("ends at the folder next to the repository", () => {
    const c = spriteCandidates({ repoRoot: B, env: C });
    expect(c.map((x) => x.source)).toEqual(["env", "default"]);
    expect(c[1]).toMatchObject({ path: join(B, "spritesheets"), explicit: false });
  });
});

describe("holdsDefinitions", () => {
  it("tells a folder with JSON from one without and from nothing at all", () => {
    const dir = mkdtempSync(join(tmpdir(), "pixygoat-"));
    const empty = join(dir, "empty");
    const full = join(dir, "full");
    mkdirSync(empty);
    mkdirSync(full);
    writeFileSync(join(empty, "readme.txt"), "");
    writeFileSync(join(full, "hair.json"), "{}");
    expect(holdsDefinitions(full)).toBe(true);
    expect(holdsDefinitions(empty)).toBe(false);
    expect(holdsDefinitions(join(dir, "gone"))).toBe(false);
    expect(holdsDefinitions(join(full, "hair.json"))).toBe(false);
  });
});
