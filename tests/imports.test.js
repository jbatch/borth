import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import { runFile } from "../dist/runner.js";

function outputOfFile(path) {
  const output = [];

  runFile(path, {
    write: (value) => output.push(value),
  });

  return output;
}

function makeWorkspace() {
  return mkdtempSync(join(tmpdir(), "borth-imports-"));
}

function writeModule(root, relativePath, source) {
  const path = join(root, relativePath);

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, source);

  return path;
}

test("files can import words from another borth file", () => {
  const root = makeWorkspace();

  writeModule(
    root,
    "math.borth",
    `
      : twice
        2 *
      ;
    `,
  );
  const entryPath = writeModule(
    root,
    "main.borth",
    `
      import "math.borth"

      21 twice print
    `,
  );

  assert.deepEqual(outputOfFile(entryPath), [42]);
});

test("imports are resolved relative to the importing file", () => {
  const root = makeWorkspace();

  writeModule(
    root,
    "lib/math.borth",
    `
      : twice
        2 *
      ;
    `,
  );
  const entryPath = writeModule(
    root,
    "programs/main.borth",
    `
      import "../lib/math.borth"

      5 twice print
    `,
  );

  assert.deepEqual(outputOfFile(entryPath), [10]);
});

test("imports are transitive", () => {
  const root = makeWorkspace();

  writeModule(
    root,
    "base.borth",
    `
      : inc
        1 +
      ;
    `,
  );
  writeModule(
    root,
    "derived.borth",
    `
      import "base.borth"

      : inc-twice
        inc inc
      ;
    `,
  );
  const entryPath = writeModule(
    root,
    "main.borth",
    `
      import "derived.borth"

      1 inc-twice print
    `,
  );

  assert.deepEqual(outputOfFile(entryPath), [3]);
});

test("importing the same module twice is ignored", () => {
  const root = makeWorkspace();

  writeModule(
    root,
    "shared.borth",
    `
      : inc
        1 +
      ;
    `,
  );
  writeModule(
    root,
    "a.borth",
    `
      import "shared.borth"
    `,
  );
  writeModule(
    root,
    "b.borth",
    `
      import "shared.borth"
    `,
  );
  const entryPath = writeModule(
    root,
    "main.borth",
    `
      import "a.borth"
      import "b.borth"

      1 inc print
    `,
  );

  assert.deepEqual(outputOfFile(entryPath), [2]);
});

test("imported modules cannot contain top-level executable code", () => {
  const root = makeWorkspace();

  writeModule(
    root,
    "lib.borth",
    `
      : answer
        42
      ;

      answer print
    `,
  );
  const entryPath = writeModule(
    root,
    "main.borth",
    `
      import "lib.borth"
    `,
  );

  assert.throws(
    () => outputOfFile(entryPath),
    /imported module cannot contain top-level executable code/,
  );
});

test("import cycles throw", () => {
  const root = makeWorkspace();

  writeModule(
    root,
    "a.borth",
    `
      import "b.borth"
    `,
  );
  writeModule(
    root,
    "b.borth",
    `
      import "a.borth"
    `,
  );
  const entryPath = writeModule(
    root,
    "main.borth",
    `
      import "a.borth"
    `,
  );

  assert.throws(() => outputOfFile(entryPath), /import cycle involving/);
});
