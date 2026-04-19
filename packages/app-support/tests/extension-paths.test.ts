import { afterEach, beforeEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  resolveProfileExtensionRoot,
  resolveRepoExtensionRoot,
  resolveWorkspaceExtensionRoots,
} from "@nanoboss/app-support";

let tmpRoot: string;
let originalHome: string | undefined;

beforeEach(() => {
  tmpRoot = realpathSync(mkdtempSync(join(tmpdir(), "ext-paths-")));
  originalHome = process.env.HOME;
});

afterEach(() => {
  if (originalHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalHome;
  }
  rmSync(tmpRoot, { recursive: true, force: true });
});

function makeGitRepo(dir: string): string {
  mkdirSync(dir, { recursive: true });
  execFileSync("git", ["init", "-q"], { cwd: dir });
  return resolve(dir);
}

test("resolveRepoExtensionRoot returns <repo>/.nanoboss/extensions inside a git repo", () => {
  const repo = makeGitRepo(join(tmpRoot, "repo"));
  expect(resolveRepoExtensionRoot(repo)).toBe(join(repo, ".nanoboss", "extensions"));
});

test("resolveRepoExtensionRoot returns undefined outside a git repo", () => {
  const nonRepo = join(tmpRoot, "plain");
  mkdirSync(nonRepo, { recursive: true });
  expect(resolveRepoExtensionRoot(nonRepo)).toBeUndefined();
});

test("resolveProfileExtensionRoot returns <home>/.nanoboss/extensions", () => {
  const fakeHome = join(tmpRoot, "home");
  mkdirSync(fakeHome, { recursive: true });
  process.env.HOME = fakeHome;
  expect(resolveProfileExtensionRoot()).toBe(join(fakeHome, ".nanoboss", "extensions"));
});

test("resolveWorkspaceExtensionRoots returns [local, profile] ordered and deduplicated", () => {
  const repo = makeGitRepo(join(tmpRoot, "ws"));
  const fakeHome = join(tmpRoot, "home2");
  mkdirSync(fakeHome, { recursive: true });
  process.env.HOME = fakeHome;

  const roots = resolveWorkspaceExtensionRoots(repo);
  expect(roots).toEqual([
    resolve(join(repo, ".nanoboss", "extensions")),
    resolve(join(fakeHome, ".nanoboss", "extensions")),
  ]);
});

test("resolveWorkspaceExtensionRoots deduplicates when profile equals repo", () => {
  const repo = makeGitRepo(join(tmpRoot, "same"));
  const sharedProfile = join(repo, ".nanoboss", "extensions");
  const roots = resolveWorkspaceExtensionRoots(repo, sharedProfile);
  expect(roots).toEqual([resolve(sharedProfile)]);
});

test("resolveWorkspaceExtensionRoots honors custom profileExtensionRoot override", () => {
  const repo = makeGitRepo(join(tmpRoot, "over"));
  const customProfile = join(tmpRoot, "custom-profile", "extensions");
  const roots = resolveWorkspaceExtensionRoots(repo, customProfile);
  expect(roots).toEqual([
    resolve(join(repo, ".nanoboss", "extensions")),
    resolve(customProfile),
  ]);
});
