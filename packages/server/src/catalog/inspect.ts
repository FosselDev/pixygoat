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

export interface DefinitionsDirReport {
  path: string;
  exists: boolean;
  /** how many JSON files the folder holds */
  count: number;
  /** enough of a match to build a catalog from */
  usable: boolean;
}

/**
 * A spritesheet folder holds `body/`, `hair/`, `weapon/` and so on. Rather
 * than keeping a second list of those names in step with the definitions, the
 * names are taken from the definitions themselves - whatever they reference is
 * what a sprite folder is supposed to contain.
 *
 * Keyed by folder, because the definitions are a folder somebody chooses now:
 * picking one restarts the server inside this same process, so a single cached
 * answer would outlive the directory it was read from.
 */
const expectedCache = new Map<string, Promise<Set<string>>>();

export function expectedTopLevelDirs(definitionsDir: string): Promise<Set<string>> {
  let pending = expectedCache.get(definitionsDir);
  if (!pending) {
    pending = readExpectedTopLevelDirs(definitionsDir);
    // An unreadable folder must not cache its own failure: the next call would
    // get the same rejection back without ever looking at the disk again.
    pending.catch(() => expectedCache.delete(definitionsDir));
    expectedCache.set(definitionsDir, pending);
  }
  return pending;
}

async function readExpectedTopLevelDirs(definitionsDir: string): Promise<Set<string>> {
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
}

/**
 * Is this the folder the user was looking for? Two matching top-level folders
 * are treated as enough: a partial checkout is still worth opening, while a
 * random folder - a home directory, a Unity project - matches nothing and is
 * refused before it turns into an empty catalog nobody can get out of.
 */
export async function inspectSpritesDir(path: string, definitionsDir: string): Promise<SpritesDirReport> {
  // Without definitions there is nothing to match against, and the folder
  // browser has to keep working anyway: it lists folders, it just cannot mark
  // any of them yet.
  const expected = await expectedTopLevelDirs(definitionsDir).catch(() => new Set<string>());
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

/** Enough files to tell definitions from a folder that happens to hold JSON. */
const DEFINITION_SAMPLE = 8;

/**
 * The same question for the other half: does this folder hold sheet
 * definitions? Parsing every file would mean reading 667 of them before the
 * user has even chosen anything, so a handful is sampled - a definition names
 * a type and points at least one body type at a sprite folder, and nothing
 * else in a JSON folder does both by accident.
 */
export async function inspectDefinitionsDir(path: string): Promise<DefinitionsDirReport> {
  const report: DefinitionsDirReport = { path, exists: false, count: 0, usable: false };
  try {
    if (!(await stat(path)).isDirectory()) return report;
    report.exists = true;
    const files = (await readdir(path)).filter((f) => f.endsWith(".json")).sort();
    report.count = files.length;
    for (const f of files.slice(0, DEFINITION_SAMPLE)) {
      try {
        const raw = JSON.parse(await readFile(join(path, f), "utf8")) as RawSheetDefinition;
        const item = parseDefinition(basename(f, ".json"), raw);
        if (item.typeName && item.layers.some((l) => Object.keys(l.paths).length > 0)) {
          report.usable = true;
          break;
        }
      } catch {
        /* not a definition: try the next one */
      }
    }
  } catch {
    /* unreadable: report what is known so far */
  }
  return report;
}
