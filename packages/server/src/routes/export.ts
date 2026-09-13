import type { FastifyInstance } from "fastify";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import type { Catalog } from "@pixygoat/core";
import type { ServerConfig } from "../config.ts";

export interface ExportFile {
  /** path relative to the target directory, forward slashes */
  path: string;
  /** base64-encoded content (PNG) or plain text */
  encoding: "base64" | "utf8";
  data: string;
}

export interface WriteFilesRequest {
  targetDir: string;
  files: ExportFile[];
}

/**
 * The app renders every sheet itself (Canvas) and sends the finished files
 * here to be written to a folder on disk, e.g. straight into the Unity
 * project. Rendering stays in one place; the server only writes.
 */
export async function registerExportRoutes(
  app: FastifyInstance,
  _cfg: ServerConfig,
  _catalog: Promise<Catalog>,
) {
  app.post<{ Body: WriteFilesRequest }>("/api/export/write", async (req, reply) => {
    const { targetDir, files } = req.body ?? ({} as WriteFilesRequest);
    if (typeof targetDir !== "string" || !Array.isArray(files) || files.length === 0) {
      reply.code(400);
      return { error: "targetDir and files are required" };
    }
    const root = resolve(targetDir);
    await mkdir(root, { recursive: true });
    const written: string[] = [];
    for (const f of files) {
      if (typeof f.path !== "string" || f.path.includes("..") || f.path.startsWith("/") || /^[A-Za-z]:/.test(f.path)) {
        reply.code(400);
        return { error: `invalid file path: ${String(f.path)}` };
      }
      const abs = join(root, f.path);
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, f.encoding === "base64" ? Buffer.from(f.data, "base64") : f.data);
      written.push(abs);
    }
    return { ok: true, targetDir: root, written };
  });
}
