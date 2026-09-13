import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { run } from "../dist/runner.js";
import { execute } from "../dist/vm.js";

test("exit stops execution and records the exit code", () => {
  const output = [];

  const state = run('7 exit "after" print', {
    write: (value) => output.push(value),
  });

  assert.equal(state.exitCode, 7);
  assert.deepEqual(output, []);
});

test("exit requires a value on the stack", () => {
  assert.throws(() => run("exit"), /EXIT requires a value on the stack/);
});

test("exit requires an integer code", () => {
  assert.throws(() => run('"nope" exit'), /EXIT requires numbers on the stack/);
  assert.throws(
    () =>
      execute([
        { op: "PUSH", value: 1.5 },
        { op: "EXIT" },
      ]),
    /EXIT requires an integer exit code/,
  );
});

test("CLI uses the Borth exit code", () => {
  const result = spawnSync("node", ["dist/main.js", "7 exit"], {
    encoding: "utf8",
  });

  assert.equal(result.status, 7);
  assert.equal(result.stderr, "");
});
