/** Approximate swatch colours for variant names (for chips and swatches only; sprites are never recoloured). */
const NAMED: Record<string, string> = {
  black: "#1a1a1a", white: "#e8e8e8", gray: "#8a8a8a", grey: "#8a8a8a", dark_gray: "#4a4a4a", light_gray: "#bdbdbd", charcoal: "#3a3a40", slate: "#5c6470", bluegray: "#5d6b80",
  red: "#b5433a", maroon: "#6e2230", rose: "#c2536f", pink: "#d05a8a", orange: "#d4692a", carrot: "#d4692a", yellow: "#d9b23a", gold: "#c9a43a", amber: "#c98a3a", tan: "#c7a273", leather: "#8a5a2b", walnut: "#5a3a22", brown: "#6b4a2e", dark_brown: "#4b3423", light_brown: "#8c6238", chestnut: "#6d4a2c", sandy: "#a8763a", blonde: "#d1a54c", platinum: "#e6d38a", ash: "#9a9587", raven: "#2a2530", redhead: "#c6452e", strawberry: "#b3352f", ginger: "#c65a2a", violet: "#7b4fb8", purple: "#6a3fa0", lavender: "#9a86c9", navy: "#2f3f7a", blue: "#3b5fb8", sky: "#6fa8dc", teal: "#2f8a8a", green: "#2f8a6b", forest: "#2f5f3a", dark_green: "#254a2c", olive: "#7a7a3a", bright_green: "#4fbf5a", pale_green: "#9ad19a", zombie_green: "#7a9a6a", zombie: "#8aa08a", taupe: "#a08a7a", light: "#f0c8a0", bronze: "#8a5a3a", copper: "#b87333", brass: "#b89a4a", iron: "#7a7a80", steel: "#9aa2ac", silver: "#c0c4cc", ceramic: "#d8d0c0", ivory: "#eee6d2", cyan: "#3ab8c8", magenta: "#c03a9a", fur_black: "#1e1a18", fur_brown: "#6b4a2e", fur_copper: "#a8642a", fur_gold: "#c9a43a", fur_grey: "#8a8a8a", fur_tan: "#c7a273", fur_white: "#e8e4dc", crimson: "#a02030", scarlet: "#c02a2a", emerald: "#2f9a5a", sapphire: "#2a4fb0", ruby: "#b02a4a", pearl: "#eae4dc", wood: "#8a5a2b", dark: "#2a2a2a",
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function variantColor(name: string): string {
  const key = name.toLowerCase();
  if (NAMED[key]) return NAMED[key];
  // try the last or first token ("dark_blue" -> blue, "blue_2" -> blue)
  const parts = key.split(/[_\s-]+/);
  for (const p of [...parts].reverse()) if (NAMED[p]) return NAMED[p];
  const h = hash(key) % 360;
  return `hsl(${h} 40% 45%)`;
}
