import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, basename } from "node:path";
import {
  ANIMATIONS,
  CUSTOM_ANIMATIONS,
  parseDefinition,
  type Catalog,
  type CatalogItem,
  type RawSheetDefinition,
  type SheetDir,
  type SheetInfo,
} from "@pixygoat/core";
import { readPngSize, scanSprites, type DirIndex } from "./scan.ts";

export interface BuildOptions {
  spritesRoot: string;
  definitionsDir: string;
  cacheDir: string;
  /** rebuild even when the cached catalog matches the fingerprint */
  force?: boolean;
  log?: (msg: string) => void;
}

const CATALOG_VERSION = 1;
const ANIMATION_IDS = new Set(ANIMATIONS.map((a) => a.id));

/**
 * Builds (or loads from cache) the catalog. The fingerprint covers the
 * definitions, the data files and the directory mtimes of the sprites tree,
 * so touching a sheet folder or a definition triggers a rebuild.
 */
export async function loadOrBuildCatalog(opts: BuildOptions): Promise<Catalog> {
  const log = opts.log ?? (() => {});
  const cacheFile = join(opts.cacheDir, "catalog.json");
  const t0 = Date.now();

  log("scanning sprites directory…");
  const index = await scanSprites(opts.spritesRoot, (d, f) => log(`  ${d} directories, ${f} files`));

  const definitions = await loadDefinitions(opts.definitionsDir);
  const fingerprint = fingerprintOf(index, definitions);

  if (!opts.force) {
    try {
      const cached = JSON.parse(await readFile(cacheFile, "utf8")) as Catalog;
      if (cached.meta?.version === CATALOG_VERSION && cached.meta.fingerprint === fingerprint) {
        log(`catalog loaded from cache (${Date.now() - t0} ms)`);
        return cached;
      }
    } catch {
      /* no cache yet */
    }
  }

  log("building catalog…");
  const catalog = await buildCatalog(index, definitions, opts.spritesRoot, fingerprint, t0, log);
  await mkdir(opts.cacheDir, { recursive: true });
  await writeFile(cacheFile, JSON.stringify(catalog));
  log(`catalog built: ${catalog.meta.itemCount} items, ${catalog.meta.sheetDirCount} sheet dirs (${catalog.meta.buildMs} ms)`);
  return catalog;
}

async function loadDefinitions(dir: string): Promise<Map<string, RawSheetDefinition>> {
  const out = new Map<string, RawSheetDefinition>();
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  for (const f of files) {
    const raw = JSON.parse(await readFile(join(dir, f), "utf8")) as RawSheetDefinition;
    out.set(basename(f, ".json"), raw);
  }
  return out;
}

function fingerprintOf(index: DirIndex, definitions: Map<string, RawSheetDefinition>): string {
  const h = createHash("sha1");
  h.update(`v${CATALOG_VERSION}`);
  for (const [path, entry] of [...index.entries()].sort()) {
    h.update(`${path}:${entry.mtimeMs}:${entry.files.length}:${entry.dirs.length}\n`);
  }
  for (const [id, def] of definitions) h.update(id + JSON.stringify(def));
  h.update(JSON.stringify(ANIMATIONS) + JSON.stringify(CUSTOM_ANIMATIONS));
  return h.digest("hex");
}

