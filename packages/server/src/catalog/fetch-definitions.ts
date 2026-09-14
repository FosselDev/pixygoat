import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { UPSTREAM, type UpstreamSource } from "@pixygoat/core";
import { inspectDefinitionsDir } from "./inspect.ts";

export type FetchErrorCode =
  | "git-missing"
  | "bad-url"
  | "bad-ref"
  | "bad-path"
  | "offline"
  | "repo-not-found"
  | "ref-not-found"
  | "timeout"
  | "not-definitions"
  | "layout-unsupported"
  | "git-failed";

/**
 * Every way this can fail, named. The app has to say something useful in two
 * languages, and "git exited with 128" is not it - the code picks the
 * sentence, the detail is there for the log.
 */
export class FetchError extends Error {
  constructor(
    readonly code: FetchErrorCode,
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "FetchError";
  }
}

export interface FetchProgress {
  phase: "prepare" | "fetch" | "checkout" | "verify";
  message: string;
}

export interface FetchResult {
  /** the working copy git was pointed at */
  dir: string;
  /** the definitions folder inside it */
  path: string;
  commit: string;
  count: number;
  /** false when the folder was already at that commit and nothing was fetched */
  fetched: boolean;
}

export interface FetchOptions {
  source: UpstreamSource;
  /** working copy to fetch into - one level above the definitions folder */
  into: string;
  /** fetch even when the folder already sits at the wanted commit */
  force?: boolean;
  timeoutMs?: number;
  log?: (progress: FetchProgress) => void;
}

/** https for the real thing, file for a local mirror or a test fixture. */
const URL_PATTERN = /^(?:https|file):\/\/\S+$/;
const REF_PATTERN = /^[0-9A-Za-z][0-9A-Za-z._/-]{0,119}$/;
const PATH_PATTERN = /^[0-9A-Za-z][0-9A-Za-z._/-]{0,119}$/;
const FULL_SHA = /^[0-9a-f]{40}$/;

/**
 * These three end up on a git command line, and two of them can be typed by
 * whoever runs PixyGoat. Git reads `ext::sh -c ...` as a transport that runs a
 * command, and a value starting with a dash becomes an option rather than an
 * argument, so both are refused here - and the ext transport is turned off on
 * every call as well, because one guard in front of a command line is never
 * enough.
 */
export function validateSource(source: UpstreamSource): void {
  if (!URL_PATTERN.test(source.repo)) {
    throw new FetchError("bad-url", `not a usable repository URL: ${source.repo}`);
  }
  if (!REF_PATTERN.test(source.ref)) {
    throw new FetchError("bad-ref", `not a usable commit, tag or branch: ${source.ref}`);
  }
  for (const p of [source.definitionsPath, ...source.alsoFetch]) {
    if (!PATH_PATTERN.test(p) || p.includes("..")) {
      throw new FetchError("bad-path", `not a usable path inside the repository: ${p}`);
    }
  }
}

/**
 * git says what went wrong in prose on stderr. The one that reads wrong is the
 * missing username: GitHub answers an unknown repository with 401 rather than
 * 404, so it does not leak which private repositories exist, and git takes
 * that for a login it should ask about. With prompts turned off it says it
 * could not read a username - which means the address, not the account.
 */
export function classifyGitFailure(stderr: string): FetchErrorCode {
  const s = stderr.toLowerCase();
  if (/could not resolve host|could not resolve proxy|failed to connect|connection timed out|network is unreachable/.test(s)) {
    return "offline";
  }
  if (/find remote ref|unadvertised object|not our ref|no such remote ref|bad object/.test(s)) {
    return "ref-not-found";
  }
  if (/could not read username|authentication failed|terminal prompts disabled|repository not found|not found|access denied/.test(s)) {
    return "repo-not-found";
  }
  return "git-failed";
}

/** A pinned commit is the only ref that can be recognised again afterwards. */
export function refIsSatisfiedBy(ref: string, head: string): boolean {
  if (!FULL_SHA.test(head)) return false;
  return FULL_SHA.test(ref) ? ref === head : false;
}

/**
 * Flags for every invocation. The credential helper is emptied rather than the
 * whole system configuration turned off: Git for Windows keeps
 * `credential.helper=manager` there, which would open a login window out of a
 * server process nobody is watching - but it keeps `http.sslBackend=schannel`
 * there too, and dropping that breaks TLS behind a corporate proxy.
 * autocrlf is off so the fetched files stay byte for byte what upstream has.
 */
const GIT_FLAGS = [
  "-c",
  "credential.helper=",
  "-c",
  "advice.detachedHead=false",
  "-c",
  "protocol.ext.allow=never",
  "-c",
  "core.autocrlf=false",
];

