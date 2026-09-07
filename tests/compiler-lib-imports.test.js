import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import { run } from "../dist/runner.js";

function outputOf(source) {
  const output = [];

  run(source, {
    write: (value) => output.push(value),
  });

  return output;
}

function makeWorkspace() {
  return mkdtempSync(join(tmpdir(), "borth-self-hosted-imports-"));
}

function writeModule(root, relativePath, source) {
  const path = join(root, relativePath);

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, source);

  return path;
}

function compileAndRunFile(path) {
  return outputOf(`
    import "lib/lexer.borth"
    import "lib/parser.borth"
    import "lib/compiler.borth"
    import "lib/vm.borth"

    ${JSON.stringify(path)} dup read-text-file lex-src parse-tokens swap compile-nodes run-bytecode show print
  `);
}

test("compiler library compiles imports relative to the compiled file", () => {
  const root = makeWorkspace();

  writeModule(
    root,
    "programs/math.borth",
    `
      : square
        dup *
      ;
    `,
  );
  const entryPath = writeModule(
    root,
    "programs/main.borth",
    `
      import "./math.borth"

      5 square print
    `,
  );

  assert.deepEqual(compileAndRunFile(entryPath), [25, "[]"]);
});

test("compiler library compiles transitive imports relative to each importing file", () => {
  const root = makeWorkspace();

  writeModule(
    root,
    "lib/base.borth",
    `
      : inc
        1 +
      ;
    `,
  );
  writeModule(
    root,
    "features/derived.borth",
    `
      import "../lib/base.borth"

      : inc-twice
        inc inc
      ;
    `,
  );
  const entryPath = writeModule(
    root,
    "programs/main.borth",
    `
      import "../features/derived.borth"

      10 inc-twice print
    `,
  );

  assert.deepEqual(compileAndRunFile(entryPath), [12, "[]"]);
});

test("compiler library shares variables from imported modules", () => {
  const root = makeWorkspace();

  writeModule(
    root,
    "state.borth",
    `
      variable count

      : save-count
        count !
      ;

      : print-count
        count @ print
      ;
    `,
  );
  const entryPath = writeModule(
    root,
    "main.borth",
    `
      import "./state.borth"

      42 save-count
      print-count
    `,
  );

  assert.deepEqual(compileAndRunFile(entryPath), [42, "[]"]);
});

test("compiler library rejects top-level executable code in imported modules", () => {
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
      import "./lib.borth"
    `,
  );

  assert.throws(
    () => compileAndRunFile(entryPath),
    /Imported modules cannot call executable words at the top level/,
  );
});

test("compiler library supports deferred words inside imported modules", () => {
  const root = makeWorkspace();

  writeModule(
    root,
    "lib.borth",
    `
      deferred square

      : print-square
        square print
      ;

      : square
        dup *
      ;
    `,
  );
  const entryPath = writeModule(
    root,
    "main.borth",
    `
      import "./lib.borth"

      9 print-square
    `,
  );

  assert.deepEqual(compileAndRunFile(entryPath), [81, "[]"]);
});
