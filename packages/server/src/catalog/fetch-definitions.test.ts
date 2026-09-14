import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { UPSTREAM, type UpstreamSource } from "@pixygoat/core";
import { fetchDefinitions, validateSource, classifyGitFailure, refIsSatisfiedBy, FetchError } from "./fetch-definitions.ts";

function haveGit(): boolean {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function code(fn: () => void): string {
  try {
    fn();
  } catch (err) {
    return (err as FetchError).code;
  }
  return "no error";
}

describe("validateSource", () => {
  it("accepts the pinned upstream", () => {
    expect(() => validateSource(UPSTREAM)).not.toThrow();
  });

  it("refuses transports that run commands and options disguised as values", () => {
    expect(code(() => validateSource({ ...UPSTREAM, repo: "ext::sh -c whoami" }))).toBe("bad-url");
    expect(code(() => validateSource({ ...UPSTREAM, repo: "--upload-pack=whoami" }))).toBe("bad-url");
    expect(code(() => validateSource({ ...UPSTREAM, repo: "git@github.com:a/b.git" }))).toBe("bad-url");
    expect(code(() => validateSource({ ...UPSTREAM, ref: "--exec=whoami" }))).toBe("bad-ref");
    expect(code(() => validateSource({ ...UPSTREAM, definitionsPath: "../../etc" }))).toBe("bad-path");
    expect(code(() => validateSource({ ...UPSTREAM, alsoFetch: ["-c"] }))).toBe("bad-path");
  });

  it("allows a branch or tag, not only a commit", () => {
    expect(() => validateSource({ ...UPSTREAM, ref: "main" })).not.toThrow();
    expect(() => validateSource({ ...UPSTREAM, ref: "v3.0" })).not.toThrow();
  });
});

describe("classifyGitFailure", () => {
  it("reads a refused username as a wrong address, not a missing login", () => {
    expect(classifyGitFailure("fatal: could not read Username for 'https://github.com': terminal prompts disabled")).toBe(
      "repo-not-found",
    );
    expect(classifyGitFailure("remote: Repository not found.")).toBe("repo-not-found");
  });

  it("tells a missing commit from a missing repository", () => {
    expect(classifyGitFailure("fatal: couldn't find remote ref deadbeef")).toBe("ref-not-found");
    expect(classifyGitFailure("error: Server does not allow request for unadvertised object")).toBe("ref-not-found");
  });

  it("recognises being offline", () => {
    expect(classifyGitFailure("fatal: unable to access '...': Could not resolve host: github.com")).toBe("offline");
  });

  it("falls back rather than guessing", () => {
    expect(classifyGitFailure("fatal: something nobody has seen before")).toBe("git-failed");
  });
});

describe("refIsSatisfiedBy", () => {
  const sha = "e7fa0aee616f21d31b0f56b5dad96d761719b984";
  it("recognises a pinned commit it already sits on", () => {
    expect(refIsSatisfiedBy(sha, sha)).toBe(true);
  });
  it("re-fetches for anything that can move", () => {
    expect(refIsSatisfiedBy("main", sha)).toBe(false);
    expect(refIsSatisfiedBy("e7fa0aee616", sha)).toBe(false);
  });
});

/**
 * The real thing against a repository on disk: no network, but the same
 * transport, the same sparse patterns and the same partial clone as against
 * GitHub.
 */
describe.skipIf(!haveGit())("fetchDefinitions", () => {
  const DEF = {
    name: "Plain",
    type_name: "hair",
    layer_1: { zPos: 130, male: "hair/plain/male/", female: "hair/plain/female/" },
  };

  function fixture(): { source: UpstreamSource; commit: string } {
    const repo = mkdtempSync(join(tmpdir(), "pixygoat-upstream-"));
    const git = (...args: string[]) =>
      execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@e", "-c", "commit.gpgsign=false", ...args], {
        cwd: repo,
        stdio: "pipe",
      })
        .toString()
        .trim();
    git("init", "--quiet", "-b", "main", ".");
    mkdirSync(join(repo, "sheet_definitions"));
    writeFileSync(join(repo, "sheet_definitions", "hair_plain.json"), JSON.stringify(DEF));
    writeFileSync(join(repo, "sheet_definitions", "hair_bob.json"), JSON.stringify({ ...DEF, name: "Bob" }));
    writeFileSync(join(repo, "LICENSE"), "upstream terms");
    // Stands in for the generator's 15 MB index.html: it must not come along.
    writeFileSync(join(repo, "index.html"), "x".repeat(4096));
    git("add", "-A");
    git("commit", "--quiet", "-m", "fixture");
    return {
      source: {
        repo: pathToFileURL(repo).href,
        web: "https://example.invalid/repo",
        ref: git("rev-parse", "HEAD"),
        definitionsPath: "sheet_definitions",
        alsoFetch: ["LICENSE"],
      },
      commit: git("rev-parse", "HEAD"),
    };
  }

  it("takes the one folder and leaves the repository root alone", async () => {
    const { source, commit } = fixture();
    const into = join(mkdtempSync(join(tmpdir(), "pixygoat-into-")), "upstream");
    const phases: string[] = [];

    const result = await fetchDefinitions({ source, into, log: (p) => phases.push(p.phase) });

    expect(result).toMatchObject({ count: 2, commit, fetched: true });
    expect(existsSync(join(result.path, "hair_plain.json"))).toBe(true);
    expect(existsSync(join(into, "LICENSE"))).toBe(true);
    expect(existsSync(join(into, "index.html"))).toBe(false);
    expect(phases).toEqual(["prepare", "fetch", "checkout", "verify"]);
  });

  it("does nothing the second time and everything when forced", async () => {
    const { source } = fixture();
    const into = join(mkdtempSync(join(tmpdir(), "pixygoat-into-")), "upstream");

    await fetchDefinitions({ source, into });
    expect((await fetchDefinitions({ source, into })).fetched).toBe(false);
    expect((await fetchDefinitions({ source, into, force: true })).fetched).toBe(true);
  });

  it("refuses a folder that holds no definitions instead of reporting success", async () => {
    const { source } = fixture();
    const into = join(mkdtempSync(join(tmpdir(), "pixygoat-into-")), "upstream");

    const err = await fetchDefinitions({ ...{ source: { ...source, definitionsPath: "nothing_here" }, into } }).catch(
      (e: FetchError) => e,
    );
    expect(err).toBeInstanceOf(FetchError);
    expect((err as FetchError).code).toBe("not-definitions");
  });

  it("names the newer layout rather than claiming nothing arrived", async () => {
    // What upstream did after the pinned snapshot: the definitions moved into
    // arms/, body/, hair/ and so on.
    const repo = mkdtempSync(join(tmpdir(), "pixygoat-upstream-"));
    const git = (...args: string[]) =>
      execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@e", ...args], { cwd: repo, stdio: "pipe" })
        .toString()
        .trim();
    git("init", "--quiet", "-b", "main", ".");
    mkdirSync(join(repo, "sheet_definitions", "hair"), { recursive: true });
    writeFileSync(join(repo, "sheet_definitions", "hair", "hair_plain.json"), JSON.stringify(DEF));
    git("add", "-A");
    git("commit", "--quiet", "-m", "nested");
    const into = join(mkdtempSync(join(tmpdir(), "pixygoat-into-")), "upstream");

    const err = await fetchDefinitions({
      source: {
        repo: pathToFileURL(repo).href,
        web: "https://example.invalid/repo",
        ref: git("rev-parse", "HEAD"),
        definitionsPath: "sheet_definitions",
        alsoFetch: [],
      },
      into,
    }).catch((e: FetchError) => e);
    expect((err as FetchError).code).toBe("layout-unsupported");
  });

  it("says which part of the address was wrong", async () => {
    const { source } = fixture();
    const into = join(mkdtempSync(join(tmpdir(), "pixygoat-into-")), "upstream");

    const err = await fetchDefinitions({
      source: { ...source, ref: "0000000000000000000000000000000000000000" },
      into,
    }).catch((e: FetchError) => e);
    expect((err as FetchError).code).toBe("ref-not-found");
  });
});
