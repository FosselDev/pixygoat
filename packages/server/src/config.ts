import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
/** repository root (packages/server/src -> ../../..) */
export const REPO_ROOT = resolve(here, "..", "..", "..");

export interface ServerConfig {
  port: number;
  host: string;
  spritesRoot: string;
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

export function loadConfig(): ServerConfig {
  const spritesRoot = resolve(arg("sprites") ?? process.env.PIXYGOAT_SPRITES ?? resolve(REPO_ROOT, "spritesheets"));
  if (!existsSync(spritesRoot)) {
    throw new Error(`Sprites directory not found: ${spritesRoot} (use --sprites <path> or PIXYGOAT_SPRITES)`);
  }
  return {
    port: Number(arg("port") ?? process.env.PIXYGOAT_PORT ?? 4600),
    host: arg("host") ?? process.env.PIXYGOAT_HOST ?? "127.0.0.1",
    spritesRoot,
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
