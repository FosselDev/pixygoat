import { loadConfig } from "../config.ts";
import { fetchDefinitions, FetchError } from "../catalog/fetch-definitions.ts";

/**
 * The fetch on its own, without a browser: useful for a headless setup, for a
 * Docker image warming its cache, and for seeing what went wrong when the
 * setup page only says that something did.
 */
const cfg = loadConfig();
const force = process.argv.includes("--force");

console.log(`[definitions] ${cfg.upstream.repo}`);
console.log(`[definitions] ${cfg.upstream.definitionsPath} at ${cfg.upstream.ref}`);

try {
  const result = await fetchDefinitions({
    source: cfg.upstream,
    into: cfg.upstreamDir,
    force,
    log: (p) => console.log(`[definitions] ${p.message}`),
  });
  console.log(
    result.fetched
      ? `[definitions] ${result.count} definitions written to ${result.path}`
      : `[definitions] ${result.count} definitions already there, nothing to do`,
  );
  console.log(`[definitions] commit ${result.commit}`);
} catch (err) {
  const e = err as FetchError;
  console.error(`\nCould not fetch the sheet definitions: ${e.message}`);
  switch (e.code) {
    case "git-missing":
      console.error("Install git, or check out the folder yourself and set PIXYGOAT_DEFINITIONS.");
      break;
    case "repo-not-found":
      console.error("No public repository answered at that address. A typo in PIXYGOAT_UPSTREAM_REPO?");
      break;
    case "ref-not-found":
      console.error("The repository is there, but not that commit. Check PIXYGOAT_UPSTREAM_REF.");
      break;
    case "offline":
      console.error("No connection. The fetch needs the network exactly once.");
      break;
    case "not-definitions":
      console.error("The folder arrived but holds no sheet definitions.");
      break;
    case "layout-unsupported":
      console.error("Everything arrived, but this version reads the flat folder of the pinned snapshot.");
      console.error("Leave PIXYGOAT_UPSTREAM_REF unset to get that one.");
      break;
    default:
      break;
  }
  if (e.detail) console.error(`\n${e.detail}`);
  process.exit(1);
}
