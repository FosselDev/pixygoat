import { loadConfig } from "../config.ts";
import { loadOrBuildCatalog } from "../catalog/build.ts";

const cfg = loadConfig();
if (!cfg.spritesConfigured) {
  console.error(`Sprites directory not found: ${cfg.spritesRoot}`);
  console.error("Set PIXYGOAT_SPRITES, or start the app once and pick the folder there.");
  process.exit(1);
}
const catalog = await loadOrBuildCatalog({
  spritesRoot: cfg.spritesRoot,
  definitionsDir: cfg.definitionsDir,
  cacheDir: cfg.cacheDir,
  force: cfg.forceRebuild || process.argv.includes("--force"),
  log: (m) => console.log(`[catalog] ${m}`),
});
console.log(JSON.stringify(catalog.meta, null, 2));
