import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { run } from "../dist/runner.js";

function outputOf(source, options = {}) {
  const output = [];

  run(source, {
    ...options,
    write: (value) => output.push(value),
  });

  return output;
}

function compileNativeProgram(t, sourcePath, executablePath) {
  const ccCheck = spawnSync("cc", ["--version"], { encoding: "utf8" });

  if (ccCheck.error || ccCheck.status !== 0) {
    t.skip("cc is not available");
    return false;
  }

  const compile = spawnSync(
    "cc",
    [
      sourcePath,
      "runtime/borth_runtime.c",
      "-Wall",
      "-Wextra",
      "-Iruntime",
      "-o",
      executablePath,
    ],
    { encoding: "utf8" },
  );

  assert.equal(compile.status, 0, compile.stderr);
  assert.equal(compile.stderr, "");
  return true;
}

test("records generate constructors, getters, setters, and copy words", () => {
  assert.deepEqual(
    outputOf(`
      record point
        field x 0
        field label "origin"
      end

      point-new
      dup point-x print
      dup point-label print
      10 point-set-x
      "moved" point-set-label
      dup point-x print
      point-label print
    `),
    [0, "origin", 10, "moved"],
  );
});

test("dup copies a record reference, so setters are visible through aliases", () => {
  assert.deepEqual(
    outputOf(`
      record point
        field x 0
      end

      point-new
      dup
      10 point-set-x drop
      point-x print
    `),
    [10],
  );
});

test("generated copy words copy field slots into a fresh record object", () => {
  assert.deepEqual(
    outputOf(`
      record point
        field x 0
      end

      point-new
      dup point-copy
      10 point-set-x drop
      point-x print
    `),
    [0],
  );
});

test("show summarizes records by shape name", () => {
  assert.deepEqual(
    outputOf(`
      record point
        field x 0
      end

      point-new show print
    `),
    ["<record:point>"],
  );
});

test("record accessors validate the record shape at runtime", () => {
  assert.throws(
    () =>
      outputOf(`
        record point
          field x 0
        end

        record line
          field x 0
        end

        point-new line-x print
      `),
    /RECORD_GET_FIELD expected record line, got record point/,
  );
});

test("record declarations reject malformed field definitions", () => {
  assert.throws(
    () =>
      outputOf(`
        record point
          field x array-new
        end
      `),
    /field default must be an integer or string literal/,
  );
});

test("record declarations reject generated word name collisions", () => {
  assert.throws(
    () =>
      outputOf(`
        record point
          field new 0
        end
      `),
    /word already defined: point-new/,
  );
});

test("record declarations are only supported at top level", () => {
  assert.throws(
    () =>
      outputOf(`
        : bad
          record point
            field x 0
          end
        ;
      `),
    /record declarations are only supported at top level/,
  );
});

test("Borth compiler emits generated record word bytecode", () => {
  assert.deepEqual(
    outputOf(`
      import "lib/lexer.borth"
      import "lib/parser.borth"
      import "lib/compiler.borth"

      1 SKIP_PRELUDE !

      : test-compile-src
        "<test>" swap over swap lexer-lex-src-file-with-spans
        swap parse-tokens swap
        compile-nodes
      ;

      "record point field x 0 end point-new 10 point-set-x point-x"
        test-compile-src show print
    `),
    [
      '[["JUMP" 7] ["PUSH" "point"] ["ARRAY_NEW"] ["PUSH" 0] ["ARRAY_PUSH"] ["RECORD_NEW"] ["RET"] ["JUMP" 11] ["PUSH" "point"] ["RECORD_COPY"] ["RET"] ["CALL" 1] ["PUSH" 10] ["RECORD_SET_FIELD" "point" "x" 0] ["RECORD_GET_FIELD" "point" "x" 0] ["HALT"]]',
    ],
  );
});

test("Borth compiler rejects duplicate record fields", () => {
  assert.throws(
    () =>
      outputOf(`
        import "lib/lexer.borth"
        import "lib/parser.borth"
        import "lib/compiler.borth"

        1 SKIP_PRELUDE !

        : test-compile-src
          "<test>" swap over swap lexer-lex-src-file-with-spans
          swap parse-tokens swap
          compile-nodes
        ;

        "record point field x 0 field x 1 end" test-compile-src
      `),
    /duplicate field in record point: x/,
  );
});

test("Borth compiler rejects generated record word collisions", () => {
  assert.throws(
    () =>
      outputOf(`
        import "lib/lexer.borth"
        import "lib/parser.borth"
        import "lib/compiler.borth"

        1 SKIP_PRELUDE !

        : test-compile-src
          "<test>" swap over swap lexer-lex-src-file-with-spans
          swap parse-tokens swap
          compile-nodes
        ;

        "record point field new 0 end" test-compile-src
      `),
    /word already defined: point-new/,
  );
});

test("Borth VM executes record bytecode compiled by the Borth compiler", () => {
  assert.deepEqual(
    outputOf(`
      import "lib/lexer.borth"
      import "lib/parser.borth"
      import "lib/compiler.borth"
      import "lib/vm.borth"

      : test-compile-src
        "<test>" swap over swap lexer-lex-src-file-with-spans
        swap parse-tokens swap
        compile-nodes
      ;

      "record point field x 0 end point-new dup 10 point-set-x drop point-x print"
        test-compile-src run-bytecode show print
    `),
    [10, "[]"],
  );
});

test("C emitter writes and runs compiler-generated native records", (t) => {
  const root = mkdtempSync(join(tmpdir(), "borth-records-"));
  const sourcePath = join(root, "program.c");
  const executablePath = join(root, "program");

  try {
    run(
      `
        import "lib/lexer.borth"
        import "lib/parser.borth"
        import "lib/compiler.borth"
        import "lib/c-emitter.borth"

        1 SKIP_PRELUDE !

        : test-compile-src
          "<test>" swap over swap lexer-lex-src-file-with-spans
          swap parse-tokens swap
          compile-nodes
        ;

        "record point field x 0 end point-new dup 10 point-set-x drop point-x print"
          test-compile-src
        ${JSON.stringify(sourcePath)} write-c-program
      `,
      { write: () => undefined },
    );

    const generated = readFileSync(sourcePath, "utf8");
    assert.match(generated, /borth_op_record_new\(rt\);/);
    assert.match(generated, /borth_op_record_set_field\(rt, "point", "x", 0\);/);
    assert.match(generated, /borth_op_record_get_field\(rt, "point", "x", 0\);/);

    if (!compileNativeProgram(t, sourcePath, executablePath)) {
      return;
    }

    const runProgram = spawnSync(executablePath, [], { encoding: "utf8" });

    assert.equal(runProgram.status, 0, runProgram.stderr);
    assert.equal(runProgram.stdout, "10\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
