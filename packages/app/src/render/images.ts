/** Sprite loading with an in-memory ImageBitmap cache and de-duplicated fetches. */

const cache = new Map<string, ImageBitmap>();
const inflight = new Map<string, Promise<ImageBitmap | null>>();

export function spriteUrl(path: string): string {
  return "/sprites/" + path.split("/").map(encodeURIComponent).join("/");
}

export function getCached(path: string): ImageBitmap | undefined {
  return cache.get(path);
}

export function loadSprite(path: string): Promise<ImageBitmap | null> {
  const hit = cache.get(path);
  if (hit) return Promise.resolve(hit);
  const pending = inflight.get(path);
  if (pending) return pending;
  const p = (async () => {
    try {
      const res = await fetch(spriteUrl(path));
      if (!res.ok) return null;
      const blob = await res.blob();
      const bmp = await createImageBitmap(blob, { premultiplyAlpha: "none" });
      cache.set(path, bmp);
      return bmp;
    } catch {
      return null;
    } finally {
      inflight.delete(path);
    }
  })();
  inflight.set(path, p);
  return p;
}

export async function loadSprites(paths: string[]): Promise<Map<string, ImageBitmap>> {
  const out = new Map<string, ImageBitmap>();
  await Promise.all(
    paths.map(async (p) => {
      const b = await loadSprite(p);
      if (b) out.set(p, b);
    }),
  );
  return out;
}

export function cacheSize(): number {
  return cache.size;
}
