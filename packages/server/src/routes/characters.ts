import type { FastifyInstance } from "fastify";
import { mkdir, readdir, readFile, writeFile, unlink, stat } from "node:fs/promises";
import { join, basename } from "node:path";
import type { ServerConfig } from "../config.ts";

const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,80}$/;

function fileFor(dir: string, name: string): string {
  if (!SAFE_NAME.test(name)) throw Object.assign(new Error("invalid character name"), { statusCode: 400 });
  return join(dir, `${basename(name)}.character.json`);
}

/**
 * Server-side character storage: `characters/<name>.character.json`.
 * The app can also download and open files directly; this is the convenient
 * default location.
 */
export async function registerCharacterRoutes(app: FastifyInstance, cfg: ServerConfig) {
  await mkdir(cfg.charactersDir, { recursive: true });

  app.get("/api/characters", async () => {
    const files = (await readdir(cfg.charactersDir)).filter((f) => f.endsWith(".character.json"));
    const list = await Promise.all(
      files.map(async (f) => {
        const s = await stat(join(cfg.charactersDir, f));
        let bodyType: string | undefined;
        let name = f.replace(/\.character\.json$/, "");
        try {
          const doc = JSON.parse(await readFile(join(cfg.charactersDir, f), "utf8"));
          bodyType = doc.bodyType;
          name = doc.name ?? name;
        } catch {
          /* ignore broken file in listing */
        }
        return { file: f.replace(/\.character\.json$/, ""), name, bodyType, modifiedAt: s.mtime.toISOString(), size: s.size };
      }),
    );
    list.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
    return { dir: cfg.charactersDir, characters: list };
  });

  app.get<{ Params: { name: string } }>("/api/characters/:name", async (req, reply) => {
    try {
      const txt = await readFile(fileFor(cfg.charactersDir, req.params.name), "utf8");
      reply.header("Content-Type", "application/json; charset=utf-8");
      return txt;
    } catch (err) {
      reply.code((err as { statusCode?: number }).statusCode ?? 404);
      return { error: "character not found" };
    }
  });

  app.put<{ Params: { name: string }; Body: unknown }>("/api/characters/:name", async (req, reply) => {
    const body = req.body as { format?: string } | undefined;
    if (!body || body.format !== "pixygoat.character") {
      reply.code(400);
      return { error: "body must be a pixygoat.character document" };
    }
    const file = fileFor(cfg.charactersDir, req.params.name);
    await writeFile(file, JSON.stringify(body, null, 2));
    return { ok: true, file };
  });

  app.delete<{ Params: { name: string } }>("/api/characters/:name", async (req, reply) => {
    try {
      await unlink(fileFor(cfg.charactersDir, req.params.name));
      return { ok: true };
    } catch {
      reply.code(404);
      return { error: "character not found" };
    }
  });
}
