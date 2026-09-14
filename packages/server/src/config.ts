import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readdirSync } from "node:fs";
import { UPSTREAM, type UpstreamSource } from "@pixygoat/core";
import { readSettings } from "./settings.ts";

const here = dirname(fileURLToPath(import.meta.url));
/** repository root (packages/server/src -> ../../..) */
export const REPO_ROOT = resolve(here, "..", "..", "..");

export type SpritesSource = "flag" | "env" | "settings" | "default";
export type DefinitionsSource = "flag" | "env" | "settings" | "sprites" | "cache" | "bundled";

export interface ServerConfig {
  port: number;
  host: string;
  spritesRoot: string;
  /** false when the sprite folder is missing - the app then offers the setup */
  spritesConfigured: boolean;
  /** where spritesRoot came from, so the setup can explain what it found */
  spritesSource: SpritesSource;
  /** sources the user named that were skipped because the folder is gone */
  spritesIgnored: { source: string; path: string }[];
  definitionsDir: string;
  /** false when no folder holds sheet definitions - same deal as the sprites */
  definitionsConfigured: boolean;
  definitionsSource: DefinitionsSource;
  definitionsIgnored: { source: string; path: string }[];
  /** the repository the definitions are fetched from, and at which commit */
  upstream: UpstreamSource;
  /** working copy for whatever is fetched from upstream */
  upstreamDir: string;
  cacheDir: string;
  charactersDir: string;
  appDist: string;
  dev: boolean;
  forceRebuild: boolean;
  exportDefaults: { unityDir: string; flatDir: string };
}

/**
 * One place a resource could be. `explicit` marks the ones a user named on
 * purpose - only those are worth reporting when they turn out to be empty; a
 * derived location that happens not to exist is not something anybody ignored.
 */
export interface Candidate<S extends string> {
  source: S;
  path: string;
  explicit: boolean;
}

export interface Resolution<S extends string> {
  path: string;
  configured: boolean;
  source: S;
  ignored: { source: string; path: string }[];
}

/**
 * The first candidate that is actually there wins, which is what keeps a stale
 * variable from outvoting the folder somebody just picked: it would otherwise
 * stay in front forever and the setup would ask again and again. When nothing
 * is there the last candidate stands in, so there is still a path to name in
 * the message.
 */
export function pickPath<S extends string>(
  candidates: Candidate<S>[],
  ok: (path: string) => boolean,
): Resolution<S> {
  const hit = candidates.findIndex((c) => ok(c.path));
  const index = hit >= 0 ? hit : candidates.length - 1;
  const used = candidates[index]!;
  return {
    path: used.path,
    configured: hit >= 0,
    source: used.source,
    ignored: candidates
      .slice(0, index)
      .filter((c) => c.explicit)
      .map(({ source, path }) => ({ source, path })),
  };
}

function candidate<S extends string>(source: S, path: string | undefined, explicit: boolean): Candidate<S>[] {
  return path ? [{ source, path: resolve(path), explicit }] : [];
}

export function spriteCandidates(input: {
  flag?: string;
  env?: string;
  settings?: string;
  repoRoot: string;
}): Candidate<SpritesSource>[] {
  return [
    ...candidate("flag", input.flag, true),
    ...candidate("env", input.env, true),
    ...candidate("settings", input.settings, true),
    ...candidate("default", join(input.repoRoot, "spritesheets"), false),
  ];
}

/**
 * Where the sheet definitions may sit. They are not part of this repository:
 * they belong to the generator the sprites come from and are fetched or
 * checked out along with them. The folder next to the sprites comes before
 * anything fetched separately - definitions that travelled with a sprite
 * checkout describe exactly those sprites, whatever snapshot they are from.
 */
