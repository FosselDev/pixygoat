import { opendir, open, stat } from "node:fs/promises";
import { join } from "node:path";

/** One directory of the sprites tree: png file stems and child directory names. */
export interface DirEntry {
  files: string[];
  dirs: string[];
  /** newest mtime (ms) of the directory itself; used for the cache fingerprint */
  mtimeMs: number;
}

export type DirIndex = Map<string, DirEntry>;

/**
 * Walks the sprites root once and records, per directory, the PNG file stems
 * and sub-directory names. Around 16k directories and 300k files take a few
 * seconds; nothing is decoded here.
 */
export async function scanSprites(
  root: string,
  onProgress?: (dirs: number, files: number) => void,
): Promise<DirIndex> {
  const index: DirIndex = new Map();
  let files = 0;
  const stack: string[] = [""];
  while (stack.length) {
    const rel = stack.pop()!;
    const abs = rel ? join(root, rel) : root;
    const entry: DirEntry = { files: [], dirs: [], mtimeMs: 0 };
    try {
      entry.mtimeMs = (await stat(abs)).mtimeMs;
      const dir = await opendir(abs);
      for await (const d of dir) {
        if (d.name.startsWith(".")) continue;
        if (d.isDirectory()) {
          entry.dirs.push(d.name);
          stack.push(rel ? `${rel}/${d.name}` : d.name);
        } else if (d.isFile() && d.name.toLowerCase().endsWith(".png")) {
          entry.files.push(d.name.slice(0, -4));
          files++;
        }
      }
    } catch (err) {
      // unreadable directory: keep it empty rather than failing the whole scan
      console.warn(`[scan] cannot read ${abs}: ${(err as Error).message}`);
    }
    entry.files.sort();
    entry.dirs.sort();
    index.set(rel, entry);
    if (onProgress && index.size % 1000 === 0) onProgress(index.size, files);
  }
  onProgress?.(index.size, files);
  return index;
}

/**
 * Reads width and height from a PNG's IHDR chunk (first 24 bytes) without
 * decoding the image.
 */
export async function readPngSize(file: string): Promise<{ width: number; height: number } | null> {
  const fh = await open(file, "r");
  try {
    const buf = Buffer.alloc(24);
    const { bytesRead } = await fh.read(buf, 0, 24, 0);
    if (bytesRead < 24) return null;
    // PNG signature + IHDR
    if (buf.readUInt32BE(0) !== 0x89504e47 || buf.toString("ascii", 12, 16) !== "IHDR") return null;
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  } finally {
    await fh.close();
  }
}