async function buildCatalog(
  index: DirIndex,
  definitions: Map<string, RawSheetDefinition>,
  spritesRoot: string,
  fingerprint: string,
  t0: number,
  log: (msg: string) => void,
): Promise<Catalog> {
  const variantTable: string[] = [];
  const variantIdx = new Map<string, number>();
  const vIndex = (name: string) => {
    let i = variantIdx.get(name);
    if (i === undefined) {
      i = variantTable.length;
      variantTable.push(name);
      variantIdx.set(name, i);
    }
    return i;
  };

  // Every directory that directly contains PNGs or animation sub-directories
  // is a candidate sheet directory.
  const sheets: Record<string, SheetDir> = {};
  const sizeCache = new Map<string, { width: number; height: number } | null>();
  const sizeOf = async (relFile: string) => {
    if (!sizeCache.has(relFile)) sizeCache.set(relFile, await readPngSize(join(spritesRoot, relFile)));
    return sizeCache.get(relFile) ?? null;
  };

  // Directories that definitions point at. A folder named like an animation
  // (…/walk) normally holds the variant files of its parent sheet directory;
  // only when a definition references it directly (some polearms keep
  // custom-layout sheets in …/foreground/walk) is it a sheet directory itself.
  const definedDirs = new Set<string>();
  for (const raw of definitions.values()) {
    const item = parseDefinition("_", raw);
    for (const layer of item.layers)
      for (const p of Object.values(layer.paths))
        for (const dir of expandPlaceholders(p, item.replaceInPath)) definedDirs.add(dir);
  }

  let probed = 0;
  for (const [path, entry] of index) {
    if (path === "") continue;
    if (ANIMATION_IDS.has(basename(path)) && !definedDirs.has(path)) continue;
    const animDirs = entry.dirs.filter((d) => ANIMATION_IDS.has(d));
    const looseFiles = entry.files.filter((f) => !ANIMATION_IDS.has(f));
    if (animDirs.length === 0 && looseFiles.length === 0) continue;

    const sheet: SheetDir = { anims: {} };
    for (const anim of animDirs) {
      const sub = index.get(`${path}/${anim}`);
      if (!sub || sub.files.length === 0) continue;
      const size = await sizeOf(`${path}/${anim}/${sub.files[0]}.png`);
      probed++;
      if (!size) continue;
      const info: SheetInfo = { w: size.width, h: size.height, v: sub.files.map(vIndex) };
      sheet.anims[anim] = info;
    }
    if (looseFiles.length > 0) {
      const size = await sizeOf(`${path}/${looseFiles[0]}.png`);
      probed++;
      if (size) sheet.files = { w: size.width, h: size.height, v: looseFiles.map(vIndex) };
    }
    if (Object.keys(sheet.anims).length > 0 || sheet.files) sheets[path] = sheet;
    if (probed % 2000 === 0 && probed > 0) log(`  probed ${probed} sheets`);
  }

  // Items from definitions, availability checked against the sheet dirs.
  const items: CatalogItem[] = [];
  const covered = new Set<string>();
  for (const [id, raw] of definitions) {
    const item = parseDefinition(id, raw);
    let available = false;
    for (const layer of item.layers) {
      for (const p of Object.values(layer.paths)) {
        for (const dir of expandPlaceholders(p, item.replaceInPath)) {
          if (sheets[dir]) {
            available = true;
            covered.add(dir);
          }
        }
      }
    }
    item.available = available;
    items.push(item);
  }

  const catalog: Catalog = {
    meta: {
      format: "pixygoat.catalog",
      version: CATALOG_VERSION,
      builtAt: new Date().toISOString(),
      spritesRoot,
      fingerprint,
      definitionCount: definitions.size,
      itemCount: items.length,
      sheetDirCount: Object.keys(sheets).length,
      buildMs: Date.now() - t0,
    },
    animations: ANIMATIONS,
    customAnimations: CUSTOM_ANIMATIONS,
    variantTable,
    items,
    sheets,
  };
  const uncovered = Object.keys(sheets).filter((d) => !covered.has(d)).length;
  log(`  ${items.filter((i) => i.available).length}/${items.length} items available, ${uncovered} sheet dirs without definition`);
  return catalog;
}

/** Expands `${var}` placeholders with every value of the replacement table. */
export function expandPlaceholders(
  path: string,
  table: Record<string, Record<string, string>> | undefined,
): string[] {
  if (!path.includes("${")) return [path];
  let candidates = [path];
  for (const [variable, mapping] of Object.entries(table ?? {})) {
    const token = "${" + variable + "}";
    const values = Array.from(new Set(Object.values(mapping).filter((v) => v !== "none")));
    candidates = candidates.flatMap((c) =>
      c.includes(token) ? values.map((v) => c.replaceAll(token, v)) : [c],
    );
  }
  return candidates.filter((c) => !c.includes("${"));
}
