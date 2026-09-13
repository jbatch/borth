import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { run } from "../dist/runner.js";

function compileNativeProgram(t, sourcePath, executablePath) {
  const ccCheck = spawnSync("cc", ["--version"], { encoding: "utf8" });

  if (ccCheck.error || ccCheck.status !== 0) {
    t.skip("cc is not available");
    return false;
  }

  const compile = spawnSync(
    "cc",
    [sourcePath, "runtime/borth_runtime.c", "-Iruntime", "-o", executablePath],
    { encoding: "utf8" },
  );

  assert.equal(compile.status, 0, compile.stderr);
  return true;
}

test("C emitter writes and runs a tiny native integer program", (t) => {
  const root = mkdtempSync(join(tmpdir(), "borth-c-emitter-"));
  const sourcePath = join(root, "program.c");
  const executablePath = join(root, "program");

  try {
    run(
      `
        import "lib/c-emitter.borth"

        array-new
          array-new "PUSH" array-push 10 array-push array-push
          array-new "PUSH" array-push 20 array-push array-push
          array-new "ADD" array-push array-push
          array-new "PRINT" array-push array-push
          array-new "HALT" array-push array-push
        ${JSON.stringify(sourcePath)} write-c-program
      `,
      { write: () => undefined },
    );

    const generated = readFileSync(sourcePath, "utf8");
    assert.match(generated, /#include "borth_runtime\.h"/);
    assert.match(generated, /borth_op_push_int\(rt, 10\);/);
    assert.match(generated, /borth_op_push_int\(rt, 20\);/);
    assert.match(generated, /borth_op_add\(rt\);/);
    assert.match(generated, /borth_op_print\(rt\);/);

    const ccCheck = spawnSync("cc", ["--version"], { encoding: "utf8" });

    if (ccCheck.error || ccCheck.status !== 0) {
      t.skip("cc is not available");
      return;
    }

    const compile = spawnSync(
      "cc",
      [
        sourcePath,
        "runtime/borth_runtime.c",
        "-Iruntime",
        "-o",
        executablePath,
      ],
      { encoding: "utf8" },
    );

    assert.equal(compile.status, 0, compile.stderr);

    const runProgram = spawnSync(executablePath, [], { encoding: "utf8" });

    assert.equal(runProgram.status, 0, runProgram.stderr);
    assert.equal(runProgram.stdout, "30\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("C emitter writes and runs native jumps", (t) => {
  const root = mkdtempSync(join(tmpdir(), "borth-c-emitter-"));
  const sourcePath = join(root, "program.c");
  const executablePath = join(root, "program");

  try {
    run(
      `
        import "lib/c-emitter.borth"

        array-new
          array-new "PUSH" array-push 0 array-push array-push
          array-new "JUMP_IF_FALSE" array-push 5 array-push array-push
          array-new "PUSH" array-push "bad" array-push array-push
          array-new "PRINT" array-push array-push
          array-new "JUMP" array-push 7 array-push array-push
          array-new "PUSH" array-push "else" array-push array-push
          array-new "PRINT" array-push array-push
          array-new "PUSH" array-push 3 array-push array-push
          array-new "DUP" array-push array-push
          array-new "PUSH" array-push 0 array-push array-push
          array-new "GT" array-push array-push
          array-new "JUMP_IF_FALSE" array-push 17 array-push array-push
          array-new "DUP" array-push array-push
          array-new "PRINT" array-push array-push
          array-new "PUSH" array-push 1 array-push array-push
          array-new "SUB" array-push array-push
          array-new "JUMP" array-push 8 array-push array-push
          array-new "DROP" array-push array-push
          array-new "HALT" array-push array-push
        ${JSON.stringify(sourcePath)} write-c-program
      `,
      { write: () => undefined },
    );

    const generated = readFileSync(sourcePath, "utf8");
    assert.match(generated, /borth_ip_0:/);
    assert.match(generated, /goto borth_ip_7;/);
    assert.match(
      generated,
      /if \(!borth_op_pop_condition\(rt\)\) \{ goto borth_ip_17; \}/,
    );

    if (!compileNativeProgram(t, sourcePath, executablePath)) {
      return;
    }

    const runProgram = spawnSync(executablePath, [], { encoding: "utf8" });

    assert.equal(runProgram.status, 0, runProgram.stderr);
    assert.equal(runProgram.stdout, "else\n3\n2\n1\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("C emitter writes and runs compiler-generated native control flow", (t) => {
  const root = mkdtempSync(join(tmpdir(), "borth-c-emitter-"));
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

        "0 if \\"bad\\" print else \\"else\\" print end 3 loop dup 0 > while dup print 1 - repeat drop"
          test-compile-src
        ${JSON.stringify(sourcePath)} write-c-program
      `,
      { write: () => undefined },
    );

    const generated = readFileSync(sourcePath, "utf8");
    assert.match(generated, /borth_ip_0:/);
    assert.match(generated, /goto borth_ip_/);
    assert.match(generated, /borth_op_pop_condition\(rt\)/);

    if (!compileNativeProgram(t, sourcePath, executablePath)) {
      return;
    }

    const runProgram = spawnSync(executablePath, [], { encoding: "utf8" });

    assert.equal(runProgram.status, 0, runProgram.stderr);
    assert.equal(runProgram.stdout, "else\n3\n2\n1\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("C emitter writes and runs native host operations", (t) => {
  const root = mkdtempSync(join(tmpdir(), "borth-c-emitter-"));
  const sourcePath = join(root, "program.c");
  const executablePath = join(root, "program");
  const textPath = join(root, "notes.txt");
  const missingPath = join(root, "missing.txt");

  try {
    run(
      `
        import "lib/c-emitter.borth"

        array-new
          array-new "PUSH" array-push ${JSON.stringify(textPath)} array-push array-push
          array-new "PUSH" array-push "hello" array-push array-push
          array-new "WRITE_TEXT_FILE" array-push array-push
          array-new "PUSH" array-push ${JSON.stringify(textPath)} array-push array-push
          array-new "PUSH" array-push " world" array-push array-push
          array-new "APPEND_TEXT_FILE" array-push array-push
          array-new "PUSH" array-push ${JSON.stringify(textPath)} array-push array-push
          array-new "READ_TEXT_FILE" array-push array-push
          array-new "PRINT" array-push array-push
          array-new "PUSH" array-push ${JSON.stringify(textPath)} array-push array-push
          array-new "FILE_EXISTS" array-push array-push
          array-new "PRINT" array-push array-push
          array-new "PUSH" array-push ${JSON.stringify(missingPath)} array-push array-push
          array-new "FILE_EXISTS" array-push array-push
          array-new "PRINT" array-push array-push
          array-new "PUSH" array-push "BORTH_C_EMITTER_TEST" array-push array-push
          array-new "ENV" array-push array-push
          array-new "PRINT_STACK" array-push array-push
          array-new "DROP" array-push array-push
          array-new "DROP" array-push array-push
          array-new "ARGS" array-push array-push
          array-new "SHOW" array-push array-push
          array-new "PRINT" array-push array-push
          array-new "CWD" array-push array-push
          array-new "PRINT" array-push array-push
          array-new "PUSH" array-push "/tmp/a/b.txt" array-push array-push
          array-new "PATH_DIRNAME" array-push array-push
          array-new "PRINT" array-push array-push
          array-new "PUSH" array-push "/tmp/a" array-push array-push
          array-new "PUSH" array-push "../lib/parser.borth" array-push array-push
          array-new "PATH_RESOLVE" array-push array-push
          array-new "PRINT" array-push array-push
          array-new "PUSH" array-push "/bin/echo" array-push array-push
          array-new "ARRAY_NEW" array-push array-push
          array-new "PUSH" array-push "hi" array-push array-push
          array-new "ARRAY_PUSH" array-push array-push
          array-new "RUN_COMMAND" array-push array-push
          array-new "SHOW" array-push array-push
          array-new "PRINT" array-push array-push
          array-new "SHOW" array-push array-push
          array-new "PRINT" array-push array-push
          array-new "PRINT" array-push array-push
          array-new "HALT" array-push array-push
        ${JSON.stringify(sourcePath)} write-c-program
      `,
      { write: () => undefined },
    );

    const generated = readFileSync(sourcePath, "utf8");
    assert.match(generated, /borth_runtime_new_with_args\(argc - 1, argv \+ 1\);/);
    assert.match(generated, /borth_op_run_command\(rt\);/);

    if (!compileNativeProgram(t, sourcePath, executablePath)) {
      return;
    }

    const runProgram = spawnSync(executablePath, ["one", "two"], {
      encoding: "utf8",
      env: { ...process.env, BORTH_C_EMITTER_TEST: "abc" },
    });

    assert.equal(runProgram.status, 0, runProgram.stderr);
    assert.equal(
      runProgram.stdout,
      [
        "hello world",
        "1",
        "0",
        '["abc" 1]',
        '["one" "two"]',
        process.cwd(),
        "/tmp/a",
        "/tmp/lib/parser.borth",
        '""',
        '"hi\\n"',
        "0",
        "",
      ].join("\n"),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("C emitter writes and runs native input and random operations", (t) => {
  const root = mkdtempSync(join(tmpdir(), "borth-c-emitter-"));
  const sourcePath = join(root, "program.c");
  const executablePath = join(root, "program");

  try {
    run(
      `
        import "lib/c-emitter.borth"

        array-new
          array-new "READ_LINE" array-push array-push
          array-new "PRINT" array-push array-push
          array-new "READ_INT" array-push array-push
          array-new "PRINT" array-push array-push
          array-new "PUSH" array-push 10 array-push array-push
          array-new "RANDOM" array-push array-push
          array-new "PRINT" array-push array-push
          array-new "HALT" array-push array-push
        ${JSON.stringify(sourcePath)} write-c-program
      `,
      { write: () => undefined },
    );

    if (!compileNativeProgram(t, sourcePath, executablePath)) {
      return;
    }

    const runProgram = spawnSync(executablePath, [], {
      encoding: "utf8",
      input: "hello\n42\n",
    });
    const output = runProgram.stdout.trimEnd().split("\n");

    assert.equal(runProgram.status, 0, runProgram.stderr);
    assert.deepEqual(output.slice(0, 2), ["hello", "42"]);

    const randomValue = Number.parseInt(output[2], 10);
    assert.ok(Number.isInteger(randomValue));
    assert.ok(randomValue >= 0);
    assert.ok(randomValue < 10);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("C emitter writes native panic and exit operations", (t) => {
  const root = mkdtempSync(join(tmpdir(), "borth-c-emitter-"));
  const panicSourcePath = join(root, "panic.c");
  const panicExecutablePath = join(root, "panic");
  const exitSourcePath = join(root, "exit.c");
  const exitExecutablePath = join(root, "exit");

  try {
    run(
      `
        import "lib/c-emitter.borth"

        array-new
          array-new "PUSH" array-push "boom" array-push array-push
          array-new "PANIC" array-push array-push
          array-new "HALT" array-push array-push
        ${JSON.stringify(panicSourcePath)} write-c-program
      `,
      { write: () => undefined },
    );

    run(
      `
        import "lib/c-emitter.borth"

        array-new
          array-new "PUSH" array-push 7 array-push array-push
          array-new "EXIT" array-push array-push
          array-new "HALT" array-push array-push
        ${JSON.stringify(exitSourcePath)} write-c-program
      `,
      { write: () => undefined },
    );

    if (
      !compileNativeProgram(t, panicSourcePath, panicExecutablePath) ||
      !compileNativeProgram(t, exitSourcePath, exitExecutablePath)
    ) {
      return;
    }

    const panicRun = spawnSync(panicExecutablePath, [], { encoding: "utf8" });
    assert.notEqual(panicRun.status, 0);
    assert.match(panicRun.stderr, /runtime error: boom/);

    const exitRun = spawnSync(exitExecutablePath, [], { encoding: "utf8" });
    assert.equal(exitRun.status, 7);
    assert.equal(exitRun.stdout, "");
    assert.equal(exitRun.stderr, "");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("C emitter writes and runs native strings and arrays", (t) => {
  const root = mkdtempSync(join(tmpdir(), "borth-c-emitter-"));
  const sourcePath = join(root, "program.c");
  const executablePath = join(root, "program");

  try {
    run(
      `
        import "lib/c-emitter.borth"

        array-new
          array-new "PUSH" array-push "hello, " array-push array-push
          array-new "PUSH" array-push "native" array-push array-push
          array-new "STR_CAT" array-push array-push
          array-new "PRINT" array-push array-push
          array-new "PUSH" array-push "abc" array-push array-push
          array-new "STR_LEN" array-push array-push
          array-new "PRINT" array-push array-push
          array-new "PUSH" array-push "hello" array-push array-push
          array-new "PUSH" array-push 1 array-push array-push
          array-new "PUSH" array-push 3 array-push array-push
          array-new "STR_SLICE" array-push array-push
          array-new "PRINT" array-push array-push
          array-new "PUSH" array-push "one two two" array-push array-push
          array-new "PUSH" array-push "two" array-push array-push
          array-new "PUSH" array-push 5 array-push array-push
          array-new "STR_INDEX_OF" array-push array-push
          array-new "PRINT" array-push array-push
          array-new "ARRAY_NEW" array-push array-push
          array-new "PUSH" array-push "x" array-push array-push
          array-new "ARRAY_PUSH" array-push array-push
          array-new "PUSH" array-push 123 array-push array-push
          array-new "ARRAY_PUSH" array-push array-push
          array-new "SHOW" array-push array-push
          array-new "PRINT" array-push array-push
          array-new "ARRAY_NEW" array-push array-push
          array-new "PUSH" array-push "a" array-push array-push
          array-new "ARRAY_PUSH" array-push array-push
          array-new "PUSH" array-push "b" array-push array-push
          array-new "ARRAY_PUSH" array-push array-push
          array-new "PUSH" array-push 1 array-push array-push
          array-new "ARRAY_GET" array-push array-push
          array-new "PRINT" array-push array-push
          array-new "HALT" array-push array-push
        ${JSON.stringify(sourcePath)} write-c-program
      `,
      { write: () => undefined },
    );

    const generated = readFileSync(sourcePath, "utf8");
    assert.match(generated, /borth_op_push_string\(rt, "hello, "\);/);
    assert.match(generated, /borth_op_str_cat\(rt\);/);
    assert.match(generated, /borth_op_array_push\(rt\);/);

    const ccCheck = spawnSync("cc", ["--version"], { encoding: "utf8" });

    if (ccCheck.error || ccCheck.status !== 0) {
      t.skip("cc is not available");
      return;
    }

    const compile = spawnSync(
      "cc",
      [
        sourcePath,
        "runtime/borth_runtime.c",
        "-Iruntime",
        "-o",
        executablePath,
      ],
      { encoding: "utf8" },
    );

    assert.equal(compile.status, 0, compile.stderr);

    const runProgram = spawnSync(executablePath, [], { encoding: "utf8" });

    assert.equal(runProgram.status, 0, runProgram.stderr);
    assert.equal(runProgram.stdout, 'hello, native\n3\nell\n8\n["x" 123]\nb\n');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("C emitter writes and runs native stack operations", (t) => {
  const root = mkdtempSync(join(tmpdir(), "borth-c-emitter-"));
  const sourcePath = join(root, "program.c");
  const executablePath = join(root, "program");

  try {
    run(
      `
        import "lib/c-emitter.borth"

        array-new
          array-new "PUSH" array-push 1 array-push array-push
          array-new "PUSH" array-push "x" array-push array-push
          array-new "DUP" array-push array-push
          array-new "PRINT_STACK" array-push array-push
          array-new "DROP" array-push array-push
          array-new "PUSH" array-push 2 array-push array-push
          array-new "SWAP" array-push array-push
          array-new "PRINT_STACK" array-push array-push
          array-new "OVER" array-push array-push
          array-new "PRINT_STACK" array-push array-push
          array-new "ROT" array-push array-push
          array-new "PRINT_STACK" array-push array-push
          array-new "PUSH" array-push 2 array-push array-push
          array-new "ROLL" array-push array-push
          array-new "PRINT_STACK" array-push array-push
          array-new "PUSH" array-push 2 array-push array-push
          array-new "ROLL_REVERSE" array-push array-push
          array-new "PRINT_STACK" array-push array-push
          array-new "HALT" array-push array-push
        ${JSON.stringify(sourcePath)} write-c-program
      `,
      { write: () => undefined },
    );

    const generated = readFileSync(sourcePath, "utf8");
    assert.match(generated, /borth_op_dup\(rt\);/);
    assert.match(generated, /borth_op_print_stack\(rt\);/);
    assert.match(generated, /borth_op_roll_reverse\(rt\);/);

    const ccCheck = spawnSync("cc", ["--version"], { encoding: "utf8" });

    if (ccCheck.error || ccCheck.status !== 0) {
      t.skip("cc is not available");
      return;
    }

    const compile = spawnSync(
      "cc",
      [
        sourcePath,
        "runtime/borth_runtime.c",
        "-Iruntime",
        "-o",
        executablePath,
      ],
      { encoding: "utf8" },
    );

    assert.equal(compile.status, 0, compile.stderr);

    const runProgram = spawnSync(executablePath, [], { encoding: "utf8" });

    assert.equal(runProgram.status, 0, runProgram.stderr);
    assert.equal(
      runProgram.stdout,
      '[1 "x" "x"]\n[1 2 "x"]\n[1 2 "x" 2]\n[1 "x" 2 2]\n[1 2 2 "x"]\n[1 "x" 2 2]\n',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("C emitter rejects unsupported push values for now", () => {
  assert.throws(
    () =>
      run(
        `
          import "lib/c-emitter.borth"

          array-new
            array-new "PUSH" array-push array-new array-push array-push
            array-new "HALT" array-push array-push
          "program.c" write-c-program
        `,
        {
          writeTextFile: () => undefined,
          appendTextFile: () => undefined,
          write: () => undefined,
        },
      ),
    /C emitter only supports integer and string PUSH for now/,
  );
});
