import type { FastifyInstance, FastifyReply } from "fastify";
import { readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve, parse as parsePath } from "node:path";
import { upstreamZipUrl } from "@pixygoat/core";
import type { ServerConfig } from "../config.ts";
import { writeSettings, SETTINGS_FILE } from "../settings.ts";
import { inspectSpritesDir, inspectDefinitionsDir } from "../catalog/inspect.ts";
import { fetchDefinitionsOnce, FetchError, type FetchErrorCode } from "../catalog/fetch-definitions.ts";

interface BrowseEntry {
  name: string;
  path: string;
  /** top-level sprite folders found inside, for the "this is the one" hint */
  matched: number;
}

/** What the fetch is doing, polled by the setup rather than streamed. */
type FetchJob =
  | { state: "running"; phase: string; message: string }
  | { state: "done"; path: string; count: number; commit: string }
  | { state: "error"; code: FetchErrorCode; message: string; detail?: string };

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

/** How many folders to look inside when guessing where the sprites went. */
const SUGGESTION_BUDGET = 60;

/**
 * Most people end up with the sprites in one of a handful of places: next to
 * PixyGoat, in the folder they cloned the generator into, or in Downloads.
 * Checking those directly turns the folder browser from the only way in into
 * the fallback for everyone else - one click instead of ten.
 */
async function spriteSuggestions(cfg: ServerConfig): Promise<{ path: string; matched: number }[]> {
  const home = homedir();
  // Both levels matter: a generator checkout ends up inside the PixyGoat
  // folder or right next to it, depending on where the clone was started.
  const parents = [
    dirname(cfg.spritesRoot),
    dirname(dirname(cfg.spritesRoot)),
    dirname(cfg.cacheDir),
    process.cwd(),
    join(home, "Downloads"),
  ];
  const direct = [cfg.spritesRoot, join(process.cwd(), "spritesheets")];
  const nested: string[] = [];
  for (const parent of [...new Set(parents)]) {
    try {
      const entries = await readdir(parent, { withFileTypes: true });
      for (const e of entries.filter((d) => d.isDirectory() && !d.name.startsWith("."))) {
        nested.push(join(parent, e.name, "spritesheets"));
        if (nested.length >= SUGGESTION_BUDGET) break;
      }
    } catch {
      /* unreadable: nothing to suggest from here */
    }
    if (nested.length >= SUGGESTION_BUDGET) break;
  }
  const seen = new Set<string>();
  const out: { path: string; matched: number }[] = [];
  for (const path of [...direct, ...nested].map((p) => resolve(p))) {
    if (seen.has(path)) continue;
    seen.add(path);
    const report = await inspectSpritesDir(path, cfg.definitionsDir);
    if (report.usable) out.push({ path, matched: report.matched.length });
    if (out.length >= 5) break;
  }
  return out;
}

/**
 * The setup asks for two things, in this order: the sheet definitions, then
 * the sprites they describe. The order is not a preference - the definitions
 * are what says which folders a sprite directory is supposed to contain, so
 * without them the folder browser cannot mark anything and the choice cannot
 * be judged.
 *
 * The browser cannot hand out a real path - a file picker only ever yields
 * names - so the directory tree is walked here and the user clicks through it.
 * Listing arbitrary folders is the whole point, which is also why these routes
 * answer only while the setup is unfinished.
 */
