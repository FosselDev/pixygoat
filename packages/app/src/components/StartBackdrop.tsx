import { useEffect, useRef } from "preact/hooks";
import type { CharacterDocument } from "@pixygoat/core";
import { layersForDocument, randomCharacter } from "../state/store.ts";
import { composeSheet, type ComposedSheet } from "../render/renderer.ts";

/** Columns of an LPC walk row; column 0 is the standing frame and is skipped. */
const WALK_CYCLE = [1, 2, 3, 4, 5, 6, 7, 8];
const FRAME_MS = 130;
const ROW_BY_DIRECTION = { left: 1, right: 3 };

/**
 * Bands the crowd walks in, given as where their feet land as a fraction of
 * the height; the gap between the two is the headline and the pitch. Measuring
 * from the feet rather than the top is what keeps them out of the text: a
 * character scaled four times is 256 pixels tall, and anchoring that by its
 * top edge drops its legs straight through the paragraph.
 *
 * Small ones walk far away at the top, big ones close by at the bottom, where
 * a little cropping at the edge reads as depth rather than as a mistake.
 */
const LANES = [
  { near: 0.17, far: 0.30, scales: [2, 2, 3] },
  { near: 0.97, far: 1.06, scales: [3, 4, 4] },
];

interface Walker {
  sheet: ComposedSheet;
  /** left edge in css pixels */
  x: number;
  /** where the feet land, as a fraction of the height, so a resize carries the crowd with it */
  lane: number;
  /** whole numbers only, so the pixels stay square */
  scale: number;
  /** css pixels per second; the sign is the direction */
  speed: number;
  /** so they do not step in lockstep */
  phase: number;
  alpha: number;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

/**
 * The crowd behind the title: a handful of characters walking slowly across,
 * the saved ones among them. It is decoration, so it never blocks the page -
 * sheets are composed one after another and each walker joins as it arrives,
 * and a reader who asked for less motion gets a standing crowd instead.
 */
export function StartBackdrop({ documents }: { documents: CharacterDocument[] }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const walkers: Walker[] = [];
    let width = 0;
    let height = 0;
    let cancelled = false;
    let frame = 0;

    const resize = () => {
      // Whole device pixels only: half a pixel of scaling turns pixel art to mush.
      const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
    };

    resize();
    window.addEventListener("resize", resize);

    // Own characters first, then strangers to fill the street.
    const cast: CharacterDocument[] = [...documents.slice(0, 5)];
    while (cast.length < 7) cast.push(randomCharacter());

    void (async () => {
      for (const document of cast) {
        if (cancelled) return;
        const layers = layersForDocument(document);
        if (layers.length === 0) continue;

        const sheet = await composeSheet(layers, "walk");
        if (cancelled || !sheet || sheet.set.columns < 9) continue;

        const lane = pick(LANES);
        const scale = pick(lane.scales);

        walkers.push({
          sheet,
          x: Math.random() * Math.max(width, 600),
          lane: lane.near + Math.random() * (lane.far - lane.near),
          scale,
          speed: (Math.random() < 0.5 ? -1 : 1) * (8 + scale * 4 + Math.random() * 6),
          phase: Math.random() * WALK_CYCLE.length,
          alpha: 0.06 + scale * 0.022,
        });
      }
    })();

    let previous = performance.now();

    const draw = (now: number) => {
      const dt = Math.min(0.1, (now - previous) / 1000);
      previous = now;
      ctx.clearRect(0, 0, width, height);

      for (const w of walkers) {
        const cell = w.sheet.set.cellSize;
        const size = cell * w.scale;

        if (!still) {
          w.x += w.speed * dt;
          if (w.speed > 0 && w.x > width) w.x = -size;
          if (w.speed < 0 && w.x < -size) w.x = width;
        }

        const step = still ? 0 : Math.floor(now / FRAME_MS + w.phase) % WALK_CYCLE.length;
        const column = still ? 0 : WALK_CYCLE[step]!;
        const row = w.speed < 0 ? ROW_BY_DIRECTION.left : ROW_BY_DIRECTION.right;
        const y = w.lane * height - size;

        ctx.globalAlpha = w.alpha;
        ctx.drawImage(w.sheet.canvas, column * cell, row * cell, cell, cell,
                      Math.round(w.x), Math.round(y), size, size);
      }

      ctx.globalAlpha = 1;
      if (!still) frame = requestAnimationFrame(draw);
    };

    // A still crowd still has to wait for its sheets, so it redraws a few times.
    if (still) {
      const timer = window.setInterval(() => draw(performance.now()), 400);
      window.setTimeout(() => window.clearInterval(timer), 6000);
    } else {
      frame = requestAnimationFrame(draw);
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, [documents]);

  return <canvas ref={ref} class="backdrop px" aria-hidden="true" />;
}
