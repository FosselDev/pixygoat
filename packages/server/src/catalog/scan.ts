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

export interface ScanProgress {
  dirs: number;
  files: number;
  /** top-level folders walked to the end */
  done: number;
  /** how many there are, known as soon as the root has been read */
  total: number;
  /** the one being walked right now, e.g. "hair" */
  current?: string;
}

/**
 * Walks the sprites root once and records, per directory, the PNG file stems
 * and sub-directory names. Around 16k directories and 300k files take a few
 * seconds; nothing is decoded here.
 *
 * How far along it is can only be told in top-level folders: the tree below
 * them is unknown until it has been walked. Counting how many of `body`,
 * `hair`, `weapon` and the rest are finished is coarse but true, which beats a
 * bar that guesses.
 */
export async function scanSprites(
  root: string,
  onProgress?: (p: ScanProgress) => void,
): Promise<DirIndex> {
  const index: DirIndex = new Map();
  let files = 0;
  let done = 0;
  let total = 0;
  let current: string | undefined;
  /** directories still to be walked, per top-level folder */
  const pending = new Map<string, number>();
  const stack: string[] = [""];

  while (stack.length) {
    const rel = stack.pop()!;
    const abs = rel ? join(root, rel) : root;
    const top = rel.split("/")[0] || undefined;
    const entry: DirEntry = { files: [], dirs: [], mtimeMs: 0 };
    try {
      entry.mtimeMs = (await stat(abs)).mtimeMs;
      const dir = await opendir(abs);
      for await (const d of dir) {
        if (d.name.startsWith(".")) continue;
        if (d.isDirectory()) {
          entry.dirs.push(d.name);
          const child = rel ? `${rel}/${d.name}` : d.name;
          stack.push(child);
          const childTop = child.split("/")[0]!;
          pending.set(childTop, (pending.get(childTop) ?? 0) + 1);
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

    if (rel === "") total = entry.dirs.length;
    if (top) {
      current = top;
      const left = (pending.get(top) ?? 1) - 1;
      pending.set(top, left);
      if (left === 0) done++;
    }
    if (onProgress && index.size % 200 === 0) onProgress({ dirs: index.size, files, done, total, current });
  }
  onProgress?.({ dirs: index.size, files, done, total });
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