export function registerSetupRoutes(app: FastifyInstance, cfg: ServerConfig, onSetupChanged: () => void) {
  let job: FetchJob | null = null;
  const done = () => cfg.spritesConfigured && cfg.definitionsConfigured;

  const closed = (reply: FastifyReply, what: "setup" | "definitions" | "sprites") => {
    reply.code(409);
    return { error: `${what} is already configured` };
  };

  /** Choosing anything swaps the server: the config is read once, at start. */
  const restartSoon = () => setTimeout(onSetupChanged, 100);

  app.get("/api/setup/state", async () => {
    const definitions = cfg.definitionsConfigured ? await inspectDefinitionsDir(cfg.definitionsDir) : null;
    return {
      done: done(),
      settingsFile: SETTINGS_FILE,
      platform: process.platform,
      definitions: {
        configured: cfg.definitionsConfigured,
        path: cfg.definitionsDir,
        source: cfg.definitionsSource,
        count: definitions?.count ?? 0,
        ignored: cfg.definitionsIgnored,
      },
      sprites: {
        configured: cfg.spritesConfigured,
        path: cfg.spritesRoot,
        source: cfg.spritesSource,
        ignored: cfg.spritesIgnored,
        places: cfg.spritesConfigured ? [] : startingPoints(cfg),
        suggestions: cfg.spritesConfigured || !cfg.definitionsConfigured ? [] : await spriteSuggestions(cfg),
      },
      upstream: {
        ...cfg.upstream,
        zipUrl: upstreamZipUrl(cfg.upstream),
        fetchTarget: cfg.upstreamDir,
      },
      fetch: job,
    };
  });

  app.get<{ Querystring: { path?: string; what?: string } }>("/api/setup/probe", async (req, reply) => {
    if (done()) return closed(reply, "setup");
    const path = resolve(req.query.path?.trim() || cfg.spritesRoot);
    return req.query.what === "definitions"
      ? { what: "definitions", report: await inspectDefinitionsDir(path) }
      : { what: "sprites", report: await inspectSpritesDir(path, cfg.definitionsDir) };
  });

  app.get<{ Querystring: { path?: string } }>("/api/setup/browse", async (req, reply) => {
    if (done()) return closed(reply, "setup");
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

  app.post<{ Body: { repo?: string; ref?: string } }>("/api/setup/definitions/fetch", async (req, reply) => {
    if (cfg.definitionsConfigured) return closed(reply, "definitions");
    if (job?.state === "running") return { started: false, fetch: job };
    const source = {
      ...cfg.upstream,
      repo: req.body?.repo?.trim() || cfg.upstream.repo,
      ref: req.body?.ref?.trim() || cfg.upstream.ref,
    };
    job = { state: "running", phase: "prepare", message: "starting" };
    void fetchDefinitionsOnce({
      source,
      into: cfg.upstreamDir,
      log: (p) => {
        job = { state: "running", phase: p.phase, message: p.message };
      },
    })
      .then((result) => {
        job = { state: "done", path: result.path, count: result.count, commit: result.commit };
        // Remembered so a later rebuild uses the same source, and so the form
        // still shows what was actually fetched rather than the default.
        if (source.repo !== cfg.upstream.repo || source.ref !== cfg.upstream.ref) {
          writeSettings({ upstreamRepo: source.repo, upstreamRef: source.ref });
        }
        app.log.info(`[setup] ${result.count} definitions at ${result.path}`);
        restartSoon();
      })
      .catch((err: Error) => {
        const e = err as FetchError;
        job = { state: "error", code: e.code ?? "git-failed", message: e.message, detail: e.detail };
        app.log.error(`[setup] ${e.message}${e.detail ? ` - ${e.detail}` : ""}`);
      });
    reply.code(202);
    return { started: true, fetch: job };
  });

  app.post<{ Body: { path?: string } }>("/api/setup/definitions", async (req, reply) => {
    if (cfg.definitionsConfigured) return closed(reply, "definitions");
    const raw = req.body?.path?.trim();
    if (!raw) {
      reply.code(400);
      return { error: "path is required" };
    }
    const path = resolve(raw);
    const report = await inspectDefinitionsDir(path);
    if (!report.usable) {
      reply.code(400);
      return {
        // A folder whose definitions sit one level down is the newer upstream
        // layout, not an empty folder, and deserves to be told apart.
        error: !report.exists ? "not-found" : report.nested > 0 ? "layout-unsupported" : "not-definitions",
        report,
      };
    }
    writeSettings({ definitionsRoot: path });
    app.log.info(`[setup] definitions directory set to ${path}`);
    restartSoon();
    return { ok: true, definitionsRoot: path, report };
  });

  app.post<{ Body: { path?: string } }>("/api/setup/sprites", async (req, reply) => {
    if (cfg.spritesConfigured) return closed(reply, "sprites");
    const raw = req.body?.path?.trim();
    if (!raw) {
      reply.code(400);
      return { error: "path is required" };
    }
    // Without the definitions there is nothing to judge a sprite folder
    // against, which is why the setup asks for them first.
    if (!cfg.definitionsConfigured) {
      reply.code(409);
      return { error: "definitions-required" };
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
    restartSoon();
    return { ok: true, spritesRoot: path, report };
  });
}
