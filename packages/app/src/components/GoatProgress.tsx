import { Icon } from "./icons.tsx";

/** The track is drawn as blocks, so the fill has to land on one. */
const CELLS = 32;

interface Props {
  /** 0..1, or undefined while there is nothing honest to show */
  value?: number;
  label: string;
  detail?: string;
}

/**
 * A goat grazing its way along a pixel track: every step eats one more block.
 * Movement is quantised to whole blocks and the walk is a two-frame hop, the
 * way the sprites it is waiting for are drawn - a smooth bar would be the one
 * thing on screen pretending not to be pixel art.
 */
export function GoatProgress({ value, label, detail }: Props) {
  const known = typeof value === "number" && Number.isFinite(value);
  const clamped = known ? Math.min(1, Math.max(0, value)) : 0;
  const eaten = Math.round(clamped * CELLS) / CELLS;

  return (
    <div class={`gp ${known ? "" : "wander"}`}>
      <div class="gp-track">
        <div class="gp-fill" style={known ? `width:${eaten * 100}%` : undefined} />
        <span class="gp-goat" style={known ? `left:${eaten * 100}%` : undefined}>
          <Icon.Goat size={22} />
        </span>
      </div>
      <div class="gp-text">
        <span class="gp-label">{label}</span>
        {detail && <span class="gp-detail mono">{detail}</span>}
        {known && <span class="gp-pct mono">{Math.round(clamped * 100)}%</span>}
      </div>
    </div>
  );
}