export function definitionCandidates(input: {
  flag?: string;
  env?: string;
  settings?: string;
  spritesRoot: string;
  upstreamDir: string;
  repoRoot: string;
  /** what the folder is called upstream, and therefore everywhere else */
  definitionsPath: string;
}): Candidate<DefinitionsSource>[] {
  return [
    ...candidate("flag", input.flag, true),
    ...candidate("env", input.env, true),
    ...candidate("settings", input.settings, true),
    ...candidate("sprites", join(dirname(input.spritesRoot), input.definitionsPath), false),
    ...candidate("cache", join(input.upstreamDir, input.definitionsPath), false),
    // A copy somebody put into the repository by hand. PixyGoat ships none.
    ...candidate("bundled", join(input.repoRoot, "data", "definitions"), false),
  ];
}

/**
 * Cheap enough to run on every candidate: a folder of definitions is a folder
 * with JSON in it. Whether the JSON means anything is a question for
 * `inspectDefinitionsDir`, which the setup asks before writing a path down.
 */
export function holdsDefinitions(path: string): boolean {
  try {
    return readdirSync(path).some((f) => f.endsWith(".json"));
  } catch {
    return false;
  }
}

/**
 * Where the Unity export lands by default: a folder inside this repository,
 * unless PIXYGOAT_UNITY_DIR points somewhere else - typically an Assets path
 * in the Unity project that is going to read it. The export dialog offers this
 * as a suggestion and remembers whatever a character was last exported to.
 */
function defaultUnityDir(): string {
  const env = process.env.PIXYGOAT_UNITY_DIR;
  return env ? resolve(env) : resolve(REPO_ROOT, "exports", "unity");
}

/**
 * The pinned snapshot, unless somebody points PixyGoat at a fork, a mirror or
 * a newer commit. The catalogue was built against the pinned one; another may
 * describe parts this version has never heard of.
 */
function resolveUpstream(): UpstreamSource {
  return {
    ...UPSTREAM,
    repo: process.env.PIXYGOAT_UPSTREAM_REPO ?? UPSTREAM.repo,
    ref: process.env.PIXYGOAT_UPSTREAM_REF ?? UPSTREAM.ref,
  };
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

export function loadConfig(): ServerConfig {
  const settings = readSettings();
  const sprites = pickPath(
    spriteCandidates({
      flag: arg("sprites"),
      env: process.env.PIXYGOAT_SPRITES,
      settings: settings.spritesRoot,
      repoRoot: REPO_ROOT,
    }),
    existsSync,
  );
  const cacheDir = resolve(arg("cache") ?? process.env.PIXYGOAT_CACHE ?? resolve(REPO_ROOT, ".cache"));
  const upstream = resolveUpstream();
  const upstreamDir = join(cacheDir, "upstream");
  const definitions = pickPath(
    definitionCandidates({
      flag: arg("definitions"),
      env: process.env.PIXYGOAT_DEFINITIONS,
      settings: settings.definitionsRoot,
      spritesRoot: sprites.path,
      upstreamDir,
      repoRoot: REPO_ROOT,
      definitionsPath: upstream.definitionsPath,
    }),
    holdsDefinitions,
  );
  return {
    spritesRoot: sprites.path,
    spritesConfigured: sprites.configured,
    spritesSource: sprites.source,
    spritesIgnored: sprites.ignored,
    definitionsDir: definitions.path,
    definitionsConfigured: definitions.configured,
    definitionsSource: definitions.source,
    definitionsIgnored: definitions.ignored,
    upstream,
    upstreamDir,
    port: Number(arg("port") ?? process.env.PIXYGOAT_PORT ?? 4600),
    host: arg("host") ?? process.env.PIXYGOAT_HOST ?? "127.0.0.1",
    cacheDir,
    charactersDir: resolve(arg("characters") ?? process.env.PIXYGOAT_CHARACTERS ?? resolve(REPO_ROOT, "characters")),
    appDist: resolve(REPO_ROOT, "packages", "app", "dist"),
    dev: process.argv.includes("--dev"),
    forceRebuild: process.argv.includes("--rebuild") || !!process.env.PIXYGOAT_REBUILD,
    exportDefaults: {
      unityDir: defaultUnityDir(),
      flatDir: resolve(process.env.PIXYGOAT_EXPORT_DIR ?? resolve(REPO_ROOT, "exports", "flat")),
    },
  };
}
