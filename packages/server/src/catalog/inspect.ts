import { readdir, readFile, stat } from "node:fs/promises";
import { join, basename } from "node:path";
import { parseDefinition, type RawSheetDefinition } from "@pixygoat/core";
import { expandPlaceholders } from "./build.ts";

export interface SpritesDirReport {
  path: string;
  exists: boolean;
  /** top-level folders the definitions ask for and this directory has */
  matched: string[];
  /** how many distinct top-level folders the definitions ask for at all */
  expected: number;
  /** enough of a match to build a catalog from */
  usable: boolean;
}

/**
 * A spritesheet folder holds `body/`, `hair/`, `weapon/` and so on. Rather
 * than keeping a second list of those names in step with the definitions, the
 * names are taken from the definitions themselves - whatever they reference is
 * what a sprite folder is supposed to contain.
 */
let expectedCache: Promise<Set<string>> | null = null;

export function expectedTopLevelDirs(definitionsDir: string): Promise<Set<string>> {
  expectedCache ??= (async () => {
    const out = new Set<string>();
    const files = (await readdir(definitionsDir)).filter((f) => f.endsWith(".json"));
    for (const f of files) {
      const raw = JSON.parse(await readFile(join(definitionsDir, f), "utf8")) as RawSheetDefinition;
      const item = parseDefinition(basename(f, ".json"), raw);
      for (const layer of item.layers)
        for (const p of Object.values(layer.paths))
          for (const dir of expandPlaceholders(p, item.replaceInPath)) {
            const top = dir.split("/")[0];
            if (top) out.add(top);
          }
    }
    return out;
  })();
  return expectedCache;
}

/**
 * Is this the folder the user was looking for? Two matching top-level folders
 * are treated as enough: a partial checkout is still worth opening, while a
 * random folder - a home directory, a Unity project - matches nothing and is
 * refused before it turns into an empty catalog nobody can get out of.
 */
export async function inspectSpritesDir(path: string, definitionsDir: string): Promise<SpritesDirReport> {
  const expected = await expectedTopLevelDirs(definitionsDir);
  const report: SpritesDirReport = { path, exists: false, matched: [], expected: expected.size, usable: false };
  try {
    if (!(await stat(path)).isDirectory()) return report;
    report.exists = true;
    // Windows keeps folders nobody may read (C:\PerfLogs) right next to the
    // ones people browse, so an unreadable candidate is a folder that holds no
    // sprites - not a reason to fail the listing it appears in.
    const entries = await readdir(path, { withFileTypes: true });
    report.matched = entries.filter((e) => e.isDirectory() && expected.has(e.name)).map((e) => e.name).sort();
    report.usable = report.matched.length >= 2;
  } catch {
    /* unreadable: report what is known so far */
  }
  return report;
}
