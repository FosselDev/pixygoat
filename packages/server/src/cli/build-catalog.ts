import { loadConfig } from "../config.ts";
import { loadOrBuildCatalog } from "../catalog/build.ts";

const cfg = loadConfig();
const catalog = await loadOrBuildCatalog({
  spritesRoot: cfg.spritesRoot,
  definitionsDir: cfg.definitionsDir,
  cacheDir: cfg.cacheDir,
  force: cfg.forceRebuild || process.argv.includes("--force"),
  log: (m) => console.log(`[catalog] ${m}`),
});
console.log(JSON.stringify(catalog.meta, null, 2));