function git(args: string[], cwd: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", [...GIT_FLAGS, ...args], {
      cwd,
      windowsHide: true,
      env: {
        ...process.env,
        // No prompt, no askpass window: a wrong URL must fail in a second
        // instead of waiting for an answer that is never coming.
        GIT_TERMINAL_PROMPT: "0",
        GIT_ASKPASS: "",
        SSH_ASKPASS: "",
      },
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(
        err.code === "ENOENT"
          ? new FetchError("git-missing", "git is not installed, or not on the PATH")
          : new FetchError("git-failed", err.message),
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new FetchError("timeout", `git ${args[0]} took longer than ${Math.round(timeoutMs / 1000)}s`, stderr));
        return;
      }
      if (code === 0) resolve(stdout.trim());
      else reject(new FetchError(classifyGitFailure(stderr), `git ${args[0]} failed`, stderr.trim()));
    });
  });
}

async function headCommit(dir: string, timeoutMs: number): Promise<string | null> {
  try {
    return await git(["rev-parse", "HEAD"], dir, timeoutMs);
  } catch {
    return null;
  }
}

/**
 * Fetches one folder out of a git repository without cloning it: a partial
 * clone (no blobs until they are needed) plus a sparse checkout of that one
 * path. For the LPC generator that is about three seconds and three megabytes
 * against the gigabyte the whole repository weighs. The pattern has to be
 * non-cone: cone mode always takes the repository root along, and that is
 * where the generator keeps a 15 MB index.html.
 *
 * `into` and the paths are arguments rather than constants, so the same
 * machinery can fetch something else later without being taken apart first.
 */
export async function fetchDefinitions(opts: FetchOptions): Promise<FetchResult> {
  const { source, into } = opts;
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const log = opts.log ?? (() => {});
  validateSource(source);

  const target = join(into, source.definitionsPath);

  if (!opts.force) {
    const head = await headCommit(into, timeoutMs);
    if (head && refIsSatisfiedBy(source.ref, head)) {
      const have = await inspectDefinitionsDir(target);
      if (have.usable) {
        log({ phase: "verify", message: `already at ${head.slice(0, 10)}` });
        return { dir: into, path: target, commit: head, count: have.count, fetched: false };
      }
    }
  }

  log({ phase: "prepare", message: "preparing the download" });
  await mkdir(into, { recursive: true });
  if (!existsSync(join(into, ".git"))) await git(["init", "--quiet", "."], into, timeoutMs);
  // set-url fails when there is no origin yet, add fails when there is one.
  await git(["remote", "set-url", "origin", source.repo], into, timeoutMs).catch(() =>
    git(["remote", "add", "origin", source.repo], into, timeoutMs),
  );
  const patterns = [`/${source.definitionsPath}/**`, ...source.alsoFetch.map((p) => `/${p}`)];
  await git(["sparse-checkout", "set", "--no-cone", ...patterns], into, timeoutMs);

  log({ phase: "fetch", message: `fetching ${source.definitionsPath} from ${source.repo}` });
  await git(["fetch", "--quiet", "--depth", "1", "--filter=blob:none", "origin", source.ref], into, timeoutMs);

  log({ phase: "checkout", message: "writing the files" });
  await git(["checkout", "--quiet", "FETCH_HEAD"], into, timeoutMs);

  log({ phase: "verify", message: "checking what arrived" });
  const report = await inspectDefinitionsDir(target);
  if (!report.usable) {
    // Everything arrived, it is just shaped differently: after the pinned
    // snapshot upstream sorted the definitions into subfolders. Saying "no
    // definitions" there would send people looking for a download problem
    // they do not have.
    if (report.nested > 0) {
      throw new FetchError(
        "layout-unsupported",
        `that snapshot keeps its definitions in subfolders - PixyGoat reads the flat layout of ${UPSTREAM.ref.slice(0, 11)}`,
        `${report.nested} JSON files one level below ${target}`,
      );
    }
    throw new FetchError(
      "not-definitions",
      `${source.definitionsPath} in that repository does not hold sheet definitions`,
      `${report.count} JSON files at ${target}`,
    );
  }
  const commit = (await headCommit(into, timeoutMs)) ?? source.ref;
  return { dir: into, path: target, commit, count: report.count, fetched: true };
}

let inFlight: Promise<FetchResult> | null = null;

/**
 * The same fetch asked for twice at once - two browser tabs on the setup, a
 * reload mid-download - would have two gits writing into one working copy.
 * The second caller waits for the first instead.
 */
export function fetchDefinitionsOnce(opts: FetchOptions): Promise<FetchResult> {
  if (!inFlight) {
    const run = fetchDefinitions(opts);
    inFlight = run;
    void run.catch(() => {}).then(() => {
      if (inFlight === run) inFlight = null;
    });
  }
  return inFlight;
}
