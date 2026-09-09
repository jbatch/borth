import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import { run, runFile } from "../dist/runner.js";

test("compiler errors include anonymous source locations", () => {
  assert.throws(
    () => run("10 nope"),
    /<anonymous source>:1:4: Unknown word: nope/,
  );
});

test("compiler errors include file source locations", () => {
  const root = mkdtempSync(join(tmpdir(), "borth-loc-"));
  const path = join(root, "main.borth");

  writeFileSync(path, "10\nnope\n", "utf8");

  assert.throws(
    () => runFile(path),
    new RegExp(`${escapeRegExp(path)}:2:1: Unknown word: nope`),
  );
});

test("runtime errors include file source locations", () => {
  const root = mkdtempSync(join(tmpdir(), "borth-loc-"));
  const path = join(root, "main.borth");

  writeFileSync(path, "rot\n", "utf8");

  assert.throws(
    () => runFile(path),
    new RegExp(`${escapeRegExp(path)}:1:1: ROT requires 3 values on the stack`),
  );
});

test("file source locations are relative to cwd when possible", () => {
  const previousCwd = process.cwd();
  const root = mkdtempSync(join(tmpdir(), "borth-loc-"));
  const path = join(root, "main.borth");

  writeFileSync(path, "rot\n", "utf8");

  try {
    process.chdir(root);

    assert.throws(
      () => runFile("main.borth"),
      /main\.borth:1:1: ROT requires 3 values on the stack/,
    );
  } finally {
    process.chdir(previousCwd);
  }
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
