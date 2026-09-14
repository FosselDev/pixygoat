import type { FastifyInstance, FastifyReply } from "fastify";
import { readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve, parse as parsePath } from "node:path";
import type { ServerConfig } from "../config.ts";
import { writeSettings, SETTINGS_FILE } from "../settings.ts";
import { inspectSpritesDir } from "../catalog/inspect.ts";

interface BrowseEntry {
  name: string;
  path: string;
  /** top-level sprite folders found inside, for the "this is the one" hint */
  matched: number;
}

/** Windows has no root to list, so the drives are probed letter by letter. */
function windowsDrives(): string[] {
  const out: string[] = [];
  for (let c = 65; c <= 90; c++) {
    const root = `${String.fromCharCode(c)}:\\`;
    if (existsSync(root)) out.push(root);
  }
  return out;
}

/** Where a first-time user plausibly keeps the download. */
function startingPoints(cfg: ServerConfig): string[] {
  const home = homedir();
  const candidates = [
    cfg.spritesRoot,
    dirname(cfg.spritesRoot),
    process.cwd(),
    join(home, "Downloads"),
    join(home, "Documents"),
    home,
    ...(process.platform === "win32" ? windowsDrives() : ["/"]),
  ];
  return [...new Set(candidates.map((p) => resolve(p)))].filter((p) => existsSync(p));
}

/**
 * The browser cannot hand out a real path - a file picker only ever yields
 * names - so the directory tree is walked here and the user clicks through it.
 * Listing arbitrary folders is the whole point, which is also why these routes
 * answer only while the sprite folder is still unset: once it is, there is
 * nothing left to browse for.
 */
export function registerSetupRoutes(app: FastifyInstance, cfg: ServerConfig, onSpritesChosen: () => void) {
  const closed = (reply: FastifyReply) => {
    reply.code(409);
    return { error: "sprites directory is already configured" };
  };

  app.get("/api/setup/state", async () => ({
    configured: cfg.spritesConfigured,
    spritesRoot: cfg.spritesRoot,
    source: cfg.spritesSource,
    ignored: cfg.spritesIgnored,
    settingsFile: SETTINGS_FILE,
    places: cfg.spritesConfigured ? [] : startingPoints(cfg),
  }));

  app.get<{ Querystring: { path?: string } }>("/api/setup/browse", async (req, reply) => {
    if (cfg.spritesConfigured) return closed(reply);
    const target = resolve(req.query.path?.trim() || startingPoints(cfg)[0]!);
    let dirs: string[];
    try {
      dirs = (await readdir(target, { withFileTypes: true }))
        .filter((e) => e.isDirectory() && !e.name.startsWith("."))
        .map((e) => e.name)
        .sort((a, b) => a.localeCompare(b));
    } catch (err) {
      reply.code(400);
      return { error: (err as Error).message, path: target };
    }
    // Marking every child costs one readdir each, which is fine for a folder
    // full of folders and not worth it for a folder full of thousands.
    const entries: BrowseEntry[] = await Promise.all(
      dirs.map(async (name) => {
        const path = join(target, name);
        const matched = dirs.length <= 200 ? (await inspectSpritesDir(path, cfg.definitionsDir)).matched.length : 0;
        return { name, path, matched };
      }),
    );
    const root = parsePath(target).root;
    return {
      path: target,
      parent: target === root ? null : dirname(target),
      entries,
      report: await inspectSpritesDir(target, cfg.definitionsDir),
    };
  });

  app.post<{ Body: { path?: string } }>("/api/setup/sprites", async (req, reply) => {
    if (cfg.spritesConfigured) return closed(reply);
    const raw = req.body?.path?.trim();
    if (!raw) {
      reply.code(400);
      return { error: "path is required" };
    }
    const path = resolve(raw);
    const report = await inspectSpritesDir(path, cfg.definitionsDir);
    if (!report.exists || !report.usable) {
      reply.code(400);
      return { error: report.exists ? "not-a-sprites-dir" : "not-found", report };
    }
    writeSettings({ spritesRoot: path });
    app.log.info(`[setup] sprites directory set to ${path}`);
    // The reply goes out first: choosing a folder restarts the server so the
    // sprite route can be mounted on it.
    setTimeout(onSpritesChosen, 100);
    return { ok: true, spritesRoot: path, report };
  });
}
