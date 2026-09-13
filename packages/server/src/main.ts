import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyCompress from "@fastify/compress";
import { existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { loadConfig } from "./config.ts";
import { loadOrBuildCatalog } from "./catalog/build.ts";
import { registerCharacterRoutes } from "./routes/characters.ts";
import { registerExportRoutes } from "./routes/export.ts";

const cfg = loadConfig();
const app = Fastify({ logger: cfg.dev ? { level: "info" } : { level: "warn" }, bodyLimit: 50 * 1024 * 1024 });

const started = Date.now();
let catalogJsonGz: Buffer | null = null;
let catalogEtag = "";
let catalogStatus: { state: "building" | "ready" | "error"; message?: string } = { state: "building" };

// The catalog build runs in the background so the app can show progress
// instead of a blank page on first start.
const catalogPromise = loadOrBuildCatalog({
  spritesRoot: cfg.spritesRoot,
  definitionsDir: cfg.definitionsDir,
  cacheDir: cfg.cacheDir,
  force: cfg.forceRebuild,
  log: (m) => {
    catalogStatus = { state: "building", message: m };
    app.log.info(`[catalog] ${m}`);
  },
})
  .then((catalog) => {
    catalogJsonGz = gzipSync(Buffer.from(JSON.stringify(catalog)), { level: 6 });
    catalogEtag = `"${catalog.meta.fingerprint}"`;
    catalogStatus = { state: "ready" };
    return catalog;
  })
  .catch((err: Error) => {
    catalogStatus = { state: "error", message: err.message };
    app.log.error(err);
    throw err;
  });

await app.register(fastifyCompress, { global: false });

app.get("/api/health", async () => ({
  name: "PixyGoat",
  version: "0.1.0",
  uptimeMs: Date.now() - started,
  spritesRoot: cfg.spritesRoot,
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

await registerCharacterRoutes(app, cfg);
await registerExportRoutes(app, cfg, catalogPromise);

// Built app (production). In dev mode Vite serves the app and proxies to us.
if (existsSync(cfg.appDist)) {
  await app.register(fastifyStatic, {
    root: cfg.appDist,
    prefix: "/",
    decorateReply: true,
    index: ["index.html"],
    cacheControl: true,
    maxAge: "1h",
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

await app.listen({ port: cfg.port, host: cfg.host });
console.log(`PixyGoat server listening on http://${cfg.host}:${cfg.port}  (sprites: ${cfg.spritesRoot})`);
