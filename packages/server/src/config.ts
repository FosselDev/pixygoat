import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { readSettings } from "./settings.ts";

const here = dirname(fileURLToPath(import.meta.url));
/** repository root (packages/server/src -> ../../..) */
export const REPO_ROOT = resolve(here, "..", "..", "..");

export interface ServerConfig {
  port: number;
  host: string;
  spritesRoot: string;
  /** false when the sprite folder is missing - the app then offers the setup */
  spritesConfigured: boolean;
  /** where spritesRoot came from, so the setup can explain what it found */
  spritesSource: "flag" | "env" | "settings" | "default";
  /** higher-priority sources that were skipped because the folder is gone */
  spritesIgnored: { source: string; path: string }[];
  definitionsDir: string;
  cacheDir: string;
  charactersDir: string;
  appDist: string;
  dev: boolean;
  forceRebuild: boolean;
  exportDefaults: { unityDir: string; flatDir: string };
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

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/**
 * A missing sprite folder is not an error any more: the server starts anyway
 * and the app offers the setup, which picks a folder and writes it to the
 * settings file. The flag still beats the environment beats the settings, but
 * only among the ones that actually exist - a stale variable pointing at a
 * folder that is gone would otherwise outvote the folder just picked, and the
 * setup would ask again forever. What was skipped is reported, not hidden.
 */
function resolveSprites(): Pick<ServerConfig, "spritesRoot" | "spritesConfigured" | "spritesSource" | "spritesIgnored"> {
  const candidates = [
    ["flag", arg("sprites")],
    ["env", process.env.PIXYGOAT_SPRITES],
    ["settings", readSettings().spritesRoot],
    ["default", resolve(REPO_ROOT, "spritesheets")],
  ] as const;
  const given = candidates
    .filter(([, path]) => !!path)
    .map(([source, path]) => ({ source, path: resolve(path!) }));
  const used = given.find((c) => existsSync(c.path)) ?? given[given.length - 1]!;
  return {
    spritesRoot: used.path,
    spritesConfigured: existsSync(used.path),
    spritesSource: used.source,
    spritesIgnored: given.filter((c) => c !== used && !existsSync(c.path)),
  };
}

export function loadConfig(): ServerConfig {
  const sprites = resolveSprites();
  return {
    ...sprites,
    port: Number(arg("port") ?? process.env.PIXYGOAT_PORT ?? 4600),
    host: arg("host") ?? process.env.PIXYGOAT_HOST ?? "127.0.0.1",
    definitionsDir: resolve(REPO_ROOT, "data", "definitions"),
    cacheDir: resolve(arg("cache") ?? process.env.PIXYGOAT_CACHE ?? resolve(REPO_ROOT, ".cache")),
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
