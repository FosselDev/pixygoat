import upstreamJson from "../../../../data/upstream.json";

/**
 * The generator repository the sheet definitions are fetched from. It is data
 * rather than a constant in the code because it is the one thing that changes
 * when the project moves to another snapshot - and because the setup lets
 * people point somewhere else entirely, a fork or a mirror.
 */
export interface UpstreamSource {
  /** clone URL, https only */
  repo: string;
  /** the same repository as a page a human can open */
  web: string;
  /** commit, tag or branch - a commit is what keeps the catalogue reproducible */
  ref: string;
  /** folder inside the repository that holds the definitions */
  definitionsPath: string;
  /** other paths worth taking along, such as the repository's own LICENSE */
  alsoFetch: string[];
}

export const UPSTREAM: UpstreamSource = {
  repo: upstreamJson.repo,
  web: upstreamJson.web,
  ref: upstreamJson.ref,
  definitionsPath: upstreamJson.definitionsPath,
  alsoFetch: upstreamJson.alsoFetch ?? [],
};

/** The ZIP of that snapshot, for people without git. It is the whole repository. */
export function upstreamZipUrl(source: UpstreamSource): string {
  return `${source.web.replace(/\/+$/, "")}/archive/${source.ref}.zip`;
}
