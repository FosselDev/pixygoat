import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * What the setup in the browser writes down, so the next start needs no
 * arguments. Flags and environment variables still win over this file - it is
 * the fallback for people who never touch a terminal, not a second config
 * system.
 */
export interface Settings {
  spritesRoot?: string;
  /** a folder of sheet definitions, if the setup had to go looking for one */
  definitionsRoot?: string;
}

const here = dirname(fileURLToPath(import.meta.url));
export const SETTINGS_FILE = resolve(here, "..", "..", "..", "pixygoat.settings.json");

export function readSettings(): Settings {
  try {
    const parsed = JSON.parse(readFileSync(SETTINGS_FILE, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Settings;
  } catch {
    return {};
  }
}

export function writeSettings(patch: Settings): Settings {
  const next = { ...readSettings(), ...patch };
  writeFileSync(SETTINGS_FILE, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}
