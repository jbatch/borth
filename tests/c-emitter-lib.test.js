import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { run } from "../dist/runner.js";

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

test("C emitter rejects non-integer push values for now", () => {
  assert.throws(
    () =>
      run(
        `
          import "lib/c-emitter.borth"

          array-new
            array-new "PUSH" array-push "hello" array-push array-push
            array-new "HALT" array-push array-push
          "program.c" write-c-program
        `,
        {
          writeTextFile: () => undefined,
          appendTextFile: () => undefined,
          write: () => undefined,
        },
      ),
    /C emitter only supports integer PUSH for now/,
  );
});
