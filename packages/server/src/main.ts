import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyCompress from "@fastify/compress";
import { existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { loadConfig, type ServerConfig } from "./config.ts";
import { loadOrBuildCatalog, type BuildProgress } from "./catalog/build.ts";
import { registerCharacterRoutes } from "./routes/characters.ts";
import { registerExportRoutes } from "./routes/export.ts";
import { registerSetupRoutes } from "./routes/setup.ts";

type CatalogStatus =
  | { state: "unconfigured" }
  | { state: "building"; message?: string; progress?: BuildProgress }
  | { state: "ready" }
  | { state: "error"; message: string };

/**
 * One server for one sprite folder. Everything the catalog depends on is built
 * here rather than at module level, because picking a folder in the setup
 * swaps the whole instance: Fastify takes no new routes once it listens, and
 * the sprite route needs a root that exists.
 */
async function buildApp(cfg: ServerConfig, restart: () => void): Promise<FastifyInstance> {
  const app = Fastify({ logger: cfg.dev ? { level: "info" } : { level: "warn" }, bodyLimit: 50 * 1024 * 1024 });

  const started = Date.now();
  let catalogJsonGz: Buffer | null = null;
  let catalogEtag = "";
  let catalogStatus: CatalogStatus = cfg.spritesConfigured ? { state: "building" } : { state: "unconfigured" };

  // The catalog build runs in the background so the app can show progress
  // instead of a blank page on first start.
  if (cfg.spritesConfigured) {
    void loadOrBuildCatalog({
      spritesRoot: cfg.spritesRoot,
      definitionsDir: cfg.definitionsDir,
      cacheDir: cfg.cacheDir,
      force: cfg.forceRebuild,
      log: (m, progress) => {
        catalogStatus = { state: "building", message: m, progress };
        app.log.info(`[catalog] ${m}`);
      },
    })
      .then((catalog) => {
        catalogJsonGz = gzipSync(Buffer.from(JSON.stringify(catalog)), { level: 6 });
        catalogEtag = `"${catalog.meta.fingerprint}"`;
        catalogStatus = { state: "ready" };
      })
      .catch((err: Error) => {
        catalogStatus = { state: "error", message: err.message };
        app.log.error(err);
      });
  }

  await app.register(fastifyCompress, { global: false });

  app.get("/api/health", async () => ({
    name: "PixyGoat",
    version: "0.1.0",
    uptimeMs: Date.now() - started,
    spritesRoot: cfg.spritesRoot,
    spritesConfigured: cfg.spritesConfigured,
    charactersDir: cfg.charactersDir,
    exportDefaults: cfg.exportDefaults,
    catalog: catalogStatus,
  }));

  app.get("/api/catalog", async (req, reply) => {
    if (!catalogJsonGz) {
      reply.code(503).header("Retry-After", "2");
      return { status: catalogStatus };
    }
    if (req.headers["if-none-match"] === catalogEtag) {
      reply.code(304);
      return null;
    }
    reply
      .header("Content-Type", "application/json; charset=utf-8")
      .header("Content-Encoding", "gzip")
      .header("ETag", catalogEtag)
      .header("Cache-Control", "no-cache");
    return reply.send(catalogJsonGz);
  });

  registerSetupRoutes(app, cfg, restart);

  if (cfg.spritesConfigured) {
    await app.register(fastifyStatic, {
      root: cfg.spritesRoot,
      prefix: "/sprites/",
      decorateReply: false,
      cacheControl: true,
      maxAge: "30d",
      immutable: true,
      etag: true,
      index: false,
      list: false,
    });
  }

  await registerCharacterRoutes(app, cfg);
  await registerExportRoutes(app);

  // Built app (production). In dev mode Vite serves the app and proxies to us.
  if (existsSync(cfg.appDist)) {
    await app.register(fastifyStatic, {
      root: cfg.appDist,
      prefix: "/",
      decorateReply: true,
      index: ["index.html"],
      cacheControl: false,
      // Vite hashes every asset name, so those never change under a browser.
      // index.html is the one file that does, and caching it hands people the
      // previous build after an update until the cache happens to expire.
      setHeaders: (reply, path) => {
        reply.header("Cache-Control", path.endsWith(".html") ? "no-cache" : "public, max-age=31536000, immutable");
      },
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/") || req.url.startsWith("/sprites/")) {
        reply.code(404).send({ error: "not found" });
        return;
      }
      reply.sendFile("index.html");
    });
  } else {
    app.get("/", async () => ({
      name: "PixyGoat server",
      hint: "App not built. Run `npm run dev` for development or `npm start` for a production build.",
    }));
  }

  return app;
}

let app: FastifyInstance | null = null;
let restarting = false;

async function start(): Promise<void> {
  const cfg = loadConfig();
  app = await buildApp(cfg, () => void restart());
  await app.listen({ port: cfg.port, host: cfg.host });
  const where = cfg.spritesConfigured ? `sprites: ${cfg.spritesRoot}` : "no sprites yet - the app will ask for the folder";
  console.log(`PixyGoat server listening on http://${cfg.host}:${cfg.port}  (${where})`);
  for (const i of cfg.spritesIgnored) console.warn(`  ignoring ${i.source}: ${i.path} does not exist`);
}

/** Setup picked a folder: same port, same process, a server that knows it. */
async function restart(): Promise<void> {
  if (restarting) return;
  restarting = true;
  try {
    await app?.close();
    await start();
  } finally {
    restarting = false;
  }
}

await start();
